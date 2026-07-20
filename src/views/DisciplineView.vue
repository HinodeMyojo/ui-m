<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line } from "vue-chartjs";
import {
  fetchDisciplineMonth,
  disciplineLogicalToday,
} from "@/components/api.js";
import DisciplineChecklist from "@/components/discipline/DisciplineChecklist.vue";
import DisciplinePlanEditor from "@/components/discipline/DisciplinePlanEditor.vue";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend, Filler);

const router = useRouter();

const today = disciplineLogicalToday();
const viewYear = ref(parseInt(today.slice(0, 4), 10));
const viewMonth = ref(parseInt(today.slice(5, 7), 10));

const month = ref(null);
const loadError = ref("");
const modalDate = ref(null);
const editorOpen = ref(false);

const MONTH_NAMES = ["", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

const STATUS_COLORS = {
  pre: "#3a3d47", future: "#2a2d38", pending: "#5b616e", fail: "#e5484d",
  rest: "#4aa8ff", min: "#ffd666", mid: "#63c94f", max: "#8b5cf6",
};
const STATUS_LABELS = {
  pre: "вне учёта", future: "впереди", pending: "в процессе", fail: "провал",
  rest: "отдых", min: "минимум", mid: "средний", max: "макс",
};
const VERDICT_LABELS = { pending: "месяц идёт", passed: "✅ месяц зачтён", failed: "❌ месяц не зачтён" };

async function load() {
  loadError.value = "";
  try {
    month.value = await fetchDisciplineMonth(viewMonth.value, viewYear.value);
  } catch (e) {
    month.value = null;
    loadError.value = e.message || "нет данных";
  }
}

function navMonth(delta) {
  let m = viewMonth.value + delta;
  let y = viewYear.value;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  viewMonth.value = m;
  viewYear.value = y;
  load();
}

onMounted(() => {
  load();
  loadHistory();
});

const summary = computed(() => month.value?.summary);
const plan = computed(() => month.value?.plan);

// --- Матрица навыки × дни ---

function isoWeekday(dateStr) {
  const d = new Date(dateStr + "T12:00:00").getDay();
  return d === 0 ? 7 : d;
}

function skillDayState(skill, day) {
  const dayNum = day.day;
  const start = skill.startDay || 1;
  const end = skill.endDay || 31;
  if (dayNum < start || dayNum > end) return "off";
  if (day.rests.some((r) => r.learningSkillId === skill.learningSkillId)) return "rest";
  if (day.maxedSkills.includes(skill.learningSkillId)) return "max";

  const wd = isoWeekday(day.date);
  const scheduled = skill.activities.filter((a) => {
    if (a.isCounter || (!a.minDesc && !a.midDesc && !a.maxDesc)) return false;
    if (!a.weekdays || !a.weekdays.trim()) return true;
    return a.weekdays.split(",").map((s) => parseInt(s.trim(), 10)).includes(wd);
  });
  if (!scheduled.length) return "off";

  const order = ["", "min", "mid", "max"];
  let minOk = true;
  let midOk = true;
  let any = false;
  for (const a of scheduled) {
    const e = day.entries.find((en) => en.activityId === a.id);
    const rank = order.indexOf(e?.level || "");
    if (rank > 0) any = true;
    if (a.minDesc && rank < 1) minOk = false;
    if (a.midDesc && rank < 2) midOk = false;
  }
  if (minOk && midOk) return "mid";
  if (minOk) return "min";
  if (any) return "part";
  return "none";
}

const SKILL_STATE_COLORS = {
  off: "transparent", rest: "#4aa8ff", max: "#8b5cf6", mid: "#63c94f",
  min: "#ffd666", part: "#7a6a33", none: "#2a2d38",
};

// --- Графики ---

const CHART_TEXT = "#9aa0b0";
const CHART_GRID = "#262933";

const chartOptionsBase = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: CHART_TEXT, boxWidth: 12, font: { size: 11 } } },
  },
  scales: {
    x: { ticks: { color: CHART_TEXT, font: { size: 11 } }, grid: { color: CHART_GRID } },
    y: { ticks: { color: CHART_TEXT, font: { size: 11 } }, grid: { color: CHART_GRID }, beginAtZero: true },
  },
};

const pastDays = computed(() =>
  (month.value?.days || []).filter((d) => !["pre", "future", "pending"].includes(d.status)),
);

