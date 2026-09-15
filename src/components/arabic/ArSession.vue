<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import ArKeyboard from "./ArKeyboard.vue";
import ArTraceCanvas from "./ArTraceCanvas.vue";
import { sessionFocus } from "@/composables/useSessionFocus.js";
import ArSheet from "./ArSheet.vue";
import {
  startArSession,
  answerArCard,
  finishArSession,
  arClientId,
  arSameWord,
  arShowVowels,
  canSpeakArabic,
  primeArabicSpeech,
  speakArabic,
  arAutoSpeakEnabled,
  AR_MECH_LESSON,
  AR_MECH_MEANING,
  AR_MECH_WORD_BY_MEANING,
  AR_MECH_LISTEN,
  AR_MECH_VOWEL,
  AR_MECH_INPUT,
  AR_MECH_PLURAL,
  AR_MECH_ROOT,
  AR_MECH_CLOZE,
  AR_MECH_SPEAK,
  AR_MECH_LETTER_SOUND,
  AR_MECH_LETTER_FORM,
  AR_MECH_LETTER_TRACE,
  AR_MECH_CONJUGATION,
  AR_MECH_TITLES,
  AR_RATING_AGAIN,
  AR_RATING_HARD,
  AR_RATING_GOOD,
  AR_RATING_EASY,
} from "@/components/arabicApi.js";

// Сессия изучения арабского — общий экран для телефона и десктопа.
//
// Раскладка мобильная в обоих случаях, как в японском: главный сценарий —
// метро, семь минут, одна рука. Правило выдержано буквально: вопрос сверху,
// всё нажимаемое — в нижней трети, поэтому карточка и ответы разнесены в две
// области, а не идут одним потоком.

const props = defineProps({
  kind: { type: String, default: "mix" },
  sec: { type: Number, default: 0 },
  studyId: { type: String, default: "" },
  // Правило показа огласовок из настроек: always | early | never.
  vowels: { type: String, default: "early" },
  showTranslit: { type: Boolean, default: true },
});
const emit = defineEmits(["exit"]);

const PHASE = { LOADING: "loading", ASK: "ask", REVEAL: "reveal", DONE: "done", EMPTY: "empty" };

const phase = ref(PHASE.LOADING);
const error = ref("");
const kindNow = ref(props.kind);
const session = ref(null);
const queue = ref([]);
const index = ref(0);
const round = ref(1);
const result = ref(null);

const picked = ref(null);
const typed = ref("");
const verdict = ref(null); // right | wrong
const sending = ref(false);
const lastAnswer = ref(null);
const sheet = ref(null); // { kind, key } — лист поверх сессии

const startedAt = ref(0);
const shownAt = ref(0);
const elapsed = ref(0);
let ticker = null;
// Пока идёт урок, таймер стоит: семь минут — это на вопросы, а урок читают
// столько, сколько нужно. Иначе экран с новым словом торопит, и его листают.
let pausedMs = 0;
let pauseStart = 0;

const card = computed(() => queue.value[index.value] || null);
const total = computed(() => queue.value.length);
const mechanic = computed(() => card.value?.mechanic || AR_MECH_MEANING);
const isLesson = computed(() => mechanic.value === AR_MECH_LESSON);
const title = computed(() => AR_MECH_TITLES[mechanic.value] || "Вопрос");

const progressPct = computed(() =>
  total.value ? Math.round((index.value / total.value) * 100) : 0,
);
const plannedSec = computed(() => session.value?.plannedSec || props.sec || 420);
const leftSec = computed(() => Math.max(0, plannedSec.value - elapsed.value));
// Время вышло — но карточку не обрываем: она доигрывается до конца, флаг лишь
// запрещает брать следующую.
const timeUp = computed(() => leftSec.value <= 0);
const timeLabel = computed(() => {
  const s = leftSec.value;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
});

