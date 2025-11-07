<template>
  <div class="part-item" :class="`status-${part.status}`">
    <div class="part-header">
      <div class="part-status-indicator" :class="part.status">
        <span class="status-dot"></span>
      </div>

      <div class="part-main">
        <h3 class="part-title">{{ part.title }}</h3>
        <p v-if="part.content" class="part-content">{{ part.content }}</p>
      </div>

      <div class="part-actions">
        <button
          class="action-btn"
          @click="$emit('add-time', part.id)"
          title="Добавить время"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path
              d="M8 4v4l3 3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <button
          class="action-btn"
          @click="$emit('edit', part)"
          title="Редактировать"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M11 2L14 5L5 14H2V11L11 2Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <button
          class="action-btn delete-btn"
          @click="$emit('delete', part.id)"
          title="Удалить"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M13 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="part-footer">
      <div class="part-progress">
        <div class="progress-info">
          <span class="progress-label"
            >{{ part.spentHours }}ч / {{ part.expectedHours }}ч</span
          >
          <span class="progress-percent">{{ timeProgress }}%</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${timeProgress}%` }"
          ></div>
        </div>
      </div>

      <div class="part-status-buttons">
        <button
          v-for="status in statusOptions"
          :key="status.value"
          class="status-btn"
          :class="{ active: part.status === status.value }"
          @click="$emit('status-change', part.id, status.value)"
          :title="status.label"
        >
          {{ status.icon }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SkillPart } from "../../types";

interface Props {
  part: SkillPart;
}

interface Emits {
  (
    e: "status-change",
    partId: string,
    status: "not-started" | "in-progress" | "done"
  ): void;
  (e: "edit", part: SkillPart): void;
  (e: "delete", partId: string): void;
  (e: "add-time", partId: string): void;
}

const props = defineProps<Props>();
defineEmits<Emits>();

const statusOptions = [
  { value: "not-started" as const, label: "Не начато", icon: "⭕" },
  { value: "in-progress" as const, label: "В процессе", icon: "🔄" },
  { value: "done" as const, label: "Завершено", icon: "✅" },
];

const timeProgress = computed(() => {
  if (props.part.expectedHours === 0) return 0;
  return Math.min(
    100,
    Math.round((props.part.spentHours / props.part.expectedHours) * 100)
  );
});
</script>

<style scoped>
.part-item {
  background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.06),
    rgba(110, 74, 255, 0.06)
  );
  backdrop-filter: blur(12px);
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 12px;
  padding: 20px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.part-item:hover {
  border-color: rgba(23, 103, 253, 0.3);
  box-shadow: 0 4px 16px rgba(23, 103, 253, 0.15);
}

.part-item.status-done {
  opacity: 0.7;
}

.part-item.status-in-progress {
  border-color: rgba(23, 103, 253, 0.4);
}

.part-header {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.part-status-indicator {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid;
}

.part-status-indicator.not-started {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
}

.part-status-indicator.in-progress {
  border-color: #1767fd;
  background: rgba(23, 103, 253, 0.15);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.part-status-indicator.done {
  border-color: #52c41a;
  background: rgba(82, 196, 26, 0.15);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: currentColor;
}

.part-status-indicator.not-started .status-dot {
  background: rgba(255, 255, 255, 0.3);
}

.part-status-indicator.in-progress .status-dot {
  background: #1767fd;
}

.part-status-indicator.done .status-dot {
  background: #52c41a;
}

.part-main {
  flex: 1;
  min-width: 0;
}

.part-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 8px 0;
}

.part-content {
  font-size: 13px;
  color: #b7c9d1;
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.part-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.part-item:hover .part-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(23, 103, 253, 0.2);
  color: #1767fd;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(23, 103, 253, 0.15);
  border-color: rgba(23, 103, 253, 0.4);
}

.delete-btn {
  color: #ff4d4f;
  border-color: rgba(255, 77, 79, 0.2);
}

.delete-btn:hover {
  background: rgba(255, 77, 79, 0.15);
  border-color: rgba(255, 77, 79, 0.4);
}

.part-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
}

.part-progress {
  flex: 1;
  min-width: 0;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-label {
  font-size: 12px;
  color: #b7c9d1;
}

.progress-percent {
  font-size: 12px;
  font-weight: 600;
  color: #1767fd;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1767fd, #6e4aff);
  border-radius: 3px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.part-status-buttons {
  display: flex;
  gap: 8px;
}

.status-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.status-btn.active {
  background: rgba(23, 103, 253, 0.2);
  border-color: rgba(23, 103, 253, 0.4);
  box-shadow: 0 0 12px rgba(23, 103, 253, 0.3);
}

@media (max-width: 768px) {
  .part-header {
    flex-wrap: wrap;
  }

  .part-actions {
    opacity: 1;
    width: 100%;
    justify-content: flex-end;
  }

  .part-footer {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .part-status-buttons {
    justify-content: center;
  }
}
</style>
