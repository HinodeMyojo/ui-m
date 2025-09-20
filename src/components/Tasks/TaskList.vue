<template>
  <div
    class="tasks-container"
    ref="setContainerRef"
    @dragover="(event) => emit('dragover', event)"
    @drop="(event) => emit('drop', event)"
  >
    <template v-for="(task, index) in tasks" :key="task.id">
      <div
        v-if="dropIndex !== null && dropIndex === index"
        class="tasks-container__indicator"
        :style="{ top: `${taskTop(index)}px` }"
      ></div>
      <TaskDragHandler
        :task="task"
        :top="taskTop(index)"
        :left-percent="leftPercent(task)"
        :width="calcTaskWidth(task)"
        :height="taskHeight"
        :hovered="hoveredTaskId === task.id"
        :is-dragging="draggedTaskId === task.id"
        :format-short-date-range="formatShortDateRange"
        :format-date="formatDate"
        @dragstart="(event) => emit('dragstart', { event, task })"
        @dragend="() => emit('dragend', task)"
        @hover="(value) => emit('hover', { value, task })"
        @click="() => emit('task-click', task)"
      />
    </template>
    <div
      v-if="showEndIndicator"
      class="tasks-container__indicator"
      :style="{ top: `${endIndicatorTop}px` }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import TaskDragHandler from "./TaskDragHandler.vue";
import type { CalendarTaskView } from "@/composables/useTasks";
import { CALENDAR_CONFIG } from "@/config/calendar";

const props = defineProps<{
  tasks: CalendarTaskView[];
  daysInMonth: number;
  dropIndex: number | null;
  draggedTaskId: string | null;
  hoveredTaskId: string | null;
  calcTaskWidth: (task: CalendarTaskView) => number;
  formatShortDateRange: (start: Date, end: Date) => string;
  formatDate: (date: Date | string) => string;
  containerRefSetter: (el: HTMLElement | null) => void;
}>();

const emit = defineEmits<{
  (e: "dragover", event: DragEvent): void;
  (e: "drop", event: DragEvent): void;
  (e: "dragstart", payload: { event: DragEvent; task: CalendarTaskView }): void;
  (e: "dragend", task: CalendarTaskView): void;
  (e: "hover", payload: { value: boolean; task: CalendarTaskView }): void;
  (e: "task-click", task: CalendarTaskView): void;
}>();

const taskHeight = CALENDAR_CONFIG.TASK_HEIGHT;

const setContainerRef = (el: HTMLElement | null) => {
  props.containerRefSetter(el);
};

const leftPercent = (task: CalendarTaskView) => {
  if (!props.daysInMonth) {
    return 0;
  }
  return ((task.startDay - 1) * 100) / props.daysInMonth;
};

const taskTop = (index: number) =>
  CALENDAR_CONFIG.TASKS_TOP_OFFSET + index * CALENDAR_CONFIG.TASK_TOTAL_HEIGHT;

const showEndIndicator = computed(
  () => props.dropIndex !== null && props.dropIndex === props.tasks.length
);

const endIndicatorTop = computed(
  () =>
    CALENDAR_CONFIG.TASKS_TOP_OFFSET +
    props.tasks.length * CALENDAR_CONFIG.TASK_TOTAL_HEIGHT
);
</script>

<style scoped>
.tasks-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: auto;
  z-index: 2;
}

.tasks-container__indicator {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(80, 200, 255, 0.7);
  z-index: 5;
}
</style>
