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

onMounted(load);
</script>

<template>
  <div class="sp-grid">
    <div v-if="loadError" class="sp-error" style="grid-column: 1 / -1">{{ loadError }}</div>
    <div v-if="loading && !data" class="sp-empty" style="grid-column: 1 / -1">Загрузка…</div>

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
