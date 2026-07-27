<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import MarkdownField from "./MarkdownField.vue";
import TaskPickerModal from "./TaskPickerModal.vue";
import {
  updateWorkItem,
  fetchWorkItem,
  deleteWorkItem,
  unplaceWorkItem,
  placeWorkItem,
  setWorkItemStatus,
  uploadWorkItemFile,
  deleteWorkItemFile,
  syncWorkItemToGoogle,
  workFileUrl,
  workIcsUrl,
  fetchLearningSkill,
} from "@/components/api.js";

const props = defineProps({
  item: { type: Object, required: true },
  date: { type: String, required: true },
  skills: { type: Array, default: () => [] },
  activities: { type: Array, default: () => [] },
  allTags: { type: Array, default: () => [] },
  google: { type: Object, default: () => ({}) },
  compact: { type: Boolean, default: false }, // мобильный полноэкранный режим
});
const emit = defineEmits(["changed", "close", "deleted"]);

const STATUSES = [
  { key: "todo", label: "План", color: "#5b616e" },
  { key: "doing", label: "В работе", color: "#ffd666" },
  { key: "paused", label: "Пауза", color: "#4aa8ff" },
  { key: "done", label: "Готово", color: "#63c94f" },
  { key: "dropped", label: "Отменено", color: "#e5484d" },
];

const PRIORITIES = [
  { value: 0, label: "—", title: "без приоритета" },
  { value: 1, label: "!", title: "низкий" },
  { value: 2, label: "!!", title: "средний" },
  { value: 3, label: "!!!", title: "высокий" },
];

const COLORS = ["#1767fd", "#6e4aff", "#63c94f", "#ffd666", "#e5484d", "#4aa8ff", "#ff7ac6", "#8f95a6"];
const EMOJIS = ["🎯", "💻", "📚", "🐛", "✍️", "🎨", "📞", "🧪", "🔥", "🧠", "⚙️", "📈", "🌱", "🎮", "🏋️", "🇬🇧"];

const LINK_KINDS = [
  { key: "doc", label: "📄 док" },
  { key: "repo", label: "🐙 репо" },
  { key: "video", label: "🎬 видео" },
  { key: "design", label: "🎨 дизайн" },
  { key: "other", label: "🔗 ссылка" },
];

// Пресеты дедлайна: «утро/день/вечер/ночь» и относительные «+1ч / +2ч».
const DEADLINE_PRESETS = [
  { key: "morning", label: "Утро", hour: 11 },
  { key: "day", label: "День", hour: 14 },
  { key: "evening", label: "Вечер", hour: 18 },
  { key: "night", label: "Ночь", hour: 22 },
];

const form = ref(blank());
const grades = ref([]);
const saving = ref(false);
const savedAt = ref(null);
const error = ref("");
const taskPicker = ref(false);
const newNote = ref("");
const newCheck = ref("");
const newLink = ref({ url: "", title: "", kind: "other" });
const newTag = ref("");
const fileInput = ref(null);
const syncing = ref(false);
const showDangerZone = ref(false);
const moveDate = ref(props.date);

let saveTimer = null;
let skipNextSave = false;

function blank() {
  return {
    title: "",
    body: "",
    color: "#1767fd",
    emoji: "",
    status: "todo",
    dropReason: "",
    priority: 0,
    deadline: null,
    deadlineHasTime: false,
    estimateMinutes: 0,
    spentMinutes: 0,
    plannedStartMin: -1,
    plannedEndMin: -1,
    learningSkillId: null,
    learningGradeId: null,
    disciplineActivityId: null,
    links: [],
    notes: [],
    checks: [],
    tasks: [],
    tags: [],
    files: [],
  };
}

function hydrate(item) {
  skipNextSave = true;
  form.value = {
    title: item.title || "",
    body: item.body || "",
    color: item.color || "#1767fd",
    emoji: item.emoji || "",
    status: item.status || "todo",
    dropReason: item.dropReason || "",
    priority: item.priority || 0,
    deadline: item.deadline || null,
    deadlineHasTime: !!item.deadlineHasTime,
    estimateMinutes: item.estimateMinutes || 0,
    spentMinutes: item.spentMinutes || 0,
    plannedStartMin: item.plannedStartMin ?? -1,
    plannedEndMin: item.plannedEndMin ?? -1,
    learningSkillId: item.learningSkillId || null,
    learningGradeId: item.learningGradeId || null,
    disciplineActivityId: item.disciplineActivityId || null,
    links: (item.links || []).map((l) => ({ ...l })),
    notes: (item.notes || []).map((n) => ({ ...n })),
    checks: (item.checks || []).map((c) => ({ ...c })),
    tasks: (item.tasks || []).map((t) => ({ ...t })),
    tags: (item.tags || []).map((t) => ({ ...t })),
    files: (item.files || []).map((f) => ({ ...f })),
  };
  savedAt.value = null;
  error.value = "";
  moveDate.value = props.date;
  loadGrades();
}

