// Термины проекта: механизмы (метки модели с описанием в concepts/) и строки
// глоссария. Для термина собирается, где он применяется: блоки и связи с его
// меткой, шаги сценариев (метку они наследуют от связи модели) и все места,
// где он упомянут текстом. Список строится сам — руками в глоссарий ничего
// дописывать не надо.
import { docTitle, fileKind, frontMatter, plainText, REF_RE, richText, tagInfo, viewList } from "./archModel.js";

const CONCEPT_LINK = /\[\[file:(concepts\/[^\]|]+?)(?:\|[^\]]*)?\]\]/;

// glossaryTable — строки таблиц глоссария как есть, с разметкой.
function glossaryTable(files) {
  const out = [];
  for (const [path, text] of Object.entries(files)) {
    if (fileKind(path) !== "md") continue;
    if (!/glossary|глоссарий/i.test(path + " " + docTitle(path, text))) continue;
    for (const line of String(text).split("\n")) {
      const m = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
      if (!m || /^:?-+:?$/.test(m[1]) || /^термин$/i.test(m[1].trim())) continue;
      out.push({ path, term: m[1], meaning: m[2] });
    }
  }
  return out;
}

// Название из глоссария «withhold / release», «RRN, UTRN, oper_id» — это
// несколько слов-синонимов.
function splitNames(raw) {
  return plainText(raw)
    .split(/\s*[/,;]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

// Слова в скобках из заголовка механизма: «Защита от повторов (идемпотентность)».
function parenWords(title) {
  return [...String(title).matchAll(/\(([^)]+)\)/g)].flatMap((m) => splitNames(m[1]));
}

// termIndex — все термины проекта. Строка глоссария, которая ссылается на
// описание механизма, сливается с ним в один термин.
export function termIndex(dump, files, paths) {
  const terms = [];
  const byConcept = new Map();
  for (const tag of Object.keys(dump?.specification?.tags || {})) {
    const info = tagInfo(files, paths, tag);
    if (!info.path) continue;
    const t = {
      key: "tag:" + tag,
      kind: "concept",
      tag,
      title: info.title,
      short: info.summary,
      meaning: "",
      conceptPath: info.path,
      glossaryPath: "",
      aliases: [...new Set([tag, ...parenWords(info.title)])],
    };
    terms.push(t);
    byConcept.set(info.path, t);
  }
  for (const row of glossaryTable(files)) {
    const linked = CONCEPT_LINK.exec(row.meaning);
    const concept = linked ? byConcept.get(linked[1]) : null;
    const names = splitNames(row.term);
    if (concept) {
      concept.meaning = concept.meaning || plainText(row.meaning.replace(REF_RE, "")).replace(/[\s—–-]+$/, "");
      concept.glossaryPath = row.path;
      concept.aliases = [...new Set([...concept.aliases, ...names])];
      continue;
    }
    if (!names.length) continue;
    terms.push({
      key: "g:" + plainText(row.term),
      kind: "term",
      tag: "",
      title: plainText(row.term),
      short: plainText(row.meaning),
      meaning: "",
      conceptPath: "",
      glossaryPath: row.path,
      aliases: names,
    });
  }
  for (const t of terms) t.matchers = buildMatchers(t.aliases);
  return terms;
}

// findTerm — термин по ключу, названию или синониму.
export function findTerm(terms, raw) {
  const q = String(raw || "").trim().toLowerCase();
  if (!q) return null;
  return (
    terms.find((t) => t.key.toLowerCase() === q) ||
    terms.find((t) => t.title.toLowerCase() === q) ||
    terms.find((t) => t.aliases.some((a) => a.toLowerCase() === q)) ||
    terms.find((t) => t.matchers.some((m) => new RegExp(m.source, m.flags.replace("g", "")).test(raw))) ||
    null
  );
}

// --- Поиск упоминаний ---

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Слово с окончанием: «идемпотентность» найдёт и «идемпотентности».
// Короткие аббревиатуры (НК, DLQ) — только целиком и с тем же регистром.
function buildMatchers(aliases) {
  const out = [];
  for (const a of [...aliases].sort((x, y) => y.length - x.length)) {
    const acronym = /^[A-ZА-ЯЁ0-9_]{2,4}$/.test(a);
    const body = a
      .split(/\s+/)
      .map((w) => (/^[а-яё]{6,}$/i.test(w) ? esc(w.slice(0, -2)) + "[а-яё]*" : esc(w) + (acronym ? "" : "[\\p{L}\\d_-]*")))
      .join("\\s+");
    out.push(new RegExp("(?<![\\p{L}\\d_])" + body + (acronym ? "(?![\\p{L}\\d_])" : ""), acronym ? "gu" : "giu"));
  }
  return out;
}

// firstMatch — первое упоминание в тексте: {index, length}.
export function firstMatch(term, text) {
  let best = null;
  for (const re of term.matchers) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = { index: m.index, length: m[0].length };
  }
  return best;
}

