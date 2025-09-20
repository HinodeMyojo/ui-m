<template>
  <div class="progress-indicator" :aria-label="ariaLabel" role="group">
    <span
      v-for="index in total"
      :key="index"
      class="progress-indicator__segment"
      :class="{ 'progress-indicator__segment--active': index <= active }"
      :style="segmentStyle(index)"
      role="presentation"
    ></span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  total: number;
  active: number;
  color?: string;
  ariaLabel?: string;
}>();

const segmentStyle = (index: number) => {
  if (index <= props.active && props.color) {
    return { backgroundColor: props.color };
  }
  return {};
};
</script>

<style scoped>
.progress-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: rgba(20, 30, 40, 0.85);
  border-radius: 5px;
  padding: 4px 6px;
  min-height: 16px;
}

.progress-indicator__segment {
  flex: 1 1 0;
  min-width: 0;
  height: 10px;
  border-radius: 3px;
  background: rgba(60, 70, 80, 0.55);
  border: 1px solid rgba(80, 90, 100, 0.18);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.08);
  transition: background 0.2s, border 0.2s, box-shadow 0.2s;
}

.progress-indicator__segment--active {
  opacity: 0.98;
  border: 1.5px solid #fff3;
  box-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.1);
}
</style>
