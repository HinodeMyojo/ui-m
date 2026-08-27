<script setup>
import { ref, computed, onMounted, watch } from "vue";
import confetti from "canvas-confetti";
import { useRouter } from "vue-router";
import { fetchDisciplineMonth, disciplineLogicalToday } from "../api.js";
import DisciplineChecklist from "./DisciplineChecklist.vue";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  dayCellStyle,
  dayCellTitle,
} from "./dayScale.js";

const router = useRouter();

const COLLAPSE_KEY = "disciplineCollapsed";
const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === "1");
function toggleCollapse() {
  collapsed.value = !collapsed.value;
  localStorage.setItem(COLLAPSE_KEY, collapsed.value ? "1" : "0");
}

const month = ref(null);
const loadError = ref(false);
const today = ref(disciplineLogicalToday());
const heatmapOpen = ref(false);
const sheetOpen = ref(false);
const modalDate = ref(null); // просмотр/правка произвольного дня

async function load() {
  today.value = disciplineLogicalToday();
  const [y, m] = today.value.split("-").map(Number);
  try {
    month.value = await fetchDisciplineMonth(m, y);
    loadError.value = false;
  } catch (e) {
    console.error("discipline load error", e);
    loadError.value = true;
  }
}

onMounted(load);

const todayDay = computed(() => (month.value?.days || []).find((d) => d.date === today.value));
const summary = computed(() => month.value?.summary || null);
const plan = computed(() => month.value?.plan || null);

const counters = computed(() => {
  const list = [];
  for (const s of month.value?.skills || []) {
    for (const a of s.activities) {
      if (a.isCounter) list.push(a);
    }
  }
  return list;
});

const statusColor = computed(() => STATUS_COLORS[todayDay.value?.status] || "#5b616e");
const statusLabel = computed(() => STATUS_LABELS[todayDay.value?.status] || "…");

const prognosis = computed(() => {
  const s = summary.value;
  if (!s || !plan.value) return "";
  if (!s.medPossible) return "⚠️ 15 средних уже не успеть";
  if (s.medNeeded > 0)
    return `Нужно ещё ${s.medNeeded} сред. за ${s.daysLeft} дн.`;
  if (s.maxNeeded > 0)
    return `Средние есть! Ещё ${s.maxNeeded} макс. за ${s.daysLeft} дн.`;
  return "Квоты месяца закрыты 🎉";
});

// празднование переходов статуса
let prevMedDays = null;
let prevMaxDays = null;
watch(summary, (s) => {
  if (!s) return;
  if (prevMedDays !== null && s.medDays > prevMedDays) {
    fireConfetti(false);
    showBanner("Средний план закрыт — можно наградить себя! 🍰");
  }
  if (prevMaxDays !== null && s.maxDays > prevMaxDays) {
    fireConfetti(true);
    showBanner("МАКС по навыку! Вознагради себя как следует ⭐");
  }
  prevMedDays = s.medDays;
  prevMaxDays = s.maxDays;
});

const banner = ref("");
let bannerTimer = null;
function showBanner(text) {
  banner.value = text;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (banner.value = ""), 6000);
}

function fireConfetti(big) {
  const base = {
    particleCount: big ? 160 : 80,
    spread: big ? 110 : 70,
    origin: { y: 0.4 },
    colors: big
      ? ["#b37feb", "#8b5cf6", "#ffd666", "#ffffff"]
      : ["#95de64", "#ffd666", "#69c0ff"],
  };
  confetti(base);
  if (big) setTimeout(() => confetti({ ...base, origin: { y: 0.6 } }), 250);
}

function openDay(d) {
  if (d.status === "pre") return;
  modalDate.value = d.date;
}

const WEEKDAY_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
function weekdayName(dateStr) {
  return WEEKDAY_FULL[new Date(dateStr + "T12:00:00").getDay()];
}
</script>