// Какую запись слова показывать: огласованную или голую. На ранних стадиях
// огласовки нужны — без них كتب это и «писал», и «книги»; на зрелых они
// исчезают, потому что в живом тексте их нет.
const showVowels = computed(() => arShowVowels(props.vowels, card.value?.stage));
function face(item) {
  if (!item) return "";
  return showVowels.value ? item.text || item.bare : item.bare || item.text;
}
const cardFace = computed(() => face(card.value));

// Слово в вопросе скрыто: его надо назвать самому или узнать на слух.
const hidesFace = computed(
  () =>
    mechanic.value === AR_MECH_WORD_BY_MEANING ||
    mechanic.value === AR_MECH_LISTEN ||
    mechanic.value === AR_MECH_INPUT ||
    (mechanic.value === AR_MECH_CLOZE && phase.value === PHASE.ASK),
);

const canHear = ref(false);
// Озвучка молчит там, где звук и есть ответ: в вопросе на слух до ответа она
// нужна, а в «наберите слово» — выдала бы его.
const speakable = computed(() => {
  if (!card.value) return "";
  if (phase.value === PHASE.ASK && (mechanic.value === AR_MECH_INPUT || mechanic.value === AR_MECH_WORD_BY_MEANING)) {
    return "";
  }
  return card.value.text || card.value.bare || "";
});

const choices = computed(() => card.value?.options || []);
const isChoice = computed(() => choices.value.length > 0 && !isLesson.value);
const isInput = computed(() => mechanic.value === AR_MECH_INPUT && !isLesson.value);
const isSpeak = computed(() => mechanic.value === AR_MECH_SPEAK && !isLesson.value);
const isTrace = computed(() => mechanic.value === AR_MECH_LETTER_TRACE && !isLesson.value);
// Арена — минута на скорость по уже выученному. Разбор после ответа здесь
// только мешает: он съедает те самые секунды, ради которых всё и затеяно.
const isArena = computed(() => (session.value?.kind || kindNow.value) === "arena");
const score = ref(0);

// Обводка проверяется на устройстве: холст сравнивает проведённое с самой
// буквой и говорит, сошлось ли. Сервер получает готовый вердикт и ступень —
// по ней он двигает лестницу помощи.
function traceResult(result) {
  if (phase.value !== PHASE.ASK || sending.value) return;
  verdict.value = result.pass ? "right" : "wrong";
  // Подсмотревший проходит, но ответ считается трудным: подсказка не должна
  // засчитываться наравне с письмом по памяти.
  const rating = result.pass ? (result.hinted ? AR_RATING_HARD : AR_RATING_GOOD) : AR_RATING_AGAIN;
  send(rating);
}

// Вопрос механики letter-form показывает букву в срединной форме: ـعـ и ع
// выглядят как разные знаки, и пока это не связано, текст не читается.
const askedForm = computed(() => {
  const forms = card.value?.forms || [];
  const i = card.value?.formIndex ?? 0;
  return forms[i] || card.value?.text || "";
});

// --- Запуск ---

async function begin(nextRound = 1) {
  phase.value = PHASE.LOADING;
  error.value = "";
  result.value = null;
  try {
    const data = await startArSession({
      kind: kindNow.value,
      studyId: props.studyId || null,
      sec: props.sec || 0,
      round: nextRound,
    });
    session.value = data;
    round.value = data?.round || nextRound;
    queue.value = data?.cards || [];
    index.value = 0;
    if (!queue.value.length) {
      phase.value = PHASE.EMPTY;
      return;
    }
    startedAt.value = Date.now();
    score.value = 0;
    elapsed.value = 0;
    pausedMs = 0;
    pauseStart = 0;
    startTicker();
    ask();
  } catch (e) {
    error.value = e.message || "не удалось собрать сессию";
    phase.value = PHASE.EMPTY;
  }
}

function activeMs() {
  const paused = pausedMs + (pauseStart ? Date.now() - pauseStart : 0);
  return Date.now() - startedAt.value - paused;
}

