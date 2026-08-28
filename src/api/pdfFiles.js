// Библиотека PDF — docs/pdf-library.md (back-m).

const API_BASE_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//82.202.136.167:5005`;

const PDF = `${API_BASE_URL}/api/v1/pdfs`;

// Сервер объясняет, что пошло не так, в теле ответа — «API Error 500» вместо
// «не удалось создать каталог /app/uploads/pdfs» помогает примерно никак.
async function apiError(response) {
  let message = "";
  try {
    const data = await response.json();
    message = data.error || data.message || "";
  } catch {
    message = "";
  }
  const error = new Error(message || `Ошибка ${response.status}`);
  error.status = response.status;
  return error;
}

async function authorizedFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function jsonRequest(url, method, body) {
  return authorizedFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

// --- Файлы ---

export async function getPdfFiles(filter = {}) {
  const params = new URLSearchParams();
  if (filter.categoryId) params.set("categoryId", filter.categoryId);
  if (filter.query) params.set("q", filter.query);
  if (filter.tag) params.set("tag", filter.tag);
  if (filter.status) params.set("status", filter.status);
  if (filter.favorite) params.set("favorite", "true");
  if (filter.archived) params.set("archived", "true");
  if (filter.sort) params.set("sort", filter.sort);
  const qs = params.toString();
  return authorizedFetch(qs ? `${PDF}?${qs}` : PDF);
}

export const getPdfDetails = (id) => authorizedFetch(`${PDF}/${id}`);

// Карточку при открытии книги спрашивают сразу три композабла (позиция, закладки,
// выделения). Держим ответ несколько секунд, чтобы не ходить на сервер трижды.
const detailsCache = new Map();
const DETAILS_TTL_MS = 5000;

export async function getPdfDetailsCached(id) {
  const cached = detailsCache.get(id);
  if (cached && Date.now() - cached.at < DETAILS_TTL_MS) return cached.promise;
  const promise = getPdfDetails(id);
  detailsCache.set(id, { at: Date.now(), promise });
  try {
    return await promise;
  } catch (e) {
    detailsCache.delete(id);
    throw e;
  }
}
export const updatePdfFile = (id, body) => jsonRequest(`${PDF}/${id}`, "PUT", body);
export const deletePdfFile = (id) => authorizedFetch(`${PDF}/${id}`, { method: "DELETE" });

export async function uploadPdfFile(file, categoryId) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", file);
  if (categoryId) formData.append("categoryId", categoryId);
  const response = await fetch(PDF, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (!response.ok) throw await apiError(response);
  return response.json();
}

// Перезалить файл в существующую карточку: прогресс, закладки и привязка к
// плану останутся на месте.
export async function replacePdfFile(id, file) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${PDF}/${id}/file`, {
    method: "PUT",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (!response.ok) throw await apiError(response);
}

export function getPdfDownloadUrl(id) {
  return `${PDF}/${id}/download`;
}

export function getPdfCoverUrl(id) {
  return `${PDF}/${id}/cover`;
}

// Обложку и файл отдаёт защищённая ручка, поэтому <img src> напрямую не годится:
// тянем блобом с токеном и показываем object-URL.
export async function fetchPdfCoverObjectUrl(id) {
  const token = localStorage.getItem("token");
  const response = await fetch(getPdfCoverUrl(id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) return "";
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// Имя, под которым книга ляжет на диск. У карточки обычно человеческое
// название, а у исходника — что-то вроде
// «Фундаментальный+подход+к+программной+архитектуре.+ [skladchik.org].pdf»;
// на диск кладём то, по чему книгу потом найдут глазами.
export function pdfSaveName(file) {
  const raw = String(file?.title || file?.filename || "book").trim();
  // Слэши, двоеточия и звёздочки в имени файла не переживут ни Windows, ни iOS.
  const safe = raw
    .replace(/[\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /\.pdf$/i.test(safe) ? safe : `${safe}.pdf`;
}

// Скачать книгу себе. Ручка закрыта токеном, поэтому обычной ссылкой не
// обойтись — забираем тело сами и отдаём браузеру готовый blob.
//
// onProgress зовут долей 0..1, пока сервер сообщил размер: сорокамегабайтная
// книга на мобильном интернете едет минуту, и кнопка без цифры выглядит
// зависшей. Если браузер не умеет читать тело потоком (Safari до 14.1), просто
// ждём blob целиком — прогресса не будет, скачивание будет.
export async function savePdfFile(file, onProgress) {
  const token = localStorage.getItem("token");
  const response = await fetch(getPdfDownloadUrl(file.id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw await apiError(response);

  // Content-Length разрешён к чтению из другого источника без отдельного
  // Access-Control-Expose-Headers — он в списке безопасных.
  const total = Number(response.headers.get("content-length")) || file.size || 0;
  let blob;
  if (response.body?.getReader && total > 0 && typeof onProgress === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(Math.min(1, loaded / total));
    }
    blob = new Blob(chunks, { type: "application/pdf" });
  } else {
    blob = await response.blob();
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdfSaveName(file);
  // Safari не жмёт на ссылку, которой нет в документе.
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Отзывать object-URL сразу нельзя: Safari не успевает забрать содержимое.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// --- Чтение ---

export const setPdfProgress = (id, body) => jsonRequest(`${PDF}/${id}/progress`, "POST", body);
export const setPdfCover = (id, dataUrl) => jsonRequest(`${PDF}/${id}/cover`, "PUT", { dataUrl });
export const setPdfBookmarks = (id, bookmarks) => jsonRequest(`${PDF}/${id}/bookmarks`, "PUT", { bookmarks });
export const setPdfAnnotations = (id, annotations) =>
  jsonRequest(`${PDF}/${id}/annotations`, "PUT", { annotations });
export const linkPdfRoadmapItem = (id, itemId) =>
  jsonRequest(`${PDF}/${id}/roadmap-item`, "PUT", { itemId: itemId || null });

// Позицию отправляем и при уходе со страницы: fetch там не всегда доживает.
export function sendPdfProgressBeacon(id, body) {
  try {
    const token = localStorage.getItem("token");
    const url = `${PDF}/${id}/progress`;
    // sendBeacon не умеет заголовки, поэтому обычный fetch с keepalive.
    fetch(url, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    /* уходим со страницы — жаловаться уже некому */
  }
}

// --- Категории ---

export const getPdfCategories = () => authorizedFetch(`${PDF}/categories`);
export const createPdfCategory = (body) => jsonRequest(`${PDF}/categories`, "POST", body);
export const updatePdfCategory = (id, body) => jsonRequest(`${PDF}/categories/${id}`, "PUT", body);
export const deletePdfCategory = (id) =>
  authorizedFetch(`${PDF}/categories/${id}`, { method: "DELETE" });

// --- Хелперы отображения ---

export function formatPdfSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function pdfStatusOf(file) {
  if (file.finishedAt) return "finished";
  if (file.currentPage > 1 || file.hoursRead > 0) return "reading";
  return "unread";
}

export const PDF_STATUSES = [
  { code: "", label: "Все" },
  { code: "reading", label: "Читаю" },
  { code: "unread", label: "Не начато" },
  { code: "finished", label: "Прочитано" },
];

export const PDF_SORTS = [
  { code: "recent", label: "Недавние" },
  { code: "added", label: "Новые в библиотеке" },
  { code: "title", label: "По названию" },
  { code: "progress", label: "По прогрессу" },
];

export function pdfLogicalToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
