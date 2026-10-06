// API модуля «Опросы» — docs/survey-module.md (back-m).
// Две стороны: владелец (с входом) и тот, кто отвечает по ссылке (без входа).

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";
import { ensureFreshToken, getToken } from "@/components/session.js";

const SV = `${API_BASE_URL}/api/v1/surveys`;
const PUB = `${API_BASE_URL}/api/v1/public/surveys`;
const IMG = `${API_BASE_URL}/api/v1/public/survey-images`;

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
    error.closed = !!(data && data.closed);
    error.restart = !!(data && data.restart);
    throw error;
  }
  return data;
}

async function request(path, options = {}) {
  return parse(await authorizedFetch(`${SV}${path}`, options));
}

// --- Владелец ---

export const fetchSurveys = () => request("");
export const fetchSurvey = (id) => request(`/${id}`);

// definition — объект или строка JSON: сервер разбирает терпимо и
// возвращает опрос уже нормализованным.
function definitionBody(definition) {
  const text = typeof definition === "string" ? definition : JSON.stringify(definition);
  return `{"definition":${text}}`;
}

export const createSurvey = (definition) =>
  request("", { method: "POST", body: definitionBody(definition) });

export const updateSurvey = (id, definition) =>
  request(`/${id}`, { method: "PUT", body: definitionBody(definition) });

export const deleteSurvey = (id) => request(`/${id}`, { method: "DELETE" });

export const setSurveyClosed = (id, closed) =>
  request(`/${id}/closed`, { method: "POST", body: JSON.stringify({ closed }) });

export const regenerateSurveyLink = (id) => request(`/${id}/token`, { method: "POST" });

export const fetchSurveyResponses = (id) => request(`/${id}/responses`);

export const deleteSurveyResponse = (id, responseId) =>
  request(`/${id}/responses/${responseId}`, { method: "DELETE" });

export async function uploadSurveyImage(id, file) {
  const form = new FormData();
  form.append("file", await shrinkImage(file));
  // Мимо authorizedFetch: он ставит Content-Type JSON, а multipart браузер
  // должен подписать границей сам. Токен освежаем так же, как он.
  await ensureFreshToken();
  const token = getToken();
  return parse(
    await fetch(`${SV}/${id}/images`, {
      method: "POST",
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );
}

// --- Ссылка ---

export function surveyShareUrl(token) {
  return `${window.location.origin}/poll/${token}`;
}

// Картинка — либо id загруженной в опрос, либо внешний адрес.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function surveyImageSrc(ref) {
  if (!ref) return "";
  return UUID.test(ref) ? `${IMG}/${ref}` : ref;
}

// --- Отвечающий по ссылке ---

// Пропуск к своим ответам лежит в браузере, по ключу на каждый опрос: так
// человек возвращается к тем же ответам, а не начинает заново.
const respondentKey = (token) => `survey.respondent.${token}`;

export function respondentToken(token) {
  try {
    return localStorage.getItem(respondentKey(token)) || "";
  } catch {
    return "";
  }
}

export function setRespondentToken(token, value) {
  try {
    if (value) localStorage.setItem(respondentKey(token), value);
    else localStorage.removeItem(respondentKey(token));
  } catch {
    // Приватный режим — живём без памяти, ответы сохранит сервер.
  }
}

async function publicRequest(token, path, options = {}) {
  const pass = respondentToken(token);
  return parse(
    await fetch(`${PUB}/${token}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(pass ? { "X-Respondent-Token": pass } : {}),
        ...options.headers,
      },
    }),
  );
}

export const fetchPublicSurvey = (token) => publicRequest(token, "");

export async function startPublicSurvey(token, name) {
  const data = await publicRequest(token, "/start", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  setRespondentToken(token, data.respondentToken);
  return data.response;
}

// keepalive — чтобы запрос, отправленный при закрытии вкладки, долетел.
export const savePublicAnswers = (token, answers) =>
  publicRequest(token, "/answers", {
    method: "PUT",
    body: JSON.stringify({ answers }),
    keepalive: true,
  });

export const submitPublicAnswers = (token, answers) =>
  publicRequest(token, "/submit", { method: "POST", body: JSON.stringify({ answers }) });

// --- Картинки ---

const MAX_SIDE = 1600;
const KEEP_BELOW = 700 * 1024;

// shrinkImage ужимает фото с телефона до разумного: 12-мегапиксельный кадр
// весит 4–6 МБ, а в опросе он занимает пол-экрана. GIF не трогаем — канва
// убила бы анимацию; маленькие файлы тоже.
export async function shrinkImage(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return file;
  }
  const side = Math.max(bitmap.width, bitmap.height);
  if (side <= MAX_SIDE && file.size <= KEEP_BELOW) return file;

  const scale = Math.min(1, MAX_SIDE / side);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  // JPEG без прозрачности: подложка белая, иначе PNG-иконка станет чёрной.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob || blob.size >= file.size) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
