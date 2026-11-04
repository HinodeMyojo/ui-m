<script setup>
// Раздел «Календарь»: месяц, неделя, день и список, справа — сегодня.
// События сверяются с Google Calendar на сервере в обе стороны; страница
// раз в минуту перечитывает окно, чтобы правки из Google доезжали сами.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import FullCalendar from "@fullcalendar/vue3";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import ruLocale from "@fullcalendar/core/locales/ru";
import { isMobile } from "@/composables/useIsMobile.js";
import { fetchWorkDay } from "@/components/api.js";
import {
  exchangeGoogleCode,
  fetchCalendarEvents,
  fetchCalendarStatus,
  fetchGoogleAuthUrl,
  setGoogleCalendarId,
  disconnectGoogle,
  syncCalendarNow,
  updateCalendarEvent,
} from "@/components/calendarApi.js";
import CalendarEventModal from "@/components/calendar/CalendarEventModal.vue";
import CalendarTodayPanel from "@/components/calendar/CalendarTodayPanel.vue";
import {
  LAYERS,
  addDays,
  browserZone,
  eventColor,
  layerOf,
  logicalToday,
  ymd,
} from "@/components/calendar/calendarLayers.js";

const route = useRoute();
const router = useRouter();

const fc = ref(null);
const api = () => fc.value?.getApi();

const VIEWS = [
  { key: "dayGridMonth", title: "Месяц" },
  { key: "timeGridWeek", title: "Неделя" },
  { key: "timeGridDay", title: "День" },
  { key: "listMonth", title: "Список" },
];
const VIEW_KEY = "calendar.view";
const HIDDEN_KEY = "calendar.hiddenLayers";

const currentView = ref(
  isMobile.value ? "listMonth" : localStorage.getItem(VIEW_KEY) || "timeGridWeek",
);
const viewTitle = ref("");
const range = ref({ from: "", to: "" });

const rawEvents = ref([]);
const loading = ref(false);
const error = ref("");

const hidden = ref(new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]")));
function toggleLayer(key) {
  const next = new Set(hidden.value);
  next.has(key) ? next.delete(key) : next.add(key);
  hidden.value = next;
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
}
const layerCounts = computed(() => {
  const out = {};
  for (const ev of rawEvents.value) out[ev.category] = (out[ev.category] || 0) + 1;
  return out;
});

// --- Google ---
const status = ref(null);
const syncing = ref(false);
const googleOpen = ref(false);
const calendarIdDraft = ref("");
const googleMessage = ref("");
const redirectUri = `${window.location.origin}/calendar`;

// Время на сетке — в зоне браузера. Не Москва — подписываем, иначе пара в
// 18:30 по Москве, показанная как 16:30, выглядит ошибкой.
const zone = browserZone();
const zoneNote = computed(() => {
  if (zone === "Europe/Moscow") return "";
  const offset = -new Date().getTimezoneOffset() / 60 - 3;
  const sign = offset > 0 ? "+" : "−";
  return offset ? `время ${zone} (МСК${sign}${Math.abs(offset)})` : "";
});

const syncedAgo = computed(() => {
  if (!status.value?.lastSyncAt) return "ещё не сверялось";
  const min = Math.round((Date.now() - new Date(status.value.lastSyncAt).getTime()) / 60000);
  if (min < 1) return "сверено только что";
  if (min < 60) return `сверено ${min} мин назад`;
  return `сверено ${Math.round(min / 60)} ч назад`;
});

async function loadStatus() {
  try {
    status.value = await fetchCalendarStatus();
    calendarIdDraft.value = status.value.calendarId || "primary";
  } catch {
    /* статус — подсказка, без него календарь работает */
  }
}

async function connectGoogle() {
  googleMessage.value = "";
  try {
    const { url } = await fetchGoogleAuthUrl(redirectUri);
    localStorage.setItem("googleRedirectUri", redirectUri);
    window.location.href = url;
  } catch (e) {
    googleMessage.value = e.message;
  }
}

