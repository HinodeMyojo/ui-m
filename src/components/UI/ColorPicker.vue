<template>
  <label class="color-picker">
    <span v-if="label" class="color-picker__label">{{ label }}</span>
    <input
      class="color-picker__input"
      type="color"
      :value="modelValue"
      @input="onInput"
    />
  </label>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  label?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit("update:modelValue", target.value);
};
</script>

<style scoped>
.color-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.color-picker__label {
  font-size: 0.85rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.75);
}

.color-picker__input {
  width: 100%;
  border: none;
  height: 40px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.color-picker__input:focus {
  outline: 2px solid rgba(255, 255, 255, 0.25);
}
</style>
