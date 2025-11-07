<template>
  <div class="project-card" @click="$emit('open', project.id)">
    <div class="project-image" v-if="project.image">
      <img :src="project.image" :alt="project.name" />
    </div>
    <div class="project-image-placeholder" v-else>
      <span class="placeholder-icon">🚀</span>
    </div>

    <div class="project-content">
      <h3 class="project-name">{{ project.name }}</h3>
      <p v-if="project.description" class="project-description">
        {{ project.description }}
      </p>

      <div
        class="project-skills"
        v-if="project.skills && project.skills.length > 0"
      >
        <span
          v-for="skill in project.skills.slice(0, 3)"
          :key="skill.id"
          class="skill-badge"
        >
          {{ skill.name }}
        </span>
        <span v-if="project.skills.length > 3" class="skill-more">
          +{{ project.skills.length - 3 }}
        </span>
      </div>

      <div class="project-footer">
        <div class="project-progress">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${project.progress?.byParts || 0}%` }"
            ></div>
          </div>
          <span class="progress-text">
            {{ project.progress?.byParts || 0 }}% завершено
          </span>
        </div>

        <div class="project-status" :class="`status-${project.status}`">
          <span class="status-dot"></span>
          <span class="status-text">{{ getStatusText(project.status) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PetProject } from "../../types";

interface Props {
  project: PetProject;
}

interface Emits {
  (e: "open", projectId: string): void;
}

defineProps<Props>();
defineEmits<Emits>();

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    "not-started": "Не начат",
    "in-progress": "В работе",
    done: "Завершён",
  };
  return statusMap[status] || status;
}
</script>

<style scoped>
.project-card {
  background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.08),
    rgba(110, 74, 255, 0.08)
  );
  backdrop-filter: blur(12px);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.project-card:hover {
  border-color: rgba(23, 103, 253, 0.4);
  box-shadow: 0 8px 24px rgba(23, 103, 253, 0.25);
  transform: translateY(-4px);
}

.project-image {
  width: 100%;
  height: 160px;
  overflow: hidden;
  background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.15),
    rgba(110, 74, 255, 0.15)
  );
}

.project-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.project-image-placeholder {
  width: 100%;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.15),
    rgba(110, 74, 255, 0.15)
  );
}

.placeholder-icon {
  font-size: 48px;
  filter: drop-shadow(0 0 12px rgba(23, 103, 253, 0.5));
}

.project-content {
  padding: 20px;
}

.project-name {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px 0;
  line-height: 1.3;
}

.project-description {
  font-size: 13px;
  color: #b7c9d1;
  line-height: 1.5;
  margin: 0 0 16px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.project-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.skill-badge {
  padding: 4px 10px;
  background: rgba(23, 103, 253, 0.12);
  border: 1px solid rgba(23, 103, 253, 0.25);
  border-radius: 5px;
  font-size: 11px;
  color: #1767fd;
  font-weight: 500;
}

.skill-more {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  font-size: 11px;
  color: #b7c9d1;
  font-weight: 500;
}

.project-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.progress-text {
  font-size: 12px;
  color: #b7c9d1;
}

.project-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-text {
  font-size: 12px;
  font-weight: 500;
}

.project-status.status-not-started {
  color: #b7c9d1;
}

.project-status.status-not-started .status-dot {
  background: #b7c9d1;
}

.project-status.status-in-progress {
  color: #1767fd;
}

.project-status.status-in-progress .status-dot {
  background: #1767fd;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.project-status.status-done {
  color: #52c41a;
}

.project-status.status-done .status-dot {
  background: #52c41a;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
