<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  createWayTask,
  deleteWayTask,
  fetchWay,
  setWayMark,
  setWayNote,
  updateWayTask,
} from "@/components/mentorApi.js";
import { addDays, daysBetween, humanDate, plural, todayYmd, weekday } from "@/components/mentorDates.mjs";

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
// второй человек мог что-то отметить, а «сегодня» — смениться.
function onVisible() {
  if (document.visibilityState === "visible" && data.value) load(true);
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
  document.title = "N";
  document.addEventListener("visibilitychange", onVisible);
  load();
});
onBeforeUnmount(() => {
  document.body.style.background = prevBg;
  document.documentElement.style.background = "";
  document.title = prevTitle;
  document.removeEventListener("visibilitychange", onVisible);
  clearTimeout(toastTimer);
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

function perDayText(t) {
  if (t.kind === "pork") return "";
  if (t.perDay === 1) return "1 раз в день";
  return `${t.perDay} ${plural(t.perDay, "раз", "раза", "раз")} в день`;
}

function taskHeading(t) {
  const per = perDayText(t);
  return per ? `${t.title}, ${per}` : t.title;
}

// Состояние дня у рекомендации — для точек и итогов.
function dayState(t, day) {
  if (day > today.value) return "future";
  const c = t.marks[day];
  if (c === undefined) return day === today.value ? "today" : "none";
  if (c >= t.perDay) return "full";
  if (c === 0) return "miss";
  return "part";
}

function stateLabel(t, state) {
  const pork = t.kind === "pork";
  return {
    full: pork ? "не ел" : "выполнено",
    part: "частично",
    miss: pork ? "сорвался" : "не получилось",
    none: "не отмечено",
    today: "сегодня, не отмечено",
    future: "ещё впереди",
  }[state];
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
  const s = summary(t);
  if (!s.passed) return "";
  const parts = [`${s.full} из ${s.passed} ${plural(s.passed, "дня", "дней", "дней")} — ${t.kind === "pork" ? "держался" : "выполнено"}`];
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

// Полоса дней: неделя до сегодня, но не раньше первой рекомендации.
const dayChips = computed(() => {
  if (!tasks.value.length) return [];
  const first = tasks.value.reduce((m, t) => (t.startDate < m ? t.startDate : m), today.value);
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today.value, -i);
    if (day < first) continue;
    const list = tasks.value.filter((t) => t.startDate <= day && t.endDate >= day);
    out.push({ day, empty: !list.length, unmarked: list.some((t) => t.marks[day] === undefined) });
  }
  return out;
});

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

const pending = reactive({});

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
    data.value = await setWayMark(token.value, t.id, day, next);
  } catch (e) {
    if (before === undefined) delete t.marks[day];
    else t.marks[day] = before;
    flash(e.message);
  } finally {
    delete pending[key];
  }
}

function markOptions(t) {
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
  for (let n = 0; n <= t.perDay; n++) out.push({ count: n, label: String(n), tone: n === t.perDay ? "ok" : n === 0 ? "bad" : "part" });
  return out;
}

// --- Заметка ученика к дню ---

const notesByDay = computed(() => Object.fromEntries((data.value?.notes || []).map((n) => [n.date, n.text])));
const noteDraft = ref("");
const noteState = ref("");
let noteTimer = 0;

watch(
  [selectedDay, () => data.value],
  () => {
    if (noteState.value === "typing") return;
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
  try {
    data.value = await setWayNote(token.value, day, text);
    noteState.value = "saved";
  } catch (e) {
    noteState.value = "";
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
    setWayNote(token.value, old, text).then((v) => (data.value = v), (e) => flash(e.message));
  }
  noteState.value = "";
  noteDraft.value = notesByDay.value[selectedDay.value] || "";
});

const recentNotes = computed(() => (data.value?.notes || []).slice(0, 10));

// --- Наставник: новая рекомендация и правка ---

const KINDS = [
  { kind: "pork", label: "Не есть свинину" },
  { kind: "namaz", label: "Намаз" },
  { kind: "custom", label: "Другое" },
];
const DAY_CHIPS = [1, 3, 7, 14, 30, 40];

const form = ref(null); // { id?, kind, title, perDay, days, start, note }
const formError = ref("");
const saving = ref(false);
const confirmDelete = ref(null);

function openCreate() {
  confirmDelete.value = null;
  formError.value = "";
  form.value = { kind: "pork", title: "", perDay: 1, days: 7, start: "today", note: "" };
}

