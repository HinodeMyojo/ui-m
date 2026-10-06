<script setup>
import { nextTick, ref } from "vue";
import { QUESTION_TYPES } from "./surveyFormat.js";
import { surveyImageSrc, uploadSurveyImage } from "@/components/surveyApi.js";

// Карточка вопроса в конструкторе. Правит вопрос на месте — он кусок общего
// черновика опроса, и сохраняет его уже экран целиком.

const props = defineProps({
  question: { type: Object, required: true },
  surveyId: { type: String, required: true },
  number: { type: Number, required: true },
  first: { type: Boolean, default: false },
  last: { type: Boolean, default: false },
});
const emit = defineEmits(["up", "down", "remove", "duplicate", "error"]);

const uploading = ref(""); // "question" или индекс варианта
const fileInput = ref(null);
const showHint = ref(!!props.question.hint);
const confirmRemove = ref(false);
let uploadTarget = null;

function setType(type) {
  const q = props.question;
  if (q.type === type) return;
  q.type = type;
  if ((type === "single" || type === "multi") && !(q.options && q.options.length)) {
    q.options = [{ text: "" }, { text: "" }];
  }
  if (type === "scale" && q.min == null) {
    q.min = 1;
    q.max = 10;
  }
}

function addOption(after = null) {
  const q = props.question;
  q.options = q.options || [];
  const at = after === null ? q.options.length : after + 1;
  q.options.splice(at, 0, { text: "" });
  nextTick(() => document.getElementById(optionInputId(at))?.focus());
}

function removeOption(index) {
  props.question.options.splice(index, 1);
}

