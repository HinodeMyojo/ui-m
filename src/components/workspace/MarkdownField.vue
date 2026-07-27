<script setup>
import { ref, computed, nextTick } from "vue";
import { Marked } from "marked";
import hljs from "highlight.js";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "Пиши что угодно…" },
  minHeight: { type: Number, default: 220 },
});
const emit = defineEmits(["update:modelValue"]);

const mode = ref("write"); // write | split | preview
const areaRef = ref(null);

const parser = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }) {
      const highlighted =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(text, { language: lang }).value
          : hljs.highlightAuto(text).value;
      return `<pre><code class="hljs">${highlighted}</code></pre>`;
    },
    link({ href, title, text }) {
      const t = title ? ` title="${title}"` : "";
      return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

const html = computed(() => (props.modelValue ? parser.parse(props.modelValue) : ""));

function setValue(value) {
  emit("update:modelValue", value);
}

// Оборачивает выделение (или вставляет заготовку) — сердце всей панели кнопок.
async function wrap(before, after = before, placeholder = "текст") {
  const area = areaRef.value;
  if (!area) return;
  const start = area.selectionStart;
  const end = area.selectionEnd;
  const value = props.modelValue || "";
  const selected = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  setValue(next);
  await nextTick();
  area.focus();
  area.selectionStart = start + before.length;
  area.selectionEnd = start + before.length + selected.length;
}

// Префикс на каждую строку выделения: списки, цитаты, заголовки.
async function prefixLines(prefix) {
  const area = areaRef.value;
  if (!area) return;
  const value = props.modelValue || "";
  const start = value.lastIndexOf("\n", area.selectionStart - 1) + 1;
  const end = area.selectionEnd;
  const block = value.slice(start, end) || "";
  const lines = block.split("\n");
  const patched = lines
    .map((line, i) => {
      const mark = prefix === "1. " ? `${i + 1}. ` : prefix;
      return line.startsWith(mark) ? line.slice(mark.length) : mark + line;
    })
    .join("\n");
  setValue(value.slice(0, start) + patched + value.slice(end));
  await nextTick();
  area.focus();
}

function onKeydown(e) {
  // Tab внутри полотна — отступ, а не прыжок фокуса.
  if (e.key === "Tab") {
    e.preventDefault();
    wrap("  ", "", "");
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
    e.preventDefault();
    wrap("**");
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
    e.preventDefault();
    wrap("*");
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    wrap("[", "](https://)", "ссылка");
  }
}

// Клик по чекбоксу прямо в превью переключает его в тексте.
function onPreviewClick(e) {
  if (e.target.tagName !== "INPUT" || e.target.type !== "checkbox") return;
  e.preventDefault();
  const boxes = Array.from(e.currentTarget.querySelectorAll('input[type="checkbox"]'));
  const index = boxes.indexOf(e.target);
  if (index < 0) return;
  let seen = -1;
  const next = (props.modelValue || "")
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*[-*]\s+)\[( |x|X)\]/);
      if (!m) return line;
      seen++;
      if (seen !== index) return line;
      const checked = m[2].toLowerCase() === "x";
      return line.replace(/\[( |x|X)\]/, checked ? "[ ]" : "[x]");
    })
    .join("\n");
  setValue(next);
}
</script>

<template>
  <div class="mdf">
    <div class="mdf-toolbar">
      <button type="button" class="mdf-tb" title="Жирный (Ctrl+B)" @click="wrap('**')"><b>B</b></button>
      <button type="button" class="mdf-tb" title="Курсив (Ctrl+I)" @click="wrap('*')"><i>I</i></button>
      <button type="button" class="mdf-tb" title="Зачёркнутый" @click="wrap('~~')"><s>S</s></button>
      <span class="mdf-sep"></span>
      <button type="button" class="mdf-tb" title="Заголовок" @click="prefixLines('## ')">H</button>
      <button type="button" class="mdf-tb" title="Список" @click="prefixLines('- ')">•</button>
      <button type="button" class="mdf-tb" title="Нумерованный список" @click="prefixLines('1. ')">1.</button>
      <button type="button" class="mdf-tb" title="Чекбокс" @click="prefixLines('- [ ] ')">☐</button>
      <button type="button" class="mdf-tb" title="Цитата" @click="prefixLines('> ')">❝</button>
      <span class="mdf-sep"></span>
      <button type="button" class="mdf-tb" title="Код" @click="wrap('`')">&lt;/&gt;</button>
      <button type="button" class="mdf-tb" title="Блок кода" @click="wrap('\n```\n', '\n```\n', 'код')">▦</button>
      <button type="button" class="mdf-tb" title="Ссылка (Ctrl+K)" @click="wrap('[', '](https://)', 'ссылка')">🔗</button>
      <button type="button" class="mdf-tb" title="Разделитель" @click="wrap('\n---\n', '', '')">―</button>

      <div class="mdf-modes">
        <button type="button" class="mdf-mode" :class="{ on: mode === 'write' }" @click="mode = 'write'">Текст</button>
        <button type="button" class="mdf-mode" :class="{ on: mode === 'split' }" @click="mode = 'split'">Оба</button>
        <button type="button" class="mdf-mode" :class="{ on: mode === 'preview' }" @click="mode = 'preview'">Превью</button>
      </div>
    </div>

    <div class="mdf-body" :class="`mode-${mode}`" :style="{ minHeight: minHeight + 'px' }">
      <textarea
        v-if="mode !== 'preview'"
        ref="areaRef"
        class="mdf-area"
        :value="modelValue"
        :placeholder="placeholder"
        spellcheck="false"
        @input="setValue($event.target.value)"
        @keydown="onKeydown"
      ></textarea>
      <div
        v-if="mode !== 'write'"
        class="mdf-preview md-body"
        v-html="html"
        @click="onPreviewClick"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.mdf {
  border: 1px solid #2a2d38;
  border-radius: 10px;
  background: #16171d;
  overflow: hidden;
}

