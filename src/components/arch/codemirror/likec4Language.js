// Подсветка и подсказки DSL LikeC4 для CodeMirror.
//
// Грамматика LikeC4 живёт в его парсере (Langium), и для CodeMirror её нет.
// Точный разбор и ошибки делает сам LikeC4 в потоке разбора, а здесь — лёгкий
// построчный токенайзер: ключевые слова, строки, метки, стрелки. Его хватает,
// чтобы текст читался, а подсказки знают модель, потому что берутся из неё.
import { StreamLanguage } from "@codemirror/language";

const KEYWORDS = [
  "specification", "model", "views", "view", "dynamic", "deployment", "global", "import", "from",
  "element", "relationship", "tag", "color", "deploymentNode", "of", "extends", "extend",
  "include", "exclude", "where", "with", "style", "autoLayout", "title", "description",
  "summary", "technology", "notes", "notation", "link", "links", "icon", "metadata", "shape",
  "border", "opacity", "size", "padding", "textSize", "multiple", "line", "head", "tail",
  "navigateTo", "variant", "sequence", "diagram", "parallel", "par", "alt", "when", "else",
  "opt", "loop", "break", "try", "catch", "finally", "if", "instanceOf", "environment",
  "node", "this", "it", "is", "not", "and", "or", "kind", "group", "rank", "TopBottom",
  "BottomTop", "LeftRight", "RightLeft",
];

const ATOMS = [
  "person", "rectangle", "browser", "mobile", "cylinder", "storage", "queue", "bucket",
  "document", "component", "primary", "secondary", "muted", "slate", "blue", "indigo", "sky",
  "red", "gray", "green", "amber", "dashed", "dotted", "solid", "none", "normal", "onormal",
  "diamond", "odiamond", "crow", "vee", "open", "dot", "odot", "true", "false", "xsmall",
  "small", "medium", "large", "xlarge",
];

const keywordSet = new Set(KEYWORDS);
const atomSet = new Set(ATOMS);

// startState/token — интерфейс StreamLanguage. Состояние помнит только,
// не внутри ли мы многострочной строки или комментария.
const likec4Stream = {
  name: "likec4",
  startState: () => ({ inBlockComment: false, inTripleString: null }),
  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.skipTo("*/")) {
        stream.match("*/");
        state.inBlockComment = false;
      } else stream.skipToEnd();
      return "comment";
    }
    if (state.inTripleString) {
      const q = state.inTripleString;
      if (stream.skipTo(q)) {
        stream.match(q);
        state.inTripleString = null;
      } else stream.skipToEnd();
      return "string";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.inBlockComment = true;
      return "comment";
    }
    for (const q of ["'''", '"""']) {
      if (stream.match(q)) {
        state.inTripleString = q;
        if (stream.skipTo(q)) {
          stream.match(q);
          state.inTripleString = null;
        } else stream.skipToEnd();
        return "string";
      }
    }
    const ch = stream.peek();
    if (ch === "'" || ch === '"') {
      stream.next();
      let escaped = false;
      let c;
      while ((c = stream.next()) != null) {
        if (c === ch && !escaped) break;
        escaped = !escaped && c === "\\";
      }
      return "string";
    }
    if (stream.match(/^#[\w-]+/)) return "tagName";
    if (stream.match(/^(-\[[\w-]*\]->|<->|->|<-|-\[)/)) return "operator";
    if (stream.match(/^https?:\/\/\S+/)) return "link";
    if (stream.match(/^\d+(\.\d+)?%?/)) return "number";
    if (stream.match(/^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)+/)) return "variableName";
    if (stream.match(/^[A-Za-z_][\w-]*:[\w-]+/)) return "atom"; // tech:dotnet
    const word = stream.match(/^[A-Za-z_][\w-]*/);
    if (word) {
      const w = word[0];
      // «x = kind 'Название'»: имя вида после «=» подсвечиваем как тип.
      if (keywordSet.has(w)) return "keyword";
      if (atomSet.has(w)) return "atom";
      const before = stream.string.slice(0, stream.start);
      if (/=\s*$/.test(before)) return "typeName";
      return "variableName";
    }
    if (stream.match(/^[{}()[\]]/)) return "bracket";
    if (stream.match(/^[=*,.]/)) return "punctuation";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", "'", '"'] },
  },
};

export const likec4Language = StreamLanguage.define(likec4Stream);

