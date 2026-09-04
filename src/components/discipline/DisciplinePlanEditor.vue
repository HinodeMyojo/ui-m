<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
  fetchDisciplineMonth,
  disciplineLogicalToday,
  updateDisciplinePlan,
  createDisciplineActivity,
  updateDisciplineActivity,
  deleteDisciplineActivity,
  addDisciplinePlanSkill,
  updateDisciplinePlanSkill,
  deleteDisciplinePlanSkill,
  fetchLearningSkills,
} from "../api.js";

// Контролируемый режим: передан month → редактируем его, наружу emit('changed').
// Автономный режим (без пропса): сам грузит текущий месяц.
const props = defineProps({
  month: { type: Object, default: null },
});
const emit = defineEmits(["changed"]);

const ownMonth = ref(null);
const ownError = ref("");
const month = computed(() => props.month || ownMonth.value);
const plan = computed(() => month.value?.plan);

async function ownLoad() {
  if (props.month) return;
  const today = disciplineLogicalToday();
  try {
    ownMonth.value = await fetchDisciplineMonth(
      parseInt(today.slice(5, 7), 10),
      parseInt(today.slice(0, 4), 10),
    );
    ownError.value = "";
  } catch (e) {
    ownError.value = e.message || "не удалось загрузить план";
  }
}

async function changed() {
  await ownLoad();
  emit("changed");
}

onMounted(() => {
  ownLoad();
  loadAllSkills();
});

const allSkills = ref([]);
async function loadAllSkills() {
  try {
    allSkills.value = await fetchLearningSkills();
  } catch { /* не критично */ }
}

const availableSkills = computed(() =>
  allSkills.value.filter(
    (s) => !month.value?.skills?.some((ps) => ps.learningSkillId === s.id),
  ),
);
const addSkillId = ref(null);

// --- Квоты ---

const quotaForm = ref({ medTarget: 15, maxTarget: 8, restLimit: 3, trackStartDay: 1 });
watch(
  plan,
  (p) => {
    if (!p) return;
    quotaForm.value = {
      medTarget: p.medTarget,
      maxTarget: p.maxTarget,
      restLimit: p.restLimit,
      trackStartDay: p.trackStartDay,
    };
  },
  { immediate: true },
);

async function saveQuotas() {
  await updateDisciplinePlan(plan.value.id, {
    medTarget: Number(quotaForm.value.medTarget),
    maxTarget: Number(quotaForm.value.maxTarget),
    restLimit: Number(quotaForm.value.restLimit),
    trackStartDay: Number(quotaForm.value.trackStartDay),
  });
  await changed();
}

// --- Навыки плана ---

async function addSkillToPlan() {
  if (!addSkillId.value) return;
  await addDisciplinePlanSkill({
    planId: plan.value.id,
    learningSkillId: addSkillId.value,
    position: month.value.skills.length,
  });
  addSkillId.value = null;
  await changed();
}

async function removeSkillFromPlan(ps) {
  if (!confirm(`Убрать «${ps.title}» из плана месяца?`)) return;
  await deleteDisciplinePlanSkill(ps.planSkillId);
  await changed();
}

async function moveSkill(ps, delta) {
  const skills = [...month.value.skills].sort((a, b) => a.position - b.position);
  const idx = skills.findIndex((s) => s.planSkillId === ps.planSkillId);
  const other = skills[idx + delta];
  if (!other) return;
  await updateDisciplinePlanSkill(ps.planSkillId, {
    position: other.position, startDay: ps.startDay, endDay: ps.endDay,
  });
  await updateDisciplinePlanSkill(other.planSkillId, {
    position: ps.position, startDay: other.startDay, endDay: other.endDay,
  });
  await changed();
}

async function saveSkillDates(ps) {
  await updateDisciplinePlanSkill(ps.planSkillId, {
    position: ps.position,
    startDay: ps.startDay ? Number(ps.startDay) : null,
    endDay: ps.endDay ? Number(ps.endDay) : null,
  });
  await changed();
}

// --- Модалка активности ---

const activityModal = ref(null);
const WEEKDAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function emptyActivityForm(skillId) {
  return {
    id: null, learningSkillId: skillId, title: "", emoji: "", position: 0,
    isCounter: false, counterGoal: 8, minDesc: "", midDesc: "", maxDesc: "",
    weekdaySet: [1, 2, 3, 4, 5, 6, 7], variantsText: "",
    replacementText: "", replacementFrom: "", replacementTo: "",
  };
}