.mdf-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  padding: 6px 8px;
  background: #1c1e26;
  border-bottom: 1px solid #2a2d38;
}

.mdf-tb {
  background: transparent;
  border: 1px solid transparent;
  color: #b7bccb;
  border-radius: 6px;
  min-width: 30px;
  height: 28px;
  padding: 0 6px;
  cursor: pointer;
  font-size: 13px;
}

.mdf-tb:hover {
  background: #262936;
  border-color: #3a3f52;
  color: #fff;
}

.mdf-sep {
  width: 1px;
  height: 18px;
  background: #2f3340;
  margin: 0 4px;
}

.mdf-modes {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.mdf-mode {
  background: transparent;
  border: 1px solid #2f3340;
  color: #8f95a6;
  border-radius: 6px;
  height: 28px;
  padding: 0 10px;
  cursor: pointer;
  font-size: 12px;
}

.mdf-mode.on {
  background: #1767fd22;
  border-color: #1767fd;
  color: #cfe0ff;
}

.mdf-body {
  display: grid;
  grid-template-columns: 1fr;
}

.mdf-body.mode-split {
  grid-template-columns: 1fr 1fr;
}

.mdf-area {
  width: 100%;
  min-height: inherit;
  resize: vertical;
  background: transparent;
  border: none;
  outline: none;
  color: #e8eaf2;
  padding: 12px 14px;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13.5px;
  line-height: 1.65;
}

.mdf-preview {
  padding: 12px 14px;
  overflow-y: auto;
  border-left: 1px solid #2a2d38;
  color: #dfe3ee;
  font-size: 14px;
  line-height: 1.7;
}

.mdf-body.mode-preview .mdf-preview {
  border-left: none;
}

@media (max-width: 760px) {
  .mdf-body.mode-split {
    grid-template-columns: 1fr;
  }
  .mdf-preview {
    border-left: none;
    border-top: 1px solid #2a2d38;
  }
}
</style>

<style>
/* Оформление отрендеренного markdown — общее для превью и заметок. */
.md-body h1,
.md-body h2,
.md-body h3 {
  margin: 14px 0 8px;
  line-height: 1.3;
  color: #fff;
}
.md-body h1 { font-size: 21px; }
.md-body h2 { font-size: 18px; }
.md-body h3 { font-size: 16px; }
.md-body p { margin: 8px 0; }
.md-body ul,
.md-body ol { margin: 8px 0; padding-left: 22px; }
.md-body li { margin: 3px 0; }
.md-body a { color: #6ba4ff; }
.md-body code {
  background: #232631;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12.5px;
}
.md-body pre {
  background: #101219;
  border: 1px solid #262a36;
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
}
.md-body pre code { background: none; padding: 0; }
.md-body blockquote {
  margin: 10px 0;
  padding: 4px 12px;
  border-left: 3px solid #6e4aff;
  color: #b3b8c8;
}
.md-body hr { border: none; border-top: 1px solid #2a2d38; margin: 14px 0; }
.md-body table { border-collapse: collapse; width: 100%; margin: 10px 0; }
.md-body th,
.md-body td { border: 1px solid #2a2d38; padding: 6px 10px; text-align: left; }
.md-body img { max-width: 100%; border-radius: 8px; }
.md-body input[type="checkbox"] { margin-right: 6px; cursor: pointer; }
</style>
