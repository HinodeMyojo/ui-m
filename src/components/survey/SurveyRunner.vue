<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { flatQuestions, isAnswered, scaleRange } from "./surveyFormat.js";
import { surveyImageSrc } from "@/components/surveyApi.js";

// Прохождение опроса: по одному вопросу на экран, прогресс сверху, «назад» и
// «далее» снизу, карта вопросов — чтобы прыгнуть к любому. Последний экран —
// сводка: что осталось без ответа, и кнопка «Отправить».
//
// Компонент ничего не сохраняет сам: отдаёт ответы наверх через v-model, а
// хозяин решает, слать ли их на сервер (ссылка) или нет (предпросмотр).

const props = defineProps({
  definition: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
  // Подпись о сохранении: "", "saving", "saved", "error".
  saveState: { type: String, default: "" },
  submitting: { type: Boolean, default: false },
  submitError: { type: String, default: "" },
  // Отправлен ли уже: тогда кнопка зовётся «Сохранить изменения».
  submitted: { type: Boolean, default: false },
  preview: { type: Boolean, default: false },
  // С какого вопроса начать: "first-unanswered" или номер.
  start: { type: [String, Number], default: "first-unanswered" },
});
const emit = defineEmits(["update:modelValue", "submit", "close"]);

const items = computed(() => flatQuestions(props.definition));
const total = computed(() => items.value.length);
const answers = computed(() => props.modelValue || {});
const answeredCount = computed(
  () => items.value.filter((i) => isAnswered(answers.value[i.question.id])).length,
);

// pos === total — экран сводки. Стартовая позиция считается сразу, а не в
// onMounted: иначе вернувшийся человек видел мелькнувший первый вопрос.
const pos = ref(startPosition());
const mapOpen = ref(false);
const zoomSrc = ref("");
const limitHint = ref("");
// Открыт ли «свой вариант» до того, как в нём что-то написали.
const otherOpen = reactive({});
const scroller = ref(null);
let advanceTimer = 0;

const current = computed(() => items.value[pos.value] || null);
const onReview = computed(() => pos.value >= total.value);
const unanswered = computed(() => items.value.filter((i) => !isAnswered(answers.value[i.question.id])));
const missingRequired = computed(() => unanswered.value.filter((i) => i.question.required));

const shortOnChoices = computed(() =>
  items.value.filter((i) => {
    const q = i.question;
    if (q.type !== "multi" || !q.minChoices) return false;
    const a = answers.value[q.id];
    if (!isAnswered(a)) return false;
    return pickedCount(q, a) < q.minChoices;
  }),
);
const canSubmit = computed(
  () => missingRequired.value.length === 0 && shortOnChoices.value.length === 0 && total.value > 0,
);

function startPosition() {
  const list = flatQuestions(props.definition);
  if (typeof props.start === "number") return Math.max(0, Math.min(props.start, list.length));
  const first = list.findIndex((i) => !isAnswered((props.modelValue || {})[i.question.id]));
  return first === -1 ? list.length : first;
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  clearTimeout(advanceTimer);
});

watch(pos, async () => {
  clearTimeout(advanceTimer);
  limitHint.value = "";
  mapOpen.value = false;
  await nextTick();
  scroller.value?.scrollTo?.({ top: 0 });
});

// --- Ответы ---

function answerOf(q) {
  return answers.value[q.id] || {};
}

function put(q, answer) {
  const next = { ...answers.value };
  if (isAnswered(answer)) next[q.id] = answer;
  else delete next[q.id];
  emit("update:modelValue", next);
}

function pickedCount(q, a) {
  return (a.options?.length || 0) + (a.other?.trim() || otherOpen[q.id] ? 1 : 0);
}

function isOn(q, optionId) {
  return (answerOf(q).options || []).includes(optionId);
}

function otherActive(q) {
  return !!otherOpen[q.id] || !!answerOf(q).other;
}

function toggle(q, optionId) {
  const a = answerOf(q);
  if (q.type === "single") {
    const wasOn = isOn(q, optionId);
    otherOpen[q.id] = false;
    put(q, { options: wasOn ? [] : [optionId] });
    // Один ответ — сразу дальше: на телефоне лишнее нажатие «Далее» после
    // каждого вопроса утомляет. Передумала — «назад» вернёт.
    if (!wasOn) {
      const at = pos.value;
      advanceTimer = setTimeout(() => {
        if (pos.value === at) next();
      }, 380);
    }
    return;
  }
  const list = [...(a.options || [])];
  const at = list.indexOf(optionId);
  if (at >= 0) {
    list.splice(at, 1);
  } else {
    if (q.maxChoices && pickedCount(q, a) >= q.maxChoices) {
      limitHint.value = `Можно выбрать не больше ${q.maxChoices}`;
      return;
    }
    list.push(optionId);
  }
  limitHint.value = "";
  put(q, { ...a, options: list });
}

