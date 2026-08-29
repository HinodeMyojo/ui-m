// API модуля «Японский» — docs/japanese-module.md (back-m).
// Отдельный файл, как sportApi.js и roadmapApi.js.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const JP = `${API_BASE_URL}/api/v1/japanese`;

async function request(path, options = {}) {
  const response = await authorizedFetch(`${JP}${path}`, options);
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

const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body ?? {}) });

// --- Сводка и сессии ---

export const fetchJpOverview = () => request("/overview");

export const startJpSession = (body) => post("/session", body);

// Идентификатор ответа делает запись идемпотентной: повтор при плохой связи
// не считается дважды. На нём же будет держаться офлайн-очередь (этап 4),
// поэтому он генерируется на клиенте и переживает повторную отправку.
export function jpClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const answerJpCard = (body) => post("/answer", body);

export const finishJpSession = (id, body) => post(`/session/${id}/finish`, body);

// --- Наборы ---

export const fetchJpDecks = () => request("/decks");
export const createJpDeck = (body) => post("/decks", body);
export const updateJpDeck = (id, body) => put(`/decks/${id}`, body);
export const deleteJpDeck = (id) => request(`/decks/${id}`, { method: "DELETE" });
export const addJpKanjiByText = (id, text) => post(`/decks/${id}/kanji-text`, { text });

// --- Справочник и настройки ---

export const fetchJpKanji = (char) => request(`/kanji/${encodeURIComponent(char)}`);

// Разбор вставленной строки целиком: какие в ней кандзи и слова и что из
// этого уже учится. Первый знак строки — не разбор.
export const analyzeJpText = (text) => post("/analyze", { text });
export const fetchJpSettings = () => request("/settings");
export const saveJpSettings = (body) => put("/settings", body);

// --- Механики: коды приходят с сервера вместе с карточкой ---

export const JP_MECH_MEANING = "meaning-choice";
export const JP_MECH_READING = "reading-input";
export const JP_MECH_BUILD = "build-from-keys";

// Оценки FSRS. На телефоне из них видны три: «не знал» ставится самим фактом
// ошибки, спрашивать после неё ещё и уверенность бессмысленно.
export const JP_RATING_AGAIN = 1;
export const JP_RATING_HARD = 2;
export const JP_RATING_GOOD = 3;
export const JP_RATING_EASY = 4;

// Названия типов единиц — в подписях карточки.
export function jpItemLabel(itemType) {
  return { radical: "Ключ", kanji: "Кандзи", word: "Слово" }[itemType] || "";
}

// Нормализация ответа-чтения: сравнивать надо каной, а разница между ハ и は
// или лишний пробел ответом не является.
export function jpNormalizeReading(value) {
  return jpKatakanaToHiragana(String(value || ""))
    .replace(/[\s.\-・ー]/g, "")
    .trim();
}

// Катакана и хирагана — одно и то же чтение. KANJIDIC2 держит оны катаканой,
// а вводить их пользователь будет хираганой со своей клавиатуры.
export function jpKatakanaToHiragana(value) {
  return String(value || "").replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

// Пути черт KanjiVG нарисованы в квадрате 109×109 — это его размер, а не
// произвольная константа вьюпорта.
export const JP_STROKE_BOX = 109;
