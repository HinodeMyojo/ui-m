<template>
  <div class="salary-main">
    <div class="main-area">
      <div class="chart-container">
        <Line :data="chartData" :options="chartOptions" />
      </div>
    </div>
    <div class="task-area">
      <div class="tasks-container">
        <div class="main-task-label">
          Глобальные задачи
          <span class="task-counter" v-if="globalTasks.length">{{ activeGlobalTasks.length }}/{{ globalTasks.length }}</span>
        </div>
        <div class="main-tasks">
          <div
            class="main-task"
            :class="{ 'main-task-done': task.done }"
            v-for="task in displayedTasks"
            :key="task.id"
            @click="openGlobalTaskDetail(task)"
          >
            <div class="task-icon">{{ task.done ? '✅' : getTaskIcon(task) }}</div>
            <div class="task-info-mini">
              <div class="task-title">{{ task.title }}</div>
              <div class="task-progress-mini" v-if="task.totalSubtasks > 0">
                <div class="progress-bar-mini">
                  <div class="progress-fill-mini" :style="{ width: (task.completedSubtasks / task.totalSubtasks * 100) + '%' }"></div>
                </div>
                <span class="progress-text-mini">{{ task.completedSubtasks }}/{{ task.totalSubtasks }}</span>
              </div>
            </div>
          </div>
          <div v-if="globalTasks.length === 0" class="no-tasks">Нет глобальных задач</div>
        </div>
        <button v-if="globalTasks.length > 3" class="show-all-btn" @click="showGlobalTasksPanel = true">
          Все задачи ({{ globalTasks.length }})
        </button>
      </div>
      <div class="more">
        <button class="more-button" @click="openWindow">➕</button>
      </div>
    </div>

    <!-- Global tasks panel -->
    <Teleport to="body">
      <div v-if="showGlobalTasksPanel" class="gt-overlay" @click.self="showGlobalTasksPanel = false">
        <div class="gt-panel">
          <button class="gt-close" @click="showGlobalTasksPanel = false">×</button>
          <h2 class="gt-title">Глобальные задачи</h2>

          <div class="gt-tabs">
            <button :class="{ active: gtTab === 'active' }" @click="gtTab = 'active'">
              Активные ({{ activeGlobalTasks.length }})
            </button>
            <button :class="{ active: gtTab === 'completed' }" @click="gtTab = 'completed'">
              Выполненные ({{ completedGlobalTasks.length }})
            </button>
          </div>

          <!-- Active tasks -->
          <div v-if="gtTab === 'active'" class="gt-list">
            <div v-if="!activeGlobalTasks.length" class="gt-empty">Нет активных задач</div>
            <div v-for="task in activeGlobalTasks" :key="task.id" class="gt-card" @click="openGlobalTaskDetail(task)">
              <div class="gt-card-header">
                <span class="gt-card-icon">{{ getTaskIcon(task) }}</span>
                <span class="gt-card-title">{{ task.title }}</span>
                <button class="gt-check-btn" @click.stop="toggleGlobalTask(task)" title="Выполнить">✓</button>
              </div>
              <div class="gt-card-body" v-if="task.description">{{ task.description }}</div>
              <div class="gt-card-progress" v-if="task.totalSubtasks > 0">
                <div class="gt-progress-track">
                  <div class="gt-progress-fill" :style="{ width: (task.completedSubtasks / task.totalSubtasks * 100) + '%' }"></div>
                </div>
                <span class="gt-progress-text">{{ task.completedSubtasks }} из {{ task.totalSubtasks }} подзадач</span>
              </div>
              <div class="gt-card-subtasks" v-if="task.subtasks?.length">
                <div v-for="sub in task.subtasks" :key="sub.id" class="gt-subtask" :class="{ done: sub.done }">
                  <span class="gt-sub-check" @click.stop="toggleSubtask(sub)">{{ sub.done ? '☑' : '☐' }}</span>
                  <span class="gt-sub-title">{{ sub.title }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Completed tasks (history) -->
          <div v-if="gtTab === 'completed'" class="gt-list">
            <div v-if="!completedGlobalTasks.length" class="gt-empty">Нет выполненных задач</div>
            <div v-for="task in completedGlobalTasks" :key="task.id" class="gt-card gt-card-done">
              <div class="gt-card-header">
                <span class="gt-card-icon">✅</span>
                <span class="gt-card-title">{{ task.title }}</span>
                <button class="gt-uncheck-btn" @click.stop="toggleGlobalTask(task)" title="Вернуть">↩</button>
              </div>
              <div class="gt-card-completed-date" v-if="task.completedAt">
                Выполнено: {{ new Date(task.completedAt).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' }) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Global task detail modal -->
    <Teleport to="body">
      <div v-if="selectedGlobalTask" class="gt-overlay" @click.self="selectedGlobalTask = null">
        <div class="gt-panel gt-detail-panel">
          <button class="gt-close" @click="selectedGlobalTask = null">×</button>
          <div class="gt-detail-header">
            <span class="gt-detail-icon">{{ selectedGlobalTask.done ? '✅' : getTaskIcon(selectedGlobalTask) }}</span>
            <div>
              <h2 class="gt-title">{{ selectedGlobalTask.title }}</h2>
              <div class="gt-detail-meta" v-if="selectedGlobalTask.start || selectedGlobalTask.end">
                <span v-if="selectedGlobalTask.start">С {{ new Date(selectedGlobalTask.start).toLocaleDateString('ru') }}</span>
                <span v-if="selectedGlobalTask.end"> до {{ new Date(selectedGlobalTask.end).toLocaleDateString('ru') }}</span>
              </div>
            </div>
          </div>

          <div class="gt-detail-desc" v-if="selectedGlobalTask.description">{{ selectedGlobalTask.description }}</div>

          <div class="gt-detail-progress" v-if="selectedGlobalTask.totalSubtasks > 0">
            <div class="gt-progress-track" style="height: 8px;">
              <div class="gt-progress-fill" :style="{ width: (selectedGlobalTask.completedSubtasks / selectedGlobalTask.totalSubtasks * 100) + '%' }"></div>
            </div>
            <span class="gt-progress-text">{{ selectedGlobalTask.completedSubtasks }} из {{ selectedGlobalTask.totalSubtasks }} подзадач выполнено</span>
          </div>

          <div class="gt-detail-subtasks" v-if="selectedGlobalTask.subtasks?.length">
            <h4>Подзадачи</h4>
            <div v-for="sub in selectedGlobalTask.subtasks" :key="sub.id" class="gt-subtask-detail" :class="{ done: sub.done }">
              <span class="gt-sub-check" @click="toggleSubtask(sub)">{{ sub.done ? '☑' : '☐' }}</span>
              <div class="gt-sub-info">
                <span class="gt-sub-title">{{ sub.title }}</span>
                <span class="gt-sub-date" v-if="sub.completedAt">
                  Выполнено {{ new Date(sub.completedAt).toLocaleDateString('ru') }}
                </span>
              </div>
            </div>
          </div>

          <div class="gt-detail-actions">
            <button v-if="!selectedGlobalTask.done" class="gt-complete-btn" @click="toggleGlobalTask(selectedGlobalTask); selectedGlobalTask = null">
              ✓ Выполнить задачу
            </button>
            <button v-else class="gt-uncomplete-btn" @click="toggleGlobalTask(selectedGlobalTask); selectedGlobalTask = null">
              ↩ Вернуть в активные
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Затемнение фона -->
    <div v-if="isWindowOpen" class="overlay" @click="closeWindow"></div>
  </div>
  <!-- Окно -->
  <SalaryWindow v-if="isWindowOpen" @close="closeWindow" />
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { Line } from "vue-chartjs";
import SalaryWindow from "./SalaryWindow.vue";
import { getTaskIcon } from "@/utils/taskUtils";

import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale,
} from "chart.js";

import { fetchJobs, fetchSalaries, fetchGlobalTasks, checkTask } from "../api";

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale
);

const isWindowOpen = ref(false);
const jobs = ref([]);
const salaries = ref([]);
const globalTasks = ref([]); // Теперь загружается из API

// Global tasks logic
const showGlobalTasksPanel = ref(false);
const selectedGlobalTask = ref(null);
const gtTab = ref("active");

const activeGlobalTasks = computed(() => globalTasks.value.filter(t => !t.done));
const completedGlobalTasks = computed(() =>
  globalTasks.value.filter(t => t.done).sort((a, b) => {
    const da = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const db = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return db - da; // newest first
  })
);

const displayedTasks = computed(() => activeGlobalTasks.value.slice(0, 3));

function openGlobalTaskDetail(task) {
  selectedGlobalTask.value = task;
}

async function toggleGlobalTask(task) {
  try {
    await checkTask(task.id, !task.done);
    globalTasks.value = await fetchGlobalTasks();
  } catch {}
}

async function toggleSubtask(sub) {
  try {
    await checkTask(sub.id, !sub.done);
    globalTasks.value = await fetchGlobalTasks();
    // Refresh selected task if open
    if (selectedGlobalTask.value) {
      selectedGlobalTask.value = globalTasks.value.find(t => t.id === selectedGlobalTask.value.id) ?? null;
    }
  } catch {}
}

// Функции открытия/закрытия окна
function openWindow() {
  isWindowOpen.value = true;
  localStorage.setItem("financeWindowOpen", "true");
}

function closeWindow() {
  isWindowOpen.value = false;
  localStorage.setItem("financeWindowOpen", "false");
}

// Форматирование валюты
function formatCurrency(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

// Получение названия месяца
function getMonthName(month) {
  const months = [
    "Янв",
    "Фев",
    "Мар",
    "Апр",
    "Май",
    "Июн",
    "Июл",
    "Авг",
    "Сен",
    "Окт",
    "Ноя",
    "Дек",
  ];
  return months[month - 1] || "";
}

// Вычисляем факты по месяцам (агрегированные)
const factsByMonth = computed(() => {
  const facts = salaries.value.filter((s) => s.type === "fact");
  const grouped = {};

  facts.forEach((f) => {
    const key = `${f.year}-${String(f.month).padStart(2, "0")}`;
    if (!grouped[key]) {
      grouped[key] = { year: f.year, month: f.month, amount: 0 };
    }
    grouped[key].amount += f.amount;
  });

  return Object.values(grouped).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
});

// Получаем планы
const plans = computed(() => {
  return salaries.value
    .filter((s) => s.type === "plan")
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
});

// Данные для графика
const chartData = computed(() => {
  const labels = [];
  const factData = [];
  const planData = [];

  // Добавляем факты
  factsByMonth.value.forEach((f) => {
    const label = `${getMonthName(f.month)} ${f.year}`;
    labels.push(label);
    factData.push(f.amount);
    planData.push(null);
  });

  // Добавляем планы
  plans.value.forEach((p) => {
    const label = `${getMonthName(p.month)} ${p.year}`;
    if (!labels.includes(label)) {
      labels.push(label);
      factData.push(null);
      planData.push(p.amount);
    } else {
      const idx = labels.indexOf(label);
      planData[idx] = p.amount;
    }
  });

  return {
    labels,
    datasets: [
      {
        label: "Зарплата (факт)",
        data: factData,
        borderColor: "#ff66cc",
        backgroundColor: "rgba(255,102,204,0.2)",
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointBackgroundColor: "#ff99dd",
        spanGaps: false,
      },
      {
        label: "Планы",
        data: planData,
        borderColor: "#1767FD",
        backgroundColor: "rgba(23, 103, 253, 0.2)",
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointBackgroundColor: "#3F52FF",
        borderDash: [5, 5],
        spanGaps: true,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: {
      display: true,
      text: "Рост заработной платы",
      color: "#fff",
      font: {
        size: 14,
        weight: 500,
      },
    },
    tooltip: {
      callbacks: {
        label: function (context) {
          return (
            context.dataset.label + ": " + formatCurrency(context.parsed.y)
          );
        },
      },
    },
  },
  scales: {
    x: {
      ticks: {
        color: "#bbb",
        font: { size: 10 },
      },
      grid: { color: "rgba(255,255,255,0.1)" },
    },
    y: {
      ticks: {
        color: "#bbb",
        font: { size: 10 },
        callback: function (value) {
          return formatCurrency(value);
        },
      },
      grid: { color: "rgba(255,255,255,0.1)" },
    },
  },
};

// Загружаем данные при монтировании
onMounted(async () => {
  try {
    // Загружаем данные из API
    jobs.value = await fetchJobs();
    salaries.value = await fetchSalaries();
    globalTasks.value = await fetchGlobalTasks(); // Загружаем глобальные задачи

    // Проверяем состояние окна
    const savedState = localStorage.getItem("financeWindowOpen");
    if (savedState === "true") {
      isWindowOpen.value = true;
    }
  } catch (error) {
    console.error("Ошибка загрузки данных:", error);
  }
});
</script>

<style scoped>
.salary-main {
  position: relative;
  height: 90%;
  width: 100%;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #fff3;
  background-color: #111;
  flex-direction: row;
  overflow: hidden;
}

.main-area {
  flex: 3;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-area {
  /* position: relative; */
  width: 100%;
  height: 100%;
  flex: 1;

  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 10px;
}

.chart-container {
  width: 100%;
  height: 100%;
  max-width: 700px;
  padding: 2px;
}

.tasks-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.main-task-label {
  font-weight: 500;
  font-size: 13px;
  color: #fff;
  letter-spacing: 0.01em;
  line-height: 1.2;
  margin-bottom: 15px;
}

.main-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 20px;
  align-items: flex-start;
  overflow: hidden;
  max-width: 123px;
}

.main-task {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  font-size: 13px;
  color: #fff;
  letter-spacing: 0.01em;
  line-height: 1.2;
  background-color: #1a1a1a;
  border-radius: 6px;
  padding: 6px 6px;
  width: fit-content;
  transition: all 0.2s ease;

  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-task:hover {
  background-color: #2a2a2a;
  transform: translateX(-2px);
}

.task-icon {
  font-size: 14px;
}

.task-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-tasks {
  font-size: 12px;
  color: #666;
  text-align: center;
  padding: 10px;
}

.more {
  position: absolute;
  bottom: 10px;
  right: 10px;
}

.more-button {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background-color: #1a1a1a;
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.more-button:hover {
  background-color: #1767fd;
  transform: scale(1.1);
}

.more-button:active {
  transform: scale(0.95);
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  z-index: 999;
  cursor: pointer;
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 768px) {
  .salary-main {
    flex-direction: column;
    height: auto;
  }

  .main-area {
    flex: none;
    height: 120px;
  }

  .task-area {
    flex: none;
    flex-direction: row;
    padding: 6px 10px;
    gap: 8px;
    align-items: center;
    justify-content: center;
  }

  .tasks-container {
    flex-direction: row;
    gap: 6px;
    align-items: center;
  }

  .main-task-label {
    font-size: 11px;
    margin-bottom: 0;
  }

  .main-tasks {
    flex-direction: row;
    gap: 4px;
    padding-right: 0;
    max-width: none;
    flex-wrap: wrap;
    justify-content: center;
  }

  .main-task {
    font-size: 11px;
    padding: 3px 5px;
  }

  .more {
    position: static;
  }

  .chart-container {
    max-width: 100%;
  }
}

/* Task counter */
.task-counter {
  font-size: 11px; color: rgba(255,255,255,0.5); margin-left: 6px;
}

/* Task mini progress */
.task-info-mini { flex: 1; min-width: 0; }
.progress-bar-mini {
  height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 3px;
}
.progress-fill-mini {
  height: 100%; background: #34d399; border-radius: 2px; transition: width 0.3s;
}
.progress-text-mini { font-size: 9px; color: rgba(255,255,255,0.4); }

.main-task { cursor: pointer; transition: opacity 0.2s; }
.main-task:hover { opacity: 0.8; }
.main-task-done { opacity: 0.5; text-decoration: line-through; }

.show-all-btn {
  background: none; border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.6);
  padding: 4px 10px; border-radius: 6px; font-size: 10px; cursor: pointer;
  margin-top: 4px; width: 100%; transition: all 0.2s;
}
.show-all-btn:hover { border-color: rgba(255,255,255,0.3); color: #fff; }

/* Global tasks overlay */
.gt-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 16px;
}
.gt-panel {
  background: linear-gradient(135deg, rgba(14,15,26,0.99), rgba(20,22,36,0.99));
  border: 1px solid rgba(23,103,253,0.3); border-radius: 16px;
  padding: 28px; width: 100%; max-width: 600px; max-height: 85vh; overflow-y: auto; position: relative;
}
.gt-detail-panel { max-width: 520px; }
.gt-close {
  position: absolute; top: 16px; right: 16px; background: none; border: none;
  color: #6b7fa3; font-size: 22px; cursor: pointer; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center; border-radius: 8px;
}
.gt-close:hover { background: rgba(255,255,255,0.06); color: #fff; }
.gt-title { font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 16px; }

.gt-tabs {
  display: flex; gap: 4px; background: rgba(23,103,253,0.06); border-radius: 10px;
  padding: 3px; margin-bottom: 16px;
}
.gt-tabs button {
  flex: 1; background: none; border: none; color: #6b7fa3; padding: 8px 12px;
  border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s;
}
.gt-tabs button.active { background: rgba(23,103,253,0.2); color: #fff; }

.gt-list { display: flex; flex-direction: column; gap: 10px; }
.gt-empty { color: #4a5c7a; font-size: 14px; text-align: center; padding: 40px; }

.gt-card {
  background: rgba(23,103,253,0.04); border: 1px solid rgba(23,103,253,0.1);
  border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s;
}
.gt-card:hover { border-color: rgba(23,103,253,0.25); }
.gt-card-done { opacity: 0.7; }

.gt-card-header { display: flex; align-items: center; gap: 10px; }
.gt-card-icon { font-size: 20px; }
.gt-card-title { flex: 1; font-size: 15px; font-weight: 600; color: #e1e8f0; }
.gt-card-body { font-size: 13px; color: #6b7fa3; margin-top: 8px; }
.gt-card-completed-date { font-size: 12px; color: #34d399; margin-top: 6px; }

.gt-check-btn, .gt-uncheck-btn {
  background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.3);
  color: #34d399; width: 32px; height: 32px; border-radius: 8px;
  font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.gt-check-btn:hover { background: rgba(52,211,153,0.2); }
.gt-uncheck-btn { background: rgba(96,165,250,0.1); border-color: rgba(96,165,250,0.3); color: #60a5fa; }
.gt-uncheck-btn:hover { background: rgba(96,165,250,0.2); }

.gt-card-progress { margin-top: 10px; }
.gt-progress-track {
  height: 4px; background: rgba(52,211,153,0.15); border-radius: 2px; overflow: hidden;
}
.gt-progress-fill { height: 100%; background: #34d399; border-radius: 2px; transition: width 0.3s; }
.gt-progress-text { font-size: 12px; color: #6b7fa3; margin-top: 4px; display: block; }

.gt-card-subtasks { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
.gt-subtask {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 6px; font-size: 13px; color: #c8daf0;
}
.gt-subtask.done { color: #6b7fa3; text-decoration: line-through; }
.gt-sub-check { cursor: pointer; font-size: 16px; }

/* Detail modal */
.gt-detail-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.gt-detail-icon { font-size: 32px; }
.gt-detail-meta { font-size: 12px; color: #6b7fa3; margin-top: 2px; }
.gt-detail-desc { font-size: 14px; color: #c8daf0; margin-bottom: 16px; line-height: 1.5; }
.gt-detail-progress { margin-bottom: 16px; }

.gt-detail-subtasks h4 { font-size: 14px; color: #c8daf0; margin: 0 0 10px; }
.gt-subtask-detail {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
  background: rgba(23,103,253,0.03); border-radius: 8px; margin-bottom: 4px;
}
.gt-subtask-detail.done { opacity: 0.6; }
.gt-sub-info { flex: 1; }
.gt-sub-title { font-size: 14px; color: #e1e8f0; }
.gt-sub-date { font-size: 11px; color: #34d399; display: block; margin-top: 2px; }

.gt-detail-actions { margin-top: 20px; }
.gt-complete-btn {
  background: linear-gradient(135deg, #059669, #34d399); border: none; color: #fff;
  padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600;
  cursor: pointer; width: 100%; transition: all 0.2s;
}
.gt-complete-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(52,211,153,0.3); }
.gt-uncomplete-btn {
  background: rgba(96,165,250,0.12); border: 1px solid rgba(96,165,250,0.3);
  color: #60a5fa; padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 500;
  cursor: pointer; width: 100%; transition: all 0.2s;
}
.gt-uncomplete-btn:hover { background: rgba(96,165,250,0.25); }
</style>
