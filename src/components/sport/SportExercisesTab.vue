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
import SportDemo from "@/components/sport/SportDemo.vue";
import SportExerciseCatalog from "@/components/sport/SportExerciseCatalog.vue";
import {
  fetchSportExercises,
  createSportExercise,
  updateSportExercise,
  deleteSportExercise,
  fetchSportExerciseHistory,
  fetchSportMetrics,
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

// Готовые доли веса тела. Значения приблизительные, но порядок величины
// важнее точности: разница между 1.0 и 0.12 — это разница между 20 и 2.4 тонны.
const BODY_FACTOR_PRESETS = [
  { value: 1, label: "всё тело · 1.0" },
  { value: 0.65, label: "отжимания · 0.65" },
  { value: 0.55, label: "приседания · 0.55" },
  { value: 0.15, label: "подъём ног · 0.15" },
  { value: 0.12, label: "пресс · 0.12" },
  { value: 0, label: "не считать · 0" },
];

const exercises = ref([]);
const search = ref("");
const groupFilter = ref("");
const showArchived = ref(false);
const error = ref("");
const busy = ref(false);

const editing = ref(null);
const history = ref(null);
const lastWeight = ref(null);

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
    const metrics = await fetchSportMetrics();
    lastWeight.value = metrics.find((m) => m.code === "weight")?.lastValue ?? null;
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
    bodyweightFactor: 1,
    emoji: "🏋️",
    note: "",
    fields: ["reps", "weight"],
    demoUrls: [],
    demoSource: "",
    archived: false,
  };
}

function openEdit(ex) {
  editing.value = {
    ...ex,
    muscleGroups: [...ex.muscleGroups],
    fields: [...ex.fields],
    demoUrls: [...(ex.demoUrls || [])],
    demoSource: ex.demoSource || "",
    // null на бэке означает «не задано» и считается как 1.0 — показываем так же.
    bodyweightFactor: ex.bodyweightFactor ?? 1,
  };
}

// --- Демонстрация движения ---
// Ссылки правятся текстом, по одной в строке: так же, как они лежат на сервере.
// Каталог — просто быстрый способ их набрать, руками можно вписать любые.

const catalogFor = ref(null);

const demoText = computed({
  get: () => (editing.value?.demoUrls || []).join("\n"),
  set: (v) => {
    editing.value.demoUrls = v
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    editing.value.demoSource = editing.value.demoUrls.length ? "manual" : "";
  },
});

function applyCatalogPick(pick) {
  editing.value.demoUrls = pick.demoUrls;
  editing.value.demoSource = pick.demoSource;
  // Готовое описание подставляем только в пустую заметку: своё, написанное
  // руками, ценнее машинного перевода из каталога и затирать его нельзя.
  if (pick.note && !String(editing.value.note || "").trim()) {
    editing.value.note = pick.note;
  }
  catalogFor.value = null;
}

// Подпись правообладателя: медиа перевыложено с его разрешения ровно на этом
// условии, поэтому она обязана быть рядом с картинками, а не только в каталоге.
const DEMO_SOURCES = {
  gymvisual: { label: "© Gym visual", url: "https://gymvisual.com/" },
};

const demoCredit = computed(() => DEMO_SOURCES[editing.value?.demoSource] || null);

// Хотя бы одна картинка на экране — значит подпись нужна и на самом экране.
const listCredit = computed(() => {
  const codes = new Set(filtered.value.filter((e) => e.demoUrls?.length).map((e) => e.demoSource));
  return [...codes].map((c) => DEMO_SOURCES[c]).filter(Boolean);
});

