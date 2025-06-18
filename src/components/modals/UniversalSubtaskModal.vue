<template>
  <div class="modal-overlay">
    <div class="modal-card">
      <button class="modal-close" @click="closeModal">×</button>

      <h2 class="modal-title">{{ modalTitle }}</h2>

      <form v-if="mode !== 'delete'" @submit.prevent="submit">
        <label>
          Название подзадачи
          <input
            v-model="taskData.title"
            type="text"
            placeholder="Введите название"
            required
            maxlength="60"
          />
        </label>

        <button type="submit" class="btn-submit">{{ submitButtonText }}</button>
      </form>

      <div v-else class="delete-confirmation">
        <p>Вы уверены, что хотите удалить подзадачу "{{ taskData.title }}"?</p>
        <div class="delete-buttons">
          <button class="btn-submit btn-delete" @click="submit">Удалить</button>
          <button class="btn-cancel" @click="closeModal">Отмена</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { addTaskAPI, updateTaskAPI, deleteTaskAPI } from "../api.js";

const props = defineProps({
  task: {
    type: Object,
    required: true,
  },
  mode: {
    type: String,
    required: true,
    validator: (value) => ["add", "edit", "delete"].includes(value),
  },
  subtask: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["close", "created", "updated", "deleted"]);

const taskData = ref({
  id: props.mode === "add" ? null : props.subtask?.id,
  title: props.mode === "add" ? "" : props.subtask?.title || "",
  parentId: props.task.id,
});

const modalTitle = computed(() => {
  switch (props.mode) {
    case "add":
      return "Добавить подзадачу";
    case "edit":
      return "Редактировать подзадачу";
    case "delete":
      return "Удалить подзадачу";
    default:
      return "";
  }
});

const submitButtonText = computed(() => {
  return props.mode === "edit" ? "Сохранить" : "Добавить";
});

const closeModal = () => {
  emit("close");
};

const submit = async () => {
  if (props.mode === "delete") {
    try {
      await deleteTaskAPI(taskData.value.id);
      emit("deleted", taskData.value.id);
      emit("close");
    } catch (error) {
      console.error("Ошибка при удалении подзадачи:", error);
    }
    return;
  }

  if (!taskData.value.title.trim()) return;

  try {
    if (props.mode === "add") {
      const response = await addTaskAPI(taskData.value);
      emit("created", response);
    } else if (props.mode === "edit") {
      const response = await updateTaskAPI(taskData.value.id, taskData.value);
      emit("updated", response);
    }
    taskData.value.title = "";
    emit("close");
  } catch (error) {
    console.error(
      `Ошибка при ${
        props.mode === "add" ? "добавлении" : "редактировании"
      } подзадачи:`,
      error
    );
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(20, 24, 30, 0.82);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-card {
  background: #23232b;
  border-radius: 18px;
  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.5);
  padding: 32px;
  width: 90%;
  max-width: 400px;
  position: relative;
  color: #fff;
}

.modal-close {
  position: absolute;
  top: 12px;
  right: 16px;
  font-size: 1.5rem;
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: bold;
  margin-bottom: 16px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

label {
  font-size: 0.95rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

input[type="text"] {
  background: #18191f;
  color: #fff;
  border: 1px solid #2e2660;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 1rem;
  outline: none;
}

input:focus {
  border-color: #6e4aff;
}

.btn-submit:hover {
  background: linear-gradient(90deg, #6e4aff 60%, #2e2660 100%);
}

.delete-confirmation {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.delete-confirmation p {
  font-size: 1rem;
  margin: 0;
}

.delete-buttons {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  align-items: center;
}

.btn-submit {
  background: linear-gradient(90deg, #2e2660 60%, #18191f 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
}

.btn-delete {
  background: linear-gradient(90deg, #c14481 60%, #18191f 100%);
}

.btn-delete:hover {
  background: linear-gradient(90deg, #ff6b6b 60%, #c14481 100%);
}

.btn-cancel {
  background: #18191f;
  color: #fff;
  border: 1px solid #2e2660;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-cancel:hover {
  border-color: #6e4aff;
  background: #2e2660;
}
</style>
