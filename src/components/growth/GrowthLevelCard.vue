<script setup>
// Карточка уровня в панели «Я»: цель и срок, критерии, материалы, задачи,
// зачёт, «сделать дисциплинным», правка. docs/me-module.md (back-m)
import { computed, ref, watch } from "vue";
import confetti from "@/composables/useConfetti.js";
import {
  addGrowthCriterion,
  addGrowthEdge,
  addGrowthMaterial,
  addGrowthPlace,
  deleteGrowthEdge,
  deleteGrowthPlace,
  fetchGrowthPlaceOptions,
  updateGrowthPlace,
  completeGrowthLevel,
  createGrowthLevel,
  createGrowthTasks,
  deleteGrowthCriterion,
  deleteGrowthLevel,
  deleteGrowthMaterial,
  makeGrowthDisciplined,
  updateGrowthCriterion,
  updateGrowthLevel,
  updateGrowthMaterial,
} from "@/components/growthApi.js";
import { getPdfFiles } from "@/api/pdfFiles.js";
import { growth, growthAct, levelColor, levelsById, skillsById, STATUS_TITLES } from "@/composables/useGrowth.js";

const props = defineProps({
  level: { type: Object, required: true },
  inDraft: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "toggle-draft", "select", "edit-skill"]);

const skill = computed(() => skillsById.value.get(props.level.skillId));

// Сколько месяцев уровень уже держит. Текущий месяц засчитывается сразу, как
// только уровень взят, поэтому «прошло 1» в первый же день читалось как
// «месяц уже прошёл» — теперь «идёт 1-й месяц из 1».
const termText = computed(() => {
  const { months, monthsUsed: used, status } = props.level;
  if (status === "active") return `идёт ${used}-й месяц из ${months}`;
  if (used > 0) return `${status === "done" ? "занял" : "взят"} ${used} мес из ${months}`;
  return `срок ${months} мес`;
});
const color = computed(() => levelColor(props.level));
const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const notice = ref("");

// --- Правка полей ---
const editing = ref(false);
const form = ref({});
function startEdit() {
  const l = props.level;
  form.value = {
    title: l.title, emoji: l.emoji, goal: l.goal, description: l.description, months: l.months,
    readMin: l.readMin ?? "", readMid: l.readMid ?? "", readMax: l.readMax ?? "",
  };
  editing.value = true;
}
watch(() => props.level.id, () => {
  editing.value = false;
  notice.value = "";
  discOpen.value = false;
  placeOptions.value = null;
  wishPicker.value = false;
  linkOpen.value = false;
  if (isTravel.value) loadPlaceOptions();
});

function numOrNull(v) {
  return v === "" || v === null || v === undefined ? null : Number(v);
}

async function saveEdit() {
  const f = form.value;
  const read = [numOrNull(f.readMin), numOrNull(f.readMid), numOrNull(f.readMax)];
  const ok = await growthAct(() =>
    updateGrowthLevel(props.level.id, {
      title: f.title, emoji: f.emoji, goal: f.goal, description: f.description,
      months: Number(f.months) || undefined,
      clearRead: read.every((v) => v === null),
      readMin: read[0] ?? undefined, readMid: read[1] ?? undefined, readMax: read[2] ?? undefined,
    }),
  );
  if (ok) editing.value = false;
}

// --- Критерии ---
const newCriterion = ref("");
const newRequired = ref(true);
async function addCriterion() {
  const title = newCriterion.value.trim();
  if (!title) return;
  if (await growthAct(() => addGrowthCriterion(props.level.id, { title, required: newRequired.value }))) {
    newCriterion.value = "";
  }
}
const toggleCriterion = (c) => growthAct(() => updateGrowthCriterion(c.id, { done: !c.done }));
const toggleRequired = (c) => growthAct(() => updateGrowthCriterion(c.id, { required: !c.required }));
const removeCriterion = (c) => growthAct(() => deleteGrowthCriterion(c.id));

