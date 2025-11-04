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

        <label>
          Дедлайн (необязательно)
          <input
            v-model="taskData.end"
            type="datetime-local"
            placeholder="Выберите дату и время"
          />
          <span v-if="taskData.end" class="deadline-info">
            {{ formatDeadlineInfo(taskData.end) }}
          </span>
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

// Функция для форматирования даты из ISO в datetime-local
const formatDateForInput = (isoDate) => {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const taskData = ref({
  id: props.mode === "add" ? null : props.subtask?.id,
  title: props.mode === "add" ? "" : props.subtask?.title || "",
  end: props.mode === "add" ? "" : formatDateForInput(props.subtask?.end),
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

const formatDeadlineInfo = (dateTimeLocal) => {
  if (!dateTimeLocal) return "";
  const date = new Date(dateTimeLocal);
  const now = new Date();
  const diffMs = date - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(
    (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );

  if (diffMs < 0) {
    return "⚠️ Просрочен";
  } else if (diffDays === 0 && diffHours < 24) {
    return `⏰ Осталось ${diffHours}ч`;
  } else if (diffDays < 7) {
    return `📅 Через ${diffDays}д`;
  }
  return `📅 ${date.toLocaleDateString("ru-RU")}`;
};

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
    // Преобразуем datetime-local в ISO формат для API
    const endDate = taskData.value.end
      ? new Date(taskData.value.end).toISOString()
      : null;

    const taskPayload = {
      title: taskData.value.title,
      end: endDate,
      parentId: taskData.value.parentId,
    };

    if (props.mode === "add") {
      const response = await addTaskAPI(taskPayload);
      emit("created", response);
    } else if (props.mode === "edit") {
      const response = await updateTaskAPI(taskData.value.id, taskPayload);
      emit("updated", response);
    }
    taskData.value.title = "";
    taskData.value.end = "";
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
  max-width: 450px;
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
  transition: all 0.2s ease;
}

.modal-close:hover {
  color: #6e4aff;
  transform: scale(1.1);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: bold;
  margin-bottom: 16px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

label {
  font-size: 0.95rem;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

input[type="text"],
input[type="datetime-local"] {
  background: #18191f;
  color: #fff;
  border: 1px solid #2e2660;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 1rem;
  outline: none;
  transition: all 0.2s ease;
}

input:focus {
  border-color: #6e4aff;
  box-shadow: 0 0 0 3px rgba(110, 74, 255, 0.1);
}

input[type="datetime-local"]::-webkit-calendar-picker-indicator {
  filter: invert(1);
  cursor: pointer;
}

.deadline-info {
  font-size: 0.85rem;
  color: #c14481;
  margin-top: 4px;
  padding: 6px 10px;
  background: rgba(193, 68, 129, 0.1);
  border-radius: 6px;
  display: inline-block;
}

.btn-submit {
  background: linear-gradient(90deg, #2e2660 60%, #18191f 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
}

.btn-submit:hover {
  background: linear-gradient(90deg, #6e4aff 60%, #2e2660 100%);
  box-shadow: 0 4px 12px rgba(110, 74, 255, 0.3);
}

.btn-submit:active {
  transform: scale(0.98);
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
  padding: 10px 16px;
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