function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    elapsed.value = Math.round(activeMs() / 1000);
  }, 1000);
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function ask() {
  picked.value = null;
  typed.value = "";
  verdict.value = null;
  lastAnswer.value = null;
  if (isLesson.value && !pauseStart) pauseStart = Date.now();
  shownAt.value = Date.now();
  phase.value = PHASE.ASK;
  // Вопрос на слух без звука — пустой экран, поэтому произносим сами. Браузер
  // вправе отказать (звук без жеста), кнопка «Послушать» остаётся рядом.
  if (mechanic.value === AR_MECH_LISTEN || (arAutoSpeakEnabled() && speakable.value)) {
    nextTick(say);
  }
}

function say() {
  const text = card.value?.text || card.value?.bare;
  if (text) speakArabic(text);
}

// --- Ответы ---

function choose(i) {
  if (phase.value !== PHASE.ASK || sending.value) return;
  picked.value = i;
  const right = i === card.value.correctIndex;
  verdict.value = right ? "right" : "wrong";
  send(right ? AR_RATING_GOOD : AR_RATING_AGAIN);
}

function checkTyped() {
  if (phase.value !== PHASE.ASK || sending.value) return;
  const right = arSameWord(typed.value, card.value.bare) || arSameWord(typed.value, card.value.text);
  verdict.value = right ? "right" : "wrong";
  send(right ? AR_RATING_GOOD : AR_RATING_AGAIN);
}

// «Не знаю» — отдельный честный ответ. Без него признаться можно было только
// ткнув заведомо неверный вариант, и запоминается тогда именно он.
function dontKnow() {
  if (phase.value !== PHASE.ASK || sending.value) return;
  verdict.value = "wrong";
  picked.value = null;
  send(AR_RATING_AGAIN);
}

function gotIt(rating = AR_RATING_GOOD) {
  if (sending.value) return;
  verdict.value = "right";
  send(rating);
}

async function send(rating) {
  if (!card.value) return;
  sending.value = true;
  const answered = card.value;
  const body = {
    clientId: arClientId(),
    sessionId: session.value?.sessionId || null,
    cardId: answered.cardId,
    rating,
    mechanic: answered.mechanic,
    thinkMs: Math.max(0, Date.now() - shownAt.value),
    writeStage: answered.writeStage || 0,
  };
  try {
    lastAnswer.value = await answerArCard(body);
    // Проваленная карточка возвращается в конец очереди: повторить её надо в
    // этой же сессии, пока ошибка свежа.
    if (lastAnswer.value?.againInSession && !isLesson.value) {
      queue.value.push({ ...answered });
    }
  } catch (e) {
    error.value = e.message || "ответ не сохранился";
  } finally {
    sending.value = false;
  }

  if (isLesson.value) {
    if (pauseStart) {
      pausedMs += Date.now() - pauseStart;
      pauseStart = 0;
    }
    next();
    return;
  }
  if (isArena.value) {
    if (verdict.value === "right") score.value++;
    next();
    return;
  }
  phase.value = PHASE.REVEAL;
  // Верный ответ не требует разбора: показали, что верно, и дальше. Неверный
  // ждёт тапа — на него и надо посмотреть.
  if (verdict.value === "right") setTimeout(() => phase.value === PHASE.REVEAL && next(), 900);
}

function next() {
  if (timeUp.value) {
    finish();
    return;
  }
  if (index.value + 1 >= queue.value.length) {
    // В арене очередь идёт по кругу: время кончается раньше, чем карточки, и
    // упереться в конец списка на сороковой секунде — это испорченный рекорд.
    if (isArena.value && queue.value.length) {
      index.value = 0;
      ask();
      return;
    }
    finish();
    return;
  }
  index.value++;
  ask();
}

async function finish() {
  stopTicker();
  phase.value = PHASE.DONE;
  if (!session.value?.sessionId) return;
  try {
    result.value = await finishArSession(session.value.sessionId, {
      durationSec: Math.round(activeMs() / 1000),
    });
  } catch (e) {
    error.value = e.message || "итог не сохранился";
  }
}

function again() {
  begin(round.value + 1);
}

function studyAhead() {
  kindNow.value = "ahead";
  begin(1);
}

