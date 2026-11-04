<script setup>
// Кнопка «Расписание» в шапке главной: ведёт в календарь и сразу говорит,
// что ближайшее. Окно — две недели: у пар перерывы бывают и по неделе.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchCalendarEvents } from "@/components/calendarApi.js";
import { addDays, layerOf, logicalToday, parseDay } from "./calendarLayers.js";

const router = useRouter();
const events = ref([]);
const now = ref(Date.now());
let timer = null;

async function load() {
  const from = logicalToday();
  try {
    events.value = (await fetchCalendarEvents(from, addDays(from, 15))) || [];
  } catch {
    events.value = [];
  }
}

onMounted(() => {
  load();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 60 * 1000);
});
onBeforeUnmount(() => clearInterval(timer));

const upcoming = computed(() =>
  events.value
    .filter((ev) => !ev.allDay && new Date(ev.end).getTime() > now.value)
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0],
);

const label = computed(() => {
  const ev = upcoming.value;
  if (!ev) return "";
  const start = new Date(ev.start);
  if (start.getTime() <= now.value) return `сейчас: ${ev.title}`;
  const time = start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const today = parseDay(logicalToday());
  const local = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diff = Math.round((local - today) / 86400000);
  const day =
    diff === 0
      ? "сегодня"
      : diff === 1
        ? "завтра"
        : start.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
  return `${day} ${time} · ${ev.title}`;
});
</script>

<template>
  <button
    class="add-task-btn next-ev"
    :title="upcoming ? `${layerOf(upcoming.category).emoji} ${upcoming.title}${upcoming.location ? ' — ' + upcoming.location : ''}` : 'Календарь и расписание'"
    @click="router.push('/calendar')"
  >
    🗓 Расписание
    <span v-if="label" class="next-ev-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.next-ev {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 320px;
  white-space: nowrap;
}
.next-ev-label {
  font-size: 12px;
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 400;
}
/* Шапка главной тесная: на обычном экране — только кнопка, ближайшее
   событие во всплывающей подсказке. */
@media (max-width: 1800px) {
  .next-ev-label {
    display: none;
  }
}
</style>
