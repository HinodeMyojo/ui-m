<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
  fetchJourneyMonth,
  upsertJourneyDay,
  updateJourneySettings,
  fetchTasks,
} from "./api.js";

// --- State ---
const today = new Date();
const currentMonth = ref(today.getMonth() + 1); // 1-12
const currentYear = ref(today.getFullYear());
const monthData = ref(null);
const loading = ref(false);
const selectedDay = ref(null);
const showDayModal = ref(false);
const showSettingsModal = ref(false);

// Day form
const dayForm = ref({
  description: "",
  hours: 0,
  tasks: [],
});

// Settings form
const settingsForm = ref({
  backgroundImage: "",
  backgroundOpacity: 0.3,
});

// Available subtasks from main tasks
const availableTasks = ref([]);
const taskSearchQuery = ref("");

// --- Computed ---
const daysInMonth = computed(() => monthData.value?.daysInMonth || 30);

const daysMap = computed(() => {
  const map = {};
  if (monthData.value?.days) {
    for (const d of monthData.value.days) {
      map[d.day] = d;
    }
  }
  return map;
});

const settings = computed(() => monthData.value?.settings || null);

const backgroundStyle = computed(() => {
  const s = settings.value;
  if (s?.backgroundImage) {
    return {
      backgroundImage: `url(${s.backgroundImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      opacity: s.backgroundOpacity || 0.3,
    };
  }
  return { background: "#0a0a0f", opacity: 1 };
});

const monthNames = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const currentMonthName = computed(() => monthNames[currentMonth.value - 1]);

const todayDay = computed(() => {
  const now = new Date();
  if (now.getMonth() + 1 === currentMonth.value && now.getFullYear() === currentYear.value) {
    return now.getDate();
  }
  return -1;
});

// Generate snake path positions
const ITEMS_PER_ROW = 6;
const nodePositions = computed(() => {
  const positions = [];
  const total = daysInMonth.value;
  const nodeSpacingX = 110;
  const nodeSpacingY = 100;
  const padding = 60;

  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / ITEMS_PER_ROW);
    const col = i % ITEMS_PER_ROW;
    const isReversed = row % 2 === 1;
    const actualCol = isReversed ? ITEMS_PER_ROW - 1 - col : col;

    // Add slight wave to y position
    const waveOffset = Math.sin((i / total) * Math.PI * 4) * 12;

    positions.push({
      x: padding + actualCol * nodeSpacingX + (Math.random() * 10 - 5),
      y: padding + row * nodeSpacingY + waveOffset,
      day: i + 1,
    });
  }
  return positions;
});

const svgWidth = computed(() => {
  return ITEMS_PER_ROW * 110 + 120;
});

const svgHeight = computed(() => {
  const rows = Math.ceil(daysInMonth.value / ITEMS_PER_ROW);
  return rows * 100 + 140;
});

// Generate SVG path between nodes
const pathD = computed(() => {
  const pts = nodePositions.value;
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    // Bezier curve for smooth path
    d += ` Q ${prev.x + (curr.x - prev.x) * 0.5} ${prev.y + (curr.y - prev.y) * 0.1}, ${midX} ${midY}`;
  }
  const last = pts[pts.length - 1];
  const secondLast = pts[pts.length - 2];
  d += ` Q ${secondLast.x + (last.x - secondLast.x) * 0.5} ${secondLast.y + (last.y - secondLast.y) * 0.9}, ${last.x} ${last.y}`;
  return d;
});

// Filtered tasks for search
const filteredTasks = computed(() => {
  if (!taskSearchQuery.value) return availableTasks.value.slice(0, 20);
  const q = taskSearchQuery.value.toLowerCase();
  return availableTasks.value.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 20);
});

// --- Methods ---
async function loadMonth() {
  loading.value = true;
  try {
    monthData.value = await fetchJourneyMonth(currentMonth.value, currentYear.value);
    if (monthData.value?.settings) {
      settingsForm.value.backgroundImage = monthData.value.settings.backgroundImage || "";
      settingsForm.value.backgroundOpacity = monthData.value.settings.backgroundOpacity || 0.3;
    }
  } catch (e) {
    console.error("Failed to load journey month:", e);
  } finally {
    loading.value = false;
  }
}

async function loadAvailableTasks() {
  try {
    const dateRef = ref(new Date(currentYear.value, currentMonth.value - 1, 1));
    const tasks = await fetchTasks(dateRef);
    // Flatten subtasks
    const flat = [];
    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        if (t.subtasks?.length) {
          for (const sub of t.subtasks) {
            flat.push({ id: sub.id, title: `${t.title} → ${sub.title}` });
          }
        } else {
          flat.push({ id: t.id, title: t.title });
        }
      }
    }
    availableTasks.value = flat;
  } catch (e) {
    console.error("Failed to load tasks:", e);
  }
}

function prevMonth() {
  if (currentMonth.value === 1) {
    currentMonth.value = 12;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
}

function nextMonth() {
  if (currentMonth.value === 12) {
    currentMonth.value = 1;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
}

function openDayModal(day) {
  selectedDay.value = day;
  const existing = daysMap.value[day];
  if (existing) {
    dayForm.value = {
      description: existing.description || "",
      hours: existing.hours || 0,
      tasks: existing.tasks ? [...existing.tasks] : [],
    };
  } else {
    dayForm.value = { description: "", hours: 0, tasks: [] };
  }
  showDayModal.value = true;
}

function closeDayModal() {
  showDayModal.value = false;
  selectedDay.value = null;
}

async function saveDay() {
  const dateStr = `${currentYear.value}-${String(currentMonth.value).padStart(2, "0")}-${String(selectedDay.value).padStart(2, "0")}`;
  await upsertJourneyDay({
    date: dateStr,
    description: dayForm.value.description,
    hours: dayForm.value.hours,
    tasks: dayForm.value.tasks,
  });
  closeDayModal();
  await loadMonth();
}

function addTaskToDay(task) {
  if (!dayForm.value.tasks.find((t) => t.taskId === task.id)) {
    dayForm.value.tasks.push({ taskId: task.id, taskTitle: task.title });
  }
  taskSearchQuery.value = "";
}

function removeTaskFromDay(idx) {
  dayForm.value.tasks.splice(idx, 1);
}

async function saveSettings() {
  await updateJourneySettings({
    month: currentMonth.value,
    year: currentYear.value,
    backgroundImage: settingsForm.value.backgroundImage,
    backgroundOpacity: settingsForm.value.backgroundOpacity,
  });
  showSettingsModal.value = false;
  await loadMonth();
}

function getRingColors(count) {
  const colors = ["#4ade80", "#60a5fa", "#f472b6", "#facc15", "#a78bfa", "#fb923c", "#34d399", "#f87171"];
  return colors.slice(0, Math.min(count, colors.length));
}

function getDayNodeClass(day) {
  const classes = ["journey-node"];
  if (day === todayDay.value) classes.push("journey-node--today");
  if (daysMap.value[day]) classes.push("journey-node--filled");
  if (day === daysInMonth.value) classes.push("journey-node--last");
  return classes.join(" ");
}

// --- Lifecycle ---
onMounted(() => {
  loadMonth();
  loadAvailableTasks();
});

watch([currentMonth, currentYear], () => {
  loadMonth();
  loadAvailableTasks();
});
</script>

<template>
  <div class="journey-wrapper">
    <!-- Background layer -->
    <div class="journey-bg" :style="backgroundStyle"></div>

    <!-- Content -->
    <div class="journey-content">
      <!-- Header -->
      <div class="journey-header">
        <button class="journey-nav-btn" @click="prevMonth">◀</button>
        <div class="journey-month-title">
          <span class="journey-month-name">{{ currentMonthName }}</span>
          <span class="journey-year">{{ currentYear }}</span>
        </div>
        <button class="journey-nav-btn" @click="nextMonth">▶</button>
        <button class="journey-settings-btn" @click="showSettingsModal = true" title="Настройки фона">⚙️</button>
      </div>

      <!-- Map -->
      <div class="journey-map-scroll">
        <svg
          class="journey-svg"
          :width="svgWidth"
          :height="svgHeight"
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        >
          <!-- Path connecting nodes -->
          <path
            :d="pathD"
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            stroke-width="3"
            stroke-dasharray="8 4"
            stroke-linecap="round"
          />

          <!-- Walked path (up to today) -->
          <path
            v-if="todayDay > 0"
            :d="pathD"
            fill="none"
            stroke="rgba(74, 222, 128, 0.4)"
            stroke-width="3"
            :stroke-dasharray="`${(todayDay / daysInMonth) * 100}% 9999`"
            stroke-linecap="round"
          />

          <!-- Day nodes -->
          <g v-for="pos in nodePositions" :key="pos.day">
            <!-- Rings (completed tasks) -->
            <circle
              v-for="(color, ri) in getRingColors(daysMap[pos.day]?.ringCount || 0)"
              :key="ri"
              :cx="pos.x"
              :cy="pos.y"
              :r="22 + (ri + 1) * 5"
              fill="none"
              :stroke="color"
              stroke-width="2.5"
              :opacity="0.7"
            />

            <!-- Main node circle -->
            <circle
              :cx="pos.x"
              :cy="pos.y"
              r="20"
              :class="getDayNodeClass(pos.day)"
              @click="openDayModal(pos.day)"
              style="cursor: pointer"
            />

            <!-- Day number -->
            <text
              :x="pos.x"
              :y="pos.y + 1"
              text-anchor="middle"
              dominant-baseline="central"
              class="journey-day-text"
              @click="openDayModal(pos.day)"
              style="cursor: pointer"
            >
              {{ pos.day }}
            </text>

            <!-- Last day dots (...) -->
            <g v-if="pos.day === daysInMonth">
              <circle :cx="pos.x + 35" :cy="pos.y" r="3" fill="rgba(255,255,255,0.4)" />
              <circle :cx="pos.x + 47" :cy="pos.y" r="3" fill="rgba(255,255,255,0.3)" />
              <circle :cx="pos.x + 59" :cy="pos.y" r="3" fill="rgba(255,255,255,0.2)" />
            </g>
          </g>

          <!-- Character (pixel figure on today) -->
          <g v-if="todayDay > 0 && nodePositions[todayDay - 1]">
            <text
              :x="nodePositions[todayDay - 1].x"
              :y="nodePositions[todayDay - 1].y - 32"
              text-anchor="middle"
              class="journey-character"
            >
              🧙
            </text>
          </g>
        </svg>
      </div>

      <!-- Previous month link -->
      <div class="journey-prev-link" v-if="currentMonth > 1 || currentYear > 2026">
        ← соединено с {{ monthNames[(currentMonth - 2 + 12) % 12] }}
      </div>
    </div>

    <!-- Day Modal -->
    <transition name="modal-fade">
      <div v-if="showDayModal" class="modal-overlay" @click.self="closeDayModal">
        <div class="modal-card journey-modal">
          <button class="modal-close" @click="closeDayModal">×</button>
          <div class="modal-content">
            <h2 class="modal-title">
              {{ selectedDay }} {{ currentMonthName }} {{ currentYear }}
            </h2>

            <div class="journey-form-group">
              <label class="journey-label">Чем занимался?</label>
              <textarea
                v-model="dayForm.description"
                class="form-textarea"
                rows="3"
                placeholder="Опиши свой день..."
              ></textarea>
            </div>

            <div class="journey-form-group">
              <label class="journey-label">Часы</label>
              <input
                v-model.number="dayForm.hours"
                type="number"
                class="form-input"
                min="0"
                max="24"
                step="0.5"
              />
            </div>

            <div class="journey-form-group">
              <label class="journey-label">Привязать задачи</label>
              <input
                v-model="taskSearchQuery"
                type="text"
                class="form-input"
                placeholder="Поиск задач..."
              />
              <div class="journey-task-list" v-if="taskSearchQuery || dayForm.tasks.length === 0">
                <button
                  v-for="task in filteredTasks"
                  :key="task.id"
                  class="journey-task-option"
                  @click="addTaskToDay(task)"
                >
                  + {{ task.title }}
                </button>
              </div>
            </div>

            <!-- Added tasks (rings preview) -->
            <div v-if="dayForm.tasks.length" class="journey-added-tasks">
              <div class="journey-label">Кольца дня ({{ dayForm.tasks.length }}):</div>
              <div
                v-for="(t, idx) in dayForm.tasks"
                :key="idx"
                class="journey-added-task"
              >
                <span
                  class="journey-ring-dot"
                  :style="{ background: getRingColors(dayForm.tasks.length)[idx] || '#888' }"
                ></span>
                {{ t.taskTitle }}
                <button class="journey-remove-task" @click="removeTaskFromDay(idx)">×</button>
              </div>
            </div>

            <button class="journey-save-btn" @click="saveDay">Сохранить</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Settings Modal -->
    <transition name="modal-fade">
      <div v-if="showSettingsModal" class="modal-overlay" @click.self="showSettingsModal = false">
        <div class="modal-card journey-modal">
          <button class="modal-close" @click="showSettingsModal = false">×</button>
          <div class="modal-content">
            <h2 class="modal-title">Настройки фона</h2>

            <div class="journey-form-group">
              <label class="journey-label">URL фонового изображения</label>
              <input
                v-model="settingsForm.backgroundImage"
                type="text"
                class="form-input"
                placeholder="https://..."
              />
            </div>

            <div class="journey-form-group">
              <label class="journey-label">
                Прозрачность: {{ (settingsForm.backgroundOpacity * 100).toFixed(0) }}%
              </label>
              <input
                v-model.number="settingsForm.backgroundOpacity"
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                class="journey-range"
              />
            </div>

            <div
              v-if="settingsForm.backgroundImage"
              class="journey-bg-preview"
              :style="{
                backgroundImage: `url(${settingsForm.backgroundImage})`,
                opacity: settingsForm.backgroundOpacity,
              }"
            ></div>

            <button class="journey-save-btn" @click="saveSettings">Сохранить</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.journey-wrapper {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #0a0a0f;
}

.journey-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  transition: opacity 0.5s;
}

.journey-content {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Header */
.journey-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
}

.journey-nav-btn {
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.3);
  color: #fff;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.journey-nav-btn:hover {
  background: rgba(23, 103, 253, 0.25);
  border-color: rgba(23, 103, 253, 0.6);
}

.journey-month-title {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.journey-month-name {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 2px;
}

.journey-year {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.journey-settings-btn {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  transition: transform 0.3s;
}

.journey-settings-btn:hover {
  transform: rotate(90deg);
}

/* Map scroll area */
.journey-map-scroll {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
}

.journey-svg {
  filter: drop-shadow(0 0 20px rgba(23, 103, 253, 0.1));
}

/* Node styles via CSS classes on SVG circles */
:deep(.journey-node) {
  fill: rgba(18, 19, 31, 0.9);
  stroke: rgba(255, 255, 255, 0.2);
  stroke-width: 2;
  transition: all 0.3s;
}

:deep(.journey-node:hover) {
  stroke: rgba(23, 103, 253, 0.8);
  stroke-width: 3;
  filter: drop-shadow(0 0 8px rgba(23, 103, 253, 0.4));
}

:deep(.journey-node--today) {
  fill: rgba(23, 103, 253, 0.3);
  stroke: #4ade80;
  stroke-width: 3;
  filter: drop-shadow(0 0 12px rgba(74, 222, 128, 0.5));
}

:deep(.journey-node--filled) {
  fill: rgba(23, 103, 253, 0.15);
  stroke: rgba(23, 103, 253, 0.5);
}

:deep(.journey-node--last) {
  stroke: rgba(255, 255, 255, 0.4);
  stroke-dasharray: 4 3;
}

:deep(.journey-day-text) {
  fill: #fff;
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
  pointer-events: none;
  user-select: none;
}

:deep(.journey-character) {
  font-size: 28px;
  filter: drop-shadow(0 0 6px rgba(255, 200, 50, 0.6));
  animation: journey-bounce 1.5s ease-in-out infinite;
}

@keyframes journey-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

/* Previous month link */
.journey-prev-link {
  text-align: center;
  padding: 10px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
  font-style: italic;
}

/* Modal styles */
.journey-modal {
  max-width: 500px;
}

.journey-form-group {
  margin-bottom: 16px;
}

.journey-label {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  margin-bottom: 6px;
  font-weight: 500;
}

.journey-task-list {
  max-height: 150px;
  overflow-y: auto;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.journey-task-option {
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 6px;
  color: #b7c9d1;
  padding: 6px 10px;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.journey-task-option:hover {
  background: rgba(23, 103, 253, 0.15);
  color: #fff;
}

.journey-added-tasks {
  margin-bottom: 16px;
}

.journey-added-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  color: #b7c9d1;
}

.journey-ring-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.journey-remove-task {
  background: none;
  border: none;
  color: #f87171;
  cursor: pointer;
  font-size: 16px;
  margin-left: auto;
}

.journey-save-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
}

.journey-save-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.journey-range {
  width: 100%;
  accent-color: #1767fd;
}

.journey-bg-preview {
  width: 100%;
  height: 100px;
  background-size: cover;
  background-position: center;
  border-radius: 10px;
  margin-bottom: 12px;
  border: 1px solid rgba(23, 103, 253, 0.2);
}
</style>
