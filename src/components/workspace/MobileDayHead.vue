<script setup>
import { computed, ref } from "vue";

// Шапка «Сегодня» на телефоне.
//
// На десктопе в шапке десяток кнопок в ряд — на 390 пикселях они ложатся в три
// строки и съедают пол-экрана до первого дела. Здесь остаётся то, чем на
// телефоне пользуются каждый раз: какой день, листнуть соседний, сколько
// сделано и цель дня. Всё остальное — дисциплина, спорт, поиск, холст — в меню
// «⋯»: открывают его редко, а место оно занимает одну кнопку.

const props = defineProps({
  date: { type: String, required: true },
  isToday: { type: Boolean, default: false },
  totals: { type: Object, default: () => ({}) },
  focus: { type: String, default: "" },
  // Какие панели раздела сейчас раскрыты — чтобы в меню было видно, что включено.
  open: { type: Object, default: () => ({}) },
  showGoogle: { type: Boolean, default: false },
});
const emit = defineEmits(["update:date", "update:focus", "today", "tool"]);

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shift(delta) {
  const d = new Date(props.date + "T12:00:00");
  d.setDate(d.getDate() + delta);
  emit("update:date", iso(d));
}

const title = computed(() => {
  const d = new Date(props.date + "T12:00:00");
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
});

// Неделя выбранного дня, с понедельника: соседние дни — в одно касание, без
// календаря. Дальше недели прыгают через дату в заголовке.
const week = computed(() => {
  const d = new Date(props.date + "T12:00:00");
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const today = iso(new Date(Date.now() - 3 * 60 * 60 * 1000));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const value = iso(day);
    return { value, num: day.getDate(), wd: WEEKDAYS[day.getDay()], today: value === today };
  });
});

const done = computed(() => props.totals?.done || 0);
const total = computed(() => props.totals?.total || 0);
const percent = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0));

const menuOpen = ref(false);

const TOOLS = computed(() => [
  { key: "search", icon: "🔍", label: "Поиск по карточкам" },
  { key: "note", icon: "📝", label: "Холст дня", on: props.open.note },
  { key: "main", icon: "📌", label: "Задачи с главной", on: props.open.main },
  { key: "discipline", icon: "🎯", label: "Дисциплина", on: props.open.discipline },
  { key: "sport", icon: "🏋️", label: "Спорт", on: props.open.sport },
  { key: "roadmap", icon: "🗺️", label: "Чтение", on: props.open.roadmap },
  { key: "sort", icon: "🕐", label: "Выстроить по времени" },
  ...(props.showGoogle ? [{ key: "google", icon: "📅", label: "Google Календарь" }] : []),
  { key: "board", icon: "🗂", label: "Полная доска" },
]);

function pick(key) {
  menuOpen.value = false;
  emit("tool", key);
}
</script>

<template>
  <header class="mdh">
    <div class="mdh-row">
      <button class="mdh-arrow" aria-label="Предыдущий день" @click="shift(-1)">‹</button>
      <label class="mdh-title">
        <span class="mdh-day">{{ title }}</span>
        <span class="mdh-sub">
          <template v-if="isToday">сегодня</template>
          <template v-else>{{ date.split("-").reverse().join(".") }}</template>
        </span>
        <!-- Нативный выбор даты поверх заголовка: на телефоне он лучше любого своего. -->
        <input
          class="mdh-date-input"
          type="date"
          :value="date"
          aria-label="Выбрать день"
          @change="$event.target.value && emit('update:date', $event.target.value)"
        />
      </label>
      <button class="mdh-arrow" aria-label="Следующий день" @click="shift(1)">›</button>
      <button class="mdh-more" aria-label="Ещё" @click="menuOpen = true">⋯</button>
    </div>

    <div class="mdh-week">
      <button
        v-for="d in week"
        :key="d.value"
        class="mdh-wd"
        :class="{ active: d.value === date, today: d.today }"
        @click="emit('update:date', d.value)"
      >
        <span class="mdh-wd-name">{{ d.wd }}</span>
        <span class="mdh-wd-num">{{ d.num }}</span>
      </button>
    </div>

    <button v-if="!isToday" class="mdh-back" @click="emit('today')">← К сегодняшнему дню</button>

    <div class="mdh-progress">
      <div class="mdh-bar"><div class="mdh-bar-fill" :style="{ width: percent + '%' }"></div></div>
      <span class="mdh-count"><b>{{ done }}</b> из {{ total }}</span>
      <span
        v-if="totals?.staleCount"
        class="mdh-stale"
        :class="{ bad: totals.staleMaxDays >= 4 }"
      >🔁 висит {{ totals.staleCount }}</span>
      <span v-if="totals?.openBlockers" class="mdh-stale bad">🚧 {{ totals.openBlockers }}</span>
    </div>

    <input
      class="mdh-focus"
      :value="focus"
      placeholder="🎯 Главная цель дня…"
      enterkeyhint="done"
      @input="emit('update:focus', $event.target.value)"
      @keydown.enter="$event.target.blur()"
    />

    <Teleport to="body">
      <transition name="mdh-fade">
        <div v-if="menuOpen" class="mdh-scrim" @click="menuOpen = false"></div>
      </transition>
      <transition name="mdh-up">
        <div v-if="menuOpen" class="mdh-sheet" role="menu">
          <div class="mdh-grip"></div>
          <button v-for="t in TOOLS" :key="t.key" class="mdh-tool" :class="{ on: t.on }" @click="pick(t.key)">
            <span class="mdh-tool-icon">{{ t.icon }}</span>
            <span class="mdh-tool-label">{{ t.label }}</span>
            <span v-if="t.on" class="mdh-tool-on">открыто</span>
          </button>
          <button class="mdh-cancel" @click="menuOpen = false">Закрыть</button>
        </div>
      </transition>
    </Teleport>
  </header>
