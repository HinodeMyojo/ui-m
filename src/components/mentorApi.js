// API модуля «N» — docs/mentor-module.md (back-m).
// Две стороны: владелец пары (с входом) и люди по ссылкам (без входа).

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const OWN = `${API_BASE_URL}/api/v1/mentor/pairs`;
const PUB = `${API_BASE_URL}/api/v1/public/mentor`;

async function parse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error((data && data.error) || `ошибка запроса (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// --- Владелец ---

const own = async (path, options = {}) => parse(await authorizedFetch(`${OWN}${path}`, options));

export const fetchMentorPairs = () => own("");
export const createMentorPair = (names) => own("", { method: "POST", body: JSON.stringify(names) });
export const updateMentorPair = (id, names) => own(`/${id}`, { method: "PUT", body: JSON.stringify(names) });
export const regenerateMentorLinks = (id) => own(`/${id}/tokens`, { method: "POST" });
export const deleteMentorPair = (id) => own(`/${id}`, { method: "DELETE" });

export const mentorLink = (token) => `${window.location.origin}/n/${token}`;

// --- По ссылке ---

async function pub(token, path, options = {}) {
  return parse(
    await fetch(`${PUB}/${encodeURIComponent(token)}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

export const fetchWay = (token) => pub(token, "");
export const createWayTask = (token, task) => pub(token, "/tasks", { method: "POST", body: JSON.stringify(task) });
export const updateWayTask = (token, id, task) =>
  pub(token, `/tasks/${id}`, { method: "PUT", body: JSON.stringify(task) });
export const deleteWayTask = (token, id) => pub(token, `/tasks/${id}`, { method: "DELETE" });
// count = null снимает отметку.
export const setWayMark = (token, taskId, date, count) =>
  pub(token, "/marks", { method: "PUT", body: JSON.stringify({ taskId, date, count }) });
export const setWayNote = (token, date, text) =>
  pub(token, "/notes", { method: "PUT", body: JSON.stringify({ date, text }) });
