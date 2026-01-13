<script setup lang="ts">
import { ref } from "vue";
import type { CanvasToolType } from "../../types/canvas";

const props = defineProps<{
  tool: CanvasToolType;
  color: string;
  strokeWidth: number;
  stickyColor: string;
  colors: readonly string[];
  brushSizes: readonly number[];
  stickyColors: readonly string[];
}>();

const emit = defineEmits<{
  "update:tool": [value: CanvasToolType];
  "update:color": [value: string];
  "update:strokeWidth": [value: number];
  "update:stickyColor": [value: string];
}>();

const showColorPicker = ref(false);
const showStrokePicker = ref(false);
const showStickyPicker = ref(false);

interface Tool {
  id: CanvasToolType;
  icon: string;
  label: string;
}

const tools: Tool[] = [
  { id: "select", icon: "cursor", label: "Выбор (V)" },
  { id: "block", icon: "block", label: "Блок (B)" },
  { id: "headerBlock", icon: "headerBlock", label: "Блок с заголовком (H)" },
  { id: "arrow", icon: "arrow", label: "Стрелка / Связь (A)" },
  { id: "draw", icon: "pencil", label: "Карандаш (P)" },
  { id: "rectangle", icon: "square", label: "Прямоугольник (R)" },
  { id: "circle", icon: "circle", label: "Круг (C)" },
  { id: "line", icon: "line", label: "Линия (L)" },
  { id: "text", icon: "text", label: "Текст (T)" },
  { id: "sticky", icon: "sticky", label: "Стикер (S)" },
];

function selectTool(toolId: CanvasToolType) {
  emit("update:tool", toolId);
  showColorPicker.value = false;
  showStrokePicker.value = false;
  showStickyPicker.value = false;
}

function selectColor(color: string) {
  emit("update:color", color);
  showColorPicker.value = false;
}

function selectStrokeWidth(width: number) {
  emit("update:strokeWidth", width);
  showStrokePicker.value = false;
}

function selectStickyColor(color: string) {
  emit("update:stickyColor", color);
  showStickyPicker.value = false;
}
</script>

