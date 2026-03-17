<template>
  <div class="skills-page">
    <!-- Header -->
    <div class="skills-header">
      <div class="header-left">
        <button class="back-to-home-btn" @click="goToHome">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M15 10H5M5 10l4-4M5 10l4 4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          На главную
        </button>
        <h1 class="page-title">
          <span class="title-icon">🎯</span>
          Прокачка навыков
        </h1>
        <p class="page-subtitle">У самурая нет цели, только путь</p>
      </div>
      <div class="header-actions">
        <button class="btn-primary" @click="openCreateSkillModal">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          Добавить навык
        </button>
      </div>
    </div>

    <!-- Main Layout -->
    <div class="skills-layout">
      <!-- Left Sidebar: Groups -->
      <aside class="groups-sidebar">
        <div class="sidebar-header">
          <h2 class="sidebar-title">Группы</h2>
          <button
            class="btn-icon"
            title="Добавить группу"
            @click="openCreateGroupModal"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <div class="groups-list">
          <div
            v-for="group in groups"
            :key="group.id"
            class="group-item"
            :class="{ active: selectedGroupId === group.id }"
            @click="selectGroup(group.id)"
            @contextmenu.prevent="showGroupContextMenu(group, $event)"
          >
            <div class="group-name">{{ group.name }}</div>
            <div class="group-count">{{ getSkillsCountByGroup(group.id) }}</div>
          </div>
        </div>
      </aside>

      <!-- Center: Skills Grid -->
      <main class="skills-main">
        <!-- Search & Filters -->
        <div class="skills-toolbar">
          <div class="search-box">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M12 12l4 4"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Поиск навыков..."
              class="search-input"
            />
          </div>

          <div class="filters">
            <select v-model="sortBy" class="select-filter">
              <option value="recent">Недавние</option>
              <option value="progress">По прогрессу</option>
              <option value="name">По названию</option>
            </select>
          </div>
        </div>

        <!-- Skills Grid -->
        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          <p>Загрузка навыков...</p>
        </div>

        <div v-else-if="filteredSkills.length === 0" class="empty-state">
          <div class="empty-icon">📚</div>
          <p class="empty-text">Навыков пока нет</p>
          <button class="btn-secondary" @click="openCreateSkillModal">
            Создать первый навык
          </button>
        </div>

        <div v-else class="skills-grid">
          <SkillCard
            v-for="skill in filteredSkills"
            :key="skill.id"
            :skill="skill"
            @open="openSkill"
            @edit="openEditSkillModal"
            @delete="confirmDeleteSkill"
          />
        </div>
      </main>

      <!-- Right: Inspector Panel -->
      <!-- <aside class="inspector-panel" v-if="selectedSkill">
        <div class="inspector-header">
          <h3 class="inspector-title">{{ selectedSkill.name }}</h3>
          <button class="btn-icon" @click="selectedSkill = null">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <div class="inspector-content">
          <div class="inspector-section">
            <div class="section-label">Прогресс</div>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${selectedSkill.progress || 0}%` }"
              ></div>
            </div>
            <div class="progress-stats">
              <span
                >{{ selectedSkill.spentHours }}ч /
                {{ selectedSkill.expectedHours }}ч</span
              >
              <span>{{ selectedSkill.progress || 0 }}%</span>
            </div>
          </div>

          <div class="inspector-section" v-if="selectedSkill.githubLink">
            <div class="section-label">Ссылки</div>
            <a
              :href="selectedSkill.githubLink"
              target="_blank"
              class="link-item"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
                />
              </svg>
              GitHub
            </a>
          </div>

          <div class="inspector-section" v-if="selectedSkill.tags.length > 0">
            <div class="section-label">Теги</div>
            <div class="tags-list">
              <span v-for="tag in selectedSkill.tags" :key="tag" class="tag">{{
                tag
              }}</span>
            </div>
          </div>

          <div class="inspector-actions">
            <button
              class="btn-secondary w-full"
              @click="openSkill(selectedSkill.id)"
            >
              Открыть подробно
            </button>
          </div>
        </div>
      </aside> -->
    </div>

    <!-- Skill Drawer -->
    <SkillDrawer
      :skill-id="selectedSkillId"
      :is-open="showSkillDrawer"
      @close="closeSkillDrawer"
    />

    <!-- Create/Edit Skill Modal -->
    <Teleport to="body">
      <div v-if="showSkillModal" class="modal-overlay" @click="closeSkillModal">
        <div class="modal-card" @click.stop>
          <button class="modal-close" @click="closeSkillModal">×</button>

          <h3 class="modal-title">
            {{ editingSkill ? "Редактировать навык" : "Новый навык" }}
          </h3>

          <div class="modal-form">
            <label>
              <span class="label-text">Название навыка *</span>
              <input
                v-model="skillForm.name"
                type="text"
                placeholder="Например: Kafka"
                class="form-input"
                @keyup.enter="saveSkill"
              />
            </label>

            <label>
              <span class="label-text">Группа</span>
              <select v-model="skillForm.groupId" class="form-select">
                <option :value="null">Без группы</option>
                <option
                  v-for="group in groups"
                  :key="group.id"
                  :value="group.id"
                >
                  {{ group.name }}
                </option>
              </select>
            </label>

            <label>
              <span class="label-text">Описание цели</span>
              <textarea
                v-model="skillForm.goalDescription"
                placeholder="Что хочу изучить..."
                class="form-textarea"
                rows="3"
              ></textarea>
            </label>

            <label>
              <span class="label-text">Ожидаемое время (часов) *</span>
              <input
                v-model.number="skillForm.expectedHours"
                type="number"
                min="1"
                class="form-input"
              />
            </label>

            <label>
              <span class="label-text">GitHub (опционально)</span>
              <input
                v-model="skillForm.githubLink"
                type="url"
                placeholder="https://github.com/..."
                class="form-input"
              />
            </label>

            <label>
              <span class="label-text">Теги (через запятую)</span>
              <input
                v-model="tagsInput"
                type="text"
                placeholder="MessageBroker, Async, Patterns"
                class="form-input"
              />
            </label>

            <div class="modal-actions">
              <button class="btn-secondary" @click="closeSkillModal">
                Отмена
              </button>
              <button
                class="btn-primary"
                @click="saveSkill"
                :disabled="!skillForm.name || !skillForm.expectedHours"
              >
                {{ editingSkill ? "Сохранить" : "Создать" }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Create/Edit Group Modal -->
    <Teleport to="body">
      <div v-if="showGroupModal" class="modal-overlay" @click="closeGroupModal">
        <div class="modal-card small" @click.stop>
          <button class="modal-close" @click="closeGroupModal">×</button>

          <h3 class="modal-title">
            {{ editingGroup ? "Редактировать группу" : "Новая группа" }}
          </h3>

          <div class="modal-form">
            <label>
              <span class="label-text">Название группы *</span>
              <input
                v-model="groupForm.name"
                type="text"
                placeholder="Например: Микросервисы"
                class="form-input"
                @keyup.enter="saveGroup"
              />
            </label>

            <label>
              <span class="label-text">Описание (опционально)</span>
              <textarea
                v-model="groupForm.description"
                placeholder="О чем эта группа..."
                class="form-textarea"
                rows="2"
              ></textarea>
            </label>

            <div class="modal-actions">
              <button class="btn-secondary" @click="closeGroupModal">
                Отмена
              </button>
              <button
                class="btn-primary"
                @click="saveGroup"
                :disabled="!groupForm.name"
              >
                {{ editingGroup ? "Сохранить" : "Создать" }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div
        v-if="showDeleteConfirm"
        class="modal-overlay"
        @click="closeDeleteConfirm"
      >
        <div class="modal-card small" @click.stop>
          <button class="modal-close" @click="closeDeleteConfirm">×</button>

          <h3 class="modal-title">
            Удалить {{ deleteTarget.type === "skill" ? "навык" : "группу" }}?
          </h3>

          <div class="delete-confirm-content">
            <p class="delete-confirm-text">
              {{ deleteTarget.type === "skill" ? "Навык" : "Группа" }}
              <strong>{{ deleteTarget.name }}</strong> будет удален{{
                deleteTarget.type === "skill" ? "" : "а"
              }}
              навсегда.
              <span v-if="deleteTarget.type === 'skill'"
                >Все разделы навыка тоже будут удалены.</span
              >
            </p>

            <div class="modal-actions">
              <button class="btn-secondary" @click="closeDeleteConfirm">
                Отмена
              </button>
              <button class="btn-danger" @click="executeDelete">Удалить</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Group Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.show"
        class="context-menu"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
        @click.stop
      >
        <button class="context-menu-item" @click="editContextGroup">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M11 2L14 5L5 14H2V11L11 2Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Редактировать
        </button>
        <button class="context-menu-item danger" @click="deleteContextGroup">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M13 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Удалить
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useSkillsStore } from "../stores/skills";
import SkillCard from "../components/elements/SkillCard.vue";
import SkillDrawer from "../components/elements/SkillsDrawer.vue";
import type { Skill, SkillGroup } from "../../src/types";

const router = useRouter();
const skillsStore = useSkillsStore();

const searchQuery = ref("");
const sortBy = ref("recent");
const selectedGroupId = ref<string | null>(null);
const selectedSkill = ref<Skill | null>(null);
const selectedSkillId = ref<string | null>(null);
const showSkillDrawer = ref(false);

// Modals
const showSkillModal = ref(false);
const showGroupModal = ref(false);
const showDeleteConfirm = ref(false);
const editingSkill = ref<Skill | null>(null);
const editingGroup = ref<SkillGroup | null>(null);

// Forms
const skillForm = ref({
  name: "",
  groupId: null as string | null,
  goalDescription: "",
  expectedHours: 10,
  githubLink: "",
});

const groupForm = ref({
  name: "",
  description: "",
});

const tagsInput = ref("");

const deleteTarget = ref<{ type: "skill" | "group"; id: string; name: string }>(
  {
    type: "skill",
    id: "",
    name: "",
  }
);

// Context Menu
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  group: null as SkillGroup | null,
});

// Computed
const groups = computed(() => skillsStore.groups);
const skills = computed(() => skillsStore.allSkills);
const loading = computed(() => skillsStore.loading);

const filteredSkills = computed(() => {
  let filtered = skills.value;

  if (selectedGroupId.value) {
    filtered = filtered.filter((s) => s.groupId === selectedGroupId.value);
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.goalDescription?.toLowerCase().includes(query) ||
        s.tags.some((t) => t.toLowerCase().includes(query))
    );
  }

  if (sortBy.value === "recent") {
    filtered = [...filtered].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } else if (sortBy.value === "progress") {
    filtered = [...filtered].sort(
      (a, b) => (b.progress || 0) - (a.progress || 0)
    );
  } else if (sortBy.value === "name") {
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }

  return filtered;
});

// Methods - Navigation
function goToHome() {
  router.push("/");
}

function selectGroup(groupId: string) {
  if (selectedGroupId.value === groupId) {
    selectedGroupId.value = null;
  } else {
    selectedGroupId.value = groupId;
  }
}

function getSkillsCountByGroup(groupId: string): number {
  return skills.value.filter((s) => s.groupId === groupId).length;
}

function openSkill(skillId: string) {
  selectedSkillId.value = skillId;
  showSkillDrawer.value = true;
}

function closeSkillDrawer() {
  showSkillDrawer.value = false;
  selectedSkillId.value = null;
}

// Methods - Skill CRUD
function openCreateSkillModal() {
  editingSkill.value = null;
  skillForm.value = {
    name: "",
    groupId: selectedGroupId.value,
    goalDescription: "",
    expectedHours: 10,
    githubLink: "",
  };
  tagsInput.value = "";
  showSkillModal.value = true;
}

function openEditSkillModal(skill: Skill) {
  editingSkill.value = skill;
  skillForm.value = {
    name: skill.name,
    groupId: skill.groupId || null,
    goalDescription: skill.goalDescription || "",
    expectedHours: skill.expectedHours,
    githubLink: skill.githubLink || "",
  };
  tagsInput.value = skill.tags.join(", ");
  showSkillModal.value = true;
}

function closeSkillModal() {
  showSkillModal.value = false;
  editingSkill.value = null;
}

async function saveSkill() {
  if (!skillForm.value.name || !skillForm.value.expectedHours) return;

  const tags = tagsInput.value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  try {
    if (editingSkill.value) {
      await skillsStore.updateSkill(editingSkill.value.id, {
        ...skillForm.value,
        tags,
      });
    } else {
      await skillsStore.createSkill({
        ...skillForm.value,
        tags,
      });
    }
    closeSkillModal();
  } catch (error) {
    console.error("Failed to save skill:", error);
  }
}

function confirmDeleteSkill(skillId: string) {
  const skill = skills.value.find((s) => s.id === skillId);
  if (!skill) return;

  deleteTarget.value = {
    type: "skill",
    id: skillId,
    name: skill.name,
  };
  showDeleteConfirm.value = true;
}

// Methods - Group CRUD
function openCreateGroupModal() {
  editingGroup.value = null;
  groupForm.value = {
    name: "",
    description: "",
  };
  showGroupModal.value = true;
}

function openEditGroupModal(group: SkillGroup) {
  editingGroup.value = group;
  groupForm.value = {
    name: group.name,
    description: group.description || "",
  };
  showGroupModal.value = true;
}

function closeGroupModal() {
  showGroupModal.value = false;
  editingGroup.value = null;
}

async function saveGroup() {
  if (!groupForm.value.name) return;

  try {
    if (editingGroup.value) {
      // TODO: Implement update group in store
      console.log("Update group:", editingGroup.value.id, groupForm.value);
    } else {
      // TODO: Implement create group in store
      console.log("Create group:", groupForm.value);
    }
    closeGroupModal();
  } catch (error) {
    console.error("Failed to save group:", error);
  }
}

// Methods - Context Menu
function showGroupContextMenu(group: SkillGroup, event: MouseEvent) {
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    group,
  };

  const closeMenu = () => {
    contextMenu.value.show = false;
    document.removeEventListener("click", closeMenu);
  };
  setTimeout(() => document.addEventListener("click", closeMenu), 0);
}

function editContextGroup() {
  if (contextMenu.value.group) {
    openEditGroupModal(contextMenu.value.group);
  }
  contextMenu.value.show = false;
}

function deleteContextGroup() {
  if (contextMenu.value.group) {
    deleteTarget.value = {
      type: "group",
      id: contextMenu.value.group.id,
      name: contextMenu.value.group.name,
    };
    showDeleteConfirm.value = true;
  }
  contextMenu.value.show = false;
}

// Methods - Delete Confirmation
function closeDeleteConfirm() {
  showDeleteConfirm.value = false;
}

async function executeDelete() {
  try {
    if (deleteTarget.value.type === "skill") {
      await skillsStore.deleteSkill(deleteTarget.value.id);
    } else {
      // TODO: Implement delete group in store
      console.log("Delete group:", deleteTarget.value.id);
    }
    closeDeleteConfirm();
  } catch (error) {
    console.error("Failed to delete:", error);
  }
}

// Lifecycle
onMounted(async () => {
  try {
    await Promise.all([skillsStore.fetchGroups(), skillsStore.fetchSkills()]);
  } catch (error) {
    console.error("Failed to load skills data:", error);
  }
});
</script>

<style scoped>
.skills-page {
  min-height: 100vh;
  width: 100%;
  background: #12131f;
  padding: 24px;
}

.skills-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.back-to-home-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 8px;
  color: #1767fd;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  width: fit-content;
}

.back-to-home-btn:hover {
  background: rgba(23, 103, 253, 0.15);
  border-color: rgba(23, 103, 253, 0.5);
  transform: translateX(-4px);
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.title-icon {
  font-size: 28px;
}

.page-subtitle {
  font-size: 15px;
  color: #b7c9d1;
  margin: 0;
}

.skills-layout {
  display: grid;
  grid-template-columns: 240px 1fr 320px;
  gap: 24px;
}

/* Groups Sidebar */
.groups-sidebar {
  background: rgba(23, 103, 253, 0.06);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 16px;
  padding: 20px;
  height: fit-content;
  position: sticky;
  top: 24px;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #b7c9d1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid transparent;
}

.group-item:hover {
  background: rgba(23, 103, 253, 0.1);
  border-color: rgba(23, 103, 253, 0.3);
}

.group-item.active {
  background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.15),
    rgba(110, 74, 255, 0.15)
  );
  border-color: rgba(23, 103, 253, 0.4);
}

.group-name {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
}

.group-count {
  font-size: 12px;
  color: #1767fd;
  font-weight: 600;
  padding: 2px 8px;
  background: rgba(23, 103, 253, 0.15);
  border-radius: 6px;
}

/* Skills Main */
.skills-main {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.skills-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 12px;
  padding: 12px 16px;
  color: #b7c9d1;
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #fff;
  font-size: 14px;
}

.select-filter {
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 12px;
  padding: 12px 16px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  outline: none;
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

/* Inspector Panel */
.inspector-panel {
  background: rgba(23, 103, 253, 0.06);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 16px;
  padding: 20px;
  height: fit-content;
  position: sticky;
  top: 24px;
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(23, 103, 253, 0.2);
}

.inspector-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.inspector-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: 12px;
  color: #b7c9d1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1767fd, #6e4aff);
  border-radius: 4px;
  transition: width 0.3s;
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #b7c9d1;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 8px;
  color: #1767fd;
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s;
}

.link-item:hover {
  background: rgba(23, 103, 253, 0.1);
  border-color: rgba(23, 103, 253, 0.4);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  padding: 6px 12px;
  background: rgba(23, 103, 253, 0.15);
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 6px;
  font-size: 12px;
  color: #1767fd;
  font-weight: 500;
}

/* Buttons */
.btn-primary,
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  outline: none;
}

.btn-primary {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  color: #fff;
  box-shadow: 0 4px 12px rgba(23, 103, 253, 0.3);
}

.btn-primary:hover {
  box-shadow: 0 6px 20px rgba(23, 103, 253, 0.5);
  transform: translateY(-2px);
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

.btn-icon {
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

.btn-icon:hover {
  background: rgba(23, 103, 253, 0.1);
  border-color: rgba(23, 103, 253, 0.4);
}

.w-full {
  width: 100%;
  justify-content: center;
}

/* States */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #b7c9d1;
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

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
  margin-bottom: 20px;
}

@media (max-width: 1400px) {
  .skills-layout {
    grid-template-columns: 240px 1fr;
  }

  .inspector-panel {
    display: none;
  }
}

@media (max-width: 900px) {
  .skills-layout {
    grid-template-columns: 1fr;
  }

  .groups-sidebar {
    position: static;
  }

  .skills-grid {
    grid-template-columns: 1fr;
  }
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 768px) {
  .skills-page {
    padding: 16px 12px;
  }

  .skills-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 20px;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .btn-primary {
    width: 100%;
    justify-content: center;
  }

  .page-title {
    font-size: 24px;
  }

  .groups-sidebar {
    padding: 14px;
  }

  .groups-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
  }

  .group-item {
    padding: 8px 12px;
    flex: 0 0 auto;
  }

  .skills-toolbar {
    flex-direction: column;
    gap: 10px;
  }

  .search-box {
    width: 100%;
  }

  .select-filter {
    width: 100%;
  }

  .skills-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  /* Modals */
  .modal-card {
    max-width: 92vw;
    padding: 24px 18px;
  }

  .modal-card.small {
    max-width: 92vw;
  }

  .form-input,
  .form-textarea,
  .form-select {
    font-size: 16px; /* prevents iOS zoom */
  }

  .modal-actions {
    flex-direction: column;
    gap: 8px;
  }

  .modal-actions .btn-primary,
  .modal-actions .btn-secondary,
  .modal-actions .btn-danger {
    width: 100%;
    justify-content: center;
  }

  .context-menu {
    position: fixed;
    left: 50% !important;
    transform: translateX(-50%);
    bottom: 20px;
    top: auto !important;
    min-width: 200px;
  }
}
</style>
