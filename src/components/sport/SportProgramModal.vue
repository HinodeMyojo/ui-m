<script setup>
import { ref, onMounted } from "vue";
import {
  fetchSportProgram,
  fetchSportTemplates,
  fetchSportGoals,
  createSportProgram,
  updateSportProgram,
  deleteSportProgram,
  sportToday,
} from "@/components/sportApi.js";

const props = defineProps({ programId: { type: String, default: null } });
const emit = defineEmits(["close", "saved"]);

const WEEKDAYS = [
  [1, "Пн"], [2, "Вт"], [3, "Ср"], [4, "Чт"], [5, "Пт"], [6, "Сб"], [7, "Вс"],
];

const templates = ref([]);
const goals = ref([]);
const error = ref("");
const busy = ref(false);

const form = ref({
  title: "",
  goalId: "",
  startDate: sportToday(),
  weeks: null,
  active: true,
  progressionType: "none",
  progressionStep: 0,
  progressionEvery: 1,
  // Раскладка «шаблон → дни недели». В один день можно поставить несколько
  // шаблонов: ежедневные зарядка, пресс и турник плюс пробежка через день.
  // Схема с WeekNo здесь не показывается: нелинейные программы редки, а сетка
  // от них становится нечитаемой.
  days: {},
});

// Быстрые раскладки для строки шаблона.
const PRESETS = [
  { label: "каждый день", days: [1, 2, 3, 4, 5, 6, 7] },
  { label: "через день", days: [1, 3, 5, 7] },
  { label: "будни", days: [1, 2, 3, 4, 5] },
  { label: "нет", days: [] },
];

function daysOf(templateId) {
  return form.value.days[templateId] || [];
}

function hasDay(templateId, weekday) {
  return daysOf(templateId).includes(weekday);
}

function toggleDay(templateId, weekday) {
  const list = daysOf(templateId);
  form.value.days[templateId] = list.includes(weekday)
    ? list.filter((d) => d !== weekday)
    : [...list, weekday].sort();
}

function applyPreset(templateId, days) {
  form.value.days[templateId] = [...days];
}

function sameDays(templateId, days) {
  const list = daysOf(templateId);
  return list.length === days.length && days.every((d) => list.includes(d));
}

// Сколько шаблонов выпадает на каждый день недели — видно нагрузку.
function countOn(weekday) {
  return Object.values(form.value.days).filter((list) => list.includes(weekday)).length;
}

onMounted(async () => {
  templates.value = await fetchSportTemplates().catch(() => []);
  goals.value = await fetchSportGoals("active").catch(() => []);
  if (!props.programId) return;
  try {
    const p = await fetchSportProgram(props.programId);
    const days = {};
    for (const d of p.days) {
      if (!days[d.templateId]) days[d.templateId] = [];
      if (!days[d.templateId].includes(d.weekday)) days[d.templateId].push(d.weekday);
    }
    form.value = {
      title: p.title,
      goalId: p.goalId || "",
      startDate: p.startDate,
      weeks: p.weeks,
      active: p.active,
      progressionType: p.progressionType,
      progressionStep: p.progressionStep,
      progressionEvery: p.progressionEvery,
      days,
    };
  } catch (e) {
    error.value = e.message || "не удалось загрузить программу";
  }
});

async function save() {
  if (!form.value.title.trim()) {
    error.value = "название пустое";
    return;
  }
  busy.value = true;
  error.value = "";
  const days = Object.entries(form.value.days).flatMap(([templateId, weekdays]) =>
    weekdays.map((weekday) => ({ weekday, templateId })),
  );
  const payload = {
    title: form.value.title,
    goalId: form.value.goalId || null,
    clearGoal: !form.value.goalId,
    startDate: form.value.startDate,
    weeks: form.value.weeks ? Number(form.value.weeks) : null,
    active: form.value.active,
    progressionType: form.value.progressionType,
    progressionStep: Number(form.value.progressionStep) || 0,
    progressionEvery: Number(form.value.progressionEvery) || 1,
    days,
  };
  try {
    if (props.programId) await updateSportProgram(props.programId, payload);
    else await createSportProgram(payload);
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось сохранить программу";
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!props.programId) return;
  if (!confirm("Удалить программу? Раскатанные тренировки останутся.")) return;
  busy.value = true;
  try {
    await deleteSportProgram(props.programId);
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось удалить";
    busy.value = false;
  }
}
</script>

