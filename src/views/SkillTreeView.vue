<template>
  <div class="skill-tree-page" ref="pageRef" @keydown="onKeyDown" @keyup="onKeyUp" tabindex="0">
    <!-- Pixel stars background -->
    <div class="stars-bg">
      <div v-for="i in 80" :key="i" class="star" :style="starStyle(i)" />
    </div>

    <!-- Top HUD -->
    <header class="hud-bar">
      <button class="pixel-btn" @click="$router.push('/')">◄ Назад</button>

      <div class="char-hud" @click="!locks.hero && (showCharacterModal = true)">
        <div class="char-avatar-mini">
          <img v-if="characterImageUrl" :src="characterImageUrl" class="avatar-img crisp-icon" />
          <span v-else class="avatar-letter">{{ character?.name?.[0] || '?' }}</span>
        </div>
        <div class="char-hud-info">
          <span class="char-hud-name">{{ character?.name || 'Герой' }}</span>
          <span class="char-hud-title">{{ character?.title }}</span>
        </div>
        <div class="level-gem">
          <span class="gem-label">LVL</span>
          <span class="gem-value">{{ character?.level || 1 }}</span>
        </div>
        <div class="xp-hud-bar">
          <div class="xp-hud-fill" :style="{ width: xpPercent + '%' }" />
          <span class="xp-hud-text">{{ character?.currentXp || 0 }}/{{ character?.nextLvlXp || 100 }}</span>
        </div>
        <span class="total-xp-badge">★ {{ character?.totalXp || 0 }}</span>
      </div>

      <!-- Layer locks -->
      <div class="lock-toggles">
        <button class="lock-btn" :class="{ locked: locks.hero }" @click="locks.hero = !locks.hero" :title="locks.hero ? 'Разблокировать Героя' : 'Заблокировать Героя'">
          {{ locks.hero ? '🔒' : '🔓' }} Герой
        </button>
        <button class="lock-btn" :class="{ locked: locks.categories }" @click="locks.categories = !locks.categories" :title="locks.categories ? 'Разблокировать Категории' : 'Заблокировать Категории'">
          {{ locks.categories ? '🔒' : '🔓' }} Категории
        </button>
        <button class="lock-btn" :class="{ locked: locks.nodes }" @click="locks.nodes = !locks.nodes" :title="locks.nodes ? 'Разблокировать Навыки' : 'Заблокировать Навыки'">
          {{ locks.nodes ? '🔒' : '🔓' }} Навыки
        </button>
      </div>

      <div class="hud-actions">
        <button class="pixel-btn" @click="showImportExport = true">⇅ JSON</button>
        <button class="pixel-btn" @click="showPromptModal = true">🎨 Промпт</button>
        <button class="pixel-btn add-btn" @click="openAddCategory">+ Категория</button>
        <button class="pixel-btn" @click="resetView" title="Центрировать">⌖</button>
      </div>
    </header>

    <!-- Interactive 2D Map -->
    <div
      class="map-viewport"
      ref="viewportRef"
      @mousedown="onPanStart"
      @wheel.prevent="onZoom"
      @touchstart.prevent="onTouchStart"
      @touchmove.prevent="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div
        class="map-canvas"
        :style="canvasTransform"
      >
        <!-- SVG connection lines with arrowheads -->
        <svg class="connections-svg" :viewBox="svgViewBox">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#6e4aff" opacity="0.6" />
            </marker>
            <marker id="arrowhead-green" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#80ff80" opacity="0.6" />
            </marker>
            <marker id="arrowhead-gold" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#ffd700" opacity="0.6" />
            </marker>
          </defs>

          <!-- Lines from center (hero) to each category -->
          <line
            v-for="cat in categories"
            :key="'line-' + cat.id"
            x1="0" y1="0"
            :x2="cat.mapX" :y2="cat.mapY"
            class="connection-line"
            :stroke="cat.color || '#6e4aff'"
            marker-end="url(#arrowhead)"
          />

          <!-- Lines from category center to skill nodes -->
          <template v-if="expandedCategoryId && expandedCategory">
            <line
              v-for="node in expandedCategoryNodes"
              :key="'nline-' + node.id"
              :x1="expandedCategory.mapX"
              :y1="expandedCategory.mapY"
              :x2="expandedCategory.mapX + node.mapX"
              :y2="expandedCategory.mapY + node.mapY"
              class="node-connection-line"
              :stroke="node.color || expandedCategory.color || '#6e4aff'"
              marker-end="url(#arrowhead)"
            />

            <!-- Lines from skill nodes to their levels (visual tree) -->
            <template v-if="expandedNodeId && activeNodeData">
              <template v-for="(lvl, idx) in activeNodeData.levels || []" :key="'lvl-line-' + lvl.id">
                <line
                  :x1="expandedNodeAbsX"
                  :y1="expandedNodeAbsY"
                  :x2="expandedNodeAbsX"
                  :y2="expandedNodeAbsY + 70 * (idx + 1)"
                  class="level-connection-line"
                  :stroke="lvl.isCompleted ? '#80ff80' : (lvl.isLocked ? '#3a3a6a' : '#6e4aff')"
                  :marker-end="lvl.isCompleted ? 'url(#arrowhead-green)' : 'url(#arrowhead)'"
                />
                <!-- Lines from level to sub-skills -->
                <template v-for="(sub, si) in lvl.subSkills || []" :key="'sub-line-' + sub.id">
                  <line
                    :x1="expandedNodeAbsX"
                    :y1="expandedNodeAbsY + 70 * (idx + 1)"
                    :x2="expandedNodeAbsX + 60 + si * 55"
                    :y2="expandedNodeAbsY + 70 * (idx + 1)"
                    class="sub-connection-line"
                    :stroke="sub.isCompleted ? '#80ff80' : '#3a3a6a'"
                  />
                </template>
              </template>
            </template>
          </template>
        </svg>

        <!-- Category zones (SQUARE with rounded corners) -->
        <div
          v-for="cat in categories"
          :key="'zone-' + cat.id"
          class="category-zone"
          :class="{ 'layer-dimmed': locks.categories }"
          :style="categoryZoneStyle(cat)"
          @dblclick.stop="!locks.categories && openCategoryEdit(cat)"
        >
          <div class="zone-label">{{ cat.icon || '⬡' }} {{ cat.name }}</div>
          <div class="zone-progress">{{ Math.round(cat.progress || 0) }}%</div>
        </div>

        <!-- Character at center (0,0) -->
        <div
          class="character-node"
          :class="{ 'layer-dimmed': locks.hero, selected: selectedElement?.type === 'hero' }"
          @click.stop="onHeroClick"
        >
          <div class="char-glow" />
          <div class="char-avatar-main">
            <img v-if="characterImageUrl" :src="characterImageUrl" class="avatar-img-main crisp-icon" />
            <span v-else class="avatar-letter-main">{{ character?.name?.[0] || '?' }}</span>
          </div>
          <div class="char-level-ring">
            <span>{{ character?.level }}</span>
          </div>
        </div>

        <!-- Category icons on the map -->
        <div
          v-for="cat in categories"
          :key="'cat-' + cat.id"
          class="map-category-node"
          :class="{
            'layer-dimmed': locks.categories,
            selected: selectedElement?.type === 'category' && selectedElement.id === cat.id
          }"
          :style="categoryNodeStyle(cat)"
          @click.stop="onCategoryClick(cat)"
          @contextmenu.prevent="!locks.categories && categoryCtx(cat, $event)"
        >
          <div class="cat-node-glow" :style="{ background: cat.color || '#6e4aff' }" />
          <div class="cat-node-icon" :style="{ borderColor: cat.color || '#6e4aff' }">
            <span class="crisp-icon">{{ cat.icon || '⬡' }}</span>
          </div>
          <div class="cat-node-label">{{ cat.name }}</div>
          <div class="cat-node-xp">
            <div class="cat-progress-bar"><div class="cat-progress-fill" :style="{ width: (cat.progress || 0) + '%', background: cat.color || '#6e4aff' }" /></div>
            <span class="cat-xp-text">{{ cat.earnedXp || 0 }}/{{ cat.totalXp || 0 }} XP</span>
          </div>
          <div class="cat-node-ring">
            <svg viewBox="0 0 36 36">
              <path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path class="ring-fill" :stroke="cat.color || '#6e4aff'" :stroke-dasharray="`${cat.progress || 0}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
          </div>
        </div>

        <!-- Expanded skill nodes (when category is clicked) -->
        <template v-if="expandedCategoryId && expandedCategory">
          <div
            v-for="node in expandedCategoryNodes"
            :key="'node-' + node.id"
            class="map-skill-node"
            :class="{
              completed: node.isCompleted,
              'in-progress': !node.isCompleted && node.progress > 0,
              expanded: expandedNodeId === node.id,
              'layer-dimmed': locks.nodes,
              selected: selectedElement?.type === 'node' && selectedElement.id === node.id
            }"
            :style="skillNodeStyle(node)"
            @click.stop="onNodeClick(node)"
          >
            <div class="skill-node-orb" :style="{ borderColor: node.color || expandedCategory!.color || '#6e4aff' }">
              <span class="skill-node-icon crisp-icon">{{ node.icon || '◆' }}</span>
              <div v-if="node.isCompleted" class="completed-check">✓</div>
            </div>
            <div class="skill-node-label">{{ node.name }}</div>
            <div class="skill-node-progress-bar"><div class="skill-node-progress-fill" :style="{ width: (node.progress || 0) + '%' }" /></div>
            <div class="skill-node-xp-text">{{ node.earnedXp || 0 }}/{{ node.totalXp || 0 }} XP</div>
          </div>

          <!-- Visual branching tree: levels as orbs below expanded node -->
          <template v-if="expandedNodeId && activeNodeData && expandedCategory">
            <template v-for="(lvl, idx) in activeNodeData.levels || []" :key="'lvl-node-' + lvl.id">
              <!-- Level orb -->
              <div
                class="map-level-node"
                :class="{
                  completed: lvl.isCompleted,
                  locked: lvl.isLocked,
                  'in-progress': !lvl.isCompleted && !lvl.isLocked && lvl.progress > 0
                }"
                :style="{
                  left: expandedNodeAbsX + 'px',
                  top: (expandedNodeAbsY + 70 * (idx + 1)) + 'px'
                }"
                @click.stop="!lvl.isLocked && openLevelDetail(lvl)"
              >
                <div class="level-orb" :class="{ done: lvl.isCompleted, locked: lvl.isLocked }">
                  <span class="level-num-badge">{{ lvl.levelNumber }}</span>
                </div>
                <div class="level-orb-label">{{ lvl.name }}</div>
                <div class="level-orb-stat">{{ lvl.completedCount }}/{{ lvl.subSkillCount }}</div>
              </div>

              <!-- Sub-skills branching horizontally from level -->
              <div
                v-for="(sub, si) in lvl.subSkills || []"
                :key="'sub-node-' + sub.id"
                class="map-sub-skill"
                :class="{ done: sub.isCompleted }"
                :style="{
                  left: (expandedNodeAbsX + 60 + si * 55) + 'px',
                  top: (expandedNodeAbsY + 70 * (idx + 1)) + 'px'
                }"
                @click.stop="!locks.nodes && toggleSubSkill(sub)"
              >
                <div class="sub-skill-rect" :class="{ completed: sub.isCompleted }">
                  <span class="sub-skill-title">{{ sub.title }}</span>
                </div>
              </div>
            </template>

            <!-- Expand panel (edit actions for the node) -->
            <div
              class="node-expand-panel"
              :style="{
                left: (expandedNodeAbsX + 50) + 'px',
                top: (expandedNodeAbsY - 20) + 'px'
              }"
            >
              <div class="expand-panel-header">
                <h3>{{ activeNodeData.name }}</h3>
                <span class="expand-xp">{{ activeNodeData.earnedXp }}/{{ activeNodeData.totalXp }} XP</span>
                <div class="expand-actions">
                  <button class="pbtn" @click.stop="editNode(activeNodeData)">✎</button>
                  <button class="pbtn red" @click.stop="confirmDeleteNode(activeNodeData)">✕</button>
                  <button class="pbtn" @click.stop="showAddLevelModal = true">+ Уровень</button>
                </div>
              </div>
            </div>
          </template>

          <!-- Add node button floating in category area -->
          <div
            class="add-node-btn"
            :style="{ left: expandedCategory.mapX + 'px', top: (expandedCategory.mapY + (expandedCategory.mapRadius || 200) - 30) + 'px' }"
            @click.stop="showAddNodeModal = true"
          >
            + Навык
          </div>
        </template>
      </div>
    </div>

    <!-- Level Detail Panel (sub-skills + exam) - slides from right -->
    <Teleport to="body">
      <div v-if="showLevelDetail" class="level-panel-backdrop" @click.self="closeLevelDetail">
        <div class="level-panel">
          <div class="lp-header">
            <h2>{{ activeLevelData?.name }}</h2>
            <p v-if="activeLevelData?.description">{{ activeLevelData.description }}</p>
            <div class="lp-progress">
              <div class="lp-bar"><div class="lp-fill" :style="{ width: (activeLevelData?.progress || 0) + '%' }" /></div>
              <span>{{ activeLevelData?.earnedXp || 0 }}/{{ activeLevelData?.totalXp || 0 }} XP</span>
            </div>
          </div>

          <div class="lp-body">
            <button class="pixel-btn add-btn full-w" @click="showAddSubSkillModal = true">+ Тема</button>

            <div class="sub-list">
              <div v-for="sub in activeLevelData?.subSkills || []" :key="sub.id" class="sub-row" :class="{ done: sub.isCompleted }">
                <button class="sub-check" @click="toggleSubSkill(sub)">
                  <span v-if="sub.isCompleted">✓</span><span v-else>○</span>
                </button>
                <div class="sub-info">
                  <span class="sub-title">{{ sub.title }}</span>
                  <span v-if="sub.description" class="sub-desc">{{ sub.description }}</span>
                </div>
                <span class="sub-xp">+{{ sub.xpValue }}</span>
                <button class="pbtn-xs" @click="editSubSkill(sub)">✎</button>
                <button class="pbtn-xs red" @click="confirmDeleteSubSkill(sub)">✕</button>
              </div>
            </div>

            <!-- Exam -->
            <div v-if="activeLevelData?.examTitle" class="exam-box" :class="{ passed: activeLevelData.examPassed }">
              <div class="exam-title">📜 {{ activeLevelData.examTitle }}</div>
              <p v-if="activeLevelData.examDescription">{{ activeLevelData.examDescription }}</p>
              <div class="exam-bonus">Бонус: +{{ activeLevelData.completionBonusXp }} XP</div>
              <button v-if="!activeLevelData.examPassed" class="pixel-btn exam-btn" :disabled="!allSubsComplete" @click="handlePassExam">
                {{ allSubsComplete ? '🏆 Сдать экзамен' : '🔒 Завершите все темы' }}
              </button>
              <div v-else class="exam-passed">🏆 Сдан! <button class="pbtn-xs" @click="handleUnpassExam">Отменить</button></div>
            </div>
          </div>

          <button class="pixel-btn full-w" @click="closeLevelDetail">Закрыть</button>
        </div>
      </div>
    </Teleport>

    <!-- Category modal -->
    <Teleport to="body">
      <div v-if="showCategoryModal" class="modal-bg" @click.self="showCategoryModal = false">
        <div class="modal-box">
          <h2>{{ editingCategoryId ? 'Редактировать' : 'Новая' }} категория</h2>
          <label>Название<input v-model="catForm.name" class="rinput" /></label>
          <label>Описание<textarea v-model="catForm.description" class="rinput" rows="2" /></label>
          <div class="row3">
            <label>Иконка<input v-model="catForm.icon" class="rinput" placeholder="⚔️" /></label>
            <label>Цвет<input v-model="catForm.color" type="color" class="rcolor" /></label>
            <label>Радиус<input v-model.number="catForm.mapRadius" type="number" class="rinput" /></label>
          </div>
          <div class="row3">
            <label>X<input v-model.number="catForm.mapX" type="number" class="rinput" /></label>
            <label>Y<input v-model.number="catForm.mapY" type="number" class="rinput" /></label>
            <label>Порядок<input v-model.number="catForm.sortOrder" type="number" class="rinput" /></label>
          </div>
          <div class="mactions"><button class="pixel-btn" @click="showCategoryModal = false">Отмена</button><button class="pixel-btn add-btn" @click="saveCategory">Сохранить</button></div>
        </div>
      </div>
    </Teleport>

    <!-- Node modal -->
    <Teleport to="body">
      <div v-if="showAddNodeModal" class="modal-bg" @click.self="showAddNodeModal = false">
        <div class="modal-box">
          <h2>{{ editingNodeId ? 'Редактировать' : 'Новый' }} навык</h2>
          <label>Название<input v-model="nodeForm.name" class="rinput" /></label>
          <label>Описание<textarea v-model="nodeForm.description" class="rinput" rows="2" /></label>
          <div class="row3">
            <label>Иконка<input v-model="nodeForm.icon" class="rinput" placeholder="🐘" /></label>
            <label>Цвет<input v-model="nodeForm.color" type="color" class="rcolor" /></label>
            <label>Бонус XP<input v-model.number="nodeForm.completionBonusXp" type="number" class="rinput" /></label>
          </div>
          <div class="row3">
            <label>X<input v-model.number="nodeForm.mapX" type="number" class="rinput" /></label>
            <label>Y<input v-model.number="nodeForm.mapY" type="number" class="rinput" /></label>
          </div>
          <div class="mactions"><button class="pixel-btn" @click="showAddNodeModal = false">Отмена</button><button class="pixel-btn add-btn" @click="saveNode">Сохранить</button></div>
        </div>
      </div>
    </Teleport>

    <!-- Level modal -->
    <Teleport to="body">
      <div v-if="showAddLevelModal" class="modal-bg" @click.self="showAddLevelModal = false">
        <div class="modal-box">
          <h2>{{ editingLevelId ? 'Редактировать' : 'Новый' }} уровень</h2>
          <label>Название<input v-model="levelForm.name" class="rinput" /></label>
          <label>Описание<textarea v-model="levelForm.description" class="rinput" rows="2" /></label>
          <div class="row3">
            <label>№<input v-model.number="levelForm.levelNumber" type="number" class="rinput" /></label>
            <label>XP/тему<input v-model.number="levelForm.xpPerSubSkill" type="number" class="rinput" /></label>
            <label>Бонус<input v-model.number="levelForm.completionBonusXp" type="number" class="rinput" /></label>
          </div>
          <label>Экзамен<input v-model="levelForm.examTitle" class="rinput" /></label>
          <label>Описание экзамена<textarea v-model="levelForm.examDescription" class="rinput" rows="2" /></label>
          <div class="mactions"><button class="pixel-btn" @click="showAddLevelModal = false">Отмена</button><button class="pixel-btn add-btn" @click="saveLevel">Сохранить</button></div>
        </div>
      </div>
    </Teleport>

    <!-- SubSkill modal -->
    <Teleport to="body">
      <div v-if="showAddSubSkillModal" class="modal-bg" @click.self="showAddSubSkillModal = false">
        <div class="modal-box">
          <h2>{{ editingSubSkillId ? 'Редактировать' : 'Новая' }} тема</h2>
          <label>Название<input v-model="subForm.title" class="rinput" /></label>
          <label>Описание<textarea v-model="subForm.description" class="rinput" rows="2" /></label>
          <div class="row3">
            <label>XP<input v-model.number="subForm.xpValue" type="number" class="rinput" /></label>
            <label>Порядок<input v-model.number="subForm.sortOrder" type="number" class="rinput" /></label>
          </div>
          <div class="mactions"><button class="pixel-btn" @click="showAddSubSkillModal = false">Отмена</button><button class="pixel-btn add-btn" @click="saveSubSkill">Сохранить</button></div>
        </div>
      </div>
    </Teleport>

    <!-- Character modal -->
    <Teleport to="body">
      <div v-if="showCharacterModal" class="modal-bg" @click.self="showCharacterModal = false">
        <div class="modal-box">
          <h2>Профиль персонажа</h2>
          <label>Имя<input v-model="charForm.name" class="rinput" /></label>
          <label>Титул<input v-model="charForm.title" class="rinput" /></label>
          <div class="form-section">
            <h3>Фото по уровням</h3>
            <p class="hint">Добавьте фотографии — они будут меняться при достижении уровня</p>
            <div class="level-images-list">
              <div v-for="li in levelImages" :key="li.id" class="li-row">
                <span>С уровня {{ li.minLevel }}</span>
                <button class="pbtn-xs red" @click="deleteLevelImage(li.id)">✕</button>
              </div>
            </div>
            <div class="li-add-row">
              <input v-model.number="newLevelImageLevel" type="number" class="rinput small" placeholder="Уровень" min="1" />
              <label class="pixel-btn add-btn upload-btn">
                📷 Фото
                <input type="file" accept="image/*" hidden @change="uploadLevelImage" />
              </label>
            </div>
          </div>
          <div class="mactions">
            <button class="pixel-btn" @click="showCharacterModal = false">Отмена</button>
            <button class="pixel-btn add-btn" @click="saveCharacter">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Import/Export -->
    <Teleport to="body">
      <div v-if="showImportExport" class="modal-bg" @click.self="showImportExport = false">
        <div class="modal-box center-text">
          <h2>⇅ Импорт / Экспорт</h2>
          <p class="hint">Экспортируйте дерево навыков в JSON. Передайте нейросети для генерации — она увидит шаблон и заполнит. Импортируйте обратно.</p>
          <div class="ie-btns">
            <button class="pixel-btn add-btn" @click="handleExport">📤 Экспорт</button>
            <label class="pixel-btn upload-btn">📥 Импорт<input type="file" accept=".json" hidden @change="handleImport" /></label>
          </div>
          <div v-if="importMsg" class="import-msg" :class="importMsgType">{{ importMsg }}</div>
          <button class="pixel-btn" @click="showImportExport = false">Закрыть</button>
        </div>
      </div>
    </Teleport>

    <!-- Prompt Generator -->
    <Teleport to="body">
      <div v-if="showPromptModal" class="modal-bg" @click.self="showPromptModal = false">
        <div class="modal-box">
          <h2>🎨 Промпт для генерации иконок</h2>
          <p class="hint">Скопируйте промпт и используйте в Midjourney / DALL-E / Stable Diffusion для генерации единообразных иконок навыков.</p>
          <textarea class="rinput prompt-area" readonly rows="8" :value="iconPrompt" @click="copyPrompt" />
          <button class="pixel-btn add-btn full-w" @click="copyPrompt">📋 Скопировать</button>
          <button class="pixel-btn full-w" @click="showPromptModal = false">Закрыть</button>
        </div>
      </div>
    </Teleport>

    <!-- Context Menu -->
    <Teleport to="body">
      <div v-if="ctx.show" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
        <button @click="openCategoryEdit(ctx.cat!)">✎ Редактировать</button>
        <button class="red" @click="confirmDeleteCategory(ctx.cat!)">✕ Удалить</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch, onUnmounted, nextTick } from "vue";
