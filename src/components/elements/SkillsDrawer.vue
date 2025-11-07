<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="isOpen" class="drawer-overlay" @click="$emit('close')">
        <div class="drawer-panel" @click.stop>
          <!-- Header -->
          <div class="drawer-header">
            <button class="close-btn" @click="$emit('close')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div v-if="loading" class="drawer-loading">
            <div class="spinner"></div>
            <p>Загрузка...</p>
          </div>

          <div v-else-if="error" class="drawer-error">
            <p>{{ error }}</p>
            <button class="btn-primary" @click="loadSkill">
              Попробовать снова
            </button>
          </div>

          <div v-else-if="skill" class="drawer-content">
            <!-- Skill Header -->
            <div class="skill-header">
              <div class="skill-icon">{{ getIcon(skill.name) }}</div>
              <div class="skill-info">
                <h2 class="skill-title">{{ skill.name }}</h2>
                <p v-if="skill.goalDescription" class="skill-goal">
                  {{ skill.goalDescription }}
                </p>
              </div>
            </div>

            <!-- Tags -->
            <div v-if="skill.tags.length > 0" class="tags-section">
              <span v-for="tag in skill.tags" :key="tag" class="tag">{{
                tag
              }}</span>
            </div>

            <!-- Progress Overview -->
            <div class="progress-overview">
              <div class="progress-card">
                <div class="progress-label">Прогресс по частям</div>
                <div class="progress-circle">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle
                      cx="40"
                      cy="40"
                      r="35"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.1)"
                      stroke-width="6"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="35"
                      fill="none"
                      stroke="url(#gradient)"
                      stroke-width="6"
                      stroke-linecap="round"
                      :stroke-dasharray="circumference"
                      :stroke-dashoffset="partsProgressOffset"
                      transform="rotate(-90 40 40)"
                      class="progress-circle-animated"
                    />
                    <defs>
                      <linearGradient
                        id="gradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop offset="0%" stop-color="#1767fd" />
                        <stop offset="100%" stop-color="#6e4aff" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div class="progress-text">{{ partsProgress }}%</div>
                </div>
              </div>

              <div class="stats-grid">
                <div class="stat-item">
                  <div class="stat-value">{{ skill.spentHours }}ч</div>
                  <div class="stat-label">Потрачено</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">{{ skill.expectedHours }}ч</div>
                  <div class="stat-label">Цель</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">{{ parts.length }}</div>
                  <div class="stat-label">Разделов</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value completed">
                    {{ completedPartsCount }}
                  </div>
                  <div class="stat-label">Завершено</div>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="action-buttons">
              <button class="btn-secondary" @click="showAddPartModal = true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 3v10M3 8h10"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
                Добавить раздел
              </button>

              <button class="btn-primary" @click="showTimeModal = true">
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
                Добавить время
              </button>
            </div>

            <!-- Skill Parts -->
            <div class="parts-section">
              <h3 class="section-title">
                Разделы навыка
                <span class="parts-count">{{ parts.length }}</span>
              </h3>

              <div v-if="parts.length === 0" class="empty-state">
                <div class="empty-icon">📚</div>
                <p>Разделов пока нет</p>
                <button class="btn-secondary" @click="showAddPartModal = true">
                  Добавить первый раздел
                </button>
              </div>

              <div v-else class="parts-list">
                <PartItem
                  v-for="part in sortedParts"
                  :key="part.id"
                  :part="part"
                  @status-change="handlePartStatusChange"
                  @edit="editPart"
                  @delete="deletePart"
                  @add-time="showPartTimeModal"
                />
              </div>
            </div>

            <!-- GitHub Link -->
            <a
              v-if="skill.githubLink"
              :href="skill.githubLink"
              target="_blank"
              class="github-link"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  d="M10 0C4.48 0 0 4.48 0 10c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53.82 1.53.82.9 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V19c0 .27.16.59.67.5C17.14 18.16 20 14.42 20 10A10 10 0 0010 0z"
                />
              </svg>
              Открыть на GitHub
            </a>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Add Part Modal -->
    <div
      v-if="showAddPartModal"
      class="modal-overlay"
      @click="showAddPartModal = false"
    >
      <div class="modal-card" @click.stop>
        <button class="modal-close" @click="showAddPartModal = false">×</button>

        <h3 class="modal-title">Добавить раздел</h3>

        <div class="modal-form">
          <label>
            <span class="label-text">Название раздела</span>
            <input
              v-model="newPart.title"
              type="text"
              placeholder="Например: Основы RabbitMQ"
              class="form-input"
              @keyup.enter="addPart"
            />
          </label>

          <label>
            <span class="label-text">Описание (опционально)</span>
            <textarea
              v-model="newPart.content"
              placeholder="Exchanges, queues, bindings..."
              class="form-textarea"
              rows="3"
            ></textarea>
          </label>

          <label>
            <span class="label-text">Ожидаемое время (часов)</span>
            <input
              v-model.number="newPart.expectedHours"
              type="number"
              min="1"
              class="form-input"
            />
          </label>

          <div class="modal-actions">
            <button class="btn-secondary" @click="showAddPartModal = false">
              Отмена
            </button>
            <button
              class="btn-primary"
              @click="addPart"
              :disabled="!newPart.title"
            >
              Добавить
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Time Log Modal -->
    <div
      v-if="showTimeModal"
      class="modal-overlay"
      @click="showTimeModal = false"
    >
      <div class="modal-card" @click.stop>
        <button class="modal-close" @click="showTimeModal = false">×</button>

        <h3 class="modal-title">Добавить время</h3>

        <div class="modal-form">
          <div class="quick-time-buttons">
            <button
              v-for="preset in timePresets"
              :key="preset.minutes"
              class="time-preset-btn"
              :class="{ active: timeLog.durationMin === preset.minutes }"
              @click="selectTimePreset(preset.minutes)"
            >
              {{ preset.label }}
            </button>
          </div>

          <label>
            <span class="label-text">Или укажите точное время (минут)</span>
            <input
              v-model.number="timeLog.durationMin"
              type="number"
              min="1"
              class="form-input"
            />
          </label>

          <label>
            <span class="label-text">Заметка (опционально)</span>
            <textarea
              v-model="timeLog.note"
              placeholder="Что изучали..."
              class="form-textarea"
              rows="3"
            ></textarea>
          </label>

          <div class="modal-actions">
            <button class="btn-secondary" @click="showTimeModal = false">
              Отмена
            </button>
            <button
              class="btn-primary"
              @click="logTime"
              :disabled="!timeLog.durationMin"
            >
              Добавить
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useSkillsStore } from "../../stores/skills";
import * as api from "../../api";
import PartItem from "../../components/elements/PartItem.vue";
import type { Skill, SkillPart } from "../../types";

