<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  createWayTask,
  deleteWayDraft,
  deleteWayTask,
  saveWayDraft,
  fetchWay,
  setWayMark,
  setWayNote,
  updateWayTask,
} from "@/components/mentorApi.js";
import {
  addDays,
  addMonths,
  daysBetween,
  humanDate,
  monthGrid,
  monthTitle,
  plural,
  todayYmd,
  weekday,
} from "@/components/mentorDates.mjs";
import WayDatePicker from "@/components/WayDatePicker.vue";

// Страница «N» по секретной ссылке, без входа. Одна страница на двоих:
// по ссылке наставника назначают рекомендации, по ссылке ученика отмечают
// дни. Чья ссылка — говорит сервер. Спека — docs/mentor-module.md (back-m).

const route = useRoute();
const token = computed(() => String(route.params.token || ""));

const data = ref(null);
const loading = ref(true);
const fatal = ref("");
const toast = ref("");
let toastTimer = 0;

const today = ref(todayYmd());
// Отметки в пути: ключ «задача:день».
const pending = reactive({});
// Растёт на каждую свою запись. Опрос, ушедший до записи, свой ответ
// выбрасывает: он мог вернуться позже и показать то, что было до неё.
let writeSeq = 0;
const isMentor = computed(() => data.value?.role === "mentor");
const mentorName = computed(() => data.value?.mentorName || "");
const studentName = computed(() => data.value?.studentName || "");

function flash(text) {
  toast.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 2600);
}

async function load(quiet = false) {
  if (!quiet) loading.value = true;
  today.value = todayYmd();
  try {
    data.value = await fetchWay(token.value);
    fatal.value = "";
  } catch (e) {
    if (e.status === 404) fatal.value = "Ссылка не открывается: её могли заменить. Попросите новую.";
    else if (!data.value) fatal.value = "Не получилось загрузить. Проверьте интернет и попробуйте ещё раз.";
    else if (!quiet) flash(e.message);
  } finally {
    loading.value = false;
  }
}

// Вернулись на вкладку — показываем свежее: пока страница лежала в фоне,
// второй человек мог что-то отметить, а «сегодня» — смениться. Ушли —
// дописанный черновик отправляем сразу, не дожидаясь паузы в наборе.
function onVisible() {
  if (document.visibilityState === "visible" && data.value) load(true);
  if (document.visibilityState === "hidden") flushDraft();
}

// Почти живое: пока страница открыта, раз в 2,5 с забираем свежее — ученик
// видит, что ему пишут, наставник — отметки. Пока уходит своя отметка, ответ
// опроса не применяем: он мог уйти раньше неё и вернул бы старое.
const POLL_MS = 2500;
let pollTimer = 0;
let polling = false;
async function poll() {
  if (document.visibilityState !== "visible" || polling || !data.value || fatal.value) return;
  if (Object.keys(pending).length) return;
  polling = true;
  const seq = writeSeq;
  try {
    const fresh = await fetchWay(token.value);
    if (seq === writeSeq && !Object.keys(pending).length) data.value = fresh;
    today.value = todayYmd();
  } catch {
    // Связь моргнула — попробуем на следующем круге.
  } finally {
    polling = false;
  }
}

// Своя тёплая светлая страница поверх тёмного приложения: фон body иначе
// проступает при перетягивании страницы на телефоне.
let prevBg = "";
let prevTitle = "";
onMounted(() => {
  prevBg = document.body.style.background;
  prevTitle = document.title;
  document.body.style.background = "#f6f1e7";
  document.documentElement.style.background = "#f6f1e7";
  document.title = "Проект N";
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pagehide", flushDraft);
  pollTimer = setInterval(poll, POLL_MS);
  load();
});
onBeforeUnmount(() => {
  document.body.style.background = prevBg;
  document.documentElement.style.background = "";
  document.title = prevTitle;
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("pagehide", flushDraft);
  clearInterval(pollTimer);
  clearTimeout(toastTimer);
  flushDraft();
});

// --- Рекомендации: какие сейчас, какие впереди, какие прошли ---

const tasks = computed(() => data.value?.tasks || []);
const activeTasks = computed(() => tasks.value.filter((t) => t.startDate <= today.value && t.endDate >= today.value));
const upcomingTasks = computed(() =>
  tasks.value.filter((t) => t.startDate > today.value).sort((a, b) => (a.startDate < b.startDate ? -1 : 1)),
);
const finishedTasks = computed(() => tasks.value.filter((t) => t.endDate < today.value));
const showFinished = ref(false);

function dayNumber(t, day = today.value) {
  return daysBetween(t.startDate, day) + 1;
}

// Рекомендация бывает «каждый день» (daily) или «хотя бы K раз за неделю /
// за весь срок» (week / term). Недели считаются от дня начала: 1–7, 8–14…
function isPeriod(t) {
  return t.mode === "week" || t.mode === "term";
}

// Чем меряется цель: у свинины — днями без неё, у остального — разами.
function unit(kind, n) {
  return kind === "pork" ? plural(n, "день", "дня", "дней") : plural(n, "раз", "раза", "раз");
}

function itemTitle(x) {
  if (x.kind === "pork") return "Не есть свинину";
  if (x.kind === "namaz") return "Намаз";
  return (x.title || "").trim() || "Другое — без названия";
}

// Годится и для рекомендации, и для черновика.
function goalText(x) {
  if (x.mode === "week") return `хотя бы ${x.goal} ${unit(x.kind, x.goal)} в неделю`;
  if (x.mode === "term") return `хотя бы ${x.goal} ${unit(x.kind, x.goal)} за весь срок`;
  if (x.kind === "pork") return "";
  if (x.kind === "custom") {
    // Своё дело — «хотя бы»: позвонил три раза при норме два — норма есть.
    return x.perDay > 1 ? `хотя бы ${x.perDay} ${plural(x.perDay, "раз", "раза", "раз")} в день` : "каждый день";
  }
  return `${x.perDay} ${plural(x.perDay, "раз", "раза", "раз")} в день`;
}

// «с 5 по 11 ноября» / «с 28 ноября по 4 декабря».
function spanText(from, to) {
  if (!from || !to) return "";
  if (from === to) return `только ${humanDate(from)}`;
  const [, fm, fd] = from.split("-").map(Number);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `с ${sameMonth ? fd : humanDate(from)} по ${humanDate(to)}`;
}

function taskHeading(x) {
  const g = goalText(x);
  return g ? `${itemTitle(x)}, ${g}` : itemTitle(x);
}

// Состояние дня у рекомендации — для точек, календаря и итогов. У цели за
// период день без дела — не провал, а просто «не в зачёт» (rest).
function dayState(t, day) {
  if (day > today.value) return "future";
  const c = t.marks[day];
  if (isPeriod(t)) {
    if (c > 0) return "full";
    return c === undefined && day === today.value ? "today" : "rest";
  }
  if (c === undefined) return day === today.value ? "today" : "none";
  if (c >= t.perDay) return "full";
  if (c === 0) return "miss";
  return "part";
}

function stateLabel(t, state) {
  const pork = t.kind === "pork";
  return {
    full: pork ? "не ел" : isPeriod(t) ? "сделал" : "выполнено",
    part: "частично",
    miss: pork ? "сорвался" : "не получилось",
    none: "не отмечено",
    rest: "не в зачёт",
    today: "сегодня, не отмечено",
    future: "ещё впереди",
  }[state];
}

// Неделя (или весь срок), в которую попадает день, и сколько в ней набрано.
function periodBlock(t, day) {
  let from = t.startDate;
  let to = t.endDate;
  let index = 0;
  if (t.mode === "week") {
    index = Math.max(0, Math.floor(daysBetween(t.startDate, day) / 7));
    from = addDays(t.startDate, index * 7);
    const weekEnd = addDays(from, 6);
    to = weekEnd < t.endDate ? weekEnd : t.endDate;
  }
  const length = daysBetween(from, to) + 1;
  let sum = 0;
  for (let i = 0; i < length; i++) sum += t.marks[addDays(from, i)] || 0;
  // Неполная последняя неделя: больше, чем в ней можно успеть, не требуем.
  const goal = Math.min(t.goal, length * t.perDay);
  return { index, from, to, sum, goal, done: sum >= goal };
}

function periodTitle(t, day) {
  const b = periodBlock(t, day);
  if (t.mode === "week") return `Неделя ${b.index + 1}: ${humanDate(b.from)} — ${humanDate(b.to)}`;
  return `Весь срок: до ${humanDate(b.to)}`;
}