watch(() => props.item?.id, () => hydrate(props.item), { immediate: true });

// Любое изменение формы уходит на сервер с задержкой — ручного «Сохранить» нет.
watch(
  form,
  () => {
    if (skipNextSave) {
      skipNextSave = false;
      return;
    }
    scheduleSave();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  clearTimeout(saveTimer);
  if (savePending) save();
});

let savePending = false;

function scheduleSave() {
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}

async function save({ silent = false } = {}) {
  clearTimeout(saveTimer);
  savePending = false;
  saving.value = true;
  error.value = "";
  try {
    await updateWorkItem(props.item.id, {
      date: props.date,
      title: form.value.title,
      body: form.value.body,
      color: form.value.color,
      emoji: form.value.emoji,
      status: form.value.status,
      dropReason: form.value.dropReason,
      priority: form.value.priority,
      deadline: form.value.deadline,
      deadlineHasTime: form.value.deadlineHasTime,
      estimateMinutes: Number(form.value.estimateMinutes) || 0,
      spentMinutes: Number(form.value.spentMinutes) || 0,
      plannedStartMin: form.value.plannedStartMin,
      plannedEndMin: form.value.plannedEndMin,
      learningSkillId: form.value.learningSkillId,
      learningGradeId: form.value.learningGradeId,
      disciplineActivityId: form.value.disciplineActivityId,
      links: form.value.links.map((l) => ({ id: l.id, url: l.url, title: l.title, note: l.note, kind: l.kind })),
      notes: form.value.notes.map((n) => ({
        id: n.id,
        text: n.text,
        color: n.color,
        pinned: n.pinned,
        createdAt: n.createdAt,
      })),
      checks: form.value.checks.map((c) => ({ id: c.id, text: c.text, done: c.done })),
      taskIds: form.value.tasks.map((t) => t.id),
      tags: form.value.tags.map((t) => ({ name: t.name, color: t.color })),
      syncGoogle: !!props.google.connected && !!props.item.googleEventId,
    });
    savedAt.value = new Date();
    if (!silent) emit("changed", { keepSelection: true });
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    saving.value = false;
  }
}

// --- Навык и ступень ---

async function loadGrades() {
  grades.value = [];
  if (!form.value.learningSkillId) return;
  try {
    const skill = await fetchLearningSkill(form.value.learningSkillId);
    grades.value = skill?.levels || skill?.grades || [];
  } catch {
    grades.value = [];
  }
}

watch(() => form.value.learningSkillId, loadGrades);

// --- Статус ---

async function setStatus(status) {
  const closable = status === "done" && form.value.tasks.length > 0;
  form.value.status = status;
  if (closable) {
    const ask = form.value.tasks.map((t) => `• ${t.title}`).join("\n");
    if (confirm(`Закрыть также привязанные задачи?\n\n${ask}`)) {
      await save({ silent: true });
      await setWorkItemStatus(props.item.id, { status, closeTasks: true });
      emit("changed", { keepSelection: true });
      return;
    }
  }
  scheduleSave();
}

// --- Дедлайн ---

function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const deadlineInput = computed({
  get: () => toLocalInput(form.value.deadline),
  set: (value) => {
    form.value.deadline = value ? new Date(value).toISOString() : null;
    form.value.deadlineHasTime = !!value;
  },
});

function presetDeadline(hour) {
  const d = new Date(props.date + "T00:00:00");
  d.setHours(hour, 0, 0, 0);
  form.value.deadline = d.toISOString();
  form.value.deadlineHasTime = true;
}

function relativeDeadline(hours) {
  const d = new Date();
  d.setHours(d.getHours() + hours, d.getMinutes(), 0, 0);
  form.value.deadline = d.toISOString();
  form.value.deadlineHasTime = true;
}

function allDayDeadline() {
  const d = new Date(props.date + "T23:59:00");
  form.value.deadline = d.toISOString();
  form.value.deadlineHasTime = false;
}

function clearDeadline() {
  form.value.deadline = null;
  form.value.deadlineHasTime = false;
}