function toggleOther(q) {
  const a = answerOf(q);
  clearTimeout(advanceTimer);
  if (otherActive(q)) {
    otherOpen[q.id] = false;
    put(q, { ...a, other: "" });
    return;
  }
  if (q.type === "multi" && q.maxChoices && pickedCount(q, a) >= q.maxChoices) {
    limitHint.value = `Можно выбрать не больше ${q.maxChoices}`;
    return;
  }
  otherOpen[q.id] = true;
  if (q.type === "single") put(q, { other: a.other || "" });
  nextTick(() => document.getElementById(`sv-other-${q.id}`)?.focus());
}

function setOther(q, text) {
  const a = answerOf(q);
  put(q, q.type === "single" ? { other: text } : { ...a, other: text });
}

function setText(q, text) {
  put(q, { text });
}

function setScale(q, value) {
  const was = answerOf(q).value;
  put(q, was === value ? {} : { value });
}

// --- Навигация ---

function next() {
  if (pos.value < total.value) pos.value++;
}
function prev() {
  if (pos.value > 0) pos.value--;
}
function go(index) {
  pos.value = index;
}

function onKey(e) {
  if (zoomSrc.value) {
    if (e.key === "Escape") zoomSrc.value = "";
    return;
  }
  const typing = ["INPUT", "TEXTAREA"].includes(e.target?.tagName);
  if (typing) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) next();
    return;
  }
  // Enter на кнопке уже её нажимает — второй шаг сверху был бы лишним.
  if (e.key === "Enter" && e.target?.tagName === "BUTTON") return;
  if (e.key === "ArrowRight" || e.key === "Enter") next();
  else if (e.key === "ArrowLeft") prev();
  else if (/^[1-9]$/.test(e.key) && current.value) {
    const q = current.value.question;
    const option = q.options?.[Number(e.key) - 1];
    if (option) toggle(q, option.id);
  }
}

// --- Вид ---

const hasOptionImages = (q) => (q.options || []).some((o) => o.image);
const percent = computed(() => (total.value ? Math.round((answeredCount.value / total.value) * 100) : 0));

