<template>
  <section class="calendar-grid" ref="setCalendarRef">
    <CalendarColumn
      v-for="day in days"
      :key="day"
      :day="day"
      :is-today="isToday(day)"
    />
    <slot />
  </section>
</template>

<script setup lang="ts">
import CalendarColumn from "./CalendarColumn.vue";

const props = defineProps<{
  days: number[];
  isToday: (day: number) => boolean;
  calendarRefSetter: (el: HTMLElement | null) => void;
}>();

const setCalendarRef = (el: HTMLElement | null) => {
  props.calendarRefSetter(el);
};
</script>

<style scoped>
.calendar-grid {
  width: 100%;
  height: 100%;
  display: flex;
  position: relative;
  background: transparent;
}
</style>
