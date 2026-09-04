<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import JpKanaKeyboard from "./JpKanaKeyboard.vue";
import JpTraceCanvas from "./JpTraceCanvas.vue";
import JpKanjiSheet from "./JpKanjiSheet.vue";
import JpWordSheet from "./JpWordSheet.vue";
import JpSpeakCheck from "./JpSpeakCheck.vue";
import { jpPlay } from "./jpSound.js";
import {
  startJpSession,
  answerJpCard,
  finishJpSession,
  jpClientId,
  jpItemLabel,
  jpNormalizeReading,
  JP_MECH_MEANING,
  JP_MECH_READING,
  JP_MECH_BUILD,
  JP_MECH_TRACE,
  JP_MECH_READING_IN_WORD,
  JP_MECH_TELL_APART,
  JP_MECH_CLOZE,
  JP_MECH_LESSON,
  JP_MECH_READING_CHOICE,
  JP_MECH_KANJI_BY_MEANING,
  JP_MECH_KANJI_BY_READING,
  JP_MECH_SPEAK,
  canHearJapanese,
  JP_RATING_AGAIN,
  JP_RATING_HARD,
  JP_RATING_GOOD,
  JP_RATING_EASY,
  jpKatakanaToHiragana,
  canSpeakJapanese,
  primeJapaneseVoice,
  speakJapanese,
  speakableOf,
} from "@/components/japaneseApi.js";

// Сессия изучения — общий экран для телефона и десктопа.
//
// Раскладка мобильная в обоих случаях: главный сценарий — метро, шесть минут,
// одна рука. На десктопе она же, ограниченная по ширине; своя вторая версия
// того же экрана означала бы две реализации механик и двойные ошибки в них.
//
// Правило мобильного слоя выдержано буквально: вопрос сверху, всё нажимаемое —
// в нижней трети. Поэтому карточка и ответы разнесены в две области, а не идут
// одним потоком.

const props = defineProps({
  kind: { type: String, default: "mix" },
  sec: { type: Number, default: 0 },
  // Какую учёбу проходим: она решает, что попадёт в сессию.
  studyId: { type: String, default: "" },
});
const emit = defineEmits(["exit"]);

const PHASE = { LOADING: "loading", ASK: "ask", REVEAL: "reveal", DONE: "done", EMPTY: "empty" };

const phase = ref(PHASE.LOADING);
const error = ref("");
// Режим текущей сессии. Меняется изнутри: с пустого экрана можно попросить
// «дальше», не выходя в раздел и не теряя нить.
const kindNow = ref(props.kind);
const session = ref(null);
const queue = ref([]);
const index = ref(0);
const round = ref(1);
const result = ref(null);

// Ответ по текущей карточке.
const picked = ref(null); // выбранный вариант (механика 1)
const typed = ref(""); // введённое чтение (механика 2)
const tiles = ref([]); // собранные плитки (механика 3)
const verdict = ref(null); // "right" | "close" | "wrong"
const sending = ref(false);
// Урок перед вопросом: единицу видят впервые, и первым делом её показывают
// целиком, а не спрашивают из четырёх вариантов.
const teaching = ref(false);
const hintOpen = ref(false); // разбор раскрыт прямо сейчас
const hintUsed = ref(false); // разбор открывали на этой карточке
const sheetChar = ref(""); // знак, раскрытый листом поверх сессии
const sheetWord = ref(""); // слово, раскрытое листом поверх сессии
// Карточки, с которыми покончено: те, что не вернутся в этой сессии. По ним
// считается шкала — см. progressPct.
const doneIds = ref(new Set());

const startedAt = ref(0);
const shownAt = ref(0);
const elapsed = ref(0);
let ticker = null;

const card = computed(() => queue.value[index.value] || null);
const isArena = computed(() => kindNow.value === "arena");
const isAhead = computed(() => kindNow.value === "ahead");
const total = computed(() => queue.value.length);

// Шкала считается по закрытым карточкам, а не по позиции в очереди. Провал
// возвращает карточку в конец, очередь растёт ровно с той же скоростью, что и
// позиция, — и доля index/total стоит на месте всю сессию. Карточек в счёте
// столько, сколько их всего разных: повтор той же карточки очередь удлиняет,
// а работы не добавляет.
const uniqueTotal = computed(() => new Set(queue.value.map((c) => c.cardId)).size);

const progressPct = computed(() =>
  uniqueTotal.value ? Math.round((doneIds.value.size / uniqueTotal.value) * 100) : 0,
);
const plannedSec = computed(() => session.value?.plannedSec || props.sec || 360);
const leftSec = computed(() => Math.max(0, plannedSec.value - elapsed.value));

// Время вышло — но карточку не обрываем: правило спеки. Флаг только запрещает
// брать следующую.
const timeUp = computed(() => leftSec.value <= 0);

const timeLabel = computed(() => {
  const s = leftSec.value;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
});

// --- Запуск ---

