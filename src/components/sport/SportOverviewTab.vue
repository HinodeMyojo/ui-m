<script setup>
import { ref, computed, onMounted } from "vue";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "vue-chartjs";

import {
  fetchSportDashboard,
  fetchSportCalendar,
  fetchSportChart,
  setSportEntry,
  updateSportSet,
  SPORT_PR_LABELS,
  SPORT_STATUS_COLORS,
  SPORT_STATUS_LABELS,
  sportFormatPR,
} from "@/components/sportApi.js";
import SportGoalModal from "@/components/sport/SportGoalModal.vue";
import SportGoalSummaryModal from "@/components/sport/SportGoalSummaryModal.vue";
import SportWorkoutModal from "@/components/sport/SportWorkoutModal.vue";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler,
);

const props = defineProps({ today: { type: String, required: true } });
defineEmits(["go"]);

const data = ref(null);
const loading = ref(false);
const loadError = ref("");
const chart = ref(null);
const chartRange = ref("goal");

const goalModal = ref(null);
const summaryGoalId = ref(null);
const workoutId = ref(null);
const weightDraft = ref("");
const saving = ref(false);

const WIDGET_TITLES = {
  weight: "Вес",
  goals: "Цели",
  today: "Сегодня",
  week: "Неделя",
  streak: "Серии",
  records: "Рекорды",
};

const widgets = computed(() => (data.value?.widgets?.length ? data.value.widgets : Object.keys(WIDGET_TITLES)));

const weightMetric = computed(() =>
  (data.value?.today?.metrics || []).find((m) => m.code === "weight"),
);

const activeGoal = computed(() => (data.value?.goals || [])[0] || null);

// --- Месяц одним взглядом ---
//
// Цифры «6 тренировок за месяц» не отвечают на вопрос, который задаёшь себе
// на самом деле: я держу режим или уже вторую неделю сползаю? Ответ даёт
// только картинка всего месяца — где сделано, где пропущено, где впереди план.
// Данные берём у /calendar: он уже считает статус дня как самый сильный из
// тренировок этого дня.

const MONTH_NAMES = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июля", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const monthOffset = ref(0);
const monthDays = ref([]);
const monthLoading = ref(false);

function monthBounds(offset) {
  const base = new Date(props.today + "T12:00:00");
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { first, last, from: iso(first), to: iso(last) };
}

const monthTitle = computed(() => {
  const { first } = monthBounds(monthOffset.value);
  return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
});

async function loadMonth() {
  monthLoading.value = true;
  const { from, to } = monthBounds(monthOffset.value);
  try {
    monthDays.value = await fetchSportCalendar(from, to);
  } catch {
    monthDays.value = [];
  } finally {
    monthLoading.value = false;
  }
}

function shiftMonth(step) {
  monthOffset.value += step;
  loadMonth();
}

// Сетка с понедельника: пустые ячейки в начале, чтобы числа встали под
// своими днями недели. Иначе месяц читается как лента и теряет ритм недели.
const monthGrid = computed(() => {
  const { first } = monthBounds(monthOffset.value);
  const lead = (first.getDay() + 6) % 7;
  return [...Array(lead).fill(null), ...monthDays.value];
});

const monthStats = computed(() => {
  const s = { done: 0, partial: 0, skipped: 0, planned: 0, volume: 0 };
  for (const d of monthDays.value) {
    if (d.workoutStatus && s[d.workoutStatus] !== undefined) s[d.workoutStatus]++;
    s.volume += d.volumeKg || 0;
  }
  return s;
});

function dayNo(date) {
  return Number(date.slice(8, 10));
}

