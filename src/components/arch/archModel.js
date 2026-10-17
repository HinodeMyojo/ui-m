// Чтение модели LikeC4 и файлов проекта: всё, что страницы спрашивают у
// разобранной модели, собрано здесь, чтобы формат дампа знал один файл.

// richText — описание в LikeC4 бывает строкой, {txt} или {md}.
export function richText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.md ?? value.txt ?? "";
}

export const VIEW_GROUPS = [
  { type: "element", title: "Структура", icon: "▦" },
  { type: "dynamic", title: "Сценарии", icon: "⇄" },
  { type: "deployment", title: "Развёртывание", icon: "☁" },
];

export function viewList(dump) {
  if (!dump?.views) return [];
  return Object.values(dump.views).map((v) => ({
    id: v.id,
    title: v.title || v.id,
    type: v._type,
    variant: v.variant || "",
    description: richText(v.description),
    sourcePath: v.sourcePath || "",
    viewOf: v.viewOf || "",
  }));
}

export function elementList(dump) {
  if (!dump?.elements) return [];
  return Object.values(dump.elements)
    .map((e) => ({
      id: e.id,
      title: e.title || e.id,
      kind: e.kind,
      technology: e.technology || "",
      tags: e.tags || [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// relationsOf — входящие и исходящие связи элемента. Связи вложенных
// элементов к элементу не относятся: у них своя карточка.
export function relationsOf(dump, fqn) {
  const incoming = [];
  const outgoing = [];
  for (const r of Object.values(dump?.relations || {})) {
    const source = r.source?.model;
    const target = r.target?.model;
    const item = {
      id: r.id,
      title: r.title || "",
      kind: r.kind || "",
      technology: r.technology || "",
      tags: r.tags || [],
      source,
      target,
    };
    if (source === fqn) outgoing.push(item);
    if (target === fqn) incoming.push(item);
  }
  return { incoming, outgoing };
}

export function viewsWithElement(dump, fqn) {
  return viewList(dump).filter((v) =>
    (dump.views[v.id]?.nodes || []).some((n) => n.modelRef === fqn || n.id === fqn),
  );
}

export function childrenOf(dump, fqn) {
  const prefix = fqn + ".";
  return elementList(dump).filter(
    (e) => e.id.startsWith(prefix) && !e.id.slice(prefix.length).includes("."),
  );
}

// --- Ссылки в markdown: [[taxService.api]], [[view:payTax]], [[file:concepts/outbox.md]] ---

export const REF_RE = /\[\[([^\[\]\n]+?)\]\]/g;

export function parseRef(raw) {
  const text = raw.trim();
  const [target, label] = text.split("|").map((s) => s.trim());
  if (target.startsWith("view:")) return { kind: "view", target: target.slice(5), label };
  if (target.startsWith("file:")) return { kind: "file", target: target.slice(5), label };
  if (target.startsWith("adr:")) return { kind: "adr", target: target.slice(4).trim(), label };
  return { kind: "element", target, label };
}

// adrPath — файл решения по номеру из [[adr:0002]]: decisions/0002-<имя>.md.
export function adrPath(paths, num) {
  const n = String(num).replace(/^0+/, "");
  if (!/^\d+$/.test(n)) return null;
  const prefix = `decisions/${n.padStart(4, "0")}-`;
  return paths.find((p) => p.startsWith(prefix) && p.endsWith(".md")) || null;
}

export function refsIn(text) {
  const out = [];
  for (const m of String(text || "").matchAll(REF_RE)) out.push(parseRef(m[1]));
  return out;
}

// --- Файлы ---

export function fileKind(path) {
  const ext = path.split(".").pop().toLowerCase();
  if (ext === "c4" || ext === "likec4") return "c4";
  if (ext === "md") return "md";
  if (ext === "mmd") return "mmd";
  if (ext === "yaml" || ext === "yml") return "yaml";
  if (ext === "json") return "json";
  return "txt";
}

export const FILE_ICONS = { c4: "◇", md: "¶", mmd: "◈", yaml: "{}", json: "{}", txt: "≡" };

// Папки проекта в том порядке, в каком их читают: сначала arc42, потом
// механизмы и решения, модель — последней (её смотрят на диаграммах).
export const FOLDERS = [
  { prefix: "docs/", title: "Документация arc42", icon: "📘" },
  { prefix: "concepts/", title: "Механизмы", icon: "⚙️" },
  { prefix: "decisions/", title: "Решения (ADR)", icon: "⚖️" },
  { prefix: "states/", title: "Статусы", icon: "🔁" },
  { prefix: "data/", title: "Данные", icon: "🗄️" },
  { prefix: "contracts/", title: "Контракты", icon: "📜" },
  { prefix: "model/", title: "Модель C4", icon: "🧩" },
];

export function folderOf(path) {
  return FOLDERS.find((f) => path.startsWith(f.prefix)) || null;
}

export function groupFiles(paths) {
  const groups = FOLDERS.map((f) => ({ ...f, files: [] }));
  const other = { prefix: "", title: "Прочее", icon: "📁", files: [] };
  for (const p of [...paths].sort((a, b) => a.localeCompare(b))) {
    const g = groups.find((x) => p.startsWith(x.prefix));
    (g || other).files.push(p);
  }
  return [...groups, other].filter((g) => g.files.length);
}

// frontMatter — «---\nstatus: accepted\n---» в начале MADR.
export function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text || "");
  if (!m) return { meta: {}, body: text || "" };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length) };
}

// docTitle — заголовок документа: первый «# …», иначе имя файла.
export function docTitle(path, text) {
  const { body } = frontMatter(text);
  const h = /^#\s+(.+)$/m.exec(body || "");
  if (h) return h[1].trim();
  const name = path.split("/").pop();
  return name.replace(/\.[^.]+$/, "");
}

// Mermaid-файл начинается с комментариев %% — первый из них служит подписью.
export function mermaidTitle(path, text) {
  const m = /^%%\s*(.+)$/m.exec(text || "");
  return m ? m[1].trim() : path.split("/").pop();
}

export const ADR_STATUS = {
  proposed: { title: "предложено", color: "#f59e0b" },
  accepted: { title: "принято", color: "#22c55e" },
  rejected: { title: "отклонено", color: "#ef4444" },
  deprecated: { title: "устарело", color: "#64748b" },
  superseded: { title: "заменено", color: "#64748b" },
};

// Метка механизма ↔ файл concepts/<метка>.md. Регистр не важен: файл могли
// назвать contentaddress.md, а метку — #contentAddress.
export function conceptPathForTag(paths, tag) {
  const exact = `concepts/${tag}.md`;
  if (paths.includes(exact)) return exact;
  const lower = exact.toLowerCase();
  return paths.find((p) => p.toLowerCase() === lower) || null;
}

export function sameTag(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

// mentionsOf — какие документы ссылаются на элемент или диаграмму.
export function mentionsOf(files, kind, target) {
  const out = [];
  for (const [path, text] of Object.entries(files)) {
    if (fileKind(path) !== "md") continue;
    if (refsIn(text).some((r) => r.kind === kind && r.target === target)) out.push(path);
  }
  return out.sort();
}