async function syncNow() {
  syncing.value = true;
  googleMessage.value = "";
  try {
    const res = await syncCalendarNow();
    const parts = [];
    if (res.pulled) parts.push(`из Google ${res.pulled}`);
    if (res.pushed) parts.push(`в Google ${res.pushed}`);
    if (res.removed) parts.push(`удалено ${res.removed}`);
    if (res.failed) parts.push(`не ушло ${res.failed}`);
    googleMessage.value = parts.length ? parts.join(", ") : "всё уже совпадает";
    await Promise.all([reload(), loadStatus()]);
  } catch (e) {
    googleMessage.value = e.message;
    await loadStatus();
  } finally {
    syncing.value = false;
  }
}

async function saveCalendarId() {
  try {
    await setGoogleCalendarId(calendarIdDraft.value.trim() || "primary");
    await syncNow();
  } catch (e) {
    googleMessage.value = e.message;
  }
}

async function disconnect() {
  if (!confirm("Отключить Google? События в Google останутся, на сайте — тоже.")) return;
  await disconnectGoogle();
  await loadStatus();
}

// Google вернул сюда с ?code=… — меняем на доступ и сразу сверяем.
async function handleGoogleCallback() {
  const code = route.query.code;
  if (!code) return;
  try {
    await exchangeGoogleCode(code, localStorage.getItem("googleRedirectUri") || redirectUri);
    localStorage.removeItem("googleRedirectUri");
    await router.replace({ path: "/calendar" });
    await loadStatus();
    await syncNow();
  } catch (e) {
    error.value = `Google не подключился: ${e.message}`;
    router.replace({ path: "/calendar" });
  }
}

// --- События ---
async function load(from, to) {
  loading.value = true;
  error.value = "";
  try {
    rawEvents.value = (await fetchCalendarEvents(from, to)) || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
const reload = () => (range.value.from ? Promise.all([load(range.value.from, range.value.to), loadToday()]) : null);

function toFc(ev) {
  const color = eventColor(ev);
  return {
    id: ev.id,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    backgroundColor: color,
    borderColor: color,
    classNames: ev.googlePending && status.value?.connected ? ["cal-pending"] : [],
    extendedProps: { raw: ev },
  };
}

// Призрак выделения и перетаскивания — событие без наших данных.
const rawOf = (arg) => arg.event.extendedProps?.raw || {};

const fcEvents = computed(() =>
  rawEvents.value.filter((ev) => !hidden.value.has(ev.category)).map(toFc),
);

// --- Сегодня ---
const today = ref(logicalToday());
const todayEvents = ref([]);
const todayCards = ref([]);
const todayLoading = ref(false);

async function loadToday() {
  today.value = logicalToday();
  todayLoading.value = true;
  try {
    const [events, day] = await Promise.all([
      fetchCalendarEvents(today.value, addDays(today.value, 2)),
      fetchWorkDay(today.value).catch(() => null),
    ]);
    todayEvents.value = (events || []).filter((ev) => !hidden.value.has(ev.category));
    todayCards.value = day?.items || [];
  } catch {
    /* правая колонка — не повод ломать страницу */
  } finally {
    todayLoading.value = false;
  }
}
watch(hidden, loadToday);

// --- Карточка события ---
const modal = ref(null); // { event } | { draft }

function openEvent(ev) {
  modal.value = { event: ev };
}

function openDraft(draft) {
  modal.value = { draft };
}

function newEvent() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  openDraft({ start, end: new Date(start.getTime() + 3600 * 1000), allDay: false });
}

function newToday() {
  newEvent();
}

async function onSaved() {
  modal.value = null;
  await reload();
  loadStatus();
}

async function moveEvent(info) {
  const ev = info.event;
  const raw = ev.extendedProps?.raw;
  if (!raw) return info.revert();
  const allDay = ev.allDay;
  const patch = { allDay, timeZone: raw.timeZone || browserZone() };
  if (allDay) {
    patch.start = ymd(ev.start);
    patch.end = ev.end ? ymd(ev.end) : addDays(ymd(ev.start), 1);
  } else {
    patch.start = ev.start.toISOString();
    patch.end = (ev.end || new Date(ev.start.getTime() + 3600 * 1000)).toISOString();
  }
  try {
    await updateCalendarEvent(raw.id, patch, false);
    await reload();
    loadStatus();
  } catch (e) {
    info.revert();
    error.value = e.message;
  }
}

// --- Сетка ---
const height = ref(window.innerHeight - 130);
function onResize() {
  height.value = Math.max(480, window.innerHeight - 130);
}

const options = computed(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  locale: ruLocale,
  initialView: currentView.value,
  initialDate: typeof route.query.date === "string" ? route.query.date : undefined,
  headerToolbar: false,
  height: currentView.value === "listMonth" ? "auto" : height.value,
  firstDay: 1,
  nowIndicator: true,
  editable: true,
  selectable: true,
  selectMirror: true,
  dayMaxEvents: true,
  // В месяце — цветные плашки, а не точки: слой виден с первого взгляда.
  eventDisplay: "block",
  weekNumbers: false,
  slotMinTime: "07:00:00",
  slotMaxTime: "24:00:00",
  scrollTime: "08:00:00",
  slotDuration: "00:30:00",
  allDayText: "весь день",
  noEventsText: "Событий нет",
  eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
  slotLabelFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
  events: fcEvents.value,
  datesSet: (info) => {
    viewTitle.value = info.view.title;
    currentView.value = info.view.type;
    const from = ymd(info.start);
    const to = ymd(info.end);
    if (from !== range.value.from || to !== range.value.to) {
      range.value = { from, to };
      load(from, to);
    }
  },
  select: (info) => {
    openDraft({ start: info.start, end: info.end, allDay: info.allDay });
    api()?.unselect();
  },
  eventClick: (info) => {
    info.jsEvent.preventDefault();
    if (info.event.extendedProps?.raw) openEvent(info.event.extendedProps.raw);
  },
  eventDrop: moveEvent,
  eventResize: moveEvent,
}));

