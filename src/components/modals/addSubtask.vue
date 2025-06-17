<template>
  <div class="modal-overlay">
    <div class="modal-card">
      <button class="modal-close" @click="closeAddModal">×</button>

      <h2 class="modal-title">Добавить подзадачу</h2>

      <form @submit.prevent="submit">
        <label>
          Название задачи
          <input
            v-model="newTask.title"
            type="text"
            placeholder="Введите название"
            required
            maxlength="60"
          />
        </label>

        <button type="submit" class="btn-submit">Добавить</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { addTaskAPI } from "../api.js";

const props = defineProps({
  task: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["close", "created"]);

const closeAddModal = () => {
  emit("close");
};

const newTask = ref({
  title: "",
  parentId: props.task.id,
});

const submit = async () => {
  if (!newTask.value.title.trim()) return;

  try {
    const response = await addTaskAPI(newTask.value);
    emit("created", response);
    newTask.value.title = "";
    emit("close");
  } catch (error) {
    console.error(error);
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
  margin-top: 8px;
}

.btn-submit:hover {
  background: linear-gradient(90deg, #6e4aff 60%, #2e2660 100%);
}
</style>