// snippet — кусок текста вокруг упоминания, само упоминание отдельно, чтобы
// подсветить его.
function snippet(text, hit, width = 150) {
  if (!hit) return { before: text.length > width ? text.slice(0, width) + "…" : text, match: "", after: "" };
  const from = Math.max(0, hit.index - Math.floor(width / 3));
  const to = Math.min(text.length, hit.index + hit.length + Math.floor((width * 2) / 3));
  return {
    before: (from > 0 ? "…" : "") + text.slice(from, hit.index),
    match: text.slice(hit.index, hit.index + hit.length),
    after: text.slice(hit.index + hit.length, to) + (to < text.length ? "…" : ""),
  };
}

// termUsages — все места проекта, где применяется термин.
export function termUsages(dump, files, paths, term) {
  const resolve = (ref) => {
    if (ref.kind === "view") return dump?.views?.[ref.target]?.title;
    if (ref.kind === "file") return files[ref.target] !== undefined ? docTitle(ref.target, files[ref.target]) : "";
    return dump?.elements?.[ref.target]?.title;
  };
  const plain = (s) => plainText(s, resolve);
  const tagged = (tags) => !!term.tag && (tags || []).includes(term.tag);
  const title = (fqn) => dump?.elements?.[fqn]?.title || fqn;

  const elements = [];
  for (const e of Object.values(dump?.elements || {})) {
    const text = plain([richText(e.description), e.technology].filter(Boolean).join(" · "));
    const hit = firstMatch(term, text);
    if (tagged(e.tags) || hit) {
      elements.push({ id: e.id, title: e.title || e.id, how: tagged(e.tags) ? "метка" : "упоминание", snip: snippet(text, hit) });
    }
  }

  const relations = [];
  for (const r of Object.values(dump?.relations || {})) {
    const text = plain([r.title, r.technology, richText(r.description)].filter(Boolean).join(" · "));
    const hit = firstMatch(term, text);
    if (tagged(r.tags) || hit) {
      relations.push({
        id: r.id,
        source: r.source?.model,
        target: r.target?.model,
        from: title(r.source?.model),
        to: title(r.target?.model),
        how: tagged(r.tags) ? "метка" : "упоминание",
        snip: snippet(text, hit),
      });
    }
  }

  const steps = [];
  for (const v of viewList(dump)) {
    if (v.type !== "dynamic") continue;
    (dump.views[v.id]?.edges || []).forEach((edge, i) => {
      const text = plain([edge.label, richText(edge.notes), edge.technology, richText(edge.description)].filter(Boolean).join(" · "));
      const hit = firstMatch(term, text);
      if (tagged(edge.tags) || hit) {
        steps.push({
          viewId: v.id,
          viewTitle: v.title,
          n: i + 1,
          label: edge.label || "",
          how: tagged(edge.tags) ? "метка" : "упоминание",
          snip: snippet(text, hit),
        });
      }
    });
  }

  const docs = [];
  for (const p of paths) {
    if (fileKind(p) !== "md" || p === term.conceptPath || p === term.glossaryPath) continue;
    const lines = frontMatter(files[p] || "").body.split("\n");
    const hits = [];
    for (const line of lines) {
      const text = plain(line);
      const hit = text && firstMatch(term, text);
      if (hit) hits.push(snippet(text, hit));
      if (hits.length === 3) break;
    }
    if (hits.length) docs.push({ path: p, title: docTitle(p, files[p]), hits });
  }

  const byHow = (a, b) => (a.how === b.how ? 0 : a.how === "метка" ? -1 : 1);
  return {
    elements: elements.sort(byHow),
    relations: relations.sort(byHow),
    steps: steps.sort(byHow),
    docs,
    total: elements.length + relations.length + steps.length + docs.length,
  };
}

// conceptBody — описание механизма без заголовка и служебной строки «> Метка…»:
// заголовок и «простыми словами» карточка термина показывает сама.
export function conceptBody(text) {
  return frontMatter(text || "")
    .body.replace(/^#\s+.+\n?/m, "")
    .replace(/^>\s*Метк[^\n]*\n?/m, "")
    .replace(/^\*\*Простыми словами\.\*\*[^\n]*\n?/m, "")
    .trim();
}
