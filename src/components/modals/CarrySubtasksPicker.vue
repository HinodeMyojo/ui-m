<script setup>
// Перенос подзадач из задачи прошлого месяца в эту. Каждый месяц на главной
// заводится новая задача, а недоделанное остаётся в старой — здесь его
// забирают. Подзадача переезжает целиком (статусы, блокеры, чеклист, время),
// в старой задаче остаётся ссылка «перенесено». back-m: services/taskCarry.go
import { computed, onMounted, reactive, ref } from "vue";
import { fetchCarrySources, carrySubtasksAPI } from "../api.js";

const props = defineProps({
  taskId: { type: String, required: true },
});
const emit = defineEmits(["carried", "close"]);

const loading = ref(true);
const error = ref("");
const sources = ref([]);
const selected = reactive({});
const expanded = reactive({});
const saving = ref(false);

const MATCH_LABELS = { same: "та же задача", similar: "похожая" };

onMounted(load);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    sources.value = await fetchCarrySources(props.taskId);
    // Та же задача прошлого месяца — сразу раскрыта и выбрана целиком:
    // ради неё перенос обычно и открывают. Похожие раскрыты, но не выбраны.
    const same = sources.value.find((s) => s.match === "same");
    if (same) same.subtasks.forEach((sub) => (selected[sub.id] = true));
    sources.value.forEach((s, i) => {
      expanded[s.id] = !!s.match || (i === 0 && !same);
    });
  } catch (e) {
    error.value = e.message || "не удалось загрузить";
  } finally {
    loading.value = false;
  }
}

const selectedIds = computed(() =>
  sources.value.flatMap((s) => s.subtasks.filter((sub) => selected[sub.id]).map((sub) => sub.id)),
);

function pickedIn(source) {
  return source.subtasks.filter((sub) => selected[sub.id]).length;
}

function toggleSource(source) {
  const all = pickedIn(source) === source.subtasks.length;
  source.subtasks.forEach((sub) => (selected[sub.id] = !all));
}

function monthLabel(date) {
  if (!date) return "";
  return new Date(date).toLocaleString("ru", { month: "long", year: "numeric" }).replace(" г.", "");
}

function deadlineLabel(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("ru", { day: "numeric", month: "short" });
}

async function carry() {
  if (!selectedIds.value.length || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    const res = await carrySubtasksAPI(props.taskId, selectedIds.value);
    emit("carried", res);
  } catch (e) {
    error.value = e.message || "не удалось перенести";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="carry-panel">
    <div class="carry-head">
      <span class="carry-hint">
        Открытые подзадачи из задач прошлых месяцев. Переедут сюда со статусами и блокерами,
        в старой задаче останется ссылка.
      </span>
      <button class="carry-close" title="Закрыть" @click="emit('close')">✕</button>
    </div>

    <div v-if="loading" class="carry-empty">Загружаю…</div>
    <div v-else-if="!sources.length && !error" class="carry-empty">
      За последние три месяца открытых подзадач нет — переносить нечего.
    </div>

    <div v-for="source in sources" :key="source.id" class="carry-source">
      <div class="carry-source-row">
        <button class="carry-caret" :aria-label="expanded[source.id] ? 'Свернуть' : 'Развернуть'"
          @click="expanded[source.id] = !expanded[source.id]">
          {{ expanded[source.id] ? "▾" : "▸" }}
        </button>
        <label class="carry-source-title">
          <input
            type="checkbox"
            class="accent-blue"
            :checked="pickedIn(source) === source.subtasks.length"
            :indeterminate.prop="pickedIn(source) > 0 && pickedIn(source) < source.subtasks.length"
            @change="toggleSource(source)"
          />
          <span class="carry-title-text" :title="source.title">
            {{ source.sticker }} {{ source.title }}
          </span>
        </label>
        <span class="carry-month">{{ monthLabel(source.start) }}</span>
        <span v-if="source.match" class="carry-match" :class="source.match">{{ MATCH_LABELS[source.match] }}</span>
        <span class="carry-count">{{ pickedIn(source) }}/{{ source.subtasks.length }}</span>
      </div>

      <div v-if="expanded[source.id]" class="carry-subs">
        <label v-for="sub in source.subtasks" :key="sub.id" class="carry-sub">
          <input v-model="selected[sub.id]" type="checkbox" class="accent-blue" />
          <span class="carry-sub-title" :title="sub.title">{{ sub.title }}</span>
          <span v-if="sub.end" class="carry-sub-end">до {{ deadlineLabel(sub.end) }}</span>
        </label>
      </div>
    </div>

    <div v-if="error" class="carry-error">{{ error }}</div>

    <div v-if="sources.length" class="carry-foot">
      <button class="carry-submit" :disabled="!selectedIds.length || saving" @click="carry">
        {{ saving ? "Переношу…" : `Перенести сюда (${selectedIds.length})` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.carry-panel {
  padding: 10px;
  background: rgba(107, 164, 255, 0.05);
  border: 1px solid rgba(107, 164, 255, 0.2);
  border-radius: 10px;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.carry-head {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.carry-hint {
  flex: 1;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  line-height: 1.4;
}

.carry-close,
.carry-caret {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 12px;
}

.carry-close:hover,
.carry-caret:hover {
  color: #fff;
}

.carry-empty {
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  padding: 6px 0;
}

.carry-source {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 4px;
}

.carry-source-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.carry-source-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.carry-title-text,
.carry-sub-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carry-month,
.carry-count {
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  white-space: nowrap;
}

.carry-match {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  white-space: nowrap;
  border: 1px solid #2f3340;
  color: #9aa3b5;
}

.carry-match.same {
  border-color: rgba(92, 219, 211, 0.5);
  color: #5cdbd3;
}

.carry-subs {
  display: flex;
  flex-direction: column;
  padding: 2px 0 4px 28px;
}

.carry-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 28px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  cursor: pointer;
}

.carry-sub-title {
  flex: 1;
  min-width: 0;
}

.carry-sub-end {
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  white-space: nowrap;
}

.carry-error {
  color: #ff7875;
  font-size: 12px;
}

.carry-foot {
  display: flex;
  justify-content: flex-end;
}

.carry-submit {
  background: #1767fd;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-weight: bold;
  cursor: pointer;
}

.carry-submit:disabled {
  opacity: 0.5;
  cursor: default;
}

/* На телефоне (сетка по ?desktop=1) — палец, а не курсор: строки повыше,
   кнопка во всю ширину. */
@media (max-width: 768px) {
  .carry-sub {
    min-height: 40px;
  }

  .carry-source-row {
    min-height: 40px;
  }

  .carry-month {
    display: none;
  }

  .carry-submit {
    width: 100%;
    min-height: 44px;
  }
}
</style>
