// Обёртка над потоком разбора LikeC4: обещания вместо сообщений и защита
// от устаревших ответов — пока печатаешь, сборки обгоняют друг друга, и
// показывать нужно только последнюю.

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./likec4.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data || {};
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || "поток разбора упал"));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

function call(type, payload) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type, payload });
  });
}

let buildSeq = 0;

// buildModel разбирает файлы проекта. Если пока шёл разбор, запросили новый,
// старый результат выбрасывается: возвращается null.
export async function buildModel(files) {
  const mine = ++buildSeq;
  const plain = {};
  for (const [path, text] of Object.entries(files)) plain[path] = String(text ?? "");
  const result = await call("build", { files: plain });
  return mine === buildSeq ? result : null;
}

export const editFromDiagram = (viewId, change) => call("edit", { viewId, change });
export const locateInSource = (params) => call("locate", params);

// applyTextEdits применяет правки LSP (строки и символы с нуля) к тексту.
// Идём с конца: правка ближе к началу не сдвигает те, что дальше.
export function applyTextEdits(text, edits) {
  const lines = text.split("\n");
  const offset = (pos) => {
    let o = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) o += lines[i].length + 1;
    return o + pos.character;
  };
  const sorted = [...edits].sort((a, b) => offset(b.range.start) - offset(a.range.start));
  let out = text;
  for (const e of sorted) {
    out = out.slice(0, offset(e.range.start)) + e.newText + out.slice(offset(e.range.end));
  }
  return out;
}
