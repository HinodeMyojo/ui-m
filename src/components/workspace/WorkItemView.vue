<script setup>
import { ref, computed } from "vue";
import MarkdownView from "./MarkdownView.vue";
import TaskLogPanel from "@/components/tasklog/TaskLogPanel.vue";
import { updateWorkItem, setWorkItemStatus, workFileUrl } from "@/components/api.js";

// Рабочий вид карточки: показываем только то, что реально заполнено.
// Никаких пустых секций и полей ввода — работать, а не настраивать.
const props = defineProps({
  item: { type: Object, required: true },
  date: { type: String, required: true },
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(["changed", "edit", "close"]);

const STATUSES = [
  { key: "todo", label: "План", color: "#5b616e" },
  { key: "doing", label: "В работе", color: "#ffd666" },
  { key: "paused", label: "Пауза", color: "#4aa8ff" },
  { key: "done", label: "Готово", color: "#63c94f" },
  { key: "dropped", label: "Отменено", color: "#e5484d" },
];

const LINK_ICONS = { doc: "📄", repo: "🐙", video: "🎬", design: "🎨", other: "🔗" };

const busy = ref(false);
const error = ref("");
const openLogTaskId = ref(null);

const status = computed(() => STATUSES.find((s) => s.key === props.item.status) || STATUSES[0]);

const checks = computed(() => props.item.checks || []);
const checkProgress = computed(() => {
  const total = checks.value.length;
  const done = checks.value.filter((c) => c.done).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
});

const notes = computed(() =>
  [...(props.item.notes || [])].sort((a, b) => Number(b.pinned) - Number(a.pinned)),
);

const totalSpent = computed(() => (props.item.spentMinutes || 0) + (props.item.trackedMinutes || 0));

// Карточка «пустая», если кроме заголовка в ней ничего нет.
const isBare = computed(
  () =>
    !props.item.body?.trim() &&
    !checks.value.length &&
    !props.item.links?.length &&
    !notes.value.length &&
    !props.item.tasks?.length &&
    !props.item.files?.length,
);

function humanMinutes(minutes) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

const deadlineLabel = computed(() => {
  if (!props.item.deadline) return "";
  const d = new Date(props.item.deadline);
  if (!props.item.deadlineHasTime) return "до конца дня";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
});

const isOverdue = computed(() => {
  if (!props.item.deadline || props.item.status === "done" || props.item.status === "dropped") {
    return false;
  }
  return new Date(props.item.deadline) < new Date();
});

const slotLabel = computed(() => {
  if (props.item.plannedStartMin < 0) return "";
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return props.item.plannedEndMin > props.item.plannedStartMin
    ? `${fmt(props.item.plannedStartMin)} – ${fmt(props.item.plannedEndMin)}`
    : fmt(props.item.plannedStartMin);
});

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function noteTime(note) {
  if (!note.createdAt) return "";
  return new Date(note.createdAt).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

// Отметки по ходу работы сохраняем сразу — остальные поля не трогаем,
// поэтому шлём только то, что изменилось.
async function persist(patch) {
  busy.value = true;
  error.value = "";
  try {
    await updateWorkItem(props.item.id, {
      date: props.date,
      title: props.item.title,
      body: props.item.body,
      color: props.item.color,
      emoji: props.item.emoji,
      status: props.item.status,
      dropReason: props.item.dropReason,
      priority: props.item.priority,
      deadline: props.item.deadline,
      deadlineHasTime: props.item.deadlineHasTime,
      estimateMinutes: props.item.estimateMinutes,
      spentMinutes: props.item.spentMinutes,
      plannedStartMin: props.item.plannedStartMin,
      plannedEndMin: props.item.plannedEndMin,
      learningSkillId: props.item.learningSkillId,
      learningGradeId: props.item.learningGradeId,
      disciplineActivityId: props.item.disciplineActivityId,
      syncGoogle: !!props.item.googleEventId,
      ...patch,
    });
    emit("changed", { keepSelection: true });
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

async function toggleCheck(check) {
  const next = checks.value.map((c) => ({
    id: c.id,
    text: c.text,
    done: c.id === check.id ? !c.done : c.done,
  }));
  await persist({ checks: next });
}

async function onBodyChecked(nextBody) {
  await persist({ body: nextBody });
}

async function setStatus(key) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    let closeTasks = false;
    if (key === "done" && props.item.tasks?.length) {
      const list = props.item.tasks.map((t) => `• ${t.title}`).join("\n");
      closeTasks = confirm(`Закрыть также привязанные задачи?\n\n${list}`);
    }
    await setWorkItemStatus(props.item.id, { status: key, closeTasks });
    emit("changed", { keepSelection: true });
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function toggleLog(taskId) {
  openLogTaskId.value = openLogTaskId.value === taskId ? null : taskId;
}
</script>

<template>
  <article class="wiv" :class="{ compact }">
    <header class="wiv-hero" :style="{ '--accent': item.color || '#1767fd' }">
      <div class="wiv-hero-top">
        <button v-if="compact" class="wiv-back" @click="emit('close')">‹ К списку</button>
        <span class="wiv-status-chip" :style="{ borderColor: status.color, color: status.color }">
          {{ status.label }}
        </span>
        <span v-if="item.priority" class="wiv-prio" :title="'Приоритет ' + item.priority">
          {{ "!".repeat(item.priority) }}
        </span>
        <button class="wiv-edit" @click="emit('edit')">✎ Править</button>
      </div>

      <h1 class="wiv-title">
        <span v-if="item.emoji" class="wiv-emoji">{{ item.emoji }}</span>{{ item.title }}
      </h1>

      <div v-if="item.tags?.length" class="wiv-tags">
        <span v-for="t in item.tags" :key="t.id" class="wiv-tag" :style="{ borderColor: t.color, color: t.color }">
          {{ t.name }}
        </span>
      </div>

      <div class="wiv-meta">
        <span v-if="slotLabel" class="wiv-meta-item">🕐 {{ slotLabel }}</span>
        <span v-if="deadlineLabel" class="wiv-meta-item" :class="{ bad: isOverdue }">
          ⏳ {{ deadlineLabel }}
        </span>
        <span v-if="item.estimateMinutes" class="wiv-meta-item">
          🎯 {{ humanMinutes(item.estimateMinutes) }}
        </span>
        <span v-if="totalSpent" class="wiv-meta-item">⏱ {{ humanMinutes(totalSpent) }}</span>
        <span v-if="item.googleEventId" class="wiv-meta-item">📅 в календаре</span>
        <span v-if="item.otherDates?.length" class="wiv-meta-item">⧉ ещё {{ item.otherDates.length }} дн.</span>
      </div>
    </header>

    <div v-if="error" class="wiv-error">{{ error }}</div>

    <div v-if="item.status === 'dropped' && item.dropReason" class="wiv-dropped">
      Отменено: {{ item.dropReason }}
    </div>

    <div class="wiv-body">
      <section v-if="item.body?.trim()" class="wiv-block wiv-canvas">
        <MarkdownView :text="item.body" editable-checks @update:text="onBodyChecked" />
      </section>

      <section v-if="checks.length" class="wiv-block">
        <div class="wiv-block-head">
          <span>Чек-лист</span>
          <span class="wiv-block-count">{{ checkProgress.done }} / {{ checkProgress.total }}</span>
        </div>
        <div class="wiv-progress">
          <div class="wiv-progress-fill" :style="{ width: checkProgress.percent + '%' }"></div>
        </div>
        <label v-for="c in checks" :key="c.id" class="wiv-check" :class="{ done: c.done }">
          <input type="checkbox" :checked="c.done" @change="toggleCheck(c)" />
          <span>{{ c.text }}</span>
        </label>
      </section>

      <section v-if="item.links?.length" class="wiv-block">
        <div class="wiv-block-head"><span>Ссылки</span></div>
        <div class="wiv-links">
          <a
            v-for="l in item.links"
            :key="l.id"
            :href="l.url"
            target="_blank"
            rel="noopener"
            class="wiv-link"
          >
            <span class="wiv-link-icon">{{ LINK_ICONS[l.kind] || LINK_ICONS.other }}</span>
            <span class="wiv-link-main">
              <span class="wiv-link-title">{{ l.title || hostOf(l.url) }}</span>
              <span class="wiv-link-host">{{ hostOf(l.url) }}</span>
            </span>
          </a>
        </div>
      </section>

      <section v-if="item.tasks?.length" class="wiv-block">
        <div class="wiv-block-head"><span>Задачи</span></div>
        <div v-for="t in item.tasks" :key="t.id" class="wiv-task-wrap">
          <div class="wiv-task" :class="{ blocked: t.openBlockers > 0 }">
            <span class="wiv-task-dot" :style="{ background: t.color || '#1767fd' }"></span>
            <span class="wiv-task-title" :class="{ done: t.done }">{{ t.title }}</span>
            <span v-if="t.parentTitle" class="wiv-task-parent">← {{ t.parentTitle }}</span>
            <span
              v-if="t.statusName"
              class="wiv-task-status"
              :style="{ borderColor: t.statusColor, color: t.statusColor }"
            >
              {{ t.statusName }}
            </span>
            <span v-if="t.openBlockers" class="wiv-task-blockers">🚧 {{ t.openBlockers }}</span>
            <button class="wiv-task-log" @click="toggleLog(t.id)">
              {{ openLogTaskId === t.id ? "▾" : "▸" }} лента
            </button>
          </div>
          <div v-if="openLogTaskId === t.id" class="wiv-task-panel">
            <TaskLogPanel
              :task-id="t.id"
              :work-item-id="item.id"
              :entry-date="date"
              compact
              @changed="emit('changed', { keepSelection: true })"
            />
          </div>
        </div>
      </section>

      <section v-if="notes.length" class="wiv-block">
        <div class="wiv-block-head"><span>Лог</span></div>
        <div v-for="n in notes" :key="n.id" class="wiv-note" :class="{ pinned: n.pinned }">
          <div class="wiv-note-time">{{ n.pinned ? "📌 " : "" }}{{ noteTime(n) }}</div>
          <div class="wiv-note-text">{{ n.text }}</div>
        </div>
      </section>

      <section v-if="item.files?.length" class="wiv-block">
        <div class="wiv-block-head"><span>Вложения</span></div>
        <div class="wiv-files">
          <a
            v-for="f in item.files"
            :key="f.id"
            :href="workFileUrl(f.id)"
            target="_blank"
            rel="noopener"
            class="wiv-file"
          >
            📎 {{ f.filename }}
            <span class="wiv-file-size">{{ fileSize(f.size) }}</span>
          </a>
        </div>
      </section>

      <div v-if="isBare" class="wiv-bare">
        <p>В карточке пока только название.</p>
        <button class="wiv-edit big" @click="emit('edit')">✎ Заполнить</button>
      </div>
    </div>

    <footer class="wiv-foot">
      <button
        v-for="s in STATUSES"
        :key="s.key"
        class="wiv-foot-status"
        :class="{ on: item.status === s.key }"
        :style="item.status === s.key ? { borderColor: s.color, color: s.color, background: s.color + '1a' } : {}"
        :disabled="busy"
        @click="setStatus(s.key)"
      >
        {{ s.label }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.wiv {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.wiv-hero {
  position: relative;
  padding: 18px 22px 14px;
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%),
    #191b22;
  border-bottom: 1px solid #262a36;
}

.wiv-hero::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent);
}

.wiv-hero-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.wiv-back {
  background: none;
  border: none;
  color: #6ba4ff;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}

.wiv-status-chip {
  border: 1px solid;
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 11.5px;
  font-weight: 600;
}

.wiv-prio {
  color: #e5484d;
  font-weight: 700;
  font-size: 13px;
}

.wiv-edit {
  margin-left: auto;
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 6px 13px;
  cursor: pointer;
  font-size: 12.5px;
  min-height: 34px;
}

.wiv-edit:hover {
  border-color: #6e4aff;
}

.wiv-edit.big {
  min-height: 40px;
  padding: 9px 18px;
  margin-left: 0;
}

.wiv-title {
  margin: 0;
  font-size: clamp(19px, 2.4vw, 25px);
  line-height: 1.25;
  color: #fff;
  font-weight: 650;
  overflow-wrap: anywhere;
}

.wiv-emoji {
  margin-right: 8px;
}

.wiv-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 9px;
}

.wiv-tag {
  border: 1px solid;
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 11px;
}

.wiv-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 11px;
}

.wiv-meta-item {
  color: #9aa0b1;
  font-size: 12.5px;
}

.wiv-meta-item.bad {
  color: #ff9ba0;
}

.wiv-error {
  background: #2a181a;
  border-bottom: 1px solid #6b2b2e;
  color: #ff9ba0;
  padding: 8px 22px;
  font-size: 12.5px;
}

.wiv-dropped {
  background: #241a1c;
  color: #e5848a;
  padding: 9px 22px;
  font-size: 12.5px;
  border-bottom: 1px solid #3a2427;
}

.wiv-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px 26px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.wiv-block {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.wiv-block-head {
  display: flex;
  align-items: baseline;
  gap: 9px;
  color: #7a7f8e;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.wiv-block-count {
  color: #5f6472;
  letter-spacing: 0;
  font-weight: 400;
}

.wiv-canvas {
  color: #dfe3ee;
  font-size: 14.5px;
  line-height: 1.75;
}

.wiv-progress {
  height: 4px;
  background: #22242d;
  border-radius: 3px;
  overflow: hidden;
}

.wiv-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1767fd, #63c94f);
  transition: width 0.25s;
}

.wiv-check {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: #dfe3ee;
  font-size: 14px;
  line-height: 1.5;
  cursor: pointer;
  padding: 3px 0;
}

.wiv-check input {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
}

.wiv-check.done span {
  color: #6e7382;
  text-decoration: line-through;
}

.wiv-links {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.wiv-link {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1b1d24;
  border: 1px solid #262a36;
  border-radius: 10px;
  padding: 10px 12px;
  text-decoration: none;
  transition: border-color 0.15s, transform 0.15s;
  min-width: 0;
}

.wiv-link:hover {
  border-color: #1767fd;
  transform: translateY(-1px);
}

.wiv-link-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.wiv-link-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.wiv-link-title {
  color: #e8eaf2;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wiv-link-host {
  color: #6e7382;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wiv-task-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 6px;
}

.wiv-task {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1b1d24;
  border: 1px solid #262a36;
  border-radius: 9px;
  padding: 9px 11px;
  flex-wrap: wrap;
}

.wiv-task.blocked {
  border-color: #6b2b2e;
  border-left: 3px solid #e5484d;
  background: linear-gradient(90deg, rgba(229, 72, 77, 0.14), #1b1d24 55%);
}

.wiv-task-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.wiv-task-title {
  color: #e8eaf2;
  font-size: 13.5px;
}

.wiv-task-title.done {
  color: #6e7382;
  text-decoration: line-through;
}

.wiv-task-parent {
  color: #6e7382;
  font-size: 11px;
}

.wiv-task-status {
  font-size: 10.5px;
  border: 1px solid;
  border-radius: 20px;
  padding: 1px 8px;
}

.wiv-task-blockers {
  font-size: 10.5px;
  font-weight: 700;
  color: #fff;
  background: #e5484d;
  border: 1px solid #ff6b6f;
  border-radius: 20px;
  padding: 1px 8px;
}

.wiv-task-log {
  margin-left: auto;
  background: none;
  border: none;
  color: #6ba4ff;
  cursor: pointer;
  font-size: 11.5px;
}

.wiv-task-panel {
  background: #16171d;
  border: 1px solid #262a36;
  border-radius: 10px;
  padding: 10px;
}

.wiv-note {
  border-left: 2px solid #2f3340;
  padding: 2px 0 2px 12px;
  margin-bottom: 10px;
}

.wiv-note.pinned {
  border-left-color: #ffd666;
}

.wiv-note-time {
  color: #6e7382;
  font-size: 11px;
  margin-bottom: 2px;
}

.wiv-note-text {
  color: #dfe3ee;
  font-size: 13.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.wiv-files {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.wiv-file {
  color: #6ba4ff;
  text-decoration: none;
  font-size: 13px;
}

.wiv-file-size {
  color: #6e7382;
  font-size: 11px;
  margin-left: 6px;
}

.wiv-bare {
  color: #6e7382;
  text-align: center;
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.wiv-bare p {
  margin: 0;
}

.wiv-foot {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  padding: 11px 22px;
  border-top: 1px solid #262a36;
  background: #191b22;
}

.wiv-foot-status {
  background: #1e2027;
  border: 1px solid #2f3340;
  color: #9aa0b1;
  border-radius: 20px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 12.5px;
  min-height: 34px;
}

.wiv-foot-status:hover:not(:disabled) {
  border-color: #6e4aff;
}

.wiv-foot-status.on {
  font-weight: 600;
}

.wiv-foot-status:disabled {
  opacity: 0.6;
  cursor: default;
}

@media (max-width: 900px) {
  .wiv-hero {
    padding: 14px 15px 12px;
  }
  .wiv-body {
    padding: 15px 15px 30px;
  }
  .wiv-foot {
    padding: 10px 15px;
    position: sticky;
    bottom: 0;
  }
  .wiv-links {
    grid-template-columns: 1fr;
  }
}
</style>