import { useSkillTreeStore } from "@/stores/skillTree";
import * as api from "@/api/skillTree";
import type { SkillCategory, SkillNode, SkillLevel, SubSkill, SkillTreeExport, CharacterLevelImage } from "@/types/skillTree";

const store = useSkillTreeStore();

// === Refs ===
const viewportRef = ref<HTMLElement>();
const pageRef = ref<HTMLElement>();

// === Layer locks ===
const locks = reactive({
  hero: false,
  categories: false,
  nodes: false,
});

// === Selected element for arrow key movement ===
interface SelectedElement {
  type: "hero" | "category" | "node";
  id: string;
}
const selectedElement = ref<SelectedElement | null>(null);
let arrowDebounce: ReturnType<typeof setTimeout> | null = null;

function onKeyDown(e: KeyboardEvent) {
  if (!selectedElement.value) return;
  const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  if (!arrows.includes(e.key)) return;
  e.preventDefault();

  const step = e.shiftKey ? 50 : 10;
  let dx = 0, dy = 0;
  if (e.key === "ArrowUp") dy = -step;
  if (e.key === "ArrowDown") dy = step;
  if (e.key === "ArrowLeft") dx = -step;
  if (e.key === "ArrowRight") dx = step;

  const sel = selectedElement.value;
  if (sel.type === "category") {
    const cat = categories.value.find(c => c.id === sel.id);
    if (cat) {
      cat.mapX += dx;
      cat.mapY += dy;
    }
  } else if (sel.type === "node") {
    const node = expandedCategoryNodes.value.find(n => n.id === sel.id);
    if (node) {
      node.mapX += dx;
      node.mapY += dy;
    }
  }
}