interface Props {
  skillId: string | null;
  isOpen: boolean;
}

interface Emits {
  (e: "close"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const skillsStore = useSkillsStore();

const skill = computed(() =>
  props.skillId ? skillsStore.getSkillById(props.skillId) : null
);
const parts = computed(() =>
  props.skillId ? skillsStore.getPartsBySkillId(props.skillId) : []
);
const loading = ref(false);
const error = ref<string | null>(null);

// Progress
const circumference = 2 * Math.PI * 35;

const partsProgress = computed(() => {
  if (parts.value.length === 0) return 0;

  const statusWeights = {
    "not-started": 0,
    "in-progress": 0.5,
    done: 1,
  };

  const totalWeight = parts.value.reduce(
    (sum, part) => sum + statusWeights[part.status],
    0
  );

  return Math.round((totalWeight / parts.value.length) * 100);
});

const partsProgressOffset = computed(() => {
  return circumference - (partsProgress.value / 100) * circumference;
});

const completedPartsCount = computed(
  () => parts.value.filter((p) => p.status === "done").length
);

const sortedParts = computed(() => {
  return [...parts.value].sort((a, b) => {
    const statusOrder = { "in-progress": 0, "not-started": 1, done: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });
});

// Modals
const showAddPartModal = ref(false);
const showTimeModal = ref(false);

const newPart = ref({
  title: "",
  content: "",
  expectedHours: 4,
});

const timePresets = [
  { label: "15 мин", minutes: 15 },
  { label: "30 мин", minutes: 30 },
  { label: "1 час", minutes: 60 },
  { label: "2 часа", minutes: 120 },
];

const timeLog = ref({
  durationMin: 60,
  note: "",
});

// Watch
watch(
  () => props.skillId,
  (newId) => {
    if (newId && props.isOpen) {
      loadSkill();
    }
  },
  { immediate: true }
);

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen && props.skillId) {
      loadSkill();
    }

    // Reset modals when drawer closes
    if (!isOpen) {
      showAddPartModal.value = false;
      showTimeModal.value = false;
    }
  }
);

