<template>
  <BaseModal
    :open="open"
    title="Удалить задачу?"
    @close="emitClose"
    :close-on-overlay="false"
  >
    <p class="delete-confirm__text">
      Вы уверены, что хотите удалить задачу <strong>{{ taskTitle }}</strong>?
    </p>
    <footer class="delete-confirm__footer">
      <button type="button" class="delete-confirm__submit" @click="emitConfirm">
        Удалить
      </button>
      <button type="button" class="delete-confirm__cancel" @click="emitClose">
        Отмена
      </button>
    </footer>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from "./BaseModal.vue";

defineProps<{
  open: boolean;
  taskTitle: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm"): void;
}>();

const emitClose = () => {
  emit("close");
};

const emitConfirm = () => {
  emit("confirm");
};
</script>

<style scoped>
.delete-confirm__text {
  margin: 0 0 16px;
  color: rgba(255, 255, 255, 0.9);
}

.delete-confirm__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.delete-confirm__submit,
.delete-confirm__cancel {
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.delete-confirm__submit {
  background: linear-gradient(120deg, #b22222 25%, #5e1d1d 100%);
  color: #fff;
}

.delete-confirm__cancel {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}
</style>
