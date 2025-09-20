<template>
  <BaseModal
    :open="open && !!task"
    :title="task?.title ?? 'Задача'"
    @close="emitClose"
  >
    <div v-if="task" class="task-details">
      <p class="task-details__dates">
        {{ formatDate(task.start) }} – {{ formatDate(task.end) }}
      </p>
      <div class="task-details__progress">
        <TaskProgress :task="task" />
      </div>
      <ProgressIndicator
        v-if="task.steps > 0"
        :total="task.steps"
        :active="task.stepActive"
        :color="task.color"
        :aria-label="`Прогресс ${task.stepActive} из ${task.steps}`"
      />
      <section v-if="task.subtasks.length" class="task-details__subtasks">
        <h4>Подзадачи</h4>
        <ul>
          <li v-for="subtask in task.subtasks" :key="subtask.id">
            <span>{{ subtask.title }}</span>
          </li>
        </ul>
      </section>
      <footer class="task-details__footer">
        <button type="button" class="task-details__edit" @click="emitEdit">
          Редактировать
        </button>
        <button type="button" class="task-details__delete" @click="emitDelete">
          Удалить
        </button>
      </footer>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from "./BaseModal.vue";
import TaskProgress from "@/components/Tasks/TaskProgress.vue";
import ProgressIndicator from "@/components/UI/ProgressIndicator.vue";
import type { CalendarTaskView } from "@/composables/useTasks";

const props = defineProps<{
  open: boolean;
  task: CalendarTaskView | null;
  formatDate: (date: Date | string) => string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "edit"): void;
  (e: "delete"): void;
}>();

const emitClose = () => emit("close");
const emitEdit = () => emit("edit");
const emitDelete = () => emit("delete");
</script>

<style scoped>
.task-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-details__dates {
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
}

.task-details__progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-details__subtasks ul {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-details__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.task-details__edit,
.task-details__delete {
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.task-details__edit {
  background: linear-gradient(120deg, #25636a 25%, #18343b 100%);
  color: #fff;
}

.task-details__delete {
  background: linear-gradient(120deg, #b22222 25%, #5e1d1d 100%);
  color: #fff;
}
</style>
