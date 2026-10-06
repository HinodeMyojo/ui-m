<script setup>
import { computed, ref, watch } from "vue";
import { flatQuestions, isAnswered, scaleRange } from "./surveyFormat.js";
import { surveyImageSrc } from "@/components/surveyApi.js";

// Результаты опроса: ответы каждого человека целиком и сводка по вопросам.
// Чаще всего отвечает один человек, поэтому первым открывается он, а не
// диаграммы.

const props = defineProps({
  definition: { type: Object, required: true },
  responses: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(["refresh", "delete"]);

const view = ref("people"); // people | summary
const selectedId = ref("");
const confirmDelete = ref("");
const zoomSrc = ref("");

const items = computed(() => flatQuestions(props.definition));
const submitted = computed(() => props.responses.filter((r) => r.status === "submitted"));
const drafts = computed(() => props.responses.filter((r) => r.status !== "submitted"));
const selected = computed(() => submitted.value.find((r) => r.id === selectedId.value) || null);

watch(
  submitted,
  (list) => {
    if (!list.find((r) => r.id === selectedId.value)) selectedId.value = list[0]?.id || "";
  },
  { immediate: true },
);

function who(r) {
  return r.name || "Без имени";
}

function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function optionText(q, id) {
  const index = q.options.findIndex((o) => o.id === id);
  return q.options[index]?.text || `Вариант ${index + 1}`;
}

// --- Сводка ---

function summaryOf(q) {
  const answers = submitted.value.map((r) => ({ r, a: r.answers?.[q.id] })).filter((x) => isAnswered(x.a));
  const result = { count: answers.length };
  if (q.type === "single" || q.type === "multi") {
    result.options = q.options.map((o) => {
      const n = answers.filter((x) => x.a.options?.includes(o.id)).length;
      return { option: o, n, pct: answers.length ? Math.round((n / answers.length) * 100) : 0 };
    });
    result.others = answers.filter((x) => x.a.other).map((x) => ({ who: who(x.r), text: x.a.other }));
  } else if (q.type === "text") {
    result.texts = answers.map((x) => ({ who: who(x.r), text: x.a.text }));
  } else if (q.type === "scale") {
    const values = answers.map((x) => x.a.value);
    result.avg = values.length ? (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1) : "—";
    const range = scaleRange(q);
    const max = Math.max(1, ...range.map((v) => values.filter((x) => x === v).length));
    result.bars = range.map((v) => {
      const n = values.filter((x) => x === v).length;
      return { v, n, h: Math.round((n / max) * 100) };
    });
  }
  return result;
}
</script>

<template>
  <div class="svres">
    <div class="svres-bar">
      <div class="svres-tabs">
        <button class="svres-tab" :class="{ 'is-on': view === 'people' }" @click="view = 'people'">
          По людям
        </button>
        <button class="svres-tab" :class="{ 'is-on': view === 'summary' }" @click="view = 'summary'">
          Сводка
        </button>
      </div>
      <button class="sv-btn is-small" :disabled="loading" @click="emit('refresh')">
        {{ loading ? "…" : "↻ Обновить" }}
      </button>
    </div>

    <div v-if="!responses.length" class="sv-card svres-empty">
      <div class="svres-empty-emoji">📭</div>
      Пока никто не отвечал. Скопируй ссылку и отправь её — ответы появятся здесь.
    </div>

    <!-- По людям -->
    <template v-else-if="view === 'people'">
      <div class="svres-people">
        <button
          v-for="r in submitted"
          :key="r.id"
          class="svres-person"
          :class="{ 'is-on': r.id === selectedId }"
          @click="selectedId = r.id"
        >
          <b>{{ who(r) }}</b>
          <span>{{ when(r.submittedAt) }} · {{ r.answeredCount }}/{{ items.length }}</span>
        </button>
        <div v-for="r in drafts" :key="r.id" class="svres-person is-draft" title="Ответы видны после отправки">
          <b>{{ who(r) }}</b>
          <span>проходит · {{ r.answeredCount }}/{{ items.length }} · {{ when(r.lastSeenAt) }}</span>
        </div>
      </div>
      <p v-if="drafts.length && !submitted.length" class="sv-muted svres-note">
        Ответы появятся, когда человек нажмёт «Отправить». До этого видно только, сколько он прошёл.
      </p>

      <template v-if="selected">
        <div class="svres-sheet">
          <template v-for="(item, i) in items" :key="item.question.id">
            <div
              v-if="item.section.title && (i === 0 || items[i - 1].section !== item.section)"
              class="svres-section"
            >
              {{ item.section.title }}
            </div>
            <div class="sv-card svres-q">
              <div class="svres-q-head">
                <span class="svres-q-num">{{ item.number }}</span>
                <span class="svres-q-text">{{ item.question.text }}</span>
              </div>
              <button
                v-if="item.question.image"
                class="svres-qimg"
                @click="zoomSrc = surveyImageSrc(item.question.image)"
              >
                <img :src="surveyImageSrc(item.question.image)" alt="" loading="lazy" />
              </button>

              <template v-if="!isAnswered(selected.answers?.[item.question.id])">
                <div class="svres-none">— без ответа</div>
              </template>

              <!-- Варианты: показываем все, выбранные подсвечены — так видно
                   и что выбрано, и из чего. -->
              <template v-else-if="item.question.type === 'single' || item.question.type === 'multi'">
                <div
                  class="sv-opts svres-opts"
                  :class="{
                    'has-images': item.question.options.some((o) => o.image),
                    'is-multi': item.question.type === 'multi',
                  }"
                >
                  <div
                    v-for="o in item.question.options"
                    :key="o.id"
                    class="sv-opt"
                    :class="{
                      'is-on': selected.answers[item.question.id].options?.includes(o.id),
                      'is-dim': !selected.answers[item.question.id].options?.includes(o.id),
                    }"
                  >
                    <span v-if="o.image" class="sv-opt-img">
                      <img :src="surveyImageSrc(o.image)" alt="" loading="lazy" />
                    </span>
                    <span class="sv-opt-row">
                      <span class="sv-mark" />
                      <span class="sv-opt-text">{{ o.text || optionText(item.question, o.id) }}</span>
                    </span>
                  </div>
                </div>
                <div v-if="selected.answers[item.question.id].other" class="svres-other">
                  <span class="sv-label">{{ item.question.otherLabel || "Свой вариант" }}</span>
                  <div>{{ selected.answers[item.question.id].other }}</div>
                </div>
              </template>

              <div v-else-if="item.question.type === 'text'" class="svres-text">
                {{ selected.answers[item.question.id].text }}
              </div>

              <div v-else-if="item.question.type === 'scale'" class="svres-scale">
                <b>{{ selected.answers[item.question.id].value }}</b>
                <span class="sv-muted">
                  из {{ item.question.max }}
                  <template v-if="item.question.minLabel || item.question.maxLabel">
                    ({{ item.question.minLabel || item.question.min }} → {{ item.question.maxLabel || item.question.max }})
                  </template>
                </span>
              </div>
            </div>
          </template>
        </div>

        <div class="svres-danger">
          <button v-if="confirmDelete !== selected.id" class="sv-btn is-small is-ghost" @click="confirmDelete = selected.id">
            Удалить ответы «{{ who(selected) }}»
          </button>
          <template v-else>
            <span class="sv-muted">Удалить насовсем?</span>
            <button class="sv-btn is-small is-danger" @click="emit('delete', selected); confirmDelete = ''">
              Да, удалить
            </button>
            <button class="sv-btn is-small" @click="confirmDelete = ''">Нет</button>
          </template>
        </div>
      </template>
    </template>

    <!-- Сводка -->
    <template v-else>
      <p class="sv-muted svres-note">По отправленным ответам: {{ submitted.length }}.</p>
      <template v-for="(item, i) in items" :key="item.question.id">
        <div
          v-if="item.section.title && (i === 0 || items[i - 1].section !== item.section)"
          class="svres-section"
        >
          {{ item.section.title }}
        </div>
        <div class="sv-card svres-q">
          <div class="svres-q-head">
            <span class="svres-q-num">{{ item.number }}</span>
            <span class="svres-q-text">{{ item.question.text }}</span>
            <span class="sv-muted svres-q-count">{{ summaryOf(item.question).count }}</span>
          </div>

          <template v-if="item.question.type === 'single' || item.question.type === 'multi'">
            <div v-for="row in summaryOf(item.question).options" :key="row.option.id" class="svres-row">
              <img v-if="row.option.image" class="svres-row-img" :src="surveyImageSrc(row.option.image)" alt="" />
              <div class="svres-row-main">
                <div class="svres-row-label">
                  <span>{{ row.option.text || "картинка" }}</span>
                  <span class="sv-muted">{{ row.n }} · {{ row.pct }}%</span>
                </div>
                <div class="svres-track"><div class="svres-fill" :style="{ width: `${row.pct}%` }" /></div>
              </div>
            </div>
            <div v-for="(o, oi) in summaryOf(item.question).others" :key="`o${oi}`" class="svres-quote">
              <span class="sv-muted">{{ o.who }}:</span> {{ o.text }}
            </div>
          </template>

          <template v-else-if="item.question.type === 'text'">
            <div v-if="!summaryOf(item.question).texts.length" class="svres-none">— ответов нет</div>
            <div v-for="(t, ti) in summaryOf(item.question).texts" :key="ti" class="svres-quote">
              <span class="sv-muted">{{ t.who }}:</span> {{ t.text }}
            </div>
          </template>

          <template v-else-if="item.question.type === 'scale'">
            <div class="svres-avg">
              Среднее <b>{{ summaryOf(item.question).avg }}</b>
            </div>
            <div class="svres-hist">
              <div v-for="b in summaryOf(item.question).bars" :key="b.v" class="svres-hist-col">
                <div class="svres-hist-bar" :style="{ height: `${b.h}%` }" :title="`${b.n}`" />
                <span>{{ b.v }}</span>
              </div>
            </div>
          </template>
        </div>
      </template>
    </template>

    <div v-if="zoomSrc" class="svres-zoom" @click="zoomSrc = ''">
      <img :src="zoomSrc" alt="" />
    </div>
  </div>
