<script setup>
// Правая колонка календаря: что сегодня, что идёт сейчас и что дальше.
// Время тикает само — «через 25 мин» не должно врать, пока страница открыта.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { eventColor, formatRange, layerOf, minutesLabel, parseDay } from "./calendarLayers.js";

const props = defineProps({
  today: { type: String, required: true }, // YYYY-MM-DD
  events: { type: Array, default: () => [] }, // сегодня и завтра
  cards: { type: Array, default: () => [] }, // карточки «Сегодня»
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(["open", "create"]);
const router = useRouter();

const now = ref(Date.now());
let timer = null;
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 30 * 1000);
});
onBeforeUnmount(() => clearInterval(timer));

const dayStart = computed(() => parseDay(props.today).getTime());
const dayEnd = computed(() => dayStart.value + 24 * 3600 * 1000);

function span(ev) {
  if (ev.allDay) return [parseDay(ev.start).getTime(), parseDay(ev.end).getTime()];
  return [new Date(ev.start).getTime(), new Date(ev.end).getTime()];
}

const todayEvents = computed(() =>
  props.events
    .filter((ev) => {
      const [s, e] = span(ev);
      return s < dayEnd.value && e > dayStart.value;
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || span(a)[0] - span(b)[0]),
);

const tomorrowFirst = computed(() =>
  props.events
    .filter((ev) => !ev.allDay && span(ev)[0] >= dayEnd.value)
    .sort((a, b) => span(a)[0] - span(b)[0])[0],
);

const current = computed(() =>
  todayEvents.value.filter((ev) => !ev.allDay).find((ev) => {
    const [s, e] = span(ev);
    return s <= now.value && now.value < e;
  }),
);

const next = computed(() =>
  todayEvents.value
    .filter((ev) => !ev.allDay && span(ev)[0] > now.value)
    .sort((a, b) => span(a)[0] - span(b)[0])[0],
);

function state(ev) {
  if (ev.allDay) return "allday";
  const [s, e] = span(ev);
  if (e <= now.value) return "past";
  if (s <= now.value) return "now";
  return "future";
}

function progress(ev) {
  const [s, e] = span(ev);
  return Math.min(100, Math.max(0, ((now.value - s) / (e - s)) * 100));
}

const leftMin = (ev) => Math.round((span(ev)[1] - now.value) / 60000);
const untilMin = (ev) => Math.round((span(ev)[0] - now.value) / 60000);

const title = computed(() =>
  parseDay(props.today).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }),
);

