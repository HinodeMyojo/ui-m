<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  fetchWorkDay,
  setWorkItemStatus,
  disciplineLogicalToday,
} from "@/components/api.js";

// Карточки «Сегодня» на мобильной главной.
//
// Полный рабочий стол (/today) — это три колонки, редактор и календарь; на
// телефоне из него нужно ровно одно: увидеть список и отметить сделанное.
// Поэтому здесь только строки и кружок статуса. Тап по кружку закрывает
// карточку, тап по строке открывает её в разделе — редактировать текст
// пальцем в ленте всё равно никто не станет.

const router = useRouter();

const STATUS_COLORS = {
  todo: "#5b616e",
  doing: "#ffd666",
  paused: "#4aa8ff",
  done: "#63c94f",
  dropped: "#e5484d",
};

const date = ref(disciplineLogicalToday());
const day = ref(null);
const loading = ref(true);
const failed = ref(false);
const busyId = ref("");

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    day.value = await fetchWorkDay(date.value);
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

const items = computed(() => day.value?.items || []);
const totals = computed(() => day.value?.totals || null);

// Хвосты прошлых дней сервер отдаёт отдельно — на телефоне это самая полезная
// цифра после «сколько осталось на сегодня».
const carryCount = computed(() =>
  (day.value?.carry || []).reduce((sum, d) => sum + d.items.length, 0),
);

// Кружок переключает между «план» и «готово». Промежуточные статусы
// (в работе, пауза, отменено) ставятся в разделе: на ленте нужен один жест,
// а не выбор из пяти.
async function toggle(item) {
  if (busyId.value) return;
  busyId.value = item.id;
  const next = item.status === "done" ? "todo" : "done";
  const prev = item.status;
  item.status = next; // отклик сразу, без ожидания сети
  try {
    await setWorkItemStatus(item.id, { status: next });
    await load();
  } catch {
    item.status = prev;
  } finally {
    busyId.value = "";
  }
}

function openItem(item) {
  router.push({ path: "/today", query: { date: date.value, item: item.id } });
}

function timeLabel(item) {
  if (item.plannedStartMin > 0) {
    const h = String(Math.floor(item.plannedStartMin / 60)).padStart(2, "0");
    const m = String(item.plannedStartMin % 60).padStart(2, "0");
    return `${h}:${m}`;
  }
  if (item.deadline && item.deadlineHasTime) {
    const d = new Date(item.deadline);
    return `до ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return "";
}
</script>

<template>
  <section class="m-card">
    <button class="m-card-head" @click="router.push('/today')">
      <span class="m-card-title">📅 Сегодня</span>
      <span v-if="totals" class="m-card-note">{{ totals.done }}/{{ totals.total }}</span>
      <span class="m-chev">›</span>
    </button>

    <template v-if="loading">
      <div class="m-skeleton" style="width: 80%"></div>
      <div class="m-skeleton" style="width: 65%"></div>
    </template>

    <div v-else-if="failed" class="m-err">
      День не загрузился <button class="m-btn m-btn-sm" @click="load">↻</button>
    </div>

    <template v-else>
      <div v-if="day?.focus" class="mtd-focus">🎯 {{ day.focus }}</div>

      <div v-if="!items.length" class="m-empty">На сегодня ничего не запланировано</div>

      <ul v-else class="mtd-list">
        <li v-for="item in items" :key="item.id" class="mtd-row">
          <button
            class="mtd-dot"
            :class="{ 'is-done': item.status === 'done' }"
            :style="{ borderColor: STATUS_COLORS[item.status] || STATUS_COLORS.todo }"
            :disabled="busyId === item.id"
            :aria-label="item.status === 'done' ? 'Вернуть в план' : 'Отметить готовым'"
            @click="toggle(item)"
          >
            <span v-if="item.status === 'done'">✓</span>
          </button>

          <button class="mtd-body" @click="openItem(item)">
            <span class="mtd-title" :class="{ 'is-done': item.status === 'done' }">
              <template v-if="item.emoji">{{ item.emoji }} </template>{{ item.title }}
            </span>
            <span v-if="timeLabel(item)" class="mtd-time">{{ timeLabel(item) }}</span>
          </button>
        </li>
      </ul>

      <button
        v-if="carryCount"
        class="m-btn mtd-carry"
        @click="router.push('/today')"
      >
        ⏳ Хвостов с прошлых дней: {{ carryCount }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.mtd-focus {
  font-size: 13px;
  color: #cfd3e0;
  background: #22242d;
  border-radius: 9px;
  padding: 7px 10px;
}

.mtd-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.mtd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid #232631;
}

.mtd-row:first-child {
  border-top: none;
}

/* Кружок — отдельная цель размером с палец: промахнуться по строке и открыть
   карточку вместо галочки было бы обиднее всего. */
.mtd-dot {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  margin: 7px 0;
  border-radius: 50%;
  border: 2px solid #5b616e;
  background: transparent;
  color: #63c94f;
  font-size: 15px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mtd-dot.is-done {
  background: #1f3a1a;
}

.mtd-dot:disabled {
  opacity: 0.5;
}

.mtd-body {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mtd-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 1.3;
  /* Две строки — потолок: длинные названия не должны растягивать ленту. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mtd-title.is-done {
  color: #6b7080;
  text-decoration: line-through;
}

.mtd-time {
  font-size: 11px;
  font-weight: 600;
  color: #7a7f8e;
  flex-shrink: 0;
}

.mtd-carry {
  width: 100%;
}
</style>
