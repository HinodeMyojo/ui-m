<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import TaskLogPanel from "@/components/tasklog/TaskLogPanel.vue";
import {
  updateTaskAPI,
  checkTask,
  createWorkItem,
  fetchTaskChecks,
  saveTaskChecks,
} from "@/components/api.js";

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
    loadChecks();
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
  clearTimeout(checksTimer);
  if (savePending) save();
});

// --- Чеклист ---

const checks = ref([]);
const newCheck = ref("");
const checksLoading = ref(false);
let checksTimer = null;

async function loadChecks() {
  checksLoading.value = true;
  try {
    checks.value = (await fetchTaskChecks(props.sub.id)) || [];
  } catch {
    checks.value = [];
  } finally {
    checksLoading.value = false;
  }
}

// Чеклист уходит целиком и тоже сам: галочку ставят на ходу, подтверждать её
// кнопкой — лишний шаг ровно там, где его меньше всего ждут.
function scheduleChecksSave() {
  clearTimeout(checksTimer);
  checksTimer = setTimeout(() => pushChecks({ adopt: false }), 500);
}

// adopt — забрать ответ сервера себе. Нужно, когда появились новые пункты и им
// выданы id; при правке текста ответ игнорируем, иначе он затрёт то, что
// человек допечатал, пока запрос летел.
async function pushChecks({ adopt = true } = {}) {
  clearTimeout(checksTimer);
  try {
    const saved = await saveTaskChecks(
      props.sub.id,
      checks.value.map((c) => ({ id: c.id, text: c.text, done: c.done })),
    );
    if (adopt) checks.value = saved;
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось сохранить чеклист";
  }
}

function addCheck() {
  const text = newCheck.value.trim();
  if (!text) return;
  checks.value.push({ id: null, text, done: false });
  newCheck.value = "";
  pushChecks();
}

function removeCheck(index) {
  checks.value.splice(index, 1);
  pushChecks();
}

function moveCheck(index, delta) {
  const to = index + delta;
  if (to < 0 || to >= checks.value.length) return;
  const [row] = checks.value.splice(index, 1);
  checks.value.splice(to, 0, row);
  pushChecks();
}

const checkProgress = computed(() => {
  const total = checks.value.length;
  if (!total) return null;
  const done = checks.value.filter((c) => c.done).length;
  return { total, done, percent: Math.round((done / total) * 100) };
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

      <!-- Чеклист: мелкие шаги, которые не тянут на отдельную подзадачу -->
      <section class="msp-checks">
        <div class="msp-checks-head">
          <span>☑ Чеклист</span>
          <span v-if="checkProgress" class="msp-dim">
            {{ checkProgress.done }}/{{ checkProgress.total }}
          </span>
        </div>

        <div v-if="checkProgress" class="msp-bar">
          <div class="msp-bar-fill" :style="{ width: checkProgress.percent + '%' }"></div>
        </div>

        <div v-for="(c, i) in checks" :key="c.id || 'new-' + i" class="msp-check">
          <input type="checkbox" v-model="c.done" @change="scheduleChecksSave" />
          <input
            v-model="c.text"
            class="msp-check-text"
            :class="{ done: c.done }"
            @input="scheduleChecksSave"
          />
          <button class="msp-x" title="Выше" @click="moveCheck(i, -1)">↑</button>
          <button class="msp-x" title="Ниже" @click="moveCheck(i, 1)">↓</button>
          <button class="msp-x" title="Удалить" @click="removeCheck(i)">✕</button>
        </div>

        <div v-if="!checks.length && !checksLoading" class="msp-dim">
          Пунктов пока нет — они пригодятся, когда шаг мелкий для подзадачи.
        </div>

        <input
          v-model="newCheck"
          class="msp-input"
          placeholder="+ пункт (Enter)"
          @keydown.enter.prevent="addCheck"
        />
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

.msp-checks {
  display: flex;
  flex-direction: column;
  gap: 7px;
  background: #16171d;
  border: 1px solid #262a36;
  border-radius: 12px;
  padding: 12px;
}

.msp-checks-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #b7bccb;
  font-size: 12.5px;
  font-weight: 600;
}

.msp-bar {
  height: 4px;
  background: #22242d;
  border-radius: 3px;
  overflow: hidden;
}

.msp-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #e07b39, #63c94f);
  transition: width 0.3s;
}

.msp-check {
  display: flex;
  align-items: center;
  gap: 6px;
}

.msp-check-text {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: #e8eaf2;
  font-size: 13px;
  padding: 3px 2px;
  outline: none;
}

.msp-check-text:focus {
  border-bottom-color: #6e4aff;
}

.msp-check-text.done {
  color: #7a7f8e;
  text-decoration: line-through;
}

.msp-x {
  background: none;
  border: none;
  color: #5b6070;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
}

.msp-x:hover {
  color: #cfd3e0;
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