async function begin(nextRound = 1) {
  phase.value = PHASE.LOADING;
  error.value = "";
  result.value = null;
  try {
    const data = await startJpSession({
      kind: kindNow.value,
      studyId: props.studyId || null,
      sec: props.sec || 0,
      round: nextRound,
    });
    session.value = data;
    round.value = data?.round || nextRound;
    queue.value = data?.cards || [];
    index.value = 0;
    doneIds.value = new Set();
    if (!queue.value.length) {
      phase.value = PHASE.EMPTY;
      return;
    }
    startedAt.value = Date.now();
    elapsed.value = 0;
    startTicker();
    ask();
  } catch (e) {
    error.value = e.message || "не удалось собрать сессию";
    phase.value = PHASE.EMPTY;
  }
}

function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    elapsed.value = Math.round((Date.now() - startedAt.value) / 1000);
  }, 1000);
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function ask() {
  picked.value = null;
  typed.value = "";
  tiles.value = [];
  verdict.value = null;
  hintOpen.value = false;
  hintUsed.value = false;
  teaching.value = !!card.value?.lesson;
  shownAt.value = Date.now();
  phase.value = PHASE.ASK;
}

// «Заниматься дальше»: берём новое сверх дневной нормы, а если и его нет —
// ближайшие повторения наперёд. Пустой экран в ответ на желание позаниматься
// — худшее, что может сделать учебник.
function studyAhead() {
    kindNow.value = "ahead";
    begin(1);
}

// Режим, по которому спрашиваем прямо сейчас. Пока идёт урок, вопроса нет.
// «Произнести вслух» там, где браузер не умеет слушать, превращается во ввод
// чтения: иначе карточка была бы неотвечаемой.
const mechanic = computed(() => {
  const m = card.value?.mechanic;
  if (m === JP_MECH_SPEAK && !canHearJapanese()) return JP_MECH_READING;
  return m;
});

// Вопрос показывает сам знак: в обратных направлениях знак и есть ответ.
const asksForKanji = computed(
  () => mechanic.value === JP_MECH_KANJI_BY_MEANING || mechanic.value === JP_MECH_KANJI_BY_READING,
);

function learned() {
  teaching.value = false;
  shownAt.value = Date.now();
}

// --- Проверка ответа ---

// Правильные плитки известны из состава карточки: в Options к ним подмешаны
// обманки, и порядок там перемешан.
const realTiles = computed(() => (card.value?.components || []).map((c) => c.char));

const canSubmit = computed(() => {
  if (!card.value) return false;
  if (card.value.mechanic === JP_MECH_READING) return typed.value.length > 0;
  if (card.value.mechanic === JP_MECH_BUILD) return tiles.value.length > 0;
  return false;
});

// Обводка отвечает сама, как только знак доведён до конца: отдельная кнопка
// «готово» после последней черты — лишний тап на ровном месте.
// Промахи решают оценку: провёл начисто — «верно», лазил в подсказку или
// мазал — «почти», и карточка вернётся раньше.
function traceDone({ misses }) {
  reveal(misses === 0 ? "right" : "close");
}

function pickOption(i) {
  if (phase.value !== PHASE.ASK) return;
  picked.value = i;
  reveal(i === card.value.correctIndex ? "right" : "wrong");
}

// «Не знаю» — честный ответ, а не поражение. Без него признаться можно только
// ткнув заведомо неверный вариант, и тогда в памяти остаётся именно он.
// Для FSRS это то же «again», что и ошибка: карточку надо переспросить.
function giveUp() {
  if (phase.value !== PHASE.ASK) return;
  reveal("idk");
}

function toggleTile(ch) {
  if (phase.value !== PHASE.ASK) return;
  const at = tiles.value.indexOf(ch);
  if (at >= 0) tiles.value.splice(at, 1);
  else tiles.value.push(ch);
}

function submit() {
  if (phase.value !== PHASE.ASK || !canSubmit.value) return;
  if (card.value.mechanic === JP_MECH_READING) {
    reveal(checkReading());
    return;
  }
  const want = [...realTiles.value].sort().join("");
  const got = [...tiles.value].sort().join("");
  reveal(want === got ? "right" : "wrong");
}

// Чтение проверяется по главному, но валидное чтение не бывает ошибкой:
// оны и куны у кандзи есть и помимо того, который учим сейчас. Такой ответ
// засчитывается как трудный, а не как провал.
function checkReading() {
  const value = jpNormalizeReading(typed.value);
  if (!value) return "wrong";
  if (value === jpNormalizeReading(card.value.mainReading)) return "right";
  const others = [...(card.value.onReadings || []), ...(card.value.kunReadings || [])];
  return others.some((r) => jpNormalizeReading(r) === value) ? "close" : "wrong";
}

// Звук по результату. Ответ с подсказкой звучит как «почти» — он и
// засчитывается как трудный; «не знаю» звучит как ошибка, потому что ею и
// является.
function soundFor(v) {
  if (v === "wrong" || v === "idk") return "wrong";
  return v === "close" || hintUsed.value ? "close" : "right";
}

function reveal(v) {
  verdict.value = v;
  phase.value = PHASE.REVEAL;
  jpPlay(soundFor(v));
  // Арена — про скорость: спрашивать после ответа ещё и уверенность значит
  // отдать половину минуты кнопкам.
  if (isArena.value) {
    rate(v === "right" || v === "close" ? JP_RATING_GOOD : JP_RATING_AGAIN);
  }
}

// Ошибка и «не знаю» ведут себя одинаково: ответ показан, уверенность
// спрашивать не о чем.
const failed = computed(() => verdict.value === "wrong" || verdict.value === "idk");

