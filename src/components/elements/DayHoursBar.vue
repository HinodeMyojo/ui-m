<script setup>
import {
  useDayHours,
  HOURS_FIELDS,
  HOURS_STEP,
  HOURS_MAX,
  formatHoursValue,
} from "@/composables/useDayHours.js";

// План дня по часам на десктопной главной — узкая полоса под шапкой, рядом с
// полосой roadmap. Три числа, которые задают утром: сколько работать, сколько
// из этого писать код руками, сколько читать. Сохраняется само.

const { hours, loading, failed, saving, error, load, set, step } = useDayHours();
</script>

<template>
  <section class="dhb">
    <div class="dhb-title">
      <b>План на сегодня</b>
      <small v-if="failed">
        не загрузился <button class="dhb-retry" @click="load">↻</button>
      </small>
      <small v-else-if="error" class="dhb-error">{{ error }}</small>
      <small v-else-if="saving">сохраняю…</small>
      <small v-else>часов</small>
    </div>

    <div v-if="!failed" class="dhb-fields">
      <label v-for="f in HOURS_FIELDS" :key="f.key" class="dhb-field">
        <span class="dhb-label">{{ f.icon }} {{ f.label }}</span>
        <span class="dhb-stepper" :class="{ 'is-empty': !hours[f.key] }">
          <button
            type="button"
            class="dhb-btn"
            :disabled="loading || !hours[f.key]"
            :aria-label="`${f.label}: меньше`"
            @click="step(f.key, -1)"
          >
            −
          </button>
          <input
            class="dhb-input"
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
            class="dhb-btn"
            :disabled="loading || hours[f.key] >= HOURS_MAX"
            :aria-label="`${f.label}: больше на ${HOURS_STEP} ч`"
            @click="step(f.key, 1)"
          >
            +
          </button>
        </span>
      </label>
    </div>
  </section>
</template>

<style scoped>
.dhb {
  width: 100%;
  box-sizing: border-box;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 24px;
  padding: 8px 16px;
  background: #16171d;
  border-bottom: 1px solid #1e2025;
  border-left: 4px solid #8b5cf6;
  color: #e8eaf2;
  font-size: 13px;
}

.dhb-title {
  display: flex;
  flex-direction: column;
  min-width: 120px;
}

.dhb-title small {
  color: #8a8f9c;
  font-size: 11px;
}

.dhb-title .dhb-error {
  color: #ff7875;
}

.dhb-retry {
  background: none;
  border: none;
  color: #8a8f9c;
  cursor: pointer;
  padding: 0 2px;
}

.dhb-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 22px;
}

.dhb-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dhb-label {
  color: #b7bccb;
  white-space: nowrap;
}

.dhb-stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  background: #1c1e26;
  overflow: hidden;
}

.dhb-stepper:focus-within {
  border-color: #8b5cf6;
}

.dhb-btn {
  width: 26px;
  height: 28px;
  background: none;
  border: none;
  color: #cfd3e0;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.dhb-btn:hover:not(:disabled) {
  background: #262933;
}

.dhb-btn:disabled {
  color: #4a4e5a;
  cursor: default;
}

.dhb-input {
  width: 40px;
  height: 28px;
  padding: 0;
  background: none;
  border: none;
  outline: none;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
}

.dhb-stepper.is-empty .dhb-input {
  color: #6b7080;
  font-weight: 500;
}
</style>
