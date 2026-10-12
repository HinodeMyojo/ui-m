<script setup>
import { computed, ref } from "vue";
import { checkTask, setTaskLogStatus, updateTaskAPI } from "@/components/api.js";

// Дела дня на телефоне — список, а не доска.
//
// Доска из пяти колонок на 390 пикселях — это горизонтальная прокрутка, где
// видно полторы колонки, а перетаскивание пальцем спорит со скроллом. На
// телефоне день разбирают иначе: пробежать глазами, отметить сделанное,
// добавить новое строкой и выкинуть лишнее на завтра. Поэтому статусы здесь —
// секции одного списка, отметка — большой кружок слева, всё остальное — в
// меню «⋯» у строки. Закрытое и отменённое свёрнуто: на них не работают.

const props = defineProps({
  items: { type: Array, default: () => [] },
  mainSubtasks: { type: Array, default: () => [] },
  taskStatuses: { type: Array, default: () => [] },
  tomorrow: { type: Array, default: () => [] },
  boardOrder: { type: Array, default: () => [] },
  date: { type: String, required: true },
  isToday: { type: Boolean, default: false },
  carryCount: { type: Number, default: 0 },
});
const emit = defineEmits(["open", "open-sub", "status", "defer", "undefer", "add", "carry", "refresh"]);

const STATUS_COLORS = {
  todo: "#5b616e",
  doing: "#ffd666",
  paused: "#4aa8ff",
  done: "#63c94f",
  dropped: "#e5484d",
};

const SECTIONS = [
  { key: "doing", title: "В работе" },
  { key: "todo", title: "План" },
  { key: "paused", title: "Пауза" },
  { key: "done", title: "Сделано", folded: true },
  { key: "dropped", title: "Отменено", folded: true },
];

// --- Подзадачи с главной ---

function localDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Смещение срока подзадачи от этого дня в сутках — как на доске: сервер
// отдаёт окно с запасом, где граница суток, решает браузер.
function subOffset(sub) {
  const day = localDay(sub.deadline);
  if (!day) return null;
  return Math.round((new Date(`${day}T00:00:00`) - new Date(`${props.date}T00:00:00`)) / 86400000);
}

// Сегодняшние подзадачи — в секциях вместе с карточками. Сроки на неделю
// вперёд — отдельной свёрнутой группой: на доске они приглушены, а в списке
// приглушённое всё равно занимает строку и отодвигает сегодняшнее вниз.
const todaySubs = computed(() => props.mainSubtasks.filter((s) => subOffset(s) === 0));
const soonSubs = computed(() =>
  props.mainSubtasks
    .filter((s) => {
      const o = subOffset(s);
      return o !== null && o > 0 && o <= 7 && !s.done;
    })
    .sort((a, b) => subOffset(a) - subOffset(b)),
);

const rank = computed(() => new Map(props.boardOrder.map((id, i) => [id, i])));

const sections = computed(() =>
  SECTIONS.map((s) => {
    const rows = [
      ...todaySubs.value
        .filter((sub) => (sub.column || "todo") === s.key)
        .map((sub) => ({ id: sub.id, sub, r: rank.value.get(sub.id) ?? -1 })),
      ...props.items
        .filter((item) => item.status === s.key)
        .map((item) => ({ id: item.id, item, r: rank.value.get(item.id) ?? Infinity })),
    ].sort((a, b) => a.r - b.r);
    return { ...s, rows };
  }).filter((s) => s.rows.length),
);

const isEmpty = computed(() => !props.items.length && !todaySubs.value.length);

