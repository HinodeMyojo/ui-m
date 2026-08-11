<script setup>
import { ref, computed, onMounted } from "vue";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Doughnut } from "vue-chartjs";
import {
  fetchRoadmapStats,
  formatHours,
  percent,
  typeMeta,
  roadmapToday,
} from "@/components/roadmapApi.js";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  Tooltip, Legend, Filler,
);

// Вкладка статистики — docs/roadmap-module.md, раздел 5.3.

const props = defineProps({
  roadmap: { type: Object, required: true },
});

const stats = ref(null);
const error = ref("");

const GRID = "#2a2d38";
const TEXT = "#7a7f8e";
const PALETTE = ["#1767fd", "#6e4aff", "#63c94f", "#ffd666", "#4aa8ff", "#e5484d", "#c084fc", "#5b616e"];

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: TEXT } } },
  scales: {
    x: { ticks: { color: TEXT }, grid: { color: GRID } },
    y: { ticks: { color: TEXT }, grid: { color: GRID }, beginAtZero: true },
  },
};

async function load() {
  error.value = "";
  try {
    stats.value = await fetchRoadmapStats(props.roadmap.id, roadmapToday());
  } catch (e) {
    error.value = e.message || "не удалось загрузить статистику";
  }
}

// Часы по неделям + линия цели: видно, держится ли темп 15–20 ч/нед.
const weeksData = computed(() => {
  const weeks = stats.value?.weeks || [];
  return {
    labels: weeks.map((w) => w.weekStart.slice(5)),
    datasets: [
      {
        type: "bar",
        label: "Часы за неделю",
        data: weeks.map((w) => Math.round(w.hours * 10) / 10),
        backgroundColor: "#1767fd",
        borderRadius: 4,
      },
      {
        type: "line",
        label: `Цель ${stats.value?.targetHours || 0} ч`,
        data: weeks.map(() => stats.value?.targetHours || 0),
        borderColor: "#ffd666",
        borderDash: [5, 4],
        pointRadius: 0,
        fill: false,
      },
    ],
  };
});

// Бёрндаун: остаток оценочных часов Э1, факт против идеальной прямой.
const burndownData = computed(() => {
  const points = stats.value?.burndown || [];
  return {
    labels: points.map((p) => p.date.slice(2)),
    datasets: [
      {
        label: "Идеально",
        data: points.map((p) => (p.ideal === null ? null : Math.round(p.ideal))),
        borderColor: "#5b616e",
        borderDash: [5, 4],
        pointRadius: 0,
        fill: false,
      },
      {
        label: "Факт",
        data: points.map((p) => (p.remaining === null ? null : Math.round(p.remaining))),
        borderColor: "#6e4aff",
        backgroundColor: "rgba(110, 74, 255, 0.15)",
        pointRadius: 0,
        fill: true,
        spanGaps: false,
      },
    ],
  };
});

const typesData = computed(() => {
  const types = (stats.value?.types || []).filter((t) => t.hours > 0);
  return {
    labels: types.map((t) => typeMeta(t.type).label),
    datasets: [
      {
        data: types.map((t) => Math.round(t.hours * 10) / 10),
        backgroundColor: types.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 0,
      },
    ],
  };
});

const quartersData = computed(() => {
  const quarters = stats.value?.quarters || [];
  return {
    labels: quarters.map((q) => `Q${q.number}`),
    datasets: [
      {
        label: "Сделано, %",
        data: quarters.map((q) => Math.round(q.progress * 100)),
        backgroundColor: "#63c94f",
        borderRadius: 4,
      },
      {
        label: "Прошло времени, %",
        data: quarters.map((q) => Math.round(q.timeProgress * 100)),
        backgroundColor: "#5b616e",
        borderRadius: 4,
      },
    ],
  };
});

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "right", labels: { color: TEXT } } },
};

// Тепловая карта: последние ~26 недель по дням, цвет по часам.
const heatDays = computed(() => {
  const byDate = new Map((stats.value?.heatmap || []).map((d) => [d.date, d.hours]));
  const result = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 181);
  for (let i = 0; i < 182; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    result.push({ date: iso, hours: byDate.get(iso) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
});

function heatColor(hours) {
  if (!hours) return "#2a2d38";
  if (hours < 1) return "#1c3a6e";
  if (hours < 2) return "#1750b0";
  if (hours < 4) return "#1767fd";
  return "#6e4aff";
}

const totalPlanned = computed(() =>
  (stats.value?.quarters || []).reduce((sum, q) => sum + q.hoursPlanned, 0),
);

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="rm-error">{{ error }}</div>
    <div v-if="!stats" class="rm-empty">Считаю…</div>

    <template v-else>
      <div class="rm-kpis" style="margin-bottom: 14px">
        <div class="rm-kpi">
          <span>Часов вложено</span>
          <strong>{{ formatHours(stats.totalHours) }}</strong>
        </div>
        <div class="rm-kpi">
          <span>Запланировано по кварталам</span>
          <strong>{{ formatHours(totalPlanned) }}</strong>
        </div>
        <div class="rm-kpi">
          <span>Цель в неделю</span>
          <strong>{{ formatHours(stats.targetHours) }}</strong>
        </div>
        <div class="rm-kpi">
          <span>Прогресс года (Э1)</span>
          <strong>{{ percent(roadmap.progress) }}</strong>
        </div>
      </div>

      <div class="rm-stats-grid">
        <div class="rm-card">
          <h4 style="margin: 0 0 10px; font-size: 13px">Часы по неделям</h4>
          <div class="rm-chart-box"><Bar :data="weeksData" :options="baseOptions" /></div>
        </div>

        <div class="rm-card">
          <h4 style="margin: 0 0 10px; font-size: 13px">
            Бёрндаун года — остаток оценочных часов Э1
          </h4>
          <div class="rm-chart-box"><Line :data="burndownData" :options="baseOptions" /></div>
        </div>

        <div class="rm-card">
          <h4 style="margin: 0 0 10px; font-size: 13px">Часы по типам материалов</h4>
          <div class="rm-chart-box"><Doughnut :data="typesData" :options="doughnutOptions" /></div>
        </div>

        <div class="rm-card">
          <h4 style="margin: 0 0 10px; font-size: 13px">План и факт по кварталам</h4>
          <div class="rm-chart-box"><Bar :data="quartersData" :options="baseOptions" /></div>
        </div>
      </div>

      <div class="rm-card" style="margin-top: 14px">
        <h4 style="margin: 0 0 10px; font-size: 13px">Полгода чтения по дням</h4>
        <div class="rm-heat">
          <div
            v-for="d in heatDays"
            :key="d.date"
            class="rm-heat-day"
            :style="{ background: heatColor(d.hours) }"
            :title="`${d.date} — ${formatHours(d.hours)}`"
          />
        </div>
      </div>

      <div class="rm-card" style="margin-top: 14px">
        <h4 style="margin: 0 0 10px; font-size: 13px">Материалы по типам</h4>
        <div class="rm-row">
          <span v-for="t in stats.types" :key="t.type" class="rm-chip">
            {{ typeMeta(t.type).emoji }} {{ typeMeta(t.type).label }}: {{ t.count }} шт ·
            {{ formatHours(t.hours) }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
