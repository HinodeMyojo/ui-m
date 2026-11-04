<script setup>
// Карточка события: создание и правка. Новое событие приходит черновиком
// ({ start, end, allDay } из выделения на сетке), существующее — как есть
// с сервера.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/components/calendarApi.js";
import {
  LAYERS,
  PALETTE,
  addDays,
  browserZone,
  hm,
  layerOf,
  parseDay,
  ymd,
} from "./calendarLayers.js";

const props = defineProps({
  event: { type: Object, default: null }, // существующее
  draft: { type: Object, default: null }, // { start: Date, end: Date, allDay }
  googleConnected: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "saved"]);

const isNew = computed(() => !props.event);
const busy = ref(false);
const error = ref("");
const confirmDelete = ref(false);

// Поля формы: даты и время раздельно — так их удобно вводить руками.
const form = ref(initForm());

function initForm() {
  if (props.event) {
    const ev = props.event;
    if (ev.allDay) {
      return {
        title: ev.title,
        category: ev.category,
        color: ev.color || "",
        allDay: true,
        startDate: ev.start,
        startTime: "18:30",
        endDate: addDays(ev.end, -1),
        endTime: "21:20",
        location: ev.location,
        description: ev.description,
        repeat: "none",
        until: "",
        series: false,
      };
    }
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    return {
      title: ev.title,
      category: ev.category,
      color: ev.color || "",
      allDay: false,
      startDate: ymd(s),
      startTime: hm(s),
      endDate: ymd(e),
      endTime: hm(e),
      location: ev.location,
      description: ev.description,
      repeat: "none",
      until: "",
      series: false,
    };
  }
  const d = props.draft || {};
  const start = d.start || new Date();
  let end = d.end || new Date(start.getTime() + 60 * 60 * 1000);
  const allDay = !!d.allDay;
  if (allDay) end = new Date(end.getTime() - 24 * 60 * 60 * 1000); // конец включительно
  return {
    title: "",
    category: d.category || "personal",
    color: "",
    allDay,
    startDate: ymd(start),
    startTime: allDay ? "10:00" : hm(start),
    endDate: ymd(end),
    endTime: allDay ? "11:00" : hm(end),
    location: "",
    description: "",
    repeat: "none",
    until: "",
    series: false,
  };
}

const layer = computed(() => layerOf(form.value.category));
const accent = computed(() => form.value.color || layer.value.color);

// Время конца раньше начала в тот же день — подсказка, а не молчаливый сдвиг.
const timeProblem = computed(() => {
  const f = form.value;
  if (!f.startDate || !f.endDate) return "укажи даты";
  if (f.allDay) return f.endDate < f.startDate ? "конец раньше начала" : "";
  const s = `${f.startDate}T${f.startTime}`;
  const e = `${f.endDate}T${f.endTime}`;
  return e <= s ? "конец должен быть позже начала" : "";
});

function onStartDate(value) {
  // Перенос начала тянет за собой конец: событие не растягивается на неделю.
  const f = form.value;
  const shift = Math.round((parseDay(value) - parseDay(f.startDate)) / 86400000);
  f.startDate = value;
  if (shift && f.endDate) f.endDate = addDays(f.endDate, shift);
}

function payload() {
  const f = form.value;
  const body = {
    title: f.title.trim(),
    category: f.category,
    color: f.color,
    location: f.location.trim(),
    description: f.description.trim(),
    allDay: f.allDay,
    timeZone: browserZone(),
  };
  if (f.allDay) {
    body.start = f.startDate;
    body.end = addDays(f.endDate, 1);
  } else {
    body.start = new Date(`${f.startDate}T${f.startTime}`).toISOString();
    body.end = new Date(`${f.endDate}T${f.endTime}`).toISOString();
  }
  if (isNew.value && f.repeat !== "none" && f.until) {
    body.repeat = { every: f.repeat === "daily" ? 1 : f.repeat === "biweekly" ? 14 : 7, until: f.until };
  }
  return body;
}