function onKeyUp(e: KeyboardEvent) {
  const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  if (!arrows.includes(e.key) || !selectedElement.value) return;

  if (arrowDebounce) clearTimeout(arrowDebounce);
  arrowDebounce = setTimeout(() => {
    saveSelectedPosition();
  }, 500);
}

async function saveSelectedPosition() {
  const sel = selectedElement.value;
  if (!sel) return;

  if (sel.type === "category") {
    const cat = categories.value.find(c => c.id === sel.id);
    if (cat) {
      await store.updateCategory(cat.id, { mapX: cat.mapX, mapY: cat.mapY });
    }
  } else if (sel.type === "node") {
    const node = expandedCategoryNodes.value.find(n => n.id === sel.id);
    if (node) {
      await store.updateSkillNode(node.id, { mapX: node.mapX, mapY: node.mapY });
    }
  }
}

// === Pan / Zoom state ===
const panX = ref(0);
const panY = ref(0);
const zoom = ref(1);
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;
let lastTouchDist = 0;

const canvasTransform = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  transformOrigin: "0 0",
  willChange: "transform",
}));

const svgViewBox = computed(() => {
  const r = 2000;
  return `${-r} ${-r} ${r * 2} ${r * 2}`;
});

// Counter-scale for icons to stay crisp at any zoom
const counterScale = computed(() => `scale(${1 / zoom.value})`);