function dayTitle(d) {
  const parts = [d.date];
  if (d.workoutStatus) {
    parts.push(SPORT_STATUS_LABELS[d.workoutStatus] || d.workoutStatus);
    if (d.volumeKg) parts.push(`${d.volumeKg} кг`);
  } else {
    parts.push("тренировок нет");
  }
  if (d.weight != null) parts.push(`вес ${d.weight}`);
  if (d.photoCount) parts.push(`фото: ${d.photoCount}`);
  if (d.hasNote) parts.push("есть заметка");
  return parts.join(" · ");
}

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    data.value = await fetchSportDashboard(props.today);
    chart.value = data.value.weightChart || null;
    weightDraft.value = "";
  } catch (e) {
    loadError.value = e.message || "не удалось загрузить обзор";
  } finally {
    loading.value = false;
  }
}

// Диапазон графика: цикл активной цели либо фиксированное окно назад.
async function reloadChart(range) {
  chartRange.value = range;
  const goal = activeGoal.value;
  let from = null;
  let goalId = null;
  if (range === "goal" && goal) {
    from = goal.startDate;
    goalId = goal.id;
  } else {
    const days = range === "30" ? 29 : range === "90" ? 89 : 3650;
    const d = new Date(`${props.today}T00:00:00`);
    d.setDate(d.getDate() - days);
    from = d.toISOString().slice(0, 10);
    if (goal) goalId = goal.id;
  }
  try {
    const charts = await fetchSportChart({ from, to: props.today, goalId });
    chart.value = charts[0] || null;
  } catch (e) {
    loadError.value = e.message || "не удалось загрузить график";
  }
}

const chartData = computed(() => {
  if (!chart.value) return null;
  const points = chart.value.points || [];
  return {
    labels: points.map((p) => p.date.slice(5)),
    datasets: [
      {
        label: "Замеры",
        data: points.map((p) => p.value),
        borderColor: "#3f4657",
        backgroundColor: "#3f4657",
        borderWidth: 1,
        pointRadius: 2,
        spanGaps: false,
        tension: 0,
      },
      {
        label: `Среднее`,
        data: points.map((p) => p.smoothed),
        borderColor: "#63c94f",
        backgroundColor: "rgba(99,201,79,0.08)",
        borderWidth: 2.5,
        pointRadius: 0,
        spanGaps: true,
        fill: true,
        tension: 0.25,
      },
      {
        label: "Цель",
        data: points.map((p) => p.target),
        borderColor: "#6e4aff",
        borderDash: [6, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        spanGaps: true,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { labels: { color: "#9aa0b0", boxWidth: 12, font: { size: 11 } } },
    tooltip: { backgroundColor: "#22242d", borderColor: "#2f3340", borderWidth: 1 },
  },
  scales: {
    x: { ticks: { color: "#7a7f8e", font: { size: 10 }, maxTicksLimit: 12 }, grid: { color: "#22242d" } },
    y: { ticks: { color: "#7a7f8e", font: { size: 10 } }, grid: { color: "#22242d" } },
  },
};

const volumeData = computed(() => {
  const buckets = data.value?.volume || [];
  if (!buckets.length) return null;
  return {
    labels: buckets.map((b) => b.title),
    datasets: [
      {
        label: "Тоннаж, кг",
        data: buckets.map((b) => b.volumeKg),
        backgroundColor: "#6e4aff",
        borderRadius: 4,
      },
    ],
  };
});

const volumeOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: "#7a7f8e", font: { size: 10 } }, grid: { display: false } },
    y: { ticks: { color: "#7a7f8e", font: { size: 10 } }, grid: { color: "#22242d" } },
  },
};

async function saveWeight() {
  const metric = weightMetric.value;
  const value = parseFloat(String(weightDraft.value).replace(",", "."));
  if (!metric || Number.isNaN(value)) return;
  saving.value = true;
  loadError.value = "";
  try {
    await setSportEntry(metric.id, props.today, { value });
    await load();
  } catch (e) {
    loadError.value = e.message || "не удалось сохранить вес";
  } finally {
    saving.value = false;
  }
}

// Быстрая отметка подхода прямо с обзора — чтобы не открывать тренировку
// ради одной галочки.
async function toggleSet(set) {
  try {
    await updateSportSet(set.id, { ...set, done: !set.done });
    await load();
  } catch (e) {
    loadError.value = e.message || "не удалось отметить подход";
  }
}

