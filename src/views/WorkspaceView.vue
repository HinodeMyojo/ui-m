<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import MarkdownField from "@/components/workspace/MarkdownField.vue";
import WorkItemEditor from "@/components/workspace/WorkItemEditor.vue";
import WorkItemView from "@/components/workspace/WorkItemView.vue";
import DayOverview from "@/components/workspace/DayOverview.vue";
import CarryModal from "@/components/workspace/CarryModal.vue";
import GooglePanel from "@/components/workspace/GooglePanel.vue";
import SearchModal from "@/components/workspace/SearchModal.vue";
import SportTodayCard from "@/components/workspace/SportTodayCard.vue";
import MainTasksPanel from "@/components/workspace/MainTasksPanel.vue";
import RoadmapWidget from "@/components/roadmap/RoadmapWidget.vue";
import DisciplineChecklist from "@/components/discipline/DisciplineChecklist.vue";
import {
  fetchWorkDay,
  saveWorkDay,
  createWorkItem,
  setWorkItemStatus,
  reorderWorkItems,
  exchangeGoogleCode,
  syncWorkDayToGoogle,
  fetchDisciplineMonth,
  disciplineLogicalToday,
} from "@/components/api.js";

const router = useRouter();
const route = useRoute();

// Переход из задачи открывает нужный день сразу: /today?date=2026-07-28&item=<id>
const queryDate = typeof route.query.date === "string" ? route.query.date : "";
const date = ref(/^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : disciplineLogicalToday());
const day = ref(null);
const loading = ref(true);
const error = ref("");
const selectedId = ref(null);
const carryOpen = ref(false);
const googleOpen = ref(false);
const searchOpen = ref(false);
const noteOpen = ref(false);
const disciplineOpen = ref(false);
const sportOpen = ref(false);
const roadmapOpen = ref(false);
const disciplineMonth = ref(null);
const filter = ref("all");

// Режимы страницы: рабочий (только заполненное), правка, общий (все задачи разом).
const VIEW_MODES = [
  { key: "work", label: "Рабочий", hint: "только то, что заполнено" },
  { key: "edit", label: "Правка", hint: "все поля и настройки карточки" },
  { key: "all", label: "Общий", hint: "все задачи дня перед глазами" },
];
const viewMode = ref(localStorage.getItem("workspaceViewMode") || "work");

function setViewMode(key) {
  viewMode.value = key;
  localStorage.setItem("workspaceViewMode", key);
}

// Из общего вида карточка открывается в рабочем.
function openFromOverview(itemId) {
  selectedId.value = itemId;
  setViewMode("work");
  if (isNarrow.value) mobileEditor.value = true;
}
const isNarrow = ref(window.innerWidth < 900);
const mobileEditor = ref(false);
const dragId = ref(null);

const STATUS_META = {
  todo: { label: "План", color: "#5b616e" },
  doing: { label: "В работе", color: "#ffd666" },
  paused: { label: "Пауза", color: "#4aa8ff" },
  done: { label: "Готово", color: "#63c94f" },
  dropped: { label: "Отменено", color: "#e5484d" },
};

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "open", label: "Открытые" },
  { key: "doing", label: "В работе" },
  { key: "done", label: "Готовые" },
];

let dayNoteTimer = null;

function onResize() {
  isNarrow.value = window.innerWidth < 900;
}

onMounted(async () => {
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onHotkey);
  await handleGoogleCallback();
  await load();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onHotkey);
  clearTimeout(dayNoteTimer);
});

function onHotkey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchOpen.value = true;
  }
}

// Google возвращает нас сюда с ?code=… — сразу меняем его на токены.
async function handleGoogleCallback() {
  const code = route.query.code;
  if (!code) return;
  const redirectUri = localStorage.getItem("googleRedirectUri") || `${window.location.origin}/today`;
  try {
    await exchangeGoogleCode(code, redirectUri);
  } catch (e) {
    error.value = e.message || "не удалось подключить Google";
  } finally {
    localStorage.removeItem("googleRedirectUri");
    router.replace({ path: "/today" });
  }
}

