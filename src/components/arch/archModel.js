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

// --- Порядок сценариев ---

export const VIEW_SORTS = [
  { code: "title", title: "по номеру" },
  { code: "model", title: "как в модели" },
];

// sortViews — сценарии по названию с учётом чисел («С-2» раньше «С-10»).
// Структурные диаграммы держат порядок модели: это уровни C4 сверху вниз.
export function sortViews(list, mode) {
  if (mode !== "title") return list;
  const byTitle = (a, b) => a.title.localeCompare(b.title, "ru", { numeric: true, sensitivity: "base" });
  const dynamic = list.filter((v) => v.type === "dynamic").sort(byTitle);
  let i = 0;
  return list.map((v) => (v.type === "dynamic" ? dynamic[i++] : v));
}

// --- Провал вглубь ---

// scopedViewOf — диаграмма «внутри элемента» (view … of fqn), если она есть.
export function scopedViewOf(dump, fqn) {
  return viewList(dump).find((v) => v.type === "element" && v.viewOf === fqn) || null;
}

// viewTrail — путь от общей схемы к текущей: Контекст › Система › Контейнер.
export function viewTrail(dump, viewId) {
  const views = viewList(dump);
  const current = views.find((v) => v.id === viewId);
  if (!current) return [];
  const root = views.find((v) => v.id === "index");
  const trail = [];
  if (root && root.id !== current.id) trail.push(root);
  if (current.type === "element" && current.viewOf) {
    const parts = current.viewOf.split(".");
    for (let n = 1; n < parts.length; n++) {
      const v = scopedViewOf(dump, parts.slice(0, n).join("."));
      if (v && v.id !== current.id) trail.push(v);
    }
  }
  return trail;
}

// --- Метки по-человечески ---

// conceptSummary — первая содержательная фраза описания механизма: без
// заголовков, цитат-ссылок и списков.
export function conceptSummary(text) {
  const { body } = frontMatter(text || "");
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t || /^(#|>|[-*]\s|\||```|\d+\.\s)/.test(t)) continue;
    return t
      .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
      .replace(/[`*_]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^Простыми словами\.\s*/i, "");
  }
  return "";
}

// tagInfo — название механизма вместо #метки и его суть одной фразой.
export function tagInfo(files, paths, tag) {
  const path = conceptPathForTag(paths, tag);
  if (!path) return { tag, path: null, title: "#" + tag, summary: "" };
  return { tag, path, title: docTitle(path, files[path]), summary: conceptSummary(files[path]) };
}

// --- Поиск по проекту ---

// plainText — markdown без разметки: ссылки [[…]] становятся подписями,
// заголовки, цитаты, таблицы и выделение — обычным текстом.
// resolve(ref) отдаёт название по ссылке; без него остаётся сама цель.
export function plainText(text, resolve) {
  return String(text || "")
    .replace(REF_RE, (_, raw) => {
      const ref = parseRef(raw);
      return ref.label || resolve?.(ref) || ref.target;
    })
    .replace(/^\s*(#+|>|[-*]|\d+\.)\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function snippetAround(text, q, resolve, width = 110) {
  const flat = plainText(text, resolve);
  const i = flat.toLowerCase().indexOf(q);
  if (i < 0) return "";
  const from = Math.max(0, i - width / 3);
  const s = flat.slice(from, from + width).trim();
  return (from > 0 ? "…" : "") + s + (from + width < flat.length ? "…" : "");
}

// glossaryRows — строки таблицы глоссария: «| Термин | Значение |».
function glossaryRows(files, resolve) {
  const out = [];
  for (const [path, text] of Object.entries(files)) {
    if (!/glossary|глоссарий/i.test(path + " " + docTitle(path, text))) continue;
    for (const line of String(text).split("\n")) {
      const m = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
      if (!m || /^-+$/.test(m[1]) || /^термин$/i.test(m[1])) continue;
      out.push({ path, term: plainText(m[1], resolve), meaning: plainText(m[2], resolve) });
    }
  }
  return out;
}

// searchProject — всё, что есть в проекте по слову: термины глоссария,
// механизмы, элементы, диаграммы и документы. У каждого — короткое
// объяснение, чтобы понять, не открывая.
export function searchProject(dump, files, paths, raw, limit = 40) {
  const q = String(raw || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  const has = (s) => String(s || "").toLowerCase().includes(q);
  const starts = (s) => String(s || "").toLowerCase().startsWith(q);
  // Ссылки [[…]] в подсказках — настоящими названиями, а не id.
  const resolve = (ref) => {
    if (ref.kind === "view") return dump?.views?.[ref.target]?.title;
    if (ref.kind === "file") return files[ref.target] !== undefined ? docTitle(ref.target, files[ref.target]) : "";
    if (ref.kind === "adr") {
      const p = adrPath(paths, ref.target);
      return p ? docTitle(p, files[p]) : "";
    }
    return dump?.elements?.[ref.target]?.title;
  };

  for (const g of glossaryRows(files, resolve)) {
    if (has(g.term) || has(g.meaning)) {
      out.push({ kind: "term", score: starts(g.term) ? 0 : has(g.term) ? 1 : 4, title: g.term, hint: g.meaning, path: g.path });
    }
  }
  const tags = Object.keys(dump?.specification?.tags || {});
  for (const tag of tags) {
    const info = tagInfo(files, paths, tag);
    if (has(tag) || has(info.title) || has(info.summary)) {
      out.push({ kind: "concept", score: has(info.title) || has(tag) ? 1 : 4, title: info.title, hint: info.summary, path: info.path, tag });
    }
  }
  for (const e of Object.values(dump?.elements || {})) {
    const desc = richText(e.description);
    if (has(e.title) || has(e.id) || has(e.technology) || has(desc)) {
      out.push({
        kind: "element",
        score: starts(e.title) ? 1 : has(e.title) || has(e.id) ? 2 : 5,
        title: e.title || e.id,
        hint: has(desc) && !has(e.title) ? snippetAround(desc, q, resolve) : plainText(desc.split(/\n\s*\n/)[0], resolve),
        id: e.id,
      });
    }
  }
  for (const v of viewList(dump)) {
    if (has(v.title) || has(v.id) || has(v.description)) {
      out.push({ kind: "view", score: has(v.title) ? 2 : 5, title: v.title, hint: v.description, id: v.id, type: v.type });
    }
  }
  const conceptPaths = new Set(out.filter((r) => r.kind === "concept").map((r) => r.path));
  for (const p of paths) {
    if (fileKind(p) !== "md" && fileKind(p) !== "mmd") continue;
    if (conceptPaths.has(p)) continue; // механизм уже в списке — с пояснением
    const text = frontMatter(files[p] || "").body;
    const title = docTitle(p, files[p] || "");
    if (has(title) || has(text)) {
      out.push({ kind: "doc", score: has(title) ? 2 : 6, title, hint: snippetAround(text, q, resolve), path: p });
    }
  }
  return out.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, "ru")).slice(0, limit);
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