function changeView(key) {
  currentView.value = key;
  if (!isMobile.value) localStorage.setItem(VIEW_KEY, key);
  api()?.changeView(key);
}
const prev = () => api()?.prev();
const next = () => api()?.next();
const goToday = () => api()?.today();

function onKey(e) {
  if (modal.value || googleOpen.value) return;
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (e.key === "n" || e.key === "т") newEvent();
  else if (e.key === "t" || e.key === "е") goToday();
  else if (e.key === "ArrowLeft") prev();
  else if (e.key === "ArrowRight") next();
}

let poll = null;
onMounted(async () => {
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKey);
  await handleGoogleCallback();
  loadStatus();
  loadToday();
  // Раз в минуту, и только пока вкладку видно: правки из Google доезжают
  // на сервер поллером, страница их просто перечитывает.
  poll = setInterval(() => {
    if (document.visibilityState === "visible") {
      reload();
      loadStatus();
    }
  }, 60 * 1000);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onKey);
  clearInterval(poll);
});
</script>

<template>
  <div class="cal-page" :class="{ mobile: isMobile }">
    <header class="cal-head">
      <div class="cal-head-left">
        <button class="cal-btn ghost" title="На главную" @click="router.push('/')">←</button>
        <h1>🗓️ Календарь</h1>
        <div class="cal-nav">
          <button class="cal-btn" @click="prev">‹</button>
          <button class="cal-btn" @click="goToday">Сегодня</button>
          <button class="cal-btn" @click="next">›</button>
        </div>
        <span class="cal-range">{{ viewTitle }}</span>
        <span v-if="zoneNote" class="cal-zone" title="События показаны в часовой зоне этого устройства">🕐 {{ zoneNote }}</span>
      </div>
      <div class="cal-head-right">
        <div class="cal-views">
          <button
            v-for="v in VIEWS"
            :key="v.key"
            class="cal-seg"
            :class="{ on: currentView === v.key }"
            @click="changeView(v.key)"
          >
            {{ v.title }}
          </button>
        </div>
        <button class="cal-google" :class="{ ok: status?.connected, bad: status?.lastError }" @click="googleOpen = !googleOpen">
          <span class="cal-g">G</span>
          <template v-if="!status || !status.connected">Подключить Google</template>
          <template v-else>
            <span v-if="syncing">сверяю…</span>
            <span v-else-if="status.lastError">⚠ ошибка сверки</span>
            <span v-else>{{ syncedAgo }}</span>
            <span v-if="status.pending" class="cal-pending-n">⏳ {{ status.pending }}</span>
          </template>
        </button>
        <button class="cal-btn primary" title="Новое событие (N)" @click="newEvent">＋ Событие</button>
      </div>
    </header>

    <div v-if="googleOpen" class="cal-gpanel">
      <template v-if="status && !status.configured">
        <b>Google не настроен на сервере.</b>
        <p>Нужен OAuth-клиент Google: переменные GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env сервера. Пока его нет, календарь работает сам по себе.</p>
      </template>
      <template v-else-if="!status?.connected">
        <b>Связать с Google Calendar</b>
        <p>События отсюда появятся в Google, правки в Google — здесь (раз в пару минут или по кнопке «Сверить»). Удаление тоже ездит в обе стороны.</p>
        <button class="cal-btn primary" @click="connectGoogle">Войти через Google</button>
      </template>
      <template v-else>
        <div class="cal-grow">
          <b>{{ status.email }}</b> · календарь
          <input v-model="calendarIdDraft" class="cal-input" placeholder="primary" />
          <button class="cal-btn" @click="saveCalendarId">Сменить</button>
        </div>
        <div class="cal-muted">
          {{ syncedAgo }}<template v-if="status.pending"> · ждут отправки: {{ status.pending }}</template>
        </div>
        <div v-if="status.lastError" class="cal-err">{{ status.lastError }}</div>
        <div class="cal-row">
          <button class="cal-btn primary" :disabled="syncing" @click="syncNow">{{ syncing ? "Сверяю…" : "⟳ Сверить сейчас" }}</button>
          <button class="cal-btn ghost" @click="disconnect">Отключить</button>
        </div>
      </template>
      <div v-if="googleMessage" class="cal-muted">{{ googleMessage }}</div>
    </div>

    <div v-if="error" class="cal-err cal-err-top">{{ error }} <button class="cal-x" @click="error = ''">✕</button></div>

    <div class="cal-body">
      <aside v-if="!isMobile" class="cal-layers">
        <div class="cal-section">Слои</div>
        <button
          v-for="l in LAYERS"
          :key="l.key"
          class="cal-layer"
          :class="{ off: hidden.has(l.key) }"
          :style="{ '--c': l.color }"
          @click="toggleLayer(l.key)"
        >
          <span class="cal-dot"></span>
          <span class="cal-layer-name">{{ l.emoji }} {{ l.title }}</span>
          <span class="cal-layer-n">{{ layerCounts[l.key] || "" }}</span>
        </button>
        <div class="cal-hint">
          Выдели время на сетке — новое событие. Тащи и растягивай — перенос. Клавиши: N — новое, T — сегодня, ← → — листать.
        </div>
      </aside>

      <main class="cal-main">
        <FullCalendar ref="fc" :options="options">
          <template #eventContent="arg">
            <div class="cal-ev" :class="{ list: arg.view.type.startsWith('list') }">
              <span v-if="arg.timeText && !arg.view.type.startsWith('list')" class="cal-ev-time">{{ arg.timeText }}</span>
              <span class="cal-ev-title">
                <template v-if="rawOf(arg).category">{{ layerOf(rawOf(arg).category).emoji }} </template>{{ arg.event.title }}
                <span v-if="rawOf(arg).googleError" title="Google не принял">⚠</span>
              </span>
              <span v-if="rawOf(arg).location && arg.view.type !== 'dayGridMonth'" class="cal-ev-loc">
                {{ rawOf(arg).location }}
              </span>
            </div>
          </template>
        </FullCalendar>
      </main>

      <CalendarTodayPanel
        class="cal-today"
        :today="today"
        :events="todayEvents"
        :cards="todayCards"
        :loading="todayLoading"
        @open="openEvent"
        @create="newToday"
      />
    </div>

    <CalendarEventModal
      v-if="modal"
      :event="modal.event || null"
      :draft="modal.draft || null"
      :google-connected="!!status?.connected"
      @close="modal = null"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.cal-page {
  width: calc(100% - 48px);
  max-width: 2000px;
  margin: 0 auto;
  padding: 14px 0 24px;
  color: #e6e8ef;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100vh;
  box-sizing: border-box;
}
.cal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cal-head-left,
.cal-head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cal-head h1 {
  margin: 0;
  font-size: 22px;
}
.cal-range {
  font-size: 17px;
  font-weight: 600;
  text-transform: capitalize;
  color: #cfd3e0;
}
.cal-zone {
  font-size: 12px;
  color: #8a8fa0;
  border: 1px dashed #2b2f3b;
  border-radius: 999px;
  padding: 2px 8px;
}
.cal-nav {
  display: flex;
  gap: 4px;
}
.cal-btn {
  border: 1px solid #2b2f3b;
  background: #232633;
  color: #e6e8ef;
  border-radius: 9px;
  padding: 7px 12px;
  font-size: 14px;
  cursor: pointer;
}
.cal-btn:hover {
  background: #2a2e3c;
}
.cal-btn.primary {
  background: #6e4aff;
  border-color: #6e4aff;
  color: #fff;
  font-weight: 600;
}
.cal-btn.ghost {
  background: transparent;
}
.cal-views {
  display: flex;
  background: #1b1d25;
  border: 1px solid #2b2f3b;
  border-radius: 10px;
  padding: 2px;
}
.cal-seg {
  border: none;
  background: transparent;
  color: #b8bccb;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.cal-seg.on {
  background: #6e4aff;
  color: #fff;
}
.cal-google {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #2b2f3b;
  background: #1b1d25;
  color: #cfd3e0;
  border-radius: 999px;
  padding: 5px 12px 5px 5px;
  font-size: 13px;
  cursor: pointer;
}
.cal-google.ok {
  border-color: rgba(34, 197, 94, 0.4);
}
.cal-google.bad {
  border-color: rgba(239, 68, 68, 0.5);
}
.cal-g {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0);
  color: #fff;
  font-weight: 800;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cal-pending-n {
  color: #a58bff;
}
.cal-gpanel {
  align-self: flex-end;
  width: min(520px, 100%);
  background: #1b1d25;
  border: 1px solid #2b2f3b;
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
}
.cal-gpanel p {
  margin: 0;
  color: #b8bccb;
  font-size: 13px;
}
.cal-grow,
.cal-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.cal-input {
  background: #14161c;
  border: 1px solid #2b2f3b;
  color: #e6e8ef;
  border-radius: 8px;
  padding: 6px 8px;
  width: 180px;
}
.cal-muted {
  color: #8a8fa0;
  font-size: 13px;
}
.cal-err {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
}
.cal-err-top {
  display: flex;
  justify-content: space-between;
}
.cal-x {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
}
.cal-body {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr) 320px;
  gap: 14px;
  align-items: start;
}
.cal-layers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 12px;
}
.cal-section {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #7a7f8e;
  margin-bottom: 4px;
}
.cal-layer {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: #e6e8ef;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
}
.cal-layer:hover {
  background: #1b1d25;
}
.cal-layer.off {
  opacity: 0.4;
}
.cal-layer.off .cal-dot {
  background: transparent;
}
.cal-dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 2px solid var(--c);
  background: var(--c);
  flex: none;
}
.cal-layer-name {
  flex: 1;
}
.cal-layer-n {
  font-size: 12px;
  color: #7a7f8e;
}
.cal-hint {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.45;
  color: #6b7080;
}
.cal-main {
  min-width: 0;
  background: #1b1d25;
  border: 1px solid #262933;
  border-radius: 14px;
  padding: 8px;
}
.cal-today {
  position: sticky;
  top: 12px;
  background: #16181f;
  border: 1px solid #262933;
  border-radius: 14px;
  padding: 12px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}