// pendingSelect — карточка, которую нужно выделить после загрузки другого дня
// (например, при переходе из поиска).
const pendingSelect = ref(typeof route.query.item === "string" ? route.query.item : null);

async function load({ keepSelection = true } = {}) {
  loading.value = true;
  error.value = "";
  try {
    const previous = pendingSelect.value || selectedId.value;
    const forced = !!pendingSelect.value;
    pendingSelect.value = null;
    day.value = await fetchWorkDay(date.value);
    const stillHere = day.value.items.some((i) => i.id === previous);
    selectedId.value =
      (forced || keepSelection) && stillHere ? previous : day.value.items[0]?.id || null;
  } catch (e) {
    error.value = e.message || "не удалось загрузить день";
    day.value = null;
  } finally {
    loading.value = false;
  }
}

watch(date, () => {
  selectedId.value = null;
  mobileEditor.value = false;
  load({ keepSelection: false });
  if (disciplineOpen.value) loadDiscipline();
});

const items = computed(() => day.value?.items || []);

const visibleItems = computed(() => {
  const list = items.value;
  if (filter.value === "open") return list.filter((i) => i.status !== "done" && i.status !== "dropped");
  if (filter.value === "doing") return list.filter((i) => i.status === "doing");
  if (filter.value === "done") return list.filter((i) => i.status === "done");
  return list;
});

const selected = computed(() => items.value.find((i) => i.id === selectedId.value) || null);
const totals = computed(() => day.value?.totals || {});
const carryCount = computed(() =>
  (day.value?.carry || []).reduce((sum, d) => sum + d.items.length, 0),
);

const dayTitle = computed(() => {
  const d = new Date(date.value + "T12:00:00");
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
});

const isToday = computed(() => date.value === disciplineLogicalToday());

function shiftDate(delta) {
  const d = new Date(date.value + "T12:00:00");
  d.setDate(d.getDate() + delta);
  date.value = d.toISOString().slice(0, 10);
}

function goToday() {
  date.value = disciplineLogicalToday();
}

// --- Карточки ---

async function addItem() {
  try {
    const { id } = await createWorkItem({ date: date.value, title: "" });
    await load({ keepSelection: false });
    selectedId.value = id;
    if (isNarrow.value) mobileEditor.value = true;
    await nextTick();
    document.querySelector(".wie-title")?.focus();
  } catch (e) {
    error.value = e.message;
  }
}

function selectItem(item) {
  selectedId.value = item.id;
  if (isNarrow.value) mobileEditor.value = true;
}

