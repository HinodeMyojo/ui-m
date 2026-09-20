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

// Слово целиком: разбор по знакам и примеры фраз. Тянется по тапу, а не
// приезжает с карточкой: примеры нужны не на каждом слове.
export const fetchJpWord = (text) => request(`/word/${encodeURIComponent(text)}`);

// Разбор вставленной строки целиком: какие в ней кандзи и слова и что из
// этого уже учится. Первый знак строки — не разбор.
export const analyzeJpText = (text) => post("/analyze", { text });
export const fetchJpGrid = () => request("/grid");
export const fetchJpAchievements = () => request("/achievements");
export const importJpTranslations = (text) => post("/translations", { text });
export const fetchJpPendingTranslations = (chunk = 1) =>
  request(`/translations/pending?chunk=${chunk}`);
// --- Учёбы ---
//
// Учёба — курс внутри модуля: что учим, сколько в день, когда напоминать и как
// часто экзамен. По умолчанию заведена одна — «Иероглифы».
export const fetchJpStudies = () => request("/studies");
export const saveJpStudy = (body) => post("/studies", body);
export const deleteJpStudy = (id) => request(`/studies/${id}`, { method: "DELETE" });

// Что можно учить. Порядок — от простого к сложному, как в самом методе:
// ключ входит в знак, знак входит в слово.
export const JP_ITEM_TYPES = [
  { code: "radical", label: "Ключи" },
  { code: "kanji", label: "Иероглифы" },
  { code: "word", label: "Слова" },
];

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
// Режимы второй итерации — docs/japanese-study-modes.md.
export const JP_MECH_LESSON = "lesson";
export const JP_MECH_READING_CHOICE = "reading-choice";
export const JP_MECH_KANJI_BY_MEANING = "kanji-by-meaning";
export const JP_MECH_KANJI_BY_READING = "kanji-by-reading";
export const JP_MECH_SPEAK = "speak";

// Умеет ли браузер распознавать речь. Без этого режим «произнести вслух»
// просто не показывается: в Safari он есть с iOS 14.5, в Chrome давно, но
// далеко не везде.
// Распознавание речи. Наличие конструктора ничего не доказывает: в WebView
// Telegram на iOS webkitSpeechRecognition есть, а start() отказывает —
// приложению не выдано разрешение на распознавание, и вопрос «произнеси вслух»
// там не отвечается вовсе. Поэтому отказ запоминается на устройстве, и дальше
// механика молча превращается во ввод чтения.
const SPEECH_BROKEN_KEY = "jp.speechBroken";

