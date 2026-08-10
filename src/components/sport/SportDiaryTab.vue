<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
  fetchSportCalendar,
  fetchSportDay,
  fetchSportMetrics,
  setSportEntry,
  deleteSportEntry,
  setSportDayNote,
  createSportWorkout,
  quickSportWorkout,
  fetchSportExercises,
  uploadSportPhotos,
  sportShiftDate,
  SPORT_STATUS_COLORS,
  SPORT_STATUS_LABELS,
} from "@/components/sportApi.js";
import SportWorkoutModal from "@/components/sport/SportWorkoutModal.vue";

const props = defineProps({
  today: { type: String, required: true },
  settings: { type: Object, default: null },
});

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const year = ref(Number(props.today.slice(0, 4)));
const month = ref(Number(props.today.slice(5, 7)));
const days = ref([]);
const selected = ref(props.today);
const day = ref(null);
const metrics = ref([]);
const exercises = ref([]);
const workoutId = ref(null);
const error = ref("");
const busy = ref(false);
const quickExercise = ref("");
const noteDraft = ref("");
const uploading = ref(false);

const monthLabel = computed(() => `${MONTHS[month.value - 1]} ${year.value}`);

function pad(n) {
  return String(n).padStart(2, "0");
}

// Сетка месяца с добивкой пустыми клетками до понедельника.
const grid = computed(() => {
  const first = new Date(year.value, month.value - 1, 1);
  const shift = (first.getDay() === 0 ? 7 : first.getDay()) - 1;
  const cells = Array.from({ length: shift }, () => null);
  const byDate = new Map(days.value.map((d) => [d.date, d]));
  const total = new Date(year.value, month.value, 0).getDate();
  for (let i = 1; i <= total; i++) {
    const key = `${year.value}-${pad(month.value)}-${pad(i)}`;
    cells.push(byDate.get(key) || { date: key, photoCount: 0, metricCount: 0, workoutStatus: "" });
  }
  return cells;
});

async function loadMonth() {
  error.value = "";
  const from = `${year.value}-${pad(month.value)}-01`;
  const total = new Date(year.value, month.value, 0).getDate();
  try {
    days.value = await fetchSportCalendar(from, `${year.value}-${pad(month.value)}-${pad(total)}`);
  } catch (e) {
    error.value = e.message || "не удалось загрузить календарь";
  }
}

async function loadDay() {
  error.value = "";
  try {
    day.value = await fetchSportDay(selected.value);
    noteDraft.value = day.value.note || "";
  } catch (e) {
    error.value = e.message || "не удалось загрузить день";
  }
}

function shiftMonth(delta) {
  let m = month.value + delta;
  let y = year.value;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  if (m > 12) {
    m = 1;
    y += 1;
  }
  month.value = m;
  year.value = y;
}

function entryOf(metricId) {
  return (day.value?.metrics || []).find((e) => e.metricId === metricId);
}

async function saveMetric(metric, raw) {
  const text = String(raw ?? "").trim();
  busy.value = true;
  error.value = "";
  try {
    if (text === "") await deleteSportEntry(metric.id, selected.value);
    else await setSportEntry(metric.id, selected.value, { value: Number(text.replace(",", ".")) });
    await Promise.all([loadDay(), loadMonth()]);
  } catch (e) {
    error.value = e.message || "не удалось сохранить замер";
  } finally {
    busy.value = false;
  }
}

async function saveNote() {
  try {
    await setSportDayNote(selected.value, noteDraft.value);
    await loadMonth();
  } catch (e) {
    error.value = e.message || "не удалось сохранить заметку";
  }
}

async function addWorkout() {
  busy.value = true;
  try {
    const created = await createSportWorkout({ date: selected.value, title: "Тренировка", status: "planned" });
    await Promise.all([loadDay(), loadMonth()]);
    workoutId.value = created.id;
  } catch (e) {
    error.value = e.message || "не удалось создать тренировку";
  } finally {
    busy.value = false;
  }
}