function categoryNodeStyle(cat: SkillCategory) {
  return {
    left: cat.mapX + "px",
    top: cat.mapY + "px",
    transform: `translate(-50%, -50%) ${counterScale.value}`,
  };
}

function skillNodeStyle(node: SkillNode) {
  const cat = expandedCategory.value;
  if (!cat) return {};
  return {
    left: (cat.mapX + node.mapX) + "px",
    top: (cat.mapY + node.mapY) + "px",
    transform: `translate(-50%, -50%) ${counterScale.value}`,
  };
}

function onPanStart(e: MouseEvent) {
  if (e.button !== 0) return;
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartPanX = panX.value;
  panStartPanY = panY.value;
  window.addEventListener("mousemove", onPanMove);
  window.addEventListener("mouseup", onPanEnd);
}
function onPanMove(e: MouseEvent) {
  if (!isPanning) return;
  panX.value = panStartPanX + (e.clientX - panStartX);
  panY.value = panStartPanY + (e.clientY - panStartY);
}
function onPanEnd() {
  isPanning = false;
  window.removeEventListener("mousemove", onPanMove);
  window.removeEventListener("mouseup", onPanEnd);
}
function onZoom(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  zoom.value = Math.max(0.2, Math.min(3, zoom.value + delta));
}
function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    isPanning = true;
    panStartX = e.touches[0].clientX;
    panStartY = e.touches[0].clientY;
    panStartPanX = panX.value;
    panStartPanY = panY.value;
  } else if (e.touches.length === 2) {
    lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }
}
function onTouchMove(e: TouchEvent) {
  if (e.touches.length === 1 && isPanning) {
    panX.value = panStartPanX + (e.touches[0].clientX - panStartX);
    panY.value = panStartPanY + (e.touches[0].clientY - panStartY);
  } else if (e.touches.length === 2) {
    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (lastTouchDist > 0) {
      const scale = dist / lastTouchDist;
      zoom.value = Math.max(0.2, Math.min(3, zoom.value * scale));
    }
    lastTouchDist = dist;
  }
}
function onTouchEnd() { isPanning = false; lastTouchDist = 0; }

function resetView() {
  panX.value = 0;
  panY.value = 0;
  zoom.value = 1;
  if (viewportRef.value) {
    panX.value = viewportRef.value.clientWidth / 2;
    panY.value = viewportRef.value.clientHeight / 2;
  }
}

// === Data ===
const character = computed(() => store.character);
const categories = computed(() => store.categories);
const loading = computed(() => store.loading);

const characterImageUrl = ref<string>("");

async function loadCharacterImage() {
  const url = await api.fetchCharacterImageBlob();
  if (url) characterImageUrl.value = url;
  else characterImageUrl.value = "";
}

const expandedCategoryId = ref<string | null>(null);
const expandedCategory = computed(() => categories.value.find(c => c.id === expandedCategoryId.value) || store.activeCategory);
const expandedCategoryNodes = computed(() => store.activeCategory?.skills || []);

const expandedNodeId = ref<string | null>(null);
const activeNodeData = computed(() => store.activeNode);
const activeLevelData = computed(() => store.activeLevel);

// Absolute position of the expanded node on the map
const expandedNodeAbsX = computed(() => {
  if (!expandedCategory.value || !activeNodeData.value) return 0;
  const node = expandedCategoryNodes.value.find(n => n.id === expandedNodeId.value);
  if (!node) return 0;
  return expandedCategory.value.mapX + node.mapX;
});
const expandedNodeAbsY = computed(() => {
  if (!expandedCategory.value || !activeNodeData.value) return 0;
  const node = expandedCategoryNodes.value.find(n => n.id === expandedNodeId.value);
  if (!node) return 0;
  return expandedCategory.value.mapY + node.mapY;
});

const showLevelDetail = ref(false);
const showCategoryModal = ref(false);
const showAddNodeModal = ref(false);
const showAddLevelModal = ref(false);
const showAddSubSkillModal = ref(false);
const showCharacterModal = ref(false);
const showImportExport = ref(false);
const showPromptModal = ref(false);

const editingCategoryId = ref<string | null>(null);
const editingNodeId = ref<string | null>(null);
const editingLevelId = ref<string | null>(null);
const editingSubSkillId = ref<string | null>(null);

const levelImages = ref<CharacterLevelImage[]>([]);
const newLevelImageLevel = ref(1);

const importMsg = ref("");
const importMsgType = ref<"ok" | "err">("ok");

const catForm = reactive({ name: "", description: "", icon: "", color: "#6e4aff", sortOrder: 0, mapX: 0, mapY: 0, mapRadius: 200 });
const nodeForm = reactive({ name: "", description: "", icon: "", color: "#6e4aff", completionBonusXp: 50, mapX: 0, mapY: 0 });
const levelForm = reactive({ name: "", description: "", levelNumber: 1, xpPerSubSkill: 10, completionBonusXp: 25, examTitle: "", examDescription: "" });
const subForm = reactive({ title: "", description: "", xpValue: 10, sortOrder: 0 });
const charForm = reactive({ name: "", title: "" });

const ctx = reactive({ show: false, x: 0, y: 0, cat: null as SkillCategory | null });

const xpPercent = computed(() => {
  if (!character.value || !character.value.nextLvlXp) return 0;
  return Math.min(100, (character.value.currentXp / character.value.nextLvlXp) * 100);
});