function speechBroken() {
  try {
    return localStorage.getItem(SPEECH_BROKEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function canHearJapanese() {
  if (speechBroken()) return false;
  return !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
}

// markSpeechRecognitionBroken — распознавание в этом браузере не работает.
// Вызывается по ответу самого API, а не по догадке о браузере.
export function markSpeechRecognitionBroken() {
  try {
    localStorage.setItem(SPEECH_BROKEN_KEY, "1");
  } catch {
    // не запомнится до перезагрузки — механика просто отвалится ещё раз
  }
}

// jpSpeechMatches — сказал ли человек то, что от него ждали.
//
// Распознавание японского возвращает не кану, а нормальный текст: на «はく»
// приедет 白 или 博. Сверять его с чтением бессмысленно — совпадений не будет
// никогда, и это была настоящая причина, по которой режим всегда отвечал
// «неверно». Поэтому засчитывается и сам знак, и запись слова, и чтение.
//
// Вхождение, а не равенство: распознавание любит дописывать частицы и
// склеивать слова, «やま» внутри «やまです» — то же самое чтение.
export function jpSpeechMatches(heard, expected) {
  const said = jpNormalizeReading(heard);
  const want = jpNormalizeReading(expected);
  if (!said || !want) return false;
  if (said.includes(want) || want.includes(said)) return true;
  // Запись знаком или словом: сравниваем как есть, без приведения каны.
  const rawSaid = String(heard || "").replace(/[\s.,。、！？!?]/g, "");
  const rawWant = String(expected || "").replace(/[\s.,。、！？!?]/g, "");
  return !!rawWant && rawSaid.includes(rawWant);
}

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

// Цвета составляющих знака. Пять штук: больше частей у прямых потомков не
// бывает, а различать десять оттенков на тёмном фоне всё равно невозможно.
// Порядок постоянный, поэтому первая часть знака всегда одного цвета — и
// глаз перестаёт искать соответствие заново на каждом знаке.
export const JP_GROUP_COLORS = ["#ff7a7a", "#59a5ff", "#63c94f", "#ffd666", "#c58bff"];

// Ступени письма. Номера общие с сервером (jp_modes.go): помощь убирается
// частями, а не разом — обвести по видимому контуру умеет и тот, кто знака не
// помнит.
export const JP_WRITE_BY_KEYS = 1;
export const JP_WRITE_OUTLINE = 2;
export const JP_WRITE_ZONES = 3;
export const JP_WRITE_BLIND = 4;

export const JP_WRITE_STAGE_LABELS = {
  [JP_WRITE_BY_KEYS]: "по ключам",
  [JP_WRITE_OUTLINE]: "по контуру",
  [JP_WRITE_ZONES]: "по зонам",
  [JP_WRITE_BLIND]: "по памяти",
};

// --- Озвучка ---
//
// Путей два, и первый теперь серверный.
//
// Web Speech API был единственным: голос уже есть в системе, платить не за что,
// сеть не нужна. Но в WebView Telegram он работает через раз, а в мини-аппе
// это единственный браузер, который у человека есть. Заодно он всегда молчал
// на машинах, где не доставлен японский язык.
//
// Поэтому сначала спрашиваем сервер (open_jtalk в соседнем контейнере, ответ
// лежит в кеше и звучит одинаково всегда), а синтезатор браузера остаётся
// запасным путём — на случай, когда контейнера нет или сеть отвалилась.
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

// Один общий элемент звука на всё приложение.
//
// На iOS проигрывать можно только то, что запущено внутри жеста, и «разрешение»
// выдаётся элементу, а не странице. Новый Audio на каждый тап это разрешение
// теряет, поэтому элемент один и переиспользуется.
let audioEl = null;

function player() {
  if (!audioEl) audioEl = new Audio();
  return audioEl;
}

// Готовые файлы: текст → ссылка на blob. Держим немного — карточек за сессию
// десятки, а каждый файл это сотня килобайт в памяти вкладки.
const SPEECH_CACHE_MAX = 40;
const speechCache = new Map();

// Пока не доказано обратное, считаем, что серверная озвучка есть. Доказывает
// обратное первый же неудачный запрос: дальше не ходим впустую до перезагрузки.
let serverSpeech = true;
const pending = new Map();

function cacheSpeech(text, url) {
  speechCache.set(text, url);
  while (speechCache.size > SPEECH_CACHE_MAX) {
    const oldest = speechCache.keys().next().value;
    URL.revokeObjectURL(speechCache.get(oldest));
    speechCache.delete(oldest);
  }
}

// primeJapaneseSpeech заранее тянет звук для текста.
//
// Это не оптимизация, а условие работоспособности: между тапом и ответом
// сервера проходит запрос, а после await жест на iOS уже «остыл» и play()
// отклоняется. Поэтому файл должен лежать готовым к моменту тапа — карточка
// вызывает это, как только показала знак.
export function primeJapaneseSpeech(text) {
  const key = String(text || "").trim();
  if (!key || !serverSpeech || speechCache.has(key)) return;
  if (pending.has(key)) return;

  const task = (async () => {
    try {
      const response = await authorizedFetch(`${JP}/tts?text=${encodeURIComponent(key)}`);
      if (!response.ok) {
        // 503 — озвучка не настроена или синтезатор не поднялся. Это не
        // ошибка сети, повторять бессмысленно.
        if (response.status === 503) serverSpeech = false;
        return null;
      }
      const url = URL.createObjectURL(await response.blob());
      cacheSpeech(key, url);
      return url;
    } catch {
      return null;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, task);
}

// Автоозвучка: знак произносится сам, как только показан, без тапа по кнопке.
//
// По умолчанию включена — просьба была прямая: «когда показываешь иероглиф,
// всегда включать озвучку». Выключается в настройках, значение живёт в
// localStorage, а не на сервере: звук — свойство устройства, а не человека.
// Так же хранится и тумблер звуков сессии.
const AUTO_SPEAK_KEY = "jp.autoSpeak";
let autoSpeak = null;

export function jpAutoSpeakEnabled() {
  if (autoSpeak === null) {
    try {
      autoSpeak = localStorage.getItem(AUTO_SPEAK_KEY) !== "off";
    } catch {
      autoSpeak = true;
    }
  }
  return autoSpeak;
}

export function setJpAutoSpeakEnabled(value) {
  autoSpeak = !!value;
  try {
    localStorage.setItem(AUTO_SPEAK_KEY, autoSpeak ? "on" : "off");
  } catch {
    // не переживёт перезагрузку — не беда
  }
}

export function canSpeakJapanese() {
  return serverSpeech || !!globalThis.speechSynthesis;
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
  const text = String(kana || "").trim();
  if (!text) return false;

  // Готовый файл проигрывается прямо здесь, не выходя из обработчика тапа, —
  // иначе iOS откажет.
  const ready = speechCache.get(text);
  if (ready) {
    const el = player();
    el.pause();
    el.src = ready;
    el.currentTime = 0;
    const started = el.play();
    // play() возвращает промис и отклоняется молча. Если не вышло — падаем на
    // синтезатор браузера, а не оставляем человека в тишине.
    if (started?.catch) started.catch(() => speakBrowser(text));
    return true;
  }

  // Файла ещё нет: говорим браузером сейчас и заказываем на будущее.
  primeJapaneseSpeech(text);
  return speakBrowser(text);
}

// speakBrowser — прежний путь через Web Speech API, слово в слово.
function speakBrowser(text) {
  const synth = globalThis.speechSynthesis;
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

// Что произносить у карточки: у слова — его чтение, у кандзи — он и кун
// подряд («ぼ、はは»): знак звучит и так и так, и слышать надо оба. В «какой
// знак так читается» — только спрошенное чтение, иначе звук подсказал бы
// второе. Для ключа звучания нет вовсе.
export function speakableOf(card) {
  if (!card) return "";
  if (card.itemType === "word") return card.reading || "";
  if (card.itemType !== "kanji") return "";
  if (card.askReading) return jpReadingSpoken(card.askReading);
  const mains = jpMainReadings(card).map((r) => r.spoken);
  return mains.length ? mains.join("、") : card.mainReading || "";
}

// Чтения кандзи записаны как в KANJIDIC: оны катаканой (ボ), куны хираганой с
// точкой перед окуриганой (た.べる), у приставок и суффиксов дефис (-び).
//
// jpReadingParts — чтение хираганой, разложенное на то, что читается знаком, и
// окуригану: た.べる → { stem: "た", okuri: "べる" }. Хираганой, а не как в
// словаре: чтение над знаком пользователь просил хираганой.
export function jpReadingParts(raw) {
  const v = jpKatakanaToHiragana(String(raw || "").replace(/^-+|-+$/g, ""));
  const dot = v.indexOf(".");
  if (dot < 0) return { stem: v.replace(/[()]/g, ""), okuri: "" };
  return { stem: v.slice(0, dot), okuri: v.slice(dot + 1).replace(/-+$/, "") };
}

// jpReadingSpoken — чтение так, как оно звучит словом: た.べる → たべる.
// Сервер присылает спрошенное чтение подписью «た(べる)» — скобки тоже снимаются.
export function jpReadingSpoken(raw) {
  const v = String(raw || "");
  if (v.includes("(")) return jpKatakanaToHiragana(v.replace(/[()\-.]/g, ""));
  const { stem, okuri } = jpReadingParts(v);
  return stem + okuri;
}

// jpMainReadings — главные он и кун карточки или листа знака: те, что звучат
// в популярных словах. Старая карточка без них отдаёт единственное главное
// чтение, и вид его угадывается по записи: оны в словаре катаканой.
export function jpMainReadings(item) {
  if (!item) return [];
  const out = [];
  const add = (kind, raw) => {
    if (!raw) return;
    const { stem, okuri } = jpReadingParts(raw);
    out.push({ kind, raw, stem, okuri, spoken: stem + okuri });
  };
  add("on", item.mainOn);
  add("kun", item.mainKun);
  if (!out.length && item.mainReading) {
    add(/[ァ-ヶ]/.test(item.mainReading) ? "on" : "kun", item.mainReading);
  }
  return out;
}

// jpAcceptedReadings — чем можно ответить на «как читается знак»: любым оном и
// любым куном, кун — и целиком (たべる), и одной частью знака (た). Просьба
// была прямая: «чтобы можно было определить по онному либо кунному чтению».
export function jpAcceptedReadings(card) {
  const out = new Set();
  const add = (v) => {
    const n = jpNormalizeReading(v);
    if (n) out.add(n);
  };
  for (const r of card?.onReadings || []) add(jpReadingSpoken(r));
  for (const r of card?.kunReadings || []) {
    const { stem, okuri } = jpReadingParts(r);
    add(stem);
    add(stem + okuri);
  }
  for (const r of jpMainReadings(card)) {
    add(r.stem);
    add(r.spoken);
  }
  return out;
}