// Склонение после числа: «1 заход, 2 захода, 5 заходов». Мелочь, но текст с
// «5 захода» читается как недоделка.
function drillWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заход";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "захода";
  return "заходов";
}

function openSheet(kind, key) {
  if (!key) return;
  sheet.value = { kind, key };
}

onMounted(() => {
  // Сессия занимает телефон целиком: пока она идёт, приложение прячет таб-бар
  // и сезонный слой. Кнопки ответа стоят в нижней трети — ровно там, где
  // таб-бар, — и «Не знаю» уходило под него, а листья летали по вариантам.
  sessionFocus.value = true;
  canHear.value = canSpeakArabic();
  primeArabicSpeech();
  begin(1);
});
onBeforeUnmount(() => {
  stopTicker();
  sessionFocus.value = false;
});
</script>

<template>
  <div class="ars" :class="{ 'is-input': (isInput || isTrace) && phase === PHASE.ASK }">
    <!-- Шапка: сколько осталось времени и где мы в очереди. -->
    <header class="ars-top">
      <button class="ars-x" @click="emit('exit')">✕</button>
      <div class="ars-bar"><span :style="{ width: progressPct + '%' }"></span></div>
      <span v-if="isArena" class="ars-score">✓ {{ score }}</span>
      <span class="ars-time" :class="{ 'is-up': timeUp }">{{ timeLabel }}</span>
    </header>

    <div v-if="phase === PHASE.LOADING" class="ars-center">Собираем сессию…</div>

    <div v-else-if="phase === PHASE.EMPTY" class="ars-center ars-empty">
      <p v-if="error" class="ar-err">{{ error }}</p>
      <template v-else>
        <p class="ars-empty-title">На сегодня всё</p>
        <p class="ar-muted">Повторять нечего, норма новых закрыта.</p>
      </template>
      <div class="ars-empty-btns">
        <button class="ar-btn ar-btn-accent" @click="studyAhead">Заниматься дальше</button>
        <button class="ar-btn" @click="emit('exit')">Выйти</button>
      </div>
    </div>

    <div v-else-if="phase === PHASE.DONE" class="ars-center ars-done">
      <p class="ars-done-title">Сессия закончена</p>
      <template v-if="result">
        <div class="ars-nums">
          <div><b>{{ result.cards }}</b><span>карточек</span></div>
          <div><b>{{ result.accuracyPct }}%</b><span>точность</span></div>
          <div><b>+{{ result.xp }}</b><span>очков</span></div>
        </div>
        <p v-if="result.newRecord" class="ars-streak">🏆 Новый рекорд: {{ result.bestScore }}</p>
        <p v-else-if="isArena && result.bestScore" class="ar-muted">рекорд {{ result.bestScore }}</p>
        <p v-if="result.streakGained" class="ars-streak">🔥 Стрик {{ result.streak }} — день закрыт</p>
        <p v-else-if="result.streak" class="ar-muted">🔥 Стрик {{ result.streak }}</p>
        <p v-if="result.disciplineMarked" class="ar-muted">Отмечено в трекере дисциплины</p>
        <p v-if="result.examResult" class="ars-exam">
          Экзамен: {{ result.examResult.correct }} из {{ result.examResult.items }} —
          {{ result.examResult.passed ? "сдан" : "не сдан" }}
        </p>
        <ul v-if="result.achievements?.length" class="ars-ach">
          <li v-for="a in result.achievements" :key="a.code">🏅 {{ a.title }}</li>
        </ul>
        <p v-if="result.dueLeft" class="ar-muted">Ждёт ещё {{ result.dueLeft }} повторений</p>
      </template>
      <div class="ars-empty-btns">
        <button class="ar-btn ar-btn-accent" @click="again">
          Ещё раунд
          <small v-if="result?.nextRoundXpMultiplier > 1">×{{ result.nextRoundXpMultiplier }}</small>
        </button>
        <button class="ar-btn" @click="emit('exit')">Хватит</button>
      </div>
    </div>

    <template v-else-if="card">
      <!-- Вопрос. Всё, что здесь, — только для чтения: нажимаемое живёт внизу. -->
      <section class="ars-q">
        <p class="ars-q-title">{{ title }}</p>

        <!-- Урок: единицу показывают целиком, прежде чем спрашивать. -->
        <template v-if="isLesson">
          <div class="ars-face ar-ar" :class="card.itemType === 'letter' ? 'ar-letter-big' : 'ar-word-big'">
            {{ cardFace }}
          </div>
          <p v-if="props.showTranslit && card.translit" class="ar-translit">{{ card.translit }}</p>
          <p class="ars-meaning">{{ (card.meanings || []).join(", ") }}</p>

          <p v-if="card.letterSound" class="ars-note">{{ card.letterSound }}</p>
          <div v-if="card.itemType === 'letter' && card.forms?.length" class="ars-forms ar-ar">
            <span v-for="(f, i) in card.forms" :key="i">{{ f }}</span>
          </div>
          <p v-if="card.itemType === 'letter'" class="ar-muted">
            {{ card.sun ? "солнечная: артикль сливается — اَلشَّمْس" : "лунная: артикль читается — اَلْقَمَر" }}
          </p>
          <p v-if="card.note" class="ars-note">{{ card.note }}</p>

          <p v-if="card.root" class="ars-root">
            корень
            <button class="ars-link ar-ar" @click="openSheet('root', card.root)">{{ card.root }}</button>
            <span v-if="card.rootMeaning">— {{ card.rootMeaning }}</span>
          </p>
          <p v-if="card.plural" class="ar-muted">мн. ч.: <span class="ar-ar">{{ card.plural }}</span></p>
          <p v-if="card.present" class="ar-muted">наст. вр.: <span class="ar-ar">{{ card.present }}</span></p>

          <div v-if="card.family?.length" class="ars-family">
            <button
              v-for="w in card.family"
              :key="w.bare"
              class="ar-chip"
              @click="openSheet(card.itemType === 'letter' ? 'word' : 'word', w.bare)"
            >
              <span class="ar-ar">{{ w.text }}</span>
              <small>{{ (w.meanings || [])[0] }}</small>
            </button>
          </div>

          <div v-if="card.examples?.length" class="ars-examples">
            <div v-for="(s, i) in card.examples" :key="i" class="ars-example">
              <p class="ar-ar">{{ s.text }}</p>
              <p class="ar-muted">{{ s.translationRu }}</p>
            </div>
          </div>
        </template>

        <!-- Вопрос: слово, буква, фраза с пропуском или значение. -->
        <template v-else>
          <div v-if="mechanic === AR_MECH_CLOZE" class="ars-cloze">
            <p class="ar-ar ars-sentence">{{ card.sentence }}</p>
            <p class="ar-muted">{{ card.sentenceTranslation }}</p>
          </div>

          <div v-else-if="mechanic === AR_MECH_LETTER_FORM" class="ars-face ar-ar ar-letter-big">
            {{ askedForm }}
          </div>

          <!-- Письмо: спрашиваем буквой по имени, саму её показывает (или не
               показывает) холст — по ступени помощи. -->
          <div v-else-if="isTrace" class="ars-ask-meaning">
            <p class="ars-meaning">{{ card.letterName }}</p>
            <p class="ar-muted">{{ card.letterSound }}</p>
          </div>

          <div v-else-if="hidesFace" class="ars-ask-meaning">
            <p class="ars-meaning">{{ (card.meanings || []).join(", ") }}</p>
            <p v-if="mechanic === AR_MECH_LISTEN" class="ar-muted">слушайте и выбирайте</p>
          </div>

          <div v-else class="ars-face ar-ar" :class="card.itemType === 'letter' ? 'ar-letter-big' : 'ar-word-big'">
            {{ mechanic === AR_MECH_VOWEL ? card.bare : cardFace }}
          </div>

          <p v-if="mechanic === AR_MECH_VOWEL" class="ars-meaning">{{ (card.meanings || [])[0] }}</p>
          <template v-if="mechanic === AR_MECH_CONJUGATION">
            <p class="ars-meaning">{{ (card.meanings || [])[0] }}</p>
            <p class="ars-person">как будет «{{ card.person }}»?</p>
          </template>
          <p v-if="mechanic === AR_MECH_PLURAL" class="ar-muted">дайте множественное число</p>

          <button v-if="canHear && speakable" class="ar-btn ar-btn-sm ars-listen" @click="say">
            🔊 Послушать
          </button>
        </template>

        <!-- Разбор по буквам: подсказка во время ответа, а не после него. -->
        <div v-if="!hidesFace && card.breakdown?.length" class="ars-breakdown">
          <button
            v-for="(l, i) in card.breakdown"
            :key="i"
            class="ars-letter"
            @click="openSheet('letter', l.char)"
          >
            <span class="ar-ar">{{ l.char }}</span>
            <small>{{ l.translit }}</small>
          </button>
        </div>
      </section>

      <!-- Ответы. Нижняя треть экрана — правило мобильного слоя. -->
      <section class="ars-a">
        <template v-if="phase === PHASE.ASK">
          <template v-if="isLesson">
            <button class="ar-btn ar-btn-accent ars-wide" @click="gotIt()">Понял, дальше</button>
          </template>

          <template v-else-if="isChoice">
            <div class="ars-options">
              <button
                v-for="(o, i) in choices"
                :key="i"
                class="ars-option"
                :class="{ 'is-ar': mechanic !== AR_MECH_MEANING && mechanic !== AR_MECH_LETTER_SOUND }"
                :disabled="sending"
                @click="choose(i)"
              >
                <span
                  :class="
                    mechanic !== AR_MECH_MEANING && mechanic !== AR_MECH_LETTER_SOUND ? 'ar-ar' : ''
                  "
                  >{{ o }}</span
                >
              </button>
            </div>
            <button class="ars-idk" @click="dontKnow">Не знаю</button>
          </template>

          <template v-else-if="isInput">
            <input
              v-model="typed"
              class="ar-input ar-ar ars-typed"
              dir="rtl"
              inputmode="none"
              readonly
              placeholder="…"
            />
            <ArKeyboard v-model="typed" @submit="checkTyped" />
            <div class="ars-row2">
              <button class="ars-idk" @click="dontKnow">Не знаю</button>
              <button class="ar-btn ar-btn-accent" :disabled="!typed" @click="checkTyped">
                Проверить
              </button>
            </div>
          </template>

          <template v-else-if="isTrace">
            <ArTraceCanvas
              :key="card.cardId + ':' + (card.writeStage || 1)"
              :char="card.text"
              :stage="card.writeStage || 1"
              @result="traceResult"
            />
            <button class="ars-idk" @click="dontKnow">Не помню букву</button>
          </template>

          <template v-else-if="isSpeak">
            <p class="ar-muted ars-speak-hint">
              Скажите слово вслух, потом проверьте себя — звуком или переводом.
            </p>
            <div class="ars-row2">
              <button class="ar-btn" @click="say">🔊 Послушать</button>
              <button class="ar-btn ar-btn-accent" @click="gotIt()">Сказал верно</button>
            </div>
            <button class="ars-idk" @click="dontKnow">Не вышло</button>
          </template>

          <template v-else>
            <button class="ar-btn ar-btn-accent ars-wide" @click="gotIt()">Знаю</button>
            <button class="ars-idk" @click="dontKnow">Не знаю</button>
          </template>
        </template>

        <template v-else-if="phase === PHASE.REVEAL">
          <div class="ars-verdict" :class="verdict">
            <p class="ars-verdict-title">{{ verdict === "right" ? "Верно" : "Правильный ответ" }}</p>
            <p class="ar-ar ars-verdict-word">{{ card.text || card.bare }}</p>
            <p class="ars-meaning">{{ (card.meanings || []).join(", ") }}</p>
            <p v-if="card.translit && props.showTranslit" class="ar-translit">{{ card.translit }}</p>
            <p v-if="card.root" class="ar-muted">
              корень
              <button class="ars-link ar-ar" @click="openSheet('root', card.root)">{{ card.root }}</button>
              <span v-if="card.rootMeaning"> — {{ card.rootMeaning }}</span>
            </p>
            <!-- Пример после ответа: слово в живой строке запоминается иначе,
                 чем слово из списка. -->
            <div v-if="card.examples?.length && card.itemType === 'word'" class="ars-verdict-example">
              <p class="ar-ar">{{ card.examples[0].text }}</p>
              <p class="ar-muted">{{ card.examples[0].translationRu }}</p>
            </div>
            <p v-if="lastAnswer?.writeStage && card.itemType === 'letter'" class="ar-muted">
              письмо: {{ ["", "по контуру", "по бледному следу", "по памяти"][lastAnswer.writeStage] }}
            </p>
            <p v-if="lastAnswer?.drillLeft" class="ar-muted">
              ещё {{ lastAnswer.drillLeft }} {{ drillWord(lastAnswer.drillLeft) }} до закрепления
            </p>
            <p v-else-if="lastAnswer?.intervalDays" class="ar-muted">
              вернётся через {{ lastAnswer.intervalDays }} дн.
            </p>
          </div>
          <div class="ars-row2">
            <button v-if="canHear" class="ar-btn" @click="say">🔊</button>
            <button class="ar-btn" @click="openSheet(card.itemType, card.itemType === 'letter' ? card.text : card.bare)">
              Подробно
            </button>
            <button class="ar-btn ar-btn-accent ars-grow" @click="next">Дальше</button>
          </div>
          <button
            v-if="verdict === 'right' && !lastAnswer?.drillLeft"
            class="ars-idk"
            @click="gotIt(AR_RATING_EASY)"
          >
            Было легко
          </button>
        </template>
      </section>
    </template>

    <ArSheet v-if="sheet" :kind="sheet.kind" :value="sheet.key" @close="sheet = null" />
  </div>
