<template>
  <div class="skill-tree-page">
    <!-- Pixel stars background -->
    <div class="stars-bg">
      <div v-for="i in 60" :key="i" class="star" :style="randomStarStyle(i)" />
    </div>

    <!-- Top Bar: Character + XP -->
    <header class="rpg-header">
      <button class="back-btn pixel-btn" @click="$router.push('/')">
        <span class="pixel-arrow">◄</span> Назад
      </button>

      <div class="character-bar">
        <div class="char-avatar" @click="showCharacterModal = true">
          <div class="avatar-frame">
            <span class="avatar-icon">{{ character?.name?.[0] || '?' }}</span>
          </div>
        </div>
        <div class="char-info">
          <div class="char-name">{{ character?.name || 'Герой' }}</div>
          <div class="char-title">{{ character?.title || 'Начинающий' }}</div>
        </div>
        <div class="level-badge">
          <span class="level-label">LVL</span>
          <span class="level-number">{{ character?.level || 1 }}</span>
        </div>
        <div class="xp-bar-container">
          <div class="xp-bar">
            <div class="xp-fill" :style="{ width: xpPercent + '%' }" />
          </div>
          <div class="xp-text">{{ character?.currentXp || 0 }} / {{ character?.nextLvlXp || 100 }} XP</div>
        </div>
        <div class="total-xp">
          <span class="xp-icon">★</span>
          {{ character?.totalXp || 0 }} XP
        </div>
      </div>

      <div class="header-actions">
        <button class="pixel-btn action-btn" @click="showImportExport = true" title="Import/Export JSON">
          ⇅ JSON
        </button>
        <button class="pixel-btn action-btn add-btn" @click="showAddCategoryModal = true">
          + Категория
        </button>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="loading-screen">
      <div class="loading-spinner" />
      <p>Загрузка дерева навыков...</p>
    </div>

    <!-- Main Skill Map -->
    <main v-else class="skill-map">
      <!-- No categories placeholder -->
      <div v-if="categories.length === 0" class="empty-state">
        <div class="empty-icon">🗺️</div>
        <h2>Карта навыков пуста</h2>
        <p>Создайте первую категорию, чтобы начать свой путь</p>
        <button class="pixel-btn add-btn" @click="showAddCategoryModal = true">
          + Создать категорию
        </button>
      </div>

      <!-- Category constellation map -->
      <div v-else class="constellation-grid">
        <div
          v-for="(cat, index) in categories"
          :key="cat.id"
          class="category-node"
          :class="{ 'has-skills': cat.skillCount > 0 }"
          :style="getCategoryStyle(index)"
          @click="openCategory(cat)"
          @contextmenu.prevent="categoryContextMenu(cat, $event)"
        >
          <div class="cat-glow" :style="{ background: cat.color || '#6e4aff' }" />
          <div class="cat-icon-wrap">
            <span class="cat-icon">{{ cat.icon || '⬡' }}</span>
          </div>
          <div class="cat-label">{{ cat.name }}</div>
          <div class="cat-progress-ring">
            <svg viewBox="0 0 36 36" class="circular-chart">
              <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path class="circle" :stroke="cat.color || '#6e4aff'" :stroke-dasharray="`${cat.progress || 0}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
          </div>
          <div class="cat-stats">
            <span>{{ cat.skillCount }} навыков</span>
          </div>
        </div>
      </div>
    </main>

    <!-- Category Detail Drawer -->
    <Teleport to="body">
      <div v-if="showCategoryDetail" class="rpg-drawer-backdrop" @click.self="closeCategoryDetail">
        <div class="rpg-drawer">
          <div class="drawer-header" :style="{ borderColor: activeCategory?.color || '#6e4aff' }">
            <div class="drawer-title-row">
              <span class="drawer-icon">{{ activeCategory?.icon || '⬡' }}</span>
              <h2>{{ activeCategory?.name }}</h2>
              <div class="drawer-actions">
                <button class="pixel-btn-sm" @click="editCategory(activeCategory!)">✎</button>
                <button class="pixel-btn-sm danger" @click="confirmDeleteCategory(activeCategory!)">✕</button>
              </div>
            </div>
            <p v-if="activeCategory?.description" class="drawer-desc">{{ activeCategory.description }}</p>
            <div class="drawer-xp">
              <div class="xp-bar small">
                <div class="xp-fill" :style="{ width: (activeCategory?.progress || 0) + '%', background: activeCategory?.color || '#6e4aff' }" />
              </div>
              <span>{{ activeCategory?.earnedXp || 0 }} / {{ activeCategory?.totalXp || 0 }} XP</span>
            </div>
          </div>

          <div class="drawer-body">
            <button class="pixel-btn add-btn full-width" @click="showAddNodeModal = true">
              + Добавить навык
            </button>

            <div class="skill-nodes-list">
              <div
                v-for="node in activeCategory?.skills || []"
                :key="node.id"
                class="skill-node-card"
                :class="{ completed: node.isCompleted }"
                @click="openSkillNode(node)"
              >
                <div class="node-header">
                  <span class="node-icon">{{ node.icon || '◆' }}</span>
                  <div class="node-info">
                    <h3>{{ node.name }}</h3>
                    <span class="node-levels">{{ node.levelCount }} уровней</span>
                  </div>
                  <div class="node-status">
                    <span v-if="node.isCompleted" class="status-badge completed">✓ Завершено</span>
                    <span v-else class="status-badge in-progress">{{ Math.round(node.progress || 0) }}%</span>
                  </div>
                </div>
                <div class="node-xp-bar">
                  <div class="xp-bar small">
                    <div class="xp-fill" :style="{ width: (node.progress || 0) + '%', background: node.color || activeCategory?.color || '#6e4aff' }" />
                  </div>
                  <span class="node-xp-text">{{ node.earnedXp }} / {{ node.totalXp }} XP</span>
                </div>
              </div>
            </div>
          </div>

          <button class="drawer-close pixel-btn" @click="closeCategoryDetail">Закрыть</button>
        </div>
      </div>
    </Teleport>

    <!-- Skill Node Detail Modal -->
    <Teleport to="body">
      <div v-if="showNodeDetail" class="rpg-modal-backdrop" @click.self="closeNodeDetail">
        <div class="rpg-modal skill-node-modal">
          <div class="modal-header">
            <div class="modal-title-row">
              <span class="modal-icon">{{ activeNodeData?.icon || '◆' }}</span>
              <h2>{{ activeNodeData?.name }}</h2>
              <div class="modal-actions">
                <button class="pixel-btn-sm" @click="editNode(activeNodeData!)">✎</button>
                <button class="pixel-btn-sm danger" @click="confirmDeleteNode(activeNodeData!)">✕</button>
              </div>
            </div>
            <p v-if="activeNodeData?.description">{{ activeNodeData.description }}</p>
          </div>

          <div class="modal-body">
            <button class="pixel-btn add-btn full-width" @click="showAddLevelModal = true">
              + Добавить уровень
            </button>

            <!-- Levels as a vertical skill tree -->
            <div class="levels-tree">
              <div
                v-for="(level, idx) in activeNodeData?.levels || []"
                :key="level.id"
                class="level-card"
                :class="{ completed: level.isCompleted, locked: level.isLocked, active: !level.isLocked && !level.isCompleted }"
              >
                <div class="level-connector" v-if="idx > 0">
                  <div class="connector-line" :class="{ active: !level.isLocked }" />
                </div>

                <div class="level-content" @click="!level.isLocked && openLevel(level)">
                  <div class="level-badge-wrap">
                    <div class="level-num">{{ level.levelNumber }}</div>
                  </div>
                  <div class="level-info">
                    <h3>{{ level.name }}</h3>
                    <div class="level-stats">
                      <span>{{ level.completedCount }}/{{ level.subSkillCount }} тем</span>
                      <span v-if="level.isCompleted" class="exam-badge passed">✓ Экзамен сдан</span>
                      <span v-else-if="level.examTitle" class="exam-badge pending">📝 {{ level.examTitle }}</span>
                    </div>
                    <div class="xp-bar tiny">
                      <div class="xp-fill" :style="{ width: (level.progress || 0) + '%' }" />
                    </div>
                  </div>
                  <div class="level-xp">+{{ level.totalXp }} XP</div>
                  <div class="level-actions">
                    <button class="pixel-btn-sm" @click.stop="editLevel(level)">✎</button>
                    <button class="pixel-btn-sm danger" @click.stop="confirmDeleteLevel(level)">✕</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button class="rpg-modal-close pixel-btn" @click="closeNodeDetail">Закрыть</button>
        </div>
      </div>
    </Teleport>

    <!-- Level Detail Modal (Sub-skills + Exam) -->
    <Teleport to="body">
      <div v-if="showLevelDetail" class="rpg-modal-backdrop" @click.self="closeLevelDetail">
        <div class="rpg-modal level-detail-modal">
          <div class="modal-header">
            <h2>{{ activeLevelData?.name }}</h2>
            <p v-if="activeLevelData?.description">{{ activeLevelData.description }}</p>
            <div class="level-progress-info">
              <div class="xp-bar">
                <div class="xp-fill" :style="{ width: (activeLevelData?.progress || 0) + '%' }" />
              </div>
              <span>{{ activeLevelData?.earnedXp || 0 }} / {{ activeLevelData?.totalXp || 0 }} XP</span>
            </div>
          </div>

          <div class="modal-body">
            <button class="pixel-btn add-btn full-width" @click="showAddSubSkillModal = true">
              + Добавить тему
            </button>

            <!-- Sub-skills grid -->
            <div class="sub-skills-grid">
              <div
                v-for="sub in activeLevelData?.subSkills || []"
                :key="sub.id"
                class="sub-skill-card"
                :class="{ completed: sub.isCompleted }"
              >
                <div class="sub-skill-check" @click="toggleSubSkill(sub)">
                  <span v-if="sub.isCompleted" class="check-mark">✓</span>
                  <span v-else class="check-empty">○</span>
                </div>
                <div class="sub-skill-info">
                  <h4>{{ sub.title }}</h4>
                  <p v-if="sub.description">{{ sub.description }}</p>
                </div>
                <div class="sub-skill-xp">+{{ sub.xpValue }} XP</div>
                <div class="sub-skill-actions">
                  <button class="pixel-btn-sm" @click="editSubSkill(sub)">✎</button>
                  <button class="pixel-btn-sm danger" @click="confirmDeleteSubSkill(sub)">✕</button>
                </div>
              </div>
            </div>

            <!-- Exam section -->
            <div v-if="activeLevelData?.examTitle" class="exam-section" :class="{ passed: activeLevelData.examPassed }">
              <div class="exam-header">
                <span class="exam-icon">📜</span>
                <h3>Экзамен: {{ activeLevelData.examTitle }}</h3>
              </div>
              <p v-if="activeLevelData.examDescription">{{ activeLevelData.examDescription }}</p>
              <div class="exam-bonus">Бонус: +{{ activeLevelData.completionBonusXp }} XP</div>
              <button
                v-if="!activeLevelData.examPassed"
                class="pixel-btn exam-btn"
                :disabled="!allSubSkillsCompleted"
                @click="handlePassExam"
              >
                {{ allSubSkillsCompleted ? '🏆 Сдать экзамен' : '🔒 Завершите все темы' }}
              </button>
              <div v-else class="exam-passed-badge">
                <span>🏆 Экзамен сдан!</span>
                <button class="pixel-btn-sm" @click="handleUnpassExam">Отменить</button>
              </div>
            </div>
          </div>

          <button class="rpg-modal-close pixel-btn" @click="closeLevelDetail">Закрыть</button>
        </div>
      </div>
    </Teleport>

    <!-- Add/Edit Category Modal -->
    <Teleport to="body">
      <div v-if="showAddCategoryModal" class="rpg-modal-backdrop" @click.self="showAddCategoryModal = false">
        <div class="rpg-modal form-modal">
          <h2>{{ editingCategory ? 'Редактировать' : 'Новая' }} категория</h2>
          <div class="form-group">
            <label>Название</label>
            <input v-model="categoryForm.name" class="rpg-input" placeholder="Backend, ML, DevOps..." />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="categoryForm.description" class="rpg-input" rows="2" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Иконка</label>
              <input v-model="categoryForm.icon" class="rpg-input" placeholder="⚔️" />
            </div>
            <div class="form-group">
              <label>Цвет</label>
              <input v-model="categoryForm.color" type="color" class="rpg-color-input" />
            </div>
            <div class="form-group">
              <label>Порядок</label>
              <input v-model.number="categoryForm.sortOrder" type="number" class="rpg-input" />
            </div>
          </div>
          <div class="form-actions">
            <button class="pixel-btn" @click="showAddCategoryModal = false">Отмена</button>
            <button class="pixel-btn add-btn" @click="saveCategory">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add/Edit Skill Node Modal -->
    <Teleport to="body">
      <div v-if="showAddNodeModal" class="rpg-modal-backdrop" @click.self="showAddNodeModal = false">
        <div class="rpg-modal form-modal">
          <h2>{{ editingNode ? 'Редактировать' : 'Новый' }} навык</h2>
          <div class="form-group">
            <label>Название</label>
            <input v-model="nodeForm.name" class="rpg-input" placeholder="PostgreSQL, Docker, Python..." />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="nodeForm.description" class="rpg-input" rows="2" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Иконка</label>
              <input v-model="nodeForm.icon" class="rpg-input" placeholder="🐘" />
            </div>
            <div class="form-group">
              <label>Цвет</label>
              <input v-model="nodeForm.color" type="color" class="rpg-color-input" />
            </div>
            <div class="form-group">
              <label>Бонус XP</label>
              <input v-model.number="nodeForm.completionBonusXp" type="number" class="rpg-input" />
            </div>
          </div>
          <div class="form-actions">
            <button class="pixel-btn" @click="showAddNodeModal = false">Отмена</button>
            <button class="pixel-btn add-btn" @click="saveNode">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add/Edit Level Modal -->
    <Teleport to="body">
      <div v-if="showAddLevelModal" class="rpg-modal-backdrop" @click.self="showAddLevelModal = false">
        <div class="rpg-modal form-modal">
          <h2>{{ editingLevel ? 'Редактировать' : 'Новый' }} уровень</h2>
          <div class="form-group">
            <label>Название</label>
            <input v-model="levelForm.name" class="rpg-input" placeholder="DBA Level 1..." />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="levelForm.description" class="rpg-input" rows="2" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>№ уровня</label>
              <input v-model.number="levelForm.levelNumber" type="number" class="rpg-input" />
            </div>
            <div class="form-group">
              <label>XP за тему</label>
              <input v-model.number="levelForm.xpPerSubSkill" type="number" class="rpg-input" />
            </div>
            <div class="form-group">
              <label>Бонус XP</label>
              <input v-model.number="levelForm.completionBonusXp" type="number" class="rpg-input" />
            </div>
          </div>
          <div class="form-group">
            <label>Название экзамена</label>
            <input v-model="levelForm.examTitle" class="rpg-input" placeholder="Финальный экзамен" />
          </div>
          <div class="form-group">
            <label>Описание экзамена</label>
            <textarea v-model="levelForm.examDescription" class="rpg-input" rows="2" />
          </div>
          <div class="form-actions">
            <button class="pixel-btn" @click="showAddLevelModal = false">Отмена</button>
            <button class="pixel-btn add-btn" @click="saveLevel">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add/Edit SubSkill Modal -->
    <Teleport to="body">
      <div v-if="showAddSubSkillModal" class="rpg-modal-backdrop" @click.self="showAddSubSkillModal = false">
        <div class="rpg-modal form-modal">
          <h2>{{ editingSubSkill ? 'Редактировать' : 'Новая' }} тема</h2>
          <div class="form-group">
            <label>Название</label>
            <input v-model="subSkillForm.title" class="rpg-input" placeholder="Резервное копирование..." />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="subSkillForm.description" class="rpg-input" rows="2" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>XP</label>
              <input v-model.number="subSkillForm.xpValue" type="number" class="rpg-input" />
            </div>
            <div class="form-group">
              <label>Порядок</label>
              <input v-model.number="subSkillForm.sortOrder" type="number" class="rpg-input" />
            </div>
          </div>
          <div class="form-actions">
            <button class="pixel-btn" @click="showAddSubSkillModal = false">Отмена</button>
            <button class="pixel-btn add-btn" @click="saveSubSkill">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Character Edit Modal -->
    <Teleport to="body">
      <div v-if="showCharacterModal" class="rpg-modal-backdrop" @click.self="showCharacterModal = false">
        <div class="rpg-modal form-modal">
          <h2>Профиль персонажа</h2>
          <div class="form-group">
            <label>Имя</label>
            <input v-model="charForm.name" class="rpg-input" />
          </div>
          <div class="form-group">
            <label>Титул</label>
            <input v-model="charForm.title" class="rpg-input" placeholder="Backend Warrior..." />
          </div>
          <div class="form-actions">
            <button class="pixel-btn" @click="showCharacterModal = false">Отмена</button>
            <button class="pixel-btn add-btn" @click="saveCharacter">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Import/Export Modal -->
    <Teleport to="body">
      <div v-if="showImportExport" class="rpg-modal-backdrop" @click.self="showImportExport = false">
        <div class="rpg-modal form-modal import-export-modal">
          <h2>⇅ Импорт / Экспорт</h2>
          <p class="ie-hint">Экспортируйте дерево навыков в JSON, чтобы передать нейросети для генерации новых навыков. Затем импортируйте результат обратно.</p>
          <div class="ie-actions">
            <button class="pixel-btn add-btn" @click="handleExport">📤 Экспорт JSON</button>
            <label class="pixel-btn import-btn">
              📥 Импорт JSON
              <input type="file" accept=".json" hidden @change="handleImport" />
            </label>
          </div>
          <div v-if="importStatus" class="import-status" :class="importStatusType">
            {{ importStatus }}
          </div>
          <button class="pixel-btn" @click="showImportExport = false">Закрыть</button>
        </div>
      </div>
    </Teleport>

    <!-- Context menu -->
    <Teleport to="body">
      <div v-if="contextMenu.show" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click="contextMenu.show = false">
        <button @click="editCategory(contextMenu.category!)">✎ Редактировать</button>
        <button class="danger" @click="confirmDeleteCategory(contextMenu.category!)">✕ Удалить</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from "vue";
