<script setup>
import { ref, computed, onMounted } from "vue";
import { fetchJpKnown, JP_POINTS_LEARNED } from "@/components/japaneseApi.js";
import JpPoints from "./JpPoints.vue";
import JpKanjiSheet from "./JpKanjiSheet.vue";

// «Мои знаки» — все иероглифы, которые учатся или выучены, и у каждого шкала
// баллов знания. Слабые сверху: их и надо повторять. Тап открывает лист знака.

const list = ref([]);
const loading = ref(true);
const error = ref("");
const filter = ref("all");
const sheetChar = ref("");

const FILTERS = [
  { code: "all", title: "Все" },
  { code: "learning", title: "Учатся" },
  { code: "review", title: "Повторяю" },
  { code: "learned", title: "Выучены" },
];

async function load() {
  loading.value = true;
  error.value = "";
  try {
    list.value = (await fetchJpKnown()) || [];
  } catch (e) {
    error.value = e.message || "не загрузилось";
  } finally {
    loading.value = false;
  }
}

function group(k) {
  if (k.points <= 0) return "learning";
  if (k.points >= JP_POINTS_LEARNED) return "learned";
  return "review";
}

const counts = computed(() => {
  const out = { all: list.value.length, learning: 0, review: 0, learned: 0 };
  for (const k of list.value) out[group(k)]++;
  return out;
});

const shown = computed(() =>
  list.value
    .filter((k) => filter.value === "all" || group(k) === filter.value)
    .sort((a, b) => a.points - b.points || dueMs(a) - dueMs(b)),
);

function dueMs(k) {
  return k.due ? new Date(k.due).getTime() : 0;
}

// Когда знак спросят по сроку. Сутки начинаются в 03:00, как и на сервере,
// поэтому считаем по календарным дням без часов.
function dueLabel(k) {
  if (k.points <= 0) return "учится";
  if (!k.due) return "";
  const days = Math.ceil((new Date(k.due).getTime() - Date.now()) / 86400000);
  if (days <= 0) return "пора повторять";
  if (days > 3650) return "закреплён";
  if (days === 1) return "завтра";
  return `через ${days} дн.`;
}

onMounted(load);
</script>

<template>
  <section class="jp-card jpk">
    <h3>Мои знаки — {{ counts.all }}</h3>
    <div v-if="error" class="jp-error">{{ error }}</div>
    <div v-else-if="loading" class="jp-muted">Загружаю…</div>
    <template v-else>
      <div class="jpk-filters">
        <button
          v-for="f in FILTERS"
          :key="f.code"
          class="jpk-filter"
          :class="{ 'is-on': filter === f.code }"
          @click="filter = f.code"
        >
          {{ f.title }} <span class="jp-muted">{{ counts[f.code] }}</span>
        </button>
      </div>
      <div v-if="!shown.length" class="jp-muted">Пусто</div>
      <div class="jpk-rows">
        <button v-for="k in shown" :key="k.char" class="jpk-row" @click="sheetChar = k.char">
          <span class="jpk-char">{{ k.char }}</span>
          <span class="jpk-body">
            <span class="jpk-meaning">{{ (k.meaningsRu || []).slice(0, 2).join(", ") }}</span>
            <JpPoints :points="k.points" :learn-iter="k.learnIter || 0" size="sm" />
          </span>
          <span class="jpk-due" :class="{ 'is-now': dueLabel(k) === 'пора повторять' }">
            {{ dueLabel(k) }}
          </span>
        </button>
      </div>
    </template>
    <JpKanjiSheet v-if="sheetChar" :char="sheetChar" @close="sheetChar = ''" />
  </section>
</template>

<style scoped>
.jpk-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.jpk-filter {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--m-line);
  background: transparent;
  color: var(--m-text);
  font-size: 13px;
  cursor: pointer;
}

.jpk-filter.is-on {
  border-color: var(--m-accent);
  background: var(--m-card-2);
}

.jpk-rows {
  display: flex;
  flex-direction: column;
  max-height: 60vh;
  overflow-y: auto;
}

.jpk-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  border: 0;
  border-bottom: 1px solid var(--m-line);
  background: transparent;
  color: var(--m-text);
  text-align: left;
  cursor: pointer;
}

.jpk-char {
  font-size: 28px;
  line-height: 1;
  width: 36px;
  text-align: center;
  flex-shrink: 0;
}

.jpk-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.jpk-meaning {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jpk-due {
  font-size: 12px;
  color: var(--m-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.jpk-due.is-now {
  color: var(--m-yellow);
  font-weight: 600;
}
</style>
