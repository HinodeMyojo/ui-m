<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchTimeStats,
  fetchTimeEntries,
  deleteTimeEntry,
} from "@/components/api.js";

const emit = defineEmits(["close"]);

const currentDate = ref(new Date());
const viewMode = ref("week"); // 'week' или 'month'
const timeStats = ref([]);
const todayEntries = ref([]);

const statsData = computed(() => {
  if (viewMode.value === "week") {
    return getLast7Days();
  } else {
    return getLast30Days();
  }
});

const maxHours = computed(() => {
  return Math.max(...statsData.value.map((d) => d.hours), 8);
});

const totalHours = computed(() => {
  console.log(statsData.value);
  return statsData.value.reduce((sum, d) => sum + d.hours, 0);
});

const averageHours = computed(() => {
  const avg = totalHours.value / statsData.value.length;
  return avg.toFixed(1);
});

function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(currentDate.value);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    console.log("dateStr:", dateStr);
    console.log("timeStats:", timeStats.value);

    // Split the stat.date to compare only the date part
    const stat = timeStats.value.find((s) => s.date.split("T")[0] === dateStr);

    console.log("Stat:", stat);
    days.push({
      date: dateStr,
      dayName: date.toLocaleDateString("ru", { weekday: "short" }),
      dayNum: date.getDate(),
      hours: stat ? stat.hours : 0,
    });
  }
  return days;
}

function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(currentDate.value);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const stat = timeStats.value.find((s) => s.date.split("T")[0] === dateStr);
    days.push({
      date: dateStr,
      dayName: date.toLocaleDateString("ru", { weekday: "short" }),
      dayNum: date.getDate(),
      hours: stat ? stat.hours : 0,
    });
  }
  return days;
}

function getBarHeight(hours) {
  return (hours / maxHours.value) * 100;
}

async function loadStats() {
  const endDate = new Date(currentDate.value);
  const startDate = new Date(currentDate.value);

  if (viewMode.value === "week") {
    startDate.setDate(startDate.getDate() - 6);
  } else {
    startDate.setDate(startDate.getDate() - 29);
  }

  timeStats.value = await fetchTimeStats(startDate, endDate);
}

async function loadTodayEntries() {
  todayEntries.value = await fetchTimeEntries(new Date());
}

async function handleDeleteEntry(id) {
  if (confirm("Удалить запись?")) {
    await deleteTimeEntry(id);
    await loadTodayEntries();
    await loadStats();
  }
}

function formatTime(hours) {
  if (hours < 1) {
    return `${Math.round(hours * 60)}м`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}

onMounted(() => {
  loadStats();
  loadTodayEntries();
});
</script>

<template>
  <div class="stats-modal-overlay" @click.self="emit('close')">
    <div class="stats-modal">
      <button class="close-btn" @click="emit('close')">×</button>

      <h2 class="stats-title">Статистика времени</h2>

      <!-- Переключатель режима -->
      <div class="view-toggle">
        <button
          class="toggle-btn"
          :class="{ active: viewMode === 'week' }"
          @click="
            viewMode = 'week';
            loadStats();
          "
        >
          Неделя
        </button>
        <button
          class="toggle-btn"
          :class="{ active: viewMode === 'month' }"
          @click="
            viewMode = 'month';
            loadStats();
          "
        >
          Месяц
        </button>
      </div>

      <!-- Общая статистика -->
      <div class="summary-cards">
        <div class="summary-card">
          <span class="summary-label">Всего</span>
          <span class="summary-value">{{ totalHours.toFixed(1) }}ч</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">Среднее</span>
          <span class="summary-value">{{ averageHours }}ч</span>
        </div>
      </div>

      <!-- График -->
      <div class="chart-container">
        <div class="chart">
          <div
            v-for="day in statsData"
            :key="day.date"
            class="chart-bar-wrapper"
          >
            <div class="chart-bar-container">
              <div
                class="chart-bar"
                :style="{ height: getBarHeight(day.hours) + '%' }"
                :class="{
                  'bar-low': day.hours < 4,
                  'bar-medium': day.hours >= 4 && day.hours < 7,
                  'bar-high': day.hours >= 7,
                }"
              >
                <span class="bar-value" v-if="day.hours > 0">
                  {{ day.hours.toFixed(1) }}
                </span>
              </div>
            </div>
            <div class="chart-label">
              <div class="day-name">{{ day.dayName }}</div>
              <div class="day-num">{{ day.dayNum }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Записи за сегодня -->
      <div class="today-entries">
        <h3 class="entries-title">Сегодня</h3>
        <div class="entries-list" v-if="todayEntries.length > 0">
          <div v-for="entry in todayEntries" :key="entry.id" class="entry-item">
            <div class="entry-info">
              <span class="entry-time">{{ formatTime(entry.hours) }}</span>
              <span class="entry-description">{{ entry.description }}</span>
            </div>
            <button
              class="entry-delete"
              @click="handleDeleteEntry(entry.id)"
              title="Удалить"
            >
              🗑
            </button>
          </div>
        </div>
        <div class="no-entries" v-else>Нет записей за сегодня</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 30, 0.9);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 20px;
}