function openActivityModal(skillId, activity) {
  if (!activity) {
    const skill = month.value.skills.find((s) => s.learningSkillId === skillId);
    const form = emptyActivityForm(skillId);
    form.position = skill ? skill.activities.length : 0;
    activityModal.value = form;
    return;
  }
  let variants = [];
  try { variants = JSON.parse(activity.variants || "[]"); } catch { variants = []; }
  activityModal.value = {
    id: activity.id,
    learningSkillId: activity.learningSkillId,
    title: activity.title,
    emoji: activity.emoji,
    position: activity.position,
    isCounter: activity.isCounter,
    counterGoal: activity.counterGoal || 8,
    minDesc: activity.minDesc || "",
    midDesc: activity.midDesc || "",
    maxDesc: activity.maxDesc || "",
    weekdaySet: activity.weekdays && activity.weekdays.trim()
      ? activity.weekdays.split(",").map((s) => parseInt(s.trim(), 10))
      : [1, 2, 3, 4, 5, 6, 7],
    variantsText: variants.join(", "),
    replacementText: activity.replacementText || "",
    replacementFrom: activity.replacementFrom || "",
    replacementTo: activity.replacementTo || "",
  };
}

function toggleWeekday(n) {
  const set = activityModal.value.weekdaySet;
  const idx = set.indexOf(n);
  if (idx === -1) set.push(n);
  else if (set.length > 1) set.splice(idx, 1);
}

