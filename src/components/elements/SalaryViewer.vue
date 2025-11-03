<template>
  <div class="salary-main">
    <div class="main-area">
      <div class="chart-container">
        <Line :data="chartData" :options="chartOptions" />
      </div>
    </div>
    <div class="task-area">
      <div class="tasks-container">
        <div class="main-task-label">Основные задачи</div>
        <div class="main-tasks">
          <div class="main-task" v-for="task in displayedTasks" :key="task.id">
            <div class="task-icon">{{ task.icon }}</div>
            <div class="task-title">{{ task.name }}</div>
          </div>
          <div v-if="globalTasks.length === 0" class="no-tasks">Нет задач</div>
        </div>
      </div>
      <div class="more">
        <button class="more-button" @click="openWindow">➕</button>
      </div>
    </div>

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

import { fetchJobs, fetchSalaries } from "../api";

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

// Глобальные задачи (пока хардкод, можно добавить API)
const globalTasks = ref([
  {
    id: 1,
    name: "Собеседования ОМ",
    icon: "🎯",
    progress: 65,
  },
  {
    id: 2,
    name: "SQRC сертификация",
    icon: "📜",
    progress: 40,
  },
  {
    id: 3,
    name: "Паттерны",
    icon: "📚",
    progress: 80,
  },
]);

// Показываем только первые 3 задачи
const displayedTasks = computed(() => {
  return globalTasks.value.slice(0, 3);
});

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
  width: 90%;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #fff3;
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
  position: relative;
  width: 100%;
  height: 100%;
  flex: 1;
  background-color: #111;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 10px;
}

.chart-container {
  width: 100%;
  height: 100%;
  max-width: 700px;
  background-color: #111;
  padding: 20px;
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
  /* padding: 6px 10px; */
  width: fit-content;
  transition: all 0.2s ease;
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
</style>
