<script setup>
import { ref, computed, watch } from "vue";
import {
  setDisciplineEntry,
  setDisciplineRest,
  setDisciplineDayNote,
} from "../api.js";

const props = defineProps({
  month: { type: Object, required: true },
  date: { type: String, required: true },
});
const emit = defineEmits(["changed"]);

const LEVEL_LABELS = { min: "Мин", mid: "Сред", max: "Макс" };
const LEVEL_ORDER = ["min", "mid", "max"];

const dayData = computed(() =>
  props.month?.days?.find((d) => d.date === props.date) || null,
);
const dayNum = computed(() => parseInt(props.date.slice(8), 10));

function isoWeekday(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const wd = d.getDay();
  return wd === 0 ? 7 : wd;
}

function activityScheduled(a) {
  if (!a.weekdays || !a.weekdays.trim()) return true;
  return a.weekdays
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .includes(isoWeekday(props.date));
}

function activityLevels(a) {
  const levels = [];
  if (a.minDesc) levels.push({ key: "min", desc: a.minDesc });
  if (a.midDesc) levels.push({ key: "mid", desc: a.midDesc });
  if (a.maxDesc) levels.push({ key: "max", desc: a.maxDesc });
  return levels;
}

function entryFor(activityId) {
  return dayData.value?.entries?.find((e) => e.activityId === activityId) || null;
}

function replacementActive(a) {
  if (!a.replacementText) return false;
  if (a.replacementFrom && props.date < a.replacementFrom) return false;
  if (a.replacementTo && props.date > a.replacementTo) return false;
  return true;
}

function parseVariants(a) {
  if (!a.variants) return [];
  try {
    const parsed = JSON.parse(a.variants);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const skillRows = computed(() => {
  if (!props.month?.skills) return [];
  const rows = props.month.skills.map((skill) => {
    const start = skill.startDay || 1;
    const end = skill.endDay || 31;
    const active = dayNum.value >= start && dayNum.value <= end;
    const rested = dayData.value?.rests?.some(
      (r) => r.learningSkillId === skill.learningSkillId,
    );
    const leveled = skill.activities.filter(
      (a) => !a.isCounter && activityLevels(a).length > 0 && activityScheduled(a),
    );
    const counters = skill.activities.filter((a) => a.isCounter);
    const adhocs =
      dayData.value?.entries?.filter(
        (e) => !e.activityId && e.adhocSkillId === skill.learningSkillId,
      ) || [];

    let closed = leveled.length > 0;
    for (const a of leveled) {
      const lv = entryFor(a.id)?.level || "";
      const need = a.midDesc ? "mid" : a.minDesc ? "min" : "";
      if (need && LEVEL_ORDER.indexOf(lv) < LEVEL_ORDER.indexOf(need)) {
        closed = false;
        break;
      }
    }
    const maxed = dayData.value?.maxedSkills?.includes(skill.learningSkillId);

    return { skill, active, rested, leveled, counters, adhocs, closed, maxed, start };
  });

  const visible = rows.filter((r) => r.leveled.length > 0 || r.counters.length > 0 || !r.active);
  return visible.sort((a, b) => {
    const rank = (r) => (!r.active ? 2 : r.closed || r.rested ? 1 : 0);
    return rank(a) - rank(b) || a.skill.position - b.skill.position;
  });
});

const busy = ref(false);
async function mutate(fn) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    emit("changed");
  } catch (e) {
    console.error("discipline mutate error", e);
    alert("Не удалось сохранить отметку — проверь соединение");
  } finally {
    busy.value = false;
  }
}

// клик по чипу — точный выбор уровня (повторный клик по активному — снять)
function setLevel(activity, levelKey) {
  const entry = entryFor(activity.id);
  const current = entry?.level || "";
  const next = current === levelKey ? "" : levelKey;
  mutate(() =>
    setDisciplineEntry({
      date: props.date,
      activityId: activity.id,
      level: next,
      variant: entry?.variant || null,
    }),
  );
}

// «⚡ весь минимум» — закрыть все неотмеченные мин-задачи разом
const unmarkedMin = computed(() => {
  const list = [];
  for (const row of skillRows.value) {
    if (!row.active || row.rested) continue;
    for (const a of row.leveled) {
      if (a.minDesc && !entryFor(a.id)) list.push(a);
    }
  }
  return list;
});

