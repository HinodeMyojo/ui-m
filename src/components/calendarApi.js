// API раздела «Календарь»: события и сверка с Google Calendar.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const BASE = `${API_BASE_URL}/api/v1/calendar`;
const WORKSPACE = `${API_BASE_URL}/api/v1/workspace`;

async function request(url, options = {}) {
  const response = await authorizedFetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `ошибка запроса (${response.status})`);
  }
  return data;
}

// События, пересекающие [from, to): даты YYYY-MM-DD.
export const fetchCalendarEvents = (from, to) =>
  request(`${BASE}/events?from=${from}&to=${to}`);

// Создание: если задан repeat — вернётся вся серия.
export const createCalendarEvent = (event) =>
  request(`${BASE}/events`, { method: "POST", body: JSON.stringify(event) });

// Правка: только переданные поля. series — всей серии.
export const updateCalendarEvent = (id, patch, series = false) =>
  request(`${BASE}/events/${id}${series ? "?series=1" : ""}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });

export const deleteCalendarEvent = (id, series = false) =>
  request(`${BASE}/events/${id}${series ? "?series=1" : ""}`, { method: "DELETE" });

export const fetchCalendarStatus = () => request(`${BASE}/status`);

export const syncCalendarNow = () => request(`${BASE}/sync`, { method: "POST" });

// Подключение Google — общая с доской дня авторизация: один доступ на оба
// раздела. Google возвращает на redirectUri с ?code=…
export const fetchGoogleAuthUrl = (redirectUri) =>
  request(`${WORKSPACE}/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`);

export const exchangeGoogleCode = (code, redirectUri) =>
  request(`${WORKSPACE}/google/exchange`, {
    method: "POST",
    body: JSON.stringify({ code, redirectUri }),
  });

export const setGoogleCalendarId = (calendarId) =>
  request(`${WORKSPACE}/google/calendar`, {
    method: "PUT",
    body: JSON.stringify({ calendarId }),
  });

export const disconnectGoogle = () => request(`${WORKSPACE}/google`, { method: "DELETE" });
