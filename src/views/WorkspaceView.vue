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
const mainOpen = ref(false);
const disciplineOpen = ref(false);
const sportOpen = ref(false);
const roadmapOpen = ref(false);
const disciplineMonth = ref(null);

// День — это доска. Карточка не уводит на отдельный экран, а выдвигает панель
// справа: рабочий вид со всем хозяйством, включая блокеры связанных задач, и
// правка в ней же по кнопке. Раньше это были три режима страницы, и дорога от
// доски к карточке и обратно каждый раз шла через переключатель.
const drawerOpen = ref(false);
const drawerMode = ref("view"); // view | edit

function openItem(itemId, mode = "view") {
  selectedId.value = itemId;
  drawerMode.value = mode;
  drawerOpen.value = true;
}

function closeDrawer() {
  drawerOpen.value = false;
}

const isNarrow = ref(window.innerWidth < 900);

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
    return;
  }
  // Esc закрывает панель карточки — но только если поверх неё нет модалки.
  const modalOpen = carryOpen.value || googleOpen.value || searchOpen.value;
  if (e.key === "Escape" && drawerOpen.value && !modalOpen) closeDrawer();
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
  drawerOpen.value = false;
  load({ keepSelection: false });
  if (disciplineOpen.value) loadDiscipline();
});

const items = computed(() => day.value?.items || []);

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

// Новая карточка сразу открывается в правке: у неё пока нет даже названия.
async function addItem() {
  try {
    const { id } = await createWorkItem({ date: date.value, title: "" });
    await load({ keepSelection: false });
    openItem(id, "edit");
    await nextTick();
    document.querySelector(".wie-title")?.focus();
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

function openFromSearch({ date: foundDate, itemId }) {
  searchOpen.value = false;
  pendingSelect.value = itemId;
  if (foundDate !== date.value) {
    date.value = foundDate; // watch(date) сам перезагрузит и подхватит pendingSelect
  } else {
    load();
  }
  drawerMode.value = "view";
  drawerOpen.value = true;
}

function humanMinutes(minutes) {
  if (!minutes) return "0 ч";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} м`;
  if (h) return `${h} ч`;
  return `${m} м`;
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
        <button class="ws-btn" :class="{ hot: mainOpen }" @click="mainOpen = !mainOpen">
          📌 С главной
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
      <input
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

    <!-- Задачи с главной целиком: на доске из них видны только подзадачи,
         у которых сегодня срок. -->
    <section v-if="mainOpen" class="ws-discipline">
      <MainTasksPanel :date="date" @added="load" />
    </section>

    <section class="ws-daynote">
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

    <div v-if="loading" class="ws-empty">Загружаю…</div>

    <DayOverview
      v-else
      :items="items"
      :date="date"
      :is-today="isToday"
      :main-subtasks="day?.mainSubtasks || []"
      :task-statuses="day?.taskStatuses || []"
      @open="openItem"
      @add="addItem"
      @move="moveItem"
      @sort="sortByTime"
      @refresh="load"
    />

    <!-- Карточка дня: выдвигается справа поверх доски, доска остаётся на месте.
         Внутри — рабочий вид, из него по кнопке правка; связанные задачи,
         статусы и блокеры живут там же. -->
    <transition name="ws-fade">
      <div v-if="drawerOpen && selected" class="ws-scrim" @click="closeDrawer"></div>
    </transition>

    <transition name="ws-slide">
      <aside v-if="drawerOpen && selected" class="ws-drawer">
        <div class="ws-drawer-bar">
          <button class="ws-drawer-close" title="Закрыть · Esc" @click="closeDrawer">✕</button>
          <button
            v-if="drawerMode === 'edit'"
            class="ws-drawer-mode"
            @click="drawerMode = 'view'"
          >
            ‹ Рабочий вид
          </button>
          <span v-else class="ws-drawer-hint">карточка дня</span>
        </div>

        <div class="ws-drawer-body">
          <WorkItemView
            v-if="drawerMode === 'view'"
            :key="'view-' + selected.id"
            :item="selected"
            :date="date"
            :compact="isNarrow"
            @changed="load"
            @edit="drawerMode = 'edit'"
            @close="closeDrawer"
          />
          <WorkItemEditor
            v-else
            :key="'edit-' + selected.id"
            :item="selected"
            :date="date"
            :skills="day?.skills || []"
            :activities="day?.activities || []"
            :all-tags="day?.tags || []"
            :google="day?.google || {}"
            :compact="isNarrow"
            @changed="load"
            @deleted="() => { closeDrawer(); load({ keepSelection: false }); }"
            @close="closeDrawer"
          />
        </div>
      </aside>
    </transition>

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

.ws-card.done .ws-card-title,

/* Цвет глифа задаётся инлайном: на прозрачном кружке — цвет статуса,
   на залитом «готово» — тёмный. */

/* Время в списке читается как время, а не как ещё один серый значок */

/* Блокер связанной задачи виден прямо на карточке дня */

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

/* --- Выдвижная панель карточки --- */

/* Карточка открывается поверх доски, а не вместо неё: видно, из какой колонки
   она пришла, и закрыть её можно куда угодно — Esc, крестик, тёмный фон. */
.ws-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2200;
  width: min(620px, 100vw);
  background: #16171d;
  border-left: 1px solid #2a2d38;
  box-shadow: -18px 0 46px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Своя шапка у ящика: панели карточки закрывающей кнопки не имели — на
   прежней раскладке они просто всегда лежали справа и закрывать было нечего. */
.ws-drawer-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid #262a36;
  background: #1b1d24;
  flex-shrink: 0;
}

.ws-drawer-close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid #2f3340;
  background: #22242d;
  color: #cfd3e0;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.ws-drawer-close:hover {
  border-color: #e5484d;
  color: #ff9ba0;
}

.ws-drawer-mode {
  background: none;
  border: 1px solid #2f3340;
  border-radius: 8px;
  color: #cfd3e0;
  font-size: 12px;
  padding: 6px 12px;
  cursor: pointer;
}

.ws-drawer-mode:hover {
  border-color: #6e4aff;
}

.ws-drawer-hint {
  color: #5b6070;
  font-size: 11.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ws-drawer-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ws-scrim {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: rgba(8, 9, 13, 0.55);
}

.ws-slide-enter-active,
.ws-slide-leave-active {
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.ws-slide-enter-from,
.ws-slide-leave-to {
  transform: translateX(100%);
}

.ws-fade-enter-active,
.ws-fade-leave-active {
  transition: opacity 0.22s;
}

.ws-fade-enter-from,
.ws-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ws-slide-enter-active,
  .ws-slide-leave-active,
  .ws-fade-enter-active,
  .ws-fade-leave-active {
    transition: none;
  }
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
  .ws-actions {
    width: 100%;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 2px;
  }
  .ws-actions .ws-btn {
    flex-shrink: 0;
  }
  .ws-drawer {
    width: 100%;
    border-left: none;
  }
}
</style>
