<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useSkillsStore } from "../../stores/skills";
import { useProjectsStore } from "../../stores/projects";

const emit = defineEmits<{
  close: [];
  select: [entity: { id: string; type: string; name: string }];
}>();

const skillsStore = useSkillsStore();
const projectsStore = useProjectsStore();

const searchQuery = ref("");
const activeTab = ref<"skills" | "projects">("skills");
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    await Promise.all([
      skillsStore.fetchSkills(),
      projectsStore.fetchProjects(),
    ]);
  } finally {
    loading.value = false;
  }
});

const filteredSkills = computed(() => {
  const skills = skillsStore.allSkills;
  if (!searchQuery.value) return skills;
  const q = searchQuery.value.toLowerCase();
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.goalDescription?.toLowerCase().includes(q)
  );
});

const filteredProjects = computed(() => {
  const projects = projectsStore.allProjects;
  if (!searchQuery.value) return projects;
  const q = searchQuery.value.toLowerCase();
  return projects.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
  );
});

function selectEntity(id: string, type: string, name: string) {
  emit("select", { id, type, name });
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content">
      <header class="modal-header">
        <h2>Привязать к задаче</h2>
        <button class="close-btn" @click="emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <!-- Search -->
      <div class="search-box">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Поиск навыков и проектов..."
          autofocus
        />
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          :class="{ active: activeTab === 'skills' }"
          @click="activeTab = 'skills'"
        >
          Навыки
          <span class="count">{{ filteredSkills.length }}</span>
        </button>
        <button
          :class="{ active: activeTab === 'projects' }"
          @click="activeTab = 'projects'"
        >
          Проекты
          <span class="count">{{ filteredProjects.length }}</span>
        </button>
      </div>

      <!-- Content -->
      <div class="modal-body">
        <div v-if="loading" class="loading">
          <div class="spinner"></div>
          Загрузка...
        </div>

        <!-- Skills list -->
        <div v-else-if="activeTab === 'skills'" class="entity-list">
          <div
            v-for="skill in filteredSkills"
            :key="skill.id"
            class="entity-item"
            @click="selectEntity(skill.id, 'skill', skill.name)"
          >
            <div class="entity-icon skill">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22,4 12,14.01 9,11.01"/>
              </svg>
            </div>
            <div class="entity-info">
              <h4>{{ skill.name }}</h4>
              <p v-if="skill.goalDescription">{{ skill.goalDescription }}</p>
            </div>
            <div class="entity-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: (skill.progress || 0) + '%' }"></div>
              </div>
              <span>{{ skill.progress || 0 }}%</span>
            </div>
          </div>

          <div v-if="filteredSkills.length === 0" class="empty-state">
            Навыки не найдены
          </div>
        </div>

        <!-- Projects list -->
        <div v-else class="entity-list">
          <div
            v-for="project in filteredProjects"
            :key="project.id"
            class="entity-item"
            @click="selectEntity(project.id, 'project', project.name)"
          >
            <div class="entity-icon project">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </div>
            <div class="entity-info">
              <h4>{{ project.name }}</h4>
              <p v-if="project.description">{{ project.description }}</p>
            </div>
            <div class="entity-status" :class="project.status">
              {{ project.status === 'done' ? 'Готов' : project.status === 'in-progress' ? 'В процессе' : 'Не начат' }}
            </div>
          </div>

          <div v-if="filteredProjects.length === 0" class="empty-state">
            Проекты не найдены
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.modal-content {
  background: #1a1b2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h2 {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.close-btn {
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 24px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.5);
}

.search-box input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #fff;
  font-size: 14px;
}

.search-box input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.tabs {
  display: flex;
  gap: 8px;
  padding: 0 24px;
  margin-bottom: 16px;
}

.tabs button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.tabs button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.tabs button.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.3);
  color: #6366f1;
}

.tabs .count {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 12px;
}

.tabs button.active .count {
  background: rgba(99, 102, 241, 0.3);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.entity-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entity-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.entity-item:hover {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
}

.entity-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.entity-icon.skill {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.entity-icon.project {
  background: rgba(99, 102, 241, 0.2);
  color: #6366f1;
}

.entity-info {
  flex: 1;
  min-width: 0;
}

.entity-info h4 {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-info p {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.progress-bar {
  width: 60px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #4ade80);
  border-radius: 3px;
  transition: width 0.3s;
}

.entity-progress span {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  min-width: 36px;
  text-align: right;
}

.entity-status {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
}

.entity-status.not-started {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

.entity-status.in-progress {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.entity-status.done {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
}
</style>