// Mermaid: тот же приём, слова и стрелки.
const MERMAID_KEYWORDS = new Set([
  "stateDiagram", "stateDiagram-v2", "erDiagram", "flowchart", "graph", "sequenceDiagram",
  "classDiagram", "state", "note", "end", "participant", "actor", "loop", "alt", "else", "opt",
  "par", "and", "rect", "subgraph", "direction", "TB", "TD", "LR", "RL", "BT", "class", "PK", "FK",
]);

export const mermaidLanguage = StreamLanguage.define({
  name: "mermaid",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("%%")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^"[^"]*"/)) return "string";
    if (stream.match(/^\[\*\]/)) return "atom";
    if (stream.match(/^(-->|--|==>|-\.->|\|\|--o\{|\|\|--\|\{|\|o--o\||\}o--o\{|[|}][|o]--[o|][|{]|->>|-->>|-x|--x)/)) {
      return "operator";
    }
    const word = stream.match(/^[\w-]+/);
    if (word) return MERMAID_KEYWORDS.has(word[0]) ? "keyword" : "variableName";
    if (stream.match(/^:[^\n]*/)) return "string";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "%%" } },
});

const ICONS = [
  "tech:dotnet", "tech:csharp", "tech:postgresql", "tech:kafka", "tech:redis", "tech:rabbitmq",
  "tech:nginx", "tech:docker", "tech:kubernetes", "tech:go", "tech:react", "tech:vue",
  "tech:net-core", "aws:", "gcp:", "azure:",
];

// likec4Completions — подсказки по модели: элементы, виды, метки, диаграммы.
// model — функция, а не значение: модель пересобирается, пока печатаешь.
export function likec4Completions(getModel) {
  return (context) => {
    const tag = context.matchBefore(/#[\w-]*/);
    const word = context.matchBefore(/[\w.:-]+/);
    const target = tag || word;
    if (!target && !context.explicit) return null;
    const from = target ? target.from : context.pos;
    const model = getModel();
    const options = [];
    if (tag) {
      for (const t of Object.keys(model?.specification?.tags || {})) {
        options.push({ label: "#" + t, type: "keyword", detail: "метка" });
      }
      return { from, options, validFor: /^#[\w-]*$/ };
    }
    for (const e of Object.values(model?.elements || {})) {
      options.push({
        label: e.id,
        type: "variable",
        detail: e.kind,
        info: [e.title, e.technology].filter(Boolean).join(" · "),
        boost: 2,
      });
    }
    for (const k of Object.keys(model?.specification?.elements || {})) {
      options.push({ label: k, type: "type", detail: "вид элемента", boost: 1 });
    }
    for (const k of Object.keys(model?.specification?.relationships || {})) {
      options.push({ label: `-[${k}]->`, type: "keyword", detail: "вид связи" });
    }
    for (const v of Object.values(model?.views || {})) {
      options.push({ label: v.id, type: "class", detail: "диаграмма", info: v.title || "" });
    }
    for (const w of KEYWORDS) options.push({ label: w, type: "keyword" });
    for (const w of ATOMS) options.push({ label: w, type: "constant" });
    for (const w of ICONS) options.push({ label: w, type: "constant", detail: "иконка" });
    return { from, options, validFor: /^[\w.:-]*$/ };
  };
}

// markdownRefCompletions — подсказка внутри [[…]]: элементы, view:, file:, adr:.
export function markdownRefCompletions(getModel, getPaths) {
  return (context) => {
    const m = context.matchBefore(/\[\[[^\]\n]*/);
    if (!m) return null;
    const model = getModel();
    const options = [];
    for (const e of Object.values(model?.elements || {})) {
      options.push({ label: e.id, type: "variable", detail: e.kind, info: e.title, apply: e.id + "]]" });
    }
    for (const v of Object.values(model?.views || {})) {
      options.push({ label: "view:" + v.id, type: "class", detail: v.title || "", apply: "view:" + v.id + "]]" });
    }
    for (const p of getPaths()) {
      options.push({ label: "file:" + p, type: "text", apply: "file:" + p + "]]" });
      const adr = /^decisions\/(\d{4})-/.exec(p);
      if (adr) options.push({ label: "adr:" + adr[1], type: "text", detail: p, apply: "adr:" + adr[1] + "]]" });
    }
    return { from: m.from + 2, options, validFor: /^[\w.:/-]*$/ };
  };
}