// --- Материалы ---
const KINDS = [
  ["book", "📕 книга"], ["course", "🎓 курс"], ["article", "📰 статья"], ["video", "🎬 видео"],
  ["practice", "🛠 практика"], ["cert", "📜 сертификат"], ["other", "• другое"],
];
const KIND_ICONS = Object.fromEntries(KINDS.map(([k, t]) => [k, t.split(" ")[0]]));
const matOpen = ref(false);
const mat = ref({ kind: "book", title: "", author: "", url: "", total: "", pdfFileId: "" });
const books = ref([]);
async function openMaterialForm() {
  matOpen.value = true;
  if (!books.value.length) {
    try {
      books.value = (await getPdfFiles({})) || [];
    } catch {
      books.value = [];
    }
  }
}
function pickBook() {
  const b = books.value.find((x) => x.id === mat.value.pdfFileId);
  if (b && !mat.value.title) {
    mat.value.title = b.title || b.filename;
    mat.value.author = b.author || "";
  }
}
async function addMaterial() {
  const m = mat.value;
  if (!m.title.trim()) return;
  const ok = await growthAct(() =>
    addGrowthMaterial(props.level.id, {
      kind: m.kind, title: m.title, author: m.author, url: m.url,
      total: m.total ? Number(m.total) : undefined,
      pdfFileId: m.pdfFileId || undefined,
    }),
  );
  if (ok) {
    mat.value = { kind: "book", title: "", author: "", url: "", total: "", pdfFileId: "" };
    matOpen.value = false;
  }
}
const toggleMaterial = (m) => growthAct(() => updateGrowthMaterial(m.id, { done: !m.done }));
const removeMaterial = (m) => growthAct(() => deleteGrowthMaterial(m.id));
async function setMaterialCurrent(m, value) {
  const n = Number(value);
  if (Number.isFinite(n)) await growthAct(() => updateGrowthMaterial(m.id, { current: n }));
}

// --- Действия уровня ---
// Когда пройден: по умолчанию сегодня, можно задним числом (поездка весной).
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const doneDate = ref(todayYmd());
watch(() => props.level.id, () => (doneDate.value = todayYmd()));

async function complete() {
  const undo = props.level.status === "done";
  if (!undo && !props.level.canComplete && !confirm("Не все обязательные критерии закрыты. Засчитать всё равно?")) return;
  const date = !undo && doneDate.value && doneDate.value !== todayYmd() ? doneDate.value : "";
  if (await growthAct(() => completeGrowthLevel(props.level.id, undo, "", date))) {
    if (!undo) confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
  }
}

async function createTasks() {
  if (await growthAct(() => createGrowthTasks(props.level.id))) {
    notice.value = "Задача месяца создана — она на главной.";
  }
}

const discOpen = ref(false);
const disc = ref({ min: "", mid: "", max: "" });
async function makeDisciplined() {
  if (await growthAct(() => makeGrowthDisciplined(props.level.id, disc.value))) {
    notice.value = "Строка добавлена в дисциплину этого месяца.";
    discOpen.value = false;
    disc.value = { min: "", mid: "", max: "" };
  }
}

async function addNext() {
  const title = prompt("Название следующего уровня");
  if (!title) return;
  await growthAct(() => createGrowthLevel({ skillId: props.level.skillId, title, after: [props.level.id] }));
}

async function removeLevel() {
  if (!confirm(`Удалить уровень «${props.level.title}» со всеми критериями и материалами?`)) return;
  if (await growthAct(() => deleteGrowthLevel(props.level.id))) emit("close");
}

const pickable = computed(() => props.level.status !== "done");

// --- Что дальше: одна понятная следующая цель вместо стены пунктов ---
const nextStep = computed(() => {
  const l = props.level;
  if (l.status === "done") return null;
  const crit = l.criteria.find((c) => c.required && !c.done) || l.criteria.find((c) => !c.done);
  if (crit) return { icon: "☐", text: crit.title, kind: "критерий" };
  const place = l.places.find((p) => p.status === "planned" || p.status === "idea");
  if (place) return { icon: "📍", text: place.title, kind: "место" };
  const mat = l.materials.find((m) => m.progress < 1);
  if (mat) return { icon: KIND_ICONS[mat.kind] || "•", text: mat.title, kind: "материал" };
  const task = l.tasks.find((t) => !t.done);
  if (task) return { icon: "✔", text: task.title, kind: "задача" };
  if (l.canComplete) return { icon: "🏁", text: "Всё закрыто — засчитай уровень", kind: "финиш" };
  return null;
});