const sections = computed(() => {
  const result = [];
  for (const item of items.value) {
    const last = result[result.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else result.push({ section: item.section, items: [item] });
  }
  return result;
});

const saveLabel = computed(() => {
  if (props.preview) return "предпросмотр — ответы никуда не уходят";
  return { saving: "сохраняю…", saved: "сохранено", error: "не сохранилось, повторю" }[props.saveState] || "";
});

function otherLabel(q) {
  return q.otherLabel || "Свой вариант";
}

function choiceHint(q) {
  if (q.type === "single") return "Один вариант";
  if (q.type === "multi") {
    if (q.minChoices && q.maxChoices && q.minChoices === q.maxChoices) return `Выбери ${q.maxChoices}`;
    if (q.minChoices && q.maxChoices) return `От ${q.minChoices} до ${q.maxChoices} вариантов`;
    if (q.maxChoices) return `Не больше ${q.maxChoices}`;
    if (q.minChoices) return `Хотя бы ${q.minChoices}`;
    return "Можно несколько";
  }
  return "";
}
</script>

<template>
  <div class="svr">
    <!-- Шапка: где я и сколько осталось -->
    <header class="svr-head">
      <div class="svr-head-row">
        <button v-if="preview" class="sv-btn is-small" @click="emit('close')">✕ Закрыть</button>
        <div class="svr-where">
          <template v-if="current">
            <span v-if="current.section.title" class="svr-section">{{ current.section.title }}</span>
            <span class="svr-count">Вопрос {{ current.number }} из {{ total }}</span>
          </template>
          <span v-else class="svr-count">Проверка перед отправкой</span>
        </div>
        <button class="svr-map-btn" :aria-expanded="mapOpen" @click="mapOpen = !mapOpen">
          <span class="svr-map-num">{{ answeredCount }}/{{ total }}</span>
          <span class="svr-map-icon">▦</span>
        </button>
      </div>
      <div class="svr-bar" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
        <div class="svr-bar-fill" :style="{ width: `${percent}%` }" />
      </div>
      <div class="svr-save">{{ saveLabel }}</div>
    </header>

    <!-- Карта вопросов -->
    <div v-if="mapOpen" class="svr-sheet-back" @click.self="mapOpen = false">
      <div class="svr-sheet">
        <div class="svr-sheet-head">
          <b>Все вопросы</b>
          <span class="sv-muted">отвечено {{ answeredCount }} из {{ total }}</span>
          <button class="sv-btn is-small" @click="mapOpen = false">✕</button>
        </div>
        <div v-for="(group, gi) in sections" :key="gi" class="svr-sheet-group">
          <div v-if="group.section.title" class="svr-sheet-title">{{ group.section.title }}</div>
          <div class="svr-dots">
            <button
              v-for="item in group.items"
              :key="item.question.id"
              class="svr-dot"
              :class="{
                'is-done': isAnswered(answers[item.question.id]),
                'is-here': item.number - 1 === pos,
                'is-req': item.question.required && !isAnswered(answers[item.question.id]),
              }"
              :title="item.question.text"
              @click="go(item.number - 1)"
            >
              {{ item.number }}
            </button>
          </div>
        </div>
        <button class="sv-btn is-primary svr-sheet-finish" @click="go(total)">К отправке →</button>
      </div>
    </div>

    <main ref="scroller" class="svr-body">
      <!-- Вопрос -->
      <Transition name="svr-slide" mode="out-in">
        <section v-if="current" :key="current.question.id" class="svr-q">
          <p v-if="current.section.description && current === items.find((i) => i.section === current.section)" class="svr-sdesc">
            {{ current.section.description }}
          </p>
          <h2 class="svr-text">
            {{ current.question.text }}<span v-if="current.question.required" class="svr-req" title="Обязательный">*</span>
          </h2>
          <p v-if="current.question.hint" class="svr-hint">{{ current.question.hint }}</p>
          <button
            v-if="current.question.image"
            class="svr-qimg"
            @click="zoomSrc = surveyImageSrc(current.question.image)"
          >
            <img :src="surveyImageSrc(current.question.image)" alt="" loading="eager" />
          </button>

          <!-- Варианты -->
          <template v-if="current.question.type === 'single' || current.question.type === 'multi'">
            <div class="svr-kind">{{ choiceHint(current.question) }}</div>
            <div
              class="sv-opts"
              :class="{ 'has-images': hasOptionImages(current.question), 'is-multi': current.question.type === 'multi' }"
            >
              <button
                v-for="(o, oi) in current.question.options"
                :key="o.id"
                class="sv-opt"
                :class="{ 'is-on': isOn(current.question, o.id) }"
                :aria-pressed="isOn(current.question, o.id)"
                @click="toggle(current.question, o.id)"
              >
                <span v-if="o.image" class="sv-opt-img">
                  <img :src="surveyImageSrc(o.image)" alt="" loading="lazy" />
                  <span
                    class="sv-opt-zoom"
                    role="button"
                    aria-label="Увеличить"
                    @click.stop="zoomSrc = surveyImageSrc(o.image)"
                  >⤢</span>
                </span>
                <span class="sv-opt-row">
                  <span class="sv-mark" aria-hidden="true" />
                  <span class="sv-opt-text">{{ o.text || `Вариант ${oi + 1}` }}</span>
                </span>
              </button>
              <button
                v-if="current.question.allowOther"
                class="sv-opt is-other"
                :class="{ 'is-on': otherActive(current.question) }"
                :aria-pressed="otherActive(current.question)"
                @click="toggleOther(current.question)"
              >
                <span class="sv-opt-row">
                  <span class="sv-mark" aria-hidden="true" />
                  <span class="sv-opt-text">{{ otherLabel(current.question) }}</span>
                </span>
              </button>
            </div>
            <textarea
              v-if="current.question.allowOther && otherActive(current.question)"
              :id="`sv-other-${current.question.id}`"
              class="sv-input svr-other"
              rows="2"
              placeholder="Напиши свой вариант"
              :value="answerOf(current.question).other || ''"
              @input="setOther(current.question, $event.target.value)"
            />
            <div v-if="limitHint" class="svr-limit">{{ limitHint }}</div>
          </template>

          <!-- Свой текст -->
          <textarea
            v-else-if="current.question.type === 'text'"
            class="sv-input svr-textarea"
            rows="5"
            placeholder="Твой ответ"
            :value="answerOf(current.question).text || ''"
            @input="setText(current.question, $event.target.value)"
          />

          <!-- Шкала -->
          <div v-else-if="current.question.type === 'scale'" class="svr-scale">
            <div
              class="svr-scale-row"
              :class="{ 'is-wide': scaleRange(current.question).length > 11 }"
              :style="{ '--n': scaleRange(current.question).length }"
            >
              <button
                v-for="v in scaleRange(current.question)"
                :key="v"
                class="svr-scale-btn"
                :class="{ 'is-on': answerOf(current.question).value === v }"
                @click="setScale(current.question, v)"
              >
                {{ v }}
              </button>
            </div>
            <div v-if="current.question.minLabel || current.question.maxLabel" class="svr-scale-labels">
              <span>{{ current.question.minLabel }}</span>
              <span>{{ current.question.maxLabel }}</span>
            </div>
          </div>
        </section>

        <!-- Сводка перед отправкой -->
        <section v-else key="review" class="svr-q svr-review">
          <div class="svr-review-emoji">{{ unanswered.length ? "📝" : "✨" }}</div>
          <h2 class="svr-text">{{ unanswered.length ? "Почти всё!" : "Готово!" }}</h2>
          <p class="svr-hint">Отвечено {{ answeredCount }} из {{ total }}.</p>

          <div v-if="unanswered.length" class="svr-left">
            <div class="svr-left-title">Без ответа</div>
            <button
              v-for="item in unanswered"
              :key="item.question.id"
              class="svr-left-item"
              @click="go(item.number - 1)"
            >
              <span class="svr-left-num">{{ item.number }}</span>
              <span class="svr-left-text">{{ item.question.text }}</span>
              <span v-if="item.question.required" class="svr-left-req">обязательный</span>
            </button>
          </div>
          <div v-if="shortOnChoices.length" class="svr-left">
            <div class="svr-left-title">Выбрано меньше нужного</div>
            <button
              v-for="item in shortOnChoices"
              :key="item.question.id"
              class="svr-left-item"
              @click="go(item.number - 1)"
            >
              <span class="svr-left-num">{{ item.number }}</span>
              <span class="svr-left-text">{{ item.question.text }}</span>
            </button>
          </div>

          <div v-if="submitError" class="sv-error">{{ submitError }}</div>
          <button class="sv-btn is-primary is-big" :disabled="!canSubmit || submitting" @click="emit('submit')">
            {{ submitting ? "Отправляю…" : submitted ? "Сохранить изменения" : "Отправить ответы" }}
          </button>
          <p v-if="!canSubmit && total" class="svr-hint">Сначала ответь на обязательные вопросы.</p>
          <button v-if="total" class="sv-btn is-ghost" @click="go(0)">Пройтись по ответам с начала</button>
        </section>
      </Transition>
    </main>

    <footer class="svr-foot">
      <button class="sv-btn svr-nav" :disabled="pos === 0" @click="prev">← Назад</button>
      <button v-if="!onReview" class="sv-btn is-primary svr-nav" @click="next">
        {{ pos === total - 1 ? "Готово →" : isAnswered(answers[current?.question.id]) ? "Далее →" : "Пропустить →" }}
      </button>
    </footer>

    <div v-if="zoomSrc" class="svr-zoom" @click="zoomSrc = ''">
      <img :src="zoomSrc" alt="" />
    </div>
  </div>