// 1. Выполнение по неделям
const weeklyChart = computed(() => {
  const weeks = [];
  let current = { ok: 0, total: 0, from: null };
  for (const d of pastDays.value) {
    if (current.from === null) current.from = d.day;
    current.total++;
    if (["min", "mid", "max", "rest"].includes(d.status)) current.ok++;
    if (isoWeekday(d.date) === 7) {
      weeks.push(current);
      current = { ok: 0, total: 0, from: null };
    }
  }
  if (current.total) weeks.push(current);
  return {
    labels: weeks.map((w) => `с ${w.from}-го`),
    datasets: [{
      label: "% дней с минимумом",
      data: weeks.map((w) => (w.total ? Math.round((w.ok / w.total) * 100) : 0)),
      backgroundColor: "#6e4affcc",
      borderRadius: 6,
    }],
  };
});

// 2. Сравнение навыков — какой проседает
const skillsChart = computed(() => {
  const skills = month.value?.skills || [];
  const rows = skills.map((s) => {
    let active = 0;
    let ok = 0;
    for (const d of pastDays.value) {
      const state = skillDayState(s, d);
      if (state === "off") continue;
      active++;
      if (["min", "mid", "max", "rest"].includes(state)) ok++;
    }
    return { title: `${s.icon} ${s.title}`, pct: active ? Math.round((ok / active) * 100) : 0, color: s.color || "#6e4aff" };
  });
  return {
    labels: rows.map((r) => r.title),
    datasets: [{
      label: "% дней с минимумом навыка",
      data: rows.map((r) => r.pct),
      backgroundColor: rows.map((r) => r.color + "cc"),
      borderRadius: 6,
    }],
  };
});

// 3. Динамика по месяцам
const history = ref([]);
async function loadHistory() {
  const items = [];
  let y = parseInt(today.slice(0, 4), 10);
  let m = parseInt(today.slice(5, 7), 10);
  for (let i = 0; i < 6; i++) {
    m--;
    if (m < 1) { m = 12; y--; }
    try {
      const data = await fetchDisciplineMonth(m, y);
      items.push({
        year: y, month: m,
        verdict: data.summary.verdict,
        medDays: data.summary.medDays, maxDays: data.summary.maxDays,
        effMed: data.plan.effMedTarget, effMax: data.plan.effMaxTarget,
        failDays: data.summary.failDays,
      });
    } catch {
      break;
    }
  }
  history.value = items;
}

const monthsChart = computed(() => {
  const rows = [...history.value].reverse();
  if (month.value && summary.value) {
    rows.push({
      year: viewYear.value, month: viewMonth.value,
      medDays: summary.value.medDays, maxDays: summary.value.maxDays,
      effMed: plan.value.effMedTarget, effMax: plan.value.effMaxTarget,
    });
  }
  return {
    labels: rows.map((r) => `${MONTH_NAMES[r.month].slice(0, 3)} ${String(r.year).slice(2)}`),
    datasets: [
      {
        label: "% средних от цели",
        data: rows.map((r) => (r.effMed ? Math.round((r.medDays / r.effMed) * 100) : 0)),
        borderColor: "#63c94f",
        backgroundColor: "#63c94f33",
        fill: true,
        tension: 0.3,
      },
      {
        label: "% макс от цели",
        data: rows.map((r) => (r.effMax ? Math.round((r.maxDays / r.effMax) * 100) : 0)),
        borderColor: "#8b5cf6",
        backgroundColor: "#8b5cf633",
        fill: true,
        tension: 0.3,
      },
    ],
  };
});
</script>

