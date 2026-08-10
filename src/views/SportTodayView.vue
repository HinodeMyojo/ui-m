<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/sport.css";
import {
  fetchSportTodayData,
  setSportEntry,
  updateSportSet,
  uploadSportPhotos,
  quickSportWorkout,
  fetchSportExercises,
  unlockSportPin,
  finishSportWorkout,
  setSportDayNote,
  sportToday,
  sportShiftDate,
  SPORT_STATUS_COLORS,
} from "@/components/sportApi.js";

// Экран дня для телефона: только ввод. Это отдельная раскладка, а не
// адаптив десктопного раздела — в зале и в ванной нужны крупные цели,
// а не сжатые колонки.

const router = useRouter();

const date = ref(sportToday());
const data = ref(null);
const exercises = ref([]);
const drafts = ref({});
const error = ref("");
const busy = ref(false);
const uploading = ref(false);
const pinInput = ref("");
const quickExercise = ref("");
const note = ref("");

async function load() {
  error.value = "";
  try {
    data.value = await fetchSportTodayData(date.value);
    note.value = data.value.note || "";
    drafts.value = {};
    for (const e of data.value.entries) drafts.value[e.metricId] = e.value;
  } catch (e) {
    error.value = e.message || "не удалось загрузить день";
  }
}

async function saveMetric(metric) {
  const raw = drafts.value[metric.id];
  if (raw === "" || raw === null || raw === undefined) return;
  busy.value = true;
  error.value = "";
  try {
    await setSportEntry(metric.id, date.value, { value: Number(String(raw).replace(",", ".")) });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

function entered(metricId) {
  return (data.value?.entries || []).some((e) => e.metricId === metricId);
}

async function toggleSet(set) {
  busy.value = true;
  try {
    await updateSportSet(set.id, { ...set, done: !set.done });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось отметить";
  } finally {
    busy.value = false;
  }
}

async function finish(workout) {
  busy.value = true;
  try {
    await finishSportWorkout(workout.id);
    await load();
  } catch (e) {
    error.value = e.message || "не удалось завершить";
  } finally {
    busy.value = false;
  }
}

async function onFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  uploading.value = true;
  error.value = "";
  try {
    await uploadSportPhotos(files, { date: date.value });
    await load();
  } catch (e) {
    error.value = e.locked ? "введите PIN, чтобы добавлять фото" : e.message;
  } finally {
    uploading.value = false;
    event.target.value = "";
  }
}

async function unlock() {
  try {
    await unlockSportPin(pinInput.value);
    pinInput.value = "";
    await load();
  } catch (e) {
    error.value = e.message || "неверный PIN";
  }
}

async function addQuick() {
  if (!quickExercise.value) return;
  busy.value = true;
  try {
    await quickSportWorkout({ date: date.value, exerciseId: quickExercise.value });
    quickExercise.value = "";
    await load();
  } catch (e) {
    error.value = e.message || "не удалось отметить";
  } finally {
    busy.value = false;
  }
}

async function saveNote() {
  try {
    await setSportDayNote(date.value, note.value);
  } catch (e) {
    error.value = e.message || "не удалось сохранить заметку";
  }
}

function shift(days) {
  date.value = sportShiftDate(date.value, days);
  load();
}

onMounted(async () => {
  exercises.value = await fetchSportExercises().catch(() => []);
  await load();
});
</script>

<template>
  <div class="sp spm">
    <div class="spm-top">
      <button class="sp-btn" @click="router.push('/sport')">←</button>
      <button class="sp-btn" @click="shift(-1)">◀</button>
      <strong>{{ date }}</strong>
      <button class="sp-btn" :disabled="date >= sportToday()" @click="shift(1)">▶</button>
    </div>

    <div v-if="error" class="sp-error">{{ error }}</div>

    <div v-if="data?.photosLocked && !data?.photos?.length" class="sp-card spm-block">
      <div class="sp-row">
        <input v-model="pinInput" class="sp-input" type="password" placeholder="PIN для фото" />
        <button class="sp-btn is-primary" @click="unlock">🔓</button>
      </div>
    </div>

    <div class="sp-card spm-block">
      <label class="spm-photo-btn">
        <span>{{ uploading ? "Загрузка…" : "📷 Фото дня" }}</span>
        <small>{{ data?.photoCount || 0 }} кадров</small>
        <input type="file" accept="image/*" capture="environment" multiple hidden @change="onFiles" />
      </label>
      <div v-if="data?.photos?.length" class="spm-photos">
        <img v-for="p in data.photos" :key="p.id" :src="`data:image/jpeg;base64,${p.thumbnail}`" />
      </div>
    </div>

    <div class="sp-card spm-block">
      <h3>Замеры</h3>
      <div v-for="m in data?.metrics || []" :key="m.id" class="spm-metric">
        <div class="spm-metric-label">
          {{ m.emoji }} {{ m.title }}
          <span v-if="entered(m.id)" style="color: #63c94f">✓</span>
        </div>
        <div class="sp-row">
          <input
            v-model="drafts[m.id]"
            class="sp-input spm-num"
            type="number"
            inputmode="decimal"
            :step="m.precision ? 0.1 : 1"
            :placeholder="m.unit"
          />
          <button class="sp-btn is-primary spm-save" :disabled="busy" @click="saveMetric(m)">
            OK
          </button>
        </div>
      </div>
      <div v-if="!data?.metrics?.length" class="sp-muted">
        Ни одна метрика не закреплена. Закрепите нужные в настройках раздела.
      </div>
    </div>

    <div class="sp-card spm-block">
      <h3>Тренировка</h3>
      <div v-if="!data?.workouts?.length" class="sp-muted">На сегодня ничего не запланировано</div>

      <div v-for="w in data?.workouts || []" :key="w.id" class="spm-workout">
        <div class="sp-row">
          <span class="spm-dot" :style="{ background: SPORT_STATUS_COLORS[w.status] }"></span>
          <strong>{{ w.title }}</strong>
          <div class="sp-spacer"></div>
          <span class="sp-muted">{{ w.setsDone }}/{{ w.setsTotal }}</span>
        </div>
        <div v-for="ex in w.exercises" :key="ex.id" class="spm-ex">
          <div>{{ ex.exercise.emoji }} {{ ex.exercise.title }}</div>
          <div class="spm-sets">
            <button
              v-for="s in ex.sets"
              :key="s.id"
              class="spm-set"
              :class="{ 'is-done': s.done }"
              :disabled="busy"
              @click="toggleSet(s)"
            >
              <span>{{ s.reps ?? "✓" }}</span>
              <small v-if="s.weight">{{ s.weight }}</small>
            </button>
          </div>
        </div>
        <button class="sp-btn spm-finish" :disabled="busy" @click="finish(w)">Завершить</button>
      </div>

      <div class="sp-row" style="margin-top: 10px">
        <select v-model="quickExercise" class="sp-select">
          <option value="">— отметить упражнение —</option>
          <option v-for="e in exercises" :key="e.id" :value="e.id">{{ e.emoji }} {{ e.title }}</option>
        </select>
        <button class="sp-btn is-primary spm-save" :disabled="!quickExercise || busy" @click="addQuick">
          +
        </button>
      </div>
    </div>

    <div class="sp-card spm-block">
      <h3>Заметка</h3>
      <textarea v-model="note" class="sp-textarea" @change="saveNote" />
    </div>

    <div v-if="data?.streak" class="sp-card spm-block">
      <div class="sp-row" style="justify-content: space-around; text-align: center">
        <div>
          <div class="sp-stat-value">{{ data.streak.anyCurrent }}</div>
          <div class="sp-stat-label">дней подряд</div>
        </div>
        <div>
          <div class="sp-stat-value">{{ data.streak.weightCurrent }}</div>
          <div class="sp-stat-label">с весом</div>
        </div>
        <div>
          <div class="sp-stat-value">{{ data.streak.workoutCurrent }}</div>
          <div class="sp-stat-label">с тренировкой</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spm {
  max-width: 560px;
  margin: 0 auto;
  padding: 10px 10px 60px;
  gap: 10px;
}

.spm-top {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}

.spm-top .sp-btn {
  min-height: 42px;
  min-width: 48px;
  font-size: 16px;
}

.spm-block {
  padding: 12px;
}

.spm-photo-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: 1px dashed #3a3f4e;
  border-radius: 12px;
  padding: 18px;
  font-size: 17px;
  cursor: pointer;
}

.spm-photos {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-top: 8px;
}

.spm-photos img {
  height: 92px;
  border-radius: 8px;
}

.spm-metric {
  margin-bottom: 10px;
}

.spm-metric-label {
  font-size: 13px;
  margin-bottom: 4px;
}

.spm-num {
  min-height: 48px;
  font-size: 20px;
  flex: 1;
}

.spm-save {
  min-height: 48px;
  min-width: 62px;
  font-size: 16px;
}

.spm-workout {
  border-top: 1px solid #232631;
  padding-top: 8px;
  margin-top: 8px;
}

.spm-ex {
  margin-top: 8px;
  font-size: 14px;
}

.spm-sets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.spm-set {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 10px;
  min-width: 56px;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  cursor: pointer;
}

.spm-set small {
  font-size: 11px;
  color: #7a7f8e;
}

.spm-set.is-done {
  background: #234b1d;
  border-color: #63c94f;
  color: #d6f5cd;
}

.spm-finish {
  width: 100%;
  min-height: 44px;
  margin-top: 10px;
}

.spm-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
</style>
