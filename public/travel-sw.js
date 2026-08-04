// Service worker модуля «Путешествия».
//
// Кэшируем данные, а не карту: тайлы мы принципиально не выкачиваем.
// Без сети поездка, дни, точки, описания и билеты открываются из кэша,
// карта при этом остаётся пустой подложкой с точками.
// Спецификация: docs/travel-module.md, раздел 4 («Офлайн»).

const SHELL_CACHE = "travel-shell-v1";
const DATA_CACHE = "travel-data-v1";

// Что относится к путешествиям — только это и кэшируем.
const TRAVEL_API = /\/api\/v1\/(travel|trips)\//;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/", "/index.html"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Тайлы карты не трогаем: качать их пачками нельзя, да и незачем.
  if (/tile\.openstreetmap|arcgisonline|opentopomap/.test(url.hostname)) return;

  if (request.method === "GET" && TRAVEL_API.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Изменения без сети складываем в очередь: отправим, когда связь вернётся.
  if (request.method !== "GET" && TRAVEL_API.test(url.pathname)) {
    event.respondWith(mutationWithQueue(request));
    return;
  }

  // Навигация: без сети отдаём оболочку приложения.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html")),
    );
  }
});

// Свежие данные важнее кэша, но кэш выручает, когда сети нет.
async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      // Помечаем ответ, чтобы интерфейс мог сказать «показываю сохранённое».
      const headers = new Headers(cached.headers);
      headers.set("X-From-Cache", "1");
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    throw error;
  }
}

async function mutationWithQueue(request) {
  try {
    return await fetch(request.clone());
  } catch (error) {
    await enqueue(request);
    // Отвечаем «принято»: интерфейс не должен спотыкаться из-за метро.
    return new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Очередь живёт в IndexedDB: правки, сделанные без сети, не должны теряться.
const DB_NAME = "travel-queue";
const STORE = "requests";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueue(request) {
  const db = await openDb();
  const body = await request.clone().text();
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({
      url: request.url,
      method: request.method,
      headers,
      body,
      at: Date.now(),
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Как только связь вернулась — досылаем накопленное по порядку.
self.addEventListener("message", (event) => {
  if (event.data === "flush-queue") event.waitUntil(flushQueue());
});

async function flushQueue() {
  const db = await openDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  let sent = 0;
  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
      });
      if (!response.ok && response.status < 500) {
        // Сервер отказал по существу — повторять бессмысленно, выкидываем.
        await removeItem(db, item.id);
        continue;
      }
      if (!response.ok) break; // сервер лежит — попробуем позже
      await removeItem(db, item.id);
      sent++;
    } catch {
      break; // сети всё ещё нет
    }
  }

  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: "queue-flushed", sent }));
}

function removeItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
