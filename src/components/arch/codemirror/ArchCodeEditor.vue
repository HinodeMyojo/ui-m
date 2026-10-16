<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, EditorState } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { tags as t } from "@lezer/highlight";
import {
  likec4Language,
  likec4Completions,
  markdownRefCompletions,
  mermaidLanguage,
} from "./likec4Language.js";

// Редактор файла проекта: подсветка по типу файла, подсказки из модели,
// ошибки разбора прямо в строках, Ctrl+S — сохранить.
const props = defineProps({
  modelValue: { type: String, default: "" },
  lang: { type: String, default: "txt" },
  diagnostics: { type: Array, default: () => [] },
  getModel: { type: Function, default: () => null },
  getPaths: { type: Function, default: () => [] },
});
const emit = defineEmits(["update:modelValue", "save", "cursor"]);

const host = ref(null);
let view = null;
const language = new Compartment();
// Текст, который мы сами только что отдали наружу: его возврат через
// modelValue не должен сбрасывать курсор и историю.
let echo = null;

const theme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "13px", backgroundColor: "#12141a", color: "#e3e5ee" },
    ".cm-scroller": { fontFamily: "var(--ar-mono)", lineHeight: "1.55" },
    ".cm-content": { caretColor: "#a99dff" },
    ".cm-gutters": { backgroundColor: "#12141a", color: "#4b5063", border: "none" },
    ".cm-activeLine": { backgroundColor: "rgba(124,108,255,0.06)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(124,108,255,0.1)", color: "#a3a8ba" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(124,108,255,0.3) !important",
    },
    ".cm-cursor": { borderLeftColor: "#a99dff" },
    ".cm-tooltip": { backgroundColor: "#1f222b", border: "1px solid #363b4b", color: "#e8eaf2" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#7c6cff", color: "#fff" },
    ".cm-completionDetail": { color: "#8a8fa0", fontStyle: "normal", marginLeft: "8px" },
    ".cm-panels": { backgroundColor: "#1f222b", color: "#e8eaf2" },
    ".cm-foldPlaceholder": { backgroundColor: "#262a35", border: "none", color: "#8a8fa0" },
    ".cm-diagnostic-error": { borderLeftColor: "#ef4444" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "#c792ea" },
  { tag: t.string, color: "#c3e88d" },
  { tag: t.comment, color: "#5f6680", fontStyle: "italic" },
  { tag: t.typeName, color: "#ffcb6b" },
  { tag: t.variableName, color: "#e3e5ee" },
  { tag: t.atom, color: "#f78c6c" },
  { tag: t.number, color: "#f78c6c" },
  { tag: t.operator, color: "#89ddff" },
  { tag: t.tagName, color: "#ff79c6" },
  { tag: t.link, color: "#82aaff", textDecoration: "underline" },
  { tag: t.bracket, color: "#a3a8ba" },
  { tag: t.heading, color: "#82aaff", fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700", color: "#ffffff" },
  { tag: t.monospace, color: "#f78c6c" },
  { tag: t.url, color: "#82aaff" },
  { tag: t.propertyName, color: "#82aaff" },
  { tag: t.bool, color: "#f78c6c" },
]);

// Подсказки вешаются на сам язык (languageData), а не вторым autocompletion:
// basicSetup уже включает свой, и два набора настроек спорили бы.
function languageFor(lang) {
  if (lang === "c4") {
    return [likec4Language, likec4Language.data.of({ autocomplete: likec4Completions(() => props.getModel()) })];
  }
  if (lang === "md") {
    return [
      markdown({ base: markdownLanguage }),
      markdownLanguage.data.of({
        autocomplete: markdownRefCompletions(() => props.getModel(), () => props.getPaths()),
      }),
    ];
  }
  if (lang === "mmd") return [mermaidLanguage];
  if (lang === "yaml") return [yaml()];
  if (lang === "json") return [json()];
  return [];
}

function toDiagnostics(doc, list) {
  const out = [];
  for (const d of list) {
    const lineNo = Math.min(Math.max(d.line || 1, 1), doc.lines);
    const line = doc.line(lineNo);
    const from = Math.min(line.from + Math.max((d.column || 1) - 1, 0), line.to);
    let to = from;
    if (d.endLine && d.endLine >= lineNo && d.endLine <= doc.lines) {
      const end = doc.line(d.endLine);
      to = Math.min(end.from + Math.max((d.endColumn || 1) - 1, 0), end.to);
    }
    if (to <= from) to = Math.min(line.to, from + 1);
    out.push({ from, to: Math.max(to, from), severity: "error", message: d.message });
  }
  return out;
}

function pushDiagnostics() {
  if (view) view.dispatch(setDiagnostics(view.state, toDiagnostics(view.state.doc, props.diagnostics)));
}

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        keymap.of([
          indentWithTab,
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              emit("save");
              return true;
            },
          },
        ]),
        indentUnit.of("  "),
        EditorState.tabSize.of(2),
        theme,
        syntaxHighlighting(highlight),
        lintGutter(),
        language.of(languageFor(props.lang)),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            echo = u.state.doc.toString();
            emit("update:modelValue", echo);
          }
          if (u.selectionSet) {
            emit("cursor", u.state.doc.lineAt(u.state.selection.main.head).number);
          }
        }),
      ],
    }),
  });
  pushDiagnostics();
});

watch(
  () => props.modelValue,
  (value) => {
    if (!view || value === echo || value === view.state.doc.toString()) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    echo = value;
  },
);

watch(
  () => props.lang,
  (lang) => view?.dispatch({ effects: language.reconfigure(languageFor(lang)) }),
);

watch(() => props.diagnostics, pushDiagnostics, { deep: true });

onBeforeUnmount(() => view?.destroy());

// insert — вставить текст в позицию курсора с отступом текущей строки.
function insert(text) {
  if (!view) return;
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const indent = /^\s*/.exec(line.text)[0];
  const atLineStart = pos === line.from + indent.length || line.text.trim() === "";
  const body = text
    .replace(/\n$/, "")
    .split("\n")
    .map((l, i) => (i === 0 || !l ? l : indent + l))
    .join("\n");
  const insertText = atLineStart ? body : "\n" + indent + body;
  view.dispatch({
    changes: { from: pos, to: state.selection.main.to, insert: insertText },
    selection: { anchor: pos + insertText.length },
    scrollIntoView: true,
  });
  view.focus();
}

function gotoLine(lineNo, column = 1) {
  if (!view) return;
  const doc = view.state.doc;
  const line = doc.line(Math.min(Math.max(lineNo, 1), doc.lines));
  const pos = Math.min(line.from + Math.max(column - 1, 0), line.to);
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  view.focus();
}

function selectedText() {
  if (!view) return "";
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
}

defineExpose({ insert, gotoLine, selectedText, focus: () => view?.focus() });
</script>

<template>
  <div ref="host" class="ar-editor" />
</template>
