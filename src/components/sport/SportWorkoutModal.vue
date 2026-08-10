<script setup>
import { ref, computed, onMounted } from "vue";
import confetti from "canvas-confetti";
import {
  fetchSportWorkout,
  fetchSportExercises,
  updateSportWorkout,
  deleteSportWorkout,
  startSportWorkout,
  finishSportWorkout,
  moveSportWorkout,
  repeatSportWorkout,
  addSportSet,
  updateSportSet,
  deleteSportSet,
  SPORT_SET_FIELDS,
  SPORT_STATUS_LABELS,
  SPORT_PR_LABELS,
  sportFormatPR,
  sportShiftDate,
} from "@/components/sportApi.js";

const props = defineProps({ workoutId: { type: String, required: true } });
const emit = defineEmits(["close", "changed"]);

const workout = ref(null);
const exercises = ref([]);
const error = ref("");
const busy = ref(false);
const addingExercise = ref("");
const gymMode = ref(false);
const lastPR = ref(null);

// Таймер отдыха: запускается от последнего отмеченного подхода.
const restLeft = ref(0);
let restTimer = null;

const fieldsOf = computed(() => (ex) => {
  const codes = ex.exercise?.fields?.length ? ex.exercise.fields : ["reps", "weight"];
  return SPORT_SET_FIELDS.filter((f) => codes.includes(f.code));
});

async function load() {
  error.value = "";
  try {
    workout.value = await fetchSportWorkout(props.workoutId);
  } catch (e) {
    error.value = e.message || "не удалось загрузить тренировку";
  }
}

async function loadExercises() {
  try {
    exercises.value = await fetchSportExercises();
  } catch (e) {
    error.value = e.message || "не удалось загрузить упражнения";
  }
}

function startRest(seconds) {
  clearInterval(restTimer);
  restLeft.value = seconds || 90;
  restTimer = setInterval(() => {
    restLeft.value -= 1;
    if (restLeft.value <= 0) clearInterval(restTimer);
  }, 1000);
}

function setPayload(set) {
  return {
    position: set.position,
    isPlanned: set.isPlanned,
    done: set.done,
    reps: set.reps,
    weight: set.weight,
    distance: set.distance,
    duration: set.duration,
    heartRate: set.heartRate,
    rpe: set.rpe,
    restSec: set.restSec,
    incline: set.incline,
    resistance: set.resistance,
    isWarmup: set.isWarmup,
    isFailure: set.isFailure,
    note: set.note,
  };
}