.stats-modal {
  background: linear-gradient(
    135deg,
    rgba(35, 35, 43, 0.98),
    rgba(30, 32, 45, 0.98)
  );
  border: 1px solid rgba(110, 74, 255, 0.3);
  border-radius: 20px;
  padding: 32px;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 20px 80px rgba(0, 0, 0, 0.6);
  scrollbar-width: thin;
  scrollbar-color: #6e4aff #18191f;
}

.close-btn {
  position: absolute;
  top: 20px;
  right: 24px;
  background: none;
  border: none;
  color: #fff;
  font-size: 2.2rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  line-height: 1;
  z-index: 10;
}

.close-btn:hover {
  opacity: 1;
}

.stats-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 24px 0;
}

.view-toggle {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
}

.toggle-btn {
  flex: 1;
  background: rgba(110, 74, 255, 0.1);
  border: 1px solid rgba(110, 74, 255, 0.3);
  border-radius: 10px;
  padding: 10px 20px;
  color: #b7c9d1;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(110, 74, 255, 0.2);
  color: #fff;
}

.toggle-btn.active {
  background: linear-gradient(90deg, #6e4aff, #8b68ff);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 16px rgba(110, 74, 255, 0.3);
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.summary-card {
  background: rgba(110, 74, 255, 0.1);
  border: 1px solid rgba(110, 74, 255, 0.2);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.summary-label {
  font-size: 0.9rem;
  color: #b7c9d1;
  font-weight: 500;
}

.summary-value {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
}

.chart-container {
  background: rgba(24, 25, 31, 0.5);
  border: 1px solid rgba(110, 74, 255, 0.15);
  border-radius: 14px;
  padding: 24px;
  margin-bottom: 32px;
}

.chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  height: 250px;
  padding-bottom: 40px;
  position: relative;
}

.chart-bar-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.chart-bar-container {
  width: 100%;
  height: 250px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.chart-bar {
  width: 100%;
  max-width: 50px;
  background: linear-gradient(180deg, #6e4aff, #8b68ff);
  border-radius: 6px 6px 0 0;
  transition: all 0.3s ease;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8px;
  position: relative;
  box-shadow: 0 -2px 12px rgba(110, 74, 255, 0.3);
}

.bar-low {
  background: linear-gradient(180deg, #ff7875, #ff4d4f);
  box-shadow: 0 -2px 12px rgba(255, 77, 79, 0.3);
}

.bar-medium {
  background: linear-gradient(180deg, #ffa940, #ffec3d);
  box-shadow: 0 -2px 12px rgba(255, 169, 64, 0.3);
}

.bar-high {
  background: linear-gradient(180deg, #52c41a, #73d13d);
  box-shadow: 0 -2px 12px rgba(82, 196, 26, 0.3);
}

.chart-bar:hover {
  filter: brightness(1.2);
  transform: scaleY(1.02);
}

.bar-value {
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.chart-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.day-name {
  font-size: 0.75rem;
  color: #b7c9d1;
  font-weight: 600;
  text-transform: uppercase;
}

.day-num {
  font-size: 0.9rem;
  color: #7e8a99;
  font-weight: 500;
}

.today-entries {
  margin-top: 24px;
}

.entries-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 16px 0;
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entry-item {
  background: rgba(110, 74, 255, 0.08);
  border: 1px solid rgba(110, 74, 255, 0.2);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.2s;
}

.entry-item:hover {
  background: rgba(110, 74, 255, 0.15);
  border-color: rgba(110, 74, 255, 0.35);
}

.entry-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.entry-time {
  font-size: 1.1rem;
  font-weight: 700;
  color: #6e4aff;
  min-width: 60px;
}

.entry-description {
  font-size: 1rem;
  color: #b7c9d1;
}

.entry-delete {
  background: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.2);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 1rem;
  cursor: pointer;
  opacity: 0.7;
  transition: all 0.2s;
}

.entry-delete:hover {
  background: rgba(255, 77, 79, 0.2);
  border-color: rgba(255, 77, 79, 0.4);
  opacity: 1;
}

.no-entries {
  text-align: center;
  color: #7e8a99;
  font-size: 1rem;
  padding: 32px;
  font-style: italic;
}

/* Responsive */
@media (max-width: 768px) {
  .stats-modal {
    padding: 24px 16px;
  }

  .summary-cards {
    grid-template-columns: 1fr;
  }

  .chart {
    gap: 4px;
  }

  .bar-value {
    font-size: 0.65rem;
  }

  .entry-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
