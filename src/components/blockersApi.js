// API напоминаний о блокерах — задачный телеграм-бот.
// Отдельный файл, как japaneseApi.js: свой раздел, своя ручка.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const BASE = `${API_BASE_URL}/api/v1/blockers`;

async function request(path, options = {}) {
  const response = await authorizedFetch(`${BASE}${path}`, options);
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

// Открытые блокеры обоих видов — из задач и с карточек дня — вместе с их
// напоминаниями.
export const fetchBlockers = () => request("");

// Правка напоминания: период, кого пнуть, включённость. Отсрочка (snoozeMin)
// двигает только ближайшее напоминание, период не трогает.
export const updateBlockerReminder = (source, id, body) =>
  request(`/${source}/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const resolveBlocker = (source, id, note = "") =>
  request(`/${source}/${id}/resolve`, { method: "POST", body: JSON.stringify({ note }) });

export const fetchBlockerSettings = () => request("/settings");

export const saveBlockerSettings = (body) =>
  request("/settings", { method: "PUT", body: JSON.stringify(body) });

// Периоды, которые предлагаются кнопками. Два часа — по умолчанию: блокер, о
// котором не напоминают, к вечеру исчезает из головы, а более частый шаг уже
// раздражает.
export const BLOCKER_PERIODS = [
  { min: 15, label: "15 мин" },
  { min: 30, label: "30 мин" },
  { min: 60, label: "1 ч" },
  { min: 120, label: "2 ч" },
  { min: 180, label: "3 ч" },
  { min: 240, label: "4 ч" },
  { min: 480, label: "8 ч" },
  { min: 1440, label: "сутки" },
];

// Отсрочки «не сейчас».
export const BLOCKER_SNOOZES = [
  { min: 120, label: "+2 ч" },
  { min: 180, label: "+3 ч" },
  { min: 240, label: "+4 ч" },
];

export function blockerPeriodLabel(minutes) {
  const known = BLOCKER_PERIODS.find((p) => p.min === minutes);
  if (known) return known.label;
  if (minutes % 60 === 0) return `${minutes / 60} ч`;
  return `${minutes} мин`;
}

// «через 40 мин», «через 2 ч», «уже пора» — точное время напоминания читать
// неудобно, а порядок понятен сразу.
export function blockerNextLabel(nextAt) {
  if (!nextAt) return "";
  const diff = new Date(nextAt).getTime() - Date.now();
  if (diff <= 0) return "вот-вот";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `через ${minutes} мин`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `через ${hours} ч`;
  return `через ${Math.round(hours / 24)} дн`;
}

export function blockerAgeLabel(hours) {
  if (hours < 1) return "меньше часа";
  if (hours < 48) return `${hours} ч`;
  return `${Math.round(hours / 24)} дн`;
}