import { useSkillTreeStore } from "@/stores/skillTree";
import * as api from "@/api/skillTree";
import type { SkillCategory, SkillNode, SkillLevel, SubSkill, SkillTreeExport } from "@/types/skillTree";

const store = useSkillTreeStore();

// State
const character = computed(() => store.character);
const categories = computed(() => store.categories);
const loading = computed(() => store.loading);

const showCategoryDetail = ref(false);
const showNodeDetail = ref(false);
const showLevelDetail = ref(false);
const showAddCategoryModal = ref(false);
const showAddNodeModal = ref(false);
const showAddLevelModal = ref(false);
const showAddSubSkillModal = ref(false);
const showCharacterModal = ref(false);
const showImportExport = ref(false);

const activeCategory = computed(() => store.activeCategory);
const activeNodeData = computed(() => store.activeNode);
const activeLevelData = computed(() => store.activeLevel);

const editingCategory = ref<SkillCategory | null>(null);
const editingNode = ref<SkillNode | null>(null);
const editingLevel = ref<SkillLevel | null>(null);
const editingSubSkill = ref<SubSkill | null>(null);

const importStatus = ref("");
const importStatusType = ref<"success" | "error">("success");

// Forms
const categoryForm = reactive({ name: "", description: "", icon: "", color: "#6e4aff", sortOrder: 0 });
const nodeForm = reactive({ name: "", description: "", icon: "", color: "#6e4aff", completionBonusXp: 50 });
const levelForm = reactive({ name: "", description: "", levelNumber: 1, xpPerSubSkill: 10, completionBonusXp: 25, examTitle: "", examDescription: "" });
const subSkillForm = reactive({ title: "", description: "", xpValue: 10, sortOrder: 0 });
const charForm = reactive({ name: "", title: "" });