</template>

<style scoped>
/* Прохождение занимает ровно экран и прокручивает только середину. Липкие
   шапка и низ не годятся: у body в приложении overflow-x: hidden, и sticky
   внутри него не прилипает — кнопки «Далее» уезжали под длинный вопрос. */
.svr {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  box-sizing: border-box;
}

.svr-head {
  flex: none;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 6px;
}
.svr-head-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.svr-where {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.svr-section {
  font-size: 12px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--sv-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.svr-count {
  font-size: 14px;
  color: var(--sv-dim);
}
.svr-map-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 20px;
  border: 1px solid var(--sv-line);
  background: var(--sv-card);
  color: var(--sv-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.svr-map-icon {
  font-size: 16px;
  color: var(--sv-accent);
}
.svr-bar {
  margin-top: 10px;
  height: 6px;
  border-radius: 3px;
  background: var(--sv-line);
  overflow: hidden;
}
.svr-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--sv-accent), var(--sv-accent-2));
  transition: width 0.3s ease;
}
.svr-save {
  min-height: 16px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--sv-muted);
  text-align: right;
}

.svr-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 8px 16px 24px;
}
.svr-q {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.svr-sdesc {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--sv-accent-soft);
  color: var(--sv-dim);
  font-size: 14px;
  line-height: 1.45;
}
.svr-text {
  margin: 4px 0 0;
  font-size: 22px;
  line-height: 1.3;
  font-weight: 650;
  white-space: pre-wrap;
}
.svr-req {
  color: var(--sv-accent);
  margin-left: 4px;
}
.svr-hint {
  margin: 0;
  color: var(--sv-dim);
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.svr-kind {
  font-size: 12px;
  color: var(--sv-muted);
  letter-spacing: 0.3px;
}
.svr-qimg {
  padding: 0;
  border: 0;
  background: none;
  border-radius: 16px;
  overflow: hidden;
  cursor: zoom-in;
}
.svr-qimg img {
  display: block;
  width: 100%;
  max-height: 46vh;
  object-fit: cover;
  border-radius: 16px;
}
.svr-other {
  margin-top: -2px;
}
.svr-textarea {
  min-height: 140px;
  font-size: 16px;
}
.svr-limit {
  color: var(--sv-warn);
  font-size: 13px;
}

/* Шкала: до 11 делений — одна строка равных кнопок, шире — переносится. */
.svr-scale-row {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  gap: 6px;
}
.svr-scale-row.is-wide {
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
}
.svr-scale-btn {
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid var(--sv-line);
  background: var(--sv-card);
  color: var(--sv-text);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.svr-scale-btn:active {
  transform: scale(0.95);
}
.svr-scale-btn.is-on {
  background: var(--sv-accent);
  border-color: var(--sv-accent);
  color: #fff;
}
.svr-scale-labels {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--sv-dim);
}
.svr-scale-labels span:last-child {
  text-align: right;
}

/* Сводка */
.svr-review {
  align-items: stretch;
  text-align: center;
}
.svr-review-emoji {
  font-size: 44px;
  margin-top: 8px;
}
.svr-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}
.svr-left-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sv-muted);
  margin-top: 6px;
}
.svr-left-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--sv-line);
  background: var(--sv-card);
  color: var(--sv-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.svr-left-num {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--sv-card-2);
  font-size: 13px;
}
.svr-left-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.svr-left-req {
  flex: none;
  font-size: 11px;
  color: var(--sv-accent);
}