// Methods
async function loadSkill() {
  if (!props.skillId) return;

  loading.value = true;
  error.value = null;

  try {
    await skillsStore.fetchSkillDetail(props.skillId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Не удалось загрузить навык";
  } finally {
    loading.value = false;
  }
}

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

async function addPart() {
  if (!props.skillId) return;

  try {
    await skillsStore.createSkillPart(props.skillId, {
      title: newPart.value.title,
      content: newPart.value.content,
      expectedHours: newPart.value.expectedHours,
    });

    showAddPartModal.value = false;
    newPart.value = { title: "", content: "", expectedHours: 4 };
  } catch (e) {
    console.error("Failed to add part:", e);
  }
}

async function handlePartStatusChange(
  partId: string,
  status: "not-started" | "in-progress" | "done"
) {
  try {
    await skillsStore.setPartStatus(partId, status);
  } catch (e) {
    console.error("Failed to update part status:", e);
  }
}

function editPart(part: SkillPart) {
  console.log("Edit part:", part);
  // TODO: Implement edit modal
}

async function deletePart(partId: string) {
  if (!props.skillId || !confirm("Удалить раздел?")) return;

  try {
    await skillsStore.deleteSkillPart(props.skillId, partId);
  } catch (e) {
    console.error("Failed to delete part:", e);
  }
}

function showPartTimeModal(partId: string) {
  console.log("Add time for part:", partId);
  // TODO: Time modal for specific part
}

function selectTimePreset(minutes: number) {
  timeLog.value.durationMin = minutes;
}

async function logTime() {
  if (!props.skillId) return;

  try {
    await api.logTime({
      entityType: "skill",
      entityId: props.skillId,
      startedAt: new Date().toISOString(),
      durationMin: timeLog.value.durationMin,
      note: timeLog.value.note,
    });

    const newSpentHours =
      (skill.value?.spentHours || 0) +
      Math.round(timeLog.value.durationMin / 60);
    await skillsStore.updateSkill(props.skillId, { spentHours: newSpentHours });

    showTimeModal.value = false;
    timeLog.value = { durationMin: 60, note: "" };
  } catch (e) {
    console.error("Failed to log time:", e);
  }
}
</script>

<style scoped>
/* Drawer Transitions */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(100%);
}

/* Drawer Overlay */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