async function completeAllMin() {
  if (busy.value || !unmarkedMin.value.length) return;
  busy.value = true;
  try {
    for (const a of unmarkedMin.value) {
      await setDisciplineEntry({ date: props.date, activityId: a.id, level: "min" });
    }
    emit("changed");
  } catch (e) {
    console.error("discipline bulk error", e);
    alert("Не все отметки сохранились — обнови страницу");
    emit("changed");
  } finally {
    busy.value = false;
  }
}

function cycleLevel(activity) {
  const levels = activityLevels(activity).map((l) => l.key);
  const entry = entryFor(activity.id);
  const current = entry?.level || "";
  const idx = levels.indexOf(current);
  const next = idx === -1 ? levels[0] : idx + 1 < levels.length ? levels[idx + 1] : "";
  mutate(() =>
    setDisciplineEntry({
      date: props.date,
      activityId: activity.id,
      level: next,
      variant: entry?.variant || null,
    }),
  );
}

function setVariant(activity, variant) {
  const entry = entryFor(activity.id);
  if (!entry) return;
  mutate(() =>
    setDisciplineEntry({
      date: props.date,
      activityId: activity.id,
      level: entry.level,
      variant: variant || null,
    }),
  );
}

function toggleCounter(activity) {
  const entry = entryFor(activity.id);
  mutate(() =>
    setDisciplineEntry({
      date: props.date,
      activityId: activity.id,
      level: entry ? "" : "done",
    }),
  );
}

function toggleRest(row) {
  const summary = props.month?.summary;
  if (!row.rested && summary && summary.restUsed >= props.month.plan.restLimit) {
    if (
      !confirm(
        `Лимит отдыха (${props.month.plan.restLimit}) исчерпан. Взять сверх лимита? Это испортит вердикт месяца.`,
      )
    )
      return;
  }
  mutate(() =>
    setDisciplineRest({
      date: props.date,
      learningSkillId: row.skill.learningSkillId,
      remove: !!row.rested,
    }),
  );
}

function removeAdhoc(entry) {
  mutate(() => setDisciplineEntry({ id: entry.id, date: props.date, level: "" }));
}

// внеплановая активность
const adhocOpen = ref(false);
const adhocTitle = ref("");
const adhocSkillId = ref(null);
const adhocLevel = ref("max");
function addAdhoc() {
  if (!adhocTitle.value.trim() || !adhocSkillId.value) return;
  mutate(() =>
    setDisciplineEntry({
      date: props.date,
      adhocTitle: adhocTitle.value.trim(),
      adhocSkillId: adhocSkillId.value,
      level: adhocLevel.value,
    }),
  ).then(() => {
    adhocTitle.value = "";
    adhocOpen.value = false;
  });
}

// заметка к дню
const noteText = ref("");
watch(
  () => [props.date, dayData.value?.note],
  () => {
    noteText.value = dayData.value?.note || "";
  },
  { immediate: true },
);
function saveNote() {
  if ((dayData.value?.note || "") === noteText.value.trim()) return;
  mutate(() => setDisciplineDayNote({ date: props.date, note: noteText.value.trim() }));
}
</script>

