<script setup>
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch } from "vue";
import {
  ConflictError,
  deleteArchLayout,
  fetchArchProject,
  saveArchFiles,
  saveArchLayout,
  setArchStage,
  STAGE_COLORS,
  stageTitle,
} from "@/components/archApi.js";
import { applyTextEdits, buildModel, editFromDiagram, locateInSource } from "./likec4/client.js";
import { adrPath, docTitle, fileKind, richText } from "./archModel.js";
import ArchOverview from "./ArchOverview.vue";
import ArchDiagrams from "./ArchDiagrams.vue";
import ArchDocs from "./ArchDocs.vue";
import ArchEditor from "./ArchEditor.vue";
import ArchTasks from "./ArchTasks.vue";
import ArchHistory from "./ArchHistory.vue";
import ArchProjectModal from "./ArchProjectModal.vue";

// Открытый проект. Здесь живёт всё общее для вкладок: тексты файлов,
// разобранная модель, сохранение и переходы «открой элемент / диаграмму /
// файл» — вкладки получают это через provide("arch").
const props = defineProps({
  projectId: { type: String, required: true },
  tab: { type: String, default: "" },
  templates: { type: Object, default: null },
});
const emit = defineEmits(["tab", "renamed", "removed"]);

const TABS = [
  { code: "overview", title: "Обзор" },
  { code: "diagrams", title: "Диаграммы" },
  { code: "docs", title: "Документы" },
  { code: "editor", title: "Редактор" },
  { code: "tasks", title: "Задачи" },
  { code: "history", title: "История" },
];
const activeTab = computed(() => (TABS.some((t) => t.code === props.tab) ? props.tab : "overview"));

const project = ref(null);
const loadError = ref("");
const saveError = ref("");

// files — то, что сейчас в редакторе; saved — что лежит на сервере.
const files = reactive({});
const saved = reactive({});
const fileVersion = ref(0);
const layouts = shallowRef({});

const dump = shallowRef(null);
const errors = ref([]);
const layoutError = ref("");
const building = ref(false);
// Номер правки модели и номер правки, по которой построена текущая модель:
// результат проверки отправляется на сервер, только когда они совпадают.
let changeStamp = 0;
let builtStamp = -1;

const saving = ref(false);
const conflicts = ref([]);
const projectModal = ref(false);

// Куда смотрят вкладки: выбранная диаграмма, элемент, файл и строка;
// anchor — к чему привязать дело, если во «Задачи» пришли из карточки элемента.
const selection = reactive({ view: "", element: "", file: "", line: 0, lineSeq: 0, anchor: "" });

const paths = computed(() => {
  void fileVersion.value;
  return Object.keys(files).sort((a, b) => a.localeCompare(b));
});
const dirtyPaths = computed(() => {
  void fileVersion.value;
  return paths.value.filter((p) => !saved[p] || saved[p].content !== files[p]);
});
const modelErrors = computed(() => errors.value);

function storeFiles(list) {
  for (const f of list) {
    files[f.path] = f.content;
    saved[f.path] = { content: f.content, version: f.version };
  }
}

async function load() {
  loadError.value = "";
  try {
    const full = await fetchArchProject(props.projectId);
    for (const k of Object.keys(files)) delete files[k];
    for (const k of Object.keys(saved)) delete saved[k];
    storeFiles(full.files);
    const map = {};
    for (const l of full.layouts) map[l.viewId] = l.snapshot;
    layouts.value = map;
    const { files: _files, layouts: _layouts, ...rest } = full;
    project.value = rest;
    fileVersion.value++;
    changeStamp++;
    await rebuild();
  } catch (err) {
    loadError.value = err.message || String(err);
  }
}

