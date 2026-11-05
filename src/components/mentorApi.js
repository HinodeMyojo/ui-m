// API модуля «N» — docs/mentor-module.md (back-m).
// Две стороны: владелец пары (с входом) и люди по ссылкам (без входа).

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";
import { WAY_HOST } from "@/components/mentorDates.mjs";

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
export const fetchMentorVisits = (id) => own(`/${id}/visits`);

// Ссылка — на свой домен. Запасная (/n/ на адресе планировщика) работает
// всегда, в том числе пока домен не заработал.
export const mentorLink = (token) => `https://${WAY_HOST}/${token}`;
export const mentorFallbackLink = (token) => `${window.location.origin}/n/${token}`;

// --- По ссылке ---

async function pub(token, path, options = {}) {
  return parse(
    await fetch(`${PUB}/${encodeURIComponent(token)}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    }),
  );
}

// Чем открыта страница — по этому владелец пары узнаёт устройство наставника.
// Chrome на Android прячет модель и версию системы из User-Agent и отдаёт их
// только так, у iPhone модель не узнать вовсе, но различим размер экрана.
let deviceHeaders = null;
async function deviceHints() {
  if (deviceHeaders) return deviceHeaders;
  const headers = { "X-Device-Screen": `${screen.width}x${screen.height}@${Math.round(devicePixelRatio * 100) / 100}` };
  try {
    const hints = await navigator.userAgentData?.getHighEntropyValues(["model", "platformVersion"]);
    // Не-латиница в заголовке уронила бы сам запрос страницы.
    const ascii = (s) => (s || "").replace(/[^\x20-\x7e]/g, "");
    if (ascii(hints?.model)) headers["X-Device-Model"] = ascii(hints.model);
    if (ascii(hints?.platformVersion)) headers["X-Device-Os"] = ascii(hints.platformVersion);
  } catch {
    // Подсказок нет — устройство узнается по User-Agent.
  }
  deviceHeaders = headers;
  return headers;
}

export const fetchWay = async (token) => pub(token, "", { headers: await deviceHints() });
export const createWayTask = (token, task) => pub(token, "/tasks", { method: "POST", body: JSON.stringify(task) });
export const updateWayTask = (token, id, task) =>
  pub(token, `/tasks/${id}`, { method: "PUT", body: JSON.stringify(task) });
export const deleteWayTask = (token, id) => pub(token, `/tasks/${id}`, { method: "DELETE" });
// count = null снимает отметку.
export const setWayMark = (token, taskId, date, count) =>
  pub(token, "/marks", { method: "PUT", body: JSON.stringify({ taskId, date, count }) });
export const setWayNote = (token, date, text) =>
  pub(token, "/notes", { method: "PUT", body: JSON.stringify({ date, text }) });
// Черновик новой рекомендации: пишется на ходу. keepalive — когда страницу
// закрывают: такой запрос браузер доносит и после ухода со страницы.
export const saveWayDraft = (token, id, draft, keepalive = false) =>
  pub(token, `/drafts/${id}`, { method: "PUT", body: JSON.stringify(draft), keepalive });
export const deleteWayDraft = (token, id) => pub(token, `/drafts/${id}`, { method: "DELETE" });