function progressPercent(value) {
  return Math.round((value || 0) * 100);
}

function aheadLabel(metric) {
  if (metric.ahead === null || metric.ahead === undefined) return "";
  const v = metric.ahead;
  if (Math.abs(v) < 0.05) return "точно по плану";
  return v > 0
    ? `с опережением на ${Math.abs(v).toFixed(1)} ${metric.metric.unit}`
    : `отставание ${Math.abs(v).toFixed(1)} ${metric.metric.unit}`;
}

onMounted(() => {
  load();
  loadMonth();
});
</script>

<template>
  <div class="sp-grid">
    <div v-if="loadError" class="sp-error" style="grid-column: 1 / -1">{{ loadError }}</div>
    <div v-if="loading && !data" class="sp-empty" style="grid-column: 1 / -1">Загрузка…</div>

    <!-- Месяц активности. Стоит первым и во всю ширину: это единственное место,
         где видно режим целиком, а не отдельный день. -->
    <div class="sp-card" style="grid-column: 1 / -1">
      <div class="sp-row">
        <h3 style="margin: 0">Месяц</h3>
        <span class="sp-muted">{{ monthTitle }}</span>
        <div class="sp-spacer"></div>
        <button class="sp-btn sp-btn-sm" title="Предыдущий месяц" @click="shiftMonth(-1)">‹</button>
        <button
          class="sp-btn sp-btn-sm"
          :disabled="monthOffset === 0"
          @click="monthOffset = 0; loadMonth()"
        >
          Текущий
        </button>
        <button
          class="sp-btn sp-btn-sm"
          :disabled="monthOffset >= 0"
          title="Следующий месяц"
          @click="shiftMonth(1)"
        >
          ›
        </button>
      </div>

      <div class="spm-week">
        <span v-for="w in WEEKDAYS" :key="w">{{ w }}</span>
      </div>

      <div class="spm-grid" :class="{ 'is-loading': monthLoading }">
        <span v-for="(d, i) in monthGrid" :key="i">
          <span v-if="!d" class="spm-cell is-blank"></span>
          <span
            v-else
            class="spm-cell"
            :class="[
              d.workoutStatus ? 'st-' + d.workoutStatus : 'st-none',
              { 'is-today': d.date === today, 'is-future': d.date > today },
            ]"
            :title="dayTitle(d)"
          >
            <b>{{ dayNo(d.date) }}</b>
            <span class="spm-marks">
              <i v-if="d.weight != null" class="spm-mark w" title="есть замер веса"></i>
              <i v-if="d.photoCount" class="spm-mark p" title="есть фото"></i>
              <i v-if="d.hasNote" class="spm-mark n" title="есть заметка"></i>
            </span>
          </span>
        </span>
      </div>

      <div class="spm-legend">
        <span><i class="spm-key st-done"></i> сделал {{ monthStats.done }}</span>
        <span><i class="spm-key st-partial"></i> частично {{ monthStats.partial }}</span>
        <span><i class="spm-key st-skipped"></i> пропустил {{ monthStats.skipped }}</span>
        <span><i class="spm-key st-planned"></i> запланировано {{ monthStats.planned }}</span>
        <div class="sp-spacer"></div>
        <span class="sp-muted">тоннаж за месяц {{ Math.round(monthStats.volume) }} кг</span>
      </div>
    </div>

    <template v-for="code in widgets" :key="code">
      <!-- Вес -->
      <div v-if="code === 'weight'" class="sp-card" style="grid-column: span 2; min-width: 0">
        <div class="sp-row">
          <h3 style="margin: 0">Вес</h3>
          <div class="sp-spacer"></div>
          <button
            v-for="r in [['goal', 'цикл'], ['30', '30 дней'], ['90', '90 дней'], ['all', 'всё']]"
            :key="r[0]"
            class="sp-chip"
            :class="{ 'is-active': chartRange === r[0] }"
            @click="reloadChart(r[0])"
          >
            {{ r[1] }}
          </button>
        </div>
        <div v-if="chartData" style="height: 240px; margin-top: 10px">
          <Line :data="chartData" :options="chartOptions" />
        </div>
        <div v-else class="sp-empty">Замеров ещё нет</div>
        <div v-if="chart && chart.delta !== null" class="sp-muted" style="margin-top: 6px">
          За период: {{ chart.delta > 0 ? "+" : "" }}{{ chart.delta }} {{ chart.metric.unit }}
          · сейчас {{ chart.last }} {{ chart.metric.unit }}
        </div>
      </div>

      <!-- Цели -->
      <div v-else-if="code === 'goals'" class="sp-card">
        <div class="sp-row">
          <h3 style="margin: 0">Цели</h3>
          <div class="sp-spacer"></div>
          <button class="sp-btn sp-btn-sm is-primary" @click="goalModal = {}">+ цель</button>
        </div>

        <div v-if="!data?.goals?.length" class="sp-empty">Активных целей нет</div>

        <div v-for="goal in data?.goals || []" :key="goal.id" class="sp-goal">
          <div class="sp-row">
            <strong>{{ goal.emoji }} {{ goal.title }}</strong>
            <div class="sp-spacer"></div>
            <span class="sp-muted">осталось {{ goal.daysLeft }} дн.</span>
          </div>
          <div class="sp-bar" style="margin: 6px 0">
            <span :style="{ width: progressPercent(goal.progress) + '%' }"></span>
          </div>
          <div v-for="m in goal.metrics" :key="m.id" class="sp-goal-metric">
            <div class="sp-row" style="gap: 6px">
              <span>{{ m.metric.emoji }} {{ m.metric.title }}</span>
              <div class="sp-spacer"></div>
              <span>
                {{ m.currentValue ?? "—" }} → {{ m.targetValue }} {{ m.metric.unit }}
              </span>
            </div>
            <div class="sp-muted" :style="{ color: (m.ahead ?? 0) >= 0 ? '#63c94f' : '#ffd666' }">
              {{ aheadLabel(m) }}
            </div>
          </div>
          <div class="sp-row" style="margin-top: 8px">
            <button class="sp-btn sp-btn-sm" @click="goalModal = goal">Изменить</button>
            <button class="sp-btn sp-btn-sm" @click="summaryGoalId = goal.id">Итог</button>
          </div>
        </div>
      </div>

      <!-- Сегодня -->
      <div v-else-if="code === 'today'" class="sp-card">
        <h3>Сегодня</h3>
        <div v-if="data?.today?.needsWeight && weightMetric" class="sp-row" style="margin-bottom: 10px">
          <input
            v-model="weightDraft"
            class="sp-input"
            style="max-width: 120px"
            type="number"
            step="0.1"
            placeholder="вес натощак"
            @keyup.enter="saveWeight"
          />
          <button class="sp-btn is-primary" :disabled="saving || !weightDraft" @click="saveWeight">
            Записать
          </button>
        </div>
        <div v-else-if="weightMetric" class="sp-muted" style="margin-bottom: 10px">
          Вес сегодня записан ✓
        </div>

        <div v-if="!data?.today?.workouts?.length" class="sp-muted">Тренировок на сегодня нет</div>
        <div v-for="w in data?.today?.workouts || []" :key="w.id" class="sp-workout">
          <div class="sp-row">
            <span
              class="sp-dot"
              :style="{ background: SPORT_STATUS_COLORS[w.status] }"
              :title="SPORT_STATUS_LABELS[w.status]"
            ></span>
            <strong>{{ w.title }}</strong>
            <div class="sp-spacer"></div>
            <span class="sp-muted">{{ w.setsDone }}/{{ w.setsTotal }}</span>
            <button class="sp-btn sp-btn-sm" @click="workoutId = w.id">Открыть</button>
          </div>
          <div v-for="ex in w.exercises" :key="ex.id" class="sp-mini-ex">
            <div class="sp-muted">{{ ex.exercise.title }}</div>
            <div class="sp-row" style="gap: 4px">
              <button
                v-for="s in ex.sets"
                :key="s.id"
                class="sp-set-chip"
                :class="{ 'is-done': s.done }"
                @click="toggleSet(s)"
              >
                {{ s.reps ?? "•" }}<template v-if="s.weight">×{{ s.weight }}</template>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Неделя -->
      <div v-else-if="code === 'week'" class="sp-card">
        <h3>Неделя</h3>
        <div v-if="data?.today?.weekPlan" class="sp-row" style="gap: 16px">
          <div>
            <div class="sp-stat-label">Тренировок</div>
            <div class="sp-stat-value">
              {{ data.today.weekPlan.workoutsDone }}<span
                v-if="data.today.weekPlan.workoutsTarget"
                class="sp-muted"
                >/{{ data.today.weekPlan.workoutsTarget }}</span
              >
            </div>
          </div>
          <div>
            <div class="sp-stat-label">Тоннаж за месяц</div>
            <div class="sp-stat-value">{{ Math.round(data.volumeMonth || 0) }} кг</div>
          </div>
          <div>
            <div class="sp-stat-label">Тренировок за месяц</div>
            <div class="sp-stat-value">{{ data.workoutsMonth }}</div>
          </div>
        </div>
        <div v-for="item in data?.today?.weekPlan?.items || []" :key="item.id" style="margin-top: 8px">
          <div class="sp-row">
            <span>{{ item.exercise || item.muscleGroup }}</span>
            <div class="sp-spacer"></div>
            <span class="sp-muted">
              {{ item.factSets }}<template v-if="item.targetSets">/{{ item.targetSets }}</template> подх.
            </span>
          </div>
          <div class="sp-bar">
            <span
              :style="{
                width:
                  Math.min(100, item.targetSets ? (item.factSets / item.targetSets) * 100 : 0) + '%',
              }"
            ></span>
          </div>
        </div>
        <div v-if="volumeData" style="height: 150px; margin-top: 12px">
          <Bar :data="volumeData" :options="volumeOptions" />
        </div>
      </div>

      <!-- Серии -->
      <div v-else-if="code === 'streak'" class="sp-card">
        <h3>Серии подряд</h3>
        <div class="sp-row" style="gap: 14px">
          <div>
            <div class="sp-stat-label">Активность</div>
            <div class="sp-stat-value">{{ data?.today?.streak?.anyCurrent || 0 }}</div>
            <div class="sp-muted">лучшая {{ data?.today?.streak?.anyBest || 0 }}</div>
          </div>
          <div>
            <div class="sp-stat-label">Вес</div>
            <div class="sp-stat-value">{{ data?.today?.streak?.weightCurrent || 0 }}</div>
            <div class="sp-muted">лучшая {{ data?.today?.streak?.weightBest || 0 }}</div>
          </div>
          <div>
            <div class="sp-stat-label">Фото</div>
            <div class="sp-stat-value">{{ data?.today?.streak?.photoCurrent || 0 }}</div>
            <div class="sp-muted">лучшая {{ data?.today?.streak?.photoBest || 0 }}</div>
          </div>
          <div>
            <div class="sp-stat-label">Тренировки</div>
            <div class="sp-stat-value">{{ data?.today?.streak?.workoutCurrent || 0 }}</div>
            <div class="sp-muted">лучшая {{ data?.today?.streak?.workoutBest || 0 }}</div>
          </div>
        </div>
      </div>

      <!-- Рекорды -->
      <div v-else-if="code === 'records'" class="sp-card">
        <h3>Свежие рекорды</h3>
        <div v-if="!data?.records?.length" class="sp-empty">Пока нет</div>
        <div v-for="pr in data?.records || []" :key="pr.id" class="sp-row" style="font-size: 13px">
          <span>🏆 {{ pr.exercise }}</span>
          <div class="sp-spacer"></div>
          <span class="sp-muted">{{ SPORT_PR_LABELS[pr.kind] || pr.kind }}</span>
          <strong>{{ sportFormatPR(pr.kind, pr.value) }}</strong>
          <span class="sp-muted">{{ pr.date.slice(5) }}</span>
        </div>
      </div>
    </template>

    <SportGoalModal
      v-if="goalModal"
      :goal="goalModal.id ? goalModal : null"
      :today="today"
      @close="goalModal = null"
      @saved="((goalModal = null), load())"
    />
    <SportGoalSummaryModal
      v-if="summaryGoalId"
      :goal-id="summaryGoalId"
      :today="today"
      @close="summaryGoalId = null"
      @closed-goal="((summaryGoalId = null), load())"
    />
    <SportWorkoutModal
      v-if="workoutId"
      :workout-id="workoutId"
      @close="workoutId = null"
      @changed="load"
    />
  </div>
