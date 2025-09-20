<template>
  <BaseModal :open="open" title="Редактировать задачу" @close="emitClose">
    <form class="task-form" @submit.prevent="handleSubmit">
      <label class="task-form__field">
        <span>Название задачи</span>
        <input v-model.trim="form.title" type="text" required maxlength="200" />
      </label>

      <div class="task-form__row">
        <DateInput v-model="form.start" label="Дата начала" />
        <DateInput v-model="form.end" label="Дата окончания" />
      </div>

      <ColorPicker v-model="form.color" label="Цвет" />

      <div class="task-form__row">
        <label class="task-form__field">
          <span>Всего этапов</span>
          <input
            v-model.number="form.steps"
            type="number"
            min="0"
            max="25"
          />
        </label>
        <label class="task-form__field">
          <span>Текущий этап</span>
          <input
            v-model.number="form.stepActive"
            type="number"
            :max="form.steps"
            min="0"
          />
        </label>
      </div>

      <p v-if="errorMessage" class="task-form__error">
        {{ errorMessage }}
      </p>

      <footer class="task-form__footer">
        <button type="submit" class="task-form__submit">Сохранить</button>
      </footer>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import ColorPicker from "@/components/UI/ColorPicker.vue";
import DateInput from "@/components/UI/DateInput.vue";
import type { CalendarTaskView } from "@/composables/useTasks";
import type { TaskUpdatePayload } from "@/types/task";

const props = defineProps<{
  open: boolean;
  task: CalendarTaskView | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", payload: TaskUpdatePayload): void;
}>();

interface EditTaskForm {
  title: string;
  start: string | null;
  end: string | null;
  color: string;
  steps: number;
  stepActive: number;
}

const form = reactive<EditTaskForm>({
  title: "",
  start: null,
  end: null,
  color: "#25636A",
  steps: 0,
  stepActive: 0,
});

const errorMessage = ref<string | null>(null);

const resetForm = (task: CalendarTaskView | null) => {
  if (!task) {
    form.title = "";
    form.start = null;
    form.end = null;
    form.color = "#25636A";
    form.steps = 0;
    form.stepActive = 0;
    return;
  }

  form.title = task.title;
  form.start = task.start ? task.start.toISOString().slice(0, 10) : null;
  form.end = task.end ? task.end.toISOString().slice(0, 10) : null;
  form.color = task.color;
  form.steps = task.steps ?? 0;
  form.stepActive = task.stepActive ?? 0;
};

watch(
  () => [props.open, props.task],
  () => {
    if (props.open) {
      resetForm(props.task);
      errorMessage.value = null;
    }
  }
);

const emitClose = () => {
  emit("close");
};

const handleSubmit = () => {
  if (!props.task || !form.title || !form.end) {
    return;
  }

  const steps = Math.max(0, Math.min(Number(form.steps || 0), 25));
  const stepActive = Math.max(0, Math.min(Number(form.stepActive || 0), steps));

  if (Number(form.steps || 0) > 25) {
    errorMessage.value = "Максимум 25 пунктов";
    return;
  }

  const startDate = form.start ? new Date(form.start) : null;
  const endDate = form.end ? new Date(form.end) : null;

  if (startDate && endDate && endDate < startDate) {
    errorMessage.value = "Дата окончания не может быть раньше даты начала";
    return;
  }

  if (!endDate) {
    return;
  }

  const payload: TaskUpdatePayload = {
    id: props.task.id,
    title: form.title,
    start: startDate ?? props.task.start,
    end: endDate,
    color: form.color,
    steps,
    stepActive,
  };

  emit("submit", payload);
  emitClose();
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

.task-form__field input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 18, 28, 0.8);
  color: rgba(255, 255, 255, 0.95);
}

.task-form__row {
  display: flex;
  gap: 16px;
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

.task-form__error {
  margin: 0;
  color: #ff8585;
  font-size: 0.9rem;
}
</style>