// pullRemote подтягивает правки, сделанные в другом месте (Claude через MCP,
// вторая вкладка). Файлы с несохранённым у нас не трогаем — их разрулит
// баннер конфликта при сохранении.
let pulling = false;
async function pullRemote() {
  if (pulling || saving.value || !project.value || document.hidden) return;
  pulling = true;
  try {
    const full = await fetchArchProject(props.projectId);
    const clean = (p) => saved[p] && files[p] === saved[p].content;
    let changed = false;
    const onServer = new Set();
    for (const f of full.files) {
      onServer.add(f.path);
      if (files[f.path] === undefined || (clean(f.path) && f.version > saved[f.path].version)) {
        files[f.path] = f.content;
        saved[f.path] = { content: f.content, version: f.version };
        changed = true;
      }
    }
    for (const p of Object.keys(files)) {
      if (!onServer.has(p) && clean(p)) {
        delete files[p];
        delete saved[p];
        changed = true;
      }
    }
    const { files: _files, layouts: _layouts, ...rest } = full;
    project.value = rest;
    if (changed) {
      fileVersion.value++;
      changeStamp++;
      scheduleBuild();
    }
  } catch {
    // сеть моргнула — попробуем в следующий раз
  } finally {
    pulling = false;
  }
}

const PULL_EVERY_MS = 30000;
let pullTimer = null;
function onVisible() {
  if (!document.hidden) pullRemote();
}

// Только метаданные: стадия, связи, итог проверки. Тексты файлов не трогаем —
// в редакторе может быть несохранённое.
async function refreshMeta() {
  const full = await fetchArchProject(props.projectId);
  const { files: _files, layouts: _layouts, ...rest } = full;
  project.value = rest;
}

function modelSources() {
  const out = {};
  for (const p of Object.keys(files)) if (fileKind(p) === "c4") out[p] = files[p];
  return out;
}

async function rebuild() {
  const stamp = changeStamp;
  building.value = true;
  try {
    const res = await buildModel(modelSources());
    if (!res) return; // пока разбирали, пришла новая правка
    errors.value = res.errors;
    layoutError.value = res.layoutError || "";
    if (res.model) dump.value = res.model;
    else if (!res.errors.length) dump.value = null;
    builtStamp = stamp;
  } catch (err) {
    layoutError.value = err.message || String(err);
  } finally {
    building.value = false;
  }
}

let buildTimer = null;
let saveTimer = null;

function scheduleBuild() {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(rebuild, 350);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), 1500);
}

function updateFile(path, content) {
  if (files[path] === content) return;
  files[path] = content;
  fileVersion.value++;
  if (fileKind(path) === "c4") {
    changeStamp++;
    scheduleBuild();
  }
  scheduleSave();
}

function checkPayload() {
  if (builtStamp !== changeStamp) return undefined;
  return { status: errors.value.length ? "errors" : "ok", errors: errors.value.map(({ path, line, message }) => ({ path, line, message })) };
}

async function save({ force = false, message = "" } = {}) {
  clearTimeout(saveTimer);
  if (saving.value) {
    scheduleSave();
    return;
  }
  const dirty = dirtyPaths.value;
  if (!dirty.length) return;
  // Модель ещё разбирается — подождём результат, чтобы отправить и его.
  if (building.value || builtStamp !== changeStamp) {
    await rebuild();
  }
  saving.value = true;
  saveError.value = "";
  const snapshot = {};
  for (const p of dirty) snapshot[p] = files[p];
  try {
    const res = await saveArchFiles(props.projectId, {
      files: dirty.map((p) => ({ path: p, content: snapshot[p], baseVersion: saved[p]?.version || 0 })),
      message,
      check: checkPayload(),
      force,
    });
    for (const f of res.files) saved[f.path] = { content: snapshot[f.path] ?? f.content, version: f.version };
    fileVersion.value++;
    conflicts.value = [];
    refreshMeta().catch(() => {});
  } catch (err) {
    if (err instanceof ConflictError) conflicts.value = err.conflicts;
    else saveError.value = err.message || String(err);
  } finally {
    saving.value = false;
  }
  // Пока сохраняли, могли напечатать ещё.
  if (dirtyPaths.value.length && !conflicts.value.length && !saveError.value) scheduleSave();
}

// Немедленная операция над файлом (создать, удалить, переименовать):
// уходит на сервер сразу, а не ждёт автосохранения.
async function fileOp(body) {
  saveError.value = "";
  try {
    const res = await saveArchFiles(props.projectId, { ...body, check: undefined });
    for (const f of res.files) {
      files[f.path] = f.content;
      saved[f.path] = { content: f.content, version: f.version };
    }
    for (const d of body.delete || []) {
      delete files[d.path];
      delete saved[d.path];
    }
    for (const r of body.rename || []) {
      files[r.to] = files[r.from];
      saved[r.to] = { content: saved[r.from]?.content ?? files[r.from], version: (saved[r.from]?.version || 0) + 1 };
      delete files[r.from];
      delete saved[r.from];
    }
    fileVersion.value++;
    changeStamp++;
    scheduleBuild();
    refreshMeta().catch(() => {});
    return true;
  } catch (err) {
    if (err instanceof ConflictError) conflicts.value = err.conflicts;
    else saveError.value = err.message || String(err);
    return false;
  }
}

