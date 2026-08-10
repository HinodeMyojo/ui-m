<script setup>
import { ref, computed, onMounted } from "vue";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "vue-chartjs";
import {
  fetchSportExercises,
  createSportExercise,
  updateSportExercise,
  deleteSportExercise,
  fetchSportExerciseHistory,
  SPORT_MUSCLE_TITLES,
  SPORT_PR_LABELS,
  SPORT_SET_FIELDS,
  sportFormatPR,
} from "@/components/sportApi.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const TYPES = [
  ["strength", "силовое"],
  ["bodyweight", "с собственным весом"],
  ["cardio", "кардио"],
  ["mobility", "растяжка / мобильность"],
  ["other", "прочее"],
];

const exercises = ref([]);
const search = ref("");
const groupFilter = ref("");
const showArchived = ref(false);
const error = ref("");
const busy = ref(false);

const editing = ref(null);
const history = ref(null);

const filtered = computed(() =>
  exercises.value.filter((e) => {
    if (search.value && !e.title.toLowerCase().includes(search.value.toLowerCase())) return false;
    if (groupFilter.value && !e.muscleGroups.includes(groupFilter.value)) return false;
    return true;
  }),
);

async function load() {
  error.value = "";
  try {
    exercises.value = await fetchSportExercises(showArchived.value);
  } catch (e) {
    error.value = e.message || "не удалось загрузить упражнения";
  }
}

function openNew() {
  editing.value = {
    title: "",
    type: "strength",
    muscleGroups: [],
    equipment: "",
    unilateral: false,
    emoji: "🏋️",
    note: "",
    fields: ["reps", "weight"],
    archived: false,
  };
}

function openEdit(ex) {
  editing.value = { ...ex, muscleGroups: [...ex.muscleGroups], fields: [...ex.fields] };
}

function toggleIn(list, value) {
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
  else list.push(value);
}

async function save() {
  if (!editing.value.title.trim()) {
    error.value = "название пустое";
    return;
  }
  busy.value = true;
  error.value = "";
  const payload = {
    title: editing.value.title,
    type: editing.value.type,
    muscleGroups: editing.value.muscleGroups,
    equipment: editing.value.equipment,
    unilateral: editing.value.unilateral,
    emoji: editing.value.emoji,
    note: editing.value.note || null,
    fields: editing.value.fields,
    archived: editing.value.archived,
  };
  try {
    if (editing.value.id) await updateSportExercise(editing.value.id, payload);
    else await createSportExercise(payload);
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

async function remove(ex) {
  if (!confirm(`Удалить «${ex.title}»? Если оно уже использовалось, уйдёт в архив.`)) return;
  busy.value = true;
  try {
    await deleteSportExercise(ex.id);
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось удалить";
  } finally {
    busy.value = false;
  }
}

async function openHistory(ex) {
  error.value = "";
  try {
    history.value = await fetchSportExerciseHistory(ex.id);
  } catch (e) {
    error.value = e.message || "не удалось загрузить историю";
  }
}

// График рабочего веса и оценки 1ПМ: дни приходят от новых к старым,
// на графике их надо развернуть.
const historyChart = computed(() => {
  if (!history.value?.days?.length) return null;
  const days = [...history.value.days].reverse();
  return {
    labels: days.map((d) => d.date.slice(5)),
    datasets: [
      {
        label: "Рабочий вес",
        data: days.map((d) => d.topWeight),
        borderColor: "#6e4aff",
        borderWidth: 2,
        pointRadius: 2,
        spanGaps: true,
      },
      {
        label: "Оценка 1ПМ",
        data: days.map((d) => d.est1rm),
        borderColor: "#63c94f",
        borderWidth: 2,
        borderDash: [5, 4],
        pointRadius: 0,
        spanGaps: true,
      },
    ],
  };
});

const historyOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: "#9aa0b0", boxWidth: 12, font: { size: 11 } } } },
  scales: {
    x: { ticks: { color: "#7a7f8e", font: { size: 10 }, maxTicksLimit: 12 }, grid: { color: "#22242d" } },
    y: { ticks: { color: "#7a7f8e", font: { size: 10 } }, grid: { color: "#22242d" } },
  },
};

function setLine(set) {
  const parts = [];
  if (set.reps !== null) parts.push(`${set.reps}`);
  if (set.weight !== null) parts.push(`×${set.weight} кг`);
  if (set.distance !== null) parts.push(`${set.distance} м`);
  if (set.duration !== null) parts.push(`${set.duration} сек`);
  return parts.join(" ") || "✓";
}

