<script setup>
import { computed } from "vue";
import MarkdownView from "./MarkdownView.vue";

// Общий вид дня: все карточки разом, без редактирования — чтобы всё было
// перед глазами. Клик по карточке уводит в рабочий вид.
const props = defineProps({
  items: { type: Array, default: () => [] },
  note: { type: String, default: "" },
  focus: { type: String, default: "" },
});
const emit = defineEmits(["open", "add"]);

const STATUS_META = {
  todo: { label: "План", color: "#5b616e", icon: "" },
  doing: { label: "В работе", color: "#ffd666", icon: "▶" },
  paused: { label: "Пауза", color: "#4aa8ff", icon: "‖" },
  done: { label: "Готово", color: "#63c94f", icon: "✓" },
  dropped: { label: "Отменено", color: "#e5484d", icon: "✕" },
};

// Порядок колонок: сначала то, чем занят, потом план, в конце закрытое.
const GROUPS = [
  { key: "doing", title: "В работе" },
  { key: "todo", title: "План" },
  { key: "paused", title: "Пауза" },
  { key: "done", title: "Сделано" },
  { key: "dropped", title: "Отменено" },
];

// Колонки статусов держим на месте, даже когда пустые — так доска не прыгает
// при переносе карточек. Скрываем только «Отменено», если там пусто.
const groups = computed(() =>
  GROUPS.map((g) => ({ ...g, items: props.items.filter((i) => i.status === g.key) })).filter(
    (g) => g.key !== "dropped" || g.items.length,
  ),
);

function statusOf(item) {
  return STATUS_META[item.status] || STATUS_META.todo;
}

function checkProgress(item) {
  const total = item.checks?.length || 0;
  if (!total) return null;
  const done = item.checks.filter((c) => c.done).length;
  return { total, done, percent: Math.round((done / total) * 100) };
}

// Короткая выжимка полотна — без markdown-разметки, только суть.
function excerpt(item) {
  const text = (item.body || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 180 ? text.slice(0, 180) + "…" : text;
}

function humanMinutes(minutes) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} м`;
  if (h) return `${h} ч`;
  return `${m} м`;
}

function deadlineLabel(item) {
  if (!item.deadline) return "";
  if (!item.deadlineHasTime) return "до конца дня";
  return new Date(item.deadline).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function isOverdue(item) {
  if (!item.deadline || item.status === "done" || item.status === "dropped") return false;
  return new Date(item.deadline) < new Date();
}

function slotLabel(item) {
  if (item.plannedStartMin < 0) return "";
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return item.plannedEndMin > item.plannedStartMin
    ? `${fmt(item.plannedStartMin)}–${fmt(item.plannedEndMin)}`
    : fmt(item.plannedStartMin);
}

const blockersTotal = computed(() =>
  props.items.reduce(
    (sum, i) => sum + (i.tasks || []).reduce((s, t) => s + (t.openBlockers || 0), 0),
    0,
  ),
);
</script>

<template>
  <div class="ovw">
    <div v-if="focus || note" class="ovw-day">
      <h2 v-if="focus" class="ovw-focus">🎯 {{ focus }}</h2>
      <MarkdownView v-if="note" :text="note" class="ovw-note" />
    </div>

    <div v-if="blockersTotal" class="ovw-alert">
      🚧 Открытых блокеров сегодня: <b>{{ blockersTotal }}</b>
    </div>

    <div v-if="!items.length" class="ovw-empty">
      <p>На этот день пока ничего нет.</p>
      <button class="ovw-add" @click="emit('add')">+ Создать задачу</button>
    </div>

    <div v-if="items.length" class="ovw-board">
      <section v-for="g in groups" :key="g.key" class="ovw-col">
        <div class="ovw-col-head" :style="{ '--status': STATUS_META[g.key].color }">
          <span class="ovw-col-dot"></span>
          {{ g.title }}
          <span class="ovw-col-count">{{ g.items.length }}</span>
        </div>

        <div v-if="!g.items.length" class="ovw-col-empty">пусто</div>
        <article
          v-for="item in g.items"
          :key="item.id"
          class="ovw-card"
          :class="{ muted: item.status === 'done' || item.status === 'dropped' }"
          :style="{ '--accent': item.color || '#1767fd' }"
          @click="emit('open', item.id)"
        >
          <div class="ovw-card-top">
            <span class="ovw-card-title">
              <span v-if="item.emoji" class="ovw-card-emoji">{{ item.emoji }}</span>{{ item.title }}
            </span>
            <span v-if="item.priority" class="ovw-card-prio">{{ "!".repeat(item.priority) }}</span>
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
              <div class="ovw-card-bar-fill" :style="{ width: checkProgress(item).percent + '%' }"></div>
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
            <span v-if="slotLabel(item)" class="ovw-chip">🕐 {{ slotLabel(item) }}</span>
            <span v-if="deadlineLabel(item)" class="ovw-chip" :class="{ bad: isOverdue(item) }">
              ⏳ {{ deadlineLabel(item) }}
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
      </section>
    </div>
  </div>
</template>

<style scoped>
.ovw {
  display: flex;
  flex-direction: column;
  gap: 22px;
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

.ovw-alert {
  background: linear-gradient(90deg, rgba(229, 72, 77, 0.18), transparent 70%);
  border: 1px solid #6b2b2e;
  border-left: 3px solid #e5484d;
  border-radius: 10px;
  padding: 10px 14px;
  color: #ffc9cb;
  font-size: 13px;
}

.ovw-empty {
  color: #7a7f8e;
  text-align: center;
  padding: 60px 20px;
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

/* Доска: статусы — колонками по горизонтали, карточки идут вниз под ними */
.ovw-board {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(260px, 1fr);
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

.ovw-card {
  position: relative;
  background: linear-gradient(160deg, #1e2129, #1a1c23);
  border: 1px solid #262a36;
  border-radius: 14px;
  padding: 14px 15px 13px 17px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 9px;
  overflow: hidden;
  transition: border-color 0.16s, transform 0.16s, box-shadow 0.16s;
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

.ovw-card.muted {
  opacity: 0.55;
}

.ovw-card-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.ovw-card-title {
  color: #f0f2f7;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
  flex: 1;
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

.ovw-chip.bad {
  color: #ff9ba0;
  border-color: #6b2b2e;
}

/* На узком экране колонки листаются свайпом с прилипанием */
@media (max-width: 760px) {
  .ovw-board {
    grid-auto-columns: 82vw;
    scroll-snap-type: x mandatory;
    gap: 10px;
  }
  .ovw-col {
    scroll-snap-align: start;
  }
  .ovw-day {
    padding: 13px 15px;
  }
}
</style>
