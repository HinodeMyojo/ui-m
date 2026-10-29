<script setup>
// Карточка уровня в панели «Я»: цель и срок, критерии, материалы, задачи,
// зачёт, «сделать дисциплинным», правка. docs/me-module.md (back-m)
import { computed, ref, watch } from "vue";
import confetti from "@/composables/useConfetti.js";
import {
  addGrowthCriterion,
  addGrowthMaterial,
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
import { growthAct, levelColor, skillsById, STATUS_TITLES } from "@/composables/useGrowth.js";

const props = defineProps({
  level: { type: Object, required: true },
  inDraft: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "toggle-draft", "select"]);

const skill = computed(() => skillsById.value.get(props.level.skillId));
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
async function complete() {
  const undo = props.level.status === "done";
  if (!undo && !props.level.canComplete && !confirm("Не все обязательные критерии закрыты. Засчитать всё равно?")) return;
  if (await growthAct(() => completeGrowthLevel(props.level.id, undo))) {
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
</script>

<template>
  <div class="glc" :style="{ '--c': color }">
    <header class="glc-head">
      <div class="glc-emoji">{{ level.emoji || "◆" }}</div>
      <div class="glc-titles">
        <div class="glc-skill">{{ skill?.emoji }} {{ skill?.title }} · уровень {{ level.maintenance ? "∞" : level.number }}</div>
        <h3>{{ level.title }}</h3>
      </div>
      <button class="glc-x" title="Закрыть" @click="emit('close')">✕</button>
    </header>

    <div class="glc-chips">
      <span class="glc-chip" :class="`st-${level.status}`">{{ STATUS_TITLES[level.status] }}</span>
      <span v-if="!level.maintenance" class="glc-chip">
        срок {{ level.months }} мес · прошло {{ level.monthsUsed }}
        <b v-if="level.monthsLeft < 0" class="glc-over">просрочен</b>
      </span>
      <span class="glc-chip">{{ pct(level.progress) }}</span>
      <span v-if="level.hoursWeek" class="glc-chip">{{ level.hoursWeek.toFixed(1) }} ч за неделю</span>
    </div>
    <div class="glc-bar"><em :style="{ width: pct(level.progress) }" /></div>

    <p v-if="level.goal && !editing" class="glc-goal">🎯 {{ level.goal }}</p>
    <p v-if="level.description && !editing" class="glc-desc">{{ level.description }}</p>

    <div class="glc-actions">
      <button v-if="pickable" class="glc-btn primary" @click="emit('toggle-draft', level.id)">
        {{ inDraft ? "− Убрать из месяца" : "+ Взять в месяц" }}
      </button>
      <button class="glc-btn" :class="{ ok: level.canComplete && level.status !== 'done' }" @click="complete">
        {{ level.status === "done" ? "Снять зачёт" : "✓ Засчитать" }}
      </button>
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
