<script setup>
// Ближайшие события на мобильной главной: сегодня и завтра, иначе — первое
// впереди. Тап — в календарь.
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchCalendarEvents } from "@/components/calendarApi.js";
import { addDays, eventColor, formatRange, logicalToday, parseDay } from "@/components/calendar/calendarLayers.js";

const router = useRouter();
const events = ref([]);
const loading = ref(true);
const failed = ref(false);
const today = logicalToday();

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    events.value = (await fetchCalendarEvents(today, addDays(today, 15))) || [];
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const dayEnd = (d) => parseDay(addDays(d, 1)).getTime();
const startOf = (ev) => (ev.allDay ? parseDay(ev.start).getTime() : new Date(ev.start).getTime());
const endOf = (ev) => (ev.allDay ? parseDay(ev.end).getTime() : new Date(ev.end).getTime());

const soon = computed(() => {
  const now = Date.now();
  const live = events.value.filter((ev) => endOf(ev) > now).sort((a, b) => startOf(a) - startOf(b));
  const twoDays = live.filter((ev) => startOf(ev) < dayEnd(addDays(today, 1)));
  return twoDays.length ? twoDays.slice(0, 6) : live.slice(0, 1);
});

function dayLabel(ev) {
  const d = new Date(startOf(ev));
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (key <= today) return "сегодня";
  if (key === addDays(today, 1)) return "завтра";
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}
</script>

<template>
  <section class="m-card">
    <button class="m-card-head" @click="router.push('/calendar')">
      <span class="m-card-title">🗓️ Расписание</span>
      <span class="m-chev">›</span>
    </button>
    <template v-if="loading">
      <div class="m-skeleton" style="width: 75%"></div>
    </template>
    <div v-else-if="failed" class="m-err">
      Календарь не загрузился <button class="m-btn m-btn-sm" @click="load">↻</button>
    </div>
    <div v-else-if="!soon.length" class="m-empty">Ближайшие две недели свободны</div>
    <ul v-else class="mcc-list">
      <li v-for="ev in soon" :key="ev.id" class="mcc-row" :style="{ '--c': eventColor(ev) }" @click="router.push('/calendar')">
        <span class="mcc-when">{{ dayLabel(ev) }} · {{ formatRange(ev) }}</span>
        <span class="mcc-title">{{ ev.title }}</span>
        <span v-if="ev.location" class="mcc-loc">📍 {{ ev.location }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.mcc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mcc-row {
  border-left: 3px solid var(--c);
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mcc-when {
  font-size: 12px;
  color: #a58bff;
}
.mcc-title {
  font-size: 15px;
}
.mcc-loc {
  font-size: 12px;
  color: #8a8fa0;
}
</style>
