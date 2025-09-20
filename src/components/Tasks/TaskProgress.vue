<template>
  <div class="task-progress">
    <div
      class="task-progress__counter"
      :style="{ backgroundColor: task.progressColor }"
      :aria-label="progressLabel"
    >
      {{ task.completedSubtasks }} / {{ task.totalSubtasks }}
    </div>
    <div v-if="task.totalDays >= 2" class="task-progress__icon" :title="statusLabel">
      {{ statusIcon }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { PROGRESS_STATUS } from "@/config/progress";
import type { CalendarTaskView } from "@/composables/useTasks";

const props = defineProps<{
  task: CalendarTaskView;
}>();

const progressLabel = computed(
  () =>
    `Выполнено ${props.task.completedSubtasks} из ${props.task.totalSubtasks}`
);

const statusIcon = computed(() => {
  switch (props.task.progressStatus) {
    case PROGRESS_STATUS.DONE:
      return "✅";
    case PROGRESS_STATUS.NORMAL:
      return "💨";
    case PROGRESS_STATUS.WARN:
      return "⚠️";
    case PROGRESS_STATUS.URGENT:
      return "♨️";
    case PROGRESS_STATUS.FAILED:
      return "🤡";
    default:
      return "";
  }
});

const statusLabel = computed(() => {
  switch (props.task.progressStatus) {
    case PROGRESS_STATUS.DONE:
      return "Задача завершена";
    case PROGRESS_STATUS.NORMAL:
      return "Прогресс в норме";
    case PROGRESS_STATUS.WARN:
      return "Стоит поторопиться";
    case PROGRESS_STATUS.URGENT:
      return "Необходимо срочно работать";
    case PROGRESS_STATUS.FAILED:
      return "Задача просрочена";
    default:
      return "";
  }
});
</script>

<style scoped>
.task-progress {
  display: flex;
  align-items: center;
  gap: 6px;
}

.task-progress__counter {
  color: #ffffff;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 9px;
  font-size: 0.85rem;
}

.task-progress__icon {
  color: #ffffff;
  font-size: 1rem;
}
</style>