const nowLabel = computed(() =>
  new Date(now.value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
);

// Карточки «Сегодня»: сначала со временем, сделанные — вниз.
const sortedCards = computed(() =>
  [...props.cards]
    .filter((c) => c.status !== "dropped")
    .sort((a, b) => {
      const done = Number(a.status === "done") - Number(b.status === "done");
      if (done) return done;
      const am = a.plannedStartMin >= 0 ? a.plannedStartMin : 9999;
      const bm = b.plannedStartMin >= 0 ? b.plannedStartMin : 9999;
      return am - bm;
    }),
);

const slot = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
</script>

<template>
  <aside class="ctp">
    <div class="ctp-head">
      <div>
        <div class="ctp-kicker">Сегодня · {{ nowLabel }}</div>
        <div class="ctp-day">{{ title }}</div>
      </div>
      <button class="ctp-add" title="Событие на сегодня" @click="emit('create')">＋</button>
    </div>

    <div v-if="current" class="ctp-hero now" :style="{ '--c': eventColor(current) }" @click="emit('open', current)">
      <div class="ctp-hero-kicker">Идёт сейчас · ещё {{ minutesLabel(leftMin(current)) }}</div>
      <div class="ctp-hero-title">{{ layerOf(current.category).emoji }} {{ current.title }}</div>
      <div v-if="current.location" class="ctp-hero-loc">📍 {{ current.location }}</div>
      <div class="ctp-bar"><span :style="{ width: progress(current) + '%' }"></span></div>
    </div>
    <div v-if="next" class="ctp-hero" :style="{ '--c': eventColor(next) }" @click="emit('open', next)">
      <div class="ctp-hero-kicker">Дальше · через {{ minutesLabel(untilMin(next)) }}</div>
      <div class="ctp-hero-title">{{ layerOf(next.category).emoji }} {{ next.title }}</div>
      <div class="ctp-hero-loc">
        {{ formatRange(next) }}<template v-if="next.location"> · 📍 {{ next.location }}</template>
      </div>
    </div>

    <div class="ctp-section">События</div>
    <div v-if="loading && !todayEvents.length" class="ctp-empty">Загружаю…</div>
    <div v-else-if="!todayEvents.length" class="ctp-empty">Сегодня событий нет — свободный день.</div>
    <button
      v-for="ev in todayEvents"
      :key="ev.id"
      class="ctp-item"
      :class="state(ev)"
      :style="{ '--c': eventColor(ev) }"
      @click="emit('open', ev)"
    >
      <span class="ctp-time">{{ formatRange(ev) }}</span>
      <span class="ctp-body">
        <span class="ctp-title">{{ ev.title }}</span>
        <span v-if="ev.location" class="ctp-loc">📍 {{ ev.location }}</span>
      </span>
    </button>

    <template v-if="sortedCards.length">
      <div class="ctp-section">
        Дела дня
        <button class="ctp-link" @click="router.push('/today')">открыть «Сегодня» →</button>
      </div>
      <div v-for="c in sortedCards" :key="c.id" class="ctp-card" :class="c.status">
        <span class="ctp-card-mark">{{ c.status === "done" ? "✅" : c.status === "doing" ? "▶" : "○" }}</span>
        <span class="ctp-card-title">{{ c.emoji }} {{ c.title }}</span>
        <span v-if="c.plannedStartMin >= 0" class="ctp-card-time">{{ slot(c.plannedStartMin) }}</span>
      </div>
    </template>

    <div v-if="tomorrowFirst" class="ctp-tomorrow" @click="emit('open', tomorrowFirst)">
      Завтра первое: <b>{{ formatRange(tomorrowFirst).split("–")[0] }}</b> {{ tomorrowFirst.title }}
    </div>
  </aside>
</template>

<style scoped>
.ctp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #e6e8ef;
  min-width: 0;
}
.ctp-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.ctp-kicker {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #a58bff;
}
.ctp-day {
  font-size: 18px;
  font-weight: 600;
  text-transform: capitalize;
}
.ctp-add {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid #2b2f3b;
  background: #232633;
  color: #e6e8ef;
  font-size: 18px;
  cursor: pointer;
}
.ctp-hero {
  border-radius: 12px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--c) 14%, #1b1d25);
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  cursor: pointer;
}
.ctp-hero.now {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent), 0 6px 24px color-mix(in srgb, var(--c) 25%, transparent);
}
.ctp-hero-kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #cfd3e0;
  opacity: 0.85;
}
.ctp-hero-title {
  font-size: 15px;
  font-weight: 600;
  margin-top: 2px;
}
.ctp-hero-loc {
  font-size: 12px;
  color: #b8bccb;
  margin-top: 2px;
}
.ctp-bar {
  margin-top: 8px;
  height: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.ctp-bar span {
  display: block;
  height: 100%;
  background: var(--c);
}
.ctp-section {
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #7a7f8e;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ctp-link {
  background: none;
  border: none;
  color: #a58bff;
  font-size: 11px;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.ctp-empty {
  font-size: 13px;
  color: #7a7f8e;
  padding: 6px 0;
}
.ctp-item {
  display: flex;
  gap: 10px;
  text-align: left;
  border: none;
  border-left: 3px solid var(--c);
  background: #1b1d25;
  border-radius: 8px;
  padding: 7px 9px;
  color: inherit;
  cursor: pointer;
}
.ctp-item:hover {
  background: #20232d;
}
.ctp-item.past {
  opacity: 0.45;
}
.ctp-item.now {
  background: color-mix(in srgb, var(--c) 14%, #1b1d25);
}
.ctp-time {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: #b8bccb;
  min-width: 78px;
  padding-top: 1px;
}
.ctp-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ctp-title {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ctp-loc {
  font-size: 12px;
  color: #8a8fa0;
}
.ctp-card {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
  padding: 3px 2px;
}
.ctp-card.done {
  opacity: 0.5;
  text-decoration: line-through;
}
.ctp-card-mark {
  width: 16px;
  color: #a58bff;
}
.ctp-card-title {
  flex: 1;
  min-width: 0;
}
.ctp-card-time {
  font-size: 12px;
  color: #8a8fa0;
  font-variant-numeric: tabular-nums;
}
.ctp-tomorrow {
  margin-top: 6px;
  font-size: 12px;
  color: #8a8fa0;
  cursor: pointer;
  border-top: 1px solid #262933;
  padding-top: 8px;
}
</style>
