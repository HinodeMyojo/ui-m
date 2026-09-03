<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import confetti from "canvas-confetti";
import MarkdownView from "./MarkdownView.vue";
import { AUTUMN_COLORS } from "@/composables/useAutumn.js";
import { checkTask, createWorkItem, setTaskLogStatus } from "@/components/api.js";

// Общий вид дня: все карточки разом. Отсюда день не только читают, но и
// разгребают — карточку можно перетащить в другой статус, закрыть одним
// нажатием и выстроить всё по времени.
const props = defineProps({
  items: { type: Array, default: () => [] },
  note: { type: String, default: "" },
  focus: { type: String, default: "" },
  date: { type: String, default: "" },
  isToday: { type: Boolean, default: false },
  // Подзадачи с главной страницы с дедлайном около этого дня (окно ±сутки).
  mainSubtasks: { type: Array, default: () => [] },
  // Статусы главной страницы с колонкой доски у каждого — по ним переносим.
  taskStatuses: { type: Array, default: () => [] },
});
const emit = defineEmits(["open", "open-sub", "add", "move", "sort", "refresh"]);

const STATUS_META = {
  todo: { label: "План", color: "#5b616e" },
  doing: { label: "В работе", color: "#ffd666" },
  paused: { label: "Пауза", color: "#4aa8ff" },
  done: { label: "Готово", color: "#63c94f" },
  dropped: { label: "Отменено", color: "#e5484d" },
};

// Порядок колонок: сначала то, чем занят, потом план, в конце закрытое.
// Подсказка в пустой колонке: у крайних она объясняет, что сюда таскают.
const EMPTY_HINT = {
  done: "сюда — закрытое",
  dropped: "сюда — отменённое",
};

const GROUPS = [
  { key: "doing", title: "В работе" },
  { key: "todo", title: "План" },
  { key: "paused", title: "Пауза" },
  { key: "done", title: "Сделано" },
  { key: "dropped", title: "Отменено" },
];

// Колонки статусов держим на месте, даже когда пустые, и «Отменено» тоже:
// стоило показывать её только на время перетаскивания — колонок становилось
// пять вместо четырёх, и вся доска меняла ширину прямо под рукой.
const groups = computed(() =>
  GROUPS.map((g) => ({
    ...g,
    items: props.items.filter((i) => i.status === g.key),
    subs: subsByColumn.value[g.key] || [],
  })),
);

// --- Подзадачи с главной страницы ---

// Сервер отдаёт окно в сутки по краям: календарный день у дедлайна свой в
// каждой таймзоне, и решает его тот, кто этот день видит, — браузер.
function localDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const subsByColumn = computed(() => {
  const byColumn = {};
  for (const sub of props.mainSubtasks) {
    if (!sub.deadline || localDay(sub.deadline) !== props.date) continue;
    const key = sub.column || "todo";
    (byColumn[key] = byColumn[key] || []).push(sub);
  }
  return byColumn;
});

function subTime(sub) {
  return new Date(sub.deadline).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const subBusy = ref(new Set());
const subError = ref("");

// Галочку ставим сразу, ответ сервера её только подтверждает: ждать перезагрузку
// дня ради одного клика — ровно то, из-за чего задачи не закрывают.
async function toggleSub(sub, event) {
  event.stopPropagation();
  if (subBusy.value.has(sub.id)) return;
  const next = !sub.done;
  sub.done = next;
  if (next) {
    sub.column = "done";
    celebrate(sub.id, event.currentTarget.closest(".ovw-sub"));
  }
  subBusy.value = new Set(subBusy.value).add(sub.id);
  subError.value = "";
  try {
    await checkTask(sub.id, next);
    emit("refresh");
  } catch (e) {
    sub.done = !next;
    subError.value = e.message || "не удалось отметить подзадачу";
  } finally {
    const rest = new Set(subBusy.value);
    rest.delete(sub.id);
    subBusy.value = rest;
  }
}

// Перенос подзадачи между колонками — это смена её статуса на главной. Какой
// именно статус подставить, знает сервер: он же и разложил статусы по
// колонкам, а называться «В работе» у пользователя может что угодно.
function statusForColumn(column) {
  return props.taskStatuses.find((st) => st.column === column) || null;
}

async function moveSub(sub, column, card) {
  if (column === "dropped") {
    subError.value = "подзадачу с главной нельзя отменить — только закрыть или вернуть в план";
    return;
  }
  const status = statusForColumn(column);
  if (!status) {
    subError.value = `на главной нет статуса для колонки «${STATUS_META[column].label}»`;
    return;
  }

  const wasDone = sub.done;
  const nowDone = column === "done";
  sub.column = column;
  sub.done = nowDone;
  sub.statusId = status.id;
  sub.statusName = status.name;
  sub.statusColor = status.color;
  if (nowDone && !wasDone) celebrate(sub.id, card);

  subError.value = "";
  try {
    // Галочка и статус — разные вещи: в «Сделано» подзадача должна и закрыться.
    if (nowDone !== wasDone) await checkTask(sub.id, nowDone);
    await setTaskLogStatus({ taskId: sub.id, statusId: status.id, entryDate: props.date });
    emit("refresh");
  } catch (e) {
    subError.value = e.message || "не удалось сменить статус подзадачи";
    emit("refresh");
  }
}

// Подзадача — не карточка дня, но одним нажатием ею становится: так у неё
// появляются время, полотно и всё остальное хозяйство ежедневника.
async function subToDay(sub, event) {
  event.stopPropagation();
  subError.value = "";
  try {
    await createWorkItem({
      date: props.date,
      title: sub.title,
      color: sub.color || sub.parentColor || "",
      taskIds: [sub.id],
    });
    emit("refresh");
  } catch (e) {
    subError.value = e.message || "не удалось перенести в день";
  }
}

const done = computed(() => props.items.filter((i) => i.status === "done").length);
const total = computed(() => props.items.filter((i) => i.status !== "dropped").length);
const percent = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0));
const left = computed(() => Math.max(0, total.value - done.value));

