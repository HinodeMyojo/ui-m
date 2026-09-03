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
export const fetchJpGrid = () => request("/grid");
export const fetchJpAchievements = () => request("/achievements");
export const importJpTranslations = (text) => post("/translations", { text });
export const fetchJpPendingTranslations = (chunk = 1) =>
  request(`/translations/pending?chunk=${chunk}`);
export const fetchJpSettings = () => request("/settings");
export const saveJpSettings = (body) => put("/settings", body);

// --- Механики: коды приходят с сервера вместе с карточкой ---

export const JP_MECH_MEANING = "meaning-choice";
export const JP_MECH_READING = "reading-input";
export const JP_MECH_BUILD = "build-from-keys";
export const JP_MECH_TRACE = "trace";
export const JP_MECH_READING_IN_WORD = "reading-in-word";
export const JP_MECH_TELL_APART = "tell-apart";
export const JP_MECH_CLOZE = "cloze";

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

// --- Озвучка ---
//
// Web Speech API: голос уже есть в системе, платить не за что и сеть не нужна.
// Облачный TTS с кешем в S3 — это озвучка колоды целиком, отдельная история;
// здесь нужна кнопка «как это звучит» прямо на карточке.
//
// Произносится всегда кана, а не запись кандзи: синтезатор сам выбирает чтение
// иероглифов и на 生 или 何 ошибается, а кану читает однозначно.

let jaVoice = null;
let voicesRequested = false;

function pickJapaneseVoice() {
  const synth = globalThis.speechSynthesis;
  if (!synth) return null;
  const voices = synth.getVoices();
  if (!voices.length) return null;
  return voices.find((v) => v.lang === "ja-JP") || voices.find((v) => v.lang?.startsWith("ja")) || null;
}

// Голоса в Safari подъезжают асинхронно, поэтому запрашиваем их заранее и
// перечитываем по событию: к первому тапу список обычно уже готов.
export function primeJapaneseVoice() {
  const synth = globalThis.speechSynthesis;
  if (!synth || voicesRequested) return;
  voicesRequested = true;
  jaVoice = pickJapaneseVoice();
  synth.addEventListener?.("voiceschanged", () => {
    jaVoice = pickJapaneseVoice();
  });
}

export function canSpeakJapanese() {
  return !!globalThis.speechSynthesis;
}

// Имя найденного японского голоса — для проверки в настройках. Пусто значит,
// что японского голоса в системе нет: синтезатор произнесёт кану чем придётся,
// и звучать это будет странно, но молчать он не станет.
export function japaneseVoiceName() {
  primeJapaneseVoice();
  if (!jaVoice) jaVoice = pickJapaneseVoice();
  return jaVoice?.name || "";
}

// speakJapanese произносит кану. Возвращает false, если синтезатора нет —
// кнопку в таком случае показывать незачем.
export function speakJapanese(kana) {
  const synth = globalThis.speechSynthesis;
  const text = String(kana || "").trim();
  if (!synth || !text) return false;
  primeJapaneseVoice();
  if (!jaVoice) jaVoice = pickJapaneseVoice();

  synth.cancel(); // повторный тап перебивает предыдущее, а не встаёт в очередь
  say(synth, text);

  // Первый тап нередко попадает в момент, когда список голосов ещё пуст:
  // браузер наполняет его лениво. Если японского голоса не было, пробуем ещё
  // раз, когда список приедет — иначе первое нажатие всегда впустую.
  if (!jaVoice) {
    setTimeout(() => {
      const found = pickJapaneseVoice();
      if (found && !jaVoice) {
        jaVoice = found;
        synth.cancel();
        say(synth, text);
      }
    }, 250);
  }
  return true;
}

function say(synth, text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  if (jaVoice) u.voice = jaVoice;
  // Чуть медленнее обычного: на карточке слушают, как оно устроено, а не
  // сколько успеет проговорить синтезатор.
  u.rate = 0.85;
  synth.speak(u);
}

// Что произносить у карточки: у слова — его чтение, у кандзи — то чтение,
// которое учим. Для ключа звучания нет вовсе.
export function speakableOf(card) {
  if (!card) return "";
  if (card.itemType === "word") return card.reading || "";
  if (card.itemType === "kanji") return card.mainReading || "";
  return "";
}