<template>
  <!-- Десктоп: правая секция -->
  <aside class="dsc-panel" :class="{ 'dsc-collapsed': collapsed }">
    <template v-if="collapsed">
      <button class="dsc-expand-btn" title="Развернуть трекер" @click="toggleCollapse">◀</button>
      <div class="dsc-mini-status" :style="{ background: statusColor }" :title="statusLabel"></div>
      <div class="dsc-mini-streak" v-if="summary">🔥{{ summary.globalStreak }}</div>
    </template>

    <template v-else>
      <div class="dsc-head">
        <span class="dsc-head-title">Дисциплина</span>
        <button class="dsc-icon-btn" title="Страница трекера" @click="router.push('/discipline')">⤢</button>
        <button class="dsc-icon-btn" title="Свернуть" @click="toggleCollapse">▶</button>
      </div>

      <div v-if="loadError" class="dsc-error">
        Не удалось загрузить трекер
        <button class="dsc-icon-btn" @click="load">↻</button>
      </div>

      <template v-else-if="month">
        <div v-if="banner" class="dsc-banner">{{ banner }}</div>

        <div class="dsc-status-row">
          <div class="dsc-status-chip" :style="{ borderColor: statusColor, color: statusColor }">
            {{ statusLabel }}
          </div>
          <div class="dsc-streak" title="Общий стрик минимума">🔥 {{ summary.globalStreak }}</div>
        </div>

        <div class="dsc-quotas">
          <div class="dsc-quota" :class="{ 'dsc-quota-done': summary.medDays >= plan.effMedTarget }">
            <span>Сред</span><b>{{ summary.medDays }}/{{ plan.effMedTarget }}</b>
          </div>
          <div class="dsc-quota" :class="{ 'dsc-quota-done': summary.maxDays >= plan.effMaxTarget }">
            <span>Макс</span><b>{{ summary.maxDays }}/{{ plan.effMaxTarget }}</b>
          </div>
          <div class="dsc-quota" :class="{ 'dsc-quota-over': summary.overLimitRests > 0 }">
            <span>Отдых</span><b>{{ summary.restUsed }}/{{ plan.restLimit }}</b>
          </div>
          <div v-for="c in counters" :key="c.id" class="dsc-quota"
            :class="{ 'dsc-quota-done': c.counterGoal && c.counterDone >= c.counterGoal }" :title="c.title">
            <span>{{ c.emoji }}</span><b>{{ c.counterDone }}/{{ c.counterGoal || "∞" }}</b>
          </div>
        </div>

        <div class="dsc-prognosis">{{ prognosis }}</div>

        <button class="dsc-heatmap-toggle" @click="heatmapOpen = !heatmapOpen">
          {{ heatmapOpen ? "▾ Скрыть месяц" : "▸ Показать месяц" }}
        </button>
        <div v-if="heatmapOpen" class="dsc-heatmap">
          <div v-for="d in month.days" :key="d.date" class="dsc-cell" :class="{ 'dsc-cell-today': d.date === today }"
            :style="dayCellStyle(d)" :title="dayCellTitle(d)"
            @click="openDay(d)">
            <span v-if="d.maxedSkills.length > 1" class="dsc-cell-star">⭐</span>
          </div>
        </div>

        <div class="dsc-today-label">Сегодня, {{ parseInt(today.slice(8)) }} число · {{ weekdayName(today) }}</div>
        <DisciplineChecklist :month="month" :date="today" @changed="load" />

        <!-- Виджет roadmap'а переехал в полосу под шапкой (RoadmapStatusBar):
             отставание должно быть видно сразу, а не в конце правой колонки. -->
      </template>

      <div v-else class="dsc-loading">Загрузка…</div>
    </template>
  </aside>

  <!-- Мобила: стики-бар снизу -->
  <div class="dsc-mobile-bar" @click="sheetOpen = true">
    <div class="dsc-mini-status" :style="{ background: statusColor }"></div>
    <span class="dsc-bar-label">{{ statusLabel }}</span>
    <span v-if="summary" class="dsc-bar-quotas">
      С {{ summary.medDays }}/{{ plan?.effMedTarget }} · М {{ summary.maxDays }}/{{ plan?.effMaxTarget }}
    </span>
    <span v-if="summary" class="dsc-streak">🔥{{ summary.globalStreak }}</span>
  </div>

  <!-- Мобила: bottom-sheet -->
  <transition name="dsc-sheet">
    <div v-if="sheetOpen" class="dsc-sheet-overlay" @click.self="sheetOpen = false">
      <div class="dsc-sheet">
        <div class="dsc-sheet-grip" @click="sheetOpen = false"></div>
        <div v-if="month" class="dsc-sheet-content">
          <div v-if="banner" class="dsc-banner">{{ banner }}</div>
          <div class="dsc-status-row">
            <div class="dsc-status-chip" :style="{ borderColor: statusColor, color: statusColor }">{{ statusLabel }}</div>
            <div class="dsc-streak">🔥 {{ summary.globalStreak }}</div>
            <button class="dsc-icon-btn" @click="sheetOpen = false; router.push('/discipline')">⤢</button>
          </div>
          <div class="dsc-quotas">
            <div class="dsc-quota"><span>Сред</span><b>{{ summary.medDays }}/{{ plan.effMedTarget }}</b></div>
            <div class="dsc-quota"><span>Макс</span><b>{{ summary.maxDays }}/{{ plan.effMaxTarget }}</b></div>
            <div class="dsc-quota"><span>Отдых</span><b>{{ summary.restUsed }}/{{ plan.restLimit }}</b></div>
          </div>
          <div class="dsc-prognosis">{{ prognosis }}</div>
          <div class="dsc-heatmap">
            <div v-for="d in month.days" :key="d.date" class="dsc-cell" :class="{ 'dsc-cell-today': d.date === today }"
              :style="dayCellStyle(d)" :title="dayCellTitle(d)" @click="openDay(d)"></div>
          </div>
          <DisciplineChecklist :month="month" :date="today" @changed="load" />
        </div>
      </div>
    </div>
  </transition>

  <!-- Модалка произвольного дня -->
  <transition name="dsc-sheet">
    <div v-if="modalDate && month" class="dsc-sheet-overlay" @click.self="modalDate = null">
      <div class="dsc-day-modal">
        <div class="dsc-day-modal-head">
          <b>{{ modalDate.slice(8) }} {{ ["", "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"][parseInt(modalDate.slice(5, 7))] }}</b>
          <span class="dsc-day-modal-status"
            :style="{ color: STATUS_COLORS[month.days.find(d => d.date === modalDate)?.status] }">
            {{ STATUS_LABELS[month.days.find(d => d.date === modalDate)?.status] }}
          </span>
          <button class="dsc-icon-btn" @click="modalDate = null">✕</button>
        </div>
        <div class="dsc-day-modal-body">
          <DisciplineChecklist :month="month" :date="modalDate" @changed="load" />
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.dsc-panel {
  width: 320px;
  flex-shrink: 0;
  background: #191b21;
  border-left: 1px solid #262933;
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
  scrollbar-color: #6e4aff #111;
}