<template>
  <div class="dsc-checklist" v-if="dayData">
    <button v-if="unmarkedMin.length > 1" class="dsc-bulk-min" :disabled="busy" @click="completeAllMin">
      ⚡ Закрыть весь минимум ({{ unmarkedMin.length }})
    </button>
    <div v-for="row in skillRows" :key="row.skill.planSkillId" class="dsc-skill"
      :class="{ 'dsc-skill-closed': row.closed || row.rested, 'dsc-skill-inactive': !row.active }">
      <div class="dsc-skill-head">
        <span class="dsc-skill-title" :style="{ color: row.skill.color || '#8ab4ff' }">
          {{ row.skill.icon }} {{ row.skill.title }}
          <span v-if="row.maxed" class="dsc-star" title="Макс по навыку">⭐</span>
        </span>
        <span v-if="row.skill.streak > 1" class="dsc-skill-streak" title="Стрик навыка">🔥{{ row.skill.streak }}</span>
        <button v-if="row.active" class="dsc-rest-btn" :class="{ 'dsc-rest-on': row.rested }"
          :title="row.rested ? 'Отменить отдых' : 'Взять отдых для навыка'" @click="toggleRest(row)">
          🌴
        </button>
      </div>

      <div v-if="!row.active" class="dsc-hint">
        активен с {{ row.start }} числа
      </div>
      <div v-else-if="row.rested" class="dsc-hint">🌴 Сегодня отдых от навыка</div>
      <template v-else>
        <div v-for="a in row.leveled" :key="a.id" class="dsc-activity" @click="cycleLevel(a)">
          <span class="dsc-a-emoji">{{ a.emoji }}</span>
          <span class="dsc-a-title" :class="{ 'dsc-a-done': entryFor(a.id) }">
            <template v-if="replacementActive(a)">🩹 {{ a.replacementText }}</template>
            <template v-else>{{ a.title }}</template>
          </span>
          <span class="dsc-a-levels">
            <span v-for="l in activityLevels(a)" :key="l.key" class="dsc-lvl" :class="[
              'dsc-lvl-' + l.key,
              { 'dsc-lvl-active': (entryFor(a.id)?.level || '') === l.key ||
                 LEVEL_ORDER.indexOf(entryFor(a.id)?.level || '') > LEVEL_ORDER.indexOf(l.key) },
            ]" :title="l.desc" @click.stop="setLevel(a, l.key)">
              {{ LEVEL_LABELS[l.key] }}
            </span>
          </span>
          <select v-if="parseVariants(a).length && entryFor(a.id)" class="dsc-variant" @click.stop
            :value="entryFor(a.id)?.variant || parseVariants(a)[0]"
            @change="setVariant(a, $event.target.value)">
            <option v-for="v in parseVariants(a)" :key="v" :value="v">{{ v }}</option>
          </select>
        </div>

        <div v-for="a in row.counters" :key="a.id" class="dsc-activity dsc-counter" @click="toggleCounter(a)">
          <span class="dsc-a-emoji">{{ a.emoji }}</span>
          <span class="dsc-a-title" :class="{ 'dsc-a-done': entryFor(a.id) }">{{ a.title }}</span>
          <span class="dsc-counter-progress">{{ a.counterDone }}/{{ a.counterGoal || "∞" }} за месяц</span>
          <span class="dsc-counter-check">{{ entryFor(a.id) ? "✅" : "☐" }}</span>
        </div>

        <div v-for="e in row.adhocs" :key="e.id" class="dsc-activity dsc-adhoc-row">
          <span class="dsc-a-emoji">✨</span>
          <span class="dsc-a-title dsc-a-done">{{ e.adhocTitle }}</span>
          <span class="dsc-lvl dsc-lvl-active" :class="'dsc-lvl-' + e.level">{{ LEVEL_LABELS[e.level] }}</span>
          <button class="dsc-x" title="Удалить" @click="removeAdhoc(e)">✕</button>
        </div>
      </template>
    </div>

    <div class="dsc-adhoc">
      <button v-if="!adhocOpen" class="dsc-adhoc-toggle" @click="adhocOpen = true">+ сверх плана</button>
      <div v-else class="dsc-adhoc-form">
        <input v-model="adhocTitle" placeholder="Что сделал" class="dsc-input" />
        <div class="dsc-adhoc-row2">
          <select v-model="adhocSkillId" class="dsc-input">
            <option :value="null" disabled>Навык</option>
            <option v-for="s in month.skills" :key="s.learningSkillId" :value="s.learningSkillId">
              {{ s.icon }} {{ s.title }}
            </option>
          </select>
          <select v-model="adhocLevel" class="dsc-input dsc-input-narrow">
            <option value="min">Мин</option>
            <option value="mid">Сред</option>
            <option value="max">Макс</option>
          </select>
          <button class="dsc-adhoc-add" @click="addAdhoc">✓</button>
          <button class="dsc-x" @click="adhocOpen = false">✕</button>
        </div>
      </div>
    </div>

    <input v-model="noteText" class="dsc-input dsc-note" placeholder="Заметка к дню…" @blur="saveNote"
      @keydown.enter="$event.target.blur()" />
  </div>