async function addQuick() {
  if (!quickExercise.value) return;
  busy.value = true;
  try {
    await quickSportWorkout({ date: selected.value, exerciseId: quickExercise.value });
    quickExercise.value = "";
    await Promise.all([loadDay(), loadMonth()]);
  } catch (e) {
    error.value = e.message || "не удалось отметить";
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
    await uploadSportPhotos(files, { date: selected.value });
    await Promise.all([loadDay(), loadMonth()]);
  } catch (e) {
    error.value = e.locked ? "раздел фото закрыт PIN-кодом — разблокируйте на вкладке «Фото»" : e.message;
  } finally {
    uploading.value = false;
    event.target.value = "";
  }
}

watch(selected, loadDay);
watch([year, month], loadMonth);

onMounted(async () => {
  metrics.value = await fetchSportMetrics().catch(() => []);
  exercises.value = await fetchSportExercises().catch(() => []);
  await Promise.all([loadMonth(), loadDay()]);
});
</script>

<template>
  <div class="sp-diary">
    <div class="sp-card">
      <div class="sp-row">
        <button class="sp-btn sp-btn-sm" @click="shiftMonth(-1)">←</button>
        <strong style="min-width: 150px; text-align: center">{{ monthLabel }}</strong>
        <button class="sp-btn sp-btn-sm" @click="shiftMonth(1)">→</button>
        <div class="sp-spacer"></div>
        <button class="sp-btn sp-btn-sm" @click="selected = today">Сегодня</button>
      </div>

      <div v-if="error" class="sp-error" style="margin-top: 8px">{{ error }}</div>

      <div class="sp-cal">
        <div v-for="w in WEEKDAYS" :key="w" class="sp-cal-wd">{{ w }}</div>
        <div
          v-for="(cell, i) in grid"
          :key="i"
          class="sp-cal-cell"
          :class="{
            'is-empty': !cell,
            'is-selected': cell && cell.date === selected,
            'is-today': cell && cell.date === today,
          }"
          @click="cell && (selected = cell.date)"
        >
          <template v-if="cell">
            <div class="sp-cal-num">{{ Number(cell.date.slice(8)) }}</div>
            <div class="sp-cal-marks">
              <span v-if="cell.photoCount" class="sp-mark" style="background: #8b5cf6" title="фото"></span>
              <span v-if="cell.weight !== null && cell.weight !== undefined" class="sp-mark" style="background: #63c94f" title="вес"></span>
              <span
                v-if="cell.workoutStatus"
                class="sp-mark"
                :style="{ background: SPORT_STATUS_COLORS[cell.workoutStatus] }"
                :title="SPORT_STATUS_LABELS[cell.workoutStatus]"
              ></span>
              <span v-if="cell.hasNote" class="sp-mark" style="background: #7a7f8e" title="заметка"></span>
            </div>
            <div v-if="cell.weight" class="sp-cal-weight">{{ cell.weight }}</div>
          </template>
        </div>
      </div>
    </div>

    <div class="sp-card">
      <div class="sp-row" style="margin-bottom: 10px">
        <button class="sp-btn sp-btn-sm" @click="selected = sportShiftDate(selected, -1)">← день</button>
        <h3 style="margin: 0">{{ selected }}</h3>
        <button class="sp-btn sp-btn-sm" @click="selected = sportShiftDate(selected, 1)">день →</button>
      </div>

      <h4 class="sp-h4">Замеры</h4>
      <div class="sp-metrics">
        <div v-for="m in metrics" :key="m.id" class="sp-field">
          <label>{{ m.emoji }} {{ m.title }}<span v-if="m.unit">, {{ m.unit }}</span></label>
          <input
            class="sp-input"
            type="number"
            :step="m.precision ? 0.1 : 1"
            :value="entryOf(m.id)?.value ?? ''"
            :disabled="busy"
            @change="saveMetric(m, $event.target.value)"
          />
        </div>
      </div>

      <h4 class="sp-h4">Фото</h4>
      <div class="sp-row">
        <label class="sp-btn">
          {{ uploading ? "Загрузка…" : "📷 Добавить фото" }}
          <input type="file" accept="image/*" multiple hidden @change="onFiles" />
        </label>
        <span class="sp-muted">{{ day?.photos?.length || 0 }} кадров</span>
      </div>
      <div class="sp-photos">
        <img
          v-for="p in day?.photos || []"
          :key="p.id"
          :src="`data:image/jpeg;base64,${p.thumbnail}`"
          :title="p.slotTitle || ''"
          class="sp-photo"
        />
      </div>

      <h4 class="sp-h4">Тренировки</h4>
      <div v-if="!day?.workouts?.length" class="sp-muted">Ничего не запланировано</div>
      <div v-for="w in day?.workouts || []" :key="w.id" class="sp-row" style="margin-bottom: 6px">
        <span class="sp-mark" :style="{ background: SPORT_STATUS_COLORS[w.status] }"></span>
        <strong>{{ w.title }}</strong>
        <span class="sp-muted">{{ w.setsDone }}/{{ w.setsTotal }} · {{ w.volumeKg }} кг</span>
        <div class="sp-spacer"></div>
        <button class="sp-btn sp-btn-sm" @click="workoutId = w.id">Открыть</button>
      </div>

      <div class="sp-row" style="margin-top: 8px">
        <button class="sp-btn sp-btn-sm" :disabled="busy" @click="addWorkout">+ тренировка</button>
      </div>
      <div class="sp-row" style="margin-top: 6px">
        <select v-model="quickExercise" class="sp-select" style="max-width: 230px">
          <option value="">— отметить упражнение —</option>
          <option v-for="e in exercises" :key="e.id" :value="e.id">{{ e.emoji }} {{ e.title }}</option>
        </select>
        <button class="sp-btn sp-btn-sm" :disabled="!quickExercise || busy" @click="addQuick">
          Сделал
        </button>
      </div>

      <h4 class="sp-h4">Заметка</h4>
      <textarea v-model="noteDraft" class="sp-textarea" @change="saveNote" />
    </div>

    <SportWorkoutModal
      v-if="workoutId"
      :workout-id="workoutId"
      @close="workoutId = null"
      @changed="((loadDay()), loadMonth())"
    />
  </div>
