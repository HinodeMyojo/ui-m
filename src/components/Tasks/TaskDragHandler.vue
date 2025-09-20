<template>
  <div class="task-drag-handler">
    <TaskItem
      :task="task"
      :top="top"
      :left-percent="leftPercent"
      :width="width"
      :height="height"
      :hovered="hovered"
      :is-dragging="isDragging"
      :format-short-date-range="formatShortDateRange"
      :format-date="formatDate"
      @dragstart="emit('dragstart', $event)"
      @dragend="emit('dragend')"
      @hover="(value) => emit('hover', value)"
      @click="emit('click')"
    />
  </div>
</template>

<script setup lang="ts">
import TaskItem from "./TaskItem.vue";
import type { CalendarTaskView } from "@/composables/useTasks";

defineProps<{
  task: CalendarTaskView;
  top: number;
  leftPercent: number;
  width: number;
  height: number;
  hovered: boolean;
  isDragging: boolean;
  formatShortDateRange: (start: Date, end: Date) => string;
  formatDate: (date: Date | string) => string;
}>();

const emit = defineEmits<{
  (e: "dragstart", event: DragEvent): void;
  (e: "dragend"): void;
  (e: "hover", value: boolean): void;
  (e: "click"): void;
}>();
</script>

<style scoped>
.task-drag-handler {
  position: relative;
}
</style>