const allSubsComplete = computed(() => {
  const subs = activeLevelData.value?.subSkills || [];
  return subs.length > 0 && subs.every(s => s.isCompleted);
});

// === Auto-layout: Find free position for new category ===
const heroSafeZone = 80;
const defaultCategoryGap = 30;
const minCategoryGap = 20;

function findFreePosition(existingCategories: SkillCategory[], newRadius: number): { x: number; y: number } {
  const count = existingCategories.length;
  const baseAngleStep = (2 * Math.PI) / (count + 1);
  let baseDistance = heroSafeZone + newRadius + defaultCategoryGap;

  for (let attempt = 0; attempt < 50; attempt++) {
    for (let i = 0; i <= count; i++) {
      const angle = i * baseAngleStep;
      const x = Math.round(Math.cos(angle) * baseDistance);
      const y = Math.round(Math.sin(angle) * baseDistance);

      let overlaps = false;
      for (const cat of existingCategories) {
        const catR = cat.mapRadius || 200;
        const dx = x - cat.mapX;
        const dy = y - cat.mapY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = newRadius + catR + minCategoryGap;
        if (dist < minDist) {
          overlaps = true;
          break;
        }
      }

      // Check hero safe zone
      const heroD = Math.sqrt(x * x + y * y);
      if (heroD < heroSafeZone + newRadius) {
        overlaps = true;
      }

      if (!overlaps) return { x, y };
    }
    baseDistance += 60;
  }

  return { x: baseDistance, y: 0 };
}

// === Auto-layout: Find free position for new node inside category zone ===
function findFreeNodePosition(existingNodes: SkillNode[], categoryRadius: number): { x: number; y: number } {
  const minFromCenter = 60;
  const minFromOther = 80;
  const maxR = categoryRadius - 20;

  for (let ring = minFromCenter; ring <= maxR; ring += 40) {
    const circumference = 2 * Math.PI * ring;
    const steps = Math.max(6, Math.floor(circumference / minFromOther));
    for (let i = 0; i < steps; i++) {
      const angle = (2 * Math.PI * i) / steps;
      const x = Math.round(Math.cos(angle) * ring);
      const y = Math.round(Math.sin(angle) * ring);

      let tooClose = false;
      for (const n of existingNodes) {
        const dx = x - n.mapX;
        const dy = y - n.mapY;
        if (Math.sqrt(dx * dx + dy * dy) < minFromOther) {
          tooClose = true;
          break;
        }
      }
      if (Math.sqrt(x * x + y * y) < minFromCenter) tooClose = true;

      if (!tooClose) return { x, y };
    }
  }

  return { x: minFromCenter, y: 0 };
}

// === Prompt ===
const iconPrompt = `Pixel art icon, 64x64px, dark fantasy RPG style, single centered symbol on transparent background, clean edges, vibrant glowing colors on dark (#0a0a1a) background. No text. Consistent style across all icons.

Для каждого навыка замените описание:
- "PostgreSQL database icon, elephant silhouette, blue glow"
- "Docker container icon, whale silhouette, cyan glow"
- "Python programming icon, snake silhouette, green glow"
- "Linux terminal icon, penguin silhouette, orange glow"
- "Machine Learning icon, neural network, purple glow"

Параметры для Midjourney: --ar 1:1 --s 250 --style raw
Параметры для DALL-E: размер 256x256, стиль "pixel art"`;

function copyPrompt() {
  navigator.clipboard.writeText(iconPrompt);
  alert("Промпт скопирован!");
}

// === Star bg ===
function starStyle(i: number) {
  return {
    left: `${(i * 37 + 13) % 100}%`,
    top: `${(i * 53 + 7) % 100}%`,
    width: `${1 + (i % 3)}px`,
    height: `${1 + (i % 3)}px`,
    animationDelay: `${(i * 0.3) % 5}s`,
    opacity: 0.2 + (i % 5) * 0.12,
  };
}

// === Category zone style (SQUARE with rounded corners) ===
function categoryZoneStyle(cat: SkillCategory) {
  const r = cat.mapRadius || 200;
  return {
    left: `${cat.mapX - r}px`,
    top: `${cat.mapY - r}px`,
    width: `${r * 2}px`,
    height: `${r * 2}px`,
    background: `radial-gradient(ellipse at center, ${cat.color || '#6e4aff'}15 0%, ${cat.color || '#6e4aff'}05 60%, transparent 100%)`,
    borderColor: `${cat.color || '#6e4aff'}30`,
    borderRadius: "12px",
  };
}

// === Click handlers with lock support ===
function onHeroClick() {
  if (locks.hero) return;
  selectedElement.value = { type: "hero", id: "hero" };
  showCharacterModal.value = true;
}

function onCategoryClick(cat: SkillCategory) {
  if (locks.categories) return;
  selectedElement.value = { type: "category", id: cat.id };
  toggleCategory(cat);
}

function onNodeClick(node: SkillNode) {
  if (locks.nodes) return;
  selectedElement.value = { type: "node", id: node.id };
  toggleNode(node);
}

// === Actions ===
onMounted(async () => {
  await Promise.all([store.fetchCharacter(), store.fetchCategories()]);
  loadLevelImages();
  loadCharacterImage();
  setTimeout(resetView, 100);
  // Focus for keyboard events
  nextTick(() => pageRef.value?.focus());
});

// Close ctx menu on click
function closeCtx() { ctx.show = false; }
onMounted(() => document.addEventListener("click", closeCtx));
onUnmounted(() => document.removeEventListener("click", closeCtx));

async function loadLevelImages() {
  try { levelImages.value = await api.getCharacterLevelImages(); } catch {}
}

function toggleCategory(cat: SkillCategory) {
  if (expandedCategoryId.value === cat.id) {
    expandedCategoryId.value = null;
    expandedNodeId.value = null;
  } else {
    expandedCategoryId.value = cat.id;
    expandedNodeId.value = null;
    store.fetchCategory(cat.id);
  }
}

function toggleNode(node: SkillNode) {
  if (expandedNodeId.value === node.id) {
    expandedNodeId.value = null;
  } else {
    expandedNodeId.value = node.id;
    store.fetchSkillNode(node.id);
  }
}

function openLevelDetail(lvl: SkillLevel) {
  store.fetchSkillLevel(lvl.id);
  showLevelDetail.value = true;
}
function closeLevelDetail() { showLevelDetail.value = false; }

function openAddCategory() {
  editingCategoryId.value = null;
  const pos = findFreePosition(categories.value, 200);
  Object.assign(catForm, { name: "", description: "", icon: "", color: "#6e4aff", sortOrder: 0, mapX: pos.x, mapY: pos.y, mapRadius: 200 });
  showCategoryModal.value = true;
}

function openCategoryEdit(cat: SkillCategory) {
  editingCategoryId.value = cat.id;
  Object.assign(catForm, { name: cat.name, description: cat.description, icon: cat.icon, color: cat.color || "#6e4aff", sortOrder: cat.sortOrder, mapX: cat.mapX, mapY: cat.mapY, mapRadius: cat.mapRadius || 200 });
  showCategoryModal.value = true;
  ctx.show = false;
}

async function saveCategory() {
  if (!catForm.name) return;
  if (editingCategoryId.value) {
    await store.updateCategory(editingCategoryId.value, { ...catForm });
  } else {
    await store.createCategory({ ...catForm });
  }
  showCategoryModal.value = false;
}

async function confirmDeleteCategory(cat: SkillCategory) {
  ctx.show = false;
  if (confirm(`Удалить «${cat.name}»?`)) {
    await store.deleteCategory(cat.id);
    if (expandedCategoryId.value === cat.id) expandedCategoryId.value = null;
  }
}

function categoryCtx(cat: SkillCategory, e: MouseEvent) {
  ctx.show = true; ctx.x = e.clientX; ctx.y = e.clientY; ctx.cat = cat;
}

function editNode(n: SkillNode) {
  editingNodeId.value = n.id;
  Object.assign(nodeForm, { name: n.name, description: n.description, icon: n.icon, color: n.color || "#6e4aff", completionBonusXp: n.completionBonusXp, mapX: n.mapX, mapY: n.mapY });
  showAddNodeModal.value = true;
}

