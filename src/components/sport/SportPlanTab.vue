<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchSportTemplates,
  fetchSportPrograms,
  fetchSportWeekPlan,
  upsertSportWeekPlan,
  applySportTemplate,
  rolloutSportProgram,
  fetchSportWorkouts,
  fetchSportExercises,
  moveSportWorkout,
  sportWeekStart,
  sportShiftDate,
  SPORT_STATUS_COLORS,
  SPORT_STATUS_LABELS,
  SPORT_MUSCLE_TITLES,
} from "@/components/sportApi.js";
import SportTemplateModal from "@/components/sport/SportTemplateModal.vue";
import SportProgramModal from "@/components/sport/SportProgramModal.vue";
import SportWorkoutModal from "@/components/sport/SportWorkoutModal.vue";

const props = defineProps({ today: { type: String, required: true } });

const templates = ref([]);
const programs = ref([]);
const weekPlan = ref(null);
const workouts = ref([]);
const exercises = ref([]);
const error = ref("");
const busy = ref(false);
const info = ref("");

const templateModal = ref(null); // { id } | {}
const programModal = ref(null);
const workoutId = ref(null);
const applyTemplateId = ref("");
const applyDates = ref("");

const weekStart = ref(sportWeekStart(props.today));

// Календарь плана: четыре недели вперёд от текущей.
const planDays = computed(() => {
  const byDate = new Map();
  for (const w of workouts.value) {
    if (!byDate.has(w.date)) byDate.set(w.date, []);
    byDate.get(w.date).push(w);
  }
  return Array.from({ length: 28 }, (_, i) => {
    const date = sportShiftDate(weekStart.value, i);
    return { date, workouts: byDate.get(date) || [] };
  });
});

async function load() {
  error.value = "";
  try {
    templates.value = await fetchSportTemplates();
    programs.value = await fetchSportPrograms();
    weekPlan.value = await fetchSportWeekPlan(weekStart.value);
    workouts.value = await fetchSportWorkouts({
      from: weekStart.value,
      to: sportShiftDate(weekStart.value, 27),
    });
    exercises.value = await fetchSportExercises();
  } catch (e) {
    error.value = e.message || "не удалось загрузить план";
  }
}

async function saveWeekPlan() {
  busy.value = true;
  try {
    await upsertSportWeekPlan(weekStart.value, {
      workoutsTarget: weekPlan.value.workoutsTarget ? Number(weekPlan.value.workoutsTarget) : null,
      note: weekPlan.value.note || null,
      items: (weekPlan.value.items || []).map((it, i) => ({
        exerciseId: it.exerciseId || null,
        muscleGroup: it.muscleGroup || null,
        targetSets: it.targetSets ? Number(it.targetSets) : null,
        targetReps: it.targetReps ? Number(it.targetReps) : null,
        targetKg: it.targetKg ? Number(it.targetKg) : null,
        position: i,
      })),
    });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить недельный план";
  } finally {
    busy.value = false;
  }
}

function addWeekItem() {
  weekPlan.value.items = weekPlan.value.items || [];
  weekPlan.value.items.push({ muscleGroup: "chest", targetSets: 10 });
}

async function applyTemplate() {
  const dates = applyDates.value
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!applyTemplateId.value || !dates.length) return;
  busy.value = true;
  info.value = "";
  try {
    const result = await applySportTemplate(applyTemplateId.value, { dates });
    info.value = `Назначено тренировок: ${result.ids.length}`;
    applyDates.value = "";
    await load();
  } catch (e) {
    error.value = e.message || "не удалось назначить шаблон";
  } finally {
    busy.value = false;
  }
}

async function rollout(program) {
  busy.value = true;
  info.value = "";
  try {
    const result = await rolloutSportProgram(program.id, {
      from: props.today,
      to: sportShiftDate(props.today, 28),
    });
    info.value = `Создано ${result.created}, обновлено ${result.updated}, пропущено (уже выполнены) ${result.skipped}`;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось раскатать программу";
  } finally {
    busy.value = false;
  }
}

