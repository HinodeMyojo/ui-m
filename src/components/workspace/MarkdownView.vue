<script setup>
import { computed } from "vue";
import { Marked } from "marked";
import hljs from "highlight.js";

// Готовый markdown: используется и в превью редактора, и в рабочем виде карточки.
const props = defineProps({
  text: { type: String, default: "" },
  // Разрешить щёлкать по чекбоксам прямо в отрендеренном тексте.
  editableChecks: { type: Boolean, default: false },
});
const emit = defineEmits(["update:text"]);

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

const html = computed(() => (props.text ? parser.parse(props.text) : ""));

// Клик по чекбоксу переключает соответствующую строку в исходном тексте.
function onClick(e) {
  if (!props.editableChecks) return;
  if (e.target.tagName !== "INPUT" || e.target.type !== "checkbox") return;
  e.preventDefault();
  const boxes = Array.from(e.currentTarget.querySelectorAll('input[type="checkbox"]'));
  const index = boxes.indexOf(e.target);
  if (index < 0) return;

  let seen = -1;
  const next = (props.text || "")
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
  emit("update:text", next);
}
</script>

<template>
  <div class="md-body" v-html="html" @click="onClick"></div>
</template>

<style>
/* Оформление отрендеренного markdown — общее для превью редактора,
   рабочего вида карточки и холста дня. */
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
.md-body > :first-child { margin-top: 0; }
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
