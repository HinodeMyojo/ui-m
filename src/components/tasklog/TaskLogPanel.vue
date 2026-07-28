<script setup>
import { ref, computed, watch } from "vue";
import StatusSetEditor from "./StatusSetEditor.vue";
import {
  fetchTaskStatuses,
  fetchTaskLogEntries,
  fetchTaskLogNode,
  createTaskLogEntry,
  updateTaskLogEntry,
  deleteTaskLogEntry,
  resolveTaskLogEntry,
  setTaskLogStatus,
} from "@/components/api.js";

const props = defineProps({
  taskId: { type: String, required: true },
  title: { type: String, default: "" },
  // Из какой карточки ежедневника и за какой день пишется запись.
  workItemId: { type: String, default: null },
  entryDate: { type: String, default: null },
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(["changed"]);

// Шаблоны записей. Порядок = порядок кнопок.
const KINDS = [
  { key: "blocker", label: "Блокер", icon: "🔴", color: "#e5484d", placeholder: "Что мешает двигаться дальше?" },
  { key: "status", label: "Статус", icon: "🟡", color: "#ffd666", placeholder: "Комментарий к смене статуса…" },
  { key: "decision", label: "Решение", icon: "💡", color: "#a98bff", placeholder: "Делаем так, потому что…" },
  { key: "doc", label: "Документ", icon: "📄", color: "#4aa8ff", placeholder: "Подпись к ссылке" },
  { key: "comment", label: "Комментарий", icon: "💬", color: "#8f95a6", placeholder: "Просто заметка по задаче…" },
];

const statuses = ref([]);
const entries = ref([]);
const node = ref(null);
const loading = ref(false);
const error = ref("");
const activeKind = ref(null);
const draft = ref({ text: "", url: "", statusId: null });
const editingId = ref(null);
const editText = ref("");
const statusEditorOpen = ref(false);
const filter = ref("all");
const resolvingId = ref(null);
const resolveNote = ref("");

const kindMeta = (kind) => KINDS.find((k) => k.key === kind) || KINDS[4];

async function load() {
  if (!props.taskId) return;
  loading.value = true;
  error.value = "";
  try {
    const [s, e, n] = await Promise.all([
      fetchTaskStatuses(),
      fetchTaskLogEntries(props.taskId),
      fetchTaskLogNode(props.taskId),
    ]);
    statuses.value = s;
    entries.value = e;
    node.value = n;
  } catch (e) {
    error.value = e.message || "не удалось загрузить ленту";
  } finally {
    loading.value = false;
  }
}

watch(() => props.taskId, load, { immediate: true });

const openBlockers = computed(() => entries.value.filter((e) => e.kind === "blocker" && !e.resolved));

const filteredEntries = computed(() => {
  if (filter.value === "all") return entries.value;
  if (filter.value === "blockers") return entries.value.filter((e) => e.kind === "blocker");
  return entries.value.filter((e) => e.kind === filter.value);
});

// Лента группируется по дням, свежие дни сверху — так видно, что было и когда.
const grouped = computed(() => {
  const byDate = new Map();
  for (const entry of filteredEntries.value) {
    const key = entry.entryDate || "—";
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(entry);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => ({
      date,
      label: dayLabel(date),
      items: list.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    }));
});

function dayLabel(dateStr) {
  if (!dateStr || dateStr === "—") return "без даты";
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
}

function timeLabel(entry) {
  if (!entry.createdAt) return "";
  return new Date(entry.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function pickKind(kind) {
  activeKind.value = activeKind.value === kind ? null : kind;
  draft.value = { text: "", url: "", statusId: node.value?.statusId || null };
}

async function submit() {
  if (!activeKind.value) return;
  const kind = activeKind.value;
  const text = draft.value.text.trim();
  const url = draft.value.url.trim();
  if (!text && !url) return;

  try {
    if (kind === "status") {
      await setTaskLogStatus({
        taskId: props.taskId,
        statusId: draft.value.statusId,
        comment: text,
        entryDate: props.entryDate || undefined,
        workItemId: props.workItemId || undefined,
      });
    } else {
      await createTaskLogEntry({
        taskId: props.taskId,
        kind,
        text,
        url: kind === "doc" ? url : "",
        entryDate: props.entryDate || undefined,
        workItemId: props.workItemId || undefined,
      });
    }
    activeKind.value = null;
    draft.value = { text: "", url: "", statusId: null };
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

// Клик по статусу в шапке меняет его сразу и оставляет запись в ленте.
async function quickStatus(status) {
  try {
    await setTaskLogStatus({
      taskId: props.taskId,
      statusId: node.value?.statusId === status.id ? null : status.id,
      entryDate: props.entryDate || undefined,
      workItemId: props.workItemId || undefined,
    });
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

// Снятие блокера — через форму с необязательной причиной; возврат — сразу.
function startResolve(entry) {
  if (entry.resolved) {
    applyResolve(entry, false, "");
    return;
  }
  resolvingId.value = entry.id;
  resolveNote.value = "";
}

async function applyResolve(entry, resolved, note) {
  try {
    await resolveTaskLogEntry(entry.id, resolved, note);
    resolvingId.value = null;
    resolveNote.value = "";
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

function startEdit(entry) {
  editingId.value = entry.id;
  editText.value = entry.text;
}

async function saveEdit(entry) {
  try {
    await updateTaskLogEntry(entry.id, { text: editText.value, url: entry.url });
    editingId.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function removeEntry(entry) {
  if (!confirm("Удалить запись из ленты?")) return;
  try {
    await deleteTaskLogEntry(entry.id);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

defineExpose({ reload: load });
</script>

<template>
  <div class="tlp" :class="{ compact }">
    <div class="tlp-head">
      <span class="tlp-title" v-if="title">{{ title }}</span>
      <span v-if="openBlockers.length" class="tlp-blockers">🚧 {{ openBlockers.length }}</span>
      <button class="tlp-gear" title="Настроить набор статусов" @click="statusEditorOpen = true">⚙</button>
    </div>

    <div class="tlp-statuses">
      <button
        v-for="s in statuses"
        :key="s.id"
        class="tlp-status"
        :class="{ on: node?.statusId === s.id }"
        :style="node?.statusId === s.id ? { borderColor: s.color, color: s.color, background: s.color + '1a' } : {}"
        @click="quickStatus(s)"
      >
        {{ s.name }}
      </button>
      <span v-if="!statuses.length && !loading" class="tlp-dim">статусов пока нет — добавьте через ⚙</span>
    </div>

    <div class="tlp-kinds">
      <button
        v-for="k in KINDS"
        :key="k.key"
        class="tlp-kind"
        :class="{ on: activeKind === k.key }"
        :style="activeKind === k.key ? { borderColor: k.color, color: k.color } : {}"
        @click="pickKind(k.key)"
      >
        {{ k.icon }} {{ k.label }}
      </button>
    </div>

    <div v-if="activeKind" class="tlp-form" :style="{ borderColor: kindMeta(activeKind).color }">
      <select v-if="activeKind === 'status'" v-model="draft.statusId" class="tlp-input">
        <option :value="null">— снять статус —</option>
        <option v-for="s in statuses" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <input
        v-if="activeKind === 'doc'"
        v-model="draft.url"
        class="tlp-input"
        placeholder="https://ссылка на документ"
      />
      <textarea
        v-model="draft.text"
        class="tlp-input tlp-area"
        rows="2"
        :placeholder="kindMeta(activeKind).placeholder"
        @keydown.ctrl.enter.prevent="submit"
      ></textarea>
      <div class="tlp-form-actions">
        <span class="tlp-dim">Ctrl+Enter — добавить</span>
        <button class="tlp-btn" @click="activeKind = null">Отмена</button>
        <button class="tlp-btn primary" @click="submit">Добавить</button>
      </div>
    </div>

    <div class="tlp-filters">
      <button class="tlp-filter" :class="{ on: filter === 'all' }" @click="filter = 'all'">Всё</button>
      <button
        v-for="k in KINDS"
        :key="k.key"
        class="tlp-filter"
        :class="{ on: filter === k.key }"
        @click="filter = k.key"
      >
        {{ k.icon }}
      </button>
    </div>

    <div v-if="error" class="tlp-err">{{ error }}</div>
    <div v-if="loading" class="tlp-dim">Загружаю…</div>
    <div v-else-if="!grouped.length" class="tlp-dim">Пока ничего не записано</div>

    <div v-for="group in grouped" :key="group.date" class="tlp-day">
      <div class="tlp-day-label">{{ group.label }}</div>

      <div
        v-for="entry in group.items"
        :key="entry.id"
        class="tlp-entry"
        :class="{
          resolved: entry.kind === 'blocker' && entry.resolved,
          'open-blocker': entry.kind === 'blocker' && !entry.resolved,
        }"
        :style="{ borderLeftColor: entry.kind === 'status' && entry.statusColor ? entry.statusColor : kindMeta(entry.kind).color }"
      >
        <div class="tlp-entry-head">
          <span class="tlp-entry-kind" :style="{ color: kindMeta(entry.kind).color }">
            {{ kindMeta(entry.kind).icon }} {{ kindMeta(entry.kind).label }}
          </span>
          <span
            v-if="entry.kind === 'status' && entry.statusName"
            class="tlp-entry-status"
            :style="{ borderColor: entry.statusColor, color: entry.statusColor }"
          >
            {{ entry.statusName }}
          </span>
          <span v-if="entry.workItemId" class="tlp-entry-src" title="Записано из ежедневника">📓</span>
          <span class="tlp-entry-time">{{ timeLabel(entry) }}</span>

          <button
            v-if="entry.kind === 'blocker'"
            class="tlp-mini"
            :class="{ ok: !entry.resolved }"
            @click="startResolve(entry)"
          >
            {{ entry.resolved ? "вернуть" : "снять" }}
          </button>
          <button class="tlp-mini" @click="startEdit(entry)">✎</button>
          <button class="tlp-mini" @click="removeEntry(entry)">✕</button>
        </div>

        <template v-if="editingId === entry.id">
          <textarea v-model="editText" class="tlp-input tlp-area" rows="2"></textarea>
          <div class="tlp-form-actions">
            <button class="tlp-btn" @click="editingId = null">Отмена</button>
            <button class="tlp-btn primary" @click="saveEdit(entry)">Сохранить</button>
          </div>
        </template>
        <template v-else>
          <div v-if="entry.text" class="tlp-entry-text">{{ entry.text }}</div>
          <a v-if="entry.url" :href="entry.url" target="_blank" rel="noopener" class="tlp-entry-url">
            {{ entry.url }}
          </a>
          <div v-if="entry.kind === 'blocker' && entry.resolved && entry.resolvedAt" class="tlp-resolved">
            <span class="tlp-dim">✓ снят {{ new Date(entry.resolvedAt).toLocaleDateString("ru-RU") }}</span>
            <span v-if="entry.resolveNote" class="tlp-resolved-note">{{ entry.resolveNote }}</span>
          </div>
        </template>

        <!-- Снятие блокера: причину можно написать, а можно и не писать -->
        <div v-if="resolvingId === entry.id" class="tlp-resolve-form">
          <textarea
            v-model="resolveNote"
            class="tlp-input tlp-area"
            rows="2"
            placeholder="Как решилось? (необязательно)"
            autofocus
            @keydown.ctrl.enter.prevent="applyResolve(entry, true, resolveNote)"
            @keydown.esc="resolvingId = null"
          ></textarea>
          <div class="tlp-form-actions">
            <button class="tlp-btn" @click="resolvingId = null">Отмена</button>
            <button class="tlp-btn primary" @click="applyResolve(entry, true, resolveNote)">
              Снять блокер
            </button>
          </div>
        </div>
      </div>
    </div>

    <StatusSetEditor
      v-if="statusEditorOpen"
      @close="statusEditorOpen = false"
      @changed="load"
    />
  </div>
</template>

<style scoped>
.tlp {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tlp-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tlp-title {
  color: #e8eaf2;
  font-size: 13.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tlp-blockers {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: #e5484d;
  border: 1px solid #ff6b6f;
  border-radius: 20px;
  padding: 1px 9px;
  flex-shrink: 0;
}

.tlp-gear {
  margin-left: auto;
  background: none;
  border: none;
  color: #6e7382;
  cursor: pointer;
  font-size: 14px;
}

.tlp-gear:hover {
  color: #cfd3e0;
}

.tlp-statuses,
.tlp-kinds,
.tlp-filters {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tlp-status {
  background: #1e2027;
  border: 1px solid #2f3340;
  color: #9aa0b1;
  border-radius: 20px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  min-height: 32px;
}

.tlp-status:hover {
  border-color: #6e4aff;
}

.tlp-status.on {
  font-weight: 600;
}

.tlp-kind {
  background: #1e2027;
  border: 1px solid #2f3340;
  color: #9aa0b1;
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
  min-height: 32px;
}

.tlp-kind:hover {
  border-color: #6e4aff;
}

.tlp-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #2f3340;
  border-left-width: 3px;
  border-radius: 10px;
  padding: 9px 10px;
  background: #16171d;
}

.tlp-input {
  background: #101219;
  border: 1px solid #2f3340;
  border-radius: 8px;
  color: #e8eaf2;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
  width: 100%;
  font-family: inherit;
}

.tlp-input:focus {
  border-color: #1767fd;
}

.tlp-area {
  resize: vertical;
  line-height: 1.55;
}

.tlp-form-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

.tlp-btn {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12.5px;
  min-height: 34px;
}

.tlp-btn.primary {
  background: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

.tlp-filter {
  background: transparent;
  border: 1px solid #2f3340;
  color: #8f95a6;
  border-radius: 20px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 11.5px;
  min-height: 28px;
}

.tlp-filter.on {
  background: #1767fd22;
  border-color: #1767fd;
  color: #cfe0ff;
}

.tlp-dim {
  color: #6e7382;
  font-size: 11.5px;
}

.tlp-err {
  color: #e5484d;
  font-size: 12px;
}

.tlp-day-label {
  color: #8f95a6;
  font-size: 11.5px;
  text-transform: capitalize;
  margin: 8px 0 5px;
  padding-bottom: 3px;
  border-bottom: 1px solid #262a36;
}

.tlp-entry {
  background: #16171d;
  border: 1px solid #262a36;
  border-left: 3px solid #5b616e;
  border-radius: 8px;
  padding: 7px 10px;
  margin-bottom: 5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tlp-entry.resolved {
  opacity: 0.55;
}

/* Незакрытый блокер — самая заметная запись в ленте */
.tlp-entry.open-blocker {
  background: linear-gradient(90deg, rgba(229, 72, 77, 0.16), #16171d 60%);
  border-color: #6b2b2e;
  border-left-width: 4px;
}

.tlp-entry-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tlp-entry-kind {
  font-size: 11px;
  font-weight: 600;
}

.tlp-entry-status {
  font-size: 10.5px;
  border: 1px solid;
  border-radius: 20px;
  padding: 1px 8px;
}

.tlp-entry-src {
  font-size: 11px;
}

.tlp-entry-time {
  color: #6e7382;
  font-size: 11px;
  margin-left: auto;
}

.tlp-mini {
  background: none;
  border: none;
  color: #6e7382;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
}

.tlp-mini:hover {
  color: #cfd3e0;
}

.tlp-mini.ok:hover {
  color: #63c94f;
}

.tlp-entry-text {
  color: #dfe3ee;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tlp-resolve-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding-top: 7px;
  border-top: 1px dashed #2f3340;
}

.tlp-resolved {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
}

.tlp-resolved-note {
  color: #9fd39a;
  font-size: 12.5px;
  line-height: 1.5;
  border-left: 2px solid #3d6b39;
  padding-left: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tlp-entry-url {
  color: #6ba4ff;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