</template>

<style scoped>
.svres {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.svres-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.svres-tabs {
  display: inline-flex;
  padding: 3px;
  border-radius: 12px;
  background: var(--sv-card);
  border: 1px solid var(--sv-line);
}
.svres-tab {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--sv-dim);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.svres-tab.is-on {
  background: var(--sv-card-2);
  color: var(--sv-text);
}
.svres-empty {
  text-align: center;
  color: var(--sv-dim);
  line-height: 1.5;
  padding: 24px 16px;
}
.svres-empty-emoji {
  font-size: 36px;
  margin-bottom: 6px;
}
.svres-note {
  margin: 0;
  font-size: 13px;
}
.svres-people {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.svres-person {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--sv-line);
  background: var(--sv-card);
  color: var(--sv-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.svres-person span {
  font-size: 12px;
  color: var(--sv-muted);
}
.svres-person.is-on {
  border-color: var(--sv-accent);
  background: var(--sv-accent-soft);
}
.svres-person.is-draft {
  cursor: default;
  opacity: 0.65;
  border-style: dashed;
}
.svres-sheet {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.svres-section {
  margin-top: 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sv-accent);
}
.svres-q {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.svres-q-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.svres-q-num {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--sv-card-2);
  font-size: 12px;
  color: var(--sv-dim);
}
.svres-q-text {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}
.svres-q-count {
  font-size: 13px;
}
.svres-qimg {
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
  align-self: flex-start;
}
.svres-qimg img {
  max-height: 160px;
  max-width: 100%;
  border-radius: 10px;
  display: block;
}
.svres-none {
  color: var(--sv-muted);
  font-size: 14px;
}
.svres-opts .sv-opt {
  min-height: 0;
  cursor: default;
}
.svres-opts .sv-opt:active {
  transform: none;
}
.svres-opts .sv-opt-row {
  padding: 9px 12px;
}
.svres-opts .sv-opt-text {
  font-size: 14px;
}
.svres-opts .sv-opt.is-dim {
  opacity: 0.45;
}
.svres-other,
.svres-text {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--sv-accent-soft);
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.svres-other {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.svres-scale b {
  font-size: 26px;
  color: var(--sv-accent);
  margin-right: 6px;
}
.svres-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.svres-row-img {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  flex: none;
}
.svres-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.svres-row-label {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 14px;
}
.svres-track {
  height: 8px;
  border-radius: 4px;
  background: var(--sv-card-2);
  overflow: hidden;
}
.svres-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--sv-accent), var(--sv-accent-2));
}
.svres-quote {
  padding: 8px 10px;
  border-left: 3px solid var(--sv-accent);
  background: var(--sv-card-2);
  border-radius: 0 10px 10px 0;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.svres-avg {
  font-size: 14px;
  color: var(--sv-dim);
}
.svres-avg b {
  font-size: 20px;
  color: var(--sv-accent);
}
.svres-hist {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 90px;
}
.svres-hist-col {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--sv-muted);
}
.svres-hist-bar {
  width: 100%;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
  background: var(--sv-accent);
}
.svres-danger {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 6px;
}
.svres-zoom {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.92);
  display: grid;
  place-items: center;
  padding: 16px;
  cursor: zoom-out;
}
.svres-zoom img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