<template>
  <div class="dv">
    <div class="dv-header">
      <button class="dv-btn" @click="router.push('/')">← Главная</button>
      <div class="dv-month-nav">
        <button class="dv-btn" @click="navMonth(-1)">◀</button>
        <h2>{{ MONTH_NAMES[viewMonth] }} {{ viewYear }}</h2>
        <button class="dv-btn" @click="navMonth(1)">▶</button>
      </div>
      <button class="dv-btn" @click="editorOpen = !editorOpen">⚙️ План</button>
    </div>

    <div v-if="loadError" class="dv-empty">
      {{ loadError }}
    </div>

    <template v-else-if="month">
      <!-- Сводка -->
      <div class="dv-summary">
        <div class="dv-card">
          <div class="dv-card-label">Вердикт</div>
          <div class="dv-card-value">{{ VERDICT_LABELS[summary.verdict] || summary.verdict }}</div>
        </div>
        <div class="dv-card" :class="{ 'dv-ok': summary.medDays >= plan.effMedTarget }">
          <div class="dv-card-label">Средние дни</div>
          <div class="dv-card-value">{{ summary.medDays }} / {{ plan.effMedTarget }}</div>
        </div>
        <div class="dv-card" :class="{ 'dv-ok': summary.maxDays >= plan.effMaxTarget }">
          <div class="dv-card-label">Макс дни</div>
          <div class="dv-card-value">{{ summary.maxDays }} / {{ plan.effMaxTarget }}</div>
        </div>
        <div class="dv-card" :class="{ 'dv-bad': summary.overLimitRests > 0 }">
          <div class="dv-card-label">Отдых</div>
          <div class="dv-card-value">{{ summary.restUsed }} / {{ plan.restLimit }}</div>
        </div>
        <div class="dv-card" :class="{ 'dv-bad': summary.failDays > 0 }">
          <div class="dv-card-label">Провалы</div>
          <div class="dv-card-value">{{ summary.failDays }}</div>
        </div>
        <div class="dv-card">
          <div class="dv-card-label">Стрик 🔥</div>
          <div class="dv-card-value">{{ summary.globalStreak }}</div>
        </div>
      </div>

      <!-- Редактор плана -->
      <div v-if="editorOpen" class="dv-editor">
        <DisciplinePlanEditor :month="month" @changed="load" />
      </div>

      <!-- Матрица -->
      <div class="dv-section-title">Навыки × дни</div>
      <div class="dv-matrix-wrap">
        <table class="dv-matrix">
          <thead>
            <tr>
              <th class="dv-matrix-skill"></th>
              <th v-for="d in month.days" :key="d.day" class="dv-matrix-day"
                :class="{ 'dv-matrix-today': d.date === today }">
                {{ d.day }}
              </th>
            </tr>
            <tr>
              <th class="dv-matrix-skill dv-matrix-status-label">День</th>
              <td v-for="d in month.days" :key="d.day" class="dv-matrix-cell" :title="STATUS_LABELS[d.status]"
                :style="{ background: STATUS_COLORS[d.status] }" @click="d.status !== 'pre' && (modalDate = d.date)">
              </td>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in month.skills" :key="s.planSkillId">
              <th class="dv-matrix-skill" :style="{ color: s.color || '#8ab4ff' }">
                {{ s.icon }} {{ s.title }}
                <span v-if="s.streak > 1" class="dv-mini-streak">🔥{{ s.streak }}</span>
              </th>
              <td v-for="d in month.days" :key="d.day" class="dv-matrix-cell"
                :style="{ background: SKILL_STATE_COLORS[skillDayState(s, d)] }"
                @click="d.status !== 'pre' && (modalDate = d.date)"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="dv-legend">
        <span v-for="(color, key) in STATUS_COLORS" :key="key" class="dv-legend-item">
          <i :style="{ background: color }"></i>{{ STATUS_LABELS[key] }}
        </span>
      </div>

      <!-- Графики -->
      <div class="dv-charts">
        <div class="dv-chart-card">
          <div class="dv-section-title">Минимум по неделям</div>
          <div class="dv-chart">
            <Bar v-if="weeklyChart.labels.length" :data="weeklyChart"
              :options="{ ...chartOptionsBase, scales: { ...chartOptionsBase.scales, y: { ...chartOptionsBase.scales.y, max: 100 } } }" />
            <div v-else class="dv-empty-small">пока нет прошедших дней</div>
          </div>
        </div>
        <div class="dv-chart-card">
          <div class="dv-section-title">Сравнение навыков</div>
          <div class="dv-chart">
            <Bar v-if="skillsChart.labels.length" :data="skillsChart"
              :options="{ ...chartOptionsBase, indexAxis: 'y', scales: { ...chartOptionsBase.scales, x: { ...chartOptionsBase.scales.x, max: 100 } } }" />
          </div>
        </div>
        <div class="dv-chart-card">
          <div class="dv-section-title">Динамика по месяцам</div>
          <div class="dv-chart">
            <Line :data="monthsChart" :options="chartOptionsBase" />
          </div>
        </div>
      </div>

      <!-- История -->
      <div class="dv-section-title" v-if="history.length">История месяцев</div>
      <div class="dv-history" v-if="history.length">
        <div v-for="h in history" :key="h.year + '-' + h.month" class="dv-history-row">
          <span>{{ MONTH_NAMES[h.month] }} {{ h.year }}</span>
          <span>сред {{ h.medDays }}/{{ h.effMed }} · макс {{ h.maxDays }}/{{ h.effMax }} · провалов {{ h.failDays }}</span>
          <b>{{ VERDICT_LABELS[h.verdict] || h.verdict }}</b>
        </div>
      </div>
    </template>

    <!-- Модалка дня -->
    <div v-if="modalDate && month" class="dv-overlay" @click.self="modalDate = null">
      <div class="dv-modal">
        <div class="dv-modal-head">
          <b>{{ parseInt(modalDate.slice(8)) }} {{ MONTH_NAMES[viewMonth].toLowerCase() }}</b>
          <button class="dv-btn" @click="modalDate = null">✕</button>
        </div>
        <div class="dv-modal-body">
          <DisciplineChecklist :month="month" :date="modalDate" @changed="load" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dv {
  min-height: 100vh;
  background: #18191f;
  color: #e8eaf2;
  padding: 16px clamp(10px, 3vw, 40px) 60px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.dv-month-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dv-month-nav h2 {
  margin: 0;
  font-size: 20px;
  min-width: 190px;
  text-align: center;
}

.dv-btn {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  min-height: 34px;
}

.dv-btn:hover {
  border-color: #6e4aff;
}

.dv-empty {
  color: #7a7f8e;
  padding: 40px;
  text-align: center;
}

.dv-empty-small {
  color: #7a7f8e;
  font-size: 12px;
}

.dv-summary {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.dv-card {
  background: #1e2027;
  border: 1px solid #2a2d38;
  border-radius: 10px;
  padding: 10px 16px;
  min-width: 110px;
}

.dv-ok {
  border-color: #63c94f;
}

.dv-bad {
  border-color: #e5484d;
}

.dv-card-label {
  font-size: 11px;
  color: #7a7f8e;
}

.dv-card-value {
  font-size: 17px;
  font-weight: 700;
  margin-top: 2px;
}

.dv-section-title {
  font-size: 13px;
  font-weight: 700;
  color: #9aa0b0;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-top: 6px;
}

.dv-editor {
  border: 1px solid #262933;
  border-radius: 12px;
  padding: 14px;
  background: #191b21;
}

.dv-matrix-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: #6e4aff #111;
}

.dv-matrix {
  border-collapse: separate;
  border-spacing: 3px;
}

.dv-matrix-skill {
  text-align: left;
  font-size: 12px;
  white-space: nowrap;
  padding-right: 8px;
  position: sticky;
  left: 0;
  background: #18191f;
  z-index: 1;
}

.dv-matrix-day {
  font-size: 10px;
  color: #7a7f8e;
  font-weight: 400;
  min-width: 20px;
}

.dv-matrix-today {
  color: #fff;
  font-weight: 700;
}

.dv-matrix-status-label {
  color: #7a7f8e;
  font-weight: 400;
}

.dv-matrix-cell {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
}

.dv-matrix-cell:hover {
  outline: 1px solid #fff;
}

.dv-mini-streak {
  font-size: 10px;
  color: #ffab5e;
}

.dv-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11px;
  color: #9aa0b0;
}

.dv-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dv-legend-item i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.dv-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
}

.dv-chart-card {
  background: #1e2027;
  border: 1px solid #2a2d38;
  border-radius: 12px;
  padding: 12px 14px;
}

.dv-chart {
  height: 220px;
  margin-top: 8px;
}

.dv-history {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dv-history-row {
  display: flex;
  gap: 14px;
  background: #1e2027;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  align-items: center;
  flex-wrap: wrap;
}

.dv-history-row span:first-child {
  min-width: 130px;
  font-weight: 600;
}

.dv-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dv-modal {
  background: #191b21;
  border: 1px solid #2a2d38;
  border-radius: 14px;
  width: min(460px, 94vw);
  max-height: 88dvh;
  display: flex;
  flex-direction: column;
}

.dv-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #262933;
}

.dv-modal-body {
  padding: 14px;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .dv-month-nav h2 {
    font-size: 16px;
    min-width: 130px;
  }

  .dv-card {
    min-width: calc(33% - 8px);
    padding: 8px 10px;
  }

  .dv-modal {
    width: 100vw;
    max-height: 92dvh;
    border-radius: 18px 18px 0 0;
    align-self: flex-end;
  }

  .dv-overlay {
    align-items: flex-end;
  }
}
</style>
