<script setup>
import { computed, inject, nextTick, ref, watch } from "vue";
import { createArchSnippet, deleteArchSnippet, fetchArchTemplates } from "@/components/archApi.js";
import { docTitle, fileKind, FILE_ICONS, groupFiles, viewList } from "./archModel.js";
import ArchCodeEditor from "./codemirror/ArchCodeEditor.vue";
import ArchDiagram from "./ArchDiagram.vue";
import ArchMarkdown from "./ArchMarkdown.vue";
import MermaidView from "./MermaidView.vue";

// Редактор проекта: любой файл, подсветка и подсказки по модели, ошибки в
// строках, палитра шаблонов и живое превью — диаграмма, документ или схема.
const arch = inject("arch");
const { files, paths, selection, dump, errors, layouts } = arch;

const editor = ref(null);
const side = ref(localStorage.getItem("archEditorSide") || "preview");
const previewView = ref("");
const snippetQuery = ref("");
const extraSnippets = ref(null);

watch(side, (v) => localStorage.setItem("archEditorSide", v));

const current = computed(() => {
  if (selection.file && files[selection.file] !== undefined) return selection.file;
  return paths.value.find((p) => p === "model/model.c4") || paths.value[0] || "";
});
watch(
  current,
  (p) => {
    if (p && selection.file !== p) selection.file = p;
  },
  { immediate: true },
);

const lang = computed(() => (current.value ? fileKind(current.value) : "txt"));
const content = computed({
  get: () => {
    void arch.fileVersion.value;
    return current.value ? files[current.value] : "";
  },
  set: (v) => current.value && arch.updateFile(current.value, v),
});

const fileErrors = computed(() => errors.value.filter((e) => e.path === current.value));
const errorCount = (p) => errors.value.filter((e) => e.path === p).length;
const groups = computed(() => {
  void arch.fileVersion.value;
  return groupFiles(paths.value);
});

// Переход «к строке» с другой вкладки или из списка ошибок. Срабатывает и
// когда редактор только появился: переход с диаграмм монтирует вкладку
// заново, и номер строки к этому моменту уже лежит в selection.
let jumpedSeq = -1;
async function jumpToLine() {
  if (!selection.line || jumpedSeq === selection.lineSeq) return;
  await nextTick();
  if (!editor.value) return;
  jumpedSeq = selection.lineSeq;
  editor.value.gotoLine(selection.line);
}
watch(() => selection.lineSeq, jumpToLine);
watch(editor, jumpToLine);

// --- Превью ---

const views = computed(() => viewList(dump.value));
const previewTarget = computed(() => {
  const ownViews = views.value.filter((v) => v.sourcePath === current.value);
  const chosen = views.value.find((v) => v.id === previewView.value);
  if (chosen && (ownViews.length === 0 || ownViews.some((v) => v.id === chosen.id))) return chosen;
  return ownViews[0] || views.value.find((v) => v.id === selection.view) || views.value.find((v) => v.id === "index") || views.value[0] || null;
});

// --- Шаблоны ---

const allSnippets = computed(() => extraSnippets.value || arch.templates.value?.snippets || []);
const SECTION_TITLES = {
  element: "Элементы",
  relation: "Связи",
  flow: "Сценарии",
  view: "Диаграммы",
  concept: "Механизмы",
  decision: "Решения",
  doc: "Документы",
  state: "Статусы и данные",
  custom: "Свои",
};
const snippetGroups = computed(() => {
  const q = snippetQuery.value.trim().toLowerCase();
  const fitting = allSnippets.value.filter(
    (s) =>
      s.lang === lang.value &&
      (!q || s.title.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q)),
  );
  const map = new Map();
  for (const s of fitting) {
    const key = s.builtin ? s.group : "custom";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.entries()].map(([key, list]) => ({ key, title: SECTION_TITLES[key] || key, list }));
});

function insertSnippet(s) {
  editor.value?.insert(s.body);
}

async function saveSnippet() {
  const body = editor.value?.selectedText() || "";
  if (!body.trim()) {
    window.alert("Выделите в редакторе кусок, который станет шаблоном.");
    return;
  }
  const title = window.prompt("Название шаблона", "");
  if (!title) return;
  await createArchSnippet({ title, group: "custom", lang: lang.value, body });
  extraSnippets.value = (await fetchArchTemplates()).snippets;
}