.cal-ev {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  line-height: 1.25;
  padding: 1px 2px;
  min-width: 0;
}
.cal-ev.list {
  flex-direction: row;
  gap: 10px;
  align-items: baseline;
}
.cal-ev-time {
  font-size: 11px;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}
.cal-ev-title {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-ev-loc {
  font-size: 11px;
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1280px) {
  .cal-body {
    grid-template-columns: minmax(0, 1fr) 300px;
  }
  .cal-layers {
    display: none;
  }
}
.cal-page.mobile {
  width: 100%;
  padding: 10px 8px 90px;
}
.cal-page.mobile .cal-body {
  grid-template-columns: 1fr;
}
.cal-page.mobile .cal-today {
  position: static;
  order: -1;
  max-height: none;
}
.cal-page.mobile .cal-range {
  font-size: 15px;
}
</style>

<style>
/* FullCalendar в тёмной теме сайта: его разметка живёт вне scoped. */
.cal-page .fc {
  --fc-border-color: #262933;
  --fc-page-bg-color: #1b1d25;
  --fc-neutral-bg-color: #20232d;
  --fc-neutral-text-color: #b8bccb;
  --fc-list-event-hover-bg-color: #232633;
  --fc-today-bg-color: rgba(110, 74, 255, 0.09);
  --fc-now-indicator-color: #ff5c7a;
  --fc-highlight-color: rgba(110, 74, 255, 0.22);
  --fc-event-text-color: #fff;
  color: #e6e8ef;
  font-size: 13px;
}
.cal-page .fc .fc-col-header-cell-cushion,
.cal-page .fc .fc-daygrid-day-number,
.cal-page .fc .fc-list-day-text,
.cal-page .fc .fc-list-day-side-text {
  color: #cfd3e0;
  text-decoration: none;
  text-transform: capitalize;
}
.cal-page .fc .fc-day-today .fc-daygrid-day-number {
  background: #6e4aff;
  color: #fff;
  border-radius: 999px;
  padding: 2px 7px;
  margin: 3px;
}
.cal-page .fc .fc-timegrid-slot-label-cushion {
  color: #7a7f8e;
  font-variant-numeric: tabular-nums;
}
.cal-page .fc .fc-timegrid-slot-minor {
  border-top-style: dotted;
}
.cal-page .fc-theme-standard .fc-scrollgrid {
  border-radius: 10px;
  overflow: hidden;
}
.cal-page .fc a {
  color: inherit;
}
.cal-page .fc .fc-daygrid-block-event .cal-ev {
  flex-direction: row;
  gap: 5px;
  align-items: baseline;
}
.cal-page .fc .fc-event {
  border-radius: 6px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
}
.cal-page .fc .fc-timegrid-event {
  border-left-width: 3px;
}
.cal-page .fc .fc-daygrid-event-dot {
  border-color: inherit;
}
.cal-page .fc .cal-pending {
  background-image: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.12) 0 6px, transparent 6px 12px);
}
.cal-page .fc .fc-list-event-title,
.cal-page .fc .fc-list-event-time {
  color: #e6e8ef;
}
.cal-page .fc .fc-list-day-cushion {
  background: #20232d;
}
.cal-page .fc .fc-daygrid-more-link {
  color: #a58bff;
}
.cal-page .fc .fc-popover {
  background: #1b1d25;
  border-color: #2b2f3b;
}
.cal-page .fc .fc-popover-header {
  background: #20232d;
  color: #cfd3e0;
}
</style>