async function saveActivity() {
  const f = activityModal.value;
  if (!f.title.trim()) return;
  const weekdays = f.weekdaySet.length === 7 ? null : [...f.weekdaySet].sort().join(",");
  const variants = f.variantsText.trim()
    ? JSON.stringify(f.variantsText.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
  const payload = {
    title: f.title.trim(),
    emoji: f.emoji,
    position: f.position,
    isCounter: f.isCounter,
    counterGoal: f.isCounter ? Number(f.counterGoal) : null,
    minDesc: !f.isCounter && f.minDesc.trim() ? f.minDesc.trim() : null,
    midDesc: !f.isCounter && f.midDesc.trim() ? f.midDesc.trim() : null,
    maxDesc: !f.isCounter && f.maxDesc.trim() ? f.maxDesc.trim() : null,
    weekdays,
    variants,
    replacementText: f.replacementText.trim() || null,
    replacementFrom: f.replacementFrom || null,
    replacementTo: f.replacementTo || null,
  };
  if (f.id) {
    await updateDisciplineActivity(f.id, payload);
  } else {
    await createDisciplineActivity({
      ...payload,
      planId: plan.value.id,
      learningSkillId: f.learningSkillId,
    });
  }
  activityModal.value = null;
  await changed();
}

// Уровни дня. Пользователь думает не «у активности есть минимум», а «что
// будет в минимальном дне», — поэтому у плана два вида: по навыкам и по
// уровням. Второй показывает три списка и правится на месте.
const LEVELS = [
  { key: "minDesc", title: "Минимум", hint: "обязателен каждый день" },
  { key: "midDesc", title: "Средний", hint: "желателен, по квоте месяца" },
  { key: "maxDesc", title: "Максимум", hint: "по силам, по квоте месяца" },
];

const planView = ref(localStorage.getItem("disciplinePlanView") || "skills");

function selectView(view) {
  planView.value = view;
  localStorage.setItem("disciplinePlanView", view);
}

// Все активности плана одной лентой: в разрезе уровней навык — это подпись,
// а не заголовок.
const allActivities = computed(() => {
  const out = [];
  for (const skill of month.value?.skills || []) {
    for (const activity of skill.activities || []) {
      // Счётчики живут вне уровней: они не влияют на статус дня.
      if (!activity.isCounter) out.push({ skill, activity });
    }
  }
  return out;
});

function levelCount(key) {
  return allActivities.value.filter((row) => row.activity[key]).length;
}

// Сначала то, что в уровень входит, потом остальное. Иначе состав уровня
// приходится вылавливать глазами среди трёх десятков пустых строк.
function levelRows(key) {
  const inLevel = allActivities.value.filter((row) => row.activity[key]);
  const rest = allActivities.value.filter((row) => !row.activity[key]);
  return [...inLevel, ...rest];
}

// Правка уровня прямо в списке. Пустая строка означает «в этот уровень
// активность не входит» — так же, как в модалке.
async function setLevel(activity, key, value) {
  const next = value.trim() || null;
  if ((activity[key] || null) === next) return;

  activity[key] = next;
  await updateDisciplineActivity(activity.id, {
    title: activity.title,
    emoji: activity.emoji,
    position: activity.position,
    isCounter: activity.isCounter,
    counterGoal: activity.counterGoal,
    minDesc: activity.minDesc || null,
    midDesc: activity.midDesc || null,
    maxDesc: activity.maxDesc || null,
    weekdays: activity.weekdays || null,
    variants: activity.variants || null,
    replacementText: activity.replacementText || null,
    replacementFrom: activity.replacementFrom || null,
    replacementTo: activity.replacementTo || null,
  });
  await changed();
}

async function removeActivity() {
  const f = activityModal.value;
  if (!f.id) return;
  if (!confirm(`Удалить активность «${f.title}»? История отметок сохранится.`)) return;
  await deleteDisciplineActivity(f.id);
  activityModal.value = null;
  await changed();
}
</script>

<template>
  <div class="dpe" v-if="month">
    <div class="dpe-section-title">Квоты месяца</div>
    <div class="dpe-quota-form">
      <label>Средних <input type="number" v-model="quotaForm.medTarget" min="0" max="31" /></label>
      <label>Макс <input type="number" v-model="quotaForm.maxTarget" min="0" max="31" /></label>
      <label>Отдых <input type="number" v-model="quotaForm.restLimit" min="0" max="31" /></label>
      <label>Учёт с <input type="number" v-model="quotaForm.trackStartDay" min="1" max="31" /></label>
      <button class="dpe-btn dpe-btn-primary" @click="saveQuotas">Сохранить</button>
    </div>

    <div class="dpe-section-head">
      <div class="dpe-section-title">Навыки и активности</div>
      <div class="dpe-view">
        <button
          class="dpe-btn dpe-btn-sm"
          :class="{ 'dpe-btn-primary': planView === 'skills' }"
          @click="selectView('skills')"
        >
          По навыкам
        </button>
        <button
          class="dpe-btn dpe-btn-sm"
          :class="{ 'dpe-btn-primary': planView === 'levels' }"
          @click="selectView('levels')"
        >
          По уровням
        </button>
      </div>
    </div>

    <!-- Вид по уровням: что именно считается минимумом, средним и максимумом.
         Правится на месте — пустое поле значит «в этот уровень не входит». -->
    <template v-if="planView === 'levels'">
      <div v-for="lvl in LEVELS" :key="lvl.key" class="dpe-level">
        <div class="dpe-level-head">
          <b>{{ lvl.title }}</b>
          <span class="dpe-muted">{{ lvl.hint }} · активностей {{ levelCount(lvl.key) }}</span>
        </div>
        <div v-for="row in levelRows(lvl.key)" :key="row.activity.id" class="dpe-level-row">
          <span class="dpe-level-skill" :style="{ color: row.skill.color || '#8ab4ff' }">
            {{ row.skill.icon }}
          </span>
          <span class="dpe-level-title">{{ row.activity.emoji }} {{ row.activity.title }}</span>
          <input
            class="dpe-input dpe-level-input"
            :class="{ 'dpe-level-off': !row.activity[lvl.key] }"
            :value="row.activity[lvl.key] || ''"
            placeholder="не входит — впиши, что считается"
            @change="setLevel(row.activity, lvl.key, $event.target.value)"
          />
        </div>
        <div v-if="!allActivities.length" class="dpe-muted">Нет активностей в плане</div>
      </div>
    </template>

    <div v-for="s in month.skills" v-show="planView === 'skills'" :key="s.planSkillId" class="dpe-skill">
      <div class="dpe-skill-head">
        <b :style="{ color: s.color || '#8ab4ff' }">{{ s.icon }} {{ s.title }}</b>
        <label class="dpe-inline">с <input type="number" min="1" max="31" :value="s.startDay"
            @change="s.startDay = $event.target.value; saveSkillDates(s)" placeholder="1" /></label>
        <label class="dpe-inline">по <input type="number" min="1" max="31" :value="s.endDay"
            @change="s.endDay = $event.target.value; saveSkillDates(s)" placeholder="31" /></label>
        <button class="dpe-btn" @click="moveSkill(s, -1)">▲</button>
        <button class="dpe-btn" @click="moveSkill(s, 1)">▼</button>
        <button class="dpe-btn dpe-btn-danger" @click="removeSkillFromPlan(s)">✕</button>
      </div>
      <div class="dpe-activities">
        <!-- Плашка открывает карточку активности. Уровни подписаны прямо на
             ней: без этого план читался как список названий, а чем именно
             отличается минимум от среднего, приходилось вспоминать. -->
        <button v-for="a in s.activities" :key="a.id" class="dpe-chip" @click="openActivityModal(s.learningSkillId, a)">
          {{ a.emoji }} {{ a.title }}
          <i v-if="a.isCounter">· счётчик {{ a.counterGoal }}</i>
          <i v-else class="dpe-chip-levels">
            <span v-if="a.minDesc">мин: {{ a.minDesc }}</span>
            <span v-if="a.midDesc">сред: {{ a.midDesc }}</span>
            <span v-if="a.maxDesc">макс: {{ a.maxDesc }}</span>
            <span v-if="!a.minDesc && !a.midDesc && !a.maxDesc">уровни не заданы</span>
          </i>
          <b class="dpe-chip-edit">✎</b>
        </button>
        <button class="dpe-chip dpe-chip-add" @click="openActivityModal(s.learningSkillId, null)">+ активность</button>
      </div>
    </div>

    <div class="dpe-add-skill" v-if="availableSkills.length">
      <select v-model="addSkillId" class="dpe-input">
        <option :value="null" disabled>Добавить навык в план…</option>
        <option v-for="s in availableSkills" :key="s.id" :value="s.id">{{ s.icon }} {{ s.title }}</option>
      </select>
      <button class="dpe-btn dpe-btn-primary" @click="addSkillToPlan">Добавить</button>
    </div>

    <!-- Модалка активности -->
    <div v-if="activityModal" class="dpe-overlay" @click.self="activityModal = null">
      <div class="dpe-modal">
        <div class="dpe-modal-head">
          <b>{{ activityModal.id ? "Активность" : "Новая активность" }}</b>
          <button class="dpe-btn" @click="activityModal = null">✕</button>
        </div>
        <div class="dpe-modal-body dpe-form">
          <div class="dpe-form-row">
            <input v-model="activityModal.emoji" class="dpe-input dpe-input-emoji" placeholder="🙂" />
            <input v-model="activityModal.title" class="dpe-input" placeholder="Название" />
          </div>
          <label class="dpe-check">
            <input type="checkbox" v-model="activityModal.isCounter" />
            Счётчик (не влияет на статусы дня)
          </label>
          <template v-if="activityModal.isCounter">
            <label class="dpe-inline">Цель в месяц
              <input type="number" v-model="activityModal.counterGoal" min="1" max="31" />
            </label>
          </template>
          <template v-else>
            <label>Минимум <input v-model="activityModal.minDesc" class="dpe-input" placeholder="например: 1 глава (пусто — уровня нет)" /></label>
            <label>Средний <input v-model="activityModal.midDesc" class="dpe-input" placeholder="например: 2 главы" /></label>
            <label>Максимум <input v-model="activityModal.maxDesc" class="dpe-input" placeholder="например: 5 км" /></label>
            <div class="dpe-weekdays">
              <button v-for="(name, i) in WEEKDAY_NAMES" :key="i" class="dpe-wd"
                :class="{ 'dpe-wd-on': activityModal.weekdaySet.includes(i + 1) }" @click="toggleWeekday(i + 1)">
                {{ name }}
              </button>
            </div>
            <label>Варианты выполнения (через запятую)
              <input v-model="activityModal.variantsText" class="dpe-input" placeholder="🏃 Бег, 🚴 Вело, 🚶 Шаги" />
            </label>
            <div class="dpe-section-title">🩹 Замена по травме</div>
            <label>Чем заменено <input v-model="activityModal.replacementText" class="dpe-input" placeholder="например: планка вместо турника" /></label>
            <div class="dpe-form-row">
              <label>С <input type="date" v-model="activityModal.replacementFrom" class="dpe-input" /></label>
              <label>По <input type="date" v-model="activityModal.replacementTo" class="dpe-input" /></label>
            </div>
          </template>
          <div class="dpe-form-actions">
            <button v-if="activityModal.id" class="dpe-btn dpe-btn-danger" @click="removeActivity">Удалить</button>
            <span class="dpe-spacer"></span>
            <button class="dpe-btn dpe-btn-primary" @click="saveActivity">Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="ownError" class="dpe-error">{{ ownError }}</div>
  <div v-else class="dpe-error">Загрузка плана…</div>
</template>

<style scoped>
.dpe {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #e8eaf2;
}

.dpe-error {
  color: #7a7f8e;
  font-size: 13px;
  padding: 10px 0;
}

.dpe-section-title {
  font-size: 13px;
  font-weight: 700;
  color: #9aa0b0;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.dpe-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.dpe-view {
  display: flex;
  gap: 6px;
}

/* Вид по уровням: три списка, в каждом видно, что именно считается этим
   уровнем у каждой активности. */
.dpe-level {
  border: 1px solid #262b36;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #1b1e27;
}

.dpe-level-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.dpe-level-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.dpe-level-skill {
  flex: 0 0 22px;
  text-align: center;
}

.dpe-level-title {
  flex: 1 1 40%;
  min-width: 120px;
  font-size: 13px;
  color: #cfd3e0;
}

.dpe-level-input {
  flex: 1 1 45%;
  min-width: 120px;
}

/* Пустое поле выглядит выключенным: так с одного взгляда видно, из чего
   уровень состоит, а из чего нет. */
.dpe-level-off {
  opacity: 0.45;
}

.dpe-muted {
  font-size: 12px;
  color: #7a7f8e;
}

/* Уровни на плашке: каждый со своей строкой, иначе «мин·сред·макс» читается
   как набор меток, а не как содержание плана. */
.dpe-chip-levels {
  display: block;
  margin-top: 2px;
}

.dpe-chip-levels span {
  display: block;
  font-style: normal;
}

.dpe-chip-edit {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 11px;
  color: #4a4e5a;
  font-weight: 400;
}

.dpe-btn {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  min-height: 34px;
}

.dpe-btn:hover {
  border-color: #6e4aff;
}

.dpe-btn-primary {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  color: white;
}

.dpe-btn-danger {
  border-color: #a33;
  color: #ff7875;
}

.dpe-quota-form {
  display: flex;
  gap: 14px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.dpe-quota-form label,
.dpe-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #9aa0b0;
}

.dpe-inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.dpe-quota-form input,
.dpe-inline input {
  background: #242731;
  border: 1px solid #333748;
  border-radius: 7px;
  color: #e8eaf2;
  padding: 6px 8px;
  width: 72px;
  font-size: 13px;
}

.dpe-skill {
  background: #1e2027;
  border: 1px solid #2a2d38;
  border-radius: 10px;
  padding: 10px 12px;
}

.dpe-skill-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dpe-skill-head b {
  flex: 1;
  min-width: 120px;
}

.dpe-activities {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.dpe-chip {
  position: relative;
  background: #242731;
  border: 1px solid #333748;
  border-radius: 8px;
  color: #cfd3e0;
  padding: 5px 20px 6px 10px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  min-height: 32px;
}

.dpe-chip:hover {
  border-color: #4a5068;
}

.dpe-chip i {
  color: #7a7f8e;
  font-style: normal;
  font-size: 10px;
  margin-left: 4px;
}

.dpe-chip:hover {
  border-color: #6e4aff;
}

.dpe-chip-add {
  border-style: dashed;
  color: #7a7f8e;
}

.dpe-add-skill {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dpe-input {
  background: #242731;
  border: 1px solid #333748;
  border-radius: 7px;
  color: #e8eaf2;
  padding: 7px 9px;
  font-size: 13px;
  min-width: 0;
  flex: 1;
}

.dpe-input-emoji {
  width: 54px;
  flex: 0 0 54px;
  text-align: center;
}

.dpe-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dpe-modal {
  background: #191b21;
  border: 1px solid #2a2d38;
  border-radius: 14px;
  width: min(460px, 94vw);
  max-height: 88dvh;
  display: flex;
  flex-direction: column;
}

.dpe-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #262933;
}

.dpe-modal-body {
  padding: 14px;
  overflow-y: auto;
}

.dpe-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dpe-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #9aa0b0;
}

.dpe-form-row {
  display: flex;
  gap: 8px;
}

.dpe-form-row > * {
  flex: 1;
}

.dpe-check {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
  font-size: 13px !important;
}

.dpe-weekdays {
  display: flex;
  gap: 5px;
}

.dpe-wd {
  flex: 1;
  background: #242731;
  border: 1px solid #333748;
  color: #7a7f8e;
  border-radius: 7px;
  padding: 6px 0;
  cursor: pointer;
  font-size: 12px;
  min-height: 32px;
}

.dpe-wd-on {
  background: #2a2060;
  border-color: #6e4aff;
  color: #e8eaf2;
}

.dpe-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.dpe-spacer {
  flex: 1;
}

@media (max-width: 768px) {
  .dpe-input,
  .dpe-quota-form input,
  .dpe-inline input {
    font-size: 16px;
  }

  .dpe-modal {
    width: 100vw;
    max-height: 92dvh;
    border-radius: 18px 18px 0 0;
    align-self: flex-end;
  }

  .dpe-overlay {
    align-items: flex-end;
  }
}
</style>
