<script setup>
import { ref, computed, watch, onMounted } from "vue";
import confetti from "canvas-confetti";
import { fetchTasks, fetchGlobalTasks, checkTask, createWorkItem } from "@/components/api.js";
import { AUTUMN_COLORS } from "@/composables/useAutumn.js";

// Задачи с главного экрана прямо в дне. Это другая сущность, чем карточки дня:
// у неё свой срок в несколько дней и свои подзадачи, поэтому она живёт в
// отдельной колонке, а не притворяется карточкой. Отсюда её можно закрыть —
// или одним нажатием превратить в карточку сегодняшнего дня.

const props = defineProps({
  date: { type: String, required: true },
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(["added"]);

const tasks = ref([]);
const loading = ref(true);
const error = ref("");
const expanded = ref(new Set());
const showDone = ref(false);
const busy = ref(new Set());

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const at = new Date(props.date + "T12:00:00");
    const [monthly, global] = await Promise.all([
      fetchTasks({ value: at }).catch(() => []),
      fetchGlobalTasks().catch(() => []),
    ]);
    const byId = new Map();
    for (const t of [...(monthly || []), ...(global || [])]) {
      if (t && !byId.has(t.id)) byId.set(t.id, t);
    }
    tasks.value = Array.from(byId.values());
  } catch (e) {
    error.value = e.message || "не удалось загрузить задачи";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.date, load);

// Месячная ручка отдаёт весь месяц — на день оставляем то, что реально идёт
// сегодня. Глобальные задачи без срока висят всегда, это их смысл.
function activeOnDate(task) {
  const start = task.start ? task.start.slice(0, 10) : null;
  const end = task.end ? task.end.slice(0, 10) : start;
  if (!start) return !!task.isGlobal;
  return start <= props.date && props.date <= end;
}

const visible = computed(() =>
  tasks.value
    .filter(activeOnDate)
    .filter((t) => showDone.value || !t.done)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.position ?? 0) - (b.position ?? 0)),
);

const doneHidden = computed(
  () => tasks.value.filter((t) => activeOnDate(t) && t.done).length,
);

const openCount = computed(() => tasks.value.filter((t) => activeOnDate(t) && !t.done).length);

function subtasksOf(task) {
  return (task.subtasks || []).filter((s) => showDone.value || !s.done);
}

function progressOf(task) {
  const total = task.subtasks?.length || 0;
  if (!total) return null;
  const done = task.subtasks.filter((s) => s.done).length;
  return { done, total, percent: Math.round((done / total) * 100) };
}

function dayLabel(task) {
  if (!task.totalDays || task.totalDays < 2) return "";
  return `день ${Math.min(task.currentDay || 1, task.totalDays)}/${task.totalDays}`;
}

function toggleExpand(id) {
  const next = new Set(expanded.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expanded.value = next;
}

function cheer(event) {
  const rect = event.currentTarget?.getBoundingClientRect();
  confetti({
    particleCount: 46,
    spread: 62,
    startVelocity: 26,
    scalar: 0.8,
    ticks: 120,
    colors: AUTUMN_COLORS,
    origin: rect
      ? {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height / 2) / window.innerHeight,
        }
      : { y: 0.6 },
  });
}

// Ставим галочку сразу, ответ сервера только подтверждает: ожидание ответа
// на клик по чекбоксу — это ровно то, из-за чего задачи не хочется закрывать.
async function toggleTask(task, event) {
  event?.stopPropagation();
  if (busy.value.has(task.id)) return;
  const next = !task.done;
  task.done = next;
  if (next) cheer(event);
  busy.value = new Set(busy.value).add(task.id);
  try {
    await checkTask(task.id, next);
  } catch (e) {
    task.done = !next;
    error.value = e.message || "не удалось отметить задачу";
  } finally {
    const rest = new Set(busy.value);
    rest.delete(task.id);
    busy.value = rest;
  }
}

async function addToDay(task, event) {
  event.stopPropagation();
  try {
    await createWorkItem({
      date: props.date,
      title: task.title,
      color: task.color || "",
      taskIds: [task.id],
    });
    emit("added");
  } catch (e) {
    error.value = e.message || "не удалось перенести в день";
  }
}

defineExpose({ reload: load });
</script>