// --- Отправка ---

async function rate(rating) {
  if (sending.value || !card.value) return;
  sending.value = true;
  const current = card.value;
  try {
    const answer = await answerJpCard({
      clientId: jpClientId(),
      sessionId: session.value?.sessionId,
      cardId: current.cardId,
      rating,
      mechanic: current.mechanic,
      thinkMs: Math.max(0, Date.now() - shownAt.value),
    });
    // Провал возвращает карточку в конец этой же сессии — так и задумано,
    // ошибку надо переспросить, пока она свежая.
    if (answer?.againInSession) {
      queue.value.push({ ...current });
      doneIds.value.delete(current.cardId); // вернулась — значит ещё не закрыта
    } else {
      doneIds.value = new Set(doneIds.value).add(current.cardId);
    }
    advance();
  } catch (e) {
    error.value = e.message || "ответ не сохранился";
  } finally {
    sending.value = false;
  }
}

function advance() {
  const next = index.value + 1;
  if (next >= queue.value.length || timeUp.value) {
    finish();
    return;
  }
  index.value = next;
  nextTick(ask);
}

async function finish() {
  stopTicker();
  phase.value = PHASE.LOADING;
  jpPlay("done");
  try {
    result.value = await finishJpSession(session.value.sessionId, {
      durationSec: Math.round((Date.now() - startedAt.value) / 1000),
    });
  } catch (e) {
    error.value = e.message || "итог не сохранился";
  } finally {
    phase.value = PHASE.DONE;
  }
}

const meaning = computed(() => (card.value?.meaningsRu || []).slice(0, 3).join(", "));

// Разбор карточки по знакам. У слова это его иероглифы с чтениями (приходят с
// карточкой), у кандзи — ключи, из которых он сложен. Показывается одинаково:
// вопрос «из чего это состоит» на обеих карточках один и тот же.
const breakdown = computed(() => {
  const c = card.value;
  if (!c) return [];
  if (c.breakdown?.length) {
    return c.breakdown.map((p) => ({
      char: p.char,
      meaning: (p.meaningsRu || []).join(", "),
      readings: readingsLine(p),
    }));
  }
  return (c.components || []).map((p) => ({
    char: p.char,
    meaning: p.meaningRu,
    readings: "",
  }));
});

function readingsLine(part) {
  const rows = [];
  if (part.onReadings?.length) rows.push(`он ${part.onReadings.join(", ")}`);
  if (part.kunReadings?.length) rows.push(`кун ${part.kunReadings.join(", ")}`);
  return rows.join(" · ");
}

// Механики, где разбор и есть ответ: в сборке из ключей и обводке спрашивают
// ровно состав знака, в различении похожих — сам знак, а в пропуске состав
// знака указывает на то единственное слово из четырёх, где этот знак стоит.
// Во всех остальных разбор до ответа — это то, ради чего слово и разбирают:
// 為替 держится в голове как «делать» плюс «менять», а не как две картинки.
const HINT_BLOCKED = [JP_MECH_BUILD, JP_MECH_TRACE, JP_MECH_TELL_APART, JP_MECH_CLOZE];

const canHint = computed(
  () => breakdown.value.length > 0 && !HINT_BLOCKED.includes(card.value?.mechanic),
);

function openHint() {
  hintOpen.value = !hintOpen.value;
  hintUsed.value = true;
}

// Тап по знаку в разборе открывает его целиком: как пишется, из каких ключей
// сложен и как выглядит в живой фразе. Это подсказка того же рода, что и сам
// разбор, поэтому она так же снимает «Легко».
function openSheet(char) {
  if (!char) return;
  sheetChar.value = char;
  hintUsed.value = true;
}

// Примеры к слову. До ответа это подсказка посильнее разбора — в переводе
// фразы значение слова видно прямо, — поэтому «Легко» после неё не даётся.
function openWordSheet() {
  if (!card.value) return;
  sheetWord.value = card.value.char;
  if (phase.value === PHASE.ASK) hintUsed.value = true;
}

const isWordCard = computed(() => card.value?.itemType === "word");

// Ответ с подсказкой — это не «вспомнил»: интервал должен вырасти меньше,
// иначе карточка вернётся тогда, когда её уже нет в голове.
const goodRating = computed(() =>
  hintUsed.value || verdict.value === "close" ? JP_RATING_HARD : JP_RATING_GOOD,
);

const verdictLabel = computed(() => {
  if (verdict.value === "idk") return "Не знаю — вот ответ";
  if (verdict.value === "wrong") return "Неверно";
  if (verdict.value === "close") return "Тоже чтение";
  return hintUsed.value ? "Верно, с подсказкой" : "Верно";
});

// Что можно произнести на этой карточке. У ключа звучания нет: это часть
// знака, а не слово.
const speakable = computed(() => (canSpeakJapanese() ? speakableOf(card.value) : ""));