function numeric(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

async function saveSet(set, patch = {}) {
  const payload = { ...setPayload(set), ...patch };
  for (const f of SPORT_SET_FIELDS) payload[f.code] = numeric(payload[f.code]);
  busy.value = true;
  try {
    const result = await updateSportSet(set.id, payload);
    if (result?.isPR) {
      lastPR.value = (result.prs || []).find((p) => p.exerciseId) || null;
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
      setTimeout(() => (lastPR.value = null), 5000);
    }
    if (payload.done && !set.done) startRest(set.restSec || 90);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось сохранить подход";
  } finally {
    busy.value = false;
  }
}

async function toggleDone(set) {
  await saveSet(set, { done: !set.done });
}

// Новый подход повторяет предыдущий: в зале обычно меняется только вес.
async function addSet(ex) {
  const prev = ex.sets[ex.sets.length - 1];
  const payload = prev
    ? { ...setPayload(prev), done: false, isPlanned: false, position: ex.sets.length }
    : { position: 0, done: false };
  busy.value = true;
  try {
    await addSportSet(ex.id, payload);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось добавить подход";
  } finally {
    busy.value = false;
  }
}

async function removeSet(set) {
  busy.value = true;
  try {
    await deleteSportSet(set.id);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось удалить подход";
  } finally {
    busy.value = false;
  }
}

// Состав тренировки правим целиком: подходы пересоздаются, поэтому
// отправляем их полностью, а не только изменённое упражнение.
function compositionPayload(extra) {
  const list = workout.value.exercises.map((ex, i) => ({
    exerciseId: ex.exerciseId,
    position: i,
    superset: ex.superset,
    done: ex.done,
    note: ex.note,
    sets: ex.sets.map((s, j) => ({ ...setPayload(s), position: j })),
  }));
  if (extra) list.push(extra);
  return list;
}

async function addExercise() {
  if (!addingExercise.value) return;
  busy.value = true;
  try {
    await updateSportWorkout(props.workoutId, {
      exercises: compositionPayload({
        exerciseId: addingExercise.value,
        position: workout.value.exercises.length,
        done: false,
        sets: [{ position: 0, done: false, isPlanned: false }],
      }),
    });
    addingExercise.value = "";
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось добавить упражнение";
  } finally {
    busy.value = false;
  }
}

async function removeExercise(index) {
  busy.value = true;
  try {
    const list = compositionPayload();
    list.splice(index, 1);
    await updateSportWorkout(props.workoutId, { exercises: list.map((x, i) => ({ ...x, position: i })) });
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось убрать упражнение";
  } finally {
    busy.value = false;
  }
}

async function saveHeader() {
  busy.value = true;
  try {
    await updateSportWorkout(props.workoutId, {
      title: workout.value.title,
      note: workout.value.note,
      feeling: workout.value.feeling,
      duration: workout.value.duration,
    });
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

async function action(fn, ...args) {
  busy.value = true;
  error.value = "";
  try {
    await fn(props.workoutId, ...args);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось выполнить действие";
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!confirm("Удалить тренировку целиком?")) return;
  busy.value = true;
  try {
    await deleteSportWorkout(props.workoutId);
    emit("changed");
    emit("close");
  } catch (e) {
    error.value = e.message || "не удалось удалить";
    busy.value = false;
  }
}

async function moveTo(days) {
  await action(moveSportWorkout, sportShiftDate(workout.value.date, days));
}

async function repeatNextWeek() {
  await action(repeatSportWorkout, sportShiftDate(workout.value.date, 7));
}

onMounted(async () => {
  await Promise.all([load(), loadExercises()]);
});
</script>

<template>
  <div class="sp-modal-backdrop" @click.self="emit('close')">
    <div class="sp-modal is-wide">
      <div class="sp-modal-head">
        <input
          v-if="workout"
          v-model="workout.title"
          class="sp-input"
          style="flex: 1; max-width: 340px"
          @change="saveHeader"
        />
        <span v-if="workout" class="sp-muted">
          {{ workout.date }} · {{ SPORT_STATUS_LABELS[workout.status] }}
        </span>
        <div class="sp-spacer"></div>
        <button class="sp-btn sp-btn-sm" :class="{ 'is-primary': gymMode }" @click="gymMode = !gymMode">
          Режим зала
        </button>
        <button class="sp-btn sp-btn-sm" @click="emit('close')">✕</button>
      </div>

      <div class="sp-modal-body" :class="{ 'is-gym': gymMode }">
        <div v-if="error" class="sp-error">{{ error }}</div>
        <div v-if="lastPR" class="sp-pr">
          🏆 Новый рекорд: {{ lastPR.exercise }} —
          {{ SPORT_PR_LABELS[lastPR.kind] || lastPR.kind }}
          {{ sportFormatPR(lastPR.kind, lastPR.value) }}
        </div>
        <div v-if="restLeft > 0" class="sp-rest">
          Отдых: {{ Math.floor(restLeft / 60) }}:{{ String(restLeft % 60).padStart(2, "0") }}
          <button class="sp-btn sp-btn-sm" @click="restLeft = 0">стоп</button>
        </div>

        <div v-if="!workout" class="sp-empty">Загрузка…</div>

        <template v-else>
          <div class="sp-row">
            <button class="sp-btn sp-btn-sm" :disabled="busy" @click="action(startSportWorkout)">
              ▶ Начать
            </button>
            <button class="sp-btn sp-btn-sm" :disabled="busy" @click="action(finishSportWorkout)">
              ■ Завершить
            </button>
            <button class="sp-btn sp-btn-sm" :disabled="busy" @click="moveTo(1)">→ завтра</button>
            <button class="sp-btn sp-btn-sm" :disabled="busy" @click="moveTo(-1)">← вчера</button>
            <button class="sp-btn sp-btn-sm" :disabled="busy" @click="repeatNextWeek">
              Повторить через неделю
            </button>
            <div class="sp-spacer"></div>
            <span class="sp-muted">
              {{ workout.setsDone }}/{{ workout.setsTotal }} подходов · {{ workout.volumeKg }} кг
              <template v-if="workout.durationMin"> · {{ workout.durationMin }} мин</template>
            </span>
          </div>

          <div v-for="(ex, exIndex) in workout.exercises" :key="ex.id" class="sp-ex">
            <div class="sp-row">
              <strong>{{ ex.exercise.emoji }} {{ ex.exercise.title }}</strong>
              <span v-if="ex.done" style="color: #63c94f">✓</span>
              <div class="sp-spacer"></div>
              <span class="sp-muted">{{ ex.volumeKg }} кг</span>
              <button class="sp-btn sp-btn-sm" :disabled="busy" @click="addSet(ex)">+ подход</button>
              <button class="sp-btn sp-btn-sm is-danger" :disabled="busy" @click="removeExercise(exIndex)">
                ✕
              </button>
            </div>

            <div class="sp-scroll-x">
              <table class="sp-table">
                <thead>
                  <tr>
                    <th style="width: 34px"></th>
                    <th style="width: 26px">#</th>
                    <th v-for="f in fieldsOf(ex)" :key="f.code">
                      {{ f.label }}<span v-if="f.unit" class="sp-muted">, {{ f.unit }}</span>
                    </th>
                    <th style="width: 60px">разм.</th>
                    <th style="width: 34px"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(set, i) in ex.sets" :key="set.id" :class="{ 'is-planned': set.isPlanned && !set.done }">
                    <td>
                      <input
                        type="checkbox"
                        :checked="set.done"
                        :disabled="busy"
                        @change="toggleDone(set)"
                      />
                    </td>
                    <td class="sp-muted">{{ i + 1 }}</td>
                    <td v-for="f in fieldsOf(ex)" :key="f.code">
                      <input
                        v-model="set[f.code]"
                        class="sp-input sp-num"
                        type="number"
                        :step="f.step"
                        @change="saveSet(set)"
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        :checked="set.isWarmup"
                        @change="saveSet(set, { isWarmup: !set.isWarmup })"
                      />
                    </td>
                    <td>
                      <button class="sp-btn sp-btn-sm is-danger" :disabled="busy" @click="removeSet(set)">
                        ✕
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="sp-row">
            <select v-model="addingExercise" class="sp-select" style="max-width: 320px">
              <option value="">— добавить упражнение —</option>
              <option v-for="e in exercises" :key="e.id" :value="e.id">
                {{ e.emoji }} {{ e.title }}
              </option>
            </select>
            <button class="sp-btn" :disabled="!addingExercise || busy" @click="addExercise">
              Добавить
            </button>
          </div>

          <div class="sp-row">
            <div class="sp-field" style="width: 120px">
              <label>Длительность, мин</label>
              <input v-model.number="workout.duration" class="sp-input" type="number" @change="saveHeader" />
            </div>
            <div class="sp-field" style="width: 120px">
              <label>Самочувствие 1–5</label>
              <input
                v-model.number="workout.feeling"
                class="sp-input"
                type="number"
                min="1"
                max="5"
                @change="saveHeader"
              />
            </div>
            <div class="sp-field" style="flex: 1">
              <label>Заметка</label>
              <input v-model="workout.note" class="sp-input" @change="saveHeader" />
            </div>
          </div>
        </template>
      </div>

      <div class="sp-modal-foot">
        <button class="sp-btn is-danger" :disabled="busy" @click="remove">Удалить</button>
        <div class="sp-spacer"></div>
        <button class="sp-btn is-primary" @click="emit('close')">Готово</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp-ex {
  border: 1px solid #232631;
  border-radius: 10px;
  padding: 10px 12px;
}

.sp-num {
  width: 74px;
  min-height: 28px;
  padding: 3px 6px;
}

tr.is-planned {
  opacity: 0.62;
}

.sp-pr {
  background: #24331d;
  border: 1px solid #63c94f;
  color: #d6f5cd;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
}

.sp-rest {
  background: #1c2a38;
  border: 1px solid #4aa8ff;
  color: #cfe6ff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Режим зала: крупные цифры и большие цели для пальца. */
.is-gym :deep(.sp-num) {
  width: 92px;
  min-height: 42px;
  font-size: 17px;
}

.is-gym :deep(input[type="checkbox"]) {
  width: 22px;
  height: 22px;
}

.is-gym :deep(.sp-table td) {
  padding: 6px;
}
</style>