</template>

<style scoped>
.mdh {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mdh-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.mdh-arrow,
.mdh-more {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: none;
  background: #23232b;
  color: #e8eaf2;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.mdh-more {
  font-size: 22px;
  margin-left: 4px;
}
.mdh-title {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px 4px;
}
.mdh-day {
  font-size: 18px;
  font-weight: 700;
  text-transform: capitalize;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.mdh-sub {
  font-size: 12px;
  color: #8b90a0;
}
.mdh-date-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  border: none;
  /* Поле прозрачное, но тап по заголовку открывает системный календарь. */
}

.mdh-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.mdh-wd {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0;
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: #1f2027;
  color: #a9adbb;
  cursor: pointer;
}
.mdh-wd-name {
  font-size: 11px;
}
.mdh-wd-num {
  font-size: 16px;
  font-weight: 600;
  color: #e8eaf2;
}
.mdh-wd.today {
  border-color: #6e4aff66;
}
.mdh-wd.active {
  background: #6e4aff;
  color: #fff;
}
.mdh-wd.active .mdh-wd-num {
  color: #fff;
}

.mdh-back {
  align-self: center;
  background: none;
  border: none;
  color: #b3a6ff;
  font-size: 14px;
  padding: 4px 8px;
  cursor: pointer;
}

.mdh-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mdh-bar {
  flex: 1 1 auto;
  height: 6px;
  border-radius: 999px;
  background: #2b2c36;
  overflow: hidden;
}
.mdh-bar-fill {
  height: 100%;
  background: #63c94f;
  border-radius: inherit;
  transition: width 0.3s ease;
}
.mdh-count {
  font-size: 13px;
  color: #a9adbb;
  white-space: nowrap;
}
.mdh-count b {
  color: #e8eaf2;
}
.mdh-stale {
  font-size: 12px;
  color: #ffd666;
  white-space: nowrap;
}
.mdh-stale.bad {
  color: #ff7875;
}

.mdh-focus {
  width: 100%;
  box-sizing: border-box;
  background: #1f2027;
  border: 1px solid #2b2c36;
  border-radius: 12px;
  color: #e8eaf2;
  font-size: 16px; /* меньше 16 — iOS зумит страницу при фокусе */
  padding: 10px 12px;
  outline: none;
}
.mdh-focus:focus {
  border-color: #6e4aff;
}

.mdh-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2290;
}
.mdh-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2300;
  background: #23232b;
  border-radius: 18px 18px 0 0;
  padding: 8px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 80vh;
  overflow-y: auto;
  color: #e8eaf2;
}
.mdh-grip {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: #4a4b57;
  align-self: center;
  margin: 2px 0 8px;
}
.mdh-tool {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  padding: 0 8px;
  border: none;
  border-radius: 12px;
  background: none;
  color: inherit;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
}
.mdh-tool:active {
  background: #2e2e3a;
}
.mdh-tool-icon {
  width: 28px;
  text-align: center;
  font-size: 20px;
}
.mdh-tool-label {
  flex: 1;
}
.mdh-tool-on {
  font-size: 12px;
  color: #7ee0a5;
}
.mdh-cancel {
  margin-top: 6px;
  min-height: 48px;
  border: none;
  border-radius: 12px;
  background: #2e2e3a;
  color: #e8eaf2;
  font-size: 16px;
  cursor: pointer;
}

.mdh-fade-enter-active,
.mdh-fade-leave-active {
  transition: opacity 0.2s ease;
}
.mdh-fade-enter-from,
.mdh-fade-leave-to {
  opacity: 0;
}
.mdh-up-enter-active,
.mdh-up-leave-active {
  transition: transform 0.22s ease;
}
.mdh-up-enter-from,
.mdh-up-leave-to {
  transform: translateY(100%);
}
</style>