const contextMenu = reactive({ show: false, x: 0, y: 0, category: null as SkillCategory | null });

// Computed
const xpPercent = computed(() => {
  if (!character.value) return 0;
  if (character.value.nextLvlXp === 0) return 100;
  return Math.min(100, (character.value.currentXp / character.value.nextLvlXp) * 100);
});

const allSubSkillsCompleted = computed(() => {
  const subs = activeLevelData.value?.subSkills || [];
  return subs.length > 0 && subs.every((s) => s.isCompleted);
});

// Init
onMounted(async () => {
  await Promise.all([store.fetchCharacter(), store.fetchCategories()]);
});

// Background star animation
function randomStarStyle(i: number) {
  const x = ((i * 37 + 13) % 100);
  const y = ((i * 53 + 7) % 100);
  const size = 1 + (i % 3);
  const delay = (i * 0.3) % 5;
  const opacity = 0.3 + (i % 5) * 0.15;
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${size}px`,
    height: `${size}px`,
    animationDelay: `${delay}s`,
    opacity,
  };
}

// Category positioning on map (circular layout)
function getCategoryStyle(index: number) {
  const total = categories.value.length;
  if (total <= 1) return {};
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const radius = Math.min(35, 20 + total * 3);
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return {
    left: `${x}%`,
    top: `${y}%`,
  };
}

// Category actions
function openCategory(cat: SkillCategory) {
  store.fetchCategory(cat.id);
  showCategoryDetail.value = true;
}

function closeCategoryDetail() {
  showCategoryDetail.value = false;
}

function categoryContextMenu(cat: SkillCategory, e: MouseEvent) {
  contextMenu.show = true;
  contextMenu.x = e.clientX;
  contextMenu.y = e.clientY;
  contextMenu.category = cat;
}

function editCategory(cat: SkillCategory) {
  editingCategory.value = cat;
  categoryForm.name = cat.name;
  categoryForm.description = cat.description;
  categoryForm.icon = cat.icon;
  categoryForm.color = cat.color || "#6e4aff";
  categoryForm.sortOrder = cat.sortOrder;
  showAddCategoryModal.value = true;
}

async function saveCategory() {
  if (!categoryForm.name) return;
  if (editingCategory.value) {
    await store.updateCategory(editingCategory.value.id, { ...categoryForm });
    editingCategory.value = null;
  } else {
    await store.createCategory({ ...categoryForm });
  }
  showAddCategoryModal.value = false;
  resetCategoryForm();
}

async function confirmDeleteCategory(cat: SkillCategory) {
  if (confirm(`Удалить категорию "${cat.name}" и все навыки в ней?`)) {
    await store.deleteCategory(cat.id);
    showCategoryDetail.value = false;
  }
}

function resetCategoryForm() {
  categoryForm.name = "";
  categoryForm.description = "";
  categoryForm.icon = "";
  categoryForm.color = "#6e4aff";
  categoryForm.sortOrder = 0;
  editingCategory.value = null;
}

// Skill Node actions
function openSkillNode(node: SkillNode) {
  store.fetchSkillNode(node.id);
  showNodeDetail.value = true;
}

function closeNodeDetail() {
  showNodeDetail.value = false;
}

function editNode(node: SkillNode) {
  editingNode.value = node;
  nodeForm.name = node.name;
  nodeForm.description = node.description;
  nodeForm.icon = node.icon;
  nodeForm.color = node.color || "#6e4aff";
  nodeForm.completionBonusXp = node.completionBonusXp;
  showAddNodeModal.value = true;
}

async function saveNode() {
  if (!nodeForm.name) return;
  if (editingNode.value) {
    await store.updateSkillNode(editingNode.value.id, { ...nodeForm });
    editingNode.value = null;
  } else {
    await store.createSkillNode({
      categoryId: activeCategory.value!.id,
      ...nodeForm,
    });
  }
  showAddNodeModal.value = false;
  nodeForm.name = "";
  nodeForm.description = "";
  nodeForm.icon = "";
  nodeForm.color = "#6e4aff";
  nodeForm.completionBonusXp = 50;
}

async function confirmDeleteNode(node: SkillNode) {
  if (confirm(`Удалить навык "${node.name}"?`)) {
    await store.deleteSkillNode(node.id);
    showNodeDetail.value = false;
  }
}

// Level actions
function openLevel(level: SkillLevel) {
  store.fetchSkillLevel(level.id);
  showLevelDetail.value = true;
}

function closeLevelDetail() {
  showLevelDetail.value = false;
}

function editLevel(level: SkillLevel) {
  editingLevel.value = level;
  levelForm.name = level.name;
  levelForm.description = level.description;
  levelForm.levelNumber = level.levelNumber;
  levelForm.xpPerSubSkill = level.xpPerSubSkill;
  levelForm.completionBonusXp = level.completionBonusXp;
  levelForm.examTitle = level.examTitle;
  levelForm.examDescription = level.examDescription;
  showAddLevelModal.value = true;
}

async function saveLevel() {
  if (!levelForm.name) return;
  if (editingLevel.value) {
    await store.updateSkillLevel(editingLevel.value.id, { ...levelForm });
    editingLevel.value = null;
  } else {
    await store.createSkillLevel({
      skillNodeId: activeNodeData.value!.id,
      ...levelForm,
    });
  }
  showAddLevelModal.value = false;
  levelForm.name = "";
  levelForm.description = "";
  levelForm.levelNumber = 1;
  levelForm.xpPerSubSkill = 10;
  levelForm.completionBonusXp = 25;
  levelForm.examTitle = "";
  levelForm.examDescription = "";
}

async function confirmDeleteLevel(level: SkillLevel) {
  if (confirm(`Удалить уровень "${level.name}"?`)) {
    await store.deleteSkillLevel(level.id);
  }
}

// Sub-skill actions
function editSubSkill(sub: SubSkill) {
  editingSubSkill.value = sub;
  subSkillForm.title = sub.title;
  subSkillForm.description = sub.description;
  subSkillForm.xpValue = sub.xpValue;
  subSkillForm.sortOrder = sub.sortOrder;
  showAddSubSkillModal.value = true;
}

async function saveSubSkill() {
  if (!subSkillForm.title) return;
  if (editingSubSkill.value) {
    await store.updateSubSkill(editingSubSkill.value.id, { ...subSkillForm });
    editingSubSkill.value = null;
  } else {
    await store.createSubSkill({
      skillLevelId: activeLevelData.value!.id,
      ...subSkillForm,
    });
  }
  showAddSubSkillModal.value = false;
  subSkillForm.title = "";
  subSkillForm.description = "";
  subSkillForm.xpValue = 10;
  subSkillForm.sortOrder = 0;
}

async function confirmDeleteSubSkill(sub: SubSkill) {
  if (confirm(`Удалить тему "${sub.title}"?`)) {
    await store.deleteSubSkill(sub.id);
  }
}

async function toggleSubSkill(sub: SubSkill) {
  if (sub.isCompleted) {
    await store.uncompleteSubSkill(sub.id);
  } else {
    await store.completeSubSkill(sub.id);
  }
}

// Exam
async function handlePassExam() {
  if (activeLevelData.value) {
    await store.passExam(activeLevelData.value.id);
    await store.fetchSkillLevel(activeLevelData.value.id);
  }
}

async function handleUnpassExam() {
  if (activeLevelData.value) {
    await store.unpassExam(activeLevelData.value.id);
    await store.fetchSkillLevel(activeLevelData.value.id);
  }
}

// Character
async function saveCharacter() {
  await api.updateCharacter({ name: charForm.name, title: charForm.title });
  await store.fetchCharacter();
  showCharacterModal.value = false;
}

watch(showCharacterModal, (v) => {
  if (v && character.value) {
    charForm.name = character.value.name;
    charForm.title = character.value.title;
  }
});

// Export/Import
async function handleExport() {
  try {
    const data = await store.exportTree();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skill-tree-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    importStatus.value = "Экспорт завершён!";
    importStatusType.value = "success";
  } catch {
    importStatus.value = "Ошибка экспорта";
    importStatusType.value = "error";
  }
}

async function handleImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data: SkillTreeExport = JSON.parse(text);
    await store.importTree(data);
    importStatus.value = "Импорт завершён!";
    importStatusType.value = "success";
  } catch {
    importStatus.value = "Ошибка импорта. Проверьте формат JSON.";
    importStatusType.value = "error";
  }
  input.value = "";
}

// Close context menu on click outside
document.addEventListener("click", () => {
  contextMenu.show = false;
});

// Watch for form modal closes to reset editing state
watch(showAddCategoryModal, (v) => { if (!v) editingCategory.value = null; });
watch(showAddNodeModal, (v) => { if (!v) editingNode.value = null; });
watch(showAddLevelModal, (v) => { if (!v) editingLevel.value = null; });
watch(showAddSubSkillModal, (v) => { if (!v) editingSubSkill.value = null; });
</script>

<style scoped>
/* ============================================
   RPG SKILL TREE — PIXEL/GAME STYLE
   ============================================ */

@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

.skill-tree-page {
  min-height: 100vh;
  background: #0a0a1a;
  color: #e0e0f0;
  font-family: 'Segoe UI', sans-serif;
  position: relative;
  overflow-x: hidden;
}

/* Stars background */
.stars-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.star {
  position: absolute;
  background: #fff;
  border-radius: 50%;
  animation: twinkle 3s ease-in-out infinite alternate;
}
@keyframes twinkle {
  0% { opacity: 0.2; transform: scale(1); }
  100% { opacity: 1; transform: scale(1.3); }
}

/* === HEADER === */
.rpg-header {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: linear-gradient(180deg, rgba(15, 15, 40, 0.95) 0%, rgba(10, 10, 26, 0.8) 100%);
  border-bottom: 2px solid #2a2a5a;
  flex-wrap: wrap;
}

.back-btn {
  font-size: 13px;
}

.pixel-arrow {
  font-size: 10px;
}

/* Pixel button style */
.pixel-btn {
  background: #1a1a3a;
  color: #c0c0e0;
  border: 2px solid #3a3a6a;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.pixel-btn:hover {
  background: #2a2a5a;
  border-color: #6e4aff;
  color: #fff;
  transform: translateY(-1px);
}
.pixel-btn.add-btn {
  background: #1a3a1a;
  border-color: #3a6a3a;
  color: #80ff80;
}
.pixel-btn.add-btn:hover {
  background: #2a5a2a;
  border-color: #4eff4e;
}

.pixel-btn-sm {
  background: transparent;
  border: 1px solid #3a3a6a;
  color: #8080b0;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.pixel-btn-sm:hover {
  color: #fff;
  border-color: #6e4aff;
}
.pixel-btn-sm.danger:hover {
  color: #ff4444;
  border-color: #ff4444;
}

.action-btn {
  font-size: 12px;
  padding: 6px 12px;
}

/* Character bar */
.character-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.char-avatar {
  cursor: pointer;
}
.avatar-frame {
  width: 48px;
  height: 48px;
  border: 2px solid #6e4aff;
  background: #1a1a3a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: border-color 0.2s;
}
.avatar-frame:hover {
  border-color: #a080ff;
}

.char-info {
  min-width: 0;
}
.char-name {
  font-size: 15px;
  font-weight: 700;
  color: #e0e0ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.char-title {
  font-size: 11px;
  color: #8080b0;
}

.level-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(135deg, #2a1a5a, #4a2a8a);
  border: 2px solid #6e4aff;
  padding: 4px 12px;
  min-width: 52px;
}
.level-label {
  font-size: 9px;
  color: #a080ff;
  letter-spacing: 2px;
  font-family: 'Press Start 2P', monospace;
}
.level-number {
  font-size: 22px;
  font-weight: 900;
  color: #e0d0ff;
  font-family: 'Press Start 2P', monospace;
  line-height: 1;
}

.xp-bar-container {
  min-width: 160px;
  max-width: 260px;
  flex: 1;
}
.xp-bar {
  height: 14px;
  background: #1a1a3a;
  border: 1px solid #3a3a6a;
  overflow: hidden;
  position: relative;
}
.xp-bar.small {
  height: 8px;
}
.xp-bar.tiny {
  height: 5px;
}
.xp-fill {
  height: 100%;
  background: linear-gradient(90deg, #6e4aff, #a080ff);
  transition: width 0.5s ease;
  position: relative;
}
.xp-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 60%);
}
.xp-text {
  font-size: 10px;
  color: #8080b0;
  margin-top: 2px;
  text-align: center;
}

.total-xp {
  font-size: 14px;
  color: #ffd700;
  font-weight: 700;
  white-space: nowrap;
}
.xp-icon {
  font-size: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* === LOADING === */
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  color: #6e4aff;
}
.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #1a1a3a;
  border-top: 4px solid #6e4aff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* === EMPTY STATE === */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  text-align: center;
}
.empty-icon {
  font-size: 72px;
  margin-bottom: 16px;
}
.empty-state h2 {
  font-size: 22px;
  margin-bottom: 8px;
  color: #c0c0e0;
}
.empty-state p {
  color: #6060a0;
  margin-bottom: 24px;
}

/* === SKILL MAP (CONSTELLATION) === */
.skill-map {
  position: relative;
  z-index: 5;
  min-height: calc(100vh - 90px);
  padding: 24px;
}

.constellation-grid {
  position: relative;
  width: 100%;
  height: calc(100vh - 120px);
  min-height: 500px;
}

.category-node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s;
  z-index: 5;
  width: 140px;
}
.category-node:hover {
  transform: translate(-50%, -50%) scale(1.1);
  z-index: 10;
}

.cat-glow {
  position: absolute;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  filter: blur(30px);
  opacity: 0.2;
  top: -10px;
  transition: opacity 0.3s;
}
.category-node:hover .cat-glow {
  opacity: 0.4;
}

.cat-icon-wrap {
  width: 72px;
  height: 72px;
  background: #0e0e2a;
  border: 2px solid #3a3a6a;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 2;
  transition: border-color 0.3s;
}
.category-node:hover .cat-icon-wrap {
  border-color: #6e4aff;
}
.cat-icon {
  font-size: 32px;
}
.cat-label {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  color: #c0c0e0;
  text-shadow: 0 0 10px rgba(0,0,0,0.8);
}
.cat-stats {
  font-size: 10px;
  color: #6060a0;
  margin-top: 2px;
}

.cat-progress-ring {
  position: absolute;
  top: -6px;
  width: 84px;
  height: 84px;
  z-index: 1;
}
.circular-chart {
  width: 100%;
  height: 100%;
}
.circle-bg {
  fill: none;
  stroke: #1a1a3a;
  stroke-width: 2;
}
.circle {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dasharray 0.5s ease;
}

/* === DRAWER (Category Detail) === */
.rpg-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}
.rpg-drawer {
  width: 480px;
  max-width: 90vw;
  height: 100vh;
  background: #0e0e2a;
  border-left: 2px solid #2a2a5a;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease;
}
@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.drawer-header {
  padding: 24px;
  border-bottom: 2px solid;
  border-color: #3a3a6a;
}
.drawer-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.drawer-icon {
  font-size: 28px;
}
.drawer-title-row h2 {
  flex: 1;
  font-size: 20px;
  color: #e0e0ff;
}
.drawer-actions {
  display: flex;
  gap: 6px;
}
.drawer-desc {
  margin-top: 8px;
  font-size: 13px;
  color: #8080b0;
}
.drawer-xp {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.drawer-xp .xp-bar {
  flex: 1;
}
.drawer-xp span {
  font-size: 11px;
  color: #ffd700;
  white-space: nowrap;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.full-width {
  width: 100%;
  margin-bottom: 16px;
}

.drawer-close {
  margin: 16px 24px;
}

/* Skill node cards */
.skill-nodes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skill-node-card {
  background: #12122e;
  border: 1px solid #2a2a5a;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.skill-node-card:hover {
  border-color: #6e4aff;
  background: #18183a;
}
.skill-node-card.completed {
  border-color: #3a6a3a;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.node-icon {
  font-size: 22px;
}
.node-info {
  flex: 1;
  min-width: 0;
}
.node-info h3 {
  font-size: 14px;
  color: #e0e0ff;
  margin: 0;
}
.node-levels {
  font-size: 11px;
  color: #6060a0;
}

.node-status .status-badge {
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid;
}
.status-badge.completed {
  color: #80ff80;
  border-color: #3a6a3a;
  background: rgba(58, 106, 58, 0.2);
}
.status-badge.in-progress {
  color: #a080ff;
  border-color: #3a3a6a;
}

.node-xp-bar {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.node-xp-bar .xp-bar {
  flex: 1;
}
.node-xp-text {
  font-size: 10px;
  color: #8080b0;
  white-space: nowrap;
}

/* === MODAL === */
.rpg-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.rpg-modal {
  background: #0e0e2a;
  border: 2px solid #2a2a5a;
  max-width: 640px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  animation: fadeInUp 0.2s ease;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.skill-node-modal,
.level-detail-modal {
  max-width: 700px;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid #2a2a5a;
}
.modal-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.modal-icon {
  font-size: 24px;
}
.modal-title-row h2 {
  flex: 1;
  font-size: 18px;
  color: #e0e0ff;
  margin: 0;
}
.modal-actions {
  display: flex;
  gap: 6px;
}
.modal-header p {
  font-size: 13px;
  color: #8080b0;
  margin-top: 6px;
}

.modal-body {
  padding: 16px 24px;
}

.rpg-modal-close {
  width: calc(100% - 48px);
  margin: 16px 24px;
}

/* === LEVELS TREE === */
.levels-tree {
  display: flex;
  flex-direction: column;
}

.level-card {
  position: relative;
}
.level-connector {
  display: flex;
  justify-content: center;
  height: 24px;
}
.connector-line {
  width: 2px;
  height: 100%;
  background: #2a2a5a;
}
.connector-line.active {
  background: #6e4aff;
}

.level-content {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #12122e;
  border: 1px solid #2a2a5a;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.level-content:hover {
  border-color: #6e4aff;
  background: #18183a;
}
.level-card.completed .level-content {
  border-color: #3a6a3a;
}
.level-card.locked .level-content {
  opacity: 0.5;
  cursor: not-allowed;
}

.level-badge-wrap {
  flex-shrink: 0;
}
.level-num {
  width: 36px;
  height: 36px;
  border: 2px solid #6e4aff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 900;
  color: #a080ff;
  font-family: 'Press Start 2P', monospace;
}
.level-card.completed .level-num {
  border-color: #3a6a3a;
  color: #80ff80;
  background: rgba(58, 106, 58, 0.2);
}
.level-card.locked .level-num {
  border-color: #333;
  color: #555;
}

.level-info {
  flex: 1;
  min-width: 0;
}
.level-info h3 {
  font-size: 14px;
  color: #e0e0ff;
  margin: 0;
}
.level-stats {
  font-size: 11px;
  color: #6060a0;
  display: flex;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.exam-badge {
  font-size: 10px;
  padding: 1px 6px;
  border: 1px solid;
}
.exam-badge.passed {
  color: #80ff80;
  border-color: #3a6a3a;
}
.exam-badge.pending {
  color: #ffd700;
  border-color: #665500;
}

.level-xp {
  font-size: 12px;
  color: #ffd700;
  white-space: nowrap;
}
.level-actions {
  display: flex;
  gap: 4px;
}

/* === SUB SKILLS === */
.sub-skills-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
.sub-skill-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #12122e;
  border: 1px solid #2a2a5a;
  padding: 10px 14px;
  transition: all 0.2s;
}
.sub-skill-card.completed {
  border-color: #3a6a3a;
  background: rgba(58, 106, 58, 0.08);
}

.sub-skill-check {
  cursor: pointer;
  font-size: 20px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #3a3a6a;
  transition: all 0.15s;
  flex-shrink: 0;
}
.sub-skill-check:hover {
  border-color: #6e4aff;
}
.check-mark {
  color: #80ff80;
}
.check-empty {
  color: #3a3a6a;
}

.sub-skill-info {
  flex: 1;
  min-width: 0;
}
.sub-skill-info h4 {
  font-size: 13px;
  color: #e0e0ff;
  margin: 0;
}
.sub-skill-info p {
  font-size: 11px;
  color: #6060a0;
  margin: 2px 0 0;
}

.sub-skill-xp {
  font-size: 12px;
  color: #ffd700;
  white-space: nowrap;
}
.sub-skill-actions {
  display: flex;
  gap: 4px;
}

/* === EXAM SECTION === */
.exam-section {
  margin-top: 20px;
  padding: 16px;
  background: #181838;
  border: 2px solid #4a3a0a;
}
.exam-section.passed {
  border-color: #3a6a3a;
}
.exam-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.exam-header h3 {
  margin: 0;
  font-size: 15px;
  color: #ffd700;
}
.exam-section p {
  font-size: 12px;
  color: #8080b0;
  margin: 8px 0;
}
.exam-bonus {
  font-size: 13px;
  color: #ffd700;
  margin-bottom: 12px;
}
.exam-btn {
  width: 100%;
  background: #3a3a0a;
  border-color: #6a6a1a;
  color: #ffd700;
  font-size: 14px;
  padding: 12px;
}
.exam-btn:hover:not(:disabled) {
  background: #5a5a1a;
}
.exam-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.exam-passed-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  color: #80ff80;
  padding: 8px 0;
}

.level-progress-info {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.level-progress-info .xp-bar {
  flex: 1;
}
.level-progress-info span {
  font-size: 11px;
  color: #ffd700;
  white-space: nowrap;
}

/* === FORM MODALS === */
.form-modal {
  padding: 24px;
}
.form-modal h2 {
  margin: 0 0 20px;
  font-size: 18px;
  color: #e0e0ff;
}
.form-group {
  margin-bottom: 14px;
}
.form-group label {
  display: block;
  font-size: 12px;
  color: #8080b0;
  margin-bottom: 4px;
}
.rpg-input {
  width: 100%;
  background: #12122e;
  border: 1px solid #3a3a6a;
  color: #e0e0ff;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.rpg-input:focus {
  border-color: #6e4aff;
  outline: none;
}
textarea.rpg-input {
  resize: vertical;
  min-height: 60px;
}
.rpg-color-input {
  width: 48px;
  height: 38px;
  border: 1px solid #3a3a6a;
  background: transparent;
  cursor: pointer;
  padding: 2px;
}
.form-row {
  display: flex;
  gap: 12px;
}
.form-row .form-group {
  flex: 1;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

/* === IMPORT/EXPORT === */
.import-export-modal {
  text-align: center;
}
.ie-hint {
  font-size: 13px;
  color: #8080b0;
  margin: 12px 0 20px;
  line-height: 1.5;
}
.ie-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 16px;
}
.import-btn {
  background: #1a1a4a;
  border: 2px solid #3a3a8a;
  color: #a0a0ff;
  cursor: pointer;
}
.import-btn:hover {
  background: #2a2a6a;
}
.import-status {
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 13px;
}
.import-status.success {
  color: #80ff80;
  border: 1px solid #3a6a3a;
}
.import-status.error {
  color: #ff8080;
  border: 1px solid #6a3a3a;
}

/* === CONTEXT MENU === */
.context-menu {
  position: fixed;
  z-index: 2000;
  background: #12122e;
  border: 1px solid #3a3a6a;
  min-width: 160px;
  padding: 4px;
}
.context-menu button {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: #c0c0e0;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.context-menu button:hover {
  background: #1a1a3a;
}
.context-menu button.danger:hover {
  color: #ff4444;
}

/* === RESPONSIVE === */
@media (max-width: 768px) {
  .rpg-header {
    padding: 12px 16px;
    gap: 10px;
  }
  .character-bar {
    flex-wrap: wrap;
  }
  .xp-bar-container {
    min-width: 120px;
  }
  .rpg-drawer {
    width: 100vw;
  }
  .category-node {
    position: relative !important;
    transform: none !important;
    left: auto !important;
    top: auto !important;
  }
  .category-node:hover {
    transform: scale(1.05) !important;
  }
  .constellation-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 16px;
    height: auto;
    min-height: auto;
    padding: 8px;
  }
  .form-row {
    flex-direction: column;
  }
}
</style>