function periodHint(t, day) {
  const b = periodBlock(t, day);
  const week = t.mode === "week";
  if (b.done) return week ? "✓ Цель этой недели выполнена" : "✓ Цель выполнена";
  if (b.to < today.value) return week ? "Цель этой недели не набрана" : "Цель не набрана";
  const left = b.goal - b.sum;
  const from = b.from > today.value ? b.from : today.value;
  const daysLeft = daysBetween(from, b.to) + 1;
  return `Осталось ${left} ${unit(t.kind, left)}, впереди ${daysLeft} ${plural(daysLeft, "день", "дня", "дней")}${week ? " недели" : ""}`;
}

function periodPct(t, day) {
  const b = periodBlock(t, day);
  return `${Math.min(100, Math.round((b.sum / Math.max(1, b.goal)) * 100))}%`;
}

// Точки по дням. Длинный срок (больше 42 дней) показывается последними
// 42 днями: год точками не помещается в телефон и ничего не говорит.
const STRIP_MAX = 42;
function strip(t) {
  const total = t.days;
  let from = 0;
  const last = Math.min(daysBetween(t.startDate, today.value), total - 1);
  if (total > STRIP_MAX) from = Math.max(0, Math.min(last + 7, total) - STRIP_MAX);
  const out = [];
  for (let i = from; i < Math.min(total, from + STRIP_MAX); i++) {
    const day = addDays(t.startDate, i);
    out.push({ day, state: dayState(t, day) });
  }
  return { cells: out, cut: from > 0 };
}

function summary(t) {
  const end = t.endDate < today.value ? t.endDate : today.value;
  const passed = Math.max(0, daysBetween(t.startDate, end) + 1);
  const s = { passed, full: 0, part: 0, miss: 0, none: 0 };
  for (let i = 0; i < passed; i++) {
    const st = dayState(t, addDays(t.startDate, i));
    if (st === "today") continue;
    s[st] = (s[st] || 0) + 1;
  }
  return s;
}

function summaryText(t) {
  if (t.mode === "week") {
    // Недели, которые уже начались; текущая засчитывается, только если набрана.
    let started = 0;
    let done = 0;
    for (let from = t.startDate; from <= t.endDate && from <= today.value; from = addDays(from, 7)) {
      const b = periodBlock(t, from);
      if (b.done) done++;
      if (b.to < today.value || b.done) started++;
    }
    return started ? `Недель с выполненной целью: ${done} из ${started}` : "";
  }
  if (t.mode === "term") {
    const b = periodBlock(t, t.startDate);
    return `За весь срок: ${b.sum} из ${b.goal}${b.done ? " ✓" : ""}`;
  }
  const s = summary(t);
  // Сегодня, пока не отмечено, в счёт не идёт: «0 из 1 дня» в первый же день
  // читалось как провал.
  const counted = s.full + s.part + s.miss + s.none;
  if (!counted) return "";
  const parts = [`${s.full} из ${counted} ${plural(counted, "дня", "дней", "дней")} — ${t.kind === "pork" ? "держался" : "выполнено"}`];
  if (s.part) parts.push(`частично: ${s.part}`);
  if (s.miss) parts.push(`${t.kind === "pork" ? "сорвался" : "не вышло"}: ${s.miss}`);
  if (s.none) parts.push(`не отмечено: ${s.none}`);
  return parts.join(" · ");
}

// --- Ученик: какой день отмечаем ---

const selectedDay = ref(todayYmd());
watch(today, (t, old) => {
  // Наступили новые сутки, а человек был на «сегодня» — едем вместе с ним.
  if (selectedDay.value === old) selectedDay.value = t;
});

// --- Календарь: месяц сеткой, день раскрашен сразу по всем рекомендациям ---

const WEEK = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const calMonth = ref(todayYmd().slice(0, 7));
// Выбрали день из точек под рекомендацией — календарь листается к нему.
watch(selectedDay, (d) => (calMonth.value = d.slice(0, 7)));

function dayAggregate(day) {
  const list = tasks.value.filter((t) => t.startDate <= day && t.endDate >= day);
  if (!list.length) return "empty";
  if (day > today.value) return "future";
  const states = list.map((t) => dayState(t, day)).filter((s) => s !== "rest");
  if (!states.length) return "empty";
  if (states.every((s) => s === "full")) return "full";
  if (states.every((s) => s === "miss")) return "miss";
  if (states.every((s) => s === "none" || s === "today")) return day === today.value ? "today" : "none";
  return "part";
}

const calCells = computed(() =>
  monthGrid(calMonth.value).map((day) => day && { day, num: Number(day.slice(8)), state: dayAggregate(day) }),
);

function toToday() {
  selectedDay.value = today.value;
  calMonth.value = today.value.slice(0, 7);
}

const dayTasks = computed(() =>
  tasks.value.filter((t) => t.startDate <= selectedDay.value && t.endDate >= selectedDay.value),
);

function pickDay(day) {
  if (day > today.value) return;
  selectedDay.value = day;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function dayTitle(day) {
  if (day === today.value) return "Сегодня";
  if (day === addDays(today.value, -1)) return "Вчера";
  return `${weekday(day)}, ${humanDate(day)}`;
}

async function mark(t, count) {
  const day = selectedDay.value;
  // Нажали на уже выбранное — снимаем отметку: случайное нажатие исправляется
  // тем же пальцем, без отдельной кнопки «сбросить».
  const next = t.marks[day] === count ? null : count;
  const key = `${t.id}:${day}`;
  if (pending[key]) return;
  pending[key] = true;
  const before = t.marks[day];
  if (next === null) delete t.marks[day];
  else t.marks[day] = next;
  try {
    writeSeq++;
    data.value = await setWayMark(token.value, t.id, day, next);
  } catch (e) {
    if (before === undefined) delete t.marks[day];
    else t.marks[day] = before;
    flash(e.message);
  } finally {
    delete pending[key];
  }
}

// Сколько кнопок «раз» показать у цели за период: больше цели за день
// набирать незачем (намаз «хотя бы раз в неделю» — это «сделал / нет»).
// Уже стоящая отметка видна всегда, даже если цель потом уменьшили.
function periodTop(t) {
  const marked = t.marks[selectedDay.value] || 0;
  return Math.min(t.perDay, Math.max(1, t.goal || 1, marked));
}

function markOptions(t) {
  if (isPeriod(t)) {
    if (t.kind === "pork") {
      return [
        { count: 1, label: "Не ел ✓", tone: "ok" },
        { count: 0, label: "Ел", tone: "rest" },
      ];
    }
    const top = periodTop(t);
    if (top === 1) {
      return [
        { count: 1, label: "Сделал ✓", tone: "ok" },
        { count: 0, label: "Не делал", tone: "rest" },
      ];
    }
    const out = [];
    for (let n = 0; n <= top; n++) out.push({ count: n, label: String(n), tone: n ? "ok" : "rest" });
    return out;
  }
  if (t.perDay === 1) {
    return t.kind === "pork"
      ? [
          { count: 1, label: "Не ел ✓", tone: "ok" },
          { count: 0, label: "Сорвался", tone: "bad" },
        ]
      : [
          { count: 1, label: "Сделал ✓", tone: "ok" },
          { count: 0, label: "Не получилось", tone: "bad" },
        ];
  }
  const out = [];
  for (let n = 0; n <= t.perDay; n++) {
    // «Хотя бы 2 раза» у своего дела: позвонил три — жмёт «2+».
    const label = n === t.perDay && t.kind === "custom" ? `${n}+` : String(n);
    out.push({ count: n, label, tone: n === t.perDay ? "ok" : n === 0 ? "bad" : "part" });
  }
  return out;
}

// --- Заметка ученика к дню ---

const notesByDay = computed(() => Object.fromEntries((data.value?.notes || []).map((n) => [n.date, n.text])));
const noteDraft = ref("");
const noteState = ref("");
let noteTimer = 0;

// С сервера в поле — только когда человек не пишет и ничего не уходит: иначе
// ответ опроса стирал бы набранное.
watch(
  [selectedDay, () => data.value],
  () => {
    if (noteState.value === "typing" || noteState.value === "saving") return;
    noteDraft.value = notesByDay.value[selectedDay.value] || "";
  },
  { immediate: true },
);

function onNoteInput() {
  noteState.value = "typing";
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveNote, 900);
}