<template>
  <section class="mtp" :class="{ compact }">
    <header class="mtp-head">
      <span class="mtp-dot"></span>
      С главной
      <span class="mtp-count">{{ openCount }}</span>
    </header>

    <div v-if="loading" class="mtp-empty">Загружаю…</div>
    <div v-else-if="error" class="mtp-error">{{ error }}</div>
    <div v-else-if="!visible.length" class="mtp-empty">на сегодня задач нет</div>

    <article
      v-for="task in visible"
      :key="task.id"
      class="mtp-task"
      :class="{ done: task.done }"
      :style="{ '--accent': task.color || '#8c5a2b' }"
    >
      <div class="mtp-row">
        <button
          class="mtp-check"
          :class="{ on: task.done }"
          :title="task.done ? 'Открыть заново' : 'Закрыть задачу'"
          @click="toggleTask(task, $event)"
        >
          <span v-if="task.done">✓</span>
        </button>

        <button class="mtp-title" @click="toggleExpand(task.id)">
          <span v-if="task.sticker" class="mtp-sticker">{{ task.sticker }}</span>
          {{ task.title }}
        </button>

        <button class="mtp-move" title="Сделать карточкой этого дня" @click="addToDay(task, $event)">
          ＋
        </button>
      </div>

      <div class="mtp-meta">
        <span v-if="task.isGlobal" class="mtp-chip global">глобальная</span>
        <span v-if="dayLabel(task)" class="mtp-chip">{{ dayLabel(task) }}</span>
        <span v-if="progressOf(task)" class="mtp-chip">
          ☑ {{ progressOf(task).done }}/{{ progressOf(task).total }}
        </span>
        <button
          v-if="task.subtasks?.length"
          class="mtp-chip toggle"
          @click="toggleExpand(task.id)"
        >
          {{ expanded.has(task.id) ? "свернуть" : "подзадачи" }}
        </button>
      </div>

      <div v-if="progressOf(task)" class="mtp-bar">
        <div class="mtp-bar-fill" :style="{ width: progressOf(task).percent + '%' }"></div>
      </div>

      <div v-if="expanded.has(task.id) && subtasksOf(task).length" class="mtp-subs">
        <div
          v-for="sub in subtasksOf(task)"
          :key="sub.id"
          class="mtp-sub"
          :class="{ done: sub.done }"
        >
          <button class="mtp-check small" :class="{ on: sub.done }" @click="toggleTask(sub, $event)">
            <span v-if="sub.done">✓</span>
          </button>
          <span class="mtp-sub-title">{{ sub.title }}</span>
        </div>
      </div>
    </article>

    <button v-if="doneHidden" class="mtp-more" @click="showDone = !showDone">
      {{ showDone ? "скрыть закрытые" : `показать закрытые · ${doneHidden}` }}
    </button>
  </section>
</template>

<style scoped>
.mtp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.mtp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e6c48a;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 7px 11px;
  background: rgba(224, 123, 57, 0.12);
  border: 1px solid rgba(224, 123, 57, 0.32);
  border-radius: 10px;
  position: sticky;
  top: 0;
  z-index: 2;
}

.mtp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e07b39;
  flex-shrink: 0;
}

.mtp-count {
  margin-left: auto;
  color: #a5896a;
  font-weight: 400;
  letter-spacing: 0;
}

.mtp-task {
  position: relative;
  background: linear-gradient(160deg, #1f2028, #1a1b22);
  border: 1px solid #2b2a33;
  border-radius: 12px;
  padding: 10px 11px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  overflow: hidden;
  transition: border-color 0.16s, opacity 0.2s;
}

.mtp-task::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent);
}

.mtp-task:hover {
  border-color: var(--accent);
}

.mtp-task.done {
  opacity: 0.45;
}

.mtp-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.mtp-check {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 1px;
  border-radius: 6px;
  border: 2px solid #4d5262;
  background: transparent;
  color: #101219;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.14s, background 0.14s, border-color 0.14s;
}

.mtp-check:hover {
  border-color: #63c94f;
  transform: scale(1.12);
}

.mtp-check.on {
  background: #63c94f;
  border-color: #63c94f;
}

.mtp-check.small {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  font-size: 9px;
}

.mtp-title {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  color: #e8eaf2;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.35;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.mtp-task.done .mtp-title {
  text-decoration: line-through;
}

.mtp-sticker {
  margin-right: 5px;
}

.mtp-move {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px dashed #3f4457;
  background: transparent;
  color: #8f95a6;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.mtp-move:hover {
  border-color: #e07b39;
  border-style: solid;
  color: #e8b04b;
}

.mtp-meta {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  padding-left: 28px;
}

.mtp-chip {
  font-size: 10.5px;
  color: #8f95a6;
  background: #16171d;
  border: 1px solid #262a36;
  border-radius: 20px;
  padding: 1px 8px;
}

.mtp-chip.global {
  color: #e8b04b;
  border-color: rgba(232, 176, 75, 0.45);
}

.mtp-chip.toggle {
  cursor: pointer;
}

.mtp-chip.toggle:hover {
  color: #cfd3e0;
  border-color: #3f4457;
}

.mtp-bar {
  height: 4px;
  margin-left: 28px;
  background: #22242d;
  border-radius: 3px;
  overflow: hidden;
}

.mtp-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #e07b39, #63c94f);
  transition: width 0.3s;
}

.mtp-subs {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-left: 28px;
}

.mtp-sub {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.mtp-sub-title {
  color: #b7bccb;
  font-size: 12.5px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.mtp-sub.done .mtp-sub-title {
  color: #6e7382;
  text-decoration: line-through;
}

.mtp-empty {
  color: #5b6070;
  font-size: 12px;
  text-align: center;
  padding: 16px 0;
  border: 1px dashed #262a36;
  border-radius: 12px;
}

.mtp-error {
  color: #ff9ba0;
  font-size: 12px;
  padding: 8px;
}

.mtp-more {
  background: none;
  border: 1px dashed #3a3f52;
  border-radius: 10px;
  color: #7a7f8e;
  font-size: 11.5px;
  padding: 7px;
  cursor: pointer;
}

.mtp-more:hover {
  border-color: #e07b39;
  color: #cfd3e0;
}
</style>
