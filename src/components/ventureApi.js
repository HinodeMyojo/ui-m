// API модуля «Дорожная карта проекта» — docs/venture-module.md (back-m).
// Отдельный файл, как roadmapApi.js: ручек много, и с остальным приложением
// они не переплетаются.
//
// Не путать с roadmapApi.js: тот про учёбу (книги, курсы, часы чтения),
// этот — про разработку бизнеса.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const VT = `${API_BASE_URL}/api/v1/venture`;

async function request(url, options = {}) {
  const response = await authorizedFetch(url, options);
  if (!response.ok) {
    let message = "";
    try {
      const data = await response.json();
      message = data.error || data.message || "";
    } catch {
      message = "";
    }
    throw new Error(message || `ошибка запроса (${response.status})`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function post(url, body) {
  return request(url, { method: "POST", body: JSON.stringify(body ?? {}) });
}

function put(url, body) {
  return request(url, { method: "PUT", body: JSON.stringify(body ?? {}) });
}

function del(url) {
  return request(url, { method: "DELETE" });
}

// Логическая дата клиента: сервер сам её не знает (часовые пояса, ночные заходы).
export function ventureToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- Проекты ---

export const fetchVentures = () => request(VT);
export const createVenture = (body) => post(VT, body);
export const updateVenture = (id, body) => put(`${VT}/${id}`, body);
export const deleteVenture = (id) => del(`${VT}/${id}`);

export const fetchVentureFull = (id, today = ventureToday()) =>
  request(`${VT}/${id}/full?today=${today}`);
export const fetchVentureStats = (id, today = ventureToday()) =>
  request(`${VT}/${id}/stats?today=${today}`);
export const fetchVentureWidget = (today = ventureToday()) =>
  request(`${VT}/widget?today=${today}`);

// --- Направления ---

export const createLane = (ventureId, body) => post(`${VT}/${ventureId}/lanes`, body);
export const updateLane = (id, body) => put(`${VT}/lanes/${id}`, body);
export const deleteLane = (id) => del(`${VT}/lanes/${id}`);

// --- Полосы времени ---

export const createPeriod = (ventureId, body) => post(`${VT}/${ventureId}/periods`, body);
export const generatePeriods = (ventureId, body) =>
  post(`${VT}/${ventureId}/periods/generate`, body);
export const updatePeriod = (id, body) => put(`${VT}/periods/${id}`, body);
export const deletePeriod = (id) => del(`${VT}/periods/${id}`);

// --- Узлы ---

export const createNode = (ventureId, body) => post(`${VT}/${ventureId}/nodes`, body);
export const updateNode = (id, body) => put(`${VT}/nodes/${id}`, body);
export const deleteNode = (id) => del(`${VT}/nodes/${id}`);
export const savePositions = (items) => post(`${VT}/nodes/positions`, { items });
export const attachTasks = (nodeId, taskIds) => post(`${VT}/nodes/${nodeId}/tasks`, { taskIds });
export const detachTask = (taskId) => del(`${VT}/tasks/${taskId}`);

// --- Связи ---

export const createLink = (ventureId, body) => post(`${VT}/${ventureId}/links`, body);
export const updateLink = (id, body) => put(`${VT}/links/${id}`, body);
export const deleteLink = (id) => del(`${VT}/links/${id}`);

// --- Черновики задач ---

export const createDraft = (nodeId, body) => post(`${VT}/nodes/${nodeId}/drafts`, body);
export const updateDraft = (id, body) => put(`${VT}/drafts/${id}`, body);
export const deleteDraft = (id) => del(`${VT}/drafts/${id}`);
export const takeDraft = (id, body) => post(`${VT}/drafts/${id}/take`, body);
export const fetchPendingDrafts = (ventureId = "", until = "") => {
  const params = new URLSearchParams();
  if (ventureId) params.set("ventureId", ventureId);
  if (until) params.set("until", until);
  const query = params.toString();
  return request(query ? `${VT}/drafts/pending?${query}` : `${VT}/drafts/pending`);
};

// --- Импорт и экспорт карты ---

export const exportMap = (id) => request(`${VT}/${id}/map`);
export const importMap = (id, body) => post(`${VT}/${id}/map`, body);
export const importNewMap = (body) => post(`${VT}/map`, body);

// --- Справочники и мелкие помощники ---

export const VENTURE_STATUSES = [
  { code: "idea", title: "Идея", color: "#94a3b8" },
  { code: "active", title: "В работе", color: "#a855f7" },
  { code: "launched", title: "Запущен", color: "#22c55e" },
  { code: "frozen", title: "Заморожен", color: "#64748b" },
  { code: "closed", title: "Закрыт", color: "#475569" },
];

export const NODE_STATUSES = [
  { code: "planned", title: "Планируется", color: "#64748b" },
  { code: "in_progress", title: "В работе", color: "#a855f7" },
  { code: "done", title: "Готово", color: "#22c55e" },
  { code: "frozen", title: "Заморожен", color: "#0ea5e9" },
  { code: "dropped", title: "Отменён", color: "#ef4444" },
];

export const LINK_KINDS = [
  { code: "hard", title: "Жёсткая (сплошная)" },
  { code: "soft", title: "Мягкая (пунктир)" },
];

export function ventureStatusMeta(code) {
  return VENTURE_STATUSES.find((s) => s.code === code) || VENTURE_STATUSES[0];
}

export function nodeStatusMeta(code) {
  return NODE_STATUSES.find((s) => s.code === code) || NODE_STATUSES[0];
}

export function percent(value) {
  const number = Number(value) || 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

// shortDate — «12 окт», чтобы даты не съедали ширину карточки узла.
const MONTHS_SHORT = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

export function shortDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${day} ${MONTHS_SHORT[month - 1]}`;
}

export function formatMoney(value, currency = "RUB") {
  const number = Number(value) || 0;
  if (!number) return "—";
  const signs = { RUB: "₽", USD: "$", EUR: "€" };
  return `${number.toLocaleString("ru-RU")} ${signs[currency] || currency}`;
}
