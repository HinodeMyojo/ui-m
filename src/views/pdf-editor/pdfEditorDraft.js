// Черновик редактора в IndexedDB этого браузера.
//
// Час работы над сканом договора не должен пропасть из-за случайно закрытой
// вкладки или перезагрузки телефона. Черновик один: открыл новый файл —
// прежний черновик заменился.
//
// Исходные файлы пишутся один раз, отдельной записью на каждый: состояние
// страниц сохраняется после каждой правки, и перезаписывать вместе с ним
// сорокамегабайтную книгу было бы безумием. На сервер черновик не уходит.

const DB = "pdf-editor";
const VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
      if (!db.objectStoreNames.contains("sources")) db.createObjectStore("sources");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores, mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let result;
      Promise.resolve(fn(t)).then((r) => {
        result = r;
      }, reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

const req2promise = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

// Приватный режим Safari и выключенное хранилище кидают на первом же open —
// тогда черновика просто нет, редактор работает без него.
export async function loadDraft() {
  try {
    return await tx(["state", "sources"], "readonly", async (t) => {
      const state = await req2promise(t.objectStore("state").get("current"));
      if (!state) return null;
      const sources = [];
      for (const id of state.sourceIds || []) {
        const s = await req2promise(t.objectStore("sources").get(id));
        if (!s) return null;
        sources.push(s);
      }
      return { ...state, sources };
    });
  } catch {
    return null;
  }
}

export async function peekDraft() {
  try {
    return await tx(["state"], "readonly", (t) => req2promise(t.objectStore("state").get("current")));
  } catch {
    return null;
  }
}

export async function startDraft() {
  try {
    await tx(["state", "sources"], "readwrite", (t) => {
      t.objectStore("state").clear();
      t.objectStore("sources").clear();
    });
  } catch {
    /* без черновика */
  }
}

export async function putDraftSource(source) {
  try {
    await tx(["sources"], "readwrite", (t) => {
      t.objectStore("sources").put(
        {
          id: source.id,
          kind: source.kind,
          name: source.name,
          bytes: source.bytes,
          type: source.type || "",
          password: source.password || "",
        },
        source.id,
      );
    });
    return true;
  } catch {
    return false;
  }
}

export async function putDraftState(state) {
  try {
    await tx(["state"], "readwrite", (t) => {
      t.objectStore("state").put({ ...state, savedAt: Date.now() }, "current");
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearDraft() {
  return startDraft();
}
