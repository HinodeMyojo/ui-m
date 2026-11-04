<script setup>
import { computed, ref, watch } from "vue";
import { addMonths, monthGrid, monthTitle } from "@/components/mentorDates.mjs";

// Календарь месяца для формы «N»: выбрать день начала или последний день.
// Срок from..to подсвечивается, чтобы было видно, что получится целиком.
// Цвета берёт у страницы (--green и т. п. заданы на .way).

const props = defineProps({
  modelValue: { type: String, default: "" },
  min: { type: String, default: "" },
  max: { type: String, default: "" },
  today: { type: String, required: true },
  rangeFrom: { type: String, default: "" },
  rangeTo: { type: String, default: "" },
  caption: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

const WEEK = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const month = ref((props.modelValue || props.today).slice(0, 7));
watch(
  () => props.modelValue,
  (v) => v && (month.value = v.slice(0, 7)),
);

const canPrev = computed(
  () => !props.min || addMonths(month.value, -1) >= props.min.slice(0, 7),
);
const canNext = computed(
  () => !props.max || addMonths(month.value, 1) <= props.max.slice(0, 7),
);

const cells = computed(() =>
  monthGrid(month.value).map(
    (day) =>
      day && {
        day,
        num: Number(day.slice(8)),
        off: (props.min && day < props.min) || (props.max && day > props.max),
        inRange:
          props.rangeFrom &&
          props.rangeTo &&
          day >= props.rangeFrom &&
          day <= props.rangeTo,
        edge: day === props.rangeFrom || day === props.rangeTo,
      },
  ),
);
</script>

<template>
  <div class="wdp">
    <div v-if="caption" class="wdp-cap">{{ caption }}</div>
    <div class="wdp-head">
      <button
        type="button"
        class="wdp-nav"
        :disabled="!canPrev"
        aria-label="Предыдущий месяц"
        @click="month = addMonths(month, -1)"
      >
        ‹
      </button>
      <b>{{ monthTitle(month) }}</b>
      <button
        type="button"
        class="wdp-nav"
        :disabled="!canNext"
        aria-label="Следующий месяц"
        @click="month = addMonths(month, 1)"
      >
        ›
      </button>
    </div>
    <div class="wdp-grid">
      <span v-for="w in WEEK" :key="w" class="wdp-wd">{{ w }}</span>
      <template v-for="(c, i) in cells" :key="c ? c.day : `b${i}`">
        <span v-if="!c"></span>
        <button
          v-else
          type="button"
          class="wdp-day"
          :class="{
            'is-range': c.inRange,
            'is-edge': c.edge,
            'is-sel': c.day === modelValue,
            'is-today': c.day === today,
          }"
          :disabled="c.off"
          :aria-pressed="c.day === modelValue"
          @click="emit('update:modelValue', c.day)"
        >
          {{ c.num }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wdp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
}
.wdp-cap {
  font-size: 14px;
  color: var(--dim);
  text-align: center;
}
.wdp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wdp-head b {
  font-size: 17px;
}
.wdp-nav {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--green);
  font-size: 22px;
  cursor: pointer;
}
.wdp-nav:disabled {
  opacity: 0.3;
  cursor: default;
}
.wdp-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.wdp-wd {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}
.wdp-day {
  aspect-ratio: 1;
  min-height: 38px;
  border-radius: 10px;
  border: 2px solid transparent;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.wdp-day:disabled {
  color: #cfc7b6;
  font-weight: 400;
  cursor: default;
}
.wdp-day.is-today {
  border-color: var(--line);
}
.wdp-day.is-range {
  background: var(--green-soft);
  color: var(--green);
}
.wdp-day.is-edge {
  background: #c9dfd1;
}
.wdp-day.is-sel {
  background: var(--green);
  color: #fff;
}
</style>