// Подсказка «сколько выйдет» на реальном весе: абстрактный коэффициент
// понять сложнее, чем «15 повторов дадут столько-то килограммов».
const bodyFactorHint = computed(() => {
  const f = Number(editing.value?.bodyweightFactor);
  if (!lastWeight.value || Number.isNaN(f)) return "";
  const perRep = lastWeight.value * f;
  return `При вашем весе ${lastWeight.value} кг это ${perRep.toFixed(1)} кг за повтор, ${(perRep * 15).toFixed(0)} кг за 15 повторов.`;
});

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
    bodyweightFactor:
      editing.value.type === "bodyweight" ? Number(editing.value.bodyweightFactor) : null,
    emoji: editing.value.emoji,
    note: editing.value.note || null,
    fields: editing.value.fields,
    demoUrls: editing.value.demoUrls || [],
    demoSource: editing.value.demoSource || "",
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
          <SportDemo :urls="ex.demoUrls" size="52px" />
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
          <template v-if="ex.type === 'bodyweight'">
            · вес тела ×{{ ex.bodyweightFactor ?? 1 }}
          </template>
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

          <!-- Как выглядит движение. Одна ссылка — картинка или гифка,
               несколько — кадры, которые интерфейс сам перещёлкивает. -->
          <div class="sp-field">
            <label>Демонстрация движения</label>
            <div class="sp-row">
              <SportDemo :urls="editing.demoUrls" size="86px" />
              <div style="flex: 1; min-width: 180px">
                <textarea
                  v-model="demoText"
                  class="sp-input spx-demo"
                  rows="3"
                  placeholder="https://…/0.jpg&#10;https://…/1.jpg"
                ></textarea>
                <div class="sp-muted" style="margin-top: 4px">
                  По одной ссылке в строке. Две и больше — станут анимацией.
                </div>
              </div>
            </div>
            <div class="sp-row" style="margin-top: 6px">
              <button class="sp-btn sp-btn-sm" @click="catalogFor = editing">
                🔍 Найти в каталоге
              </button>
              <button
                v-if="editing.demoUrls?.length"
                class="sp-btn sp-btn-sm is-danger"
                @click="editing.demoUrls = []; editing.demoSource = ''"
              >
                Убрать
              </button>
              <span v-if="demoCredit" class="sp-muted">
                <a :href="demoCredit.url" target="_blank" rel="noopener">{{ demoCredit.label }}</a>
              </span>
              <span v-else-if="editing.demoSource" class="sp-muted">источник: вручную</span>
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

          <div v-if="editing.type === 'bodyweight'" class="sp-field">
            <label>Доля веса тела в тоннаже</label>
            <div class="sp-row" style="gap: 4px">
              <button
                v-for="p in BODY_FACTOR_PRESETS"
                :key="p.value"
                class="sp-chip"
                :class="{ 'is-active': Number(editing.bodyweightFactor) === p.value }"
                @click="editing.bodyweightFactor = p.value"
              >
                {{ p.label }}
              </button>
              <input
                v-model="editing.bodyweightFactor"
                class="sp-input"
                style="width: 90px"
                type="number"
                step="0.05"
                min="0"
                max="1"
              />
            </div>
            <div class="sp-muted">
              Сколько своего веса вы реально поднимаете. Подтягивания — 1.0,
              отжимания — около 0.65, скручивания — около 0.12.
              Ноль означает «вес тела в тоннаж не считать».
              {{ bodyFactorHint }}
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

    <!-- Подпись правообладателя анимаций: условие, на котором их разрешено
         перевыкладывать. Показываем, только если картинки на экране есть. -->
    <p v-if="listCredit.length" class="spx-credit">
      Анимации:
      <template v-for="(c, i) in listCredit" :key="c.url">
        <template v-if="i"> · </template>
        <a :href="c.url" target="_blank" rel="noopener">{{ c.label }}</a>
      </template>
    </p>

    <SportExerciseCatalog
      v-if="catalogFor"
      :hint="catalogFor.title"
      @close="catalogFor = null"
      @pick="applyCatalogPick"
    />
  </div>
</template>

<style scoped>
.is-archived {
  opacity: 0.6;
}

.spx-credit {
  margin: 0;
  font-size: 11px;
  color: #6b7080;
}

.spx-credit a {
  color: #8b90a0;
}

.spx-demo {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  resize: vertical;
}
</style>