async function removeSnippet(s) {
  if (!s.id || !window.confirm(`Удалить шаблон «${s.title}»?`)) return;
  await deleteArchSnippet(s.id);
  extraSnippets.value = (await fetchArchTemplates()).snippets;
}

// --- Файлы ---

const NEW_FILE_HINT =
  "Путь нового файла: model/flows/payment.c4, concepts/dedup.md, states/payment.mmd, contracts/openapi.yaml";

// flowStarter — пустой сценарий с id из имени файла: model/flows/refund.c4 →
// refundFlow. Шагов нет — у шаблонных client/api/db в чужой модели нет пары.
function flowStarter(path) {
  const words = path.split("/").pop().replace(/\.\w+$/, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  let id = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase())).join("") || "new";
  if (/^\d/.test(id)) id = "flow" + id;
  if (!/flow$/i.test(id)) id += "Flow";
  return `views {\n  dynamic view ${id} {\n    title '…'\n    variant sequence\n\n    // шаг: откуда -> куда 'что делает' — вставка «Шаг с заметкой» в палитре\n  }\n}\n`;
}

async function newFile() {
  const raw = window.prompt(NEW_FILE_HINT, "model/flows/");
  if (!raw) return;
  const path = raw.trim().replace(/^\/+/, "");
  if (files[path] !== undefined) {
    selection.file = path;
    return;
  }
  const starter =
    fileKind(path) === "c4" && path.includes("flows/")
      ? flowStarter(path)
      : fileKind(path) === "md"
        ? `# ${path.split("/").pop().replace(/\.md$/, "")}\n\n`
        : "";
  if (await arch.createFile(path, starter)) selection.file = path;
}

async function renameCurrent() {
  const to = window.prompt("Новый путь", current.value);
  if (!to || to === current.value) return;
  if (await arch.renameFile(current.value, to.trim())) selection.file = to.trim();
}

async function deleteCurrent() {
  if (!window.confirm(`Удалить ${current.value}? Вернуть можно из «Истории».`)) return;
  const path = current.value;
  if (await arch.deleteFile(path)) selection.file = "";
}

function openError(e) {
  arch.openFile(e.path, { line: e.line, edit: true });
}
</script>