// Из чего сложился процент: те же единицы, что считает сервер.
const breakdown = computed(() => {
  const l = props.level;
  const out = [];
  const req = l.criteria.filter((c) => c.required);
  const crit = req.length ? req : l.criteria;
  if (crit.length) out.push({ label: req.length ? "обяз. критерии" : "критерии", done: crit.filter((c) => c.done).length, total: crit.length });
  const places = l.places.filter((p) => p.status !== "skipped");
  if (places.length) out.push({ label: "места", done: places.filter((p) => p.status === "visited").length, total: places.length });
  if (l.materials.length) out.push({ label: "материалы", done: l.materials.filter((m) => m.progress >= 1).length, total: l.materials.length });
  if (l.tasks.length) out.push({ label: "задачи", done: l.tasks.filter((t) => t.done).length, total: l.tasks.length });
  return out;
});

// --- Путешествия: поездка и места из вишлиста страны ---
const isTravel = computed(() => !!skill.value?.travelCountry || props.level.places.length > 0 || !!props.level.tripId);
const placeOptions = ref(null);
const newPlace = ref("");
const wishPicker = ref(false);
const placeBusy = ref(false);

async function loadPlaceOptions() {
  try {
    placeOptions.value = await fetchGrowthPlaceOptions(props.level.id);
  } catch (e) {
    notice.value = e.message;
  }
}
if (isTravel.value) loadPlaceOptions();

const PLACE_STATUS = {
  idea: { icon: "·", title: "идея" },
  planned: { icon: "☐", title: "в плане" },
  visited: { icon: "☑", title: "был" },
  skipped: { icon: "✗", title: "не вышло" },
};
const visitedCount = computed(() => props.level.places.filter((p) => p.status === "visited").length);

// Несколько мест сразу — через запятую или с новой строки.
async function addPlaces() {
  const titles = newPlace.value.split(/[,\n;]/).map((t) => t.trim()).filter(Boolean);
  if (!titles.length) return;
  placeBusy.value = true;
  for (const title of titles) {
    if (!(await growthAct(() => addGrowthPlace(props.level.id, { title })))) break;
  }
  placeBusy.value = false;
  newPlace.value = "";
  loadPlaceOptions();
}

async function toggleWish(w) {
  placeBusy.value = true;
  if (w.linked) {
    const place = props.level.places.find((p) => p.wishId === w.id);
    if (place) await growthAct(() => deleteGrowthPlace(place.id));
  } else {
    await growthAct(() => addGrowthPlace(props.level.id, { wishId: w.id }));
  }
  placeBusy.value = false;
  loadPlaceOptions();
}

const setPlaceStatus = (p, status) => growthAct(() => updateGrowthPlace(p.id, { status: p.status === status ? "planned" : status }));
const removePlace = async (p) => {
  await growthAct(() => deleteGrowthPlace(p.id));
  loadPlaceOptions();
};

async function setTrip(id) {
  await growthAct(() => updateGrowthLevel(props.level.id, id ? { tripId: id } : { clearTrip: true }));
}

