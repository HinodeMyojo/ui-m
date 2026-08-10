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
  // Раскладка «день недели → шаблон». Схема с WeekNo здесь не показывается:
  // нелинейные программы редки, а сетка от них становится нечитаемой.
  days: {},
});

onMounted(async () => {
  templates.value = await fetchSportTemplates().catch(() => []);
  goals.value = await fetchSportGoals("active").catch(() => []);
  if (!props.programId) return;
  try {
    const p = await fetchSportProgram(props.programId);
    const days = {};
    for (const d of p.days) days[d.weekday] = d.templateId;
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
  const days = Object.entries(form.value.days)
    .filter(([, templateId]) => !!templateId)
    .map(([weekday, templateId]) => ({ weekday: Number(weekday), templateId }));
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
          <strong style="font-size: 14px">Дни недели</strong>
          <div class="sp-days">
            <div v-for="[num, title] in WEEKDAYS" :key="num" class="sp-field">
              <label>{{ title }}</label>
              <select v-model="form.days[num]" class="sp-select">
                <option :value="undefined">—</option>
                <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.title }}</option>
              </select>
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
.sp-days {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  margin-top: 6px;
}
</style>