async function saveNote() {
  clearTimeout(noteTimer);
  if (noteState.value !== "typing") return;
  const day = selectedDay.value;
  const text = noteDraft.value;
  noteState.value = "saving";
  writeSeq++;
  try {
    data.value = await setWayNote(token.value, day, text);
    // Пока сохранялось, дописали ещё — остаёмся в наборе, допишется следом.
    if (noteState.value === "saving") noteState.value = "saved";
  } catch (e) {
    if (noteState.value === "saving") noteState.value = "";
    flash(e.message);
  }
}

watch(selectedDay, (_, old) => {
  // Переключили день, не дождавшись сохранения, — дописанное сохраняем за
  // тем днём, где его писали.
  if (noteState.value === "typing") {
    clearTimeout(noteTimer);
    const text = noteDraft.value;
    noteState.value = "";
    writeSeq++;
    setWayNote(token.value, old, text).then((v) => (data.value = v), (e) => flash(e.message));
  }
  noteState.value = "";
  noteDraft.value = notesByDay.value[selectedDay.value] || "";
});

const recentNotes = computed(() => (data.value?.notes || []).slice(0, 10));

function openNoteDay(day) {
  selectedDay.value = day;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- Наставник: новая рекомендация и правка ---

const KINDS = [
  { kind: "pork", label: "Не есть свинину" },
  { kind: "namaz", label: "Намаз" },
  { kind: "custom", label: "Другое" },
];

// Как часто — двумя большими вариантами с пояснением под каждым: по одному
// слову «за неделю» было непонятно, что недели идут подряд до конца срока.
// «За весь срок» из формы убран по просьбе пользователя; старые такие
// рекомендации показываются как были, а при правке режим остаётся в списке.
const MODES = computed(() => {
  const pork = form.value?.kind === "pork";
  const list = [
    {
      mode: "daily",
      label: "Каждый день",
      hint: pork ? "ни одного дня со свининой" : "каждый день, сколько раз — ниже",
    },
    {
      mode: "week",
      label: pork ? "Сколько-то дней в неделю" : "Сколько-то раз в неделю",
      hint: "в любые дни — главное набрать за неделю",
    },
  ];
  if (form.value?.mode === "term") list.push({ mode: "term", label: "За весь срок", hint: "сколько-то раз за всё время" });
  return list;
});

// Срок — готовые длины и «другой день». У «в неделю» длины кратны неделе:
// неполная последняя неделя только сбивает с толку.
const SPANS = computed(() =>
  form.value?.mode === "week"
    ? [
        { days: 7, label: "1 неделя" },
        { days: 14, label: "2 недели" },
        { days: 28, label: "4 недели" },
        { days: 56, label: "8 недель" },
      ]
    : [
        { days: 7, label: "1 неделя" },
        { days: 14, label: "2 недели" },
        { days: 30, label: "Месяц" },
        { days: 40, label: "40 дней" },
      ],
);

// Окно дня начала — как на сервере (mentorStartBack / mentorStartAhead).
const START_BACK = 30;
const START_AHEAD = 120;
const MAX_DAYS = 365;

// { id?, draftId?, kind, title, mode, goal, perDay, days, start, note }.
// start — «today», «tomorrow» или ГГГГ-ММ-ДД из календаря. У новой — draftId:
// она с первой секунды пишется черновиком на сервер.
const form = ref(null);
const formError = ref("");
const saving = ref(false);
const confirmDelete = ref(null);
// Какой календарь в форме раскрыт: «start», «end» или никакой.
const picker = ref(null);
// Цель за неделю больше семи — редкость, поэтому шаговик прячется за «Больше».
const goalMore = ref(false);
const formEl = ref(null);
// Последний день держится, когда двигают начало, только если его выбрали в
// календаре: «до 30 ноября» — это дата. «1 неделя» — это длина, она едет.
let endPicked = false;

function newId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  // По голому http (вход с портом) randomUUID нет — собираем v4 сами.
  const b = window.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function resolveStart(start) {
  if (start === "tomorrow") return addDays(today.value, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(start || "")) return start;
  return today.value;
}

function openForm(f) {
  confirmDelete.value = null;
  formError.value = "";
  picker.value = null;
  endPicked = false;
  goalMore.value = f.mode !== "daily" && f.goal > 7;
  form.value = f;
  // Форма стоит под календарём — без прокрутки её на телефоне не видно.
  nextTick(() => formEl.value?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function openCreate() {
  openForm({
    draftId: newId(),
    kind: "pork",
    title: "",
    mode: "daily",
    goal: 1,
    perDay: 1,
    days: 7,
    start: "today",
    note: "",
  });
}

function openDraft(d) {
  openForm({
    draftId: d.id,
    kind: d.kind,
    title: d.title,
    mode: d.mode || "daily",
    goal: d.goal || 1,
    perDay: d.perDay || 1,
    days: d.days || 7,
    start: d.start || "today",
    note: d.note,
  });
}

// Черновик уходит через паузу в наборе, запросы — цепочкой, по одному: иначе
// старый мог бы прийти позже нового. Закрытые (сохранённые или отменённые)
// больше не пишутся — поздний запрос создал бы черновик заново.
const DRAFT_MS = 500;
let draftTimer = 0;
let draftChain = Promise.resolve();
const closedDrafts = new Set();

function draftBody(f) {
  return {
    kind: f.kind,
    title: f.title,
    mode: f.mode,
    goal: f.goal,
    perDay: f.perDay,
    days: Number(f.days) || 0,
    start: f.start,
    note: f.note,
  };
}

function queueDraft(f, keepalive = false) {
  const id = f.draftId;
  const body = draftBody(f);
  draftChain = draftChain.then(() =>
    closedDrafts.has(id) ? null : saveWayDraft(token.value, id, body, keepalive).catch((e) => flash(e.message)),
  );
  return draftChain;
}

watch(
  form,
  (f) => {
    clearTimeout(draftTimer);
    draftTimer = 0;
    if (!f?.draftId) return;
    draftTimer = setTimeout(() => {
      draftTimer = 0;
      queueDraft(f);
    }, DRAFT_MS);
  },
  { deep: true },
);

function flushDraft() {
  if (!draftTimer || !form.value?.draftId) return;
  clearTimeout(draftTimer);
  draftTimer = 0;
  queueDraft(form.value, true);
}

// Закрыть черновик: дождаться ушедших запросов, чтобы ни один не пришёл после.
async function closeDraft(id) {
  clearTimeout(draftTimer);
  draftTimer = 0;
  closedDrafts.add(id);
  await draftChain;
}

async function cancelForm() {
  const f = form.value;
  form.value = null;
  formError.value = "";
  if (!f?.draftId) return;
  await closeDraft(f.draftId);
  try {
    writeSeq++;
    data.value = await deleteWayDraft(token.value, f.draftId);
  } catch (e) {
    flash(e.message);
  }
}

// Черновики, кроме того, что сейчас открыт в форме.
const drafts = computed(() => (data.value?.drafts || []).filter((d) => d.id !== form.value?.draftId));

function draftHeading(d) {
  return taskHeading({ ...d, mode: d.mode || "daily", perDay: d.perDay || 1, goal: d.goal || 1 });
}

function draftDetails(d) {
  const start = resolveStart(d.start);
  if (!(d.days >= 1)) return `с ${humanDate(start)}`;
  return `${spanText(start, addDays(start, d.days - 1))}, ${d.days} ${plural(d.days, "день", "дня", "дней")}`;
}

// «Пишет сейчас» — черновик трогали последние две минуты; старше — просто
// брошенный черновик, и «пишет» про него было бы неправдой.
function draftLive(d) {
  return d.ageSeconds < 120;
}

async function publishDraft(d) {
  if (!(d.days >= 1) || (d.kind === "custom" && !(d.title || "").trim())) {
    openDraft(d);
    formError.value = d.days >= 1 ? "Напишите, что нужно делать" : "Выберите, до какого дня";
    return;
  }
  await closeDraft(d.id);
  try {
    writeSeq++;
    data.value = await createWayTask(token.value, {
      kind: d.kind,
      title: d.title,
      mode: d.mode || "daily",
      goal: d.goal || 1,
      perDay: d.perDay || 1,
      days: d.days,
      note: d.note,
      startDate: resolveStart(d.start),
      draftId: d.id,
    });
    flash("Рекомендация добавлена");
  } catch (e) {
    closedDrafts.delete(d.id);
    flash(e.message);
  }
}

async function removeDraft(d) {
  await closeDraft(d.id);
  try {
    writeSeq++;
    data.value = await deleteWayDraft(token.value, d.id);
  } catch (e) {
    flash(e.message);
  }
}

function openEdit(t) {
  openForm({
    id: t.id,
    kind: t.kind,
    title: t.title,
    mode: t.mode || "daily",
    goal: t.goal || 1,
    // В режиме «за период» perDay — потолок отметок, а не норма.
    perDay: isPeriod(t) ? 1 : t.perDay,
    days: t.days,
    start: t.startDate,
    note: t.note,
  });
}

// Сколько раз в день можно сделать — потолок цели за период.
function dayCap(kind) {
  return kind === "namaz" ? 5 : kind === "custom" ? 10 : 1;
}

const goalMax = computed(() => {
  const f = form.value;
  if (!f) return 1;
  const span = f.mode === "week" ? 7 : Math.max(1, Number(f.days) || 1);
  return span * dayCap(f.kind);
});

function clampGoal() {
  form.value.goal = Math.min(goalMax.value, Math.max(1, Number(form.value.goal) || 1));
}

function setKind(kind) {
  form.value.kind = kind;
  if (kind === "pork") form.value.perDay = 1;
  if (kind === "namaz" && form.value.perDay > 5) form.value.perDay = 5;
  clampGoal();
  if (form.value.goal <= 7) goalMore.value = false;
}

function setMode(mode) {
  form.value.mode = mode;
  // Перешли на «в неделю» — срок до целых недель вверх: так последняя неделя
  // не обрезана.
  if (mode === "week") {
    const days = Number(form.value.days) || 7;
    form.value.days = Math.min(MAX_DAYS, Math.ceil(days / 7) * 7);
    endPicked = false;
  }
  clampGoal();
}

function setGoal(n) {
  form.value.goal = n;
  clampGoal();
}

function stepGoal(delta) {
  form.value.goal = (Number(form.value.goal) || 0) + delta;
  clampGoal();
}

// Числа для выбора: раз в день у намаза 1–5, у своего 1–10; в неделю 1–7.
const perDayChoices = computed(() => {
  const n = form.value?.kind === "namaz" ? 5 : 10;
  return Array.from({ length: n }, (_, i) => i + 1);
});
// Ровные ряды: до семи — в один, десять — двумя по пять.
function numCols(count) {
  return { gridTemplateColumns: `repeat(${count <= 7 ? count : 5}, 1fr)` };
}
const goalChoices = computed(() => Array.from({ length: Math.min(7, goalMax.value) }, (_, i) => i + 1));

// --- Срок: день начала и последний день ---

const formStart = computed(() => (form.value ? resolveStart(form.value.start) : ""));
const formEnd = computed(() => {
  const days = Number(form.value?.days) || 0;
  return formStart.value && days >= 1 ? addDays(formStart.value, days - 1) : "";
});
const tomorrow = computed(() => addDays(today.value, 1));
const startMin = computed(() => addDays(today.value, -START_BACK));
const startMax = computed(() => addDays(today.value, START_AHEAD));
const endMax = computed(() => (formStart.value ? addDays(formStart.value, MAX_DAYS - 1) : ""));

// Какой из вариантов начала горит: сегодня, завтра или свой день.
const startChoice = computed(() =>
  formStart.value === today.value ? "today" : formStart.value === tomorrow.value ? "tomorrow" : "other",
);
const spanChoice = computed(() => {
  const days = Number(form.value?.days) || 0;
  return SPANS.value.some((s) => s.days === days) ? days : "other";
});

function shortDay(ymd) {
  return `${weekday(ymd)}, ${humanDate(ymd)}`;
}

function setStart(value) {
  const end = formEnd.value;
  form.value.start = value;
  if (endPicked && end) {
    const days = daysBetween(formStart.value, end) + 1;
    if (days >= 1 && days <= MAX_DAYS) form.value.days = days;
    else endPicked = false;
  }
}

function pickStart(ymd) {
  setStart(ymd === today.value ? "today" : ymd === tomorrow.value ? "tomorrow" : ymd);
  picker.value = null;
}

function setSpan(days) {
  endPicked = false;
  form.value.days = days;
  picker.value = null;
}

function pickEnd(ymd) {
  endPicked = true;
  form.value.days = daysBetween(formStart.value, ymd) + 1;
  clampGoal();
  picker.value = null;
}

function togglePicker(which) {
  picker.value = picker.value === which ? null : which;
}

// «5–11 ноября» / «26 ноября – 2 декабря».
function dashSpan(from, to) {
  if (from === to) return humanDate(from);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${humanDate(to)}`;
  return `${humanDate(from)} – ${humanDate(to)}`;
}

// Недели «в неделю» идут от дня начала, а не с понедельника — показываем
// их, когда недель больше одной. Неполную последнюю называем отдельно.
const formWeeks = computed(() => {
  const f = form.value;
  if (!f || f.mode !== "week" || !formEnd.value) return "";
  const weeks = [];
  for (let from = formStart.value; from <= formEnd.value; from = addDays(from, 7)) {
    const weekEnd = addDays(from, 6);
    weeks.push({ from, to: weekEnd < formEnd.value ? weekEnd : formEnd.value });
  }
  if (weeks.length < 2) return "";
  const last = weeks[weeks.length - 1];
  const short = daysBetween(last.from, last.to) + 1 < 7;
  const shown = weeks.length <= 4 ? weeks : [weeks[0], weeks[1]];
  let text = shown.map((w) => dashSpan(w.from, w.to)).join(", ");
  if (shown.length < weeks.length) text += ` … всего ${weeks.length} ${plural(weeks.length, "неделя", "недели", "недель")}`;
  if (short) {
    const n = daysBetween(last.from, last.to) + 1;
    text += `. Последняя неделя короче — ${n} ${plural(n, "день", "дня", "дней")}`;
  }
  return text;
});

// Правка сдвигает даты — сколько уже стоящих отметок окажутся за сроком.
// Они не стираются: вернуть даты — вернутся и отметки.
const hiddenMarks = computed(() => {
  const f = form.value;
  if (!f?.id || !formEnd.value) return 0;
  const t = tasks.value.find((x) => x.id === f.id);
  if (!t) return 0;
  return Object.keys(t.marks).filter((d) => d < formStart.value || d > formEnd.value).length;
});

// Итог формы простыми словами — что именно получит ученик.
const formSummary = computed(() => {
  const f = form.value;
  if (!f) return "";
  const what =
    f.kind === "pork" ? "не есть свинину" : f.kind === "namaz" ? "делать намаз" : `«${(f.title || "").trim() || "…"}»`;
  let how;
  if (f.mode === "week") how = `хотя бы ${f.goal} ${unit(f.kind, f.goal)} в неделю`;
  else if (f.mode === "term") how = `хотя бы ${f.goal} ${unit(f.kind, f.goal)} за весь срок`;
  else how = goalText({ kind: f.kind, mode: "daily", perDay: f.perDay }) || "каждый день";
  const days = Number(f.days) || 0;
  const span = formEnd.value ? ` — ${spanText(formStart.value, formEnd.value)}, ${days} ${plural(days, "день", "дня", "дней")}` : "";
  return `${studentLabel.value}: ${what} ${how}${span}`;
});

async function saveForm() {
  const f = form.value;
  const days = Math.round(Number(f.days));
  if (!days || days < 1 || days > MAX_DAYS) {
    formError.value = "Выберите, до какого дня";
    return;
  }
  if (f.kind === "custom" && !f.title.trim()) {
    formError.value = "Напишите, что нужно делать";
    return;
  }
  if (f.mode !== "daily") clampGoal();
  const body = {
    kind: f.kind,
    title: f.title,
    mode: f.mode,
    goal: f.goal,
    perDay: f.perDay,
    days,
    note: f.note,
    startDate: formStart.value,
    // При правке начало двигается только по явному флагу — см. сервер.
    moveStart: Boolean(f.id),
    draftId: f.draftId || null,
  };
  saving.value = true;
  formError.value = "";
  if (f.draftId) await closeDraft(f.draftId);
  try {
    writeSeq++;
    data.value = f.id ? await updateWayTask(token.value, f.id, body) : await createWayTask(token.value, body);
    form.value = null;
    flash(f.id ? "Сохранено" : "Рекомендация добавлена");
  } catch (e) {
    // Не сохранилось — черновик снова пишется, иначе правки пропадут.
    if (f.draftId) closedDrafts.delete(f.draftId);
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function removeTask(t) {
  confirmDelete.value = null;
  try {
    writeSeq++;
    data.value = await deleteWayTask(token.value, t.id);
    flash("Удалено");
  } catch (e) {
    flash(e.message);
  }
}

// Приветствие по-абазински: «Мыш бзи» — «добрый день» (мыш — день, бзи —
// хороший). Подсказка при наведении — перевод. Поменять — здесь.
const GREETING = "Мыш бзи";
const GREETING_RU = "Добрый день (по-абазински)";
const greetingName = computed(() => (isMentor.value ? mentorName.value : studentName.value));
// Имена не склоняем — ставим их только в именительном: «для Егор» режет глаз.
const studentLabel = computed(() => studentName.value || "Ученик");
</script>

<template>
  <div class="way">
    <div v-if="loading && !data" class="way-center">Загрузка…</div>

    <div v-else-if="fatal" class="way-center">
      <p>{{ fatal }}</p>
      <button class="way-btn" @click="load()">Попробовать ещё раз</button>
    </div>

    <template v-else-if="data">
      <header class="way-head">
        <div class="way-greet" :title="GREETING_RU">{{ GREETING }}{{ greetingName ? `, ${greetingName}` : "" }}</div>
        <div class="way-sub">
          <template v-if="isMentor">Ваши рекомендации · {{ studentLabel }}</template>
          <template v-else>Сегодня, {{ humanDate(today) }}</template>
        </div>
      </header>

      <!-- ============ Календарь — обоим ============ -->
      <section v-if="tasks.length || recentNotes.length" class="way-card way-cal">
        <div class="way-cal-head">
          <button class="way-step" aria-label="Предыдущий месяц" @click="calMonth = addMonths(calMonth, -1)">‹</button>
          <b>{{ monthTitle(calMonth) }}</b>
          <button class="way-step" aria-label="Следующий месяц" @click="calMonth = addMonths(calMonth, 1)">›</button>
        </div>
        <div class="way-cal-grid">
          <span v-for="w in WEEK" :key="w" class="way-cal-wd">{{ w }}</span>
          <template v-for="(c, i) in calCells" :key="c ? c.day : `b${i}`">
            <span v-if="!c"></span>
            <button
              v-else
              class="way-cal-day"
              :class="[`ag-${c.state}`, { 'is-today': c.day === today, 'is-sel': c.day === selectedDay, 'has-note': notesByDay[c.day] }]"
              :disabled="c.day > today"
              :aria-pressed="c.day === selectedDay"
              @click="selectedDay = c.day"
            >
              {{ c.num }}
            </button>
          </template>
        </div>
        <button
          v-if="selectedDay !== today || calMonth !== today.slice(0, 7)"
          class="way-link way-cal-today"
          @click="toToday"
        >
          К сегодня
        </button>
      </section>

      <!-- Наставнику — что было в выбранный день -->
      <section v-if="isMentor && (tasks.length || recentNotes.length)" class="way-card is-flat">
        <h2 class="way-h way-h-in">{{ dayTitle(selectedDay) }}</h2>
        <p v-if="!dayTasks.length" class="way-sum">В этот день рекомендаций нет.</p>
        <div v-for="t in dayTasks" :key="t.id" class="way-dd">
          <i class="way-dot" :class="`st-${dayState(t, selectedDay)}`"></i>
          <span class="way-dd-name">{{ taskHeading(t) }}</span>
          <b>
            {{ stateLabel(t, dayState(t, selectedDay))
            }}<template v-if="t.perDay > 1 && t.marks[selectedDay] !== undefined">
              · {{ isPeriod(t) ? `${t.marks[selectedDay]} ${unit(t.kind, t.marks[selectedDay])}` : `${t.marks[selectedDay]} из ${t.perDay}` }}</template
            >
          </b>
        </div>
        <p v-if="notesByDay[selectedDay]" class="way-note">{{ notesByDay[selectedDay] }} — {{ studentLabel }}</p>
      </section>

      <!-- ============ Ученик ============ -->
      <template v-if="!isMentor">
        <section v-for="d in data.drafts || []" :key="d.id" class="way-card way-writing">
          <div class="way-writing-who">
            <template v-if="draftLive(d)">✍️ {{ mentorName || "Наставник" }} пишет рекомендацию…</template>
            <template v-else>📝 Черновик{{ mentorName ? ` от ${mentorName}` : "" }} — ещё не назначено</template>
          </div>
          <b>{{ draftHeading(d) }}</b>
          <span class="way-dates">{{ draftDetails(d) }}</span>
          <p v-if="d.note" class="way-note">«{{ d.note }}»</p>
        </section>

        <h2 class="way-h">{{ dayTitle(selectedDay) }}</h2>

        <p v-if="!dayTasks.length" class="way-empty">
          <template v-if="!tasks.length">
            Пока рекомендаций нет. Когда {{ mentorName || "наставник" }} их назначит, они появятся здесь.
          </template>
          <template v-else>На этот день рекомендаций нет.</template>
        </p>

        <article v-for="t in dayTasks" :key="t.id" class="way-card">
          <div class="way-card-top">
            <h3>{{ taskHeading(t) }}</h3>
            <span class="way-count">день {{ dayNumber(t, selectedDay) }} из {{ t.days }}</span>
          </div>
          <p v-if="t.note" class="way-note">
            «{{ t.note }}»<span v-if="mentorName"> — {{ mentorName }}</span>
          </p>

          <div v-if="isPeriod(t)" class="way-goal" :class="{ 'is-done': periodBlock(t, selectedDay).done }">
            <div class="way-goal-line">
              <span>{{ periodTitle(t, selectedDay) }}</span>
              <b>{{ periodBlock(t, selectedDay).sum }} из {{ periodBlock(t, selectedDay).goal }}</b>
            </div>
            <div class="way-bar"><i :style="{ width: periodPct(t, selectedDay) }"></i></div>
            <div class="way-goal-hint">{{ periodHint(t, selectedDay) }}</div>
          </div>

          <div v-if="t.perDay > 1" class="way-ask">
            {{ isPeriod(t) ? "Сколько раз сделал в этот день?" : "Сколько раз сделал?" }}
          </div>
          <div class="way-marks" :class="{ 'is-count': t.perDay > 1 }">
            <button
              v-for="o in markOptions(t)"
              :key="o.count"
              class="way-mark"
              :class="[`tone-${o.tone}`, { 'is-on': t.marks[selectedDay] === o.count }]"
              :aria-pressed="t.marks[selectedDay] === o.count"
              @click="mark(t, o.count)"
            >
              {{ o.label }}
            </button>
          </div>
          <div class="way-hint">
            <template v-if="t.marks[selectedDay] === undefined">Не отмечено</template>
            <template v-else>Отмечено. Нажмите ещё раз, чтобы снять</template>
          </div>

          <div class="way-strip" :aria-label="summaryText(t)">
            <span v-if="strip(t).cut" class="way-strip-cut">…</span>
            <button
              v-for="c in strip(t).cells"
              :key="c.day"
              class="way-dot"
              :class="[`st-${c.state}`, { 'is-sel': c.day === selectedDay }]"
              :title="`${humanDate(c.day)}: ${stateLabel(t, c.state)}`"
              :disabled="c.state === 'future'"
              @click="pickDay(c.day)"
            ></button>
          </div>
          <div class="way-sum">{{ summaryText(t) }}</div>
        </article>

        <section v-if="selectedDay <= today" class="way-card way-notebox">
          <label for="way-note">Заметка к дню<span class="way-opt"> — увидит {{ mentorName || "наставник" }}</span></label>
          <textarea
            id="way-note"
            v-model="noteDraft"
            rows="2"
            maxlength="1000"
            @input="onNoteInput"
            @blur="saveNote"
          ></textarea>
          <div class="way-hint">
            {{ noteState === "saving" ? "Сохраняю…" : noteState === "saved" ? "Сохранено" : "" }}
          </div>
        </section>

        <section v-if="recentNotes.length" class="way-more">
          <h2 class="way-h">Мои заметки</h2>
          <button v-for="n in recentNotes" :key="n.date" class="way-line way-line-btn" @click="openNoteDay(n.date)">
            <b>{{ dayTitle(n.date) }}:</b> {{ n.text }}
          </button>
        </section>

        <section v-if="upcomingTasks.length" class="way-more">
          <h2 class="way-h">Скоро</h2>
          <div v-for="t in upcomingTasks" :key="t.id" class="way-line">
            {{ taskHeading(t) }} — {{ spanText(t.startDate, t.endDate) }}
          </div>
        </section>
      </template>

      <!-- ============ Наставник ============ -->
      <template v-else>
        <section v-if="drafts.length" class="way-card way-drafts">
          <h2 class="way-h way-h-in">Черновики — не сохранены</h2>
          <p class="way-sum">Вы начали и не сохранили. Создать их?</p>
          <div v-for="d in drafts" :key="d.id" class="way-draft">
            <div class="way-draft-text">
              <b>{{ draftHeading(d) }}</b>
              <span class="way-dates">{{ draftDetails(d) }}</span>
              <span v-if="d.note" class="way-dates">«{{ d.note }}»</span>
            </div>
            <div class="way-actions">
              <button class="way-btn is-primary" @click="publishDraft(d)">Создать</button>
              <button class="way-btn" @click="openDraft(d)">Изменить</button>
              <button class="way-link" @click="removeDraft(d)">Удалить</button>
            </div>
          </div>
        </section>

        <button v-if="!form" class="way-btn is-big" @click="openCreate">＋ Новая рекомендация</button>

        <section v-if="form" ref="formEl" class="way-card way-form">
          <h2 class="way-h way-h-in">{{ form.id ? `Изменить: ${itemTitle(form)}` : "Новая рекомендация" }}</h2>

          <!-- 1. Что -->
          <div v-if="!form.id" class="way-field">
            <span class="way-q"><i>1</i>Что делать</span>
            <div class="way-kinds">
              <button
                v-for="k in KINDS"
                :key="k.kind"
                class="way-kind"
                :class="{ 'is-on': form.kind === k.kind }"
                :aria-pressed="form.kind === k.kind"
                @click="setKind(k.kind)"
              >
                {{ k.label }}
              </button>
            </div>
          </div>
          <label v-if="form.kind === 'custom'" class="way-field">
            <span>{{ form.id ? "Что делать" : "Напишите, что именно" }}</span>
            <input v-model="form.title" maxlength="120" />
          </label>

          <!-- 2. Как часто -->
          <div class="way-field">
            <span class="way-q"><i>{{ form.id ? 1 : 2 }}</i>Как часто</span>
            <div class="way-modes" role="radiogroup">
              <button
                v-for="m in MODES"
                :key="m.mode"
                class="way-mode"
                role="radio"
                :class="{ 'is-on': form.mode === m.mode }"
                :aria-checked="form.mode === m.mode"
                @click="setMode(m.mode)"
              >
                <i class="way-radio"></i>
                <span>
                  <b>{{ m.label }}</b>
                  <small>{{ m.hint }}</small>
                </span>
              </button>
            </div>
          </div>

          <div v-if="form.mode === 'daily' && form.kind !== 'pork'" class="way-field">
            <span>{{ form.kind === "custom" ? "Хотя бы сколько раз в день" : "Сколько раз в день" }}</span>
            <div class="way-nums" :style="numCols(perDayChoices.length)">
              <button
                v-for="n in perDayChoices"
                :key="n"
                class="way-chip"
                :class="{ 'is-on': form.perDay === n }"
                :aria-pressed="form.perDay === n"
                @click="form.perDay = n"
              >
                {{ n }}
              </button>
            </div>
          </div>

          <div v-if="form.mode === 'week'" class="way-field">
            <span>{{ form.kind === "pork" ? "Хотя бы сколько дней в неделю" : "Хотя бы сколько раз в неделю" }}</span>
            <div class="way-nums" :style="numCols(goalChoices.length)">
              <button
                v-for="n in goalChoices"
                :key="n"
                class="way-chip"
                :class="{ 'is-on': form.goal === n && !goalMore }"
                :aria-pressed="form.goal === n && !goalMore"
                @click="goalMore = false; setGoal(n)"
              >
                {{ n }}
              </button>
            </div>
            <button
              v-if="goalMax > 7 && !goalMore"
              class="way-link way-more-link"
              @click="goalMore = true; setGoal(Math.max(8, form.goal))"
            >
              Нужно больше 7 раз
            </button>
            <div v-if="goalMore" class="way-stepper">
              <button class="way-step" :disabled="form.goal <= 1" @click="stepGoal(-1)">−</button>
              <b>{{ form.goal }}</b>
              <button class="way-step" :disabled="form.goal >= goalMax" @click="stepGoal(1)">＋</button>
              <span class="way-dates">раз в неделю</span>
            </div>
          </div>

          <div v-if="form.mode === 'term'" class="way-field">
            <span>Хотя бы сколько {{ form.kind === "pork" ? "дней" : "раз" }} за весь срок</span>
            <div class="way-stepper">
              <button class="way-step" :disabled="form.goal <= 1" @click="stepGoal(-1)">−</button>
              <b>{{ form.goal }}</b>
              <button class="way-step" :disabled="form.goal >= goalMax" @click="stepGoal(1)">＋</button>
            </div>
          </div>

          <!-- 3. С какого дня -->
          <div class="way-field">
            <span class="way-q"><i>{{ form.id ? 2 : 3 }}</i>С какого дня</span>
            <div class="way-days3">
              <button
                class="way-daychip"
                :class="{ 'is-on': startChoice === 'today' }"
                :aria-pressed="startChoice === 'today'"
                @click="setStart('today'); picker = null"
              >
                <b>Сегодня</b><small>{{ shortDay(today) }}</small>
              </button>
              <button
                class="way-daychip"
                :class="{ 'is-on': startChoice === 'tomorrow' }"
                :aria-pressed="startChoice === 'tomorrow'"
                @click="setStart('tomorrow'); picker = null"
              >
                <b>Завтра</b><small>{{ shortDay(tomorrow) }}</small>
              </button>
              <button
                class="way-daychip"
                :class="{ 'is-on': startChoice === 'other', 'is-open': picker === 'start' }"
                :aria-expanded="picker === 'start'"
                @click="togglePicker('start')"
              >
                <template v-if="startChoice === 'other'"><b>{{ humanDate(formStart) }}</b><small>{{ weekday(formStart) }} · сменить</small></template>
                <template v-else><b>Другой день</b><small>в календаре</small></template>
              </button>
            </div>
            <WayDatePicker
              v-if="picker === 'start'"
              :model-value="formStart"
              :today="today"
              :min="startMin"
              :max="startMax"
              :range-from="formStart"
              :range-to="formEnd"
              caption="Нажмите первый день"
              @update:model-value="pickStart"
            />
          </div>

          <!-- 4. До какого дня -->
          <div class="way-field">
            <span class="way-q"><i>{{ form.id ? 3 : 4 }}</i>До какого дня</span>
            <div class="way-chips">
              <button
                v-for="sp in SPANS"
                :key="sp.days"
                class="way-chip is-text"
                :class="{ 'is-on': spanChoice === sp.days }"
                :aria-pressed="spanChoice === sp.days"
                @click="setSpan(sp.days)"
              >
                {{ sp.label }}
              </button>
              <button
                class="way-chip is-text"
                :class="{ 'is-on': spanChoice === 'other', 'is-open': picker === 'end' }"
                :aria-expanded="picker === 'end'"
                @click="togglePicker('end')"
              >
                {{ spanChoice === "other" ? `до ${humanDate(formEnd)}` : "Выбрать дату" }}
              </button>
            </div>
            <WayDatePicker
              v-if="picker === 'end'"
              :model-value="formEnd"
              :today="today"
              :min="formStart"
              :max="endMax"
              :range-from="formStart"
              :range-to="formEnd"
              caption="Нажмите последний день"
              @update:model-value="pickEnd"
            />
            <div v-if="formEnd" class="way-dates">
              Последний день — <b>{{ shortDay(formEnd) }}</b> включительно
            </div>
          </div>

          <!-- Итог -->
          <div class="way-summary">
            {{ formSummary }}
            <div v-if="formWeeks" class="way-summary-sub">Неделя считается от первого дня: {{ formWeeks }}</div>
          </div>
          <div v-if="hiddenMarks" class="way-warn">
            Отметок вне новых дат: {{ hiddenMarks }}. Отметки не удаляются — вернёте даты, вернутся и они.
          </div>

          <label class="way-field">
            <span>Пояснение <span class="way-opt">(необязательно)</span></span>
            <textarea v-model="form.note" rows="2" maxlength="1000"></textarea>
          </label>

          <div v-if="formError" class="way-error">{{ formError }}</div>
          <div class="way-actions">
            <button class="way-btn is-primary is-grow" :disabled="saving" @click="saveForm">
              {{ saving ? "Сохраняю…" : form.id ? "Сохранить" : "Назначить" }}
            </button>
            <button class="way-btn" :disabled="saving" @click="cancelForm">Отмена</button>
          </div>
        </section>

<p v-if="!tasks.length && !form" class="way-empty">
          Здесь вы назначаете, сколько дней не есть свинину, сколько раз в день делать намаз
          или что-то своё. {{ studentName || "Ученик" }} будет отмечать каждый день, а вы увидите, как получается.
        </p>

        <h2 v-if="activeTasks.length" class="way-h">Сейчас</h2>
        <article v-for="t in activeTasks" :key="t.id" class="way-card">
          <div class="way-card-top">
            <h3>{{ taskHeading(t) }}</h3>
            <span class="way-count">день {{ dayNumber(t) }} из {{ t.days }}</span>
          </div>
          <div class="way-dates">{{ spanText(t.startDate, t.endDate) }} включительно</div>
          <p v-if="t.note" class="way-note">«{{ t.note }}»</p>
          <div v-if="isPeriod(t)" class="way-goal" :class="{ 'is-done': periodBlock(t, today).done }">
            <div class="way-goal-line">
              <span>{{ periodTitle(t, today) }}</span>
              <b>{{ periodBlock(t, today).sum }} из {{ periodBlock(t, today).goal }}</b>
            </div>
            <div class="way-bar"><i :style="{ width: periodPct(t, today) }"></i></div>
            <div class="way-goal-hint">{{ periodHint(t, today) }}</div>
          </div>
          <div class="way-strip">
            <span v-if="strip(t).cut" class="way-strip-cut">…</span>
            <span
              v-for="c in strip(t).cells"
              :key="c.day"
              class="way-dot"
              :class="`st-${c.state}`"
              :title="`${humanDate(c.day)}: ${stateLabel(t, c.state)}${t.perDay > 1 && !isPeriod(t) && t.marks[c.day] !== undefined ? ` (${t.marks[c.day]} из ${t.perDay})` : ''}`"
            ></span>
          </div>
          <div class="way-sum">{{ summaryText(t) || "Сегодня первый день" }}</div>
          <div v-if="t.marks[today] !== undefined" class="way-today">
            Сегодня: {{ stateLabel(t, dayState(t, today)) }}<template v-if="t.perDay > 1"> ({{ isPeriod(t) ? `${t.marks[today]} ${unit(t.kind, t.marks[today])}` : `${t.marks[today]} из ${t.perDay}` }})</template>
          </div>

          <div v-if="confirmDelete === t.id" class="way-confirm">
            <span>Удалить рекомендацию вместе с отметками?</span>
            <div class="way-actions">
              <button class="way-btn is-danger" @click="removeTask(t)">Удалить</button>
              <button class="way-btn" @click="confirmDelete = null">Нет</button>
            </div>
          </div>
          <div v-else class="way-actions is-quiet">
            <button class="way-link" @click="openEdit(t)">Изменить</button>
            <button class="way-link" @click="confirmDelete = t.id">Удалить</button>
          </div>
        </article>

        <section v-if="upcomingTasks.length" class="way-more">
          <h2 class="way-h">Скоро</h2>
          <article v-for="t in upcomingTasks" :key="t.id" class="way-card is-flat">
            <div class="way-card-top">
              <h3>{{ taskHeading(t) }}</h3>
            </div>
            <div class="way-dates">{{ spanText(t.startDate, t.endDate) }}, {{ t.days }} {{ plural(t.days, "день", "дня", "дней") }}</div>
            <div v-if="confirmDelete === t.id" class="way-confirm">
              <span>Удалить рекомендацию?</span>
              <div class="way-actions">
                <button class="way-btn is-danger" @click="removeTask(t)">Удалить</button>
                <button class="way-btn" @click="confirmDelete = null">Нет</button>
              </div>
            </div>
            <div v-else class="way-actions is-quiet">
              <button class="way-link" @click="openEdit(t)">Изменить</button>
              <button class="way-link" @click="confirmDelete = t.id">Удалить</button>
            </div>
          </article>
        </section>

        <section v-if="recentNotes.length" class="way-more">
          <h2 class="way-h">Заметки · {{ studentLabel }}</h2>
          <button v-for="n in recentNotes" :key="n.date" class="way-line way-line-btn" @click="openNoteDay(n.date)">
            <b>{{ dayTitle(n.date) }}:</b> {{ n.text }}
          </button>
        </section>
      </template>

      <!-- ============ Прошедшие — обоим ============ -->
      <section v-if="finishedTasks.length" class="way-more">
        <button class="way-link way-fold" @click="showFinished = !showFinished">
          {{ showFinished ? "▾" : "▸" }} Завершённые ({{ finishedTasks.length }})
        </button>
        <template v-if="showFinished">
          <article v-for="t in finishedTasks" :key="t.id" class="way-card is-flat">
            <div class="way-card-top">
              <h3>{{ taskHeading(t) }}</h3>
            </div>
            <div class="way-dates">{{ humanDate(t.startDate) }} — {{ humanDate(t.endDate) }}</div>
            <div class="way-strip">
              <component
                :is="isMentor ? 'span' : 'button'"
                v-for="c in strip(t).cells"
                :key="c.day"
                class="way-dot"
                :class="[`st-${c.state}`, { 'is-sel': !isMentor && c.day === selectedDay }]"
                :title="`${humanDate(c.day)}: ${stateLabel(t, c.state)}`"
                @click="!isMentor && pickDay(c.day)"
              ></component>
            </div>
            <div class="way-sum">{{ summaryText(t) }}</div>
          </article>
        </template>
      </section>

      <div v-if="tasks.length" class="way-legend">
        <span><i class="way-dot st-full"></i>выполнено</span>
        <span><i class="way-dot st-part"></i>частично</span>
        <span><i class="way-dot st-miss"></i>не вышло</span>
        <span><i class="way-dot st-none"></i>не отмечено</span>
      </div>
    </template>

    <div v-if="toast" class="way-toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.way {
  --bg: #f6f1e7;
  --card: #fffdf8;
  --line: #e6dccb;
  --text: #2d2a24;
  --dim: #6f685b;
  --muted: #9a917f;
  --green: #2f6b4f;
  --green-soft: #e3efe7;
  --gold: #c2953f;
  --gold-soft: #f6ead0;
  --red: #b85c45;
  --red-soft: #f5e1da;

  width: 100%;
  max-width: 560px;
  min-height: 100vh;
  margin: 0 auto;
  padding: calc(18px + env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--bg);
  color: var(--text);
  font-size: 17px;
  line-height: 1.4;
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
}
.way *,
.way *::before,
.way *::after {
  box-sizing: border-box;
}
.way-center {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  color: var(--dim);
}

.way-head {
  padding: 6px 2px 4px;
}
.way-greet {
  font-size: 22px;
  font-weight: 700;
  color: var(--green);
}
.way-sub {
  margin-top: 2px;
  color: var(--dim);
}
.way-h {
  margin: 8px 2px 0;
  font-size: 19px;
  font-weight: 700;
}
.way-empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 16px;
  color: var(--dim);
  text-align: center;
}

/* Календарь */
.way-cal {
  gap: 10px;
}
.way-cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.way-cal-head b {
  font-size: 18px;
}
.way-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}
.way-cal-wd {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}
.way-cal-day {
  aspect-ratio: 1;
  min-height: 40px;
  border-radius: 12px;
  border: 2px solid transparent;
  background: transparent;
  color: var(--dim);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.way-cal-day:disabled {
  cursor: default;
}
.way-cal-day.ag-empty {
  color: var(--muted);
  font-weight: 400;
}
.way-cal-day.ag-future {
  background: #fff;
  border-color: var(--line);
  color: var(--muted);
}
.way-cal-day.ag-none,
.way-cal-day.ag-today {
  background: #e7e0d2;
  color: var(--text);
}
.way-cal-day.ag-full {
  background: var(--green);
  color: #fff;
}
.way-cal-day.ag-part {
  background: var(--gold);
  color: #fff;
}
.way-cal-day.ag-miss {
  background: var(--red);
  color: #fff;
}
.way-cal-day.is-today {
  border-color: var(--green);
}
.way-cal-day.is-sel {
  outline: 3px solid var(--text);
  outline-offset: 1px;
}
/* День с заметкой ученика — точка в углу клетки */
.way-cal-day {
  position: relative;
}
.way-cal-day.has-note::after {
  content: "";
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 0 1.5px #fff;
}
.way-cal-today {
  align-self: center;
}
.way-h-in {
  margin: 0;
}
.way-dd {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}
.way-dd .way-dot {
  flex-shrink: 0;
}
.way-dd-name {
  flex: 1;
}
.way-dd b {
  color: var(--dim);
  font-weight: 600;
  text-align: right;
}

/* Цель за период */
.way-goal {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 14px;
  background: var(--green-soft);
}
.way-goal-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 15px;
}
.way-goal-line b {
  font-size: 18px;
  color: var(--green);
  white-space: nowrap;
}
.way-bar {
  height: 10px;
  border-radius: 5px;
  background: #fff;
  overflow: hidden;
}
.way-bar i {
  display: block;
  height: 100%;
  border-radius: 5px;
  background: var(--green);
  transition: width 0.25s;
}
.way-goal-hint {
  font-size: 14px;
  color: var(--dim);
}
.way-goal.is-done .way-goal-hint {
  color: var(--green);
  font-weight: 600;
}
.way-summary {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--green-soft);
  color: var(--green);
  font-weight: 600;
  line-height: 1.45;
}
.way-mark.tone-rest.is-on {
  background: #b9b09f;
  border-color: #b9b09f;
  color: #fff;
}
.way-dot.st-rest {
  background: #efe9dd;
}

/* Черновики */
.way-drafts {
  border-color: var(--gold);
  background: #fffaf0;
}
.way-draft {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.way-draft-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.way-writing {
  border-style: dashed;
  border-color: var(--gold);
  background: #fffaf0;
  gap: 4px;
}
.way-writing-who {
  font-size: 14px;
  color: var(--gold);
  font-weight: 600;
}

/* Карточка */
.way-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;
  background: var(--card);
  border: 1px solid var(--line);
  box-shadow: 0 1px 2px rgba(60, 45, 20, 0.05);
}
.way-card.is-flat {
  box-shadow: none;
}
.way-card-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.way-card h3 {
  margin: 0;
  font-size: 18px;
}
.way-count {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--green);
  font-weight: 600;
}
.way-dates {
  font-size: 14px;
  color: var(--dim);
}
.way-note {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--gold);
  background: var(--gold-soft);
  border-radius: 0 10px 10px 0;
  font-style: italic;
  color: #5a4a2a;
}
.way-ask {
  font-size: 15px;
  color: var(--dim);
}

/* Отметки */
.way-marks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.way-marks.is-count {
  grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
}
.way-mark {
  min-height: 54px;
  border-radius: 14px;
  border: 2px solid var(--line);
  background: #fff;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.way-marks.is-count .way-mark {
  font-size: 20px;
}
.way-mark.tone-ok.is-on {
  background: var(--green);
  border-color: var(--green);
  color: #fff;
}
.way-mark.tone-part.is-on {
  background: var(--gold);
  border-color: var(--gold);
  color: #fff;
}
.way-mark.tone-bad.is-on {
  background: var(--red);
  border-color: var(--red);
  color: #fff;
}
.way-hint {
  font-size: 13px;
  color: var(--muted);
  min-height: 1em;
}

/* Точки по дням */
.way-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-top: 4px;
}
.way-strip-cut {
  color: var(--muted);
  line-height: 14px;
}
.way-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  background: #e2dccf;
  font: inherit;
}
button.way-dot {
  cursor: pointer;
}
button.way-dot:disabled {
  cursor: default;
}
.way-dot.st-full {
  background: var(--green);
}
.way-dot.st-part {
  background: var(--gold);
}
.way-dot.st-miss {
  background: var(--red);
}
.way-dot.st-none {
  background: #d8d1c2;
}
.way-dot.st-today {
  background: #fff;
  border-color: var(--green);
}
.way-dot.st-future {
  background: transparent;
  border-color: #e2dccf;
}
.way-dot.is-sel {
  outline: 2px solid var(--text);
  outline-offset: 1px;
}
.way-sum {
  font-size: 14px;
  color: var(--dim);
}
.way-today {
  font-size: 14px;
  color: var(--green);
  font-weight: 600;
}

/* Заметка */
.way-notebox label {
  font-weight: 600;
}
.way-opt {
  font-weight: 400;
  color: var(--muted);
}
textarea,
input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: var(--text);
  font: inherit;
  font-size: 16px; /* меньше 16px — iOS приближает страницу при фокусе */
  resize: vertical;
}
textarea:focus,
input:focus {
  outline: 2px solid var(--green-soft);
  border-color: var(--green);
}

/* Форма наставника */
.way-form {
  gap: 14px;
}
.way-kinds {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}
.way-kind {
  min-height: 56px;
  padding: 6px;
  border-radius: 14px;
  border: 2px solid var(--line);
  background: #fff;
  color: var(--text);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.way-kind.is-on {
  border-color: var(--green);
  background: var(--green-soft);
  color: var(--green);
}
.way-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.way-field > span {
  font-weight: 600;
}
.way-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.way-chip {
  min-width: 48px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.way-chip.is-wide {
  flex: 1;
}
.way-chip.is-on {
  background: var(--green);
  border-color: var(--green);
  color: #fff;
}
.way-stepper {
  display: flex;
  align-items: center;
  gap: 10px;
}
.way-stepper b {
  min-width: 36px;
  text-align: center;
  font-size: 22px;
}
.way-step {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--green);
  font-size: 22px;
  cursor: pointer;
}
.way-step:disabled {
  opacity: 0.35;
}
.way-num {
  width: 90px;
  text-align: center;
  font-size: 20px;
}

/* Форма: шаги, «как часто», дни */
.way-q {
  display: flex;
  align-items: center;
  gap: 8px;
}
.way-q i {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  font-size: 13px;
  font-style: normal;
}
.way-modes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.way-mode {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 10px 14px;
  border-radius: 14px;
  border: 2px solid var(--line);
  background: #fff;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.way-mode span {
  display: flex;
  flex-direction: column;
}
.way-mode small {
  font-size: 14px;
  color: var(--dim);
}
.way-radio {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--line);
  background: #fff;
}
.way-mode.is-on {
  border-color: var(--green);
  background: var(--green-soft);
}
.way-mode.is-on b {
  color: var(--green);
}
.way-mode.is-on .way-radio {
  border: 7px solid var(--green);
}
.way-nums {
  display: grid;
  gap: 6px;
}
.way-nums .way-chip {
  min-width: 0;
  padding: 0;
  min-height: 48px;
  font-size: 18px;
  font-weight: 600;
}
.way-chip.is-text {
  font-size: 15px;
}
.way-more-link {
  align-self: flex-start;
  padding: 2px 0;
}
.way-chip.is-open,
.way-daychip.is-open {
  border-color: var(--green);
}
.way-days3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}
.way-daychip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 60px;
  padding: 6px 4px;
  border-radius: 14px;
  border: 2px solid var(--line);
  background: #fff;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.way-daychip b {
  font-size: 15px;
}
.way-daychip small {
  font-size: 13px;
  color: var(--dim);
}
.way-daychip.is-on {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
}
.way-daychip.is-on small {
  color: #e3efe7;
}
.way-summary-sub {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 400;
}
.way-warn {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--gold-soft);
  color: #5a4a2a;
  font-size: 14px;
}

/* Кнопки */
.way-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.way-actions.is-quiet {
  border-top: 1px solid var(--line);
  padding-top: 8px;
  gap: 18px;
}
.way-btn {
  min-height: 48px;
  padding: 0 18px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.way-btn.is-primary,
.way-btn.is-big {
  background: var(--green);
  border-color: var(--green);
  color: #fff;
}
.way-btn.is-grow {
  flex: 1;
}
.way-btn.is-big {
  min-height: 58px;
  font-size: 18px;
}
.way-btn.is-danger {
  background: var(--red);
  border-color: var(--red);
  color: #fff;
}
.way-btn:disabled {
  opacity: 0.6;
}
.way-link {
  padding: 6px 0;
  border: none;
  background: none;
  color: var(--green);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}
.way-fold {
  font-weight: 600;
  text-align: left;
}
.way-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: var(--red-soft);
}
.way-error {
  color: var(--red);
  font-size: 15px;
}

.way-more {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.way-line {
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--card);
  border: 1px solid var(--line);
  font-size: 15px;
}
.way-line-btn {
  width: 100%;
  text-align: left;
  color: var(--text);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}
.way-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}
.way-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.way-legend .way-dot {
  width: 11px;
  height: 11px;
}

.way-toast {
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  padding: 12px 18px;
  border-radius: 14px;
  background: var(--text);
  color: #fff;
  font-size: 15px;
  z-index: 50;
}
</style>