const createFile = (path, content = "") => fileOp({ files: [{ path, content, baseVersion: 0 }], message: "новый файл" });
const deleteFile = (path) => fileOp({ delete: [{ path, baseVersion: saved[path]?.version || 0 }], message: "удалён файл" });
async function renameFile(from, to) {
  if (dirtyPaths.value.includes(from)) await save();
  return fileOp({ rename: [{ from, to }], message: "переименован файл" });
}

function takeServer(conflict) {
  files[conflict.path] = conflict.serverContent;
  saved[conflict.path] = { content: conflict.serverContent, version: conflict.serverVersion };
  conflicts.value = conflicts.value.filter((c) => c.path !== conflict.path);
  fileVersion.value++;
  changeStamp++;
  scheduleBuild();
}

// --- Правки с диаграммы ---

async function applyDiagramChange({ viewId, change, done }) {
  try {
    if (change.op === "save-view-snapshot") {
      await saveArchLayout(props.projectId, viewId, change.layout);
      layouts.value = { ...layouts.value, [viewId]: change.layout };
    } else if (change.op === "reset-manual-layout") {
      await deleteArchLayout(props.projectId, viewId);
      const next = { ...layouts.value };
      delete next[viewId];
      layouts.value = next;
    } else if (change.op === "change-element-style" || change.op === "change-autolayout") {
      const edit = await editFromDiagram(viewId, change);
      if (edit && files[edit.path] !== undefined) {
        updateFile(edit.path, applyTextEdits(files[edit.path], edit.edits));
      }
    } else {
      saveError.value = "Эту правку с диаграммы пока нельзя сохранить — поправьте текст в редакторе.";
    }
  } catch (err) {
    saveError.value = err.message || String(err);
  } finally {
    done?.();
  }
}

// --- Переходы ---

function go(tab) {
  if (tab !== activeTab.value) emit("tab", tab);
}

function openView(viewId) {
  selection.view = viewId;
  go("diagrams");
}

function openElement(fqn) {
  selection.element = fqn;
  const views = dump.value?.views || {};
  const current = views[selection.view];
  const inCurrent = current?.nodes?.some((n) => n.modelRef === fqn);
  if (!inCurrent) {
    // Лучше всего — диаграмма «о самом элементе» или его родителе.
    const candidates = Object.values(views).filter((v) => v.nodes?.some((n) => n.modelRef === fqn));
    const best =
      candidates.find((v) => v.viewOf === fqn) ||
      candidates.find((v) => v._type === "element") ||
      candidates[0];
    if (best) selection.view = best.id;
  }
  go("diagrams");
}

function openFile(path, { line = 0, edit = false } = {}) {
  selection.file = path;
  selection.line = line;
  selection.lineSeq++;
  const kind = fileKind(path);
  go(edit || kind === "c4" || line ? "editor" : "docs");
}

async function openSource(params) {
  try {
    const loc = await locateInSource(params);
    if (loc?.path) {
      openFile(loc.path, { line: loc.range.start.line + 1, edit: true });
      return;
    }
  } catch {
    // ниже — запасной путь по sourcePath диаграммы
  }
  if (params.view && dump.value?.views?.[params.view]?.sourcePath) {
    openFile(dump.value.views[params.view].sourcePath, { edit: true });
  }
}

function openRef(ref) {
  if (ref.kind === "view") openView(ref.target);
  else if (ref.kind === "file") openFile(ref.target);
  else if (ref.kind === "adr") {
    const p = adrPath(Object.keys(files), ref.target);
    if (p) openFile(p);
  } else openElement(ref.target);
}