</template>

<style scoped>
/* --- Месяц активности --- */

.spm-week,
.spm-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}

.spm-week {
  margin-top: 12px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6b7080;
  text-align: center;
}

.spm-grid {
  margin-top: 5px;
  transition: opacity 0.15s;
}

.spm-grid.is-loading {
  opacity: 0.45;
}

.spm-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  aspect-ratio: 1;
  border-radius: 8px;
  border: 1px solid #262a35;
  background: #1b1d24;
  font-size: 12px;
  color: #8b90a0;
  cursor: default;
}

.spm-cell.is-blank {
  border: none;
  background: none;
}

.spm-cell b {
  font-weight: 600;
  line-height: 1;
}

/* Цвет заливки = что было с тренировкой. Пустой день намеренно остаётся
   пустым: «ничего не планировал» и «пропустил» — разные вещи. */
.spm-cell.st-done {
  background: rgba(99, 201, 79, 0.9);
  border-color: #63c94f;
  color: #0d1a0c;
}

.spm-cell.st-partial {
  background: rgba(255, 214, 102, 0.85);
  border-color: #ffd666;
  color: #221b05;
}

.spm-cell.st-skipped {
  background: rgba(229, 72, 77, 0.75);
  border-color: #e5484d;
  color: #2a0f10;
}