const deadlineLabel = computed(() => {
  if (!form.value.deadline) return "не задан";
  const d = new Date(form.value.deadline);
  const day = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  if (!form.value.deadlineHasTime) return `${day}, до конца дня`;
  return `${day}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
});

// --- Слот времени ---

const slotStart = computed({
  get: () => minutesToInput(form.value.plannedStartMin),
  set: (value) => (form.value.plannedStartMin = inputToMinutes(value)),
});
const slotEnd = computed({
  get: () => minutesToInput(form.value.plannedEndMin),
  set: (value) => (form.value.plannedEndMin = inputToMinutes(value)),
});

function minutesToInput(minutes) {
  if (minutes == null || minutes < 0) return "";
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function inputToMinutes(value) {
  if (!value) return -1;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

// --- Оценка времени ---

const estimateHours = computed({
  get: () => (form.value.estimateMinutes ? +(form.value.estimateMinutes / 60).toFixed(2) : ""),
  set: (value) => (form.value.estimateMinutes = Math.round((Number(value) || 0) * 60)),
});
const spentHours = computed({
  get: () => (form.value.spentMinutes ? +(form.value.spentMinutes / 60).toFixed(2) : ""),
  set: (value) => (form.value.spentMinutes = Math.round((Number(value) || 0) * 60)),
});

function humanMinutes(minutes) {
  if (!minutes) return "0 мин";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

// --- Заметки ---

function addNote() {
  const text = newNote.value.trim();
  if (!text) return;
  form.value.notes.push({ id: null, text, color: "", pinned: false, createdAt: new Date().toISOString() });
  newNote.value = "";
}

function removeNote(index) {
  form.value.notes.splice(index, 1);
}

function togglePin(note) {
  note.pinned = !note.pinned;
}

const sortedNotes = computed(() =>
  form.value.notes
    .map((n, index) => ({ n, index }))
    .sort((a, b) => Number(b.n.pinned) - Number(a.n.pinned)),
);

function noteTime(note) {
  if (!note.createdAt) return "только что";
  return new Date(note.createdAt).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Чек-лист ---

function addCheck() {
  const text = newCheck.value.trim();
  if (!text) return;
  form.value.checks.push({ id: null, text, done: false });
  newCheck.value = "";
}

function removeCheck(index) {
  form.value.checks.splice(index, 1);
}

function moveCheck(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= form.value.checks.length) return;
  const list = form.value.checks;
  [list[index], list[target]] = [list[target], list[index]];
}

const checkProgress = computed(() => {
  const total = form.value.checks.length;
  const done = form.value.checks.filter((c) => c.done).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
});

// --- Ссылки ---

function addLink() {
  let url = newLink.value.url.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  form.value.links.push({
    id: null,
    url,
    title: newLink.value.title.trim(),
    note: "",
    kind: newLink.value.kind,
  });
  newLink.value = { url: "", title: "", kind: "other" };
}

function removeLink(index) {
  form.value.links.splice(index, 1);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function kindLabel(kind) {
  return (LINK_KINDS.find((k) => k.key === kind) || LINK_KINDS[4]).label;
}

// --- Метки ---

function addTag(name) {
  const value = (name ?? newTag.value).trim();
  if (!value) return;
  if (form.value.tags.some((t) => t.name.toLowerCase() === value.toLowerCase())) {
    newTag.value = "";
    return;
  }
  const known = props.allTags.find((t) => t.name.toLowerCase() === value.toLowerCase());
  form.value.tags.push({ name: value, color: known?.color || "#6e4aff" });
  newTag.value = "";
}

function removeTag(index) {
  form.value.tags.splice(index, 1);
}

const tagSuggestions = computed(() =>
  props.allTags.filter((t) => !form.value.tags.some((x) => x.name.toLowerCase() === t.name.toLowerCase())),
);

// --- Задачи ---

async function applyTasks(ids) {
  // Заглушка до сохранения, затем подтягиваем настоящие названия с сервера.
  const existing = new Map(form.value.tasks.map((t) => [t.id, t]));
  form.value.tasks = ids.map((id) => existing.get(id) || { id, title: "…", color: "#1767fd" });
  taskPicker.value = false;
  await save({ silent: true });
  try {
    const fresh = await fetchWorkItem(props.item.id, props.date);
    skipNextSave = true;
    form.value.tasks = (fresh.tasks || []).map((t) => ({ ...t }));
  } catch {
    /* названия подтянутся при следующей загрузке дня */
  }
  emit("changed", { keepSelection: true });
}

function detachTask(index) {
  form.value.tasks.splice(index, 1);
}

// --- Файлы ---

async function onFilePicked(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    try {
      const uploaded = await uploadWorkItemFile(props.item.id, file);
      skipNextSave = true;
      form.value.files.push(uploaded);
    } catch (e) {
      error.value = e.message || "не удалось загрузить файл";
    }
  }
  event.target.value = "";
}

async function removeFile(index) {
  const file = form.value.files[index];
  try {
    await deleteWorkItemFile(file.id);
    skipNextSave = true;
    form.value.files.splice(index, 1);
  } catch (e) {
    error.value = e.message;
  }
}

function fileHref(file) {
  return workFileUrl(file.id);
}

function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

// --- Календарь ---

async function syncGoogle() {
  syncing.value = true;
  error.value = "";
  try {
    await save({ silent: true });
    await syncWorkItemToGoogle(props.item.id, props.date);
    emit("changed", { keepSelection: true });
  } catch (e) {
    error.value = e.message || "синхронизация не удалась";
  } finally {
    syncing.value = false;
  }
}

function downloadIcs() {
  const token = localStorage.getItem("token");
  fetch(workIcsUrl(props.item.id, props.date), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.value.title || "task"}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => (error.value = "не удалось скачать .ics"));
}

// --- Перемещение и удаление ---

async function moveTo(mode) {
  if (!moveDate.value) return;
  try {
    await save({ silent: true });
    await placeWorkItem(props.item.id, { date: moveDate.value, fromDate: props.date, mode });
    emit("changed", { keepSelection: mode !== "move" });
  } catch (e) {
    error.value = e.message;
  }
}

async function removeFromDay() {
  if (!confirm("Убрать карточку из этого дня?")) return;
  try {
    await unplaceWorkItem(props.item.id, props.date);
    emit("deleted");
  } catch (e) {
    error.value = e.message;
  }
}

async function destroy() {
  if (!confirm("Удалить карточку полностью — со всеми заметками, ссылками и вложениями?")) return;
  try {
    await deleteWorkItem(props.item.id);
    emit("deleted");
  } catch (e) {
    error.value = e.message;
  }
}

const totalSpent = computed(
  () => (Number(form.value.spentMinutes) || 0) + (props.item.trackedMinutes || 0),
);
</script>

<template>
  <div class="wie" :class="{ compact }">
    <div class="wie-top">
      <button v-if="compact" class="wie-back" @click="emit('close')">‹ К списку</button>
      <div class="wie-emoji-wrap">
        <input v-model="form.emoji" class="wie-emoji" maxlength="4" placeholder="🙂" />
        <div class="wie-emoji-pop">
          <button v-for="e in EMOJIS" :key="e" @click="form.emoji = e">{{ e }}</button>
          <button class="wie-emoji-clear" @click="form.emoji = ''">✕</button>
        </div>
      </div>
      <input v-model="form.title" class="wie-title" placeholder="Название задачи" />
      <span class="wie-save" :class="{ on: saving }">
        {{ saving ? "сохраняю…" : savedAt ? "сохранено" : "" }}
      </span>
    </div>

    <div v-if="error" class="wie-error">{{ error }}</div>

    <div class="wie-statuses">
      <button
        v-for="s in STATUSES"
        :key="s.key"
        class="wie-status"
        :class="{ on: form.status === s.key }"
        :style="form.status === s.key ? { borderColor: s.color, color: s.color } : {}"
        @click="setStatus(s.key)"
      >
        {{ s.label }}
      </button>

      <div class="wie-prios">
        <button
          v-for="p in PRIORITIES"
          :key="p.value"
          class="wie-prio"
          :class="{ on: form.priority === p.value }"
          :title="p.title"
          @click="form.priority = p.value"
        >
          {{ p.label }}
        </button>
      </div>

      <div class="wie-colors">
        <button
          v-for="c in COLORS"
          :key="c"
          class="wie-color"
          :class="{ on: form.color === c }"
          :style="{ background: c }"
          @click="form.color = c"
        ></button>
      </div>
    </div>

    <input
      v-if="form.status === 'dropped'"
      v-model="form.dropReason"
      class="wie-input"
      placeholder="Почему отменено?"
    />

    <!-- Время -->
    <section class="wie-block">
      <div class="wie-block-head">⏱ Сроки и время</div>

      <div class="wie-deadline">
        <span class="wie-deadline-value">Дедлайн: <b>{{ deadlineLabel }}</b></span>
        <div class="wie-quick">
          <button v-for="p in DEADLINE_PRESETS" :key="p.key" class="wie-chip" @click="presetDeadline(p.hour)">
            {{ p.label }}
          </button>
          <button class="wie-chip" @click="relativeDeadline(1)">+1 ч</button>
          <button class="wie-chip" @click="relativeDeadline(2)">+2 ч</button>
          <button class="wie-chip" @click="allDayDeadline">весь день</button>
          <button class="wie-chip ghost" @click="clearDeadline">убрать</button>
        </div>
        <input v-model="deadlineInput" type="datetime-local" class="wie-input wie-dt" />
      </div>

      <div class="wie-grid">
        <label class="wie-field">
          План, часов
          <input v-model="estimateHours" type="number" step="0.25" min="0" class="wie-input" placeholder="0" />
        </label>
        <label class="wie-field">
          Факт вручную, часов
          <input v-model="spentHours" type="number" step="0.25" min="0" class="wie-input" placeholder="0" />
        </label>
        <label class="wie-field">
          Слот с
          <input v-model="slotStart" type="time" class="wie-input" />
        </label>
        <label class="wie-field">
          Слот до
          <input v-model="slotEnd" type="time" class="wie-input" />
        </label>
      </div>

      <div class="wie-time-summary">
        Итого потрачено: <b>{{ humanMinutes(totalSpent) }}</b>
        <span v-if="item.trackedMinutes" class="wie-dim">
          (из них {{ humanMinutes(item.trackedMinutes) }} из тайм-трекера по связанным задачам)
        </span>
      </div>
    </section>

    <!-- Связи -->
    <section class="wie-block">
      <div class="wie-block-head">🔗 Привязки</div>

      <div class="wie-grid">
        <label class="wie-field">
          Навык
          <select v-model="form.learningSkillId" class="wie-input">
            <option :value="null">— не выбран —</option>
            <option v-for="s in skills" :key="s.id" :value="s.id">
              {{ s.icon ? s.icon + " " : "" }}{{ s.title }}
            </option>
          </select>
        </label>
        <label class="wie-field" v-if="grades.length">
          Ступень
          <select v-model="form.learningGradeId" class="wie-input">
            <option :value="null">— не выбрана —</option>
            <option v-for="g in grades" :key="g.id" :value="g.id">{{ g.title }}</option>
          </select>
        </label>
        <label class="wie-field">
          Активность дисциплины
          <select v-model="form.disciplineActivityId" class="wie-input">
            <option :value="null">— не выбрана —</option>
            <option v-for="a in activities" :key="a.id" :value="a.id">
              {{ a.emoji ? a.emoji + " " : "" }}{{ a.title }}
            </option>
          </select>
        </label>
      </div>

      <div class="wie-tasks">
        <div class="wie-row-head">
          <span>Задачи с главной страницы</span>
          <button class="wie-chip" @click="taskPicker = true">+ прикрепить</button>
        </div>
        <div v-if="!form.tasks.length" class="wie-empty">ничего не прикреплено</div>
        <div v-for="(t, i) in form.tasks" :key="t.id" class="wie-task">
          <span class="wie-task-dot" :style="{ background: t.color || '#1767fd' }"></span>
          <span class="wie-task-title" :class="{ done: t.done }">{{ t.title }}</span>
          <span v-if="t.parentTitle" class="wie-task-parent">← {{ t.parentTitle }}</span>
          <span v-if="t.isGlobal" class="wie-badge">глобальная</span>
          <button class="wie-x" title="Отвязать" @click="detachTask(i)">✕</button>
        </div>
      </div>

      <div class="wie-tags">
        <span v-for="(t, i) in form.tags" :key="t.name" class="wie-tag" :style="{ borderColor: t.color }">
          {{ t.name }}
          <button @click="removeTag(i)">✕</button>
        </span>
        <input
          v-model="newTag"
          class="wie-tag-input"
          placeholder="+ метка"
          @keydown.enter.prevent="addTag()"
        />
      </div>
      <div v-if="tagSuggestions.length" class="wie-tag-suggest">
        <button v-for="t in tagSuggestions" :key="t.id" @click="addTag(t.name)">{{ t.name }}</button>
      </div>
    </section>

    <!-- Полотно -->
    <section class="wie-block">
      <div class="wie-block-head">📝 Полотно</div>
      <MarkdownField v-model="form.body" :min-height="compact ? 200 : 260" placeholder="Всё, что нужно по этой задаче: план, нюансы, куски кода, мысли…" />
    </section>

    <!-- Чек-лист -->
    <section class="wie-block">
      <div class="wie-block-head">
        ✅ Чек-лист
        <span v-if="checkProgress.total" class="wie-dim">
          {{ checkProgress.done }}/{{ checkProgress.total }} · {{ checkProgress.percent }}%
        </span>
      </div>
      <div v-if="checkProgress.total" class="wie-progress">
        <div class="wie-progress-fill" :style="{ width: checkProgress.percent + '%' }"></div>
      </div>
      <div v-for="(c, i) in form.checks" :key="i" class="wie-check">
        <input type="checkbox" v-model="c.done" />
        <input v-model="c.text" class="wie-check-text" :class="{ done: c.done }" />
        <button class="wie-x" @click="moveCheck(i, -1)">↑</button>
        <button class="wie-x" @click="moveCheck(i, 1)">↓</button>
        <button class="wie-x" @click="removeCheck(i)">✕</button>
      </div>
      <input
        v-model="newCheck"
        class="wie-input"
        placeholder="+ пункт (Enter)"
        @keydown.enter.prevent="addCheck"
      />
    </section>

    <!-- Ссылки -->
    <section class="wie-block">
      <div class="wie-block-head">🌐 Ссылки</div>
      <div v-for="(l, i) in form.links" :key="i" class="wie-link">
        <span class="wie-link-kind">{{ kindLabel(l.kind) }}</span>
        <a :href="l.url" target="_blank" rel="noopener" class="wie-link-a">
          {{ l.title || hostOf(l.url) }}
        </a>
        <span class="wie-link-host">{{ hostOf(l.url) }}</span>
        <button class="wie-x" @click="removeLink(i)">✕</button>
      </div>
      <div class="wie-link-add">
        <select v-model="newLink.kind" class="wie-input wie-kind">
          <option v-for="k in LINK_KINDS" :key="k.key" :value="k.key">{{ k.label }}</option>
        </select>
        <input v-model="newLink.url" class="wie-input" placeholder="https://…" @keydown.enter.prevent="addLink" />
        <input v-model="newLink.title" class="wie-input" placeholder="подпись" @keydown.enter.prevent="addLink" />
        <button class="wie-chip" @click="addLink">+</button>
      </div>
    </section>

    <!-- Лог заметок -->
    <section class="wie-block">
      <div class="wie-block-head">🗒 Лог по ходу работы</div>
      <div class="wie-note-add">
        <textarea
          v-model="newNote"
          class="wie-input wie-note-input"
          rows="2"
          placeholder="Что сделал / что понял / на чём застрял… (Ctrl+Enter)"
          @keydown.ctrl.enter.prevent="addNote"
        ></textarea>
        <button class="wie-chip" @click="addNote">Добавить</button>
      </div>
      <div v-if="!form.notes.length" class="wie-empty">пока пусто</div>
      <div v-for="entry in sortedNotes" :key="entry.index" class="wie-note" :class="{ pinned: entry.n.pinned }">
        <div class="wie-note-head">
          <span class="wie-note-time">{{ noteTime(entry.n) }}</span>
          <button class="wie-x" :title="entry.n.pinned ? 'Открепить' : 'Закрепить'" @click="togglePin(entry.n)">
            {{ entry.n.pinned ? "📌" : "📍" }}
          </button>
          <button class="wie-x" @click="removeNote(entry.index)">✕</button>
        </div>
        <textarea v-model="entry.n.text" class="wie-note-text" rows="2"></textarea>
      </div>
    </section>

    <!-- Файлы -->
    <section class="wie-block">
      <div class="wie-block-head">📎 Вложения</div>
      <div v-for="(f, i) in form.files" :key="f.id" class="wie-file">
        <a :href="fileHref(f)" target="_blank" rel="noopener">{{ f.filename }}</a>
        <span class="wie-dim">{{ fileSize(f.size) }}</span>
        <button class="wie-x" @click="removeFile(i)">✕</button>
      </div>
      <input ref="fileInput" type="file" multiple class="wie-hidden" @change="onFilePicked" />
      <button class="wie-chip" @click="fileInput.click()">+ прикрепить файл</button>
    </section>

    <!-- Календарь -->
    <section class="wie-block">
      <div class="wie-block-head">📅 Календарь</div>
      <div class="wie-cal">
        <button v-if="google.connected" class="wie-chip" :disabled="syncing" @click="syncGoogle">
          {{ item.googleEventId ? "Обновить в Google" : "Отправить в Google" }}
        </button>
        <span v-else class="wie-dim">Google не подключён</span>
        <button class="wie-chip ghost" @click="downloadIcs">Скачать .ics</button>
        <span v-if="item.googleSyncedAt" class="wie-dim">
          синхронизировано {{ new Date(item.googleSyncedAt).toLocaleString("ru-RU") }}
        </span>
      </div>
    </section>

    <!-- Управление -->
    <section class="wie-block">
      <button class="wie-danger-toggle" @click="showDangerZone = !showDangerZone">
        {{ showDangerZone ? "▾" : "▸" }} Перенос и удаление
      </button>
      <div v-if="showDangerZone" class="wie-danger">
        <div v-if="item.otherDates?.length" class="wie-dim">
          Эта же карточка также в днях: {{ item.otherDates.join(", ") }}
        </div>
        <div class="wie-move">
          <input v-model="moveDate" type="date" class="wie-input" />
          <button class="wie-chip" @click="moveTo('move')">Перенести</button>
          <button class="wie-chip" @click="moveTo('link')">Связать</button>
          <button class="wie-chip" @click="moveTo('copy')">Копия</button>
        </div>
        <div class="wie-move">
          <button class="wie-chip ghost" @click="removeFromDay">Убрать из этого дня</button>
          <button class="wie-chip danger" @click="destroy">Удалить полностью</button>
        </div>
      </div>
    </section>

    <TaskPickerModal
      v-if="taskPicker"
      :selected="form.tasks.map((t) => t.id)"
      @close="taskPicker = false"
      @apply="applyTasks"
    />
  </div>
</template>

<style scoped>
.wie {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 60px;
  overflow-y: auto;
  height: 100%;
}

.wie-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.wie-back {
  background: none;
  border: none;
  color: #6ba4ff;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}

.wie-emoji-wrap {
  position: relative;
}

.wie-emoji {
  width: 42px;
  height: 40px;
  text-align: center;
  font-size: 20px;
  background: #16171d;
  border: 1px solid #2f3340;
  border-radius: 9px;
  color: #fff;
  outline: none;
}

.wie-emoji-pop {
  display: none;
  position: absolute;
  top: 44px;
  left: 0;
  z-index: 30;
  background: #1b1d24;
  border: 1px solid #2f3340;
  border-radius: 10px;
  padding: 6px;
  grid-template-columns: repeat(6, 30px);
  gap: 2px;
}

.wie-emoji-wrap:hover .wie-emoji-pop,
.wie-emoji-wrap:focus-within .wie-emoji-pop {
  display: grid;
}

.wie-emoji-pop button {
  background: none;
  border: none;
  font-size: 17px;
  cursor: pointer;
  height: 28px;
  border-radius: 6px;
}

.wie-emoji-pop button:hover {
  background: #262936;
}

.wie-emoji-clear {
  color: #8f95a6;
}

.wie-title {
  flex: 1;
  min-width: 160px;
  background: transparent;
  border: none;
  border-bottom: 1px solid #2a2d38;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  padding: 8px 2px;
  outline: none;
}

.wie-title:focus {
  border-color: #1767fd;
}

.wie-save {
  font-size: 11px;
  color: #63c94f;
  min-width: 66px;
  text-align: right;
}

.wie-save.on {
  color: #ffd666;
}

.wie-error {
  background: #2a181a;
  border: 1px solid #6b2b2e;
  color: #ff9ba0;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12.5px;
}

.wie-statuses {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.wie-status {
  background: #1e2027;
  border: 1px solid #2f3340;
  color: #9aa0b1;
  border-radius: 20px;
  padding: 6px 13px;
  cursor: pointer;
  font-size: 12.5px;
  min-height: 34px;
}

.wie-status.on {
  background: #171a21;
  font-weight: 600;
}

.wie-prios {
  display: flex;
  gap: 2px;
  margin-left: auto;
}

.wie-prio {
  background: #1e2027;
  border: 1px solid #2f3340;
  color: #8f95a6;
  border-radius: 7px;
  min-width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 12px;
}

.wie-prio.on {
  border-color: #e5484d;
  color: #ff9ba0;
}

.wie-colors {
  display: flex;
  gap: 3px;
}

.wie-color {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.wie-color.on {
  border-color: #fff;
}

.wie-block {
  background: #1b1d24;
  border: 1px solid #262a36;
  border-radius: 12px;
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.wie-block-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #b7bccb;
  font-size: 12.5px;
  font-weight: 600;
}

.wie-dim {
  color: #7a7f8e;
  font-size: 11.5px;
  font-weight: 400;
}

.wie-input {
  background: #16171d;
  border: 1px solid #2f3340;
  border-radius: 8px;
  color: #e8eaf2;
  padding: 9px 10px;
  font-size: 13px;
  outline: none;
  width: 100%;
  min-height: 38px;
}

.wie-input:focus {
  border-color: #1767fd;
}

select.wie-input {
  cursor: pointer;
}

.wie-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.wie-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #8f95a6;
  font-size: 11.5px;
}

.wie-deadline {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.wie-deadline-value {
  color: #b7bccb;
  font-size: 12.5px;
}

.wie-quick {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.wie-chip {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 20px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  min-height: 32px;
}

.wie-chip:hover:not(:disabled) {
  border-color: #6e4aff;
}

.wie-chip:disabled {
  opacity: 0.5;
}

.wie-chip.ghost {
  color: #8f95a6;
}

.wie-chip.danger {
  border-color: #6b2b2e;
  color: #e5848a;
}

.wie-dt {
  max-width: 240px;
}

.wie-time-summary {
  color: #b7bccb;
  font-size: 12.5px;
}

.wie-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #8f95a6;
  font-size: 11.5px;
}

.wie-empty {
  color: #6e7382;
  font-size: 12px;
  font-style: italic;
}

.wie-task {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #16171d;
  border: 1px solid #262a36;
  border-radius: 8px;
  padding: 7px 9px;
}

.wie-task-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.wie-task-title {
  color: #dfe3ee;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wie-task-title.done {
  color: #6e7382;
  text-decoration: line-through;
}

.wie-task-parent {
  color: #7a7f8e;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wie-badge {
  font-size: 10px;
  color: #a98bff;
  border: 1px solid #6e4aff55;
  border-radius: 20px;
  padding: 1px 7px;
  flex-shrink: 0;
}

.wie-x {
  background: none;
  border: none;
  color: #6e7382;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 6px;
  margin-left: auto;
  flex-shrink: 0;
}

.wie-x:hover {
  color: #e5484d;
}

.wie-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  align-items: center;
}

.wie-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #6e4aff;
  border-radius: 20px;
  padding: 3px 9px;
  font-size: 11.5px;
  color: #dfe3ee;
}

.wie-tag button {
  background: none;
  border: none;
  color: #7a7f8e;
  cursor: pointer;
  font-size: 10px;
  padding: 0;
}

.wie-tag-input {
  background: transparent;
  border: 1px dashed #3a3f52;
  border-radius: 20px;
  color: #e8eaf2;
  padding: 4px 10px;
  font-size: 11.5px;
  outline: none;
  width: 110px;
}

.wie-tag-suggest {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.wie-tag-suggest button {
  background: none;
  border: none;
  color: #6e7382;
  cursor: pointer;
  font-size: 11px;
}

.wie-tag-suggest button:hover {
  color: #6ba4ff;
}

.wie-progress {
  height: 5px;
  background: #22242d;
  border-radius: 3px;
  overflow: hidden;
}

.wie-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1767fd, #63c94f);
  transition: width 0.25s;
}

.wie-check {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wie-check-text {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: #dfe3ee;
  font-size: 13px;
  padding: 5px 2px;
  outline: none;
}

.wie-check-text:focus {
  border-color: #2f3340;
}

.wie-check-text.done {
  color: #6e7382;
  text-decoration: line-through;
}

.wie-check .wie-x {
  margin-left: 0;
}

.wie-link {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #16171d;
  border: 1px solid #262a36;
  border-radius: 8px;
  padding: 7px 9px;
  min-width: 0;
}

.wie-link-kind {
  font-size: 11px;
  flex-shrink: 0;
}

.wie-link-a {
  color: #6ba4ff;
  font-size: 13px;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wie-link-host {
  color: #6e7382;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wie-link-add {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.wie-link-add .wie-input {
  flex: 1;
  min-width: 110px;
}

.wie-kind {
  max-width: 120px;
}

.wie-note-add {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.wie-note-input {
  resize: vertical;
  font-family: inherit;
}

.wie-note {
  background: #16171d;
  border: 1px solid #262a36;
  border-left: 3px solid #2f3340;
  border-radius: 8px;
  padding: 7px 9px;
}

.wie-note.pinned {
  border-left-color: #ffd666;
}

.wie-note-head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.wie-note-time {
  color: #6e7382;
  font-size: 11px;
  margin-right: auto;
}

.wie-note-head .wie-x {
  margin-left: 0;
}

.wie-note-text {
  width: 100%;
  background: transparent;
  border: none;
  color: #dfe3ee;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  line-height: 1.6;
}

.wie-file {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.wie-file a {
  color: #6ba4ff;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wie-hidden {
  display: none;
}

.wie-cal {
  display: flex;
  gap: 7px;
  align-items: center;
  flex-wrap: wrap;
}

.wie-danger-toggle {
  background: none;
  border: none;
  color: #8f95a6;
  cursor: pointer;
  font-size: 12.5px;
  text-align: left;
  padding: 0;
}

.wie-danger {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.wie-move {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.wie-move .wie-input {
  max-width: 170px;
}

@media (max-width: 760px) {
  .wie {
    padding: 12px 12px 90px;
  }
  .wie-prios {
    margin-left: 0;
  }
}
</style>