function resolveRef(ref) {
  const d = dump.value;
  if (ref.kind === "adr") {
    const p = adrPath(Object.keys(files), ref.target);
    return { exists: !!p, label: p ? `ADR-${ref.target} ${docTitle(p, files[p])}` : `ADR-${ref.target}`, hint: p || "" };
  }
  if (ref.kind === "view") {
    const v = d?.views?.[ref.target];
    return { exists: !!v, label: v?.title || ref.target, hint: v ? "диаграмма" : "" };
  }
  if (ref.kind === "file") {
    const exists = files[ref.target] !== undefined;
    return {
      exists,
      label: exists && fileKind(ref.target) === "md" ? docTitle(ref.target, files[ref.target]) : ref.target,
      hint: ref.target,
    };
  }
  const e = d?.elements?.[ref.target];
  return {
    exists: !!e || !d,
    label: e?.title || ref.target,
    hint: e ? [e.kind, e.technology, richText(e.description)].filter(Boolean).join(" · ") : ref.target,
  };
}

const arch = {
  projectId: computed(() => props.projectId),
  project,
  files,
  saved,
  fileVersion,
  paths,
  dirtyPaths,
  dump,
  errors: modelErrors,
  layouts,
  building,
  selection,
  templates: computed(() => props.templates),
  updateFile,
  createFile,
  deleteFile,
  renameFile,
  save,
  reload: load,
  refreshMeta,
  applyDiagramChange,
  openView,
  openElement,
  openFile,
  openSource,
  openRef,
  resolveRef,
  go,
};
provide("arch", arch);

// --- Стадия ---

const stages = computed(() => props.templates?.stages || Object.keys(STAGE_COLORS));
const flowStages = computed(() => stages.value.filter((s) => s !== "frozen"));
const stageIndex = computed(() => flowStages.value.indexOf(project.value?.stage));

async function changeStage(stage) {
  if (!project.value || stage === project.value.stage) return;
  const note = window.prompt(`Стадия «${stageTitle(stage)}». Что сейчас происходит? (можно пусто)`, "");
  if (note === null) return;
  try {
    await setArchStage(props.projectId, stage, note);
    await refreshMeta();
  } catch (err) {
    saveError.value = err.message || String(err);
  }
}

// --- Жизненный цикл ---

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    save();
  }
}

function beforeUnload(e) {
  if (dirtyPaths.value.length) {
    save();
    e.preventDefault();
    e.returnValue = "";
  }
}

onMounted(() => {
  load();
  window.addEventListener("keydown", onKey);
  window.addEventListener("beforeunload", beforeUnload);
  document.addEventListener("visibilitychange", onVisible);
  pullTimer = setInterval(pullRemote, PULL_EVERY_MS);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("beforeunload", beforeUnload);
  document.removeEventListener("visibilitychange", onVisible);
  clearInterval(pullTimer);
  clearTimeout(buildTimer);
  if (dirtyPaths.value.length) save();
});

watch(
  () => props.projectId,
  () => load(),
);

const CHECK = {
  ok: { color: "#22c55e", title: "модель без ошибок" },
  errors: { color: "#ef4444", title: "в модели ошибки" },
  unchecked: { color: "#64748b", title: "не проверена" },
};
const liveCheck = computed(() => {
  if (building.value) return { color: "#38bdf8", title: "разбираю модель…" };
  if (errors.value.length) return { color: "#ef4444", title: `ошибок в модели: ${errors.value.length}` };
  if (layoutError.value) return { color: "#f59e0b", title: layoutError.value };
  return CHECK.ok;
});
const fullHeight = computed(() => ["diagrams", "editor", "docs"].includes(activeTab.value));

function onSaved(event) {
  projectModal.value = false;
  if (event?.slug && event.slug !== project.value?.slug) emit("renamed", event.slug);
  else refreshMeta();
}
</script>