async function saveNode() {
  if (!nodeForm.name) return;
  if (editingNodeId.value) {
    await store.updateSkillNode(editingNodeId.value, { ...nodeForm });
    editingNodeId.value = null;
  } else {
    // Auto-position new node
    const existingNodes = expandedCategoryNodes.value;
    const catRadius = expandedCategory.value?.mapRadius || 200;
    if (nodeForm.mapX === 0 && nodeForm.mapY === 0) {
      const pos = findFreeNodePosition(existingNodes, catRadius);
      nodeForm.mapX = pos.x;
      nodeForm.mapY = pos.y;
    }
    await store.createSkillNode({ categoryId: expandedCategoryId.value!, ...nodeForm });
  }
  showAddNodeModal.value = false;
}

async function confirmDeleteNode(n: SkillNode) {
  if (confirm(`Удалить «${n.name}»?`)) {
    await store.deleteSkillNode(n.id);
    expandedNodeId.value = null;
  }
}

function editLevel(l: SkillLevel) {
  editingLevelId.value = l.id;
  Object.assign(levelForm, { name: l.name, description: l.description, levelNumber: l.levelNumber, xpPerSubSkill: l.xpPerSubSkill, completionBonusXp: l.completionBonusXp, examTitle: l.examTitle, examDescription: l.examDescription });
  showAddLevelModal.value = true;
}

async function saveLevel() {
  if (!levelForm.name) return;
  if (editingLevelId.value) {
    await store.updateSkillLevel(editingLevelId.value, { ...levelForm });
    editingLevelId.value = null;
  } else {
    await store.createSkillLevel({ skillNodeId: activeNodeData.value!.id, ...levelForm });
  }
  showAddLevelModal.value = false;
}

async function confirmDeleteLevel(l: SkillLevel) {
  if (confirm(`Удалить «${l.name}»?`)) { await store.deleteSkillLevel(l.id); }
}

function editSubSkill(s: SubSkill) {
  editingSubSkillId.value = s.id;
  Object.assign(subForm, { title: s.title, description: s.description, xpValue: s.xpValue, sortOrder: s.sortOrder });
  showAddSubSkillModal.value = true;
}

async function saveSubSkill() {
  if (!subForm.title) return;
  if (editingSubSkillId.value) {
    await store.updateSubSkill(editingSubSkillId.value, { ...subForm });
    editingSubSkillId.value = null;
  } else {
    await store.createSubSkill({ skillLevelId: activeLevelData.value!.id, ...subForm });
  }
  showAddSubSkillModal.value = false;
}

async function confirmDeleteSubSkill(s: SubSkill) {
  if (confirm(`Удалить «${s.title}»?`)) { await store.deleteSubSkill(s.id); }
}

async function toggleSubSkill(s: SubSkill) {
  if (s.isCompleted) await store.uncompleteSubSkill(s.id);
  else await store.completeSubSkill(s.id);
}

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

async function saveCharacter() {
  await api.updateCharacter({ name: charForm.name, title: charForm.title });
  await store.fetchCharacter();
  showCharacterModal.value = false;
}

watch(showCharacterModal, v => {
  if (v && character.value) {
    charForm.name = character.value.name;
    charForm.title = character.value.title;
  }
});

async function uploadLevelImage(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  await api.addCharacterLevelImage(newLevelImageLevel.value, file);
  await loadLevelImages();
  await loadCharacterImage();
  (e.target as HTMLInputElement).value = "";
}

async function deleteLevelImage(id: string) {
  await api.deleteCharacterLevelImage(id);
  await loadLevelImages();
}