<template>
  <div class="canvas-toolbar">
    <!-- Tools -->
    <div class="toolbar-section">
      <button
        v-for="t in tools"
        :key="t.id"
        class="tool-btn"
        :class="{ active: tool === t.id }"
        :title="t.label"
        @click="selectTool(t.id)"
      >
        <!-- Select/Cursor -->
        <svg v-if="t.icon === 'cursor'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
          <path d="M13 13l6 6"/>
        </svg>
        <!-- Block -->
        <svg v-else-if="t.icon === 'block'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        <!-- Header Block -->
        <svg v-else-if="t.icon === 'headerBlock'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
        </svg>
        <!-- Pencil -->
        <svg v-else-if="t.icon === 'pencil'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
        <!-- Rectangle -->
        <svg v-else-if="t.icon === 'square'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        </svg>
        <!-- Circle -->
        <svg v-else-if="t.icon === 'circle'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
        </svg>
        <!-- Line -->
        <svg v-else-if="t.icon === 'line'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="5" y1="19" x2="19" y2="5"/>
        </svg>
        <!-- Arrow -->
        <svg v-else-if="t.icon === 'arrow'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="5" y1="19" x2="19" y2="5"/>
          <polyline points="10,5 19,5 19,14"/>
        </svg>
        <!-- Text -->
        <svg v-else-if="t.icon === 'text'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 7 4 4 20 4 20 7"/>
          <line x1="9" y1="20" x2="15" y2="20"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
        </svg>
        <!-- Sticky -->
        <svg v-else-if="t.icon === 'sticky'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15.5 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V8.5L15.5 3z"/>
          <polyline points="15,3 15,9 21,9"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Color picker -->
    <div class="toolbar-section">
      <div class="color-picker-wrapper">
        <button
          class="tool-btn color-btn"
          :style="{ '--current-color': color }"
          title="Цвет"
          @click="showColorPicker = !showColorPicker"
        >
          <div class="color-preview"></div>
        </button>
        <div v-if="showColorPicker" class="picker-popup">
          <div class="color-grid">
            <button
              v-for="c in colors"
              :key="c"
              class="color-option"
              :class="{ active: color === c }"
              :style="{ background: c }"
              @click="selectColor(c)"
            ></button>
          </div>
        </div>
      </div>
    </div>

    <!-- Stroke width picker -->
    <div class="toolbar-section">
      <div class="stroke-picker-wrapper">
        <button
          class="tool-btn"
          title="Толщина линии"
          @click="showStrokePicker = !showStrokePicker"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="strokeWidth">
            <line x1="4" y1="12" x2="20" y2="12"/>
          </svg>
        </button>
        <div v-if="showStrokePicker" class="picker-popup">
          <div class="stroke-options">
            <button
              v-for="size in brushSizes"
              :key="size"
              class="stroke-option"
              :class="{ active: strokeWidth === size }"
              @click="selectStrokeWidth(size)"
            >
              <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                <line x1="4" y1="10" x2="28" y2="10" stroke="white" :stroke-width="size"/>
              </svg>
              <span>{{ size }}px</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Sticky color picker (only show when sticky tool is selected) -->
    <div v-if="tool === 'sticky'" class="toolbar-section">
      <div class="sticky-picker-wrapper">
        <button
          class="tool-btn color-btn"
          :style="{ '--current-color': stickyColor }"
          title="Цвет стикера"
          @click="showStickyPicker = !showStickyPicker"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <rect x="3" y="3" width="18" height="18" rx="3" :fill="stickyColor"/>
          </svg>
        </button>
        <div v-if="showStickyPicker" class="picker-popup">
          <div class="color-grid sticky-grid">
            <button
              v-for="c in stickyColors"
              :key="c"
              class="color-option"
              :class="{ active: stickyColor === c }"
              :style="{ background: c }"
              @click="selectStickyColor(c)"
            ></button>
          </div>
        </div>
      </div>
    </div>

    <div class="toolbar-spacer"></div>

    <!-- Keyboard shortcuts hint -->
    <div class="shortcuts-hint">
      <div class="shortcut-item">
        <span>B</span>
        <small>блок</small>
      </div>
      <div class="shortcut-item">
        <span>A</span>
        <small>стрелка</small>
      </div>
      <div class="shortcut-item">
        <span>Shift</span>
        <small>прямо</small>
      </div>
      <div class="shortcut-item">
        <span>2x клик</span>
        <small>редакт.</small>
      </div>
      <div class="shortcut-item">
        <span>Del</span>
        <small>удалить</small>
      </div>
      <div class="shortcut-item">
        <span>Ctrl+Z</span>
        <small>отмена</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 56px;
  padding: 12px 8px;
  background: rgba(26, 27, 38, 0.95);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
}

.toolbar-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.tool-btn.active {
  background: rgba(99, 102, 241, 0.2);
  color: #6366f1;
}

.toolbar-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

.toolbar-spacer {
  flex: 1;
}

/* Color picker */
.color-picker-wrapper,
.stroke-picker-wrapper,
.sticky-picker-wrapper {
  position: relative;
}

.color-btn {
  --current-color: #ffffff;
}

.color-preview {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--current-color);
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.picker-popup {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 8px;
  padding: 12px;
  background: rgba(26, 27, 38, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  z-index: 100;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.sticky-grid {
  grid-template-columns: repeat(3, 1fr);
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.5);
}

/* Stroke options */
.stroke-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 100px;
}

.stroke-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.stroke-option:hover {
  background: rgba(255, 255, 255, 0.08);
}

.stroke-option.active {
  background: rgba(99, 102, 241, 0.2);
  color: #6366f1;
}

/* Shortcuts hint */
.shortcuts-hint {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.shortcut-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.shortcut-item span {
  display: block;
  padding: 3px 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  font-family: monospace;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
}

.shortcut-item small {
  font-size: 8px;
  color: rgba(255, 255, 255, 0.3);
}
</style>
