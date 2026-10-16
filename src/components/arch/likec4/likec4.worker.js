// Разбор модели LikeC4 в отдельном потоке. LikeC4 — это парсер на Langium
// плюс Graphviz в WebAssembly: разбор средней модели занимает сотни
// миллисекунд, и в основном потоке он подвешивал бы набор текста.
//
// Сообщения: { id, type, payload } → { id, ok, result | error }.
//   build  { files }               — разобрать и разложить, вернуть модель и ошибки
//   edit   { viewId, change }      — правка с диаграммы (цвет, форма, направление) → текстовые правки
//   locate { element | view | relation } — где в файлах объявлено
import { fromSources } from "@likec4/language-services/browser";

let current = null;

// Пути ошибок LikeC4 отдаёт по-разному: «virtual:/workspace/…» у документов и
// «\workspace\…» у ошибок (даже в браузере). Приводим к пути файла проекта.
function workspacePath(uri) {
  return decodeURIComponent(String(uri || ""))
    .replaceAll("\\", "/")
    .replace(/^.*?\/workspace\//, "");
}

function mapErrors(likec4) {
  return likec4.getErrors().map((e) => ({
    path: workspacePath(e.sourceFsPath),
    line: (e.range?.start?.line ?? e.line ?? -1) + 1,
    column: (e.range?.start?.character ?? 0) + 1,
    endLine: (e.range?.end?.line ?? e.range?.start?.line ?? e.line ?? -1) + 1,
    endColumn: (e.range?.end?.character ?? 0) + 1,
    message: String(e.message || "").split("\n")[0],
  }));
}

async function build({ files }) {
  const sources = {};
  for (const [path, text] of Object.entries(files || {})) {
    if (/\.(c4|likec4)$/i.test(path)) sources[path] = text;
  }
  if (current) {
    const old = current;
    current = null;
    old.dispose().catch(() => {});
  }
  if (Object.keys(sources).length === 0) return { errors: [], model: null };

  const likec4 = await fromSources(sources);
  current = likec4;
  const errors = mapErrors(likec4);
  let model = null;
  let layoutError = null;
  // С ошибками LikeC4 всё равно строит то, что разобрал: показывать
  // последнюю целую часть модели лучше, чем пустой экран.
  try {
    const layouted = await likec4.layoutedModel();
    model = layouted.$data;
  } catch (err) {
    layoutError = String(err?.message || err).split("\n")[0];
  }
  return { errors, model, layoutError };
}

// Правка с диаграммы: LikeC4 сам знает, куда в тексте вписать стиль, но
// пишет он через файловую систему, которой в браузере нет. Перехватываем
// запись и отдаём правки наружу — сохранит их страница.
async function edit({ viewId, change }) {
  if (!current) throw new Error("модель ещё не разобрана");
  const editor = current.languageServices.editor;
  let captured = null;
  editor.applyTextEdits = async (doc, edits) => {
    captured = { path: workspacePath(doc.uri.toString()), edits };
    return true;
  };
  const res = await editor.applyChange({ viewId, change });
  if (!res.success) throw new Error(res.error || "правка не применилась");
  return captured;
}

function locate(params) {
  if (!current) return null;
  const loc = current.languageServices.locate(params);
  if (!loc) return null;
  return { path: workspacePath(loc.uri), range: loc.range };
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  try {
    let result;
    if (type === "build") result = await build(payload);
    else if (type === "edit") result = await edit(payload);
    else if (type === "locate") result = locate(payload);
    else throw new Error("неизвестная команда " + type);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
