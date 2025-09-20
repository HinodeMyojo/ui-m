<template>
  <article
    class="task-item"
    :class="{
      'task-item--dragging': isDragging,
      'task-item--hovered': hovered,
    }"
    :style="styleBinding"
    draggable="true"
    @dragstart="(event) => emit('dragstart', event)"
    @dragend="emit('dragend')"
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
    @click="emit('click')"
  >
    <div class="task-item__inner">
      <div class="task-item__row">
        <span v-if="showTitle" class="task-item__title">{{ task.title }}</span>
        <TaskProgress :task="task" />
      </div>
      <div class="task-item__footer">
        <span
          class="task-item__dates"
          :class="{ 'task-item__dates--compact': isCompact }"
          :title="dateTooltip"
        >
          {{ formatShortDateRange(task.start, task.end) }}
        </span>
        <ProgressIndicator
          v-if="task.steps > 0"
          class="task-item__progress"
          :total="task.steps"
          :active="task.stepActive"
          :color="task.color"
          :aria-label="`Прогресс ${task.stepActive} из ${task.steps}`"
        />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CalendarTaskView } from "@/composables/useTasks";
import TaskProgress from "./TaskProgress.vue";
import ProgressIndicator from "@/components/UI/ProgressIndicator.vue";

const props = defineProps<{
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

const showTitle = computed(() => props.task.totalDays >= 2);

const styleBinding = computed(() => ({
  top: `${props.top}px`,
  left: `${props.leftPercent}%`,
  width: `${props.width}px`,
  height: `${props.height}px`,
  background: props.hovered
    ? `linear-gradient(120deg, ${props.task.color}ee 90%, #18343b 100%)`
    : `linear-gradient(120deg, ${props.task.color}cc 25%, #18343b 100%)`,
}));

const isCompact = computed(
  () => props.task.steps > 12 || props.task.endDay - props.task.startDay + 1 < 4
);

const dateTooltip = computed(
  () => `${props.formatDate(props.task.start)} – ${props.formatDate(props.task.end)}`
);
</script>

<style scoped>
.task-item {
  position: absolute;
  pointer-events: auto;
  cursor: move;
  user-select: none;
  border-radius: 14px;
  transition: top 0.35s cubic-bezier(0.4, 2, 0.6, 1),
    box-shadow 0.25s cubic-bezier(0.4, 2, 0.6, 1),
    background 0.25s,
    transform 0.25s,
    z-index 0.25s,
    border-radius 0.2s;
  will-change: top, box-shadow, background, transform, border-radius;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.18);
  padding: 5px 24px 16px 24px;
  max-width: 100vw;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  z-index: 1;
}

.task-item--hovered {
  box-shadow: 0 6px 24px 0 rgba(80, 200, 255, 0.18),
    0 1.5px 6px 0 rgba(0, 0, 0, 0.1);
  filter: brightness(1.08);
  border-radius: 18px;
}

.task-item--dragging {
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.32);
  transform: scale(1.04) translateY(-4px);
  z-index: 10;
  background: rgba(40, 60, 80, 0.95) !important;
}

.task-item__inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-item__row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 30px;
  max-width: 100%;
}

.task-item__title {
  font-size: 1.05rem;
  font-weight: 500;
  color: #fff;
  letter-spacing: 0.01em;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  flex: 1;
}

.task-item__footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 8px;
}

.task-item__dates {
  text-align: start;
  min-width: 0;
  flex: 2;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.9rem;
}

.task-item__dates--compact {
  font-size: 0.8rem;
}

.task-item__progress {
  flex: 2;
}
</style>