/* Низ всегда на месте: большие пальцевые кнопки. */
.svr-foot {
  flex: none;
  display: flex;
  gap: 10px;
  padding: 10px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--sv-line);
}
.svr-nav {
  flex: 1;
  min-height: 52px;
  font-size: 16px;
}

/* Карта вопросов — шторка снизу на телефоне, окно по центру на большом. */
.svr-sheet-back {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(5, 6, 10, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.svr-sheet {
  width: 100%;
  max-width: 720px;
  max-height: 80dvh;
  overflow-y: auto;
  background: var(--sv-card);
  border-radius: 20px 20px 0 0;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
@media (min-width: 769px) {
  .svr-sheet-back {
    align-items: center;
  }
  .svr-sheet {
    border-radius: 20px;
    max-width: 560px;
  }
}
.svr-sheet-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.svr-sheet-head b {
  font-size: 17px;
}
.svr-sheet-head .sv-muted {
  flex: 1;
  font-size: 13px;
}
.svr-sheet-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sv-accent);
  margin-bottom: 8px;
}
.svr-dots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 8px;
}
.svr-dot {
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--sv-line);
  background: var(--sv-card-2);
  color: var(--sv-dim);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}
.svr-dot.is-done {
  background: var(--sv-accent-soft);
  border-color: var(--sv-accent);
  color: var(--sv-text);
}
.svr-dot.is-req {
  border-style: dashed;
  border-color: var(--sv-accent);
}
.svr-dot.is-here {
  outline: 2px solid var(--sv-text);
  outline-offset: 1px;
}
.svr-sheet-finish {
  min-height: 48px;
}

.svr-zoom {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.92);
  display: grid;
  place-items: center;
  padding: 16px;
  cursor: zoom-out;
}
.svr-zoom img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.svr-slide-enter-active,
.svr-slide-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.svr-slide-enter-from {
  opacity: 0;
  transform: translateX(14px);
}
.svr-slide-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}
@media (prefers-reduced-motion: reduce) {
  .svr-slide-enter-active,
  .svr-slide-leave-active {
    transition: none;
  }
}
</style>