const unfolded = ref(new Set());
function isFolded(section) {
  return section.folded && !unfolded.value.has(section.key);
}
function toggleFold(key) {
  const next = new Set(unfolded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  unfolded.value = next;
}
const soonOpen = ref(false);
const tomorrowOpen = ref(false);

// --- Подписи ---

function hhmm(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function clock(value) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function dayWord(n) {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return "дней";
  if (n % 10 === 1) return "день";
  if (n % 10 >= 2 && n % 10 <= 4) return "дня";
  return "дней";
}

function itemMeta(item) {
  const parts = [];
  if (item.plannedStartMin >= 0) {
    parts.push({ text: item.plannedEndMin > item.plannedStartMin
      ? `${hhmm(item.plannedStartMin)}–${hhmm(item.plannedEndMin)}`
      : hhmm(item.plannedStartMin) });
  }
  if (item.deadline) {
    const day = localDay(item.deadline);
    if (day < props.date) parts.push({ text: `просрочено с ${day.slice(8)}.${day.slice(5, 7)}`, tone: "bad" });
    else if (day === props.date) parts.push({ text: item.deadlineHasTime ? `до ${clock(item.deadline)}` : "до конца дня" });
    else parts.push({ text: `срок ${day.slice(8)}.${day.slice(5, 7)}` });
  }
  const checks = item.checks || [];
  if (checks.length) parts.push({ text: `☑ ${checks.filter((c) => c.done).length}/${checks.length}` });
  if (item.openBlockers) parts.push({ text: `🚧 ${item.openBlockers}`, tone: "bad" });
  if (item.spanDays > 1) parts.push({ text: `день ${item.spanIndex}/${item.spanDays}` });
  if (item.staleDays >= 1 && item.status !== "done" && item.status !== "dropped") {
    parts.push({ text: `🔁 ${item.staleDays} ${dayWord(item.staleDays)}`, tone: item.staleDays >= 4 ? "bad" : "warn" });
  }
  if (item.autoCarry) parts.push({ text: "↻" });
  return parts;
}

function subMeta(sub) {
  const parts = [];
  if (sub.parentTitle) parts.push({ text: `📌 ${sub.parentTitle}` });
  const t = clock(sub.deadline);
  if (t !== "00:00") parts.push({ text: `до ${t}` });
  if (sub.openBlockers) parts.push({ text: `🚧 ${sub.openBlockers}`, tone: "bad" });
  if (sub.checksTotal) parts.push({ text: `☑ ${sub.checksDone}/${sub.checksTotal}` });
  return parts;
}

function soonLabel(sub) {
  const o = subOffset(sub);
  if (o === 1) return "завтра";
  if (o === 2) return "послезавтра";
  return new Date(sub.deadline).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

// --- Отметка ---

const busy = ref(new Set());
const error = ref("");

function mark(id, on) {
  const next = new Set(busy.value);
  if (on) next.add(id);
  else next.delete(id);
  busy.value = next;
}

function buzz() {
  // Короткий отклик пальцу там, где он есть (Android); iOS тихо проигнорирует.
  try {
    navigator.vibrate?.(12);
  } catch {
    /* нет так нет */
  }
}

function toggleItem(item) {
  const next = item.status === "done" ? "todo" : "done";
  if (next === "done") buzz();
  emit("status", { id: item.id, status: next });
}

async function toggleSub(sub) {
  if (busy.value.has(sub.id)) return;
  const next = !sub.done;
  sub.done = next;
  if (next) {
    sub.column = "done";
    buzz();
  }
  mark(sub.id, true);
  error.value = "";
  try {
    await checkTask(sub.id, next);
    emit("refresh");
  } catch (e) {
    sub.done = !next;
    error.value = e.message || "не удалось отметить подзадачу";
  } finally {
    mark(sub.id, false);
  }
}

// --- Быстрое добавление ---

const draft = ref("");
const input = ref(null);

function submit() {
  const title = draft.value.trim();
  if (!title) return;
  emit("add", title);
  draft.value = "";
  // Клавиатуру не прячем: дела обычно добавляют пачкой, одно за другим.
  input.value?.focus();
}

// --- Меню строки ---

const sheet = ref(null); // { kind: "item" | "sub" | "tomorrow", row }

function openSheet(kind, row) {
  sheet.value = { kind, row };
}

const sheetTitle = computed(() => {
  const row = sheet.value?.row;
  if (!row) return "";
  return (row.emoji ? row.emoji + " " : "") + row.title;
});

const sheetActions = computed(() => {
  if (!sheet.value) return [];
  const { kind, row } = sheet.value;
  if (kind === "tomorrow") {
    return [{ key: "undefer", icon: "↩", label: props.isToday ? "Вернуть на сегодня" : "Вернуть в этот день" }];
  }
  const current = kind === "sub" ? row.column || "todo" : row.status;
  const list = [];
  if (current !== "doing") list.push({ key: "doing", icon: "▶️", label: "В работу" });
  if (current !== "todo") list.push({ key: "todo", icon: "⬜", label: "В план" });
  if (current !== "paused") list.push({ key: "paused", icon: "⏸", label: "На паузу" });
  if (current !== "done") list.push({ key: "done", icon: "✅", label: "Сделано" });
  list.push({ key: "defer", icon: "➡️", label: props.isToday ? "На завтра" : "На следующий день" });
  if (kind === "item" && current !== "dropped") list.push({ key: "dropped", icon: "✖️", label: "Отменить", tone: "bad" });
  list.push({ key: "open", icon: "📄", label: "Открыть карточку" });
  return list;
});

async function act(key) {
  const { kind, row } = sheet.value;
  sheet.value = null;
  error.value = "";

  if (kind === "tomorrow") {
    emit("undefer", { id: row.id });
    return;
  }
  if (key === "open") {
    if (kind === "sub") emit("open-sub", row.id);
    else emit("open", row.id);
    return;
  }
  if (kind === "item") {
    if (key === "defer") emit("defer", { id: row.id });
    else {
      if (key === "done") buzz();
      emit("status", { id: row.id, status: key });
    }
    return;
  }

  // Подзадача с главной: статус — это её статус на главной, перенос — сдвиг
  // срока на сутки. Так же, как на доске.
  try {
    if (key === "defer") {
      if (!row.deadline) throw new Error("у подзадачи нет срока — переносить нечего");
      const at = new Date(row.deadline);
      at.setDate(at.getDate() + 1);
      await updateTaskAPI(row.id, { title: row.title, start: row.start || null, end: at.toISOString(), color: row.color || "" });
    } else {
      const status = props.taskStatuses.find((st) => st.column === key);
      if (!status) throw new Error("на главной нет подходящего статуса");
      const nowDone = key === "done";
      if (nowDone !== row.done) await checkTask(row.id, nowDone);
      if (nowDone) buzz();
      await setTaskLogStatus({ taskId: row.id, statusId: status.id, entryDate: props.date });
    }
    emit("refresh");
  } catch (e) {
    error.value = e.message || "не получилось";
    emit("refresh");
  }
}
</script>

<template>
  <div class="mdl">
    <form class="mdl-add" @submit.prevent="submit">
      <input
        ref="input"
        v-model="draft"
        class="mdl-add-input"
        placeholder="Добавить дело…"
        enterkeyhint="send"
        autocomplete="off"
      />
      <button class="mdl-add-btn" type="submit" :disabled="!draft.trim()" aria-label="Добавить">＋</button>
    </form>

    <button v-if="carryCount" class="mdl-tails" @click="emit('carry')">
      <span>🧶 С прошлых дней не закрыто: <b>{{ carryCount }}</b></span>
      <span class="mdl-tails-go">Забрать ›</span>
    </button>

    <div v-if="error" class="mdl-error" @click="error = ''">{{ error }}</div>

    <div v-if="isEmpty" class="mdl-empty">
      <div class="mdl-empty-icon">🌤</div>
      <div>На этот день пока ничего нет.</div>
      <div class="mdl-empty-hint">Впиши дело выше — или надиктуй план Claude, он разложит его сюда сам.</div>
    </div>

    <section v-for="s in sections" :key="s.key" class="mdl-sec">
      <button v-if="s.folded" class="mdl-sec-head fold" @click="toggleFold(s.key)">
        <span class="mdl-dot" :style="{ background: STATUS_COLORS[s.key] }"></span>
        {{ s.title }} · {{ s.rows.length }}
        <span class="mdl-chev">{{ isFolded(s) ? "▸" : "▾" }}</span>
      </button>
      <div v-else class="mdl-sec-head">
        <span class="mdl-dot" :style="{ background: STATUS_COLORS[s.key] }"></span>
        {{ s.title }} · {{ s.rows.length }}
      </div>

      <ul v-if="!isFolded(s)" class="mdl-list">
        <li v-for="row in s.rows" :key="row.id" class="mdl-row" :class="{ closed: s.key === 'done' || s.key === 'dropped' }">
          <template v-if="row.item">
            <button
              class="mdl-check"
              :class="{ done: row.item.status === 'done' }"
              :style="{ borderColor: STATUS_COLORS[row.item.status] }"
              :aria-label="row.item.status === 'done' ? 'Вернуть в план' : 'Отметить сделанным'"
              @click="toggleItem(row.item)"
            >
              <span v-if="row.item.status === 'done'">✓</span>
            </button>
            <button class="mdl-body" @click="emit('open', row.item.id)">
              <span class="mdl-title">
                <template v-if="row.item.emoji">{{ row.item.emoji }} </template>{{ row.item.title || "Без названия" }}
              </span>
              <span v-if="itemMeta(row.item).length" class="mdl-meta">
                <span v-for="(m, i) in itemMeta(row.item)" :key="i" class="mdl-chip" :class="m.tone">{{ m.text }}</span>
              </span>
            </button>
            <button class="mdl-menu" aria-label="Действия" @click="openSheet('item', row.item)">⋯</button>
          </template>

          <template v-else>
            <button
              class="mdl-check"
              :class="{ done: row.sub.done }"
              :style="{ borderColor: row.sub.done ? STATUS_COLORS.done : row.sub.parentColor || STATUS_COLORS.todo }"
              :disabled="busy.has(row.sub.id)"
              :aria-label="row.sub.done ? 'Вернуть' : 'Отметить сделанной'"
              @click="toggleSub(row.sub)"
            >
              <span v-if="row.sub.done">✓</span>
            </button>
            <button class="mdl-body" @click="emit('open-sub', row.sub.id)">
              <span class="mdl-title">{{ row.sub.title }}</span>
              <span class="mdl-meta">
                <span v-for="(m, i) in subMeta(row.sub)" :key="i" class="mdl-chip" :class="m.tone">{{ m.text }}</span>
              </span>
            </button>
            <button class="mdl-menu" aria-label="Действия" @click="openSheet('sub', row.sub)">⋯</button>
          </template>
        </li>
      </ul>
    </section>

    <section v-if="soonSubs.length" class="mdl-sec">
      <button class="mdl-sec-head fold" @click="soonOpen = !soonOpen">
        ⏳ Сроки на неделю · {{ soonSubs.length }}
        <span class="mdl-chev">{{ soonOpen ? "▾" : "▸" }}</span>
      </button>
      <ul v-if="soonOpen" class="mdl-list">
        <li v-for="sub in soonSubs" :key="sub.id" class="mdl-row soon">
          <span class="mdl-when">{{ soonLabel(sub) }}</span>
          <button class="mdl-body" @click="emit('open-sub', sub.id)">
            <span class="mdl-title">{{ sub.title }}</span>
            <span v-if="sub.parentTitle" class="mdl-meta"><span class="mdl-chip">📌 {{ sub.parentTitle }}</span></span>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="tomorrow.length" class="mdl-sec">
      <button class="mdl-sec-head fold" @click="tomorrowOpen = !tomorrowOpen">
        ➡️ {{ isToday ? "На завтра" : "На следующий день" }} · {{ tomorrow.length }}
        <span class="mdl-chev">{{ tomorrowOpen ? "▾" : "▸" }}</span>
      </button>
      <ul v-if="tomorrowOpen" class="mdl-list">
        <li v-for="t in tomorrow" :key="t.id" class="mdl-row soon">
          <span class="mdl-dot big" :style="{ background: STATUS_COLORS[t.status] || STATUS_COLORS.todo }"></span>
          <span class="mdl-body static">
            <span class="mdl-title"><template v-if="t.emoji">{{ t.emoji }} </template>{{ t.title }}</span>
          </span>
          <button class="mdl-menu" aria-label="Действия" @click="openSheet('tomorrow', t)">⋯</button>
        </li>
      </ul>
    </section>

    <Teleport to="body">
      <transition name="mdl-fade">
        <div v-if="sheet" class="mdl-scrim" @click="sheet = null"></div>
      </transition>
      <transition name="mdl-up">
        <div v-if="sheet" class="mdl-sheet" role="menu">
          <div class="mdl-grip"></div>
          <div class="mdl-sheet-title">{{ sheetTitle }}</div>
          <button
            v-for="a in sheetActions"
            :key="a.key"
            class="mdl-action"
            :class="a.tone"
            @click="act(a.key)"
          >
            <span class="mdl-action-icon">{{ a.icon }}</span>{{ a.label }}
          </button>
          <button class="mdl-cancel" @click="sheet = null">Отмена</button>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.mdl {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mdl-add {
  display: flex;
  gap: 8px;
}
.mdl-add-input {
  flex: 1 1 auto;
  min-width: 0;
  background: #23232b;
  border: 1px solid #2e2e3a;
  border-radius: 14px;
  color: #e8eaf2;
  font-size: 16px;
  padding: 12px 14px;
  outline: none;
}
.mdl-add-input:focus {
  border-color: #6e4aff;
}
.mdl-add-btn {
  flex: 0 0 48px;
  height: 48px;
  border-radius: 14px;
  border: none;
  background: #6e4aff;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
}
.mdl-add-btn:disabled {
  background: #2e2e3a;
  color: #6b6f7d;
}

.mdl-tails {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid #5c4a1a;
  background: #2a2416;
  color: #f2dfa5;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.mdl-tails-go {
  white-space: nowrap;
  font-weight: 600;
}

.mdl-error {
  background: #3a1d1d;
  color: #ff9c9a;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
}

.mdl-empty {
  text-align: center;
  color: #a9adbb;
  padding: 28px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mdl-empty-icon {
  font-size: 34px;
}
.mdl-empty-hint {
  font-size: 13px;
  color: #7a7f8e;
}

.mdl-sec {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mdl-sec-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #8b90a0;
  padding: 4px 2px;
  background: none;
  border: none;
  text-align: left;
}
.mdl-sec-head.fold {
  min-height: 40px;
  cursor: pointer;
}
.mdl-chev {
  margin-left: auto;
  font-size: 14px;
}
.mdl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.mdl-dot.big {
  width: 12px;
  height: 12px;
  margin: 0 8px;
}

.mdl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mdl-row {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #23232b;
  border-radius: 14px;
  padding: 4px 2px 4px 6px;
  min-height: 56px;
}
.mdl-row.closed .mdl-title {
  text-decoration: line-through;
  color: #7a7f8e;
}
.mdl-row.soon {
  background: #1f2027;
  min-height: 48px;
}

.mdl-check {
  flex: 0 0 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  position: relative;
}
/* Кружок рисуем псевдоэлементом: зона касания 44px, а видимый круг 26px. */
.mdl-check::before {
  content: "";
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid;
  border-color: inherit;
  box-sizing: border-box;
}
.mdl-check.done::before {
  background: #63c94f;
  border-color: #63c94f;
}
.mdl-check span {
  position: relative;
  color: #12210f;
  font-weight: 800;
  font-size: 15px;
}

.mdl-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 4px;
  background: none;
  border: none;
  color: #e8eaf2;
  text-align: left;
  cursor: pointer;
}
.mdl-body.static {
  cursor: default;
}
.mdl-title {
  font-size: 16px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.mdl-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.mdl-chip {
  font-size: 12.5px;
  color: #8b90a0;
}
.mdl-chip.warn {
  color: #ffd666;
}
.mdl-chip.bad {
  color: #ff7875;
}
.mdl-when {
  flex: 0 0 auto;
  min-width: 72px;
  font-size: 12.5px;
  color: #b3a6ff;
  padding-left: 8px;
}

.mdl-menu {
  flex: 0 0 44px;
  height: 44px;
  border: none;
  background: none;
  color: #8b90a0;
  font-size: 22px;
  border-radius: 12px;
  cursor: pointer;
}
.mdl-menu:active {
  background: #2e2e3a;
}

.mdl-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2290;
}
.mdl-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2300;
  background: #23232b;
  color: #e8eaf2;
  border-radius: 18px 18px 0 0;
  padding: 8px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 80vh;
  overflow-y: auto;
}
.mdl-grip {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: #4a4b57;
  align-self: center;
  margin: 2px 0 6px;
}
.mdl-sheet-title {
  font-size: 15px;
  font-weight: 600;
  color: #a9adbb;
  padding: 4px 8px 8px;
  overflow-wrap: anywhere;
}
.mdl-action {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  padding: 0 8px;
  border: none;
  border-radius: 12px;
  background: none;
  color: inherit;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
}
.mdl-action:active {
  background: #2e2e3a;
}
.mdl-action.bad {
  color: #ff7875;
}
.mdl-action-icon {
  width: 28px;
  text-align: center;
  font-size: 19px;
}
.mdl-cancel {
  margin-top: 6px;
  min-height: 48px;
  border: none;
  border-radius: 12px;
  background: #2e2e3a;
  color: #e8eaf2;
  font-size: 16px;
  cursor: pointer;
}

.mdl-fade-enter-active,
.mdl-fade-leave-active {
  transition: opacity 0.2s ease;
}
.mdl-fade-enter-from,
.mdl-fade-leave-to {
  opacity: 0;
}
.mdl-up-enter-active,
.mdl-up-leave-active {
  transition: transform 0.22s ease;
}
.mdl-up-enter-from,
.mdl-up-leave-to {
  transform: translateY(100%);
}
</style>