// До ответа звук закрыт только там, где чтение и есть ответ: ввод чтения и
// выбор «он или кун». В пропуске звучало бы не предложение, а чтение знака —
// то есть подсказка, какое слово вырезано. Во всём остальном звук нужен именно
// до ответа: знак, которого ни разу не слышал, остаётся картинкой.
// Где чтение и есть ответ — там его не показывают и не проигрывают. В
// «произнеси вслух» это особенно важно: с подсказкой на экране проверяется
// произношение, а без неё — ещё и то, что чтение вспомнилось. В «какой знак
// это значит» звук сузил бы выбор до одного варианта.
const SILENT_MECHANICS = [
  JP_MECH_READING,
  JP_MECH_READING_CHOICE,
  JP_MECH_READING_IN_WORD,
  JP_MECH_CLOZE,
  JP_MECH_SPEAK,
  JP_MECH_KANJI_BY_MEANING,
  JP_MECH_KANJI_BY_READING,
];

const speakableNow = computed(() => {
  if (!speakable.value || phase.value !== PHASE.ASK) return "";
  return SILENT_MECHANICS.includes(mechanic.value) ? "" : speakable.value;
});

// Чтение над знаком — та же фуригана, что в книге: слово, которое не
// прочитать, остаётся картинкой, и вслух его не повторишь. Стоит целиком над
// словом, а не по знакам: разбить чтение по иероглифам нечем — 為替 читается
// かわせ целиком, и «か» к 為 привязать не выйдет (фуриганы в справочнике нет).
//
// Скрыто ровно там же, где и звук, и только до ответа: на механиках, где
// чтение и есть ответ, оно бы его и выдало.
const readingNow = computed(() => {
  const c = card.value;
  if (!c) return "";
  if (phase.value === PHASE.ASK && !teaching.value && SILENT_MECHANICS.includes(mechanic.value)) {
    return "";
  }
  // Оны в справочнике записаны катаканой. Читает он кану любую, но учит
  // чтения хираганой — как в WaniKani, чей метод модуль и повторяет.
  return c.reading || jpKatakanaToHiragana(c.mainReading || "");
});

function say() {
  speakJapanese(speakable.value);
}

onMounted(() => {
  primeJapaneseVoice();
  begin(1);
});
onBeforeUnmount(stopTicker);
</script>

