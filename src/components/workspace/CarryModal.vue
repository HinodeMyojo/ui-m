<script setup>
import { ref, computed } from "vue";
import { placeWorkItem } from "@/components/api.js";

const props = defineProps({
  carry: { type: Array, default: () => [] }, // [{ date, items: [...] }]
  date: { type: String, required: true },
});
const emit = defineEmits(["close", "done"]);

const chosen = ref(new Set());
const mode = ref("move");
const busy = ref(false);
const error = ref("");

const MODES = [
  { key: "move", label: "Перенести", hint: "та же карточка переедет в сегодня, из старого дня исчезнет" },
  { key: "link", label: "Связать", hint: "одна и та же карточка будет видна и там, и здесь" },
  { key: "copy", label: "Копия", hint: "новая независимая карточка с тем же содержимым" },
];

const total = computed(() => props.carry.reduce((sum, d) => sum + d.items.length, 0));

function toggle(id) {
  const next = new Set(chosen.value);
  next.has(id) ? next.delete(id) : next.add(id);
  chosen.value = next;
}

function toggleDay(day) {
  const next = new Set(chosen.value);
  const allPicked = day.items.every((i) => next.has(i.id));
  for (const i of day.items) {
    allPicked ? next.delete(i.id) : next.add(i.id);
  }
  chosen.value = next;
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
}

async function apply() {
  if (!chosen.value.size || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    for (const day of props.carry) {
      for (const item of day.items) {
        if (!chosen.value.has(item.id)) continue;
        await placeWorkItem(item.id, {
          date: props.date,
          fromDate: day.date,
          mode: mode.value,
        });
      }
    }
    emit("done");
  } catch (e) {
    error.value = e.message || "не удалось перенести";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="cm-overlay" @click.self="emit('close')">
    <div class="cm">
      <div class="cm-head">
        <h3>Забрать из прошлых дней</h3>
        <button class="cm-x" @click="emit('close')">✕</button>
      </div>

      <div class="cm-modes">
        <button
          v-for="m in MODES"
          :key="m.key"
          class="cm-mode"
          :class="{ on: mode === m.key }"
          @click="mode = m.key"
        >
          {{ m.label }}
        </button>
      </div>
      <div class="cm-hint">{{ MODES.find((m) => m.key === mode).hint }}</div>

      <div class="cm-body">
        <div v-if="!total" class="cm-note">Незакрытых карточек за прошлые дни нет 🎉</div>

        <div v-for="day in carry" :key="day.date" class="cm-day">
          <div class="cm-day-head">
            <span>{{ dayLabel(day.date) }}</span>
            <button class="cm-all" @click="toggleDay(day)">выбрать все</button>
          </div>
          <label
            v-for="item in day.items"
            :key="item.id"
            class="cm-item"
            :class="{ picked: chosen.has(item.id) }"
          >
            <input type="checkbox" :checked="chosen.has(item.id)" @change="toggle(item.id)" />
            <span class="cm-emoji">{{ item.emoji || "•" }}</span>
            <span class="cm-title">{{ item.title }}</span>
            <span class="cm-status" :class="'st-' + item.status">
              {{ item.status === "doing" ? "в работе" : item.status === "paused" ? "пауза" : "не начата" }}
            </span>
          </label>
        </div>
      </div>

      <div v-if="error" class="cm-err">{{ error }}</div>

      <div class="cm-foot">
        <span class="cm-count">Выбрано: {{ chosen.size }}</span>
        <button class="cm-btn" @click="emit('close')">Закрыть</button>
        <button class="cm-btn primary" :disabled="!chosen.size || busy" @click="apply">
          {{ busy ? "Переношу…" : "Забрать в этот день" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2200;
  padding: 16px;
}

.cm {
  width: min(600px, 100%);
  max-height: min(82vh, 760px);
  background: #1b1d24;
  border: 1px solid #2f3340;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #2a2d38;
}

.cm-head h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}

.cm-x {
  background: none;
  border: none;
  color: #8f95a6;
  font-size: 18px;
  cursor: pointer;
}

.cm-modes {
  display: flex;
  gap: 6px;
  padding: 12px 16px 6px;
}

.cm-mode {
  flex: 1;
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  font-size: 13px;
  min-height: 38px;
}

.cm-mode.on {
  background: #1767fd22;
  border-color: #1767fd;
  color: #cfe0ff;
}

.cm-hint {
  padding: 0 16px 10px;
  color: #7a7f8e;
  font-size: 11.5px;
}

.cm-body {
  overflow-y: auto;
  padding: 4px 12px 12px;
  flex: 1;
}

.cm-note {
  color: #7a7f8e;
  text-align: center;
  padding: 30px;
  font-size: 13px;
}

.cm-day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 6px 5px;
  color: #8f95a6;
  font-size: 12px;
  text-transform: capitalize;
}

.cm-all {
  background: none;
  border: none;
  color: #6ba4ff;
  cursor: pointer;
  font-size: 11.5px;
}

.cm-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.cm-item:hover {
  background: #23262f;
}

.cm-item.picked {
  background: #1767fd1a;
}

.cm-emoji {
  width: 18px;
  text-align: center;
}

.cm-title {
  color: #dfe3ee;
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cm-status {
  margin-left: auto;
  font-size: 11px;
  color: #7a7f8e;
  flex-shrink: 0;
}

.cm-status.st-doing {
  color: #ffd666;
}

.cm-err {
  color: #e5484d;
  font-size: 12px;
  padding: 0 16px 8px;
}

.cm-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #2a2d38;
}

.cm-count {
  margin-right: auto;
  color: #8f95a6;
  font-size: 12px;
}

.cm-btn {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  min-height: 38px;
}

.cm-btn:hover:not(:disabled) {
  border-color: #6e4aff;
}

.cm-btn.primary {
  background: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

.cm-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (max-width: 620px) {
  .cm {
    max-height: 92vh;
  }
  .cm-modes {
    flex-wrap: wrap;
  }
}
</style>