function openEdit(t) {
  confirmDelete.value = null;
  formError.value = "";
  form.value = { id: t.id, kind: t.kind, title: t.title, perDay: t.perDay, days: t.days, note: t.note };
}

function setKind(kind) {
  form.value.kind = kind;
  if (kind === "pork") form.value.perDay = 1;
  if (kind === "namaz" && form.value.perDay > 5) form.value.perDay = 5;
}

function stepDays(delta) {
  form.value.days = Math.min(365, Math.max(1, (Number(form.value.days) || 0) + delta));
}

function stepPerDay(delta) {
  const max = form.value.kind === "namaz" ? 5 : 10;
  form.value.perDay = Math.min(max, Math.max(1, form.value.perDay + delta));
}

const formEnd = computed(() => {
  if (!form.value) return "";
  const start = form.value.id
    ? tasks.value.find((t) => t.id === form.value.id)?.startDate
    : form.value.start === "tomorrow"
      ? addDays(today.value, 1)
      : today.value;
  const days = Number(form.value.days) || 0;
  return start && days >= 1 ? addDays(start, days - 1) : "";
});

async function saveForm() {
  const f = form.value;
  const days = Math.round(Number(f.days));
  if (!days || days < 1 || days > 365) {
    formError.value = "Сколько дней — от 1 до 365";
    return;
  }
  if (f.kind === "custom" && !f.title.trim()) {
    formError.value = "Напишите, что нужно делать";
    return;
  }
  const body = {
    kind: f.kind,
    title: f.title,
    perDay: f.perDay,
    days,
    note: f.note,
    startDate: f.start === "tomorrow" ? addDays(today.value, 1) : today.value,
  };
  saving.value = true;
  formError.value = "";
  try {
    data.value = f.id ? await updateWayTask(token.value, f.id, body) : await createWayTask(token.value, body);
    form.value = null;
    flash(f.id ? "Сохранено" : "Рекомендация добавлена");
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function removeTask(t) {
  confirmDelete.value = null;
  try {
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

      <!-- ============ Ученик ============ -->
      <template v-if="!isMentor">
        <nav v-if="dayChips.length > 1" class="way-days" aria-label="День">
          <button
            v-for="c in dayChips"
            :key="c.day"
            class="way-day"
            :class="{ 'is-on': c.day === selectedDay, 'is-empty': c.empty }"
            @click="pickDay(c.day)"
          >
            <span class="way-day-wd">{{ c.day === today ? "сег." : weekday(c.day) }}</span>
            <span class="way-day-n">{{ Number(c.day.slice(8)) }}</span>
            <span v-if="c.unmarked" class="way-day-dot" aria-label="есть неотмеченное"></span>
          </button>
        </nav>

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

          <div v-if="t.perDay > 1" class="way-ask">Сколько раз сделал?</div>
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

        <section v-if="dayTasks.length" class="way-card way-notebox">
          <label for="way-note">Заметка к дню<span class="way-opt"> — увидит {{ mentorName || "наставник" }}</span></label>
          <textarea
            id="way-note"
            v-model="noteDraft"
            rows="2"
            maxlength="1000"
            placeholder="например: был в дороге"
            @input="onNoteInput"
            @blur="saveNote"
          ></textarea>
          <div class="way-hint">
            {{ noteState === "saving" ? "Сохраняю…" : noteState === "saved" ? "Сохранено" : "" }}
          </div>
        </section>

        <section v-if="upcomingTasks.length" class="way-more">
          <h2 class="way-h">Скоро</h2>
          <div v-for="t in upcomingTasks" :key="t.id" class="way-line">
            {{ taskHeading(t) }} — с {{ humanDate(t.startDate) }}, {{ t.days }} {{ plural(t.days, "день", "дня", "дней") }}
          </div>
        </section>
      </template>

      <!-- ============ Наставник ============ -->
      <template v-else>
        <button v-if="!form" class="way-btn is-big" @click="openCreate">＋ Новая рекомендация</button>

        <section v-if="form" class="way-card way-form">
          <h2 class="way-h">{{ form.id ? "Изменить рекомендацию" : "Новая рекомендация" }}</h2>

          <div v-if="!form.id" class="way-kinds">
            <button
              v-for="k in KINDS"
              :key="k.kind"
              class="way-kind"
              :class="{ 'is-on': form.kind === k.kind }"
              @click="setKind(k.kind)"
            >
              {{ k.label }}
            </button>
          </div>

          <label v-if="form.kind === 'custom'" class="way-field">
            <span>Что делать</span>
            <input v-model="form.title" maxlength="120" placeholder="например: читать суру перед сном" />
          </label>

          <div v-if="form.kind !== 'pork'" class="way-field">
            <span>Сколько раз в день</span>
            <div class="way-stepper">
              <button class="way-step" :disabled="form.perDay <= 1" @click="stepPerDay(-1)">−</button>
              <b>{{ form.perDay }}</b>
              <button class="way-step" :disabled="form.perDay >= (form.kind === 'namaz' ? 5 : 10)" @click="stepPerDay(1)">
                ＋
              </button>
            </div>
          </div>

          <div class="way-field">
            <span>Сколько дней</span>
            <div class="way-chips">
              <button
                v-for="n in DAY_CHIPS"
                :key="n"
                class="way-chip"
                :class="{ 'is-on': Number(form.days) === n }"
                @click="form.days = n"
              >
                {{ n }}
              </button>
            </div>
            <div class="way-stepper">
              <button class="way-step" @click="stepDays(-1)">−</button>
              <input v-model="form.days" class="way-num" type="number" inputmode="numeric" min="1" max="365" />
              <button class="way-step" @click="stepDays(1)">＋</button>
            </div>
          </div>

          <div v-if="!form.id" class="way-field">
            <span>С какого дня</span>
            <div class="way-chips">
              <button class="way-chip is-wide" :class="{ 'is-on': form.start === 'today' }" @click="form.start = 'today'">
                С сегодня
              </button>
              <button
                class="way-chip is-wide"
                :class="{ 'is-on': form.start === 'tomorrow' }"
                @click="form.start = 'tomorrow'"
              >
                С завтра
              </button>
            </div>
          </div>
          <div v-if="formEnd" class="way-hint">Последний день — {{ humanDate(formEnd) }}</div>

          <label class="way-field">
            <span>Пояснение <span class="way-opt">(необязательно)</span></span>
            <textarea v-model="form.note" rows="2" maxlength="1000" placeholder="например: пока идёт пост"></textarea>
          </label>

          <div v-if="formError" class="way-error">{{ formError }}</div>
          <div class="way-actions">
            <button class="way-btn is-primary" :disabled="saving" @click="saveForm">
              {{ saving ? "Сохраняю…" : "Сохранить" }}
            </button>
            <button class="way-btn" :disabled="saving" @click="form = null">Отмена</button>
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
          <div class="way-dates">до {{ humanDate(t.endDate) }} включительно</div>
          <p v-if="t.note" class="way-note">«{{ t.note }}»</p>
          <div class="way-strip">
            <span v-if="strip(t).cut" class="way-strip-cut">…</span>
            <span
              v-for="c in strip(t).cells"
              :key="c.day"
              class="way-dot"
              :class="`st-${c.state}`"
              :title="`${humanDate(c.day)}: ${stateLabel(t, c.state)}${t.perDay > 1 && t.marks[c.day] !== undefined ? ` (${t.marks[c.day]} из ${t.perDay})` : ''}`"
            ></span>
          </div>
          <div class="way-sum">{{ summaryText(t) || "Сегодня первый день" }}</div>
          <div v-if="t.marks[today] !== undefined" class="way-today">
            Сегодня: {{ stateLabel(t, dayState(t, today)) }}<template v-if="t.perDay > 1"> ({{ t.marks[today] }} из {{ t.perDay }})</template>
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
            <div class="way-dates">с {{ humanDate(t.startDate) }}, {{ t.days }} {{ plural(t.days, "день", "дня", "дней") }}</div>
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
          <div v-for="n in recentNotes" :key="n.date" class="way-line">
            <b>{{ dayTitle(n.date) }}:</b> {{ n.text }}
          </div>
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

/* Полоса дней */
.way-days {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px;
  scrollbar-width: none;
}
.way-day {
  position: relative;
  flex: 1 0 44px;
  min-height: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--card);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.way-day.is-on {
  background: var(--green);
  border-color: var(--green);
  color: #fff;
}
.way-day.is-empty:not(.is-on) {
  opacity: 0.45;
}
.way-day-wd {
  font-size: 12px;
  opacity: 0.8;
}
.way-day-n {
  font-size: 18px;
  font-weight: 700;
}
.way-day-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gold);
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