<template>
  <div class="jps">
    <!-- Шапка: сколько осталось времени и карточек. Ничего нажимаемого, кроме
         выхода: он должен быть далеко от кнопок ответа. -->
    <header class="jps-top">
      <button class="jps-close" aria-label="Выйти" @click="emit('exit')">✕</button>
      <div class="jps-progress">
        <div class="jps-progress-fill" :style="{ width: `${progressPct}%` }" />
      </div>
      <span class="jps-time" :class="{ 'is-up': timeUp }">{{ timeLabel }}</span>
    </header>

    <div v-if="phase === PHASE.LOADING" class="jps-mid jps-muted">Собираю…</div>

    <div v-else-if="phase === PHASE.EMPTY" class="jps-mid">
      <p class="jps-muted">
        {{
          error ||
          (isArena
            ? "Арена гоняет только закреплённое — пока закреплять нечего."
            : isAhead
              ? "Кончилось совсем: ни новых единиц в наборах, ни повторений впереди."
              : "На сегодня норма закрыта.")
        }}
      </p>
      <div class="jps-done-actions">
        <button
          v-if="!isArena && !isAhead && !error"
          class="m-btn m-btn-accent jps-wide"
          @click="studyAhead"
        >
          Заниматься дальше
        </button>
        <p v-if="!isArena && !isAhead && !error" class="jps-muted jps-hint-sm">
          Возьмём новое сверх нормы, а потом ближайшие повторения наперёд
        </p>
        <button class="m-btn" @click="emit('exit')">Назад</button>
      </div>
    </div>

    <!-- Итог раунда -->
    <div v-else-if="phase === PHASE.DONE" class="jps-mid jps-done">
      <div class="jps-done-acc">
        <template v-if="isArena">{{ result?.correct ?? 0 }}</template>
        <template v-else>{{ result?.accuracyPct ?? 0 }}%</template>
      </div>
      <div class="jps-muted">
        <template v-if="isArena">
          верных за минуту из {{ result?.cards ?? 0 }}
          <template v-if="session?.bestScore"> · рекорд {{ session.bestScore }}</template>
        </template>
        <template v-else>
          {{ result?.correct ?? 0 }} из {{ result?.cards ?? 0 }} · +{{ result?.xp ?? 0 }} XP
        </template>
      </div>

      <div class="jps-done-rows">
        <div v-if="result?.streakGained" class="jps-done-row is-good">
          🔥 Стрик {{ result.streak }} — день закрыт
        </div>
        <div v-if="result?.disciplineMarked" class="jps-done-row">🎯 Отмечено в трекере</div>
        <div v-if="result?.newLearned" class="jps-done-row">
          ✅ Выучено всего: {{ result.newLearned }}
        </div>
        <div v-if="result?.dueTomorrow" class="jps-done-row">
          🕓 Завтра ждут: {{ result.dueTomorrow }}
        </div>
        <div v-for="a in result?.achievements || []" :key="a.code" class="jps-done-row is-good">
          🏅 {{ a.title }}
        </div>
      </div>

      <div class="jps-done-actions">
        <button class="m-btn m-btn-accent jps-again" @click="begin(round + 1)">
          <template v-if="isArena">Ещё минута</template>
          <template v-else>
            Ещё раунд
            <span v-if="result?.nextRoundXpMultiplier > 1" class="jps-mult">
              ×{{ result.nextRoundXpMultiplier }}
            </span>
          </template>
        </button>
        <button class="m-btn" @click="emit('exit')">Хватит</button>
      </div>
    </div>

    <template v-else-if="card">
      <!-- Вопрос -->
      <div class="jps-mid">
        <div class="jps-kind">
          {{ jpItemLabel(card.itemType) }}
          <span v-if="card.isNew" class="jps-new">новое</span>
        </div>

        <!-- Урок: единицу видят впервые. Сначала показываем всё, что о ней
             знаем, и только по «понял» спрашиваем. -->
        <template v-if="teaching">
          <div class="jps-char-box">
            <div v-if="card.reading || card.mainReading" class="jps-furigana">
              {{ card.reading || card.mainReading }}
            </div>
            <div class="jps-char" :class="{ 'is-word': card.itemType === 'word' }">
              {{ card.char }}
            </div>
          </div>
          <div class="jps-lesson-meaning">{{ meaning }}</div>
          <div v-if="speakable" class="jps-tools">
            <button class="jps-say-btn" @click="say">🔊 Как звучит</button>
          </div>
          <div v-if="breakdown.length" class="jps-break">
            <button
              v-for="p in breakdown"
              :key="p.char"
              class="jps-break-row"
              @click="openSheet(p.char)"
            >
              <span class="jps-break-char">{{ p.char }}</span>
              <span class="jps-break-body">
                <span class="jps-break-meaning">{{ p.meaning }}</span>
                <span v-if="p.readings" class="jps-break-readings">{{ p.readings }}</span>
              </span>
              <span class="jps-break-more">✎</span>
            </button>
          </div>
          <div v-if="card.examples?.length" class="jps-break">
            <div v-for="e in card.examples" :key="e.char" class="jps-break-row is-flat">
              <span class="jps-break-char">{{ e.char }}</span>
              <span class="jps-break-body">
                <span class="jps-break-meaning">{{ e.meaningRu }}</span>
              </span>
            </div>
          </div>
          <div v-if="card.mnemonic" class="jps-mnemonic">{{ card.mnemonic }}</div>
        </template>

        <!-- Обратные направления: сверху вопрос, знак лежит в вариантах. -->
        <template v-else-if="asksForKanji && phase === PHASE.ASK">
          <div class="jps-ask-meaning">
            <template v-if="mechanic === JP_MECH_KANJI_BY_READING">
              {{ card.reading || card.mainReading }}
            </template>
            <template v-else>{{ meaning }}</template>
          </div>
          <div class="jps-hint jps-hint-sm">
            {{ mechanic === JP_MECH_KANJI_BY_READING ? "какой это знак" : "какой знак это значит" }}
          </div>
          <div v-if="mechanic === JP_MECH_KANJI_BY_READING && speakable" class="jps-tools">
            <button class="jps-say-btn" @click="say">🔊 Послушать</button>
          </div>
        </template>

        <!-- Пропуск в предложении: вопрос — сама фраза, знака над ней нет. -->
        <template v-else-if="card.mechanic === JP_MECH_CLOZE">
          <div class="jps-sentence">{{ card.sentence }}</div>
          <div v-if="card.sentenceTranslation" class="jps-hint">
            {{ card.sentenceTranslation }}
          </div>
        </template>

        <!-- В различении похожих начертание и есть ответ: сверху показывается
             значение, а знаки лежат в вариантах. -->
        <div
          v-else-if="phase === PHASE.ASK && card.mechanic === JP_MECH_TELL_APART"
          class="jps-ask-meaning jps-ask-plain"
        >
          {{ meaning }}
        </div>

        <!-- Он или кун: слово целиком, спрашиваемый знак подсвечен. -->
        <div v-else-if="card.mechanic === JP_MECH_READING_IN_WORD" class="jps-word-focus">
          <span
            v-for="(ch, i) in [...card.char]"
            :key="i"
            :class="{ 'is-focus': ch === card.focus }"
            >{{ ch }}</span
          >
        </div>

        <div
          v-else-if="!(phase === PHASE.ASK && card.mechanic === JP_MECH_TRACE)"
          class="jps-char-box"
        >
          <div v-if="readingNow" class="jps-furigana">{{ readingNow }}</div>
          <div class="jps-char" :class="{ 'is-word': card.itemType === 'word' }">
            {{ card.char }}
          </div>
        </div>

        <div
          v-if="!teaching && card.mechanic === JP_MECH_READING_IN_WORD"
          class="jps-hint jps-hint-sm"
        >
          как читается {{ card.focus }} в этом слове
        </div>

        <!-- В «собери из ключей» и «введи чтение» значение — это условие
             задачи, а не ответ, поэтому видно сразу. -->
        <!-- В различении похожих значение и есть вопрос, оно уже стоит выше:
             второй раз тем же текстом — просто шум. -->
        <div
          v-if="
            !teaching &&
            !asksForKanji &&
            card.mechanic !== JP_MECH_MEANING &&
            card.mechanic !== JP_MECH_TELL_APART
          "
          class="jps-hint"
        >
          {{ meaning }}
        </div>
        <div v-if="!teaching && mechanic === JP_MECH_READING" class="jps-hint jps-hint-sm">
          главное чтение
        </div>
        <div v-if="!teaching && mechanic === JP_MECH_READING_CHOICE" class="jps-hint jps-hint-sm">
          как это читается
        </div>

        <!-- Звук и разбор — до ответа, а не после него. -->
        <div v-if="!teaching && (speakableNow || canHint || isWordCard)" class="jps-tools">
          <button v-if="speakableNow" class="jps-say-btn" @click="say">🔊 Как звучит</button>
          <button v-if="canHint" class="jps-say-btn" @click="openHint">
            {{ hintOpen ? "🧩 Скрыть разбор" : "🧩 Разобрать по знакам" }}
          </button>
          <button v-if="isWordCard" class="jps-say-btn" @click="openWordSheet">📖 Примеры</button>
        </div>

        <div v-if="hintOpen && phase === PHASE.ASK && !teaching" class="jps-break">
          <button
            v-for="p in breakdown"
            :key="p.char"
            class="jps-break-row"
            @click="openSheet(p.char)"
          >
            <span class="jps-break-char">{{ p.char }}</span>
            <span class="jps-break-body">
              <span class="jps-break-meaning">{{ p.meaning }}</span>
              <span v-if="p.readings" class="jps-break-readings">{{ p.readings }}</span>
            </span>
            <span class="jps-break-more">✎</span>
          </button>
        </div>

        <!-- Разбор после ответа -->
        <div v-if="phase === PHASE.REVEAL" class="jps-answer" :class="`is-${verdict}`">
          <div class="jps-answer-head">{{ verdictLabel }}</div>
          <div class="jps-answer-body">
            <template v-if="mechanic === JP_MECH_READING || mechanic === JP_MECH_SPEAK">
              {{ card.mainReading }}
              <span v-if="verdict === 'close'" class="jps-muted"> — тоже чтение этого знака</span>
            </template>
            <template v-else-if="asksForKanji">
              {{ card.char }} — {{ meaning }}
            </template>
            <template v-else-if="card.mechanic === JP_MECH_BUILD">
              {{ realTiles.join(" + ") }}
            </template>
            <template v-else-if="card.mechanic === JP_MECH_TRACE">{{ meaning }}</template>
            <template v-else-if="card.mechanic === JP_MECH_CLOZE">
              {{ card.options?.[card.correctIndex] }}
            </template>
            <template v-else-if="card.mechanic === JP_MECH_TELL_APART">
              {{ card.options?.[card.correctIndex] }} — {{ meaning }}
            </template>
            <template v-else>{{ card.options?.[card.correctIndex] }}</template>
          </div>

          <!-- Звук только после ответа: до него он подсказывал бы чтение,
               а на механике ввода чтения — прямо выдавал ответ. -->
          <div v-if="speakable || isWordCard" class="jps-tools">
            <button v-if="speakable" class="jps-say-btn" @click="say">🔊 {{ speakable }}</button>
            <button v-if="isWordCard" class="jps-say-btn" @click="openWordSheet">
              📖 Примеры
            </button>
          </div>
          <!-- Разбор после ответа показывается всегда: карточку закрывают
               именно здесь, и это последняя возможность увидеть, из чего
               сложены слово или знак. -->
          <div v-if="breakdown.length" class="jps-break">
            <button
              v-for="p in breakdown"
              :key="p.char"
              class="jps-break-row"
              @click="openSheet(p.char)"
            >
              <span class="jps-break-char">{{ p.char }}</span>
              <span class="jps-break-body">
                <span class="jps-break-meaning">{{ p.meaning }}</span>
                <span v-if="p.readings" class="jps-break-readings">{{ p.readings }}</span>
              </span>
              <span class="jps-break-more">✎</span>
            </button>
          </div>
          <div v-if="card.mnemonic" class="jps-mnemonic">{{ card.mnemonic }}</div>
        </div>
      </div>

      <!-- Всё нажимаемое — здесь, в нижней трети. -->
      <div class="jps-bottom">
        <template v-if="teaching">
          <button class="m-btn m-btn-accent jps-wide" @click="learned">Понял, спрашивай</button>
        </template>

        <template v-else-if="phase === PHASE.ASK">
          <div
            v-if="
              mechanic === JP_MECH_MEANING ||
              mechanic === JP_MECH_READING_IN_WORD ||
              mechanic === JP_MECH_READING_CHOICE ||
              mechanic === JP_MECH_CLOZE
            "
            class="jps-options"
          >
            <button
              v-for="(o, i) in card.options"
              :key="i"
              class="jps-option"
              @click="pickOption(i)"
            >
              {{ o }}
            </button>
          </div>

          <!-- Вопросы, где ответ это сам знак: варианты крупные и в сетку,
               а не строками с текстом. -->
          <div v-else-if="mechanic === JP_MECH_TELL_APART || asksForKanji" class="jps-glyphs">
            <button
              v-for="(o, i) in card.options"
              :key="i"
              class="jps-glyph"
              @click="pickOption(i)"
            >
              {{ o }}
            </button>
          </div>

          <!-- Произнести вслух: слушает браузер. -->
          <template v-else-if="mechanic === JP_MECH_SPEAK">
            <JpSpeakCheck
              :expect="card.mainReading"
              :also-accept="[...(card.onReadings || []), ...(card.kunReadings || [])]"
              @done="reveal($event.verdict)"
            />
          </template>

          <template v-else-if="mechanic === JP_MECH_READING">
            <div class="jps-typed" :class="{ 'is-empty': !typed }">{{ typed || "…" }}</div>
            <JpKanaKeyboard v-model="typed" />
            <button class="m-btn m-btn-accent jps-wide" :disabled="!canSubmit" @click="submit">
              Ответить
            </button>
          </template>

          <template v-else-if="mechanic === JP_MECH_TRACE">
            <div class="jps-trace-hint">Обведи знак по контуру, черту за чертой</div>
            <JpTraceCanvas :paths="card.strokePaths || []" :char="card.char" @done="traceDone" />
          </template>

          <template v-else>
            <div class="jps-built">
              <span v-for="(t, i) in tiles" :key="`${t}-${i}`" class="jps-built-tile">{{ t }}</span>
              <span v-if="!tiles.length" class="jps-muted">Выбери ключи</span>
            </div>
            <div class="jps-tiles">
              <button
                v-for="(o, i) in card.options"
                :key="`${o}-${i}`"
                class="jps-tile"
                :class="{ 'is-on': tiles.includes(o) }"
                @click="toggleTile(o)"
              >
                {{ o }}
              </button>
            </div>
            <button class="m-btn m-btn-accent jps-wide" :disabled="!canSubmit" @click="submit">
              Готово
            </button>
          </template>

          <!-- «Не знаю» есть на любой механике: это ответ, а не отказ от него,
               и он должен быть под рукой, а не через промах по вариантам. -->
          <button class="jps-idk" @click="giveUp">Не знаю</button>
        </template>

        <!-- Оценки. При ошибке уверенность не спрашиваем — она уже известна. -->
        <div v-else class="jps-rates">
          <template v-if="failed">
            <button class="jps-rate is-again" :disabled="sending" @click="rate(JP_RATING_AGAIN)">
              Дальше
            </button>
          </template>
          <template v-else>
            <button class="jps-rate is-hard" :disabled="sending" @click="rate(JP_RATING_HARD)">
              Трудно
            </button>
            <button class="jps-rate is-good" :disabled="sending" @click="rate(goodRating)">
              Хорошо
            </button>
            <button
              v-if="verdict === 'right' && !hintUsed"
              class="jps-rate is-easy"
              :disabled="sending"
              @click="rate(JP_RATING_EASY)"
            >
              Легко
            </button>
          </template>
        </div>

        <p v-if="error" class="jps-err">{{ error }}</p>
      </div>
    </template>

    <JpKanjiSheet v-if="sheetChar" :char="sheetChar" @close="sheetChar = ''" />
    <JpWordSheet v-if="sheetWord" :text="sheetWord" @close="sheetWord = ''" />
  </div>
