<template>
  <label class="date-input">
    <span v-if="label" class="date-input__label">{{ label }}</span>
    <input
      class="date-input__control"
      type="date"
      :value="modelValue"
      :max="max"
      :min="min"
      @input="onInput"
    />
  </label>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string | null;
  label?: string;
  min?: string;
  max?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string | null): void;
}>();

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit("update:modelValue", target.value || null);
};
</script>

<style scoped>
.date-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.date-input__label {
  font-size: 0.85rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.75);
}

.date-input__control {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 20, 30, 0.75);
  color: rgba(255, 255, 255, 0.95);
}

.date-input__control:focus {
  outline: 2px solid rgba(255, 255, 255, 0.25);
}
</style>