async function save() {
  if (!form.value.title.trim()) {
    error.value = "Назови событие";
    return;
  }
  if (timeProblem.value) {
    error.value = timeProblem.value;
    return;
  }
  if (isNew.value && form.value.repeat !== "none" && !form.value.until) {
    error.value = "До какого дня повторять?";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const result = isNew.value
      ? await createCalendarEvent(payload())
      : await updateCalendarEvent(props.event.id, payload(), form.value.series);
    emit("saved", result);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function remove(series) {
  busy.value = true;
  error.value = "";
  try {
    await deleteCalendarEvent(props.event.id, series);
    emit("saved", []);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function onKey(e) {
  if (e.key === "Escape") emit("close");
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") save();
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="cem-overlay" @mousedown.self="emit('close')">
    <div class="cem" :style="{ '--accent': accent }">
      <div class="cem-bar"></div>
      <div class="cem-head">
        <input
          v-model="form.title"
          class="cem-title"
          placeholder="Название события"
          autofocus
          maxlength="500"
        />
        <button class="cem-x" title="Закрыть (Esc)" @click="emit('close')">✕</button>
      </div>

      <div class="cem-layers">
        <button
          v-for="l in LAYERS"
          :key="l.key"
          class="cem-layer"
          :class="{ on: form.category === l.key }"
          :style="{ '--c': l.color }"
          @click="form.category = l.key"
        >
          {{ l.emoji }} {{ l.title }}
        </button>
      </div>

      <label class="cem-check">
        <input v-model="form.allDay" type="checkbox" /> Весь день
      </label>

      <div class="cem-time">
        <div class="cem-col">
          <span class="cem-label">Начало</span>
          <div class="cem-row">
            <input :value="form.startDate" type="date" @input="onStartDate($event.target.value)" />
            <input v-if="!form.allDay" v-model="form.startTime" type="time" />
          </div>
        </div>
        <div class="cem-col">
          <span class="cem-label">Конец</span>
          <div class="cem-row">
            <input v-model="form.endDate" type="date" />
            <input v-if="!form.allDay" v-model="form.endTime" type="time" />
          </div>
        </div>
      </div>
      <div v-if="timeProblem" class="cem-hint">{{ timeProblem }}</div>

      <div v-if="isNew" class="cem-repeat">
        <span class="cem-label">Повтор</span>
        <div class="cem-row">
          <select v-model="form.repeat">
            <option value="none">Не повторять</option>
            <option value="weekly">Каждую неделю</option>
            <option value="biweekly">Раз в две недели</option>
            <option value="daily">Каждый день</option>
          </select>
          <template v-if="form.repeat !== 'none'">
            <span class="cem-muted">до</span>
            <input v-model="form.until" type="date" :min="form.startDate" />
          </template>
        </div>
      </div>

      <input v-model="form.location" class="cem-input" placeholder="📍 Где: аудитория, адрес, ссылка" />
      <textarea v-model="form.description" class="cem-input cem-desc" rows="3" placeholder="Заметки: преподаватель, тема, что взять"></textarea>

      <div class="cem-colors">
        <span class="cem-label">Цвет</span>
        <button class="cem-swatch auto" :class="{ on: !form.color }" :style="{ background: layer.color }" title="Цвет слоя" @click="form.color = ''">A</button>
        <button
          v-for="c in PALETTE"
          :key="c"
          class="cem-swatch"
          :class="{ on: form.color === c }"
          :style="{ background: c }"
          @click="form.color = c"
        ></button>
      </div>

      <div v-if="event" class="cem-meta">
        <span v-if="event.seriesId">
          <label class="cem-check"><input v-model="form.series" type="checkbox" /> Применить ко всей серии</label>
        </span>
        <span v-if="googleConnected && event.googlePending" class="cem-pending">⏳ ещё не в Google</span>
        <span v-if="event.googleError" class="cem-err-inline" :title="event.googleError">⚠ Google не принял: {{ event.googleError }}</span>
        <a v-if="event.googleLink" :href="event.googleLink" target="_blank" rel="noopener" class="cem-link">Открыть в Google ↗</a>
        <span v-if="event.googleRecurring" class="cem-muted">Вхождение повторяющегося события Google — правка касается только его.</span>
      </div>

      <div v-if="error" class="cem-error">{{ error }}</div>

      <div class="cem-actions">
        <template v-if="event">
          <button v-if="!confirmDelete" class="cem-btn danger" :disabled="busy" @click="confirmDelete = true">Удалить</button>
          <template v-else>
            <button class="cem-btn danger" :disabled="busy" @click="remove(false)">Да, удалить</button>
            <button v-if="event.seriesId" class="cem-btn danger" :disabled="busy" @click="remove(true)">Всю серию</button>
            <button class="cem-btn" :disabled="busy" @click="confirmDelete = false">Нет</button>
          </template>
        </template>
        <span class="cem-spacer"></span>
        <button class="cem-btn" :disabled="busy" @click="emit('close')">Отмена</button>
        <button class="cem-btn primary" :disabled="busy" title="Ctrl+Enter" @click="save">
          {{ busy ? "Сохраняю…" : isNew ? "Создать" : "Сохранить" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cem-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(8, 9, 14, 0.62);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.cem {
  position: relative;
  width: min(560px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: #1b1d25;
  border: 1px solid #2b2f3b;
  border-radius: 16px;
  padding: 18px 18px 14px;
  color: #e6e8ef;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}
.cem-bar {
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  border-radius: 16px 16px 0 0;
  background: var(--accent);
}
.cem-head {
  display: flex;
  gap: 8px;
  align-items: center;
}
.cem-title {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 2px solid #2b2f3b;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
  padding: 6px 2px;
  outline: none;
}
.cem-title:focus {
  border-color: var(--accent);
}
.cem-x {
  background: none;
  border: none;
  color: #8a8fa0;
  font-size: 18px;
  cursor: pointer;
}
.cem-layers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cem-layer {
  border: 1px solid #2b2f3b;
  background: #20232d;
  color: #cfd3e0;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 13px;
  cursor: pointer;
}
.cem-layer.on {
  border-color: var(--c);
  background: color-mix(in srgb, var(--c) 22%, #20232d);
  color: #fff;
}
.cem-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #cfd3e0;
  cursor: pointer;
}
.cem-time {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.cem-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cem-row {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.cem-label {
  font-size: 11px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #7a7f8e;
}
.cem input[type="date"],
.cem input[type="time"],
.cem select,
.cem-input {
  background: #14161c;
  border: 1px solid #2b2f3b;
  color: #e6e8ef;
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 14px;
  color-scheme: dark;
}
.cem-input {
  width: 100%;
  box-sizing: border-box;
}
.cem-desc {
  resize: vertical;
  font-family: inherit;
}
.cem-hint {
  color: #f59e0b;
  font-size: 12px;
  margin-top: -6px;
}
.cem-repeat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cem-muted {
  color: #7a7f8e;
  font-size: 13px;
}
.cem-colors {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.cem-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.cem-swatch.on {
  border-color: #fff;
}
.cem-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.cem-pending {
  color: #a58bff;
}
.cem-err-inline {
  color: #f87171;
}
.cem-link {
  color: #7cc4ff;
  text-decoration: none;
}
.cem-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
}
.cem-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.cem-spacer {
  flex: 1;
}
.cem-btn {
  border: 1px solid #2b2f3b;
  background: #232633;
  color: #e6e8ef;
  border-radius: 9px;
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
}
.cem-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.cem-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}
.cem-btn.danger {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.4);
}
@media (max-width: 560px) {
  .cem-time {
    grid-template-columns: 1fr;
  }
}
</style>