</template>

<style scoped>
.sp-diary {
  display: grid;
  grid-template-columns: minmax(320px, 1.1fr) minmax(300px, 1fr);
  gap: 12px;
  align-items: start;
}

@media (max-width: 900px) {
  .sp-diary {
    grid-template-columns: 1fr;
  }
}

.sp-cal {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-top: 10px;
}

.sp-cal-wd {
  font-size: 11px;
  color: #7a7f8e;
  text-align: center;
  padding-bottom: 2px;
}

.sp-cal-cell {
  aspect-ratio: 1;
  border: 1px solid #262a35;
  border-radius: 8px;
  padding: 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #1b1d24;
}

.sp-cal-cell.is-empty {
  border: none;
  background: none;
  cursor: default;
}

.sp-cal-cell:hover:not(.is-empty) {
  border-color: #6e4aff;
}

.sp-cal-cell.is-selected {
  border-color: #6e4aff;
  background: #241f3a;
}

.sp-cal-cell.is-today .sp-cal-num {
  color: #ffd666;
  font-weight: 600;
}

.sp-cal-num {
  font-size: 12px;
}

.sp-cal-marks {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.sp-cal-weight {
  margin-top: auto;
  font-size: 10px;
  color: #7a7f8e;
}

.sp-mark {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.sp-h4 {
  margin: 14px 0 6px;
  font-size: 13px;
  color: #9aa0b0;
  font-weight: 600;
}

.sp-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}

.sp-photos {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.sp-photo {
  width: 78px;
  border-radius: 6px;
}
</style>