<template>
  <div class="ar" :class="{ 'is-full': fullHeight }">
    <div v-if="loadError" class="ar-error">{{ loadError }}</div>

    <template v-if="project">
      <div class="ar-head">
        <div class="ar-head-emoji">{{ project.emoji || "🧩" }}</div>
        <div style="flex: 1; min-width: 220px">
          <button class="ar-back" @click="$router.push({ name: 'Arch' })">← Все проекты</button>
          <div class="ar-row" style="gap: 10px">
            <h1 class="ar-title">{{ project.title }}</h1>
            <span class="ar-mono ar-dim" style="font-size: 12px">{{ project.slug }}</span>
          </div>
          <div v-if="project.summary" class="ar-muted" style="max-width: 760px">{{ project.summary }}</div>
        </div>
        <div class="ar-row">
          <span class="ar-chip" :title="liveCheck.title">
            <span class="ar-dot" :style="{ background: liveCheck.color }" />
            {{ liveCheck.title }}
          </span>
          <span class="ar-chip" :title="dirtyPaths.join(', ')">
            <template v-if="saving">сохраняю…</template>
            <template v-else-if="dirtyPaths.length">
              <span class="ar-dot" style="background: var(--ar-warn)" /> не сохранено: {{ dirtyPaths.length }}
            </template>
            <template v-else>✓ сохранено</template>
          </span>
          <a v-if="project.repoUrl" class="ar-btn is-small" :href="project.repoUrl" target="_blank" rel="noopener">
            Репозиторий ↗
          </a>
          <button class="ar-btn is-small" @click="projectModal = true">⚙ Проект</button>
        </div>
      </div>

      <div class="ar-row" style="gap: 6px; align-items: stretch">
        <div class="ar-stages" style="flex: 1">
          <button
            v-for="(s, i) in flowStages"
            :key="s"
            class="ar-stage"
            :class="{ 'is-current': s === project.stage, 'is-passed': stageIndex >= 0 && i < stageIndex }"
            :style="{ '--ar-stage-color': STAGE_COLORS[s] }"
            :title="s === project.stage ? project.stageNote : 'Перевести на эту стадию'"
            @click="changeStage(s)"
          >
            {{ stageTitle(s) }}
          </button>
        </div>
        <button
          class="ar-btn is-small"
          :class="{ 'is-active': project.stage === 'frozen' }"
          title="Заморозить проект"
          @click="changeStage('frozen')"
        >
          ❄ {{ project.stage === "frozen" ? "Заморожен" : "Заморозить" }}
        </button>
      </div>
      <div v-if="project.stageNote" class="ar-muted" style="font-size: 13px; margin-top: -4px">
        <span :style="{ color: STAGE_COLORS[project.stage] }">●</span>
        {{ stageTitle(project.stage) }}: {{ project.stageNote }}
      </div>

      <div v-if="saveError" class="ar-error">
        {{ saveError }}
        <button class="ar-btn is-small" style="margin-left: 8px" @click="saveError = ''">ок</button>
      </div>

      <div v-if="conflicts.length" class="ar-error">
        <div style="margin-bottom: 6px">
          Пока вы правили, эти файлы поменяли в другом месте (например, Claude). Чья версия главнее?
        </div>
        <div v-for="c in conflicts" :key="c.path" class="ar-row" style="margin-bottom: 4px">
          <span class="ar-mono">{{ c.path }}</span>
          <span class="ar-muted">на сервере v{{ c.serverVersion || "удалён" }}</span>
          <button class="ar-btn is-small" @click="takeServer(c)">Взять с сервера</button>
        </div>
        <button class="ar-btn is-small is-danger" @click="save({ force: true })">Оставить мою версию всех</button>
      </div>

      <div class="ar-tabs">
        <button
          v-for="t in TABS"
          :key="t.code"
          class="ar-tab"
          :class="{ 'is-active': activeTab === t.code }"
          @click="go(t.code)"
        >
          {{ t.title }}
          <span v-if="t.code === 'editor' && errors.length" class="ar-badge is-bad">{{ errors.length }}</span>
          <span v-if="t.code === 'tasks' && project.openLinks" class="ar-badge">{{ project.openLinks }}</span>
        </button>
      </div>

      <ArchOverview v-if="activeTab === 'overview'" />
      <ArchDiagrams v-else-if="activeTab === 'diagrams'" />
      <ArchDocs v-else-if="activeTab === 'docs'" />
      <ArchEditor v-else-if="activeTab === 'editor'" />
      <ArchTasks v-else-if="activeTab === 'tasks'" />
      <ArchHistory v-else-if="activeTab === 'history'" />
    </template>

    <ArchProjectModal
      v-if="projectModal && project"
      :project="project"
      @close="projectModal = false"
      @saved="onSaved"
      @removed="emit('removed')"
    />
  </div>
</template>