</template>

<style scoped>
.dsc-checklist {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsc-bulk-min {
  background: #4d3f12;
  border: 1px solid #ffd666;
  color: #ffd666;
  border-radius: 8px;
  padding: 7px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  min-height: 34px;
}

.dsc-bulk-min:hover:not(:disabled) {
  background: #5d4c16;
}

.dsc-bulk-min:disabled {
  opacity: 0.5;
  cursor: default;
}

.dsc-lvl {
  cursor: pointer;
}

.dsc-skill {
  background: #1e2027;
  border: 1px solid #2a2d38;
  border-radius: 10px;
  padding: 8px 10px;
}

.dsc-skill-closed {
  opacity: 0.65;
}

.dsc-skill-inactive {
  opacity: 0.4;
}

.dsc-skill-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.dsc-skill-title {
  font-weight: 600;
  font-size: 13px;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsc-star {
  margin-left: 2px;
}

.dsc-skill-streak {
  font-size: 11px;
  color: #ffab5e;
}

.dsc-rest-btn {
  background: transparent;
  border: 1px solid #2a2d38;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  min-height: 26px;
  opacity: 0.6;
}

.dsc-rest-btn:hover {
  opacity: 1;
  border-color: #4ecdc4;
}

.dsc-rest-on {
  opacity: 1;
  background: #14343d;
  border-color: #4ecdc4;
}

.dsc-hint {
  font-size: 12px;
  color: #7a7f8e;
  padding: 2px 0 4px;
}

.dsc-activity {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 4px;
  border-radius: 7px;
  cursor: pointer;
  min-height: 34px;
  user-select: none;
}

.dsc-activity:hover {
  background: #24273180;
}

.dsc-a-emoji {
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.dsc-a-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #cfd3e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsc-a-done {
  color: #8f95a6;
}

.dsc-a-levels {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.dsc-lvl {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid #333748;
  color: #6c7284;
}

.dsc-lvl-active.dsc-lvl-min {
  background: #4d3f12;
  border-color: #ffd666;
  color: #ffd666;
}

.dsc-lvl-active.dsc-lvl-mid {
  background: #14391f;
  border-color: #95de64;
  color: #95de64;
}

.dsc-lvl-active.dsc-lvl-max {
  background: #2a2060;
  border-color: #b37feb;
  color: #b37feb;
}

.dsc-variant {
  background: #242731;
  color: #cfd3e0;
  border: 1px solid #333748;
  border-radius: 6px;
  font-size: 11px;
  max-width: 110px;
  padding: 2px 4px;
}

.dsc-counter-progress {
  font-size: 11px;
  color: #7a7f8e;
  flex-shrink: 0;
}

.dsc-counter-check {
  flex-shrink: 0;
}

.dsc-adhoc-toggle {
  background: transparent;
  border: 1px dashed #333748;
  color: #7a7f8e;
  border-radius: 8px;
  padding: 6px;
  width: 100%;
  cursor: pointer;
  font-size: 12px;
  min-height: 34px;
}

.dsc-adhoc-toggle:hover {
  color: #b37feb;
  border-color: #b37feb;
}

.dsc-adhoc-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsc-adhoc-row2 {
  display: flex;
  gap: 6px;
  align-items: center;
}

.dsc-input {
  background: #242731;
  border: 1px solid #333748;
  border-radius: 7px;
  color: #e8eaf2;
  padding: 6px 8px;
  font-size: 13px;
  min-width: 0;
  flex: 1;
}

.dsc-input-narrow {
  flex: 0 0 70px;
}

.dsc-adhoc-add {
  background: #1767fd;
  border: none;
  color: white;
  border-radius: 7px;
  padding: 6px 10px;
  cursor: pointer;
  min-height: 32px;
}

.dsc-x {
  background: transparent;
  border: none;
  color: #7a7f8e;
  cursor: pointer;
  font-size: 12px;
  padding: 4px;
}

.dsc-x:hover {
  color: #ff7875;
}

.dsc-note {
  font-size: 12px;
}

@media (max-width: 768px) {
  .dsc-activity {
    min-height: 42px;
  }

  .dsc-input {
    font-size: 16px;
  }
}
</style>
