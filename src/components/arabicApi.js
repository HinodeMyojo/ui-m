// API модуля «Арабский» — docs/arabic-module.md (back-m).
// Отдельный файл, как japaneseApi.js и sportApi.js.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const AR = `${API_BASE_URL}/api/v1/arabic`;

async function request(path, options = {}) {
  const response = await authorizedFetch(`${AR}${path}`, options);
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

export const fetchArOverview = () => request("/overview");
export const startArSession = (body) => post("/session", body);
export const answerArCard = (body) => post("/answer", body);
export const finishArSession = (id, body) => post(`/session/${id}/finish`, body);

// Идентификатор ответа делает запись идемпотентной: повтор при плохой связи не
// считается дважды.
export function arClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// --- Наборы, учёбы, словарь ---

export const fetchArDecks = () => request("/decks");
export const createArDeck = (body) => post("/decks", body);
export const updateArDeck = (id, body) => put(`/decks/${id}`, body);
export const deleteArDeck = (id) => request(`/decks/${id}`, { method: "DELETE" });
export const addArWordsByText = (id, text) => post(`/decks/${id}/words-text`, { text });

export const fetchArStudies = () => request("/studies");
export const saveArStudy = (body) => post("/studies", body);
export const deleteArStudy = (id) => request(`/studies/${id}`, { method: "DELETE" });

export const fetchArWord = (text) => request(`/word/${encodeURIComponent(text)}`);
export const fetchArLetter = (char) => request(`/letter/${encodeURIComponent(char)}`);
export const fetchArRoot = (root) => request(`/root/${encodeURIComponent(root)}`);
export const analyzeArText = (text) => post("/analyze", { text });

export const fetchArProgress = () => request("/progress");
export const fetchArAchievements = () => request("/achievements");

export const fetchArSettings = () => request("/settings");
export const saveArSettings = (body) => put("/settings", body);
export const knowArAlphabet = () => post("/know-alphabet");

// --- Механики ---

export const AR_MECH_LESSON = "lesson";
export const AR_MECH_MEANING = "meaning-choice";
export const AR_MECH_WORD_BY_MEANING = "word-by-meaning";
export const AR_MECH_LISTEN = "listen-choice";
export const AR_MECH_VOWEL = "vowel-choice";
export const AR_MECH_INPUT = "word-input";
export const AR_MECH_PLURAL = "plural-choice";
export const AR_MECH_ROOT = "root-choice";
export const AR_MECH_CLOZE = "cloze";
export const AR_MECH_SPEAK = "speak";
export const AR_MECH_LETTER_SOUND = "letter-sound";
export const AR_MECH_LETTER_FORM = "letter-form";

export const AR_RATING_AGAIN = 1;
export const AR_RATING_HARD = 2;
export const AR_RATING_GOOD = 3;
export const AR_RATING_EASY = 4;

// Подписи вопросов. Лежат рядом с кодами намеренно: механик двенадцать, и
// список, разъехавшийся с сервером, показывает не тот вопрос.
export const AR_MECH_TITLES = {
  [AR_MECH_LESSON]: "Знакомство",
  [AR_MECH_MEANING]: "Что это значит?",
  [AR_MECH_WORD_BY_MEANING]: "Какое это слово?",
  [AR_MECH_LISTEN]: "Что прозвучало?",
  [AR_MECH_VOWEL]: "Как это читается?",
  [AR_MECH_INPUT]: "Наберите слово",
  [AR_MECH_PLURAL]: "Множественное число",
  [AR_MECH_ROOT]: "От какого корня?",
  [AR_MECH_CLOZE]: "Что пропущено?",
  [AR_MECH_SPEAK]: "Произнесите вслух",
  [AR_MECH_LETTER_SOUND]: "Как звучит буква?",
  [AR_MECH_LETTER_FORM]: "Какая это буква?",
};

// --- Работа с арабской строкой ---
//
// Повторяет ArNormalize с сервера, и это осознанный дубль: ответ сверяется
// прямо на устройстве, до отправки, иначе между нажатием и «верно» встаёт
// поход на сервер. Правило одно и то же — أ и ا, ة и ه, ى и ي считаются одной
// буквой, огласовки не считаются вовсе: промах по клавише не должен
// засчитываться как незнание слова.

const AR_HARAKAT = /[ً-ْٰـٓ-ٕ]/g;

export function arDevowel(value) {
  return (value || "").replace(AR_HARAKAT, "");
}

export function arNormalize(value) {
  return arDevowel(value)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

export function arSameWord(a, b) {
  const compact = (v) => arNormalize(v).replace(/\s+/g, "");
  return compact(a) === compact(b) && compact(a) !== "";
}

// --- Звук ---
//
// Web Speech API, как в японском: сервер с долей в 0.2 ядра синтезировать речь
// не может, а голос ar в Safari и Chrome обычно есть. Где его нет, вопросы на
// слух не выпадают, а кнопка «Послушать» прячется — вопрос без условия хуже
// отсутствующего вопроса.

function arVoice() {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices() || [];
  return voices.find((v) => (v.lang || "").toLowerCase().startsWith("ar")) || null;
}

export function canSpeakArabic() {
  if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
    return false;
  }
  // Список голосов на iOS приезжает не сразу: пока он пуст, считаем, что
  // голос есть. Хуже показать кнопку, которая промолчит, чем спрятать звук у
  // того, у кого он работает.
  const voices = speechSynthesis.getVoices() || [];
  return voices.length === 0 || !!arVoice();
}

// primeArabicSpeech — первый вызов синтезатора должен случиться внутри жеста:
// на iOS запуск без него оставляет очередь навсегда заглушённой.
export function primeArabicSpeech() {
  if (typeof speechSynthesis === "undefined") return;
  try {
    speechSynthesis.getVoices();
    const warm = new SpeechSynthesisUtterance("");
    warm.volume = 0;
    speechSynthesis.speak(warm);
  } catch {
    // Браузер не дал — звук просто не будет работать, это не ошибка экрана.
  }
}

export function speakArabic(text) {
  if (!text || typeof speechSynthesis === "undefined") return;
  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = arVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "ar-SA";
    // Чуть медленнее обычного: гортанные ع и ق на быстрой речи сливаются, а
    // слово слушают, чтобы его повторить.
    utterance.rate = 0.85;
    speechSynthesis.speak(utterance);
  } catch {
    // Тишина вместо ошибки: звук — украшение вопроса, а не он сам.
  }
}

// arAutoSpeakEnabled — озвучивать ли слово автоматически. Свойство устройства,
// а не человека, поэтому живёт в localStorage, а не на сервере.
export function arAutoSpeakEnabled() {
  try {
    return localStorage.getItem("arabicAutoSpeak") !== "off";
  } catch {
    return true;
  }
}

export function setArAutoSpeak(on) {
  try {
    localStorage.setItem("arabicAutoSpeak", on ? "on" : "off");
  } catch {
    // Приватный режим: настройка живёт до перезагрузки.
  }
}

// arShowVowels — показывать ли огласовки на этой карточке. Правило из
// настроек: всегда, только на ранних стадиях или никогда.
export function arShowVowels(mode, stage) {
  if (mode === "never") return false;
  if (mode === "always") return true;
  return (stage || 0) < 2;
}

// arItemLabel — как называется тип единицы. Нужен подписям в списках.
export function arItemLabel(type) {
  if (type === "letter") return "буква";
  if (type === "root") return "корень";
  return "слово";
}
