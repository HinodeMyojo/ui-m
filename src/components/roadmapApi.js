// API модуля «Roadmap» — docs/roadmap-module.md (back-m).
// Отдельный файл, как sportApi.js: ручек много, и с остальным приложением
// они не переплетаются.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const RM = `${API_BASE_URL}/api/v1/roadmap`;

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
export function roadmapToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- Roadmap'ы ---

export const fetchRoadmaps = () => request(RM);
export const createRoadmap = (body) => post(RM, body);
export const updateRoadmap = (id, body) => put(`${RM}/${id}`, body);
export const deleteRoadmap = (id) => del(`${RM}/${id}`);

export const fetchRoadmapFull = (id, today = roadmapToday()) =>
  request(`${RM}/${id}/full?today=${today}`);
export const fetchRoadmapStats = (id, today = roadmapToday()) =>
  request(`${RM}/${id}/stats?today=${today}`);
export const fetchRoadmapFeeds = (id) => request(`${RM}/${id}/feeds`);
export const fetchRoadmapBacklog = (id) => request(`${RM}/${id}/backlog`);
export const fetchRoadmapToday = (today = roadmapToday()) =>
  request(`${RM}/today?today=${today}`);
export const seedRoadmap = () => post(`${RM}/seed`);

// --- Кварталы и бенчмарки ---

export const createQuarter = (roadmapId, body) => post(`${RM}/${roadmapId}/quarters`, body);
export const updateQuarter = (id, body) => put(`${RM}/quarters/${id}`, body);
export const deleteQuarter = (id) => del(`${RM}/quarters/${id}`);

export const createBenchmark = (quarterId, body) => post(`${RM}/quarters/${quarterId}/benchmarks`, body);
export const updateBenchmark = (id, body) => put(`${RM}/benchmarks/${id}`, body);
export const deleteBenchmark = (id) => del(`${RM}/benchmarks/${id}`);

// --- Пункты ---

export const createItem = (roadmapId, body) => post(`${RM}/${roadmapId}/items`, body);
export const updateItem = (id, body) => put(`${RM}/items/${id}`, body);
export const deleteItem = (id) => del(`${RM}/items/${id}`);
export const reorderItems = (items) => post(`${RM}/items/reorder`, { items });
export const setItemProgress = (id, body) => post(`${RM}/items/${id}/progress`, body);
export const createTaskForItem = (id, withSubtasks = true) =>
  post(`${RM}/items/${id}/task`, { withSubtasks });

export const createSubItem = (itemId, body) => post(`${RM}/items/${itemId}/sub-items`, body);
export const updateSubItem = (id, body) => put(`${RM}/sub-items/${id}`, body);
export const deleteSubItem = (id) => del(`${RM}/sub-items/${id}`);

// --- Сессии чтения ---

export const fetchSessions = (itemId) => request(`${RM}/items/${itemId}/sessions`);
export const createSession = (itemId, body) => post(`${RM}/items/${itemId}/sessions`, body);
export const updateSession = (id, body) => put(`${RM}/sessions/${id}`, body);
export const deleteSession = (id) => del(`${RM}/sessions/${id}`);

// --- Справочники отображения ---

export const ITEM_TYPES = [
  { code: "book", label: "Книга", emoji: "📘" },
  { code: "paper", label: "Статья", emoji: "📄" },
  { code: "standard", label: "Стандарт", emoji: "⚖️" },
  { code: "course", label: "Курс", emoji: "🎓" },
  { code: "cert", label: "Сертификация", emoji: "🎖️" },
  { code: "project", label: "Pet-проект", emoji: "🛠️" },
  { code: "feed", label: "Источник", emoji: "📰" },
  { code: "other", label: "Другое", emoji: "📎" },
];

export const STATUSES = [
  { code: "planned", label: "Не начат", color: "#5b616e" },
  { code: "in_progress", label: "Читаю", color: "#4aa8ff" },
  { code: "done", label: "Готово", color: "#63c94f" },
  { code: "paused", label: "Отложен", color: "#ffd666" },
  { code: "skipped", label: "Пропущен", color: "#7a7f8e" },
];

export const FEED_KINDS = [
  { code: "blog", label: "Блоги", emoji: "🌐" },
  { code: "newsletter", label: "Рассылки", emoji: "📬" },
  { code: "podcast", label: "Подкасты", emoji: "🎙️" },
  { code: "youtube", label: "YouTube", emoji: "▶️" },
  { code: "conference", label: "Конференции", emoji: "🎤" },
  { code: "telegram", label: "Telegram", emoji: "✈️" },
  { code: "repo", label: "Репозитории", emoji: "💻" },
];

export const CERT_VERDICTS = [
  { code: "take", label: "Берём", color: "#63c94f" },
  { code: "optional", label: "Опционально", color: "#ffd666" },
  { code: "skip", label: "Пропускаем", color: "#7a7f8e" },
];

export function statusMeta(code) {
  return STATUSES.find((s) => s.code === code) || STATUSES[0];
}

export function typeMeta(code) {
  return ITEM_TYPES.find((t) => t.code === code) || ITEM_TYPES[ITEM_TYPES.length - 1];
}

export function feedKindMeta(code) {
  return FEED_KINDS.find((k) => k.code === code) || { code, label: "Прочее", emoji: "🔖" };
}

export function percent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

// Месяц словами: «авг 2026» — в таймлайне даты нужны короткие.
const SHORT_MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function shortMonth(isoDate) {
  if (!isoDate) return "";
  const [y, m] = isoDate.split("-");
  return `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

export function formatHours(value) {
  const hours = Math.round((value || 0) * 10) / 10;
  return `${hours} ч`;
}