onMounted(load);
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px">
    <div v-if="error" class="sp-error">{{ error }}</div>

    <div class="sp-card">
      <div class="sp-row">
        <input v-model="search" class="sp-input" style="max-width: 220px" placeholder="Поиск" />
        <select v-model="groupFilter" class="sp-select" style="max-width: 170px">
          <option value="">все группы</option>
          <option v-for="(title, code) in SPORT_MUSCLE_TITLES" :key="code" :value="code">
            {{ title }}
          </option>
        </select>
        <label class="sp-check">
          <input v-model="showArchived" type="checkbox" @change="load" /> с архивом
        </label>
        <div class="sp-spacer"></div>
        <button class="sp-btn is-primary" @click="openNew">+ упражнение</button>
      </div>
    </div>

    <div class="sp-grid">
      <div v-for="ex in filtered" :key="ex.id" class="sp-card" :class="{ 'is-archived': ex.archived }">
        <div class="sp-row">
          <strong>{{ ex.emoji }} {{ ex.title }}</strong>
          <div class="sp-spacer"></div>
          <span v-if="ex.archived" class="sp-muted">архив</span>
        </div>
        <div class="sp-muted">
          {{ TYPES.find((t) => t[0] === ex.type)?.[1] }}
          <template v-if="ex.muscleGroups.length">
            · {{ ex.muscleGroups.map((g) => SPORT_MUSCLE_TITLES[g] || g).join(", ") }}
          </template>
          <template v-if="ex.unilateral"> · односторонее</template>
        </div>
        <div class="sp-row" style="margin-top: 8px">
          <button class="sp-btn sp-btn-sm" @click="openHistory(ex)">История</button>
          <button class="sp-btn sp-btn-sm" @click="openEdit(ex)">Изменить</button>
        </div>
      </div>
    </div>

    <!-- Редактор -->
    <div v-if="editing" class="sp-modal-backdrop" @click.self="editing = null">
      <div class="sp-modal">
        <div class="sp-modal-head">
          <h3>{{ editing.id ? "Упражнение" : "Новое упражнение" }}</h3>
          <button class="sp-btn sp-btn-sm" @click="editing = null">✕</button>
        </div>
        <div class="sp-modal-body">
          <div class="sp-row">
            <div class="sp-field" style="width: 70px">
              <label>Эмодзи</label>
              <input v-model="editing.emoji" class="sp-input" maxlength="4" />
            </div>
            <div class="sp-field" style="flex: 1">
              <label>Название</label>
              <input v-model="editing.title" class="sp-input" />
            </div>
          </div>

          <div class="sp-row">
            <div class="sp-field" style="flex: 1">
              <label>Тип</label>
              <select v-model="editing.type" class="sp-select">
                <option v-for="[code, title] in TYPES" :key="code" :value="code">{{ title }}</option>
              </select>
            </div>
            <div class="sp-field" style="flex: 1">
              <label>Снаряд</label>
              <input v-model="editing.equipment" class="sp-input" placeholder="barbell / dumbbell" />
            </div>
          </div>

          <div class="sp-field">
            <label>Группы мышц</label>
            <div class="sp-row" style="gap: 4px">
              <button
                v-for="(title, code) in SPORT_MUSCLE_TITLES"
                :key="code"
                class="sp-chip"
                :class="{ 'is-active': editing.muscleGroups.includes(code) }"
                @click="toggleIn(editing.muscleGroups, code)"
              >
                {{ title }}
              </button>
            </div>
          </div>

          <div class="sp-field">
            <label>Поля подхода</label>
            <div class="sp-row" style="gap: 4px">
              <button
                v-for="f in SPORT_SET_FIELDS"
                :key="f.code"
                class="sp-chip"
                :class="{ 'is-active': editing.fields.includes(f.code) }"
                @click="toggleIn(editing.fields, f.code)"
              >
                {{ f.label }}
              </button>
            </div>
          </div>

          <div class="sp-row">
            <label class="sp-check">
              <input v-model="editing.unilateral" type="checkbox" /> одностороннее (объём ×2)
            </label>
            <label class="sp-check">
              <input v-model="editing.archived" type="checkbox" /> в архиве
            </label>
          </div>

          <div class="sp-field">
            <label>Заметка о технике</label>
            <textarea v-model="editing.note" class="sp-textarea" />
          </div>
        </div>
        <div class="sp-modal-foot">
          <button v-if="editing.id" class="sp-btn is-danger" :disabled="busy" @click="remove(editing)">
            Удалить
          </button>
          <div class="sp-spacer"></div>
          <button class="sp-btn" @click="editing = null">Отмена</button>
          <button class="sp-btn is-primary" :disabled="busy" @click="save">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- История -->
    <div v-if="history" class="sp-modal-backdrop" @click.self="history = null">
      <div class="sp-modal is-wide">
        <div class="sp-modal-head">
          <h3>{{ history.exercise.emoji }} {{ history.exercise.title }}</h3>
          <button class="sp-btn sp-btn-sm" @click="history = null">✕</button>
        </div>
        <div class="sp-modal-body">
          <div v-if="history.records.length" class="sp-row">
            <div v-for="pr in history.records" :key="pr.id" class="sp-stat">
              <div class="sp-stat-label">{{ SPORT_PR_LABELS[pr.kind] || pr.kind }}</div>
              <div class="sp-stat-value">{{ sportFormatPR(pr.kind, pr.value) }}</div>
              <div class="sp-muted">{{ pr.date }}</div>
            </div>
          </div>
          <div v-else class="sp-muted">Рекордов пока нет — они появятся после первой выполненной тренировки.</div>

          <div v-if="historyChart" style="height: 230px">
            <Line :data="historyChart" :options="historyOptions" />
          </div>

          <div v-if="!history.days.length" class="sp-empty">История пуста</div>
          <div v-for="d in history.days" :key="d.date" class="sp-row" style="font-size: 13px">
            <strong style="width: 96px">{{ d.date }}</strong>
            <span class="sp-muted">{{ Math.round(d.volumeKg) }} кг</span>
            <div class="sp-row" style="gap: 4px">
              <span v-for="s in d.sets" :key="s.id" class="sp-chip">{{ setLine(s) }}</span>
            </div>
          </div>
        </div>
        <div class="sp-modal-foot">
          <button class="sp-btn is-primary" @click="history = null">Закрыть</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.is-archived {
  opacity: 0.6;
}
</style>