async function handleExport() {
  try {
    const data = await store.exportTree();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `skill-tree-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    importMsg.value = "Экспорт завершён!";
    importMsgType.value = "ok";
  } catch { importMsg.value = "Ошибка"; importMsgType.value = "err"; }
}

async function handleImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const data: SkillTreeExport = JSON.parse(await file.text());
    await store.importTree(data);
    importMsg.value = "Импорт завершён!";
    importMsgType.value = "ok";
  } catch { importMsg.value = "Ошибка формата JSON"; importMsgType.value = "err"; }
  (e.target as HTMLInputElement).value = "";
}

// Reset editing states when modals close
watch(showCategoryModal, v => { if (!v) editingCategoryId.value = null; });
watch(showAddNodeModal, v => {
  if (!v) {
    editingNodeId.value = null;
  } else if (!editingNodeId.value) {
    // Reset form for new node with auto-position
    Object.assign(nodeForm, { name: "", description: "", icon: "", color: "#6e4aff", completionBonusXp: 50, mapX: 0, mapY: 0 });
  }
});
watch(showAddLevelModal, v => { if (!v) editingLevelId.value = null; });
watch(showAddSubSkillModal, v => { if (!v) editingSubSkillId.value = null; });
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

/* === CRISP ICON RENDERING === */
.crisp-icon,
.crisp-icon img {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.skill-tree-page {
  min-height: 100vh;
  background: #0a0a1a;
  color: #e0e0f0;
  font-family: 'Segoe UI', sans-serif;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  outline: none;
}

/* Stars */
.stars-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
.star { position: absolute; background: #fff; border-radius: 50%; animation: twinkle 3s ease-in-out infinite alternate; }
@keyframes twinkle { 0% { opacity: 0.15; } 100% { opacity: 0.8; transform: scale(1.4); } }

/* HUD */
.hud-bar {
  position: relative;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: linear-gradient(180deg, rgba(10,10,30,0.97), rgba(10,10,26,0.85));
  border-bottom: 2px solid #1a1a4a;
  flex-wrap: wrap;
}

.char-hud { display: flex; align-items: center; gap: 10px; flex: 1; cursor: pointer; min-width: 0; }
.char-avatar-mini { width: 40px; height: 40px; border: 2px solid #6e4aff; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
.avatar-img { width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; image-rendering: crisp-edges; }
.avatar-letter { font-size: 18px; color: #a080ff; }
.char-hud-info { display: flex; flex-direction: column; min-width: 0; }
.char-hud-name { font-size: 14px; font-weight: 700; color: #e0e0ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.char-hud-title { font-size: 10px; color: #6060a0; }

.level-gem { display: flex; flex-direction: column; align-items: center; background: linear-gradient(135deg, #2a1a5a, #4a2a8a); border: 2px solid #6e4aff; padding: 2px 10px; }
.gem-label { font-size: 8px; color: #a080ff; letter-spacing: 2px; font-family: 'Press Start 2P', monospace; }
.gem-value { font-size: 18px; font-weight: 900; color: #e0d0ff; font-family: 'Press Start 2P', monospace; line-height: 1; }

.xp-hud-bar { width: 140px; height: 12px; background: #12122e; border: 1px solid #2a2a5a; position: relative; overflow: hidden; }
.xp-hud-fill { height: 100%; background: linear-gradient(90deg, #6e4aff, #a080ff); transition: width 0.4s; }
.xp-hud-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #c0c0e0; }

.total-xp-badge { color: #ffd700; font-weight: 700; font-size: 13px; white-space: nowrap; }

/* Lock toggles */
.lock-toggles {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.lock-btn {
  background: #12122e;
  border: 1px solid #2a2a5a;
  color: #80ff80;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.lock-btn.locked {
  background: #1a1010;
  border-color: #5a3a3a;
  color: #ff8080;
}
.lock-btn:hover {
  border-color: #6e4aff;
}

.hud-actions { display: flex; gap: 6px; flex-shrink: 0; }

/* Pixel buttons */
.pixel-btn { background: #1a1a3a; color: #c0c0e0; border: 2px solid #3a3a6a; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: all 0.15s; font-family: inherit; white-space: nowrap; }
.pixel-btn:hover { background: #2a2a5a; border-color: #6e4aff; color: #fff; }
.pixel-btn.add-btn { background: #1a3a1a; border-color: #3a6a3a; color: #80ff80; }
.pixel-btn.add-btn:hover { background: #2a5a2a; border-color: #4eff4e; }
.pbtn { background: transparent; border: 1px solid #3a3a6a; color: #8080b0; padding: 3px 8px; font-size: 11px; cursor: pointer; }
.pbtn:hover { color: #fff; border-color: #6e4aff; }
.pbtn.red:hover, .pbtn-xs.red:hover { color: #ff4444; border-color: #ff4444; }
.pbtn-xs { background: transparent; border: 1px solid #2a2a5a; color: #6060a0; padding: 2px 6px; font-size: 10px; cursor: pointer; }
.pbtn-xs:hover { color: #fff; border-color: #6e4aff; }
.full-w { width: 100%; margin-top: 8px; }

/* MAP VIEWPORT */
.map-viewport { flex: 1; position: relative; z-index: 5; overflow: hidden; cursor: grab; }
.map-viewport:active { cursor: grabbing; }

.map-canvas {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  will-change: transform;
}

/* SVG connections */
.connections-svg { position: absolute; left: -2000px; top: -2000px; width: 4000px; height: 4000px; pointer-events: none; z-index: 1; }
.connection-line { stroke-width: 1; opacity: 0.25; stroke-dasharray: 6 4; }
.node-connection-line { stroke-width: 1.5; opacity: 0.4; }
.level-connection-line { stroke-width: 2; opacity: 0.5; stroke-dasharray: 4 3; }
.sub-connection-line { stroke-width: 1; opacity: 0.3; stroke-dasharray: 3 2; }

/* Layer dimming */
.layer-dimmed {
  opacity: 0.4;
  filter: saturate(0.3);
  pointer-events: none;
}

/* Selected element pulsing border */
@keyframes pulse-select {
  0%, 100% { box-shadow: 0 0 0 2px rgba(110, 74, 255, 0.4); }
  50% { box-shadow: 0 0 0 5px rgba(110, 74, 255, 0.8); }
}
.selected > .cat-node-icon,
.selected > .skill-node-orb,
.selected > .char-avatar-main {
  animation: pulse-select 1.2s ease-in-out infinite;
}

/* CHARACTER NODE at center */
.character-node { position: absolute; left: -40px; top: -40px; width: 80px; height: 80px; z-index: 20; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.char-glow { position: absolute; width: 120px; height: 120px; left: -20px; top: -20px; border-radius: 50%; background: radial-gradient(circle, rgba(110,74,255,0.3), transparent 70%); animation: pulse-glow 3s ease-in-out infinite; }
@keyframes pulse-glow { 0%,100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.15); opacity: 0.8; } }
.char-avatar-main {
  width: 64px; height: 64px;
  border: 3px solid #6e4aff;
  border-radius: 50%;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: #12122e;
  z-index: 2;
  position: relative;
}
.avatar-img-main { width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; image-rendering: crisp-edges; }
.avatar-letter-main { font-size: 28px; color: #a080ff; }
.char-level-ring { position: absolute; bottom: -8px; background: #0e0e2a; border: 2px solid #ffd700; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; z-index: 3; }
.char-level-ring span { font-size: 10px; font-weight: 900; color: #ffd700; font-family: 'Press Start 2P', monospace; }

/* CATEGORY ZONES (SQUARE with rounded corners) */
.category-zone {
  position: absolute;
  border: 1px dashed;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2;
  border-radius: 12px;
}
.zone-label { font-size: 11px; color: rgba(200,200,240,0.3); text-transform: uppercase; letter-spacing: 1px; pointer-events: none; }
.zone-progress { font-size: 10px; color: rgba(200,200,240,0.2); }

/* CATEGORY NODE */
.map-category-node {
  position: absolute;
  z-index: 10;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 120px;
  transition: filter 0.2s;
}
.map-category-node:hover { z-index: 15; }
.map-category-node:hover .cat-node-glow { opacity: 0.4; }
.cat-node-glow { position: absolute; width: 80px; height: 80px; border-radius: 50%; filter: blur(25px); opacity: 0.2; top: -14px; left: 20px; }
.cat-node-icon {
  width: 56px; height: 56px;
  border: 2px solid;
  background: #0e0e2a;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px;
  position: relative;
  z-index: 2;
  transition: border-color 0.2s, box-shadow 0.2s;
  image-rendering: pixelated;
}
.cat-node-label { margin-top: 6px; font-size: 11px; font-weight: 600; color: #c0c0e0; text-align: center; text-shadow: 0 1px 4px rgba(0,0,0,0.8); }

/* Category progress bar and XP */
.cat-node-xp { margin-top: 3px; width: 80px; text-align: center; }
.cat-progress-bar { width: 100%; height: 4px; background: #1a1a3a; border-radius: 2px; overflow: hidden; }
.cat-progress-fill { height: 100%; transition: width 0.3s; border-radius: 2px; }
.cat-xp-text { font-size: 8px; color: #ffd700; }

.cat-node-ring { position: absolute; top: -4px; left: 18px; width: 64px; height: 64px; z-index: 1; }
.cat-node-ring svg { width: 100%; height: 100%; }
.ring-bg { fill: none; stroke: #1a1a3a; stroke-width: 2; }
.ring-fill { fill: none; stroke-width: 2.5; stroke-linecap: round; transition: stroke-dasharray 0.4s; }

/* SKILL NODE on map */
.map-skill-node {
  position: absolute;
  z-index: 12;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: filter 0.2s;
}
.map-skill-node:hover { z-index: 16; }
.skill-node-orb {
  width: 44px; height: 44px;
  border: 2px solid;
  border-radius: 50%;
  background: #0e0e2a;
  display: flex; align-items: center; justify-content: center;
  position: relative;
  transition: all 0.2s;
}
.skill-node-orb:hover { box-shadow: 0 0 12px rgba(110,74,255,0.4); }

/* Glow effects for node states */
.map-skill-node.completed .skill-node-orb { box-shadow: 0 0 16px rgba(128, 255, 128, 0.3); border-color: #80ff80 !important; }
.map-skill-node.in-progress .skill-node-orb { box-shadow: 0 0 16px rgba(110, 74, 255, 0.3); }

.skill-node-icon { font-size: 20px; image-rendering: pixelated; }
.completed-check { position: absolute; bottom: -4px; right: -4px; width: 16px; height: 16px; background: #2a5a2a; border: 1px solid #80ff80; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #80ff80; }
.skill-node-label { margin-top: 4px; font-size: 10px; color: #c0c0e0; text-align: center; max-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 4px rgba(0,0,0,0.8); }

/* Node progress bar and XP */
.skill-node-progress-bar { width: 44px; height: 3px; background: #1a1a3a; border-radius: 2px; overflow: hidden; margin-top: 2px; }
.skill-node-progress-fill { height: 100%; background: #6e4aff; transition: width 0.3s; border-radius: 2px; }
.map-skill-node.completed .skill-node-progress-fill { background: #80ff80; }
.skill-node-xp-text { font-size: 8px; color: #ffd700; margin-top: 1px; }

/* LEVEL NODE on map (visual tree branch) */
.map-level-node {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 13;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: all 0.2s;
}
.map-level-node:hover { z-index: 17; }

.level-orb {
  width: 32px; height: 32px;
  border: 2px solid #6e4aff;
  border-radius: 50%;
  background: #12122e;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.level-orb.done {
  border-color: #80ff80;
  box-shadow: 0 0 10px rgba(128, 255, 128, 0.3);
  background: rgba(42, 90, 42, 0.3);
}
.level-orb.locked {
  border-color: #3a3a6a;
  opacity: 0.5;
  cursor: not-allowed;
}
.level-orb:hover:not(.locked) {
  box-shadow: 0 0 12px rgba(110, 74, 255, 0.5);
}
.level-num-badge {
  font-size: 11px;
  font-weight: 900;
  color: #a080ff;
  font-family: 'Press Start 2P', monospace;
}
.level-orb.done .level-num-badge { color: #80ff80; }
.level-orb.locked .level-num-badge { color: #3a3a6a; }

.level-orb-label {
  margin-top: 2px;
  font-size: 9px;
  color: #c0c0e0;
  text-align: center;
  max-width: 70px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
}
.level-orb-stat {
  font-size: 8px;
  color: #ffd700;
}

/* SUB-SKILL on map (visual tree branch) */
.map-sub-skill {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 14;
  cursor: pointer;
  transition: all 0.15s;
}
.map-sub-skill:hover { z-index: 18; }

.sub-skill-rect {
  width: 40px;
  height: 24px;
  background: #1a1a3a;
  border: 1px solid #3a3a6a;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  overflow: hidden;
}
.sub-skill-rect.completed {
  background: rgba(42, 90, 42, 0.3);
  border-color: #80ff80;
  box-shadow: 0 0 6px rgba(128, 255, 128, 0.2);
}
.sub-skill-rect:hover {
  border-color: #6e4aff;
  box-shadow: 0 0 8px rgba(110, 74, 255, 0.3);
}
.sub-skill-title {
  font-size: 7px;
  color: #c0c0e0;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  padding: 0 2px;
}
.sub-skill-rect.completed .sub-skill-title { color: #80ff80; }

/* EXPANDED NODE PANEL (on map - compact actions) */
.node-expand-panel {
  position: absolute;
  transform: translate(0, 0);
  background: rgba(14,14,42,0.96);
  border: 1px solid #2a2a5a;
  padding: 10px 14px;
  z-index: 50;
  backdrop-filter: blur(8px);
  border-radius: 8px;
  min-width: 200px;
}
.expand-panel-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.expand-panel-header h3 { flex: 1; font-size: 13px; color: #e0e0ff; margin: 0; }
.expand-xp { font-size: 11px; color: #ffd700; }
.expand-actions { display: flex; gap: 4px; }

/* ADD NODE BUTTON */
.add-node-btn { position: absolute; transform: translate(-50%, -50%); z-index: 14; background: #1a3a1a; border: 1px solid #3a6a3a; color: #80ff80; padding: 4px 12px; font-size: 11px; cursor: pointer; transition: all 0.15s; border-radius: 4px; }
.add-node-btn:hover { background: #2a5a2a; }

/* LEVEL PANEL (side) */
.level-panel-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 1000; display: flex; justify-content: flex-end; }
.level-panel { width: 440px; max-width: 95vw; height: 100vh; background: #0e0e2a; border-left: 2px solid #2a2a5a; display: flex; flex-direction: column; animation: slideR 0.25s ease; }
@keyframes slideR { from { transform: translateX(100%); } to { transform: translateX(0); } }
.lp-header { padding: 20px; border-bottom: 1px solid #2a2a5a; }
.lp-header h2 { margin: 0 0 4px; font-size: 18px; color: #e0e0ff; }
.lp-header p { font-size: 12px; color: #6060a0; margin: 0 0 8px; }
.lp-progress { display: flex; align-items: center; gap: 8px; }
.lp-bar { flex: 1; height: 8px; background: #12122e; border: 1px solid #2a2a5a; overflow: hidden; }
.lp-fill { height: 100%; background: linear-gradient(90deg, #6e4aff, #a080ff); transition: width 0.4s; }
.lp-progress span { font-size: 11px; color: #ffd700; white-space: nowrap; }
.lp-body { flex: 1; overflow-y: auto; padding: 16px 20px; }

.sub-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.sub-row { display: flex; align-items: center; gap: 8px; background: #12122e; border: 1px solid #1a1a3a; padding: 8px 10px; }
.sub-row.done { border-color: #2a5a2a; background: rgba(58,106,58,0.08); }
.sub-check { width: 24px; height: 24px; border: 1px solid #3a3a6a; display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer; background: transparent; color: #3a3a6a; flex-shrink: 0; }
.sub-row.done .sub-check { color: #80ff80; border-color: #3a6a3a; }
.sub-info { flex: 1; min-width: 0; }
.sub-title { font-size: 13px; color: #e0e0ff; display: block; }
.sub-desc { font-size: 10px; color: #6060a0; display: block; }
.sub-xp { font-size: 11px; color: #ffd700; white-space: nowrap; }

.exam-box { margin-top: 16px; padding: 14px; background: #181838; border: 2px solid #4a3a0a; }
.exam-box.passed { border-color: #3a6a3a; }
.exam-title { font-size: 14px; color: #ffd700; font-weight: 600; }
.exam-box p { font-size: 11px; color: #6060a0; margin: 6px 0; }
.exam-bonus { font-size: 12px; color: #ffd700; margin-bottom: 8px; }
.exam-btn { width: 100%; padding: 10px; background: #3a3a0a; border-color: #6a6a1a; color: #ffd700; }
.exam-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.exam-passed { color: #80ff80; font-size: 14px; display: flex; align-items: center; gap: 8px; }

/* MODALS */
.modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 16px; }
.modal-box { background: #0e0e2a; border: 2px solid #2a2a5a; max-width: 500px; width: 100%; max-height: 85vh; overflow-y: auto; padding: 24px; animation: fadeUp 0.2s ease; border-radius: 8px; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
.modal-box h2 { margin: 0 0 16px; font-size: 17px; color: #e0e0ff; }
.modal-box label { display: block; font-size: 11px; color: #8080b0; margin-bottom: 10px; }
.rinput { width: 100%; background: #12122e; border: 1px solid #3a3a6a; color: #e0e0ff; padding: 8px 10px; font-size: 13px; font-family: inherit; box-sizing: border-box; margin-top: 3px; display: block; border-radius: 4px; }
.rinput:focus { border-color: #6e4aff; outline: none; }
.rinput.small { width: 80px; }
textarea.rinput { resize: vertical; min-height: 50px; }
.rcolor { width: 44px; height: 34px; border: 1px solid #3a3a6a; background: transparent; cursor: pointer; margin-top: 3px; }
.row3 { display: flex; gap: 10px; }
.row3 > label { flex: 1; }
.mactions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.center-text { text-align: center; }
.hint { font-size: 12px; color: #6060a0; line-height: 1.5; margin: 8px 0 16px; }
.ie-btns { display: flex; gap: 10px; justify-content: center; margin-bottom: 12px; }
.upload-btn { cursor: pointer; }
.import-msg { padding: 6px 10px; font-size: 12px; margin-bottom: 8px; border-radius: 4px; }
.import-msg.ok { color: #80ff80; border: 1px solid #3a6a3a; }
.import-msg.err { color: #ff8080; border: 1px solid #6a3a3a; }
.prompt-area { font-size: 11px; line-height: 1.5; cursor: pointer; }

.form-section { margin-top: 16px; padding-top: 12px; border-top: 1px solid #2a2a5a; }
.form-section h3 { font-size: 14px; color: #e0e0ff; margin: 0 0 4px; }
.level-images-list { margin: 8px 0; }
.li-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #c0c0e0; }
.li-add-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }

/* CONTEXT MENU */
.ctx-menu { position: fixed; z-index: 2000; background: #12122e; border: 1px solid #3a3a6a; min-width: 150px; padding: 4px; border-radius: 6px; }
.ctx-menu button { display: block; width: 100%; background: none; border: none; color: #c0c0e0; padding: 6px 10px; font-size: 12px; cursor: pointer; text-align: left; font-family: inherit; border-radius: 4px; }
.ctx-menu button:hover { background: #1a1a3a; }
.ctx-menu button.red:hover { color: #ff4444; }

/* RESPONSIVE */
@media (max-width: 768px) {
  .hud-bar { padding: 8px 12px; gap: 8px; }
  .xp-hud-bar { width: 100px; }
  .level-panel { width: 100vw; }
  .node-expand-panel { min-width: 160px; }
  .lock-toggles { gap: 2px; }
  .lock-btn { padding: 3px 6px; font-size: 9px; }
  .hud-actions { flex-wrap: wrap; }
}
</style>