function tripWhen(t) {
  if (!t?.startDate) return "даты не выбраны";
  const start = new Date(`${t.startDate}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(0, (t.daysCount || 1) - 1));
  const fmt = (d) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const today = new Date(`${growth.value?.today || ""}T00:00:00`);
  const days = Math.round((start - today) / 86400000);
  let rel = "";
  if (Number.isFinite(days)) {
    if (days > 0) rel = ` · через ${days} дн.`;
    else if (today <= end) rel = " · идёт сейчас";
    else rel = " · позади";
  }
  return `${fmt(start)} — ${fmt(end)}${rel}`;
}

// --- Стрелки: что открывает этот уровень и что нужно до него ---
const incoming = computed(() =>
  (growth.value?.edges || []).filter((e) => e.toId === props.level.id)
    .map((e) => ({ edge: e, other: levelsById.value.get(e.fromId) })).filter((x) => x.other),
);
const outgoing = computed(() =>
  (growth.value?.edges || []).filter((e) => e.fromId === props.level.id)
    .map((e) => ({ edge: e, other: levelsById.value.get(e.toId) })).filter((x) => x.other),
);
const linkOpen = ref(false);
const linkDir = ref("from"); // from — «до этого уровня нужен…», to — «после него открывается…»
const linkQuery = ref("");
const linkResults = computed(() => {
  const q = linkQuery.value.trim().toLowerCase();
  if (q.length < 2) return [];
  const linked = new Set([...incoming.value, ...outgoing.value].map((x) => x.other.id));
  return (growth.value?.levels || [])
    .filter((l) => l.id !== props.level.id && !linked.has(l.id))
    .filter((l) => l.title.toLowerCase().includes(q) || skillsById.value.get(l.skillId)?.title.toLowerCase().includes(q))
    .slice(0, 8);
});
async function link(other) {
  const [from, to] = linkDir.value === "from" ? [other.id, props.level.id] : [props.level.id, other.id];
  if (await growthAct(() => addGrowthEdge(from, to))) linkQuery.value = "";
}
const unlink = (edge) => growthAct(() => deleteGrowthEdge(edge.id));
const skillOf = (l) => skillsById.value.get(l.skillId);
</script>

<template>
  <div class="glc" :style="{ '--c': color }">
    <header class="glc-head">
      <div class="glc-emoji">{{ level.emoji || "◆" }}</div>
      <div class="glc-titles">
        <div class="glc-skill">
          {{ skill?.emoji }} {{ skill?.title }} · уровень {{ level.maintenance ? "∞" : level.number }}
          <button v-if="skill" class="glc-skill-edit" title="Переименовать и настроить навык и его дисциплину"
            @click="emit('edit-skill', skill.id)">✎ навык</button>
        </div>
        <h3>{{ level.title }}</h3>
      </div>
      <button class="glc-x" title="Закрыть" @click="emit('close')">✕</button>
    </header>

    <div class="glc-chips">
      <span class="glc-chip" :class="`st-${level.status}`">{{ STATUS_TITLES[level.status] }}</span>
      <span v-if="!level.maintenance" class="glc-chip">
        {{ termText }}
        <b v-if="level.monthsLeft < 0" class="glc-over">просрочен</b>
      </span>
      <span class="glc-chip">{{ pct(level.progress) }}</span>
      <span v-if="level.hoursWeek" class="glc-chip">{{ level.hoursWeek.toFixed(1) }} ч за неделю</span>
    </div>
    <div class="glc-bar"><em :style="{ width: pct(level.progress) }" /></div>

    <div v-if="breakdown.length" class="glc-break">
      <span v-for="b in breakdown" :key="b.label" :class="{ full: b.done === b.total }">{{ b.label }} {{ b.done }}/{{ b.total }}</span>
    </div>
    <div v-if="nextStep" class="glc-next">
      <span class="glc-next-label">Следующий шаг</span>
      <span>{{ nextStep.icon }} {{ nextStep.text }}</span>
    </div>

    <p v-if="level.goal && !editing" class="glc-goal">🎯 {{ level.goal }}</p>
    <p v-if="level.description && !editing" class="glc-desc">{{ level.description }}</p>

    <div class="glc-actions">
      <button v-if="pickable" class="glc-btn primary" @click="emit('toggle-draft', level.id)">
        {{ inDraft ? "− Убрать из месяца" : "+ Взять в месяц" }}
      </button>
      <span class="glc-done">
        <button class="glc-btn" :class="{ ok: level.canComplete && level.status !== 'done' }" @click="complete">
          {{ level.status === "done" ? "Снять зачёт" : "✓ Засчитать" }}
        </button>
        <input v-if="level.status !== 'done'" v-model="doneDate" type="date" class="glc-date" :max="todayYmd()"
          title="Когда пройден — можно задним числом" />
      </span>
      <button class="glc-btn" @click="discOpen = !discOpen">Сделать дисциплинным</button>
      <button class="glc-btn" @click="createTasks">Задача месяца</button>
    </div>
    <div v-if="notice" class="glc-notice">{{ notice }}</div>

    <div v-if="discOpen" class="glc-form">
      <div class="glc-form-title">Строка в дисциплину этого месяца</div>
      <input v-model="disc.min" placeholder="Минимум (например, 15 минут)" />
      <input v-model="disc.mid" placeholder="Средний (можно пусто)" />
      <input v-model="disc.max" placeholder="Максимум (можно пусто)" />
      <button class="glc-btn primary" @click="makeDisciplined">Добавить</button>
    </div>

    <section v-if="isTravel" class="glc-sec glc-travel">
      <div class="glc-sec-head">
        <span>🧭 Поездка и места</span>
        <router-link v-if="placeOptions?.countryId" class="glc-link" :to="`/travel/countries/${placeOptions.countryId}`">
          {{ placeOptions.countryName }} в «Путешествиях» →
        </router-link>
      </div>
      <div class="glc-trip">
        <template v-if="level.trip">
          <router-link class="glc-trip-card" :to="`/travel/trips/${level.trip.id}`">
            <b>✈ {{ level.trip.title }}</b>
            <span>{{ tripWhen(level.trip) }}</span>
          </router-link>
          <button class="glc-link" @click="setTrip(null)">отвязать</button>
        </template>
        <template v-else>
          <select v-if="placeOptions?.trips?.length" class="glc-select" @change="setTrip($event.target.value)">
            <option value="">— привязать поездку —</option>
            <option v-for="t in placeOptions.trips" :key="t.id" :value="t.id">{{ t.title }} · {{ tripWhen(t) }}</option>
          </select>
          <span v-else class="glc-small">Поездок по стране пока нет — заведи её в «Путешествиях», и она появится здесь.</span>
        </template>
      </div>

      <div class="glc-small">Мест {{ level.places.length }}, посещено {{ visitedCount }}. Отметка «был» видна и в «Путешествиях».</div>
      <div v-for="p in level.places" :key="p.id" class="glc-row glc-place" :class="`ps-${p.status}`">
        <span class="glc-ps">{{ PLACE_STATUS[p.status]?.icon || "·" }}</span>
        <span class="glc-row-text" :class="{ done: p.status === 'visited' }">{{ p.title }}</span>
        <button class="glc-tag" :class="{ req: p.status === 'visited' }" title="Был здесь" @click="setPlaceStatus(p, 'visited')">был</button>
        <button class="glc-tag" title="Не получилось — выпадет из процента" @click="setPlaceStatus(p, 'skipped')">не вышло</button>
        <button class="glc-del" title="Убрать из уровня (в вишлисте останется)" @click="removePlace(p)">×</button>
      </div>
      <div class="glc-add">
        <input v-model="newPlace" :disabled="placeBusy" placeholder="Места через запятую: Фусими Инари, Сибуя Скай…" @keydown.enter="addPlaces" />
        <button class="glc-btn" :disabled="placeBusy" @click="addPlaces">+</button>
      </div>
      <button v-if="placeOptions?.wishes?.length" class="glc-link" @click="wishPicker = !wishPicker">
        {{ wishPicker ? "скрыть вишлист" : `выбрать из вишлиста страны (${placeOptions.wishes.length})` }}
      </button>
      <div v-if="wishPicker" class="glc-wishes">
        <label v-for="w in placeOptions.wishes" :key="w.id" class="glc-wish">
          <input type="checkbox" :checked="w.linked" :disabled="placeBusy" @change="toggleWish(w)" />
          <span :class="{ done: w.status === 'visited' }">{{ w.title }}</span>
          <small>{{ PLACE_STATUS[w.status]?.title }}</small>
        </label>
      </div>
    </section>

    <section class="glc-sec">
      <div class="glc-sec-head">
        <span>Критерии прохождения</span>
      </div>
      <div v-for="c in level.criteria" :key="c.id" class="glc-row">
        <input type="checkbox" :checked="c.done" @change="toggleCriterion(c)" />
        <span class="glc-row-text" :class="{ done: c.done }">{{ c.title }}</span>
        <button class="glc-tag" :class="{ req: c.required }" :title="c.required ? 'обязательный' : 'желательный'"
          @click="toggleRequired(c)">{{ c.required ? "обяз." : "жел." }}</button>
        <button class="glc-del" title="Удалить" @click="removeCriterion(c)">×</button>
      </div>
      <div class="glc-add">
        <input v-model="newCriterion" placeholder="Новый критерий" @keydown.enter="addCriterion" />
        <label class="glc-small"><input v-model="newRequired" type="checkbox" /> обяз.</label>
        <button class="glc-btn" @click="addCriterion">+</button>
      </div>
    </section>

    <section class="glc-sec">
      <div class="glc-sec-head">
        <span>Материалы</span>
        <span v-if="level.readsBooks" class="glc-small">чтение в дисциплине: {{ level.readPlan[0] }} / {{ level.readPlan[1] }} / {{ level.readPlan[2] }} стр.</span>
        <span v-else class="glc-small">строка «чтение» появится, когда привяжешь книгу из библиотеки</span>
      </div>
      <div v-for="m in level.materials" :key="m.id" class="glc-row">
        <span class="glc-kind">{{ KIND_ICONS[m.kind] || "•" }}</span>
        <span class="glc-row-text" :class="{ done: m.progress >= 1 }">
          {{ m.title }}<small v-if="m.author"> — {{ m.author }}</small>
          <small v-if="m.fromRoadmap" class="glc-rm"> · roadmap</small>
          <a v-if="m.pdfFileId" class="glc-read" :href="`/pdfReader?file=${m.pdfFileId}`">читать</a>
        </span>
        <template v-if="!m.fromRoadmap">
          <input v-if="m.total && !m.pdfFileId" class="glc-num" type="number" :value="m.current"
            :title="`из ${m.total}`" @change="setMaterialCurrent(m, $event.target.value)" />
          <span v-else-if="m.total" class="glc-small">{{ m.current }}/{{ m.total }}</span>
          <input type="checkbox" :checked="m.done" title="Пройдено" @change="toggleMaterial(m)" />
          <button class="glc-del" title="Удалить" @click="removeMaterial(m)">×</button>
        </template>
        <span v-else class="glc-small">{{ pct(m.progress) }}</span>
      </div>
      <button v-if="!matOpen" class="glc-link" @click="openMaterialForm">+ материал</button>
      <div v-else class="glc-form">
        <select v-model="mat.kind">
          <option v-for="[k, t] in KINDS" :key="k" :value="k">{{ t }}</option>
        </select>
        <select v-if="mat.kind === 'book'" v-model="mat.pdfFileId" @change="pickBook">
          <option value="">— книга не из библиотеки —</option>
          <option v-for="b in books" :key="b.id" :value="b.id">{{ b.title || b.filename }}</option>
        </select>
        <input v-model="mat.title" placeholder="Название" />
        <input v-model="mat.author" placeholder="Автор" />
        <input v-model="mat.url" placeholder="Ссылка" />
        <input v-if="!mat.pdfFileId" v-model="mat.total" type="number" placeholder="Страниц / глав (для прогресса)" />
        <div class="glc-row-btns">
          <button class="glc-btn primary" @click="addMaterial">Добавить</button>
          <button class="glc-btn" @click="matOpen = false">Отмена</button>
        </div>
      </div>
    </section>

    <section v-if="level.tasks.length" class="glc-sec">
      <div class="glc-sec-head"><span>Задачи с главной</span></div>
      <div v-for="t in level.tasks" :key="t.id" class="glc-row">
        <span class="glc-row-text" :class="{ done: t.done }">{{ t.title }}</span>
        <span class="glc-small">{{ t.subTotal ? `${t.subDone}/${t.subTotal}` : pct(t.progress) }}</span>
      </div>
    </section>

    <section class="glc-sec">
      <div class="glc-sec-head">
        <span>Связи</span>
        <button class="glc-link" @click="linkOpen = !linkOpen">{{ linkOpen ? "готово" : "+ связать" }}</button>
      </div>
      <div v-if="!incoming.length && !outgoing.length" class="glc-small">Стрелок нет: уровень стоит отдельно.</div>
      <div v-for="x in incoming" :key="x.edge.id" class="glc-row">
        <span class="glc-kind" title="До этого уровня">⬅</span>
        <span class="glc-row-text" :class="{ done: x.other.status === 'done' }">
          {{ x.other.title }}<small> — {{ skillOf(x.other)?.emoji }} {{ skillOf(x.other)?.title }}</small>
        </span>
        <button class="glc-del" title="Убрать стрелку" @click="unlink(x.edge)">×</button>
      </div>
      <div v-for="x in outgoing" :key="x.edge.id" class="glc-row">
        <span class="glc-kind" title="После этого уровня">➡</span>
        <span class="glc-row-text">
          {{ x.other.title }}<small> — {{ skillOf(x.other)?.emoji }} {{ skillOf(x.other)?.title }}</small>
        </span>
        <button class="glc-del" title="Убрать стрелку" @click="unlink(x.edge)">×</button>
      </div>
      <div v-if="linkOpen" class="glc-form">
        <div class="glc-row-btns">
          <select v-model="linkDir" class="glc-select">
            <option value="from">до этого уровня нужен…</option>
            <option value="to">после него открывается…</option>
          </select>
        </div>
        <input v-model="linkQuery" placeholder="Найти уровень в любом навыке (от 2 букв)" />
        <button v-for="l in linkResults" :key="l.id" class="glc-pickrow" @click="link(l)">
          {{ l.emoji }} {{ l.title }} <small>{{ skillOf(l)?.emoji }} {{ skillOf(l)?.title }} · {{ l.number }}</small>
        </button>
      </div>
    </section>

    <section class="glc-sec">
      <div class="glc-sec-head">
        <span>Уровень</span>
        <button v-if="!editing" class="glc-link" @click="startEdit">править</button>
      </div>
      <div v-if="editing" class="glc-form">
        <div class="glc-row-btns">
          <input v-model="form.emoji" class="glc-emoji-in" placeholder="🙂" />
          <input v-model="form.title" placeholder="Название" />
        </div>
        <input v-model="form.goal" placeholder="Цель — что умеешь после уровня" />
        <textarea v-model="form.description" rows="4" placeholder="Описание, заметки (markdown)" />
        <label class="glc-small">Срок, месяцев <input v-model="form.months" type="number" min="1" /></label>
        <div class="glc-small">Чтение, стр. в день (пусто — по остатку и сроку)</div>
        <div class="glc-row-btns">
          <input v-model="form.readMin" type="number" placeholder="мин" />
          <input v-model="form.readMid" type="number" placeholder="сред" />
          <input v-model="form.readMax" type="number" placeholder="макс" />
        </div>
        <div class="glc-row-btns">
          <button class="glc-btn primary" @click="saveEdit">Сохранить</button>
          <button class="glc-btn" @click="editing = false">Отмена</button>
        </div>
      </div>
      <div class="glc-row-btns">
        <button class="glc-btn" @click="addNext">+ следующий уровень</button>
        <button class="glc-btn danger" @click="removeLevel">Удалить уровень</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.glc {
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #e8eaf0;
}

.glc-break {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: #9aa0b0;
}

.glc-break span {
  padding: 2px 8px;
  border-radius: 999px;
  background: #1d1f28;
}

.glc-break span.full {
  color: #63c94f;
}

.glc-next {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 10px;
  border-left: 3px solid var(--c);
  background: color-mix(in srgb, var(--c) 10%, #171820);
  font-size: 14px;
}

.glc-next-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9aa0b0;
}

.glc-travel {
  border: 1px solid #2fbfa044;
  border-radius: 10px;
  padding: 8px 10px;
  background: #2fbfa00a;
}

.glc-trip {
  display: flex;
  align-items: center;
  gap: 8px;
}

.glc-trip-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #1d1f28;
  color: #e8eaf0;
  text-decoration: none;
  font-size: 13px;
}

.glc-trip-card span {
  color: #9aa0b0;
  font-size: 12px;
}

.glc-select {
  flex: 1;
  background: #1a1c24;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  color: #e8eaf0;
  padding: 5px 8px;
}

.glc-ps {
  width: 18px;
  text-align: center;
}

.glc-place.ps-skipped .glc-row-text {
  color: #7d8396;
  text-decoration: line-through;
}

.glc-wishes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 8px;
  background: #15161d;
}

.glc-wish {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  padding: 3px 4px;
  cursor: pointer;
}

.glc-wish small {
  color: #7d8396;
  font-size: 11px;
}

.glc-wish .done {
  color: #9aa0b0;
}

.glc-pickrow {
  text-align: left;
  background: #1d1f28;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  color: #e8eaf0;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 13px;
}

.glc-pickrow:hover {
  border-color: var(--c);
}

.glc-pickrow small {
  color: #9aa0b0;
}

.glc-skill-edit {
  margin-left: 6px;
  border: 1px solid #343746;
  background: #1d1f29;
  color: #c9ccdb;
  border-radius: 6px;
  padding: 1px 7px;
  font-size: 12px;
  cursor: pointer;
}
.glc-done {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.glc-date {
  background: #1d1f29;
  border: 1px solid #343746;
  color: #e8eaf0;
  border-radius: 7px;
  padding: 4px 6px;
  font: inherit;
  font-size: 13px;
  color-scheme: dark;
}
.glc-date-done {
  color: #8a8fa3;
}
.glc-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.glc-emoji {
  font-size: 28px;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--c) 20%, #1a1c24);
  border: 1px solid var(--c);
  flex: none;
}

.glc-titles {
  flex: 1;
  min-width: 0;
}

.glc-skill {
  font-size: 12px;
  color: #9aa0b0;
}

.glc-titles h3 {
  margin: 2px 0 0;
  font-size: 18px;
  line-height: 1.25;
}

.glc-x {
  background: none;
  border: 0;
  color: #9aa0b0;
  font-size: 18px;
  cursor: pointer;
}

.glc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.glc-chip {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 999px;
  background: #1f212b;
  border: 1px solid #2a2d38;
}

.glc-chip.st-active {
  border-color: var(--c);
  color: #fff;
}

.glc-chip.st-done {
  background: #63c94f26;
  border-color: #63c94f;
}

.glc-chip.st-empty {
  border-style: dashed;
}

.glc-over {
  color: #ff7a8a;
  margin-left: 4px;
}

.glc-bar {
  height: 5px;
  border-radius: 3px;
  background: #23252f;
  overflow: hidden;
}

.glc-bar em {
  display: block;
  height: 100%;
  background: var(--c);
}

.glc-goal,
.glc-desc {
  margin: 0;
  font-size: 13px;
  color: #c9cdda;
  white-space: pre-wrap;
}

.glc-actions,
.glc-row-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.glc-btn {
  border: 1px solid #2f3240;
  background: #1c1e27;
  color: #e8eaf0;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
}

.glc-btn.primary {
  background: #6e4aff;
  border-color: #6e4aff;
}

.glc-btn.ok {
  border-color: #63c94f;
  color: #8be07a;
}

.glc-btn.danger {
  color: #ff7a8a;
}

.glc-notice {
  font-size: 12px;
  color: #8be07a;
}

.glc-sec {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid #23252f;
}

.glc-sec-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9aa0b0;
}

.glc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.glc-row-text {
  flex: 1;
  min-width: 0;
}

.glc-row-text.done {
  color: #7d8396;
  text-decoration: line-through;
}

.glc-kind {
  width: 20px;
  text-align: center;
}

.glc-tag {
  font-size: 10px;
  border-radius: 6px;
  border: 1px solid #2f3240;
  background: none;
  color: #9aa0b0;
  cursor: pointer;
  padding: 1px 5px;
}

.glc-tag.req {
  color: #ffd666;
  border-color: #ffd66666;
}

.glc-del {
  background: none;
  border: 0;
  color: #6b7186;
  cursor: pointer;
  font-size: 16px;
}

.glc-add {
  display: flex;
  gap: 6px;
  align-items: center;
}

.glc-small {
  font-size: 11px;
  color: #9aa0b0;
  text-transform: none;
  letter-spacing: 0;
}

.glc-rm {
  color: #8fa8ff;
}

.glc-read {
  margin-left: 6px;
  font-size: 11px;
  color: #8fa8ff;
}

.glc-num {
  width: 58px;
}

.glc-link {
  background: none;
  border: 0;
  color: #8fa8ff;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  padding: 0;
  text-transform: none;
  letter-spacing: 0;
}

.glc-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 10px;
  background: #15161c;
  border: 1px solid #23252f;
}

.glc-form-title {
  font-size: 12px;
  color: #9aa0b0;
}

.glc input:not([type="checkbox"]),
.glc select,
.glc textarea {
  background: #1a1c24;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  color: #e8eaf0;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  min-width: 0;
  flex: 1;
}

.glc-emoji-in {
  max-width: 56px;
}
</style>