function moveOption(index, delta) {
  const list = props.question.options;
  const to = index + delta;
  if (to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
}

function optionInputId(index) {
  return `sv-opt-${props.question.id || props.number}-${index}`;
}

// Enter в варианте — сразу следующий вариант: так их набирают подряд, не
// дотягиваясь до кнопки.
function onOptionEnter(index) {
  addOption(index);
}

function pickImage(target) {
  uploadTarget = target;
  fileInput.value.value = "";
  fileInput.value.click();
}

async function onFile(event) {
  const file = event.target.files?.[0];
  if (!file || uploadTarget === null) return;
  const target = uploadTarget;
  uploading.value = String(target);
  try {
    const { id } = await uploadSurveyImage(props.surveyId, file);
    if (target === "question") props.question.image = id;
    else props.question.options[target].image = id;
  } catch (e) {
    emit("error", e.message);
  } finally {
    uploading.value = "";
  }
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
</script>

<template>
  <div class="sqe" :class="{ 'is-req': question.required }">
    <div class="sqe-top">
      <span class="sqe-num">{{ number }}</span>
      <div class="sqe-types" role="radiogroup" aria-label="Тип вопроса">
        <button
          v-for="t in QUESTION_TYPES"
          :key="t.value"
          class="sqe-type"
          :class="{ 'is-on': question.type === t.value }"
          role="radio"
          :aria-checked="question.type === t.value"
          @click="setType(t.value)"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="sqe-tools">
        <button class="sv-btn is-small is-icon" title="Выше" :disabled="first" @click="emit('up')">↑</button>
        <button class="sv-btn is-small is-icon" title="Ниже" :disabled="last" @click="emit('down')">↓</button>
        <button class="sv-btn is-small is-icon" title="Копия" @click="emit('duplicate')">⧉</button>
        <button
          v-if="!confirmRemove"
          class="sv-btn is-small is-icon is-danger"
          title="Удалить"
          @click="confirmRemove = true"
        >
          🗑
        </button>
        <template v-else>
          <button class="sv-btn is-small is-danger" @click="emit('remove')">Удалить</button>
          <button class="sv-btn is-small" @click="confirmRemove = false">Нет</button>
        </template>
      </div>
    </div>

    <textarea v-model="question.text" class="sv-input sqe-text" rows="2" placeholder="Текст вопроса" />

    <input
      v-if="showHint || question.hint"
      v-model="question.hint"
      class="sv-input sqe-hint"
      placeholder="Подсказка под вопросом"
    />

    <div class="sqe-media">
      <div v-if="question.image" class="sqe-thumb">
        <img :src="surveyImageSrc(question.image)" alt="" />
        <button class="sqe-thumb-x" title="Убрать картинку" @click="question.image = ''">✕</button>
      </div>
      <button
        class="sv-btn is-small"
        :disabled="uploading === 'question'"
        @click="pickImage('question')"
      >
        {{ uploading === "question" ? "Загружаю…" : question.image ? "🖼 Заменить" : "🖼 Картинка к вопросу" }}
      </button>
      <button v-if="!showHint && !question.hint" class="sv-btn is-small is-ghost" @click="showHint = true">
        ＋ подсказка
      </button>
    </div>

    <!-- Варианты -->
    <template v-if="question.type === 'single' || question.type === 'multi'">
      <div class="sqe-opts">
        <div v-for="(o, i) in question.options" :key="i" class="sqe-opt">
          <span class="sqe-mark" :class="{ 'is-square': question.type === 'multi' }" />
          <div v-if="o.image" class="sqe-thumb is-small">
            <img :src="surveyImageSrc(o.image)" alt="" />
            <button class="sqe-thumb-x" title="Убрать картинку" @click="o.image = ''">✕</button>
          </div>
          <input
            :id="optionInputId(i)"
            v-model="o.text"
            class="sv-input sqe-opt-input"
            :placeholder="o.image ? 'Подпись (можно без неё)' : `Вариант ${i + 1}`"
            @keydown.enter.prevent="onOptionEnter(i)"
          />
          <button
            class="sv-btn is-small is-icon"
            :title="o.image ? 'Заменить картинку' : 'Картинка'"
            :disabled="uploading === String(i)"
            @click="pickImage(i)"
          >
            {{ uploading === String(i) ? "…" : "🖼" }}
          </button>
          <button class="sv-btn is-small is-icon sqe-hide-narrow" title="Выше" :disabled="i === 0" @click="moveOption(i, -1)">↑</button>
          <button class="sv-btn is-small is-icon" title="Убрать вариант" @click="removeOption(i)">✕</button>
        </div>
      </div>
      <div class="sqe-row">
        <button class="sv-btn is-small" @click="addOption()">＋ Вариант</button>
      </div>
      <div class="sqe-row">
        <label class="sv-switch">
          <input v-model="question.allowOther" type="checkbox" />
          Свой вариант
        </label>
        <input
          v-if="question.allowOther"
          v-model="question.otherLabel"
          class="sv-input sqe-small-input"
          placeholder="Свой вариант"
        />
      </div>
      <div v-if="question.type === 'multi'" class="sqe-row">
        <span class="sqe-inline-label">Выбрать от</span>
        <input
          class="sv-input sqe-num-input"
          type="number"
          min="0"
          :value="question.minChoices || ''"
          placeholder="—"
          @input="question.minChoices = numberOrNull($event.target.value)"
        />
        <span class="sqe-inline-label">до</span>
        <input
          class="sv-input sqe-num-input"
          type="number"
          min="0"
          :value="question.maxChoices || ''"
          placeholder="—"
          @input="question.maxChoices = numberOrNull($event.target.value)"
        />
      </div>
    </template>

    <!-- Шкала -->
    <template v-else-if="question.type === 'scale'">
      <div class="sqe-row">
        <span class="sqe-inline-label">От</span>
        <input
          class="sv-input sqe-num-input"
          type="number"
          :value="question.min ?? 1"
          @input="question.min = numberOrNull($event.target.value)"
        />
        <span class="sqe-inline-label">до</span>
        <input
          class="sv-input sqe-num-input"
          type="number"
          :value="question.max ?? 10"
          @input="question.max = numberOrNull($event.target.value)"
        />
      </div>
      <div class="sqe-row">
        <input v-model="question.minLabel" class="sv-input" placeholder="Подпись слева: «совсем нет»" />
        <input v-model="question.maxLabel" class="sv-input" placeholder="Подпись справа: «очень»" />
      </div>
    </template>

    <div v-else class="sqe-note sv-muted">Человек напишет ответ своими словами.</div>

    <label class="sv-switch">
      <input v-model="question.required" type="checkbox" />
      Обязательный
    </label>

    <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />
  </div>
</template>

<style scoped>
.sqe {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--sv-line);
  background: var(--sv-card-2);
}
.sqe.is-req {
  border-left: 3px solid var(--sv-accent);
}
.sqe-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sqe-num {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--sv-accent-soft);
  color: var(--sv-accent);
  font-size: 13px;
  font-weight: 700;
}
.sqe-types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.sqe-type {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid var(--sv-line);
  background: var(--sv-card);
  color: var(--sv-dim);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.sqe-type.is-on {
  border-color: var(--sv-accent);
  color: var(--sv-text);
  background: var(--sv-accent-soft);
}
.sqe-tools {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.sqe-text {
  font-size: 16px;
  font-weight: 600;
}
.sqe-hint {
  font-size: 14px;
}
.sqe-media {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.sqe-thumb {
  position: relative;
  width: 96px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--sv-card);
  flex: none;
}
.sqe-thumb.is-small {
  width: 42px;
  height: 42px;
  border-radius: 8px;
}
.sqe-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.sqe-thumb-x {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 0;
  background: rgba(10, 11, 16, 0.75);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.sqe-opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sqe-opt {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sqe-mark {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--sv-muted);
}
.sqe-mark.is-square {
  border-radius: 4px;
}
.sqe-opt-input {
  flex: 1;
  min-width: 0;
  min-height: 38px;
  padding: 7px 10px;
}
.sqe-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.sqe-row > .sv-input {
  flex: 1;
  min-width: 140px;
}
.sqe-small-input {
  flex: 1;
  min-width: 140px;
  min-height: 36px;
  padding: 6px 10px;
}
.sqe-num-input {
  width: 76px !important;
  flex: none !important;
  min-width: 0 !important;
  min-height: 36px;
  padding: 6px 10px;
}
.sqe-inline-label {
  font-size: 14px;
  color: var(--sv-dim);
}
.sqe-note {
  font-size: 13px;
}
/* На узком экране у варианта остаются картинка и «убрать»: стрелка вверх
   съедала место у поля ввода, а переставляют варианты редко. Типы вопроса
   уходят своей строкой из четырёх равных кнопок — рядом с номером и
   инструментами они складывались в столбик. */
@media (max-width: 560px) {
  .sqe-hide-narrow {
    display: none;
  }
  .sqe-types {
    order: 3;
    flex-basis: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .sqe-type {
    padding: 2px 4px;
    font-size: 12.5px;
    line-height: 1.15;
    min-height: 38px;
  }
}
</style>
