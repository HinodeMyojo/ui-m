<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import TaskLogPanel from "@/components/tasklog/TaskLogPanel.vue";
import { updateTaskAPI, checkTask, createWorkItem } from "@/components/api.js";

// Подзадача с главной страницы, открытая из доски дня. Здесь её правят там же,
// где увидели: название, срок, статус, блокеры и лента — не уходя на главную.
const props = defineProps({
  sub: { type: Object, required: true },
  date: { type: String, required: true },
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(["changed", "close"]);

const title = ref("");
const deadline = ref("");
const busy = ref(false);
const error = ref("");
const saved = ref(false);

let saveTimer = null;
let savePending = false;
let skipNextSave = false;

// Правка идёт от карточки: пока панель открыта на этой подзадаче, чужие
// перезагрузки дня не должны затирать то, что человек уже набрал.
watch(
  () => props.sub.id,
  () => {
    skipNextSave = true;
    title.value = props.sub.title || "";
    deadline.value = toInput(props.sub.deadline);
    error.value = "";
  },
  { immediate: true },
);

// Кнопки «Сохранить» здесь нет, как и в карточке дня: правка уходит сама через
// паузу — иначе смену срока приходится подтверждать, и её легко потерять.
watch([title, deadline], () => {
  if (skipNextSave) {
    skipNextSave = false;
    return;
  }
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
});

onBeforeUnmount(() => {
  clearTimeout(saveTimer);
  if (savePending) save();
});

function toInput(value) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const dirty = computed(
  () => title.value !== (props.sub.title || "") || deadline.value !== toInput(props.sub.deadline),
);

async function save() {
  clearTimeout(saveTimer);
  savePending = false;
  if (!title.value.trim()) {
    error.value = "без названия подзадача не сохранится";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    // start и color шлём как есть: ручка задачи перезаписывает поля целиком,
    // и незаполненное в запросе она обнуляет.
    await updateTaskAPI(props.sub.id, {
      title: title.value.trim(),
      start: props.sub.start || null,
      end: deadline.value ? new Date(deadline.value).toISOString() : null,
      color: props.sub.color || "",
    });
    saved.value = true;
    setTimeout(() => (saved.value = false), 1600);
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

async function toggleDone() {
  busy.value = true;
  try {
    await checkTask(props.sub.id, !props.sub.done);
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось отметить";
  } finally {
    busy.value = false;
  }
}

async function toDay() {
  busy.value = true;
  try {
    await createWorkItem({
      date: props.date,
      title: props.sub.title,
      color: props.sub.color || props.sub.parentColor || "",
      taskIds: [props.sub.id],
    });
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось перенести в день";
  } finally {
    busy.value = false;
  }
}

const deadlineHint = computed(() => {
  if (!props.sub.deadline) return "срок не задан";
  const left = Math.round((new Date(props.sub.deadline) - Date.now()) / 60000);
  if (props.sub.done) return "закрыта";
  if (left < 0) return `просрочена на ${human(-left)}`;
  if (left <= 60) return `осталось ${left} мин`;
  return `в запасе ${human(left)}`;
});

function human(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}
</script>

<template>
  <article class="msp" :class="{ compact }" :style="{ '--accent': sub.parentColor || '#e07b39' }">
    <header class="msp-head">
      <div class="msp-flags">
        <span class="msp-flag">с главной</span>
        <span v-if="sub.parentIsGlobal" class="msp-flag global">глобальная</span>
        <span v-if="sub.statusName" class="msp-flag status" :style="{ color: sub.statusColor }">
          {{ sub.statusName }}
        </span>
      </div>

      <div class="msp-parent">
        <span v-if="sub.parentSticker">{{ sub.parentSticker }} </span>{{ sub.parentTitle }}
        <span class="msp-arrow">→</span>
      </div>

      <h1 class="msp-title" :class="{ done: sub.done }">{{ sub.title }}</h1>

      <div class="msp-meta">
        <span class="msp-when" :class="{ soon: !sub.done && deadlineHint.startsWith('осталось'), bad: deadlineHint.startsWith('просрочена') }">
          ⏳ {{ deadlineHint }}
        </span>
        <span v-if="sub.openBlockers" class="msp-blockers">🚧 {{ sub.openBlockers }}</span>
      </div>

      <div class="msp-actions">
        <button class="msp-btn" :class="{ on: sub.done }" :disabled="busy" @click="toggleDone">
          {{ sub.done ? "✓ Закрыта — открыть" : "Закрыть подзадачу" }}
        </button>
        <button class="msp-btn" :disabled="busy" @click="toDay">＋ Карточкой дня</button>
      </div>
    </header>

    <div class="msp-body">
      <section class="msp-form">
        <label class="msp-field">
          Название
          <input v-model="title" class="msp-input" placeholder="Что именно сделать" />
        </label>

        <label class="msp-field">
          Дедлайн
          <input v-model="deadline" type="datetime-local" class="msp-input" />
        </label>

        <div class="msp-form-foot">
          <span v-if="error" class="msp-error">{{ error }}</span>
          <span v-else-if="busy" class="msp-dim">сохраняю…</span>
          <span v-else-if="saved" class="msp-dim ok">сохранено</span>
          <span v-else-if="dirty" class="msp-dim">правки уйдут сами</span>
          <span v-else class="msp-dim">правки сохраняются сами</span>
        </div>
      </section>

      <!-- Статус, блокеры, решения и вся лента — та же панель, что и на главной -->
      <TaskLogPanel
        :key="sub.id"
        :task-id="sub.id"
        :title="sub.title"
        :entry-date="date"
        :compact="compact"
        @changed="emit('changed')"
      />
    </div>
  </article>
</template>

<style scoped>
.msp {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.msp-head {
  padding: 16px 20px 14px;
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 60%),
    #191b22;
  border-bottom: 1px solid #262a36;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.msp-flags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.msp-flag {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #e8b04b;
  background: rgba(224, 123, 57, 0.16);
  border: 1px solid rgba(224, 123, 57, 0.4);
  border-radius: 20px;
  padding: 2px 9px;
}

.msp-flag.global {
  color: #ffd666;
}

.msp-flag.status {
  background: #16171d;
  border-color: #2f3340;
  text-transform: none;
  letter-spacing: 0;
}

.msp-parent {
  color: #a5896a;
  font-size: 12px;
}

.msp-arrow {
  color: #6e7382;
}

.msp-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
  color: #f0f2f7;
  overflow-wrap: anywhere;
}

.msp-title.done {
  text-decoration: line-through;
  color: #9aa0b1;
}

.msp-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #8f95a6;
}

.msp-when.soon {
  color: #ffd666;
}

.msp-when.bad {
  color: #ff9ba0;
}

.msp-blockers {
  color: #ffc9cb;
}

.msp-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.msp-btn {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 7px 13px;
  font-size: 12.5px;
  cursor: pointer;
}

.msp-btn:hover:not(:disabled) {
  border-color: #e07b39;
}

.msp-btn.on {
  border-color: #63c94f;
  color: #a8e59a;
}

.msp-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.msp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 40px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.msp-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.msp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #8f95a6;
  font-size: 11.5px;
}

.msp-input {
  background: #16171d;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  color: #e8eaf2;
  font-size: 13.5px;
  padding: 8px 10px;
  outline: none;
}

.msp-input:focus {
  border-color: #6e4aff;
}

.msp-form-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.msp-error {
  color: #ff9ba0;
  font-size: 12px;
}

.msp-dim {
  color: #7a7f8e;
  font-size: 12px;
}

.msp-dim.ok {
  color: #a8e59a;
}

.msp.compact .msp-head {
  padding: 12px 14px 12px;
}

.msp.compact .msp-title {
  font-size: 17px;
}
</style>
