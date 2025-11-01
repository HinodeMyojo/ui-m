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
          <div class="main-task" v-for="value in taskData" :key="value.id">
            <div class="task-icon">📚</div>
            <div class="task-title">{{ value.summary }}</div>
          </div>
        </div>
      </div>
      <div class="more">
        <button class="more-button" @click="isWindowOpen = true">➕</button>
      </div>
    </div>

    <!-- Затемнение фона -->
    <div
      v-if="isWindowOpen"
      class="overlay"
      @click="isWindowOpen = false"
    ></div>
  </div>
  <!-- Окно -->
  <SalaryWindow v-if="isWindowOpen" @close="isWindowOpen = false" />
</template>

<script setup>
import { ref } from "vue";
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

const taskData = ref([
  {
    id: 1,
    summary: "Собесы ОМ",
  },
  {
    id: 2,
    summary: "SQRC",
  },
  {
    id: 3,
    summary: "Паттерны",
  },
]);

const chartData = ref({
  labels: ["Февраль 2025", "Июль 2025", "Ноябрь 2025", "Февраль 2026"],
  datasets: [
    {
      label: "Зарплата (₽)",
      data: [55000, 240000, 180000],
      borderColor: "#ff66cc",
      backgroundColor: "rgba(255,102,204,0.2)",
      tension: 0.4,
      fill: true,
      pointRadius: 5,
      pointBackgroundColor: "#ff99dd",
    },
    {
      label: "Планы (₽)",
      data: [55000, 240000, 180000, 350000],
      borderColor: "#1767FD",
      backgroundColor: "rgba(143 102 255 / 0.2)",
      tension: 0.4,
      fill: true,
      pointRadius: 5,
      pointBackgroundColor: "#3F52FF",
    },
  ],
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
    },
  },
  scales: {
    x: {
      ticks: { color: "#bbb" },
      grid: { color: "rgba(255,255,255,0.1)" },
    },
    y: {
      ticks: { color: "#bbb" },
      grid: { color: "rgba(255,255,255,0.1)" },
    },
  },
};
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
  width: fit-content;
}

.task-icon {
  font-size: 14px;
}

.task-title {
  white-space: nowrap;
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
  background-color: #2a2a2a;
  transform: scale(1.05);
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