// Клик по кружку статуса гоняет карточку по кругу «план → в работе → готово».
async function cycleStatus(item, event) {
  event.stopPropagation();
  const order = ["todo", "doing", "done"];
  const next = order[(order.indexOf(item.status) + 1) % order.length] || "todo";
  try {
    await setWorkItemStatus(item.id, { status: next, closeTasks: false });
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

function onDragStart(item) {
  dragId.value = item.id;
}

async function onDrop(target) {
  if (!dragId.value || dragId.value === target.id) return;
  const order = items.value.map((i) => i.id);
  const from = order.indexOf(dragId.value);
  const to = order.indexOf(target.id);
  if (from < 0 || to < 0) return;
  order.splice(to, 0, ...order.splice(from, 1));
  dragId.value = null;
  try {
    await reorderWorkItems(date.value, order);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

// Перенос карточки в общем виде: статус берётся из колонки, место в дне — из
// точки, куда её бросили. Меняем список сразу, не дожидаясь сервера: карточка,
// которая на полсекунды прыгает обратно, ощущается сломанной.
async function moveItem({ id, status, beforeId }) {
  const list = day.value?.items;
  if (!list) return;
  const index = list.findIndex((i) => i.id === id);
  if (index < 0) return;
  const item = list[index];
  const previous = item.status;

  item.status = status;
  list.splice(index, 1);
  const at = beforeId ? list.findIndex((i) => i.id === beforeId) : -1;
  if (at < 0) list.push(item);
  else list.splice(at, 0, item);

  try {
    if (previous !== status) await setWorkItemStatus(id, { status, closeTasks: false });
    await reorderWorkItems(date.value, list.map((i) => i.id));
    await load();
  } catch (e) {
    error.value = e.message;
    await load();
  }
}

// Ключ сортировки: сначала то, у чего есть слот в дне, потом дедлайны со
// временем, потом «до конца дня», и в самом хвосте — карточки без времени.
function timeKey(item) {
  if (item.plannedStartMin >= 0) return item.plannedStartMin;
  if (item.deadline) {
    if (!item.deadlineHasTime) return 24 * 60;
    const d = new Date(item.deadline);
    return d.getHours() * 60 + d.getMinutes();
  }
  return 100000;
}

async function sortByTime() {
  const order = [...items.value]
    .sort((a, b) => timeKey(a) - timeKey(b) || (b.priority || 0) - (a.priority || 0))
    .map((i) => i.id);
  try {
    await reorderWorkItems(date.value, order);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

// --- Заметка дня ---

const dayNote = computed({
  get: () => day.value?.note || "",
  set: (value) => {
    if (day.value) day.value.note = value;
    scheduleDaySave();
  },
});

const dayFocus = computed({
  get: () => day.value?.focus || "",
  set: (value) => {
    if (day.value) day.value.focus = value;
    scheduleDaySave();
  },
});

const dayCapacity = computed({
  get: () => day.value?.capacityHours || 0,
  set: (value) => {
    if (day.value) day.value.capacityHours = Number(value) || 0;
    scheduleDaySave();
  },
});

function scheduleDaySave() {
  clearTimeout(dayNoteTimer);
  dayNoteTimer = setTimeout(async () => {
    try {
      await saveWorkDay({
        date: date.value,
        note: day.value?.note || "",
        focus: day.value?.focus || "",
        capacityHours: day.value?.capacityHours || 0,
      });
    } catch (e) {
      error.value = e.message;
    }
  }, 700);
}

// --- Дисциплина ---

async function toggleDiscipline() {
  disciplineOpen.value = !disciplineOpen.value;
  if (disciplineOpen.value && !disciplineMonth.value) await loadDiscipline();
}

async function loadDiscipline() {
  try {
    const [y, m] = date.value.split("-");
    disciplineMonth.value = await fetchDisciplineMonth(parseInt(m, 10), parseInt(y, 10));
  } catch (e) {
    disciplineMonth.value = null;
  }
}

// --- Прочее ---

async function syncAll() {
  try {
    const result = await syncWorkDayToGoogle(date.value);
    error.value = "";
    await load();
    alert(`Отправлено в Google Calendar: ${result.synced}`);
  } catch (e) {
    error.value = e.message;
  }
}

function openFromSearch({ date: foundDate, itemId }) {
  searchOpen.value = false;
  pendingSelect.value = itemId;
  if (foundDate !== date.value) {
    date.value = foundDate; // watch(date) сам перезагрузит и подхватит pendingSelect
  } else {
    load();
  }
  if (isNarrow.value) mobileEditor.value = true;
}

function humanMinutes(minutes) {
  if (!minutes) return "0 ч";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} м`;
  if (h) return `${h} ч`;
  return `${m} м`;
}

function itemDeadline(item) {
  if (!item.deadline) return "";
  const d = new Date(item.deadline);
  if (!item.deadlineHasTime) return "до конца дня";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function isOverdue(item) {
  if (!item.deadline || item.status === "done" || item.status === "dropped") return false;
  return new Date(item.deadline) < new Date();
}

// Блокеры живут на связанных задачах, но мешают именно этой карточке —
// поэтому поднимаем их на неё.
function blockersOf(item) {
  return (item.tasks || []).reduce((sum, t) => sum + (t.openBlockers || 0), 0);
}

function blockersHint(item) {
  return (item.tasks || [])
    .filter((t) => t.openBlockers > 0)
    .map((t) => `${t.title} — ${t.openBlockers}`)
    .join("\n");
}

function slotLabel(item) {
  if (item.plannedStartMin < 0) return "";
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return item.plannedEndMin > item.plannedStartMin
    ? `${fmt(item.plannedStartMin)}–${fmt(item.plannedEndMin)}`
    : fmt(item.plannedStartMin);
}
</script>

<template>
  <div class="ws">
    <header class="ws-head">
      <div class="ws-nav">
        <button class="ws-icon" title="Предыдущий день" @click="shiftDate(-1)">‹</button>
        <div class="ws-date">
          <h1>{{ dayTitle }}</h1>
          <input type="date" v-model="date" class="ws-date-input" />
        </div>
        <button class="ws-icon" title="Следующий день" @click="shiftDate(1)">›</button>
        <button v-if="!isToday" class="ws-btn ghost" @click="goToday">Сегодня</button>
      </div>

      <div class="ws-modes">
        <button
          v-for="m in VIEW_MODES"
          :key="m.key"
          class="ws-mode"
          :class="{ on: viewMode === m.key }"
          :title="m.hint"
          @click="setViewMode(m.key)"
        >
          {{ m.label }}
        </button>
      </div>

      <div class="ws-actions">
        <button class="ws-btn" @click="searchOpen = true" title="Ctrl+K">🔍 Поиск</button>
        <button class="ws-btn" :class="{ hot: carryCount }" @click="carryOpen = true">
          ↩ Из прошлых дней<span v-if="carryCount"> · {{ carryCount }}</span>
        </button>
        <button class="ws-btn" @click="toggleDiscipline">🎯 Дисциплина</button>
        <button class="ws-btn" :class="{ hot: sportOpen }" @click="sportOpen = !sportOpen">
          🏋️ Спорт
        </button>
        <button class="ws-btn" :class="{ hot: roadmapOpen }" @click="roadmapOpen = !roadmapOpen">
          🗺️ Чтение
        </button>
        <button class="ws-btn" @click="googleOpen = true">
          📅 Google<span v-if="day?.google?.connected" class="ws-dot-ok"></span>
        </button>
        <button class="ws-btn primary" @click="addItem">+ Задача</button>
        <button class="ws-btn ghost" @click="router.push('/')">На главную</button>
      </div>
    </header>

    <div v-if="error" class="ws-error">{{ error }}</div>

    <section class="ws-strip">
      <!-- В общем виде цель дня показывает сам DayOverview, не дублируем -->
      <input
        v-if="viewMode !== 'all'"
        v-model="dayFocus"
        class="ws-focus"
        placeholder="🎯 Главная цель дня…"
      />
      <div class="ws-stats">
        <span class="ws-stat"><b>{{ totals.done || 0 }}</b>/{{ totals.total || 0 }} задач</span>
        <span class="ws-stat">план <b>{{ humanMinutes(totals.estimateMinutes) }}</b></span>
        <span class="ws-stat">факт <b>{{ humanMinutes(totals.spentMinutes) }}</b></span>
        <span v-if="totals.overdueCount" class="ws-stat bad">просрочено {{ totals.overdueCount }}</span>
        <label class="ws-cap">
          ёмкость
          <input v-model="dayCapacity" type="number" min="0" step="0.5" class="ws-cap-input" /> ч
        </label>
      </div>
    </section>

    <div
      v-if="dayCapacity > 0"
      class="ws-load"
      :title="`Запланировано ${humanMinutes(totals.estimateMinutes)} из ${dayCapacity} ч`"
    >
      <div
        class="ws-load-fill"
        :class="{ over: totals.estimateMinutes > dayCapacity * 60 }"
        :style="{ width: Math.min(100, ((totals.estimateMinutes || 0) / (dayCapacity * 60)) * 100) + '%' }"
      ></div>
    </div>

    <section v-if="disciplineOpen" class="ws-discipline">
      <DisciplineChecklist
        v-if="disciplineMonth"
        :month="disciplineMonth"
        :date="date"
        @changed="loadDiscipline"
      />
      <div v-else class="ws-empty">Плана дисциплины на этот месяц пока нет</div>
    </section>

    <section v-if="sportOpen" class="ws-discipline">
      <SportTodayCard :date="date" />
    </section>

    <!-- Чтение по roadmap'у — docs/roadmap-module.md -->
    <section v-if="roadmapOpen" class="ws-discipline">
      <RoadmapWidget />
    </section>

    <section v-if="viewMode !== 'all'" class="ws-daynote">
      <button class="ws-daynote-toggle" @click="noteOpen = !noteOpen">
        {{ noteOpen ? "▾" : "▸" }} Холст дня
        <span v-if="!noteOpen && dayNote" class="ws-dim">— есть записи</span>
      </button>
      <MarkdownField
        v-if="noteOpen"
        v-model="dayNote"
        :min-height="160"
        placeholder="Общие мысли по дню, что вообще происходит, куда двигаемся…"
      />
    </section>

    <DayOverview
      v-if="viewMode === 'all'"
      :items="items"
      :note="day?.note || ''"
      :focus="day?.focus || ''"
      :date="date"
      :is-today="isToday"
      :main-subtasks="day?.mainSubtasks || []"
      @open="openFromOverview"
      @add="addItem"
      @move="moveItem"
      @sort="sortByTime"
      @refresh="load"
    />

    <div v-else class="ws-body" :class="{ narrow: isNarrow }">
      <aside class="ws-list" v-show="!isNarrow || !mobileEditor">
        <div class="ws-filters">
          <button
            v-for="f in FILTERS"
            :key="f.key"
            class="ws-filter"
            :class="{ on: filter === f.key }"
            @click="filter = f.key"
          >
            {{ f.label }}
          </button>
          <button
            class="ws-filter sort"
            title="Выстроить карточки по времени"
            @click="sortByTime"
          >
            🕐 по времени
          </button>
        </div>

        <div v-if="loading" class="ws-empty">Загружаю…</div>
        <div v-else-if="!visibleItems.length" class="ws-empty">
          <p>Пока пусто.</p>
          <button class="ws-btn primary" @click="addItem">Создать первую задачу</button>
          <button v-if="carryCount" class="ws-btn" @click="carryOpen = true">
            Забрать {{ carryCount }} из прошлых дней
          </button>
        </div>

        <article
          v-for="item in visibleItems"
          :key="item.id"
          class="ws-card"
          :class="{
            on: item.id === selectedId,
            done: item.status === 'done',
            dropped: item.status === 'dropped',
            blocked: blockersOf(item) > 0,
          }"
          :style="{ borderLeftColor: blockersOf(item) ? '#e5484d' : item.color || '#1767fd' }"
          draggable="true"
          @dragstart="onDragStart(item)"
          @dragover.prevent
          @drop="onDrop(item)"
          @click="selectItem(item)"
        >
          <button
            class="ws-card-status"
            :style="{
              borderColor: STATUS_META[item.status]?.color,
              background: item.status === 'done' ? STATUS_META.done.color : 'transparent',
              color: item.status === 'done' ? '#101219' : STATUS_META[item.status]?.color,
            }"
            :title="STATUS_META[item.status]?.label"
            @click="cycleStatus(item, $event)"
          >
            <span v-if="item.status === 'done'">✓</span>
            <span v-else-if="item.status === 'doing'">▶</span>
            <span v-else-if="item.status === 'paused'">‖</span>
            <span v-else-if="item.status === 'dropped'">✕</span>
          </button>

          <div class="ws-card-main">
            <div class="ws-card-title">
              <span v-if="item.emoji" class="ws-card-emoji">{{ item.emoji }}</span>
              {{ item.title }}
              <span v-if="item.priority" class="ws-card-prio">{{ "!".repeat(item.priority) }}</span>
            </div>

            <div class="ws-card-meta">
              <span
                v-if="blockersOf(item)"
                class="ws-meta-chip blocker"
                :title="blockersHint(item)"
              >
                🚧 {{ blockersOf(item) }}
              </span>
              <span v-if="slotLabel(item)" class="ws-meta-chip time">{{ slotLabel(item) }}</span>
              <span v-if="item.deadline" class="ws-meta-chip" :class="{ bad: isOverdue(item) }">
                ⏳ {{ itemDeadline(item) }}
              </span>
              <span v-if="item.estimateMinutes" class="ws-meta-chip">
                {{ humanMinutes(item.estimateMinutes) }}
              </span>
              <span v-if="item.checks?.length" class="ws-meta-chip">
                ☑ {{ item.checks.filter((c) => c.done).length }}/{{ item.checks.length }}
              </span>
              <span v-if="item.tasks?.length" class="ws-meta-chip">🔗 {{ item.tasks.length }}</span>
              <span v-if="item.links?.length" class="ws-meta-chip">🌐 {{ item.links.length }}</span>
              <span v-if="item.notes?.length" class="ws-meta-chip">🗒 {{ item.notes.length }}</span>
              <span v-if="item.files?.length" class="ws-meta-chip">📎 {{ item.files.length }}</span>
              <span v-if="item.googleEventId" class="ws-meta-chip cal">📅</span>
              <span v-if="item.otherDates?.length" class="ws-meta-chip link" title="Карточка есть и в других днях">
                ⧉ {{ item.otherDates.length }}
              </span>
            </div>

            <div v-if="item.tags?.length" class="ws-card-tags">
              <span v-for="t in item.tags" :key="t.id" class="ws-tag" :style="{ borderColor: t.color }">
                {{ t.name }}
              </span>
            </div>
          </div>
        </article>

        <button v-if="visibleItems.length" class="ws-add-inline" @click="addItem">+ ещё задача</button>
        <button v-if="day?.google?.connected && items.length" class="ws-add-inline" @click="syncAll">
          📅 Синхронизировать день с Google
        </button>

        <!-- Задачи с главного экрана: закрыть или утащить в день, не уходя отсюда -->
        <MainTasksPanel class="ws-main-tasks" :date="date" @added="load" />
      </aside>

      <main class="ws-editor" v-show="!isNarrow || mobileEditor">
        <WorkItemView
          v-if="selected && viewMode === 'work'"
          :key="'view-' + selected.id"
          :item="selected"
          :date="date"
          :compact="isNarrow"
          @changed="load"
          @edit="setViewMode('edit')"
          @close="mobileEditor = false"
        />
        <WorkItemEditor
          v-else-if="selected"
          :key="'edit-' + selected.id"
          :item="selected"
          :date="date"
          :skills="day?.skills || []"
          :activities="day?.activities || []"
          :all-tags="day?.tags || []"
          :google="day?.google || {}"
          :compact="isNarrow"
          @changed="load"
          @deleted="() => { mobileEditor = false; load({ keepSelection: false }); }"
          @close="mobileEditor = false"
        />
        <div v-else class="ws-editor-empty">
          <p>Выберите карточку слева или создайте новую.</p>
          <button class="ws-btn primary" @click="addItem">+ Задача</button>
        </div>
      </main>
    </div>

    <CarryModal
      v-if="carryOpen"
      :carry="day?.carry || []"
      :date="date"
      @close="carryOpen = false"
      @done="() => { carryOpen = false; load({ keepSelection: false }); }"
    />
    <GooglePanel
      v-if="googleOpen"
      :status="day?.google || {}"
      :date="date"
      @close="googleOpen = false"
      @changed="load"
    />
    <SearchModal v-if="searchOpen" @close="searchOpen = false" @open="openFromSearch" />
  </div>
</template>

<style scoped>
.ws {
  min-height: 100vh;
  width: 100%;
  background: #18191f;
  color: #e8eaf2;
  padding: 14px clamp(10px, 2.5vw, 32px) 40px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ws-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ws-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ws-date h1 {
  margin: 0;
  font-size: 20px;
  text-transform: capitalize;
  line-height: 1.2;
}

.ws-date-input {
  background: transparent;
  border: none;
  color: #7a7f8e;
  font-size: 11.5px;
  padding: 0;
  cursor: pointer;
  outline: none;
}

.ws-icon {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  width: 34px;
  height: 34px;
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
}

.ws-icon:hover {
  border-color: #6e4aff;
}

.ws-modes {
  display: flex;
  gap: 2px;
  background: #16171d;
  border: 1px solid #2a2d38;
  border-radius: 10px;
  padding: 3px;
}

.ws-mode {
  background: transparent;
  border: none;
  color: #8f95a6;
  border-radius: 7px;
  padding: 6px 15px;
  cursor: pointer;
  font-size: 12.5px;
  min-height: 32px;
  transition: background 0.15s, color 0.15s;
}

.ws-mode:hover {
  color: #cfd3e0;
}

.ws-mode.on {
  background: #1767fd;
  color: #fff;
  font-weight: 600;
}

.ws-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ws-btn {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 7px 13px;
  cursor: pointer;
  font-size: 13px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ws-btn:hover {
  border-color: #6e4aff;
}

.ws-btn.primary {
  background: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

.ws-btn.ghost {
  background: transparent;
  color: #8f95a6;
}

.ws-btn.hot {
  border-color: #ffd666;
  color: #ffd666;
}

.ws-dot-ok {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #63c94f;
}

.ws-error {
  background: #2a181a;
  border: 1px solid #6b2b2e;
  color: #ff9ba0;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
}

.ws-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  background: #1b1d24;
  border: 1px solid #262a36;
  border-radius: 12px;
  padding: 10px 14px;
}

.ws-focus {
  flex: 1;
  min-width: 200px;
  background: transparent;
  border: none;
  color: #e8eaf2;
  font-size: 15px;
  outline: none;
}

.ws-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ws-stat {
  color: #8f95a6;
  font-size: 12.5px;
}

.ws-stat b {
  color: #e8eaf2;
}

.ws-stat.bad {
  color: #e5484d;
}

.ws-cap {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #8f95a6;
  font-size: 12px;
}

.ws-cap-input {
  width: 54px;
  background: #16171d;
  border: 1px solid #2f3340;
  border-radius: 6px;
  color: #e8eaf2;
  padding: 4px 6px;
  font-size: 12px;
  outline: none;
}

.ws-load {
  height: 5px;
  background: #22242d;
  border-radius: 3px;
  overflow: hidden;
}

.ws-load-fill {
  height: 100%;
  background: linear-gradient(90deg, #1767fd, #6e4aff);
}

.ws-load-fill.over {
  background: linear-gradient(90deg, #e5484d, #ff8a3d);
}

.ws-discipline {
  background: #1b1d24;
  border: 1px solid #262a36;
  border-radius: 12px;
  padding: 8px;
}

.ws-daynote {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ws-daynote-toggle {
  background: none;
  border: none;
  color: #b7bccb;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  padding: 0;
}

.ws-dim {
  color: #6e7382;
  font-size: 11.5px;
}

.ws-body {
  display: grid;
  grid-template-columns: minmax(280px, 380px) 1fr;
  gap: 12px;
  align-items: start;
  flex: 1;
  min-height: 0;
}

.ws-body.narrow {
  grid-template-columns: 1fr;
}

.ws-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-height: calc(100vh - 150px);
  overflow-y: auto;
  padding-right: 4px;
}

.ws-filters {
  display: flex;
  gap: 4px;
  position: sticky;
  top: 0;
  background: #18191f;
  padding-bottom: 5px;
  z-index: 2;
}

.ws-filter {
  background: transparent;
  border: 1px solid #2f3340;
  color: #8f95a6;
  border-radius: 20px;
  padding: 4px 11px;
  cursor: pointer;
  font-size: 11.5px;
  min-height: 30px;
}

.ws-filter.on {
  background: #1767fd22;
  border-color: #1767fd;
  color: #cfe0ff;
}

.ws-filter.sort {
  margin-left: auto;
  border-style: dashed;
}

.ws-filter.sort:hover {
  border-color: #e07b39;
  border-style: solid;
  color: #ffd9b0;
}

.ws-main-tasks {
  margin-top: 6px;
}

.ws-card {
  display: flex;
  gap: 9px;
  background: #1b1d24;
  border: 1px solid #262a36;
  border-left: 3px solid #1767fd;
  border-radius: 10px;
  padding: 10px 11px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.ws-card:hover {
  background: #1f222b;
}

.ws-card.on {
  border-color: #1767fd;
  background: #1c2030;
}

.ws-card.done .ws-card-title,
.ws-card.dropped .ws-card-title {
  color: #6e7382;
  text-decoration: line-through;
}

/* Цвет глифа задаётся инлайном: на прозрачном кружке — цвет статуса,
   на залитом «готово» — тёмный. */
.ws-card-status {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #5b616e;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
  transition: transform 0.12s;
}

.ws-card-status:hover {
  transform: scale(1.12);
}

.ws-card-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1;
}

.ws-card-title {
  color: #e8eaf2;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ws-card-emoji {
  margin-right: 4px;
}

.ws-card-prio {
  color: #e5484d;
  font-weight: 700;
  margin-left: 5px;
  font-size: 12px;
}

.ws-card-meta {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.ws-meta-chip {
  font-size: 10.5px;
  color: #8f95a6;
  background: #16171d;
  border: 1px solid #262a36;
  border-radius: 20px;
  padding: 1px 7px;
}

.ws-meta-chip.bad {
  color: #ff9ba0;
  border-color: #6b2b2e;
}

/* Время в списке читается как время, а не как ещё один серый значок */
.ws-meta-chip.time {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #ffd9b0;
  background: rgba(224, 123, 57, 0.14);
  border-color: rgba(224, 123, 57, 0.4);
  padding: 1px 8px;
}

/* Блокер связанной задачи виден прямо на карточке дня */
.ws-meta-chip.blocker {
  color: #fff;
  font-weight: 700;
  background: #e5484d;
  border-color: #ff6b6f;
}

.ws-card.blocked {
  background: linear-gradient(90deg, rgba(229, 72, 77, 0.15), #1b1d24 60%);
  border-color: #4a2225;
}

.ws-card.blocked:hover {
  background: linear-gradient(90deg, rgba(229, 72, 77, 0.22), #1f222b 60%);
}

.ws-card.blocked.on {
  background: linear-gradient(90deg, rgba(229, 72, 77, 0.26), #1c2030 60%);
  border-color: #e5484d;
}

.ws-meta-chip.cal {
  border-color: #1767fd66;
}

.ws-meta-chip.link {
  color: #a98bff;
  border-color: #6e4aff55;
}

.ws-card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.ws-tag {
  font-size: 10.5px;
  color: #cfd3e0;
  border: 1px solid #6e4aff;
  border-radius: 20px;
  padding: 1px 8px;
}

.ws-add-inline {
  background: transparent;
  border: 1px dashed #3a3f52;
  color: #8f95a6;
  border-radius: 10px;
  padding: 9px;
  cursor: pointer;
  font-size: 12.5px;
}

.ws-add-inline:hover {
  border-color: #6e4aff;
  color: #cfd3e0;
}

.ws-editor {
  background: #16171d;
  border: 1px solid #262a36;
  border-radius: 12px;
  max-height: calc(100vh - 150px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ws-editor-empty {
  padding: 60px 20px;
  text-align: center;
  color: #7a7f8e;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.ws-empty {
  color: #7a7f8e;
  text-align: center;
  padding: 22px 10px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

@media (max-width: 900px) {
  .ws {
    padding: 10px 10px 30px;
  }
  .ws-head {
    gap: 8px;
  }
  .ws-date h1 {
    font-size: 17px;
  }
  .ws-modes {
    width: 100%;
  }
  .ws-mode {
    flex: 1;
  }
  .ws-actions {
    width: 100%;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 2px;
  }
  .ws-actions .ws-btn {
    flex-shrink: 0;
  }
  .ws-list,
  .ws-editor {
    max-height: none;
  }
  .ws-editor {
    min-height: calc(100vh - 120px);
  }
}
</style>
