<script setup>
import { computed, inject, nextTick, onMounted, ref, watch } from "vue";
import { Marked } from "marked";
import hljs from "highlight.js";
import { ADR_STATUS, frontMatter, parseRef } from "./archModel.js";
import { renderMermaid } from "./mermaid.js";

// Документ проекта: markdown, ссылки [[…]] на элементы, диаграммы и файлы,
// блоки ```mermaid``` и шапка MADR (status, date).
const props = defineProps({
  text: { type: String, default: "" },
  // Путь документа: от него считаются относительные ссылки на другие .md.
  path: { type: String, default: "" },
});

const arch = inject("arch");
const root = ref(null);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const ICONS = { element: "◇", view: "▦", file: "¶" };

function renderRef(raw) {
  const ref = parseRef(raw);
  const info = arch.resolveRef(ref);
  const label = ref.label || info.label;
  const cls = info.exists ? "ar-ref" : "ar-ref is-missing";
  const hint = info.exists ? info.hint : "нет в модели";
  return `<a class="${cls}" data-ref="${escapeHtml(raw)}" title="${escapeHtml(hint)}">${ICONS[ref.kind]} ${escapeHtml(label)}</a>`;
}

const parser = new Marked({
  gfm: true,
  breaks: false,
  extensions: [
    {
      name: "archRef",
      level: "inline",
      start(src) {
        const i = src.indexOf("[[");
        return i < 0 ? undefined : i;
      },
      tokenizer(src) {
        const m = /^\[\[([^[\]\n]+?)\]\]/.exec(src);
        if (m) return { type: "archRef", raw: m[0], ref: m[1] };
        return undefined;
      },
      renderer(token) {
        return renderRef(token.ref);
      },
    },
  ],
  renderer: {
    code({ text, lang }) {
      if (lang === "mermaid") {
        return `<div class="ar-mermaid" data-mermaid="${encodeURIComponent(text)}">…</div>`;
      }
      const highlighted =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(text, { language: lang }).value
          : escapeHtml(text);
      return `<pre><code class="hljs">${highlighted}</code></pre>`;
    },
    link({ href, title, text }) {
      const t = title ? ` title="${escapeHtml(title)}"` : "";
      if (/^[a-z]+:/i.test(href) || href.startsWith("#")) {
        return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      // Относительная ссылка на файл проекта открывается внутри проекта.
      return `<a href="#" data-local="${escapeHtml(href)}"${t}>${text}</a>`;
    },
  },
});

const parsed = computed(() => frontMatter(props.text || ""));

const html = computed(() => {
  // Зависимость от модели: подписи ссылок берутся из неё.
  void arch.dump.value;
  void arch.fileVersion.value;
  return parsed.value.body ? parser.parse(parsed.value.body) : "";
});

const meta = computed(() => Object.entries(parsed.value.meta));

async function drawMermaid() {
  await nextTick();
  const blocks = root.value?.querySelectorAll(".ar-mermaid[data-mermaid]") || [];
  for (const el of blocks) {
    const code = decodeURIComponent(el.dataset.mermaid);
    el.removeAttribute("data-mermaid");
    try {
      el.innerHTML = await renderMermaid(code);
    } catch (err) {
      el.innerHTML = `<div class="ar-error">Mermaid: ${escapeHtml(String(err?.message || err).split("\n")[0])}</div>`;
    }
  }
}

onMounted(drawMermaid);
watch(html, drawMermaid);

function resolveLocal(href) {
  const clean = href.split("#")[0];
  const base = props.path.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (part === "..") base.pop();
    else if (part && part !== ".") base.push(part);
  }
  return base.join("/");
}

function onClick(e) {
  const refEl = e.target.closest?.("[data-ref]");
  if (refEl) {
    e.preventDefault();
    arch.openRef(parseRef(refEl.dataset.ref));
    return;
  }
  const local = e.target.closest?.("[data-local]");
  if (local) {
    e.preventDefault();
    arch.openRef({ kind: "file", target: resolveLocal(local.dataset.local) });
  }
}

function metaLabel(key, value) {
  if (key === "status" && ADR_STATUS[value]) return ADR_STATUS[value].title;
  return value;
}
</script>

<template>
  <div ref="root" class="ar-doc" @click="onClick">
    <div v-if="meta.length" class="ar-front">
      <span v-for="[key, value] in meta" :key="key" class="ar-chip">
        <span
          v-if="key === 'status'"
          class="ar-dot"
          :style="{ background: ADR_STATUS[value]?.color || '#94a3b8' }"
        />
        <span class="ar-muted">{{ key }}:</span> {{ metaLabel(key, value) }}
      </span>
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-html="html" />
  </div>
</template>
