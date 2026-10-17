<script setup>
import { computed, inject, ref, watch } from "vue";
import {
  ADR_STATUS,
  docTitle,
  fileKind,
  FILE_ICONS,
  frontMatter,
  groupFiles,
  mermaidTitle,
} from "./archModel.js";
import ArchMarkdown from "./ArchMarkdown.vue";
import MermaidView from "./MermaidView.vue";

// Документы проекта: разделы arc42, механизмы, решения, статусы, данные.
// Модель (.c4) здесь тоже видна, но читается она на диаграммах.
const arch = inject("arch");
const { files, paths, selection } = arch;

const query = ref("");
const showModel = ref(false);

function titleOf(path) {
  const kind = fileKind(path);
  if (kind === "md") return docTitle(path, files[path]);
  if (kind === "mmd") return mermaidTitle(path, files[path]);
  return path.split("/").pop();
}

const groups = computed(() => {
  void arch.fileVersion.value;
  const q = query.value.trim().toLowerCase();
  const visible = paths.value.filter((p) => {
    if (!showModel.value && fileKind(p) === "c4") return false;
    if (!q) return true;
    return p.toLowerCase().includes(q) || titleOf(p).toLowerCase().includes(q) || files[p].toLowerCase().includes(q);
  });
  return groupFiles(visible);
});

const firstDoc = computed(() => groups.value[0]?.files[0] || "");
const current = computed(() =>
  selection.file && files[selection.file] !== undefined && (showModel.value || fileKind(selection.file) !== "c4")
    ? selection.file
    : firstDoc.value,
);
watch(current, (p) => {
  if (p && selection.file !== p) selection.file = p;
});

const kind = computed(() => (current.value ? fileKind(current.value) : ""));
const text = computed(() => {
  void arch.fileVersion.value;
  return current.value ? files[current.value] : "";
});

function adrStatus(path) {
  if (!path.startsWith("decisions/")) return null;
  return ADR_STATUS[frontMatter(files[path]).meta.status] || null;
}

// --- Новый документ из шаблона ---

const snippets = computed(() => (arch.templates.value?.snippets || []).filter((s) => s.lang === "md" || s.lang === "mmd"));

function nextAdrNumber() {
  const nums = paths.value
    .map((p) => /^decisions\/(\d{4})-/.exec(p)?.[1])
    .filter(Boolean)
    .map(Number);
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0");
}

async function createDoc(kindKey) {
  const presets = {
    concept: { ask: "Метка механизма (латиницей, как в модели): dedup, saga, retry", dir: "concepts/", snippet: "md-concept", ext: ".md" },
    decision: { ask: "Короткое имя решения латиницей: use-kafka-for-events", dir: "decisions/", snippet: "md-adr", ext: ".md" },
    doc: { ask: "Имя документа латиницей: 13-onboarding", dir: "docs/", snippet: "md-flow-note", ext: ".md" },
    state: { ask: "Сущность латиницей: payment", dir: "states/", snippet: "mmd-state", ext: ".mmd" },
  };
  const p = presets[kindKey];
  const name = window.prompt(p.ask, "");
  if (!name) return;
  // Механизм называется как метка в модели, а метки бывают в camelCase
  // (#contentAddress): регистр здесь не трогаем, иначе описание не найдётся.
  const slug =
    kindKey === "concept"
      ? name.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
      : name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return;
  const file = p.dir + (kindKey === "decision" ? `${nextAdrNumber()}-${slug}` : slug) + p.ext;
  if (files[file] !== undefined) {
    arch.openFile(file);
    return;
  }
  let body = snippets.value.find((s) => s.key === p.snippet)?.body || "";
  if (kindKey === "decision") body = body.replace("YYYY-MM-DD", new Date().toISOString().slice(0, 10));
  if (kindKey === "concept") body = body.replace("`#метка`", "`#" + slug + "`");
  if (await arch.createFile(file, body)) arch.openFile(file, { edit: true });
}
</script>

<template>
  <div class="ar-split">
    <div class="ar-side">
      <input v-model="query" class="ar-input" placeholder="Поиск по документам" />
      <div class="ar-row" style="margin: 6px 0 2px; gap: 4px">
        <button class="ar-btn is-small" title="Механизм (arc42 §8)" @click="createDoc('concept')">＋ Механизм</button>
        <button class="ar-btn is-small" title="Решение в формате MADR" @click="createDoc('decision')">＋ ADR</button>
        <button class="ar-btn is-small" title="Статусная машина" @click="createDoc('state')">＋ Статусы</button>
        <button class="ar-btn is-small" @click="createDoc('doc')">＋ Документ</button>
      </div>
      <label class="ar-row ar-muted" style="font-size: 12px; padding: 4px 6px">
        <input v-model="showModel" type="checkbox" /> показывать файлы модели
      </label>
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
          <span class="ar-item-label">{{ titleOf(p) }}</span>
          <span v-if="adrStatus(p)" class="ar-dot" :style="{ background: adrStatus(p).color }" :title="adrStatus(p).title" />
          <span v-if="arch.dirtyPaths.value.includes(p)" class="ar-file-dirty">●</span>
        </div>
      </template>
      <div v-if="!groups.length" class="ar-muted" style="padding: 10px; font-size: 13px">Ничего не нашлось.</div>
    </div>

    <div class="ar-pane">
      <div class="ar-pane-head">
        <span class="ar-mono ar-muted" style="font-size: 12px">{{ current }}</span>
        <div class="ar-spacer" />
        <button v-if="current" class="ar-btn is-small" @click="arch.openFile(current, { edit: true })">✎ Править</button>
      </div>
      <div class="ar-pane-body">
        <ArchMarkdown v-if="kind === 'md'" :text="text" :path="current" />
        <div v-else-if="kind === 'mmd'" class="ar-doc" style="max-width: none">
          <h1 style="font-size: 20px">{{ mermaidTitle(current, text) }}</h1>
          <MermaidView :code="text" />
        </div>
        <pre v-else-if="current" class="ar-doc ar-mono" style="white-space: pre-wrap; font-size: 12.5px; max-width: none">{{ text }}</pre>
        <div v-else class="ar-empty">Документов пока нет.</div>
      </div>
    </div>
  </div>
</template>
