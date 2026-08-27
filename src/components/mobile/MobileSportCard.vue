<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  fetchSportTodayData,
  setSportEntry,
  updateSportSet,
  sportToday,
  SPORT_STATUS_COLORS,
} from "@/components/sportApi.js";

// Спорт на мобильной главной: подходы и вес.
//
// Это единственный модуль, которым пользуются буквально с телефона в руке,
// между подходами. Поэтому кнопки подходов здесь крупнее, чем в десктопной
// карточке рабочего стола, а всё остальное (фото, PIN, программы, история)
// живёт в /sport/today — туда ведёт заголовок.

const router = useRouter();

const date = ref(sportToday());
const data = ref(null);
const drafts = ref({});
const loading = ref(true);
const failed = ref(false);
const busy = ref(false);

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    data.value = await fetchSportTodayData(date.value);
    drafts.value = {};
    for (const e of data.value.entries) drafts.value[e.metricId] = e.value;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

const workouts = computed(() => data.value?.workouts || []);

// Показываем только те замеры, которые ещё не внесены: заполненный вес — это
// уже история, ей место в разделе, а не в ленте.
const pendingMetrics = computed(() =>
  (data.value?.metrics || []).filter(
    (m) => !(data.value?.entries || []).some((e) => e.metricId === m.id),
  ),
);

async function saveMetric(metric) {
  const raw = drafts.value[metric.id];
  if (raw === "" || raw === null || raw === undefined) return;
  busy.value = true;
  try {
    await setSportEntry(metric.id, date.value, {
      value: Number(String(raw).replace(",", ".")),
    });
    await load();
  } finally {
    busy.value = false;
  }
}

async function toggleSet(set) {
  if (busy.value) return;
  busy.value = true;
  const prev = set.done;
  set.done = !prev; // отклик сразу: между подходами ждать сеть незачем
  try {
    await updateSportSet(set.id, { ...set, done: !prev });
    await load();
  } catch {
    set.done = prev;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="m-card">
    <button class="m-card-head" @click="router.push('/sport/today')">
      <span class="m-card-title">💪 Спорт</span>
      <span v-if="data?.streak?.anyCurrent" class="m-card-note">
        {{ data.streak.anyCurrent }} дн. подряд
      </span>
      <span class="m-chev">›</span>
    </button>

    <template v-if="loading">
      <div class="m-skeleton" style="width: 55%"></div>
      <div class="m-skeleton" style="width: 70%"></div>
    </template>

    <div v-else-if="failed" class="m-err">
      Спорт не загрузился <button class="m-btn m-btn-sm" @click="load">↻</button>
    </div>

    <template v-else>
      <div v-for="m in pendingMetrics" :key="m.id" class="msp-metric">
        <span class="msp-metric-label">{{ m.emoji }} {{ m.title }}</span>
        <input
          v-model="drafts[m.id]"
          class="m-input msp-num"
          type="number"
          inputmode="decimal"
          :step="m.precision ? 0.1 : 1"
          :placeholder="m.unit"
          :disabled="busy"
          :aria-label="m.title"
        />
        <button class="m-btn m-btn-sm" :disabled="busy" @click="saveMetric(m)">OK</button>
      </div>

      <div v-if="!workouts.length" class="m-empty">Тренировок на сегодня нет</div>

      <div v-for="w in workouts" :key="w.id" class="msp-workout">
        <div class="msp-workout-head">
          <span class="msp-dot" :style="{ background: SPORT_STATUS_COLORS[w.status] }"></span>
          <span class="msp-workout-title">{{ w.title }}</span>
          <span class="m-card-note">{{ w.setsDone }}/{{ w.setsTotal }}</span>
        </div>

        <div v-for="ex in w.exercises" :key="ex.id" class="msp-ex">
          <div class="msp-ex-title">{{ ex.exercise.title }}</div>
          <div class="msp-sets">
            <button
              v-for="s in ex.sets"
              :key="s.id"
              class="msp-set"
              :class="{ 'is-done': s.done }"
              :disabled="busy"
              @click="toggleSet(s)"
            >
              {{ s.reps ?? "•" }}<template v-if="s.weight">×{{ s.weight }}</template>
            </button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.msp-metric {
  display: flex;
  align-items: center;
  gap: 8px;
}

.msp-metric-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msp-num {
  width: 90px;
  flex-shrink: 0;
  min-height: 38px;
  text-align: center;
  padding: 0 6px;
}

.msp-workout {
  border-top: 1px solid #262933;
  padding-top: 9px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.msp-workout-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.msp-workout-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.msp-ex-title {
  font-size: 12px;
  color: #7a7f8e;
  margin-bottom: 5px;
}

.msp-sets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 44px в высоту и не меньше 52px в ширину: по этим кнопкам жмут потной рукой,
   не глядя. Мельче — начинаются промахи. */
.msp-set {
  min-width: 52px;
  min-height: 44px;
  padding: 0 10px;
  border-radius: 10px;
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.msp-set.is-done {
  background: #234b1d;
  border-color: #63c94f;
  color: #d6f5cd;
}

.msp-set:disabled {
  opacity: 0.6;
}
</style>
