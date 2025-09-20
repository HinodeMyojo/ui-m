<template>
  <div class="calendar-column" :class="{ 'calendar-column--today': isToday }">
    <span class="calendar-column__label">{{ day }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  day: number;
  isToday: boolean;
}>();
</script>

<style scoped>
.calendar-column {
  flex: 1;
  min-width: 0;
  border-right: 1px solid rgba(44, 47, 54, 0.5);
  position: relative;
}

.calendar-column:first-child {
  border-left: 1px solid rgba(44, 47, 54, 0.5);
}

.calendar-column--today {
  background-color: #2e26601f;
}

.calendar-column__label {
  padding: 8px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
  user-select: none;
}
</style>
