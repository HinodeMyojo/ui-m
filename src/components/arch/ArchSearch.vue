<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { searchProject } from "./archModel.js";
import { findTerm } from "./archTerms.js";

// Поиск по всему проекту: термин, механизм, блок схемы, сценарий, документ.
// Под каждым результатом — короткое объяснение, чтобы понять суть, ещё не
// открывая. Ctrl+K или «/» — сразу в поле.
const arch = inject("arch");
const { dump, files, paths } = arch;

const query = ref("");
const open = ref(false);
const active = ref(0);
const input = ref(null);

const KINDS = {
  term: { icon: "📖", title: "термин" },
  concept: { icon: "⚙️", title: "механизм" },
  element: { icon: "◇", title: "блок схемы" },
  view: { icon: "▦", title: "диаграмма" },
  doc: { icon: "¶", title: "документ" },
};

const results = computed(() => {
  void arch.fileVersion.value;
  // Строка глоссария и механизм часто одно и то же — оставляем одну запись.
  const seen = new Set();
  return searchProject(dump.value, files, paths.value, query.value).filter((r) => {
    if (r.kind !== "term" && r.kind !== "concept") return true;
    const key = findTerm(arch.terms.value, r.tag ? "tag:" + r.tag : r.title)?.key || r.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

function kindTitle(r) {
  if (r.kind === "view") return r.type === "dynamic" ? "сценарий" : "диаграмма";
  return KINDS[r.kind].title;
}

function choose(r) {
  if (!r) return;
  if ((r.kind === "concept" || r.kind === "term") && arch.openTerm(r.tag ? "tag:" + r.tag : r.title)) {
    // термин открылся карточкой
  } else if (r.kind === "element") arch.openElement(r.id);
  else if (r.kind === "view") arch.openView(r.id);
  else if (r.path) arch.openFile(r.path);
  open.value = false;
  input.value?.blur();
}

function onKey(e) {
  if (e.key === "ArrowDown") {
    active.value = Math.min(active.value + 1, results.value.length - 1);
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    active.value = Math.max(active.value - 1, 0);
    e.preventDefault();
  } else if (e.key === "Enter") {
    choose(results.value[active.value]);
  } else if (e.key === "Escape") {
    open.value = false;
    input.value?.blur();
  }
}

function onInput() {
  open.value = true;
  active.value = 0;
}

function onGlobalKey(e) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
    e.preventDefault();
    input.value?.focus();
    open.value = true;
  }
}

function onBlur() {
  // Даём клику по результату случиться раньше, чем список спрячется.
  setTimeout(() => (open.value = false), 150);
}

onMounted(() => window.addEventListener("keydown", onGlobalKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKey));
</script>

<template>
  <div class="ar-search">
    <input
      ref="input"
      v-model="query"
      class="ar-input"
      placeholder="Найти в проекте: термин, блок, сценарий…  (Ctrl+K)"
      @input="onInput"
      @focus="open = true"
      @blur="onBlur"
      @keydown="onKey"
    />
    <div v-if="open && query.trim().length >= 2" class="ar-search-list">
      <div v-if="!results.length" class="ar-muted" style="padding: 10px; font-size: 13px">
        Ничего не нашлось. Попробуйте другое слово или начало слова.
      </div>
      <div
        v-for="(r, i) in results"
        :key="r.kind + (r.id || r.path || '') + r.title"
        class="ar-search-item"
        :class="{ 'is-active': i === active }"
        @mouseenter="active = i"
        @mousedown.prevent="choose(r)"
      >
        <span class="ar-search-item-icon">{{ KINDS[r.kind].icon }}</span>
        <span class="ar-search-item-title">
          {{ r.title }}<span class="ar-search-item-kind">{{ kindTitle(r) }}</span>
        </span>
        <span v-if="r.hint" class="ar-search-item-hint">{{ r.hint }}</span>
      </div>
    </div>
  </div>
</template>