</template>

<style scoped>
.ars {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  gap: 10px;
  color: var(--ar-text, #e8eaf2);
}

.ars-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ars-x {
  border: none;
  background: transparent;
  color: var(--ar-muted, #7a7f8e);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 6px;
}

.ars-bar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: #2a2d38;
  overflow: hidden;
}

.ars-bar span {
  display: block;
  height: 100%;
  background: var(--ar-accent, #18a999);
  transition: width 0.25s;
}

.ars-score {
  font-variant-numeric: tabular-nums;
  color: var(--ar-accent, #18a999);
  font-weight: 700;
  font-size: 15px;
}

.ars-person {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--ar-gold, #d9a441);
}

.ars-time {
  font-variant-numeric: tabular-nums;
  color: var(--ar-muted, #7a7f8e);
  font-size: 14px;
}

.ars-time.is-up {
  color: var(--ar-warn, #ffd666);
}

/* Вопрос занимает верх и скроллится сам: у урока бывает семья слов и два
   примера, и они не должны выталкивать кнопки за экран. */
.ars-q {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* Вопрос стоит по центру своей половины, а не липнет к шапке: между ним и
     кнопками ответа иначе остаётся пустое поле в треть экрана. */
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 6px 2px;
}

.ars-q-title {
  margin: 0;
  color: var(--ar-muted, #7a7f8e);
  font-size: 13px;
  text-transform: lowercase;
}

.ars-face {
  margin: 4px 0;
}

.ars-meaning {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.ars-note {
  margin: 0;
  font-size: 13px;
  color: var(--ar-muted, #7a7f8e);
  max-width: 34ch;
}

.ars-forms {
  display: flex;
  gap: 14px;
  font-size: 30px;
  padding: 6px 12px;
  border-radius: 12px;
  background: #22242d;
}

.ars-root {
  margin: 0;
  font-size: 14px;
  color: var(--ar-muted, #7a7f8e);
}

.ars-link {
  border: none;
  background: transparent;
  color: var(--ar-gold, #d9a441);
  font-size: 17px;
  cursor: pointer;
  padding: 0 4px;
}

.ars-family {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.ars-family .ar-chip {
  flex-direction: column;
  gap: 0;
  cursor: pointer;
}

.ars-family .ar-chip .ar-ar {
  font-size: 18px;
}

.ars-family small {
  color: var(--ar-muted, #7a7f8e);
  font-size: 11px;
}

.ars-examples {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.ars-example {
  background: #22242d;
  border-radius: 12px;
  padding: 8px 10px;
}

.ars-example p {
  margin: 0;
}

.ars-example .ar-ar {
  font-size: 19px;
}

.ars-sentence {
  font-size: clamp(20px, 6vw, 28px);
  margin: 0;
}

.ars-breakdown {
  display: flex;
  flex-wrap: wrap-reverse;
  gap: 6px;
  justify-content: center;
  direction: rtl;
}

.ars-letter {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 38px;
  padding: 4px 6px;
  border-radius: 10px;
  border: 1px solid #2a2d38;
  background: #22242d;
  color: inherit;
  cursor: pointer;
}

.ars-letter .ar-ar {
  font-size: 20px;
}

.ars-letter small {
  font-size: 10px;
  color: var(--ar-muted, #7a7f8e);
  direction: ltr;
}

/* Ответы — нижняя треть: правило мобильного слоя выдержано буквально. */
.ars-a {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Полоса жеста «домой» на айфоне съедает нижние пиксели: без отступа
     «Дальше» оказывается наполовину под ней. */
  padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));
}

.ars-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.ars-option {
  min-height: 58px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid #2f3340;
  background: #22242d;
  color: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.ars-option.is-ar span {
  font-size: 24px;
}

.ars-wide {
  width: 100%;
}

.ars-grow {
  flex: 1;
}

.ars-idk {
  align-self: center;
  border: none;
  background: transparent;
  color: var(--ar-muted, #7a7f8e);
  font-size: 14px;
  padding: 6px 10px;
  cursor: pointer;
  text-decoration: underline;
}

.ars-row2 {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ars-typed {
  text-align: center;
  font-size: 26px;
  padding: 6px 12px;
}

/* Клавиатура занимает половину экрана, и вопрос обязан ужаться: иначе кнопка
   «Проверить» уходит под нижний край телефона — ровно та же беда, из-за
   которой в японском появился режим фокуса. */
.ars.is-input .ars-q {
  flex: 0 1 auto;
  padding: 2px;
}

.ars.is-input .ars-a {
  gap: 6px;
  /* Клавиатура прижата к низу — туда дотягивается большой палец. */
  margin-top: auto;
}

.ars-verdict {
  border-radius: 14px;
  padding: 10px 12px;
  border: 1px solid;
  text-align: center;
}

.ars-verdict.right {
  border-color: rgba(99, 201, 79, 0.5);
  background: rgba(99, 201, 79, 0.1);
}

.ars-verdict.wrong {
  border-color: rgba(229, 72, 77, 0.5);
  background: rgba(229, 72, 77, 0.1);
}

.ars-verdict-title {
  margin: 0;
  font-size: 13px;
  color: var(--ar-muted, #7a7f8e);
}

.ars-verdict-word {
  margin: 2px 0;
  font-size: 30px;
}

.ars-verdict p {
  margin: 0;
}

.ars-verdict-example {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ars-verdict-example .ar-ar {
  font-size: 19px;
}

.ars-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
}

.ars-empty-title,
.ars-done-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.ars-empty-btns {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.ars-nums {
  display: flex;
  gap: 18px;
}

.ars-nums div {
  display: flex;
  flex-direction: column;
}

.ars-nums b {
  font-size: 22px;
}

.ars-nums span {
  font-size: 12px;
  color: var(--ar-muted, #7a7f8e);
}

.ars-streak {
  margin: 0;
  color: var(--ar-warn, #ffd666);
  font-weight: 700;
}

.ars-exam {
  margin: 0;
  color: var(--ar-gold, #d9a441);
}

.ars-ach {
  list-style: none;
  margin: 0;
  padding: 0;
  color: var(--ar-gold, #d9a441);
}

.ars-speak-hint {
  text-align: center;
}
</style>