// --- Время ---

// Часы тикают сами: «через 20 минут» на карточке, которая не обновляется,
// врёт уже через минуту после открытия страницы.
const nowMin = ref(minutesNow());
const nowTs = ref(Date.now());
let clock = null;

function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const DAY_FROM = 6 * 60; // шкалу начинаем с шести утра: ночь на ней — пустое место
const DAY_TO = 24 * 60;

function fmt(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function humanMinutes(minutes) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} м`;
  if (h) return `${h} ч`;
  return `${m} м`;
}

function trackPos(min) {
  return Math.max(0, Math.min(100, ((min - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100));
}

function computeTime(item) {
  const start = item.plannedStartMin;
  if (start == null || start < 0) return null;
  const end = item.plannedEndMin > start ? item.plannedEndMin : null;
  const closed = item.status === "done" || item.status === "dropped";
  const till = end ?? start;

  let tone = "";
  let rel = "";
  if (props.isToday && !closed) {
    const now = nowMin.value;
    if (now >= start && now <= till) {
      tone = "live";
      rel = "идёт сейчас";
    } else if (now < start) {
      const diff = start - now;
      if (diff <= 60) tone = "soon";
      rel =
        diff < 60
          ? `через ${diff} мин`
          : `через ${humanMinutes(Math.round(diff / 5) * 5)}`;
    } else {
      tone = "late";
      const diff = now - till;
      rel = diff < 60 ? `${diff} мин назад` : `${Math.floor(diff / 60)} ч назад`;
    }
  }

  return {
    start: fmt(start),
    end: end ? fmt(end) : "",
    dur: end ? humanMinutes(end - start) : "",
    rel,
    tone,
    left: trackPos(start),
    width: Math.max(1.5, trackPos(end ?? start + 15) - trackPos(start)),
  };
}

const timeMap = computed(() => new Map(props.items.map((i) => [i.id, computeTime(i)])));
const timeOf = (item) => timeMap.value.get(item.id);
const nowPos = computed(() => trackPos(nowMin.value));

function deadlineLabel(item) {
  if (!item.deadline) return "";
  if (!item.deadlineHasTime) return "до конца дня";
  return new Date(item.deadline).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function isOverdue(item) {
  if (!item.deadline || item.status === "done" || item.status === "dropped") return false;
  return new Date(item.deadline) < new Date();
}

// Последний час до срока карточка показывает собой, а не строкой мелким
// шрифтом: рамка греется, счётчик идёт в минутах и тикает вместе с часами.
function urgencyOf(deadline, closed) {
  if (!deadline || closed) return null;
  const left = Math.round((new Date(deadline).getTime() - nowTs.value) / 60000);
  if (left < 0) return { tone: "over", label: `просрочено на ${humanMinutes(-left) || "минуту"}` };
  if (left <= 60) return { tone: "soon", label: left < 1 ? "меньше минуты" : `осталось ${left} мин` };
  return null;
}

const itemUrgency = (item) =>
  urgencyOf(item.deadline, item.status === "done" || item.status === "dropped");

const subUrgency = (sub) => urgencyOf(sub.deadline, sub.done);

// --- Карточка ---

function checkProgress(item) {
  const total = item.checks?.length || 0;
  if (!total) return null;
  const doneCount = item.checks.filter((c) => c.done).length;
  return { total, done: doneCount, percent: Math.round((doneCount / total) * 100) };
}

// Короткая выжимка полотна — без markdown-разметки, только суть.
function excerpt(item) {
  const text = (item.body || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 160 ? text.slice(0, 160) + "…" : text;
}

const blockersTotal = computed(() =>
  props.items.reduce(
    (sum, i) => sum + (i.tasks || []).reduce((s, t) => s + (t.openBlockers || 0), 0),
    0,
  ),
);

// --- Награда за закрытие ---

const soundOn = ref(localStorage.getItem("wsCheerSound") !== "0");
watch(soundOn, (v) => localStorage.setItem("wsCheerSound", v ? "1" : "0"));

const popped = ref(new Set());
const allDoneBanner = ref(false);
let audio = null;

// Два коротких синуса вместо файла: звук закрытия должен быть мгновенным и
// ничего не весить, а не тянуться сетью в тот момент, когда его ждут.
function chime(high = false) {
  if (!soundOn.value) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const base = high ? [660, 990, 1320] : [880, 1320];
    base.forEach((freq, i) => {
      const at = audio.currentTime + i * 0.09;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.09, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.55);
    });
  } catch {
    // Звук — приятный бонус, а не условие работы страницы.
  }
}

function burst(el, big = false) {
  const rect = el?.getBoundingClientRect();
  const origin = rect
    ? {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      }
    : { y: 0.55 };
  confetti({
    particleCount: big ? 160 : 70,
    spread: big ? 100 : 66,
    startVelocity: big ? 42 : 30,
    scalar: big ? 1.1 : 0.9,
    ticks: big ? 200 : 140,
    colors: AUTUMN_COLORS,
    origin,
  });
}

function celebrate(id, el) {
  burst(el);
  chime();
  const next = new Set(popped.value);
  next.add(id);
  popped.value = next;
  setTimeout(() => {
    const rest = new Set(popped.value);
    rest.delete(id);
    popped.value = rest;
  }, 700);
}

// Полностью закрытый день отмечаем один раз, а не на каждой перерисовке.
let dayWasClosed = null;
watch(
  [done, total],
  ([d, t]) => {
    const closed = t > 0 && d === t;
    if (dayWasClosed === null) {
      dayWasClosed = closed;
      return;
    }
    if (closed && !dayWasClosed) {
      allDoneBanner.value = true;
      burst(null, true);
      chime(true);
      setTimeout(() => (allDoneBanner.value = false), 6000);
    }
    dayWasClosed = closed;
  },
  { immediate: true },
);

function toggleDone(item, event) {
  event.stopPropagation();
  const next = item.status === "done" ? "todo" : "done";
  if (next === "done") celebrate(item.id, event.currentTarget.closest(".ovw-card"));
  emit("move", { id: item.id, status: next, beforeId: null });
}

// --- Перетаскивание ---

// Свой драг на pointer-событиях, а не HTML5 drag-and-drop: последний не
// существует для пальца, а доску открывают и с телефона.
const board = ref(null);
const drag = ref(null);
let pending = null;

// kind: "item" — карточка дня, "sub" — подзадача с главной страницы.
function pointerDown(event, item, kind = "item") {
  if (event.button > 0) return;
  if (event.target.closest?.(".ovw-nodrag")) return;
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  pending = {
    item,
    kind,
    card,
    dead: false,
    startX: event.clientX,
    startY: event.clientY,
    dx: event.clientX - rect.left,
    dy: event.clientY - rect.top,
    width: rect.width,
    touch: event.pointerType === "touch",
    at: Date.now(),
    hold: null,
  };
  // Пальцем страницу ещё и листают, поэтому там драг начинается с удержания.
  if (pending.touch) {
    const started = pending;
    started.hold = setTimeout(() => {
      if (pending === started) beginDrag(started.startX, started.startY);
    }, 260);
  }
  window.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);
  window.addEventListener("touchmove", blockScroll, { passive: false });
}

function blockScroll(event) {
  if (drag.value) event.preventDefault();
}

function beginDrag(x, y) {
  if (!pending || pending.dead || drag.value) return;
  clearTimeout(pending.hold);
  const item = pending.item;
  const sub = pending.kind === "sub";
  drag.value = {
    id: item.id,
    kind: pending.kind,
    title: item.title,
    emoji: sub ? "" : item.emoji,
    color: (sub ? item.parentColor || item.color : item.color) || "#1767fd",
    width: Math.min(300, pending.width),
    dx: Math.min(pending.dx, 280),
    dy: Math.min(pending.dy, 40),
    from: sub ? item.column : item.status,
    over: null,
    beforeId: null,
    x,
    y,
  };
  document.body.style.userSelect = "none";
  navigator.vibrate?.(12);
}

function pointerMove(event) {
  if (!pending || pending.dead) return;
  const dist = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
  if (!drag.value) {
    // Палец поехал раньше, чем сработало удержание, — это скролл, не драг.
    if (pending.touch) {
      if (dist > 10) {
        clearTimeout(pending.hold);
        pending.dead = true;
      }
      return;
    }
    if (dist < 6) return;
    beginDrag(event.clientX, event.clientY);
    if (!drag.value) return;
  }
  drag.value.x = event.clientX;
  drag.value.y = event.clientY;
  updateTarget(event.clientX, event.clientY);
  edgeScroll(event.clientX);
}

// Колонку выбираем по горизонтали, а не по тому, что физически под курсором:
// колонки высотой в свои карточки, и бросок влево на уровне десятой карточки
// попадал мимо короткой колонки — в пустоту под ней.
function columnAt(x, y) {
  const el = board.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  // Ушли выше или ниже доски — это уже не перенос, а отмена.
  if (y < rect.top - 40 || y > rect.bottom + 40) return null;

  const columns = Array.from(el.querySelectorAll("[data-status]"));
  let nearest = null;
  let bestDistance = Infinity;
  for (const column of columns) {
    const box = column.getBoundingClientRect();
    if (x >= box.left && x <= box.right) return column;
    const distance = x < box.left ? box.left - x : x - box.right;
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = column;
    }
  }
  return nearest; // в зазоре между колонками и по краям доски — ближайшая
}

function updateTarget(x, y) {
  const column = columnAt(x, y);
  if (!column) {
    drag.value.over = null;
    drag.value.beforeId = null;
    return;
  }
  drag.value.over = column.dataset.status;
  const cards = Array.from(column.querySelectorAll(".ovw-card[data-id]")).filter(
    (c) => c.dataset.id !== drag.value.id,
  );
  let before = null;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      before = card.dataset.id;
      break;
    }
  }
  drag.value.beforeId = before;
}

function edgeScroll(x) {
  const el = board.value;
  if (!el || el.scrollWidth <= el.clientWidth) return;
  const rect = el.getBoundingClientRect();
  if (x < rect.left + 70) el.scrollLeft -= 16;
  else if (x > rect.right - 70) el.scrollLeft += 16;
}

function pointerUp(event) {
  window.removeEventListener("pointermove", pointerMove);
  window.removeEventListener("pointerup", pointerUp);
  window.removeEventListener("pointercancel", pointerUp);
  window.removeEventListener("touchmove", blockScroll);
  document.body.style.userSelect = "";

  const started = pending;
  pending = null;
  if (started?.hold) clearTimeout(started.hold);

  const state = drag.value;
  drag.value = null;
  if (!state) {
    const moved = Math.hypot(event.clientX - started?.startX, event.clientY - started?.startY);
    if (started && !started.dead && moved < 8 && Date.now() - started.at < 900) {
      emit(started.kind === "sub" ? "open-sub" : "open", started.item.id);
    }
    return;
  }
  if (!state.over) return;
  if (state.kind === "sub") {
    // Внутри своей же колонки подзадаче двигаться некуда: порядка у неё нет.
    if (state.over !== state.from) moveSub(started.item, state.over, started?.card);
    return;
  }
  if (state.over === "done") celebrate(state.id, started?.card);
  emit("move", { id: state.id, status: state.over, beforeId: state.beforeId });
}

onMounted(() => {
  clock = setInterval(() => {
    nowMin.value = minutesNow();
    nowTs.value = Date.now();
  }, 30000);
});

onBeforeUnmount(() => {
  clearInterval(clock);
  window.removeEventListener("pointermove", pointerMove);
  window.removeEventListener("pointerup", pointerUp);
  window.removeEventListener("pointercancel", pointerUp);
  window.removeEventListener("touchmove", blockScroll);
  document.body.style.userSelect = "";
});
</script>

<template>
  <div class="ovw">
    <div v-if="focus || note" class="ovw-day">
      <h2 v-if="focus" class="ovw-focus">🎯 {{ focus }}</h2>
      <MarkdownView v-if="note" :text="note" class="ovw-note" />
    </div>

    <div class="ovw-bar">
      <div class="ovw-ring" :style="{ '--p': percent }">
        <svg viewBox="0 0 44 44">
          <circle class="ovw-ring-bg" cx="22" cy="22" r="18" />
          <circle
            class="ovw-ring-fg"
            cx="22"
            cy="22"
            r="18"
            :stroke-dasharray="`${(percent / 100) * 113} 113`"
          />
        </svg>
        <span>{{ percent }}<i>%</i></span>
      </div>

      <div class="ovw-bar-text">
        <b>{{ done }} из {{ total }}</b>
        <span v-if="left">осталось {{ left }} — доведём до нуля</span>
        <span v-else-if="total" class="ok">день закрыт целиком 🍂</span>
        <span v-else>карточек пока нет</span>
      </div>

      <div class="ovw-bar-actions">
        <button class="ovw-tool" title="Выстроить карточки по времени" @click="emit('sort')">
          🕐 По времени
        </button>
        <button class="ovw-tool" @click="emit('add')">＋ Задача</button>
        <button
          class="ovw-tool icon"
          :class="{ off: !soundOn }"
          :title="soundOn ? 'Звук закрытия включён' : 'Звук закрытия выключен'"
          @click="soundOn = !soundOn"
        >
          {{ soundOn ? "🔔" : "🔕" }}
        </button>
      </div>
    </div>

    <div v-if="allDoneBanner" class="ovw-alldone">🎃 Всё закрыто. День твой.</div>

    <div v-if="subError" class="ovw-alert">{{ subError }}</div>

    <div v-if="blockersTotal" class="ovw-alert">
      🚧 Открытых блокеров сегодня: <b>{{ blockersTotal }}</b>
    </div>

    <p class="ovw-hint">
      Перетащите карточку в другую колонку — на телефоне удержите её пальцем.
    </p>

    <div class="ovw-board" ref="board">
      <section
        v-for="g in groups"
        :key="g.key"
        class="ovw-col"
        :class="{ hot: drag?.over === g.key }"
        :data-status="g.key"
      >
        <div class="ovw-col-head" :style="{ '--status': STATUS_META[g.key].color }">
          <span class="ovw-col-dot"></span>
          {{ g.title }}
          <span class="ovw-col-count">{{ g.items.length + g.subs.length }}</span>
        </div>

        <div
          v-if="!g.items.length && !g.subs.length && drag?.over !== g.key"
          class="ovw-col-empty"
        >
          {{ EMPTY_HINT[g.key] || "пусто" }}
        </div>

        <!-- Подзадачи с главной страницы: не карточки дня, но сегодня их срок,
             поэтому стоят вверху колонки своего статуса и выделены. Ниже них
             карточки дня свободно двигаются между собой. -->
        <article
          v-for="sub in g.subs"
          :key="'sub-' + sub.id"
          class="ovw-sub"
          :class="{
            muted: sub.done,
            pop: popped.has(sub.id),
            ghosted: drag?.id === sub.id,
            'due-soon': subUrgency(sub)?.tone === 'soon',
            'due-over': subUrgency(sub)?.tone === 'over',
          }"
          :style="{ '--accent': sub.parentColor || sub.color || '#e07b39' }"
          :data-sub-id="sub.id"
          @pointerdown="pointerDown($event, sub, 'sub')"
        >
          <div class="ovw-sub-flags">
            <span class="ovw-sub-flag">с главной</span>
            <span v-if="sub.parentIsGlobal" class="ovw-sub-flag global">глобальная</span>
            <span
              class="ovw-sub-flag due"
              :class="{ soon: subUrgency(sub)?.tone === 'soon', bad: subUrgency(sub)?.tone === 'over' }"
            >
              ⏳ {{ subUrgency(sub)?.label || subTime(sub) }}
            </span>
          </div>

          <div class="ovw-sub-parent">
            <span v-if="sub.parentSticker" class="ovw-sub-sticker">{{ sub.parentSticker }}</span>
            {{ sub.parentTitle }}
            <span class="ovw-sub-arrow">→</span>
          </div>

          <div class="ovw-sub-top">
            <button
              class="ovw-check ovw-nodrag"
              :class="{ on: sub.done }"
              :title="sub.done ? 'Открыть заново' : 'Закрыть подзадачу'"
              @click="toggleSub(sub, $event)"
            >
              <span v-if="sub.done">✓</span>
            </button>
            <span class="ovw-sub-title">{{ sub.title }}</span>
            <button
              class="ovw-sub-move ovw-nodrag"
              title="Сделать карточкой этого дня"
              @click="subToDay(sub, $event)"
            >
              ＋
            </button>
          </div>

          <div v-if="sub.statusName || sub.openBlockers || sub.checksTotal" class="ovw-sub-meta">
            <span
              v-if="sub.statusName"
              class="ovw-sub-status"
              :style="{ borderColor: sub.statusColor, color: sub.statusColor }"
            >
              {{ sub.statusName }}
            </span>
            <span v-if="sub.checksTotal" class="ovw-sub-status">
              ☑ {{ sub.checksDone }}/{{ sub.checksTotal }}
            </span>
            <span v-if="sub.openBlockers" class="ovw-sub-blockers">🚧 {{ sub.openBlockers }}</span>
          </div>
        </article>
        <template v-for="item in g.items" :key="item.id">
          <div
            v-if="drag?.kind === 'item' && drag.over === g.key && drag.beforeId === item.id"
            class="ovw-slot"
          ></div>

          <article
            class="ovw-card"
            :class="{
              muted: item.status === 'done' || item.status === 'dropped',
              ghosted: drag?.id === item.id,
              pop: popped.has(item.id),
              live: timeOf(item)?.tone === 'live',
              late: timeOf(item)?.tone === 'late',
              'due-soon': itemUrgency(item)?.tone === 'soon',
              'due-over': itemUrgency(item)?.tone === 'over',
            }"
            :style="{ '--accent': item.color || '#1767fd' }"
            :data-id="item.id"
            @pointerdown="pointerDown($event, item)"
          >
            <div class="ovw-card-top">
              <button
                class="ovw-check ovw-nodrag"
                :class="{ on: item.status === 'done' }"
                :title="item.status === 'done' ? 'Вернуть в план' : 'Закрыть карточку'"
                @click="toggleDone(item, $event)"
              >
                <span v-if="item.status === 'done'">✓</span>
              </button>
              <span class="ovw-card-title">
                <span v-if="item.emoji" class="ovw-card-emoji">{{ item.emoji }}</span
                >{{ item.title }}
              </span>
              <span v-if="item.priority" class="ovw-card-prio">{{ "!".repeat(item.priority) }}</span>
            </div>

            <div v-if="timeOf(item)" class="ovw-when" :class="timeOf(item).tone">
              <div class="ovw-when-row">
                <span class="ovw-when-time">{{ timeOf(item).start }}</span>
                <template v-if="timeOf(item).end">
                  <span class="ovw-when-dash">→</span>
                  <span class="ovw-when-time end">{{ timeOf(item).end }}</span>
                </template>
                <span v-if="timeOf(item).dur" class="ovw-when-dur">{{ timeOf(item).dur }}</span>
                <span v-if="timeOf(item).rel" class="ovw-when-rel">{{ timeOf(item).rel }}</span>
              </div>
              <div class="ovw-track">
                <div
                  class="ovw-track-seg"
                  :style="{ left: timeOf(item).left + '%', width: timeOf(item).width + '%' }"
                ></div>
                <div v-if="isToday" class="ovw-track-now" :style="{ left: nowPos + '%' }"></div>
              </div>
            </div>

            <div v-if="item.tags?.length" class="ovw-card-tags">
              <span
                v-for="t in item.tags"
                :key="t.id"
                class="ovw-tag"
                :style="{ borderColor: t.color, color: t.color }"
              >
                {{ t.name }}
              </span>
            </div>

            <p v-if="excerpt(item)" class="ovw-card-excerpt">{{ excerpt(item) }}</p>

            <div v-if="checkProgress(item)" class="ovw-card-checks">
              <div class="ovw-card-bar">
                <div
                  class="ovw-card-bar-fill"
                  :style="{ width: checkProgress(item).percent + '%' }"
                ></div>
              </div>
              <span class="ovw-card-bar-label">
                {{ checkProgress(item).done }}/{{ checkProgress(item).total }}
              </span>
            </div>

            <div
              v-for="t in (item.tasks || []).filter((x) => x.openBlockers > 0)"
              :key="t.id"
              class="ovw-card-blocked"
            >
              🚧 {{ t.title }} — {{ t.openBlockers }}
            </div>

            <div class="ovw-card-meta">
              <span
                v-if="deadlineLabel(item)"
                class="ovw-chip due"
                :class="{ bad: isOverdue(item), soon: itemUrgency(item)?.tone === 'soon' }"
              >
                ⏳ {{ itemUrgency(item)?.label || deadlineLabel(item) }}
              </span>
              <span v-if="item.estimateMinutes" class="ovw-chip">
                {{ humanMinutes(item.estimateMinutes) }}
              </span>
              <span v-if="item.links?.length" class="ovw-chip">🌐 {{ item.links.length }}</span>
              <span v-if="item.notes?.length" class="ovw-chip">🗒 {{ item.notes.length }}</span>
              <span v-if="item.files?.length" class="ovw-chip">📎 {{ item.files.length }}</span>
              <span v-if="item.tasks?.length" class="ovw-chip">🔗 {{ item.tasks.length }}</span>
            </div>
          </article>
        </template>

        <div
          v-if="drag?.kind === 'item' && drag.over === g.key && drag.beforeId === null"
          class="ovw-slot"
        ></div>

      </section>
    </div>

    <div v-if="!items.length" class="ovw-empty">
      <p>Карточек на этот день пока нет.</p>
      <button class="ovw-add" @click="emit('add')">+ Создать задачу</button>
    </div>

    <div
      v-if="drag"
      class="ovw-ghost"
      :style="{
        width: drag.width + 'px',
        transform: `translate(${drag.x - drag.dx}px, ${drag.y - drag.dy}px) rotate(-2deg)`,
        '--accent': drag.color,
      }"
    >
      <span v-if="drag.emoji">{{ drag.emoji }} </span>{{ drag.title }}
    </div>
  </div>
</template>

<style scoped>
.ovw {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 40px;
}

.ovw-day {
  background: #1b1d24;
  border: 1px solid #262a36;
  border-radius: 14px;
  padding: 16px 20px;
}

.ovw-focus {
  margin: 0 0 8px;
  font-size: 17px;
  color: #fff;
  font-weight: 600;
}

.ovw-note {
  color: #b7bccb;
  font-size: 13.5px;
  line-height: 1.7;
}

/* --- Полоса прогресса дня --- */

.ovw-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  background: linear-gradient(120deg, #1d1f27, #1a1b22);
  border: 1px solid #2a2d38;
  border-radius: 14px;
  padding: 10px 14px;
}

.ovw-ring {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.ovw-ring svg {
  width: 44px;
  height: 44px;
  transform: rotate(-90deg);
}

.ovw-ring-bg {
  fill: none;
  stroke: #2a2d38;
  stroke-width: 4;
}

.ovw-ring-fg {
  fill: none;
  stroke: #63c94f;
  stroke-width: 4;
  stroke-linecap: round;
  transition: stroke-dasharray 0.5s ease;
}

.ovw-ring span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #e8eaf2;
}

.ovw-ring span i {
  font-size: 8px;
  font-style: normal;
  color: #8f95a6;
}

.ovw-bar-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ovw-bar-text b {
  color: #f0f2f7;
  font-size: 15px;
}

.ovw-bar-text span {
  color: #8f95a6;
  font-size: 12px;
}

.ovw-bar-text span.ok {
  color: #8fd97c;
}

.ovw-bar-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ovw-tool {
  background: #22242d;
  border: 1px solid #333747;
  color: #cfd3e0;
  border-radius: 9px;
  padding: 7px 12px;
  font-size: 12.5px;
  min-height: 34px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.ovw-tool:hover {
  border-color: #e07b39;
  color: #ffd9b0;
}

.ovw-tool.icon {
  padding: 7px 10px;
}

.ovw-tool.off {
  color: #6e7382;
}

.ovw-alldone {
  background: linear-gradient(90deg, rgba(99, 201, 79, 0.2), rgba(224, 123, 57, 0.12) 70%);
  border: 1px solid rgba(99, 201, 79, 0.45);
  border-radius: 12px;
  padding: 12px 16px;
  color: #d8f5cd;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  animation: allDone 0.5s ease;
}

@keyframes allDone {
  from {
    transform: scale(0.94);
    opacity: 0;
  }
}

.ovw-alert {
  background: linear-gradient(90deg, rgba(229, 72, 77, 0.18), transparent 70%);
  border: 1px solid #6b2b2e;
  border-left: 3px solid #e5484d;
  border-radius: 10px;
  padding: 10px 14px;
  color: #ffc9cb;
  font-size: 13px;
}

.ovw-hint {
  margin: -4px 0 0;
  color: #5b6070;
  font-size: 11.5px;
}

.ovw-empty {
  color: #7a7f8e;
  text-align: center;
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  font-size: 13.5px;
}

.ovw-empty p {
  margin: 0;
}

.ovw-add {
  background: #1767fd;
  border: 1px solid #1767fd;
  color: #fff;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  font-size: 13px;
}

/* --- Доска --- */

.ovw-board {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(268px, 1fr);
  gap: 14px;
  align-items: start;
  overflow-x: auto;
  padding-bottom: 8px;
}

.ovw-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  border-radius: 14px;
  transition: background 0.15s, box-shadow 0.15s;
}

/* Колонка под курсором с карточкой подсвечивается целиком — так видно, куда
   именно упадёт карточка, ещё до того как отпустишь. */
.ovw-col.hot {
  background: rgba(224, 123, 57, 0.07);
  box-shadow: inset 0 0 0 1px rgba(224, 123, 57, 0.35);
}

.ovw-col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #b7bccb;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 7px 11px;
  background: color-mix(in srgb, var(--status) 12%, #1b1d24);
  border: 1px solid color-mix(in srgb, var(--status) 32%, #262a36);
  border-radius: 10px;
  position: sticky;
  top: 0;
  z-index: 2;
}

.ovw-col-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status);
  flex-shrink: 0;
}

.ovw-col-count {
  margin-left: auto;
  color: #8f95a6;
  font-weight: 400;
  letter-spacing: 0;
}

.ovw-col-empty {
  color: #4f5461;
  font-size: 12px;
  text-align: center;
  padding: 18px 0;
  border: 1px dashed #262a36;
  border-radius: 12px;
}

.ovw-slot {
  height: 44px;
  border: 1px dashed rgba(224, 123, 57, 0.7);
  background: rgba(224, 123, 57, 0.08);
  border-radius: 12px;
}

/* --- Карточка --- */

.ovw-card {
  position: relative;
  background: linear-gradient(160deg, #1e2129, #1a1c23);
  border: 1px solid #262a36;
  border-radius: 14px;
  padding: 12px 13px 11px 16px;
  cursor: grab;
  display: flex;
  flex-direction: column;
  gap: 9px;
  overflow: hidden;
  /* touch-action не трогаем: колонки на телефоне листаются свайпом прямо по
     карточкам, а драг начинается с удержания и сам гасит прокрутку. */
  transition: border-color 0.16s, transform 0.16s, box-shadow 0.16s, opacity 0.2s;
}

.ovw-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent);
}

.ovw-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
}

.ovw-card:active {
  cursor: grabbing;
}

.ovw-card.muted {
  opacity: 0.55;
}

.ovw-card.ghosted {
  opacity: 0.25;
  transform: none;
}

/* Карточку закрыли — она коротко «выдыхает» и зеленеет. Ради этого момента
   всё и делается. */
.ovw-card.pop {
  animation: pop 0.62s cubic-bezier(0.2, 1.4, 0.4, 1);
  border-color: #63c94f;
  box-shadow: 0 0 24px rgba(99, 201, 79, 0.35);
}

@keyframes pop {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

.ovw-card.live {
  border-color: rgba(255, 214, 102, 0.6);
  box-shadow: 0 0 0 1px rgba(255, 214, 102, 0.15);
}

.ovw-card.late {
  border-color: rgba(229, 72, 77, 0.45);
}

.ovw-card-top {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.ovw-check {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  margin-top: 1px;
  border-radius: 50%;
  border: 2px solid #4d5262;
  background: transparent;
  color: #101219;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.14s, background 0.14s, border-color 0.14s, box-shadow 0.14s;
}

.ovw-check:hover {
  border-color: #63c94f;
  transform: scale(1.16);
  box-shadow: 0 0 12px rgba(99, 201, 79, 0.4);
}

.ovw-check.on {
  background: #63c94f;
  border-color: #63c94f;
}

.ovw-card-title {
  color: #f0f2f7;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
  flex: 1;
}

.ovw-card.muted .ovw-card-title {
  text-decoration: line-through;
  color: #9aa0b1;
}

.ovw-card-emoji {
  margin-right: 6px;
}

.ovw-card-prio {
  color: #e5484d;
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}

/* --- Время на карточке --- */

.ovw-when {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: #15161c;
  border: 1px solid #24262f;
  border-radius: 10px;
  padding: 6px 9px 7px;
}

.ovw-when.live {
  background: rgba(255, 214, 102, 0.08);
  border-color: rgba(255, 214, 102, 0.35);
}

.ovw-when.soon {
  border-color: rgba(224, 123, 57, 0.4);
}

.ovw-when.late {
  background: rgba(229, 72, 77, 0.07);
  border-color: rgba(229, 72, 77, 0.32);
}

.ovw-when-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.ovw-when-time {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 16px;
  font-weight: 700;
  color: #f0f2f7;
  letter-spacing: 0.02em;
  line-height: 1;
}

.ovw-when-time.end {
  font-size: 13.5px;
  font-weight: 600;
  color: #9aa0b1;
}

.ovw-when-dash {
  color: #5b6070;
  font-size: 11px;
}

.ovw-when-dur {
  color: #7a7f8e;
  font-size: 11px;
}

.ovw-when-rel {
  margin-left: auto;
  font-size: 11px;
  color: #8f95a6;
  white-space: nowrap;
}

.ovw-when.live .ovw-when-rel {
  color: #ffd666;
  font-weight: 600;
}

.ovw-when.soon .ovw-when-rel {
  color: #e8b04b;
}

.ovw-when.late .ovw-when-rel {
  color: #ff9ba0;
}

/* Полоска суток с 6:00 до полуночи: карточка сразу показывает, куда она
   попадает в дне, а не только «во сколько». */
.ovw-track {
  position: relative;
  height: 4px;
  background: #22242d;
  border-radius: 3px;
  overflow: hidden;
}

.ovw-track-seg {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--accent), #e8b04b);
}

.ovw-when.live .ovw-track-seg {
  background: linear-gradient(90deg, #ffd666, #ff9d3d);
}

.ovw-track-now {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: #fff;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
}

/* --- Остальное на карточке --- */

.ovw-card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.ovw-tag {
  border: 1px solid;
  border-radius: 20px;
  padding: 1px 8px;
  font-size: 10.5px;
}

.ovw-card-excerpt {
  margin: 0;
  color: #9aa0b1;
  font-size: 12.5px;
  line-height: 1.6;
}

.ovw-card-checks {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ovw-card-bar {
  flex: 1;
  height: 4px;
  background: #22242d;
  border-radius: 3px;
  overflow: hidden;
}

.ovw-card-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #1767fd, #63c94f);
  transition: width 0.3s;
}

.ovw-card-bar-label {
  color: #7a7f8e;
  font-size: 11px;
}

.ovw-card-blocked {
  background: rgba(229, 72, 77, 0.14);
  border-left: 2px solid #e5484d;
  border-radius: 5px;
  padding: 4px 8px;
  color: #ffc9cb;
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ovw-card-meta {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.ovw-chip {
  font-size: 10.5px;
  color: #8f95a6;
  background: #16171d;
  border: 1px solid #262a36;
  border-radius: 20px;
  padding: 1px 8px;
}

.ovw-chip.due {
  color: #cfd3e0;
}

.ovw-chip.bad {
  color: #ff9ba0;
  border-color: #6b2b2e;
  background: rgba(229, 72, 77, 0.12);
}

/* --- Горящий срок --- */

/* Последний час до дедлайна и просрочка: карточку должно быть видно с другого
   конца доски, поэтому греется рамка целиком, а не один чип. */
.ovw-card.due-soon,
.ovw-sub.due-soon {
  border-color: rgba(255, 214, 102, 0.75);
  border-style: solid;
  animation: due-pulse 2.4s ease-in-out infinite;
}

.ovw-card.due-over,
.ovw-sub.due-over {
  border-color: rgba(229, 72, 77, 0.8);
  border-style: solid;
  box-shadow: 0 0 0 1px rgba(229, 72, 77, 0.25), 0 0 22px rgba(229, 72, 77, 0.22);
}

.ovw-card.muted.due-over,
.ovw-sub.muted.due-over {
  box-shadow: none;
}

@keyframes due-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 1px rgba(255, 214, 102, 0.18), 0 0 14px rgba(255, 214, 102, 0.14);
  }
  50% {
    box-shadow: 0 0 0 1px rgba(255, 214, 102, 0.4), 0 0 26px rgba(255, 214, 102, 0.34);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ovw-card.due-soon,
  .ovw-sub.due-soon {
    animation: none;
    box-shadow: 0 0 0 1px rgba(255, 214, 102, 0.35);
  }
}

.ovw-chip.due.soon {
  color: #ffd666;
  border-color: rgba(255, 214, 102, 0.45);
  background: rgba(255, 214, 102, 0.1);
}

.ovw-sub-flag.due.soon {
  color: #ffd666;
  border-color: rgba(255, 214, 102, 0.45);
  background: rgba(255, 214, 102, 0.1);
}

.ovw-sub-flag.due.bad {
  color: #ff9ba0;
  border-color: rgba(229, 72, 77, 0.5);
  background: rgba(229, 72, 77, 0.12);
}

/* --- Подзадача с главной страницы --- */

/* Стоит в колонке своего статуса, но карточкой дня не притворяется: тёплая
   рамка, штриховка и ярлык «с главной» отличают её с одного взгляда. */
.ovw-sub {
  position: relative;
  cursor: grab;
  background: linear-gradient(160deg, rgba(224, 123, 57, 0.11), rgba(26, 28, 35, 0.9));
  border: 1px dashed rgba(224, 123, 57, 0.45);
  border-radius: 14px;
  padding: 10px 12px 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  overflow: hidden;
  transition: border-color 0.16s, opacity 0.2s;
}

.ovw-sub::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent);
}

.ovw-sub:hover {
  border-color: rgba(224, 123, 57, 0.8);
}

.ovw-sub:active {
  cursor: grabbing;
}

.ovw-sub.muted {
  opacity: 0.5;
}

.ovw-sub.ghosted {
  opacity: 0.25;
}

.ovw-sub.pop {
  animation: pop 0.62s cubic-bezier(0.2, 1.4, 0.4, 1);
  border-color: #63c94f;
  box-shadow: 0 0 24px rgba(99, 201, 79, 0.35);
}

.ovw-sub-flags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.ovw-sub-flag {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #e8b04b;
  background: rgba(224, 123, 57, 0.16);
  border: 1px solid rgba(224, 123, 57, 0.4);
  border-radius: 20px;
  padding: 1px 8px;
}

.ovw-sub-flag.global {
  color: #ffd666;
}

.ovw-sub-flag.due {
  color: #cfd3e0;
  background: #16171d;
  border-color: #262a36;
  text-transform: none;
  letter-spacing: 0;
  margin-left: auto;
}

/* Путь до подзадачи: без родителя непонятно, из чего она вообще. */
.ovw-sub-parent {
  color: #a5896a;
  font-size: 11.5px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.ovw-sub-arrow {
  color: #6e7382;
}

.ovw-sub-sticker {
  margin-right: 3px;
}

.ovw-sub-top {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.ovw-sub-title {
  flex: 1;
  color: #f0f2f7;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ovw-sub.muted .ovw-sub-title {
  text-decoration: line-through;
  color: #9aa0b1;
}

.ovw-sub-move {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px dashed #3f4457;
  background: transparent;
  color: #8f95a6;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.ovw-sub-move:hover {
  border-color: #e07b39;
  border-style: solid;
  color: #e8b04b;
}

.ovw-sub-meta {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  padding-left: 31px;
}

.ovw-sub-status {
  font-size: 10.5px;
  border: 1px solid #3f4457;
  border-radius: 20px;
  padding: 1px 8px;
}

.ovw-sub-blockers {
  font-size: 10.5px;
  color: #ffc9cb;
  background: rgba(229, 72, 77, 0.14);
  border: 1px solid rgba(229, 72, 77, 0.4);
  border-radius: 20px;
  padding: 1px 8px;
}

/* --- Призрак под курсором --- */

.ovw-ghost {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 3000;
  pointer-events: none;
  background: #21242e;
  border: 1px solid var(--accent);
  border-left: 3px solid var(--accent);
  border-radius: 12px;
  padding: 10px 12px;
  color: #f0f2f7;
  font-size: 13.5px;
  font-weight: 600;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.96;
}

/* На узком экране колонки листаются свайпом с прилипанием */
@media (max-width: 760px) {
  .ovw-board {
    grid-auto-columns: 86vw;
    scroll-snap-type: x mandatory;
    gap: 10px;
  }
  .ovw-col {
    scroll-snap-align: start;
  }
  .ovw-day {
    padding: 13px 15px;
  }
  .ovw-bar-actions {
    margin-left: 0;
    width: 100%;
  }
  .ovw-tool {
    flex: 1;
  }
}
</style>
