<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import JpKanaKeyboard from "./JpKanaKeyboard.vue";
import JpTraceCanvas from "./JpTraceCanvas.vue";
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
  JP_RATING_AGAIN,
  JP_RATING_HARD,
  JP_RATING_GOOD,
  JP_RATING_EASY,
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
});
const emit = defineEmits(["exit"]);

const PHASE = { LOADING: "loading", ASK: "ask", REVEAL: "reveal", DONE: "done", EMPTY: "empty" };

const phase = ref(PHASE.LOADING);
const error = ref("");
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

const startedAt = ref(0);
const shownAt = ref(0);
const elapsed = ref(0);
let ticker = null;

const card = computed(() => queue.value[index.value] || null);
const total = computed(() => queue.value.length);
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
      kind: props.kind,
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
  shownAt.value = Date.now();
  phase.value = PHASE.ASK;
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

function reveal(v) {
  verdict.value = v;
  phase.value = PHASE.REVEAL;
}

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
    if (answer?.againInSession) queue.value.push({ ...current });
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

// Что можно произнести на этой карточке. У ключа звучания нет: это часть
// знака, а не слово.
const speakable = computed(() => (canSpeakJapanese() ? speakableOf(card.value) : ""));

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
        <div
          class="jps-progress-fill"
          :style="{ width: total ? `${(index / total) * 100}%` : '0%' }"
        />
      </div>
      <span class="jps-time" :class="{ 'is-up': timeUp }">{{ timeLabel }}</span>
    </header>

    <div v-if="phase === PHASE.LOADING" class="jps-mid jps-muted">Собираю…</div>

    <div v-else-if="phase === PHASE.EMPTY" class="jps-mid">
      <p class="jps-muted">{{ error || "На сегодня всё — повторять нечего." }}</p>
      <button class="m-btn" @click="emit('exit')">Назад</button>
    </div>

    <!-- Итог раунда -->
    <div v-else-if="phase === PHASE.DONE" class="jps-mid jps-done">
      <div class="jps-done-acc">{{ result?.accuracyPct ?? 0 }}%</div>
      <div class="jps-muted">
        {{ result?.correct ?? 0 }} из {{ result?.cards ?? 0 }} · +{{ result?.xp ?? 0 }} XP
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
      </div>

      <div class="jps-done-actions">
        <button class="m-btn m-btn-accent jps-again" @click="begin(round + 1)">
          Ещё раунд
          <span v-if="result?.nextRoundXpMultiplier > 1" class="jps-mult">
            ×{{ result.nextRoundXpMultiplier }}
          </span>
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

        <div
          v-if="!(phase === PHASE.ASK && card.mechanic === JP_MECH_TRACE)"
          class="jps-char"
          :class="{ 'is-word': card.itemType === 'word' }"
        >
          {{ card.char }}
        </div>

        <!-- В «собери из ключей» и «введи чтение» значение — это условие
             задачи, а не ответ, поэтому видно сразу. -->
        <div v-if="card.mechanic !== JP_MECH_MEANING" class="jps-hint">{{ meaning }}</div>
        <div v-if="card.mechanic === JP_MECH_READING" class="jps-hint jps-hint-sm">
          главное чтение
        </div>

        <!-- Разбор после ответа -->
        <div v-if="phase === PHASE.REVEAL" class="jps-answer" :class="`is-${verdict}`">
          <div class="jps-answer-head">
            {{ verdict === "right" ? "Верно" : verdict === "close" ? "Тоже чтение" : "Неверно" }}
          </div>
          <div class="jps-answer-body">
            <template v-if="card.mechanic === JP_MECH_READING">
              {{ card.mainReading }}
              <span v-if="verdict === 'close'" class="jps-muted"> — но учим это</span>
            </template>
            <template v-else-if="card.mechanic === JP_MECH_BUILD">
              {{ realTiles.join(" + ") }}
            </template>
            <template v-else-if="card.mechanic === JP_MECH_TRACE">{{ meaning }}</template>
            <template v-else>{{ card.options?.[card.correctIndex] }}</template>
          </div>

          <!-- Звук только после ответа: до него он подсказывал бы чтение,
               а на механике ввода чтения — прямо выдавал ответ. -->
          <div v-if="speakable" class="jps-say">
            <button class="jps-say-btn" @click="say">🔊 {{ speakable }}</button>
          </div>
          <div v-if="card.components?.length" class="jps-parts">
            <span v-for="c in card.components" :key="c.char" class="jps-part">
              <b>{{ c.char }}</b> {{ c.meaningRu }}
            </span>
          </div>
          <div v-if="card.mnemonic" class="jps-mnemonic">{{ card.mnemonic }}</div>
        </div>
      </div>

      <!-- Всё нажимаемое — здесь, в нижней трети. -->
      <div class="jps-bottom">
        <template v-if="phase === PHASE.ASK">
          <div v-if="card.mechanic === JP_MECH_MEANING" class="jps-options">
            <button
              v-for="(o, i) in card.options"
              :key="i"
              class="jps-option"
              @click="pickOption(i)"
            >
              {{ o }}
            </button>
          </div>

          <template v-else-if="card.mechanic === JP_MECH_READING">
            <div class="jps-typed" :class="{ 'is-empty': !typed }">{{ typed || "…" }}</div>
            <JpKanaKeyboard v-model="typed" />
            <button class="m-btn m-btn-accent jps-wide" :disabled="!canSubmit" @click="submit">
              Ответить
            </button>
          </template>

          <template v-else-if="card.mechanic === JP_MECH_TRACE">
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
        </template>

        <!-- Оценки. При ошибке уверенность не спрашиваем — она уже известна. -->
        <div v-else class="jps-rates">
          <template v-if="verdict === 'wrong'">
            <button class="jps-rate is-again" :disabled="sending" @click="rate(JP_RATING_AGAIN)">
              Дальше
            </button>
          </template>
          <template v-else>
            <button class="jps-rate is-hard" :disabled="sending" @click="rate(JP_RATING_HARD)">
              Трудно
            </button>
            <button
              class="jps-rate is-good"
              :disabled="sending"
              @click="rate(verdict === 'close' ? JP_RATING_HARD : JP_RATING_GOOD)"
            >
              Хорошо
            </button>
            <button
              v-if="verdict === 'right'"
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

.jps-parts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.jps-part {
  font-size: 12px;
  color: var(--m-muted, #7a7f8e);
  background: var(--m-card-2, #22242d);
  border-radius: 8px;
  padding: 3px 8px;
}

.jps-part b {
  color: #cfd3e0;
  font-size: 14px;
  margin-right: 3px;
}

.jps-say {
  display: flex;
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