.dsc-collapsed {
  width: 44px;
  align-items: center;
  padding: 10px 4px;
}

.dsc-expand-btn {
  background: transparent;
  border: none;
  color: #7a7f8e;
  cursor: pointer;
  font-size: 14px;
  padding: 6px;
}

.dsc-mini-status {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dsc-mini-streak {
  font-size: 11px;
  color: #ffab5e;
  writing-mode: initial;
}

.dsc-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dsc-head-title {
  flex: 1;
  font-weight: 700;
  font-size: 14px;
  color: #e8eaf2;
}

.dsc-icon-btn {
  background: transparent;
  border: 1px solid #2a2d38;
  border-radius: 6px;
  color: #9aa0b0;
  cursor: pointer;
  padding: 2px 8px;
  font-size: 13px;
  min-height: 26px;
}

.dsc-icon-btn:hover {
  color: #e8eaf2;
  border-color: #6e4aff;
}

.dsc-error,
.dsc-loading {
  color: #7a7f8e;
  font-size: 13px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.dsc-banner {
  background: linear-gradient(120deg, #2a2060, #14391f);
  border: 1px solid #b37feb;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  color: #e8eaf2;
  animation: dsc-pulse 1.2s ease-in-out infinite alternate;
}

@keyframes dsc-pulse {
  from {
    box-shadow: 0 0 4px #b37feb55;
  }

  to {
    box-shadow: 0 0 14px #b37feb99;
  }
}

.dsc-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsc-status-chip {
  border: 1.5px solid;
  border-radius: 8px;
  padding: 3px 10px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  flex: 1;
  text-align: center;
}

.dsc-streak {
  font-size: 13px;
  color: #ffab5e;
  font-weight: 600;
}

.dsc-quotas {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dsc-quota {
  background: #1e2027;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 11px;
  color: #9aa0b0;
  display: flex;
  gap: 5px;
  align-items: center;
}

.dsc-quota b {
  color: #e8eaf2;
}

.dsc-quota-done {
  border-color: #63c94f;
}

.dsc-quota-done b {
  color: #95de64;
}

.dsc-quota-over {
  border-color: #e5484d;
}

.dsc-quota-over b {
  color: #ff7875;
}

.dsc-prognosis {
  font-size: 12px;
  color: #8ab4ff;
}

.dsc-heatmap-toggle {
  background: transparent;
  border: none;
  color: #7a7f8e;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  padding: 2px 0;
}

.dsc-heatmap-toggle:hover {
  color: #e8eaf2;
}

.dsc-heatmap {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}

.dsc-cell {
  aspect-ratio: 1;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  min-width: 0;
}

.dsc-cell:hover {
  outline: 1px solid #e8eaf2;
}

.dsc-cell-today {
  outline: 2px solid #ffffffcc;
}

.dsc-cell-star {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
}

.dsc-today-label {
  font-size: 12px;
  color: #7a7f8e;
  margin-top: 2px;
}

/* мобильный бар и шторка скрыты на десктопе */
.dsc-mobile-bar {
  display: none;
}

.dsc-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.dsc-sheet {
  background: #191b21;
  border-radius: 18px 18px 0 0;
  width: 100vw;
  max-height: 90dvh;
  display: flex;
  flex-direction: column;
}

.dsc-sheet-grip {
  width: 44px;
  height: 5px;
  border-radius: 3px;
  background: #333748;
  margin: 8px auto;
  flex-shrink: 0;
  cursor: pointer;
}

.dsc-sheet-content {
  padding: 4px 12px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsc-day-modal {
  background: #191b21;
  border: 1px solid #2a2d38;
  border-radius: 14px;
  width: min(420px, 94vw);
  max-height: 86dvh;
  display: flex;
  flex-direction: column;
  margin: auto;
}

.dsc-day-modal-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #262933;
  color: #e8eaf2;
}

.dsc-day-modal-head b {
  flex: 1;
}

.dsc-day-modal-status {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.dsc-day-modal-body {
  padding: 12px;
  overflow-y: auto;
}

.dsc-sheet-enter-active,
.dsc-sheet-leave-active {
  transition: opacity 0.2s;
}

.dsc-sheet-enter-from,
.dsc-sheet-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .dsc-panel {
    display: none;
  }

  .dsc-mobile-bar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    /* Садится над нижним меню мобильного слоя, а не под него: 58px — высота
       таб-бара, env() — «подбородок» айфона. Сюда попадают только с
       /?desktop=1, месячной сеткой на телефоне. */
    bottom: calc(58px + env(safe-area-inset-bottom, 0px));
    z-index: 1100;
    background: #14161cf2;
    border-top: 1px solid #262933;
    backdrop-filter: blur(6px);
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    cursor: pointer;
  }

  .dsc-bar-label {
    font-size: 13px;
    font-weight: 700;
    color: #e8eaf2;
    text-transform: uppercase;
  }

  .dsc-bar-quotas {
    flex: 1;
    font-size: 12px;
    color: #9aa0b0;
    text-align: right;
  }

  .dsc-day-modal {
    width: 100vw;
    max-height: 92dvh;
    border-radius: 18px 18px 0 0;
    margin: 0;
  }
}
</style>