async function move(workout, days) {
  busy.value = true;
  try {
    await moveSportWorkout(workout.id, sportShiftDate(workout.date, days));
    await load();
  } catch (e) {
    error.value = e.message || "не удалось перенести";
  } finally {
    busy.value = false;
  }
}

function shiftWeek(delta) {
  weekStart.value = sportShiftDate(weekStart.value, delta * 7);
  load();
}

onMounted(load);
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px">
    <div v-if="error" class="sp-error">{{ error }}</div>
    <div v-if="info" class="sp-card" style="border-color: #63c94f">{{ info }}</div>

    <div class="sp-grid">
      <!-- Шаблоны -->
      <div class="sp-card">
        <div class="sp-row">
          <h3 style="margin: 0">Шаблоны тренировок</h3>
          <div class="sp-spacer"></div>
          <button class="sp-btn sp-btn-sm is-primary" @click="templateModal = {}">+ шаблон</button>
        </div>
        <div v-if="!templates.length" class="sp-empty">Шаблонов нет</div>
        <div v-for="t in templates" :key="t.id" class="sp-row" style="margin-top: 6px">
          <span class="sp-swatch" :style="{ background: t.color || '#6e4aff' }"></span>
          <strong>{{ t.title }}</strong>
          <span class="sp-muted">{{ t.exercises.length }} упр.</span>
          <div class="sp-spacer"></div>
          <button class="sp-btn sp-btn-sm" @click="templateModal = { id: t.id }">Изменить</button>
        </div>

        <div style="margin-top: 12px">
          <div class="sp-muted">Назначить шаблон на даты (через пробел или запятую)</div>
          <div class="sp-row" style="margin-top: 6px">
            <select v-model="applyTemplateId" class="sp-select" style="max-width: 190px">
              <option value="">— шаблон —</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.title }}</option>
            </select>
            <input
              v-model="applyDates"
              class="sp-input"
              style="flex: 1; min-width: 180px"
              placeholder="2026-08-12 2026-08-14"
            />
            <button class="sp-btn" :disabled="busy" @click="applyTemplate">Назначить</button>
          </div>
        </div>
      </div>

      <!-- Программы -->
      <div class="sp-card">
        <div class="sp-row">
          <h3 style="margin: 0">Программы</h3>
          <div class="sp-spacer"></div>
          <button class="sp-btn sp-btn-sm is-primary" @click="programModal = {}">+ программа</button>
        </div>
        <div v-if="!programs.length" class="sp-empty">Программ нет</div>
        <div v-for="p in programs" :key="p.id" class="sp-prog">
          <div class="sp-row">
            <strong>{{ p.title }}</strong>
            <span class="sp-muted">
              с {{ p.startDate }}<template v-if="p.weeks"> · {{ p.weeks }} нед.</template>
              <template v-if="!p.active"> · выключена</template>
            </span>
            <div class="sp-spacer"></div>
            <button class="sp-btn sp-btn-sm" @click="programModal = { id: p.id }">Изменить</button>
            <button class="sp-btn sp-btn-sm" :disabled="busy" @click="rollout(p)">Раскатать</button>
          </div>
          <div class="sp-muted">
            <template v-for="d in p.days" :key="d.id">
              {{ ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][d.weekday] }} — {{ d.templateTitle }}·
            </template>
            <template v-if="p.progressionType !== 'none'">
              прогрессия {{ p.progressionStep > 0 ? "+" : "" }}{{ p.progressionStep }}
              {{ p.progressionType === "weight" ? "кг" : "повт." }} раз в {{ p.progressionEvery }} нед.
            </template>
          </div>
        </div>
      </div>

      <!-- Недельный план -->
      <div class="sp-card">
        <div class="sp-row">
          <h3 style="margin: 0">Неделя {{ weekStart }}</h3>
          <div class="sp-spacer"></div>
          <button class="sp-btn sp-btn-sm" @click="shiftWeek(-1)">←</button>
          <button class="sp-btn sp-btn-sm" @click="shiftWeek(1)">→</button>
        </div>
        <div class="sp-muted" style="margin: 4px 0 8px">
          Цель по числу тренировок не привязана к дням: считается любая выполненная.
        </div>

        <div v-if="weekPlan" class="sp-row">
          <div class="sp-field" style="width: 130px">
            <label>Тренировок за неделю</label>
            <input v-model="weekPlan.workoutsTarget" class="sp-input" type="number" min="0" />
          </div>
          <div class="sp-field" style="flex: 1">
            <label>Заметка</label>
            <input v-model="weekPlan.note" class="sp-input" />
          </div>
          <div style="align-self: flex-end">
            <span class="sp-muted">факт: {{ weekPlan.workoutsDone }}</span>
          </div>
        </div>

        <div v-for="(item, i) in weekPlan?.items || []" :key="i" class="sp-row" style="margin-top: 6px">
          <select v-model="item.muscleGroup" class="sp-select" style="max-width: 140px">
            <option :value="null">— упражнение —</option>
            <option v-for="(title, code) in SPORT_MUSCLE_TITLES" :key="code" :value="code">
              {{ title }}
            </option>
          </select>
          <select
            v-if="!item.muscleGroup"
            v-model="item.exerciseId"
            class="sp-select"
            style="max-width: 180px"
          >
            <option :value="null">— выбрать —</option>
            <option v-for="e in exercises" :key="e.id" :value="e.id">{{ e.title }}</option>
          </select>
          <input v-model="item.targetSets" class="sp-input" style="width: 90px" type="number" placeholder="подходов" />
          <span class="sp-muted">факт {{ item.factSets }} · {{ Math.round(item.factKg) }} кг</span>
          <button class="sp-btn sp-btn-sm is-danger" @click="weekPlan.items.splice(i, 1)">✕</button>
        </div>

        <div class="sp-row" style="margin-top: 8px">
          <button class="sp-btn sp-btn-sm" @click="addWeekItem">+ объём</button>
          <div class="sp-spacer"></div>
          <button class="sp-btn is-primary" :disabled="busy" @click="saveWeekPlan">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Календарь плана -->
    <div class="sp-card">
      <h3>План на 4 недели</h3>
      <div class="sp-plan-grid">
        <div v-for="d in planDays" :key="d.date" class="sp-plan-cell" :class="{ 'is-today': d.date === today }">
          <div class="sp-muted">{{ d.date.slice(5) }}</div>
          <div
            v-for="w in d.workouts"
            :key="w.id"
            class="sp-plan-item"
            :style="{ borderColor: SPORT_STATUS_COLORS[w.status] }"
            :title="SPORT_STATUS_LABELS[w.status]"
          >
            <div class="sp-plan-title" @click="workoutId = w.id">{{ w.title }}</div>
            <div class="sp-row" style="gap: 2px">
              <button class="sp-btn sp-btn-sm" :disabled="busy" @click="move(w, -1)">←</button>
              <button class="sp-btn sp-btn-sm" :disabled="busy" @click="move(w, 1)">→</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SportTemplateModal
      v-if="templateModal"
      :template-id="templateModal.id || null"
      @close="templateModal = null"
      @saved="((templateModal = null), load())"
    />
    <SportProgramModal
      v-if="programModal"
      :program-id="programModal.id || null"
      @close="programModal = null"
      @saved="((programModal = null), load())"
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
.sp-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.sp-prog {
  border-top: 1px solid #232631;
  padding-top: 8px;
  margin-top: 8px;
}

.sp-prog:first-of-type {
  border-top: none;
}

.sp-plan-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

@media (max-width: 800px) {
  .sp-plan-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.sp-plan-cell {
  border: 1px solid #262a35;
  border-radius: 8px;
  padding: 6px;
  min-height: 70px;
  background: #1b1d24;
}

.sp-plan-cell.is-today {
  border-color: #ffd666;
}

.sp-plan-item {
  border-left: 3px solid #5b616e;
  padding-left: 6px;
  margin-top: 4px;
  font-size: 12px;
}

.sp-plan-title {
  cursor: pointer;
}

.sp-plan-title:hover {
  color: #b7a6ff;
}
</style>