/* Drawer Panel */
.drawer-panel {
  width: 50%;
  max-width: 700px;
  min-width: 500px;
  height: 100vh;
  background: linear-gradient(135deg, #12131f 0%, #1a1b2e 100%);
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(23, 103, 253, 0.15);
  display: flex;
  justify-content: flex-end;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(23, 103, 253, 0.2);
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(23, 103, 253, 0.1);
  border-color: rgba(23, 103, 253, 0.4);
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px 24px;
}

/* Scrollbar */
.drawer-content::-webkit-scrollbar {
  width: 8px;
}

.drawer-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.drawer-content::-webkit-scrollbar-thumb {
  background: rgba(23, 103, 253, 0.3);
  border-radius: 4px;
}

.drawer-content::-webkit-scrollbar-thumb:hover {
  background: rgba(23, 103, 253, 0.5);
}

/* States */
.drawer-loading,
.drawer-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: #b7c9d1;
  padding: 40px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(23, 103, 253, 0.2);
  border-top-color: #1767fd;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Skill Header */
.skill-header {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
}

.skill-icon {
  font-size: 56px;
  line-height: 1;
  filter: drop-shadow(0 0 12px rgba(23, 103, 253, 0.5));
}

.skill-info {
  flex: 1;
}

.skill-title {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px 0;
}

.skill-goal {
  font-size: 14px;
  color: #b7c9d1;
  line-height: 1.6;
  margin: 0;
}

/* Tags */
.tags-section {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}

.tag {
  padding: 6px 12px;
  background: rgba(23, 103, 253, 0.12);
  border: 1px solid rgba(23, 103, 253, 0.25);
  border-radius: 6px;
  font-size: 12px;
  color: #1767fd;
  font-weight: 500;
}

/* Progress Overview */
.progress-overview {
  background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.08),
    rgba(110, 74, 255, 0.08)
  );
  backdrop-filter: blur(12px);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  display: flex;
  gap: 24px;
}

.progress-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.progress-label {
  font-size: 12px;
  color: #b7c9d1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.progress-circle {
  position: relative;
  width: 80px;
  height: 80px;
}

.progress-circle-animated {
  transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 0 8px rgba(23, 103, 253, 0.6));
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.stats-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}

.stat-value.completed {
  color: #52c41a;
}

.stat-label {
  font-size: 11px;
  color: #b7c9d1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 32px;
}

.action-buttons .btn-secondary,
.action-buttons .btn-primary {
  flex: 1;
}

/* Parts Section */
.parts-section {
  margin-bottom: 32px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 16px 0;
}

.parts-count {
  font-size: 14px;
  color: #1767fd;
  padding: 2px 10px;
  background: rgba(23, 103, 253, 0.15);
  border-radius: 6px;
}

.parts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #b7c9d1;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

/* GitHub Link */
.github-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 10px;
  color: #1767fd;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
  margin-top: 24px;
}

.github-link:hover {
  background: rgba(23, 103, 253, 0.15);
  border-color: rgba(23, 103, 253, 0.5);
}

/* Buttons */
.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  color: #fff;
  box-shadow: 0 4px 12px rgba(23, 103, 253, 0.3);
}

.btn-primary:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(23, 103, 253, 0.5);
  transform: translateY(-2px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: rgba(23, 103, 253, 0.1);
  color: #1767fd;
  border: 1px solid rgba(23, 103, 253, 0.3);
}

.btn-secondary:hover {
  background: rgba(23, 103, 253, 0.15);
  border-color: rgba(23, 103, 253, 0.5);
}

/* Modal Styles (reused from previous modals) */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.modal-card {
  background: linear-gradient(
    135deg,
    rgba(18, 19, 31, 0.98),
    rgba(23, 25, 40, 0.98)
  );
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 16px;
  padding: 32px;
  max-width: 450px;
  width: 100%;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  line-height: 1;
}

.modal-close:hover {
  opacity: 1;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 20px 0;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.label-text {
  display: block;
  font-size: 12px;
  color: #b7c9d1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.form-input,
.form-textarea {
  width: 100%;
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 10px;
  padding: 10px 14px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  border-color: rgba(23, 103, 253, 0.5);
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.quick-time-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.time-preset-btn {
  padding: 10px;
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 8px;
  color: #1767fd;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.time-preset-btn:hover {
  background: rgba(23, 103, 253, 0.2);
  border-color: rgba(23, 103, 253, 0.5);
}

.time-preset-btn.active {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  color: #fff;
  border-color: transparent;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 8px;
}

/* Responsive */
@media (max-width: 1024px) {
  .drawer-panel {
    width: 60%;
    min-width: 400px;
  }
}

@media (max-width: 768px) {
  .drawer-panel {
    width: 100%;
    min-width: 0;
  }

  .progress-overview {
    flex-direction: column;
    align-items: center;
  }

  .stats-grid {
    width: 100%;
  }
}
</style>
