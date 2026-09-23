<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { fetchBlockerCandidates } from "@/components/api.js";

// Выбор дела, которое блокирует задачу: задача или подзадача с главной либо
// карточка «Сегодня». v-model — { kind: "task"|"item", id, title, context } или null.
const props = defineProps({
  modelValue: { type: Object, default: null },
  // Задача, для которой выбираем: её саму в списке не показываем.
  taskId: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

const query = ref("");
const open = ref(false);
const loading = ref(false);
const candidates = ref([]);
const error = ref("");

let timer = null;
let requestNo = 0;

async function search() {
  const no = ++requestNo;
  loading.value = true;
  error.value = "";
  try {
    const list = await fetchBlockerCandidates(query.value.trim(), props.taskId);
    if (no === requestNo) candidates.value = list || [];
  } catch (e) {
    if (no === requestNo) error.value = e.message;
  } finally {
    if (no === requestNo) loading.value = false;
  }
}

watch(query, () => {
  clearTimeout(timer);
  timer = setTimeout(search, 250);
});
onBeforeUnmount(() => clearTimeout(timer));

function focus() {
  open.value = true;
  if (!candidates.value.length) search();
}

const tasks = computed(() => candidates.value.filter((c) => c.kind === "task"));
const items = computed(() => candidates.value.filter((c) => c.kind === "item"));

function pick(candidate) {
  emit("update:modelValue", {
    kind: candidate.kind,
    id: candidate.id,
    title: candidate.title,
    context: candidate.context,
  });
  open.value = false;
  query.value = "";
}

function clear() {
  emit("update:modelValue", null);
}

// Закрываем список с задержкой: иначе blur успевает раньше клика по строке.
function blur() {
  setTimeout(() => (open.value = false), 150);
}

function dayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
</script>

<template>
  <div class="bp">
    <div v-if="modelValue" class="bp-chosen">
      <span class="bp-chosen-label">⛓ ждёт:</span>
      <span class="bp-chosen-title">
        {{ modelValue.kind === "item" ? "📓" : "📋" }} {{ modelValue.title }}
        <i v-if="modelValue.context" class="bp-dim">
          · {{ modelValue.kind === "item" ? dayLabel(modelValue.context) : modelValue.context }}
        </i>
      </span>
      <button type="button" class="bp-x" title="Убрать ссылку" @click="clear">✕</button>
    </div>
    <div v-else class="bp-search">
      <input
        v-model="query"
        class="bp-input"
        placeholder="⛓ Ждёт задачу… (поиск по главной и «Сегодня», необязательно)"
        @focus="focus"
        @blur="blur"
      />
      <div v-if="open" class="bp-list">
        <div v-if="loading && !candidates.length" class="bp-dim bp-pad">Ищу…</div>
        <div v-else-if="error" class="bp-err bp-pad">{{ error }}</div>
        <div v-else-if="!candidates.length" class="bp-dim bp-pad">Ничего не нашлось</div>
        <template v-if="tasks.length">
          <div class="bp-group">Задачи</div>
          <button v-for="c in tasks" :key="c.id" type="button" class="bp-row" :class="{ done: c.done }"
            @mousedown.prevent="pick(c)">
            <span>{{ c.done ? "✅" : "📋" }} {{ c.title }}</span>
            <i v-if="c.context" class="bp-dim">{{ c.context }}</i>
          </button>
        </template>
        <template v-if="items.length">
          <div class="bp-group">«Сегодня»</div>
          <button v-for="c in items" :key="c.id" type="button" class="bp-row" :class="{ done: c.done }"
            @mousedown.prevent="pick(c)">
            <span>{{ c.done ? "✅" : "📓" }} {{ c.title }}</span>
            <i v-if="c.context" class="bp-dim">{{ dayLabel(c.context) }}</i>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bp {
  position: relative;
}

.bp-input {
  width: 100%;
  box-sizing: border-box;
  background: #101116;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  color: #e8eaf2;
  padding: 7px 9px;
  font-size: 13px;
  outline: none;
}

.bp-input:focus {
  border-color: #e5484d;
}

.bp-list {
  position: absolute;
  z-index: 30;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  max-height: 280px;
  overflow-y: auto;
  background: #1a1c24;
  border: 1px solid #2f3340;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: 4px;
}

.bp-group {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #7a7f8e;
  padding: 6px 8px 2px;
}

.bp-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: #e8eaf2;
  padding: 6px 8px;
  font-size: 13px;
  cursor: pointer;
}

.bp-row:hover {
  background: #262a36;
}

.bp-row.done {
  opacity: 0.6;
}

.bp-chosen {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid #e5484d55;
  border-radius: 8px;
  background: #e5484d12;
  font-size: 13px;
}

.bp-chosen-label {
  color: #ff9ba0;
  white-space: nowrap;
}

.bp-chosen-title {
  flex: 1;
  min-width: 0;
}

.bp-x {
  background: transparent;
  border: 0;
  color: #8f95a6;
  cursor: pointer;
}

.bp-dim {
  color: #7a7f8e;
  font-size: 11.5px;
  font-style: normal;
}

.bp-err {
  color: #ff9ba0;
  font-size: 12px;
}

.bp-pad {
  padding: 6px 8px;
}
</style>
