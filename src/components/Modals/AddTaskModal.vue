<template>
  <BaseModal :open="open" title="Добавить задачу" @close="emitClose">
    <form class="task-form" @submit.prevent="handleSubmit">
      <label class="task-form__field">
        <span>Название задачи</span>
        <input
          v-model.trim="form.title"
          type="text"
          required
          maxlength="200"
          placeholder="Введите название"
        />
      </label>

      <label class="task-form__field">
        <span>Описание</span>
        <textarea
          v-model.trim="form.description"
          rows="3"
          placeholder="Добавьте описание (необязательно)"
        ></textarea>
      </label>

      <div class="task-form__row">
        <DateInput v-model="form.start" label="Дата начала" />
        <DateInput v-model="form.end" label="Дата окончания" />
      </div>

      <ColorPicker v-model="form.color" label="Цвет" />

      <label class="task-form__field">
        <span>Подзадачи</span>
        <div class="subtask-input">
          <input
            v-model.trim="form.subtaskInput"
            type="text"
            placeholder="Введите подзадачу"
            @keyup.enter.prevent="addSubtask"
          />
          <button type="button" class="subtask-input__add" @click="addSubtask">
            +
          </button>
        </div>
        <ul v-if="form.subtasks.length" class="subtasks-list">
          <li v-for="(subtask, index) in form.subtasks" :key="subtask.position">
            <span class="subtasks-list__title">{{ index + 1 }}. {{ subtask.title }}</span>
            <button
              type="button"
              class="subtasks-list__remove"
              @click="removeSubtask(index)"
            >
              ×
            </button>
          </li>
        </ul>
      </label>

      <footer class="task-form__footer">
        <button type="submit" class="task-form__submit">Добавить</button>
      </footer>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import ColorPicker from "@/components/UI/ColorPicker.vue";
import DateInput from "@/components/UI/DateInput.vue";
import { DEFAULT_TASK_COLOR } from "@/config/calendar";
import type { Subtask, TaskDraft } from "@/types/task";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", task: TaskDraft): void;
}>();

interface AddTaskFormState {
  title: string;
  description: string;
  start: string | null;
  end: string | null;
  color: string;
  subtasks: Subtask[];
  subtaskInput: string;
}

const createDefaultState = (): AddTaskFormState => ({
  title: "",
  description: "",
  start: null,
  end: null,
  color: DEFAULT_TASK_COLOR,
  subtasks: [],
  subtaskInput: "",
});

const form = reactive<AddTaskFormState>(createDefaultState());

const resetForm = () => {
  Object.assign(form, createDefaultState());
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetForm();
    }
  }
);

const addSubtask = () => {
  if (!form.subtaskInput) {
    return;
  }

  form.subtasks.push({
    id: undefined,
    title: form.subtaskInput,
    completed: false,
    position: form.subtasks.length,
  });
  form.subtaskInput = "";
};

const removeSubtask = (index: number) => {
  form.subtasks.splice(index, 1);
  form.subtasks.forEach((subtask, idx) => {
    subtask.position = idx;
  });
};

const handleSubmit = () => {
  if (!form.title || !form.end) {
    return;
  }

  const startDate = form.start ? new Date(form.start) : null;
  const endDate = form.end ? new Date(form.end) : null;

  if (endDate && startDate && endDate < startDate) {
    return;
  }

  const payload: TaskDraft = {
    title: form.title,
    description: form.description,
    start: startDate,
    end: endDate,
    color: form.color,
    subtasks: form.subtasks.map((subtask, index) => ({
      ...subtask,
      position: index,
    })),
  };

  emit("submit", payload);
  emitClose();
};

const emitClose = () => {
  emit("close");
};
</script>

<style scoped>
.task-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: rgba(255, 255, 255, 0.85);
}

.task-form__field input,
.task-form__field textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 18, 28, 0.8);
  color: rgba(255, 255, 255, 0.95);
}

.task-form__field textarea {
  resize: vertical;
}

.task-form__row {
  display: flex;
  gap: 16px;
}

.subtask-input {
  display: flex;
  gap: 8px;
}

.subtask-input input {
  flex: 1;
}

.subtask-input__add {
  width: 44px;
  border-radius: 8px;
  border: none;
  background: #25636a;
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
}

.subtasks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 0;
  list-style: none;
}

.subtasks-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(20, 32, 44, 0.8);
  border-radius: 8px;
  padding: 8px 12px;
}

.subtasks-list__remove {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-size: 1.2rem;
  cursor: pointer;
}

.task-form__footer {
  display: flex;
  justify-content: flex-end;
}

.task-form__submit {
  background: linear-gradient(120deg, #25636a 25%, #18343b 100%);
  border: none;
  color: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
</style>
