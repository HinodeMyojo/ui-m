<template>
  <div
    class="skill-card"
    @click="$emit('open', skill.id)"
    @contextmenu.prevent="showContextMenu"
  >
    <!-- Header -->
    <div class="card-header">
      <div class="skill-icon">{{ getIcon(skill.name) }}</div>
      <div class="card-actions">
        <button
          class="action-btn"
          @click.stop="$emit('edit', skill)"
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
      </div>
    </div>

    <!-- Skill Name -->
    <h3 class="skill-name">{{ skill.name }}</h3>

    <!-- Goal Description -->
    <p v-if="skill.goalDescription" class="skill-description">
      {{ skill.goalDescription }}
    </p>

    <!-- Progress Bar -->
    <div class="progress-section">
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: `${skill.progress || 0}%` }"
        ></div>
      </div>
      <div class="progress-label">
        {{ skill.progress || 0 }}% · {{ skill.spentHours }}ч /
        {{ skill.expectedHours }}ч
      </div>
    </div>

    <!-- Tags -->
    <div v-if="skill.tags.length > 0" class="tags">
      <span v-for="tag in skill.tags.slice(0, 3)" :key="tag" class="tag">
        {{ tag }}
      </span>
      <span v-if="skill.tags.length > 3" class="tag-more">
        +{{ skill.tags.length - 3 }}
      </span>
    </div>

    <!-- Footer Actions -->
    <div class="card-footer">
      <button class="quick-btn" @click.stop="addTime" title="Добавить время">
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
        <span>+1ч</span>
      </button>

      <div class="last-update">
        {{ formatLastUpdate(skill.updatedAt) }}
      </div>
    </div>

    <!-- Glow Effect -->
    <div class="card-glow"></div>
  </div>
</template>

<script setup lang="ts">
import type { Skill } from "../../types";

interface Props {
  skill: Skill;
}

interface Emits {
  (e: "open", skillId: string): void;
  (e: "edit", skill: Skill): void;
  (e: "delete", skillId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Иконки для навыков (можно расширить)
function getIcon(skillName: string): string {
  const iconMap: Record<string, string> = {
    rabbit: "🐰",
    kafka: "📨",
    postgres: "🐘",
    redis: "🔴",
    vue: "💚",
    react: "⚛️",
    docker: "🐳",
    kubernetes: "☸️",
  };

  const lowerName = skillName.toLowerCase();
  for (const [key, icon] of Object.entries(iconMap)) {
    if (lowerName.includes(key)) return icon;
  }

  return "⚡";
}

function formatLastUpdate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "только что";
  if (diffMins < 60) return `${diffMins}м назад`;
  if (diffHours < 24) return `${diffHours}ч назад`;
  if (diffDays < 7) return `${diffDays}д назад`;

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function addTime() {
  console.log("Add time for skill:", props.skill.id);
  // TODO: Открыть модалку добавления времени
}

function showContextMenu() {
  // TODO: Контекстное меню
}
</script>

<style scoped>
.skill-card {
  position: relative;
  background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.08) 0%,
    rgba(110, 74, 255, 0.08) 100%
  );
  backdrop-filter: blur(12px);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.skill-card:hover {
  border-color: rgba(23, 103, 253, 0.4);
  box-shadow: 0 8px 24px rgba(23, 103, 253, 0.25);
  transform: translateY(-4px);
}

.skill-card:hover .card-glow {
  opacity: 1;
}

.card-glow {
  position: absolute;
  inset: -2px;
  background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.2),
    rgba(110, 74, 255, 0.2)
  );
  border-radius: 16px;
  filter: blur(20px);
  opacity: 0;
  transition: opacity 0.3s;
  z-index: -1;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.skill-icon {
  font-size: 32px;
  line-height: 1;
  filter: drop-shadow(0 0 8px rgba(23, 103, 253, 0.5));
}

.card-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.skill-card:hover .card-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
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

.skill-name {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px 0;
  line-height: 1.3;
}

.skill-description {
  font-size: 13px;
  color: #b7c9d1;
  line-height: 1.5;
  margin: 0 0 16px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.progress-section {
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1767fd, #6e4aff);
  border-radius: 3px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 8px rgba(23, 103, 253, 0.6);
}

.progress-label {
  font-size: 12px;
  color: #b7c9d1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.tag {
  padding: 4px 10px;
  background: rgba(23, 103, 253, 0.12);
  border: 1px solid rgba(23, 103, 253, 0.25);
  border-radius: 5px;
  font-size: 11px;
  color: #1767fd;
  font-weight: 500;
}

.tag-more {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  font-size: 11px;
  color: #b7c9d1;
  font-weight: 500;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid rgba(23, 103, 253, 0.15);
}

.quick-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(23, 103, 253, 0.12);
  border: 1px solid rgba(23, 103, 253, 0.25);
  border-radius: 6px;
  color: #1767fd;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-btn:hover {
  background: rgba(23, 103, 253, 0.2);
  border-color: rgba(23, 103, 253, 0.4);
  box-shadow: 0 0 12px rgba(23, 103, 253, 0.3);
}

.last-update {
  font-size: 11px;
  color: #b7c9d1;
  opacity: 0.7;
}
</style>
