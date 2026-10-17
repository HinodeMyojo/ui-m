// API хаба — общая ветка планов, docs/hub-module.md (back-m).
// Отдельный файл, как ventureApi.js: ручек много, и с остальным приложением
// они не переплетаются.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";
import { ensureFreshToken, getToken } from "@/components/session.js";

const HUB = `${API_BASE_URL}/api/v1/hub`;

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

const post = (url, body) => request(url, { method: "POST", body: JSON.stringify(body ?? {}) });
const put = (url, body) => request(url, { method: "PUT", body: JSON.stringify(body ?? {}) });
const del = (url) => request(url, { method: "DELETE" });

export const fetchHubBoard = () => request(HUB);
export const fetchHubPlan = (nodeId) => request(`${HUB}/nodes/${nodeId}/plan`);

export const createHubNode = (body) => post(`${HUB}/nodes`, body);
export const updateHubNode = (id, patch) => put(`${HUB}/nodes/${id}`, patch);
export const deleteHubNode = (id) => del(`${HUB}/nodes/${id}`);
export const saveHubPositions = (items) => post(`${HUB}/positions`, { items });
export const reorderHubNodes = (ids) => post(`${HUB}/order`, { ids });

export const fetchHubTargets = (q) => request(`${HUB}/targets?q=${encodeURIComponent(q || "")}`);
export const createHubLink = (nodeId, body) => post(`${HUB}/nodes/${nodeId}/links`, body);
export const deleteHubLink = (id) => del(`${HUB}/links/${id}`);

export const updateHubFile = (id, patch) => put(`${HUB}/files/${id}`, patch);
export const deleteHubFile = (id) => del(`${HUB}/files/${id}`);
export const markHubFileOpened = (id) => post(`${HUB}/files/${id}/opened`);
export const fetchHubState = (id) => request(`${HUB}/files/${id}/state`);
export const saveHubState = (id, data) => put(`${HUB}/files/${id}/state`, { data });
export const resetHubState = (id) => del(`${HUB}/files/${id}/state`);

// Загрузка идёт формой мимо authorizedFetch: тот ставит JSON-заголовок, а
// границу multipart браузер должен проставить сам.
export async function uploadHubFiles(nodeId, files) {
  await ensureFreshToken();
  const form = new FormData();
  for (const file of files) form.append("file", file, file.name);
  const token = getToken();
  const response = await fetch(`${HUB}/nodes/${nodeId}/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `не удалось загрузить (${response.status})`);
  return data;
}

// Содержимое файла: HTML артефакта — текстом, картинку — blob'ом.
export async function fetchHubFileText(id) {
  const response = await authorizedFetch(`${HUB}/files/${id}/content`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `файл не открылся (${response.status})`);
  }
  return response.text();
}

export async function fetchHubFileBlob(id) {
  const response = await authorizedFetch(`${HUB}/files/${id}/content`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `файл не открылся (${response.status})`);
  }
  return response.blob();
}

export const HUB_KINDS = [
  { key: "stage", label: "Ступень", icon: "🪜" },
  { key: "topic", label: "Тема", icon: "🧩" },
  { key: "book", label: "Учебник", icon: "📗" },
  { key: "chapter", label: "Глава", icon: "📄" },
  { key: "note", label: "Заметка", icon: "📝" },
];

export const HUB_KIND_ICON = {
  plan: "🪐",
  stage: "🪜",
  topic: "🧩",
  book: "📗",
  chapter: "📄",
  note: "📝",
};

export const HUB_STATUSES = [
  { key: "todo", label: "Впереди", mark: "○" },
  { key: "active", label: "В работе", mark: "◐" },
  { key: "done", label: "Пройдено", mark: "✓" },
  { key: "paused", label: "Пауза", mark: "⏸" },
];

export const percent = (p) => Math.round((p || 0) * 100);

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