</template>

<style scoped>
.jps {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  color: var(--m-text, #e6e8ef);
  gap: 10px;
}

/* --- Шапка --- */

.jps-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.jps-close {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-muted, #7a7f8e);
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jps-progress {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--m-card-2, #22242d);
  overflow: hidden;
}

.jps-progress-fill {
  height: 100%;
  background: var(--m-accent, #6e4aff);
  transition: width 0.2s ease;
}

.jps-time {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--m-muted, #7a7f8e);
}

.jps-time.is-up {
  color: var(--m-yellow, #ffd666);
}

/* --- Вопрос --- */

.jps-mid {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  min-height: 0;
  /* Раскрытый разбор — это ещё три-четыре строки: пусть прокручивается вопрос,
     а не выдавливаются кнопки ответа из нижней трети. */
  overflow-y: auto;
}

.jps-kind {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--m-muted, #7a7f8e);
}

.jps-new {
  margin-left: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(110, 74, 255, 0.18);
  color: #a58bff;
}

.jps-char-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

/* Чтение стоит над словом и заметно мельче его: читают знак, а кана — подпись
   к нему. */
.jps-furigana {
  font-size: 20px;
  letter-spacing: 2px;
  color: #a58bff;
}

/* Урок: значение крупнее подсказки — это то, ради чего показывают знак. */
.jps-lesson-meaning {
  font-size: 20px;
  font-weight: 600;
  color: #e6e8ef;
  line-height: 1.3;
}

.jps-break-row.is-flat {
  cursor: default;
}

/* Иероглиф — главное на экране, поэтому он занимает столько, сколько может. */
.jps-char {
  font-size: 92px;
  line-height: 1.05;
  font-weight: 500;
}

.jps-char.is-word {
  font-size: 56px;
}

.jps-hint {
  font-size: 16px;
  color: #cfd3e0;
}

.jps-hint-sm {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--m-muted, #7a7f8e);
}

.jps-muted {
  color: var(--m-muted, #7a7f8e);
  font-size: 14px;
}

/* --- Разбор --- */

.jps-answer {
  width: 100%;
  border-radius: 14px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card, #1b1d25);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jps-answer.is-right {
  border-color: rgba(99, 201, 79, 0.5);
}

.jps-answer.is-close {
  border-color: rgba(255, 214, 102, 0.5);
}

.jps-answer.is-wrong {
  border-color: rgba(229, 72, 77, 0.5);
}

.jps-answer.is-idk {
  border-color: rgba(255, 214, 102, 0.5);
}

.jps-answer-head {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--m-muted, #7a7f8e);
}

.jps-answer-body {
  font-size: 20px;
  font-weight: 600;
}

/* Разбор по знакам: строка на знак, сам знак крупный и слева — его ищут
   глазами, а не читают. */
.jps-break {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jps-break-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--m-card-2, #22242d);
  color: inherit;
  font: inherit;
  padding: 6px 10px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jps-break-row:active {
  border-color: var(--m-line, #262933);
  background: #2b2e39;
}

/* Значок «есть что посмотреть»: без него строка выглядит подписью, и никто
   не догадается по ней тапнуть. */
.jps-break-more {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--m-muted, #7a7f8e);
}

.jps-break-char {
  flex-shrink: 0;
  min-width: 34px;
  text-align: center;
  font-size: 28px;
  line-height: 1.1;
}

.jps-break-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.jps-break-meaning {
  font-size: 14px;
  color: #cfd3e0;
}

.jps-break-readings {
  font-size: 12px;
  color: var(--m-muted, #7a7f8e);
}

.jps-say {
  display: flex;
  justify-content: center;
}

/* Звук и разбор стоят рядом: обе кнопки про «помоги разобраться», и разносить
   их по экрану значит прятать вторую. */
.jps-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.jps-say-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 11px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jps-say-btn:active {
  background: #2b2e39;
}

.jps-mnemonic {
  font-size: 13px;
  color: #cfd3e0;
  line-height: 1.4;
}

/* --- Нижняя треть --- */

.jps-bottom {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 4px;
}

.jps-options {
  display: grid;
  gap: 8px;
}

.jps-option {
  min-height: 56px;
  padding: 8px 12px;
  border-radius: 13px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jps-option:active {
  background: #2b2e39;
}

.jps-trace-hint {
  text-align: center;
  font-size: 13px;
  color: var(--m-muted, #7a7f8e);
}

/* Фраза читается, а не разглядывается: кегль умеренный, строки переносятся. */
.jps-sentence {
  font-size: 27px;
  line-height: 1.5;
  padding: 0 4px;
}

.jps-ask-meaning {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.25;
}

/* Слово целиком, спрашиваемый знак подсвечен: вопрос «как читается вот этот
   здесь» иначе не поставить. */
.jps-word-focus {
  font-size: 60px;
  line-height: 1.1;
}

.jps-word-focus .is-focus {
  color: #a58bff;
}

.jps-glyphs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.jps-glyph {
  min-height: 84px;
  border-radius: 13px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  font-size: 44px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jps-glyph:active {
  background: #2b2e39;
}

.jps-typed {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid var(--m-line, #262933);
  background: #16171d;
  font-size: 26px;
  letter-spacing: 2px;
}

.jps-typed.is-empty {
  color: #4a4e5a;
}

.jps-wide {
  width: 100%;
  min-height: 52px;
}

.jps-built {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 12px;
  border: 1px solid var(--m-line, #262933);
  background: #16171d;
}

.jps-built-tile {
  font-size: 26px;
}

.jps-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.jps-tile {
  min-width: 60px;
  min-height: 60px;
  border-radius: 13px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  font-size: 28px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jps-tile.is-on {
  background: var(--m-accent, #6e4aff);
  border-color: var(--m-accent, #6e4aff);
  color: #fff;
}

/* «Не знаю» не спорит с вариантами за внимание: это выход, а не ответ, к
   которому подталкивают. */
.jps-idk {
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid var(--m-line, #262933);
  background: transparent;
  color: var(--m-muted, #7a7f8e);
  font-size: 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jps-idk:active {
  background: var(--m-card-2, #22242d);
}

.jps-rates {
  display: flex;
  gap: 8px;
}

.jps-rate {
  flex: 1;
  min-height: 60px;
  border-radius: 14px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jps-rate:disabled {
  opacity: 0.5;
}

.jps-rate.is-again {
  background: #2a1c1f;
  border-color: #4a2b30;
  color: #ff9ea0;
}

.jps-rate.is-hard {
  color: var(--m-yellow, #ffd666);
}

.jps-rate.is-good {
  background: var(--m-accent, #6e4aff);
  border-color: var(--m-accent, #6e4aff);
  color: #fff;
}

.jps-rate.is-easy {
  color: var(--m-green, #63c94f);
}

.jps-err {
  margin: 0;
  font-size: 12px;
  color: var(--m-red, #e5484d);
  text-align: center;
}

/* --- Итог --- */

.jps-done {
  gap: 14px;
}

.jps-done-acc {
  font-size: 56px;
  font-weight: 700;
  line-height: 1;
}

.jps-done-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.jps-done-row {
  border-radius: 12px;
  background: var(--m-card, #1b1d25);
  border: 1px solid var(--m-line, #262933);
  padding: 9px 12px;
  font-size: 14px;
  text-align: left;
}

.jps-done-row.is-good {
  border-color: rgba(99, 201, 79, 0.45);
}

.jps-done-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* «Ещё раунд» — то, ради чего экран итога вообще существует: он вытягивает
   шесть минут в двадцать. Поэтому он крупный и первый. */
.jps-again {
  width: 100%;
  min-height: 60px;
  font-size: 17px;
}

.jps-mult {
  margin-left: 8px;
  font-size: 14px;
  opacity: 0.85;
}
</style>