<template>
  <div class="ar-split is-three">
    <div class="ar-side">
      <div class="ar-row" style="gap: 4px; margin-bottom: 2px">
        <button class="ar-btn is-small" @click="newFile">＋ Файл</button>
        <div class="ar-spacer" />
        <button class="ar-btn is-small" :disabled="!arch.dirtyPaths.value.length" @click="arch.save()">
          Сохранить
        </button>
      </div>
      <template v-for="g in groups" :key="g.title">
        <div class="ar-group-title">{{ g.icon }} {{ g.title }}</div>
        <div
          v-for="p in g.files"
          :key="p"
          class="ar-item"
          :class="{ 'is-active': p === current }"
          :title="p"
          @click="selection.file = p"
        >
          <span class="ar-item-icon">{{ FILE_ICONS[fileKind(p)] }}</span>
          <span class="ar-item-label ar-mono" style="font-size: 12px">{{ p.slice(g.prefix.length) }}</span>
          <span v-if="errorCount(p)" class="ar-badge is-bad">{{ errorCount(p) }}</span>
          <span v-if="arch.dirtyPaths.value.includes(p)" class="ar-file-dirty" title="не сохранено">●</span>
        </div>
      </template>
    </div>

    <div class="ar-pane">
      <div class="ar-pane-head">
        <span class="ar-mono" style="font-size: 12px">{{ current }}</span>
        <span v-if="fileKind(current) === 'md'" class="ar-dim" style="font-size: 12px">{{ docTitle(current, content) }}</span>
        <div class="ar-spacer" />
        <button class="ar-btn is-small is-ghost" title="Переименовать" @click="renameCurrent">✎</button>
        <button class="ar-btn is-small is-ghost is-danger" title="Удалить" @click="deleteCurrent">🗑</button>
      </div>
      <div class="ar-pane-body" style="overflow: hidden">
        <ArchCodeEditor
          v-if="current"
          :key="current"
          ref="editor"
          v-model="content"
          :lang="lang"
          :diagnostics="fileErrors"
          :get-model="() => dump"
          :get-paths="() => paths"
          @save="arch.save()"
        />
      </div>
      <div v-if="fileErrors.length" style="border-top: 1px solid var(--ar-line); max-height: 120px; overflow: auto">
        <div v-for="(e, i) in fileErrors" :key="i" class="ar-problem" @click="editor?.gotoLine(e.line, e.column)">
          <span class="ar-problem-loc">{{ e.line }}:{{ e.column }}</span>
          <span>{{ e.message }}</span>
        </div>
      </div>
    </div>

    <div class="ar-pane">
      <div class="ar-pane-head" style="gap: 2px">
        <button class="ar-tab" :class="{ 'is-active': side === 'preview' }" @click="side = 'preview'">Превью</button>
        <button class="ar-tab" :class="{ 'is-active': side === 'snippets' }" @click="side = 'snippets'">Шаблоны</button>
        <button class="ar-tab" :class="{ 'is-active': side === 'problems' }" @click="side = 'problems'">
          Ошибки <span v-if="errors.length" class="ar-badge is-bad">{{ errors.length }}</span>
        </button>
        <div class="ar-spacer" />
        <select v-if="side === 'preview' && lang === 'c4' && views.length" v-model="previewView" class="ar-select" style="width: auto; padding: 4px 6px">
          <option value="">{{ previewTarget ? previewTarget.title : "диаграмма" }}</option>
          <option v-for="v in views" :key="v.id" :value="v.id">{{ v.title }}</option>
        </select>
      </div>
      <div class="ar-pane-body">
        <template v-if="side === 'preview'">
          <ArchDiagram
            v-if="lang === 'c4' && dump && previewTarget"
            :dump="dump"
            :layouts="layouts"
            :view-id="previewTarget.id"
            @navigate="previewView = $event"
            @node-click="(n) => arch.openElement(n.modelRef || n.id)"
          />
          <ArchMarkdown v-else-if="lang === 'md'" :text="content" :path="current" />
          <div v-else-if="lang === 'mmd'" style="padding: 12px">
            <MermaidView :code="content" />
          </div>
          <div v-else class="ar-empty">Для этого файла превью нет.</div>
        </template>

        <div v-else-if="side === 'snippets'" style="padding: 10px">
          <input v-model="snippetQuery" class="ar-input" placeholder="Найти шаблон" style="margin-bottom: 8px" />
          <div class="ar-muted" style="font-size: 12px; margin-bottom: 8px">
            Клик — вставить в позицию курсора. Имена вроде api, db, partner — из шаблона «Микросервис»: поменяйте на свои.
          </div>
          <div v-for="g in snippetGroups" :key="g.key">
            <div class="ar-group-title">{{ g.title }}</div>
            <div v-for="s in g.list" :key="s.key || s.id" class="ar-snippet" :title="s.body" @click="insertSnippet(s)">
              <div class="ar-row" style="gap: 6px">
                <span class="ar-snippet-title">{{ s.title }}</span>
                <div class="ar-spacer" />
                <button v-if="!s.builtin" class="ar-btn is-ghost is-small" @click.stop="removeSnippet(s)">✕</button>
              </div>
              <div v-if="s.description" class="ar-snippet-desc">{{ s.description }}</div>
            </div>
          </div>
          <div v-if="!snippetGroups.length" class="ar-muted" style="font-size: 13px">Для этого типа файла шаблонов нет.</div>
          <button class="ar-btn is-small" style="margin-top: 8px" @click="saveSnippet">＋ Выделенное — в свои шаблоны</button>
        </div>

        <div v-else>
          <div v-if="!errors.length" class="ar-empty">Модель разбирается без ошибок ✓</div>
          <div v-for="(e, i) in errors" :key="i" class="ar-problem" @click="openError(e)">
            <span class="ar-problem-loc">{{ e.path }}:{{ e.line }}</span>
            <span>{{ e.message }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
