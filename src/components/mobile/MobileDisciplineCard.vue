<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { fetchDisciplineMonth, disciplineLogicalToday } from "@/components/api.js";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  dayCellStyle,
  dayCellTitle,
  dayProgress,
} from "@/components/discipline/dayScale.js";
import DisciplineChecklist from "@/components/discipline/DisciplineChecklist.vue";

// Дисциплина на мобильной главной.
//
// Отличие от десктопной панели: там трекер — колонка сбоку, здесь он должен
// уместиться в один экран и при этом остаться рабочим. Поэтому наверху только
// то, что читают глазами (статус дня, квоты, стрик, полоса месяца), а сам
// чек-лист раскрывается — он длинный и вытолкнул бы всё остальное за экран.
//
// Конфетти и баннеры из десктопного трекера сюда не переехали намеренно:
// canvas-confetti весит больше, чем вся эта карточка, а на телефоне пусковой
// экран должен открываться мгновенно.

const router = useRouter();

const OPEN_KEY = "mDisciplineOpen";
const listOpen = ref(localStorage.getItem(OPEN_KEY) !== "0");

function toggleList() {
  listOpen.value = !listOpen.value;
  localStorage.setItem(OPEN_KEY, listOpen.value ? "1" : "0");
}

const month = ref(null);
const loading = ref(true);
const failed = ref(false);
const today = ref(disciplineLogicalToday());

async function load() {
  loading.value = true;
  failed.value = false;
  today.value = disciplineLogicalToday();
  const [y, m] = today.value.split("-").map(Number);
  try {
    month.value = await fetchDisciplineMonth(m, y);
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

const summary = computed(() => month.value?.summary || null);
const plan = computed(() => month.value?.plan || null);
const todayDay = computed(() => (month.value?.days || []).find((d) => d.date === today.value));

const statusColor = computed(() => STATUS_COLORS[todayDay.value?.status] || "#5b616e");
const statusLabel = computed(() => STATUS_LABELS[todayDay.value?.status] || "…");

// Сколько шагов дня закрыто — то же число, что красит клетку в шкале месяца.
const todayDone = computed(() => {
  const d = todayDay.value;
  if (!d) return { done: 0, total: 0, pct: 0 };
  const total = (d.minTotal || 0) + (d.midTotal || 0);
  return { done: (d.minDone || 0) + (d.midDone || 0), total, pct: dayProgress(d) };
});

const prognosis = computed(() => {
  const s = summary.value;
  if (!s || !plan.value) return "";
  if (!s.medPossible) return "⚠️ 15 средних уже не успеть";
  if (s.medNeeded > 0) return `Ещё ${s.medNeeded} сред. за ${s.daysLeft} дн.`;
  if (s.maxNeeded > 0) return `Средние есть. Ещё ${s.maxNeeded} макс. за ${s.daysLeft} дн.`;
  return "Квоты месяца закрыты 🎉";
});

onMounted(load);
</script>

<template>
  <section class="m-card">
    <button class="m-card-head" @click="router.push('/discipline')">
      <span class="m-card-title">🎯 Дисциплина</span>
      <span v-if="summary" class="mds-streak">🔥 {{ summary.globalStreak }}</span>
      <span class="m-chev">›</span>
    </button>

    <template v-if="loading">
      <div class="m-skeleton" style="width: 45%"></div>
      <div class="m-skeleton" style="height: 22px"></div>
    </template>

    <div v-else-if="failed" class="m-err">
      Трекер не загрузился <button class="m-btn m-btn-sm" @click="load">↻</button>
    </div>

    <template v-else-if="month && summary && plan">
      <div class="mds-top">
        <span class="mds-status" :style="{ borderColor: statusColor, color: statusColor }">
          {{ statusLabel }}
        </span>
        <span v-if="todayDone.total" class="mds-count">
          {{ todayDone.done }}/{{ todayDone.total }} за день
        </span>
      </div>

      <div class="m-chips">
        <span class="m-chip" :class="{ 'is-done': summary.medDays >= plan.effMedTarget }">
          Сред <b>{{ summary.medDays }}/{{ plan.effMedTarget }}</b>
        </span>
        <span class="m-chip" :class="{ 'is-done': summary.maxDays >= plan.effMaxTarget }">
          Макс <b>{{ summary.maxDays }}/{{ plan.effMaxTarget }}</b>
        </span>
        <span class="m-chip" :class="{ 'is-over': summary.overLimitRests > 0 }">
          Отдых <b>{{ summary.restUsed }}/{{ plan.restLimit }}</b>
        </span>
      </div>

      <div class="mds-prognosis">{{ prognosis }}</div>

      <!-- Месяц одной полосой: 30 клеток по 8px влезают в 390px без скролла. -->
      <div class="mds-strip">
        <span
          v-for="d in month.days"
          :key="d.date"
          class="mds-cell"
          :class="{ 'is-today': d.date === today }"
          :style="dayCellStyle(d)"
          :title="dayCellTitle(d)"
        ></span>
      </div>

      <button class="m-btn mds-toggle" @click="toggleList">
        {{ listOpen ? "▾ Свернуть отметки" : "▸ Отметить сделанное" }}
      </button>

      <DisciplineChecklist v-if="listOpen" :month="month" :date="today" @changed="load" />
    </template>
  </section>
</template>

<style scoped>
.mds-streak {
  font-size: 12px;
  font-weight: 700;
  color: #ffab5e;
  flex-shrink: 0;
}

.mds-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mds-status {
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 13px;
  font-weight: 700;
}

.mds-count {
  font-size: 12px;
  color: #7a7f8e;
}

.m-chip.is-done {
  border-color: #63c94f;
  color: #b6ecab;
}

.m-chip.is-over {
  border-color: #e5484d;
  color: #ffb4b6;
}

.mds-prognosis {
  font-size: 12px;
  color: #9aa0b0;
  line-height: 1.35;
}

.mds-strip {
  display: flex;
  gap: 2px;
  height: 26px;
}

.mds-cell {
  flex: 1;
  min-width: 0;
  border-radius: 3px;
}

.mds-cell.is-today {
  outline: 2px solid #a58bff;
  outline-offset: -2px;
}

.mds-toggle {
  width: 100%;
}

/* Чек-лист приезжает из десктопного трекера — там строки рассчитаны на
   узкую колонку 320px, так что на телефоне они ложатся как есть. Правим
   только то, что упирается в палец. */
.m-card :deep(.dsc-activity) {
  min-height: 44px;
  padding: 6px 0;
}

.m-card :deep(.dsc-lvl) {
  min-width: 40px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.m-card :deep(.dsc-variant),
.m-card :deep(.dsc-rm-select),
.m-card :deep(.dsc-rm-num) {
  font-size: 16px;
  min-height: 38px;
}

.m-card :deep(.dsc-bulk-min) {
  min-height: 44px;
  width: 100%;
}
</style>