<template>
  <div class="sp-modal-backdrop" @click.self="emit('close')">
    <div class="sp-modal">
      <div class="sp-modal-head">
        <h3>{{ programId ? "Программа" : "Новая программа" }}</h3>
        <button class="sp-btn sp-btn-sm" @click="emit('close')">✕</button>
      </div>

      <div class="sp-modal-body">
        <div v-if="error" class="sp-error">{{ error }}</div>

        <div class="sp-field">
          <label>Название</label>
          <input v-model="form.title" class="sp-input" placeholder="Например: набор массы, 8 недель" />
        </div>

        <div class="sp-row">
          <div class="sp-field">
            <label>Старт</label>
            <input v-model="form.startDate" class="sp-input" type="date" />
          </div>
          <div class="sp-field" style="width: 110px">
            <label>Недель (пусто — без конца)</label>
            <input v-model="form.weeks" class="sp-input" type="number" min="1" />
          </div>
          <div class="sp-field" style="width: 140px">
            <label>Цель</label>
            <select v-model="form.goalId" class="sp-select">
              <option value="">без цели</option>
              <option v-for="g in goals" :key="g.id" :value="g.id">{{ g.title }}</option>
            </select>
          </div>
          <label class="sp-check" style="align-self: flex-end; margin-bottom: 8px">
            <input v-model="form.active" type="checkbox" /> активна
          </label>
        </div>

        <div>
          <strong style="font-size: 14px">Шаблоны по дням недели</strong>
          <div class="sp-muted" style="margin: 4px 0 6px">
            В один день можно поставить несколько шаблонов. В дисциплине спорт считается
            по доле закрытых шаблонов дня.
          </div>
          <div v-if="!templates.length" class="sp-muted">Сначала заведите шаблоны тренировок.</div>
          <div v-else class="spd-grid">
            <div class="spd-load">
              <span v-for="[num, title] in WEEKDAYS" :key="num">
                {{ title }} <b>{{ countOn(num) }}</b>
              </span>
            </div>
            <div v-for="t in templates" :key="t.id" class="spd-row">
              <div class="spd-title">
                <span class="spd-dot" :style="{ background: t.color || '#4aa8ff' }" />
                {{ t.title }}
              </div>
              <div class="spd-days">
                <button v-for="[num, title] in WEEKDAYS" :key="num" type="button" class="spd-day"
                  :class="{ 'is-on': hasDay(t.id, num) }" :title="title"
                  @click="toggleDay(t.id, num)">
                  {{ title }}
                </button>
              </div>
              <div class="spd-presets">
                <button v-for="p in PRESETS" :key="p.label" type="button" class="spd-preset"
                  :class="{ 'is-on': daysOf(t.id).length && sameDays(t.id, p.days) }"
                  @click="applyPreset(t.id, p.days)">
                  {{ p.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <strong style="font-size: 14px">Прогрессия</strong>
          <div class="sp-muted" style="margin: 4px 0 6px">
            Применяется при раскатке: плановые значения растут от недели к неделе.
            Уже раскатанные недели не пересчитываются.
          </div>
          <div class="sp-row">
            <div class="sp-field" style="width: 140px">
              <label>Тип</label>
              <select v-model="form.progressionType" class="sp-select">
                <option value="none">выключена</option>
                <option value="weight">+ вес</option>
                <option value="reps">+ повторы</option>
              </select>
            </div>
            <div class="sp-field" style="width: 110px">
              <label>Шаг</label>
              <input
                v-model="form.progressionStep"
                class="sp-input"
                type="number"
                step="0.5"
                :disabled="form.progressionType === 'none'"
              />
            </div>
            <div class="sp-field" style="width: 130px">
              <label>Раз в N недель</label>
              <input
                v-model="form.progressionEvery"
                class="sp-input"
                type="number"
                min="1"
                :disabled="form.progressionType === 'none'"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="sp-modal-foot">
        <button v-if="programId" class="sp-btn is-danger" :disabled="busy" @click="remove">
          Удалить
        </button>
        <div class="sp-spacer"></div>
        <button class="sp-btn" @click="emit('close')">Отмена</button>
        <button class="sp-btn is-primary" :disabled="busy" @click="save">Сохранить</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spd-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.spd-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 44px));
  gap: 4px;
}

/* Сколько шаблонов выпадает на день — видно, где перегруз. */
.spd-load {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 11.5px;
  color: #8f95a6;
}

.spd-load b {
  color: #8ab4ff;
}

.spd-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid #2a2d38;
  border-radius: 10px;
}

.spd-title {
  font-size: 13.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.spd-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.spd-day {
  height: 32px;
  border-radius: 8px;
  border: 1px solid #2a2d38;
  background: transparent;
  color: #8f95a6;
  cursor: pointer;
  font-size: 12px;
}

.spd-day.is-on {
  background: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

.spd-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.spd-preset {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 10px;
  border: 1px solid #2a2d38;
  background: transparent;
  color: #cfd3e0;
  cursor: pointer;
}

.spd-preset.is-on {
  border-color: #1767fd;
  color: #8ab4ff;
}
</style>
