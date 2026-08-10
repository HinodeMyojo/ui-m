<script setup>
import { ref, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/sport.css";
import {
  fetchSportTodayData,
  setSportEntry,
  updateSportSet,
  uploadSportPhotos,
  unlockSportPin,
  SPORT_STATUS_COLORS,
} from "@/components/sportApi.js";

// Карточка спорта на вкладке «Сегодня»: ввод веса, фото и галочки подходов
// без ухода в раздел. Всё тяжёлое — по кнопке «Открыть спорт».

const props = defineProps({ date: { type: String, required: true } });

const router = useRouter();
const data = ref(null);
const drafts = ref({});
const error = ref("");
const busy = ref(false);
const uploading = ref(false);
const pinInput = ref("");

async function load() {
  error.value = "";
  try {
    data.value = await fetchSportTodayData(props.date);
    drafts.value = {};
    for (const e of data.value.entries) drafts.value[e.metricId] = e.value;
  } catch (e) {
    error.value = e.message || "не удалось загрузить данные спорта";
  }
}

function entered(metricId) {
  return (data.value?.entries || []).some((e) => e.metricId === metricId);
}

async function saveMetric(metric) {
  const raw = drafts.value[metric.id];
  if (raw === "" || raw === null || raw === undefined) return;
  busy.value = true;
  try {
    await setSportEntry(metric.id, props.date, { value: Number(String(raw).replace(",", ".")) });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить замер";
  } finally {
    busy.value = false;
  }
}

async function toggleSet(set) {
  busy.value = true;
  try {
    await updateSportSet(set.id, { ...set, done: !set.done });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось отметить подход";
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
    await uploadSportPhotos(files, { date: props.date });
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

watch(() => props.date, load);
onMounted(load);
</script>

<template>
  <div class="sp stc">
    <div v-if="error" class="sp-error">{{ error }}</div>

    <div class="sp-row">
      <strong>🏋️ Спорт</strong>
      <span v-if="data?.streak" class="sp-muted">
        {{ data.streak.anyCurrent }} дн. подряд
      </span>
      <div class="sp-spacer"></div>
      <label class="sp-btn sp-btn-sm">
        {{ uploading ? "…" : `📷 ${data?.photoCount || 0}` }}
        <input type="file" accept="image/*" multiple hidden @change="onFiles" />
      </label>
      <button class="sp-btn sp-btn-sm" @click="router.push('/sport')">Открыть</button>
    </div>

    <div v-if="data?.photosLocked && !data?.photos?.length" class="sp-row">
      <input
        v-model="pinInput"
        class="sp-input"
        style="max-width: 120px"
        type="password"
        placeholder="PIN фото"
        @keyup.enter="unlock"
      />
      <button class="sp-btn sp-btn-sm" @click="unlock">🔓</button>
    </div>

    <div class="stc-metrics">
      <div v-for="m in data?.metrics || []" :key="m.id" class="sp-field" style="width: 130px">
        <label>
          {{ m.emoji }} {{ m.title }}
          <span v-if="entered(m.id)" style="color: #63c94f">✓</span>
        </label>
        <div class="sp-row" style="gap: 4px">
          <input
            v-model="drafts[m.id]"
            class="sp-input"
            type="number"
            :step="m.precision ? 0.1 : 1"
            :placeholder="m.unit"
            @keyup.enter="saveMetric(m)"
          />
          <button class="sp-btn sp-btn-sm" :disabled="busy" @click="saveMetric(m)">OK</button>
        </div>
      </div>
    </div>

    <div v-for="w in data?.workouts || []" :key="w.id" class="stc-workout">
      <div class="sp-row">
        <span class="stc-dot" :style="{ background: SPORT_STATUS_COLORS[w.status] }"></span>
        <strong>{{ w.title }}</strong>
        <span class="sp-muted">{{ w.setsDone }}/{{ w.setsTotal }}</span>
      </div>
      <div v-for="ex in w.exercises" :key="ex.id" class="sp-row" style="gap: 6px; margin-top: 4px">
        <span class="sp-muted" style="min-width: 150px">{{ ex.exercise.title }}</span>
        <button
          v-for="s in ex.sets"
          :key="s.id"
          class="stc-set"
          :class="{ 'is-done': s.done }"
          :disabled="busy"
          @click="toggleSet(s)"
        >
          {{ s.reps ?? "•" }}<template v-if="s.weight">×{{ s.weight }}</template>
        </button>
      </div>
    </div>

    <div v-if="!data?.workouts?.length" class="sp-muted">Тренировок на этот день нет</div>
  </div>
</template>

<style scoped>
/* Карточка живёт внутри рабочего стола, поэтому фон и отступы раздела не нужны. */
.stc {
  min-height: 0;
  padding: 0;
  background: none;
  gap: 8px;
}

.stc-metrics {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.stc-workout {
  border-top: 1px solid #232631;
  padding-top: 8px;
}

.stc-set {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
}

.stc-set.is-done {
  background: #234b1d;
  border-color: #63c94f;
  color: #d6f5cd;
}

.stc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
</style>