.spm-cell.st-planned {
  background: #22252e;
  border-color: #5b616e;
  border-style: dashed;
  color: #aeb3c0;
}

/* Будущее — только контур: план ещё не факт, и закрашивать его нечестно. */
.spm-cell.is-future.st-planned {
  background: transparent;
}

.spm-cell.is-today {
  box-shadow: 0 0 0 2px #ffd666;
}

.spm-marks {
  display: flex;
  gap: 2px;
  height: 4px;
}

.spm-mark {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  display: block;
}

.spm-mark.w {
  background: #6e9cff;
}

.spm-mark.p {
  background: #c38bff;
}

.spm-mark.n {
  background: #8b90a0;
}

.spm-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  font-size: 11.5px;
  color: #8b90a0;
}

.spm-key {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 3px;
  margin-right: 4px;
  vertical-align: -1px;
}

.spm-key.st-done {
  background: #63c94f;
}

.spm-key.st-partial {
  background: #ffd666;
}

.spm-key.st-skipped {
  background: #e5484d;
}

.spm-key.st-planned {
  background: transparent;
  border: 1px dashed #5b616e;
}

@media (max-width: 560px) {
  .spm-week,
  .spm-grid {
    gap: 3px;
  }

  .spm-cell {
    font-size: 11px;
    border-radius: 6px;
  }
}

.sp-goal {
  border-top: 1px solid #232631;
  padding-top: 10px;
  margin-top: 10px;
}

.sp-goal:first-of-type {
  border-top: none;
}

.sp-goal-metric {
  font-size: 12px;
  margin-top: 6px;
}

.sp-workout {
  border-top: 1px solid #232631;
  padding-top: 8px;
  margin-top: 8px;
}

.sp-mini-ex {
  margin: 6px 0 0 14px;
  font-size: 12px;
}

.sp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.sp-set-chip {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 11px;
  cursor: pointer;
}

.sp-set-chip.is-done {
  background: #234b1d;
  border-color: #63c94f;
  color: #d6f5cd;
}
</style>
