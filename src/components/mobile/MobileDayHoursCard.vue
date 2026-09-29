<script setup>
import {
  useDayHours,
  HOURS_FIELDS,
  HOURS_MAX,
  formatHoursValue,
} from "@/composables/useDayHours.js";

// План дня по часам на мобильной главной. Числа меняются кнопками ±0,5 —
// попасть пальцем в поле и набрать «2,5» на цифровой клавиатуре дольше, чем
// дважды ткнуть в плюс. Поле всё равно редактируемое: для «8» быстрее набрать.

const { hours, loading, failed, saving, error, load, set, step } = useDayHours();
</script>

<template>
  <section class="m-card">
    <div class="m-card-head" style="cursor: default">
      <span class="m-card-title">⏱ План на сегодня</span>
      <span v-if="error" class="m-card-note mdh-error">{{ error }}</span>
      <span v-else-if="saving" class="m-card-note">сохраняю…</span>
    </div>

    <div v-if="failed" class="m-err">
      Не загрузился <button class="m-btn m-btn-sm" @click="load">↻</button>
    </div>

    <div v-else class="mdh-rows">
      <div v-for="f in HOURS_FIELDS" :key="f.key" class="mdh-row">
        <span class="mdh-label">{{ f.icon }} {{ f.label }}</span>
        <button
          type="button"
          class="m-btn mdh-step"
          :disabled="loading || !hours[f.key]"
          :aria-label="`${f.label}: меньше`"
          @click="step(f.key, -1)"
        >
          −
        </button>
        <input
          class="m-input mdh-input"
          :class="{ 'is-empty': !hours[f.key] }"
          type="text"
          inputmode="decimal"
          :value="loading ? '…' : formatHoursValue(hours[f.key])"
          :disabled="loading"
          :aria-label="`${f.label}, часов`"
          @change="set(f.key, $event.target.value)"
          @keyup.enter="$event.target.blur()"
          @focus="$event.target.select()"
        />
        <button
          type="button"
          class="m-btn mdh-step"
          :disabled="loading || hours[f.key] >= HOURS_MAX"
          :aria-label="`${f.label}: больше`"
          @click="step(f.key, 1)"
        >
          +
        </button>
        <span class="mdh-unit">ч</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mdh-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mdh-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mdh-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mdh-step {
  width: 44px;
  padding: 0;
  font-size: 20px;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.mdh-input {
  width: 56px;
  padding: 0 4px;
  text-align: center;
  font-weight: 700;
  flex-shrink: 0;
}

.mdh-input.is-empty {
  color: var(--m-muted);
  font-weight: 500;
}

.mdh-unit {
  width: 12px;
  color: var(--m-muted);
  font-size: 13px;
}

.mdh-error {
  color: #ff7875;
}
</style>
