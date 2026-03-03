<template>
    <div v-if="modelValue" class="tree-modal-overlay" @click.self="$emit('update:modelValue', false)">
        <div class="tree-modal">
            <div class="tree-modal-header">
                <span class="tree-modal-title">🌳 Структура файлов</span>
                <div class="tree-modal-controls">
                    <button class="tree-modal-btn" @click="$emit('reset')">↺ Сброс</button>
                    <button class="tree-modal-btn tree-modal-close-btn" @click="$emit('update:modelValue', false)">✕ Закрыть</button>
                </div>
            </div>
            <div class="tree-viewport"
                 :class="{ panning: treeIsPanning }"
                 @wheel.prevent="$emit('wheel', $event)"
                 @mousedown="$emit('pan-start', $event)">
                <svg xmlns="http://www.w3.org/2000/svg"
                     :width="treeSvgSize.w"
                     :height="treeSvgSize.h"
                     :style="{ transform: treeTransform, transformOrigin: '0 0' }">
                    <defs>
                        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                            <path d="M0,0 L0,6 L6,3 z" fill="#45475a"/>
                        </marker>
                    </defs>
                    <path v-for="edge in treeRenderData.edges" :key="'e'+edge.id"
                          :d="`M${edge.x1},${edge.y1} C${edge.x1+50},${edge.y1} ${edge.x2-50},${edge.y2} ${edge.x2},${edge.y2}`"
                          class="tree-edge" marker-end="url(#arrowhead)" />
                    <g v-for="node in treeRenderData.nodes" :key="node.id"
                       :transform="`translate(${node.x},${node.y})`"
                       class="tree-node-group"
                       @click.stop="$emit('toggle-node', node)">
                        <rect :width="nodeW" :height="nodeH" rx="7"
                              :class="['tree-node-rect', node.isFolder ? 'tree-node-folder' : 'tree-node-file', node.collapsed ? 'tree-node-collapsed' : '']" />
                        <text x="12" :y="nodeH/2" class="tree-node-icon" dominant-baseline="central">
                            {{ node.isFolder ? (node.collapsed ? '📁' : '📂') : '📄' }}
                        </text>
                        <text x="34" :y="nodeH/2" class="tree-node-name" dominant-baseline="central">{{ node.name }}</text>
                        <text v-if="node.children.length > 0" :x="nodeW - 14" :y="nodeH/2"
                              class="tree-collapse-icon" dominant-baseline="central">
                            {{ node.collapsed ? '+' : '−' }}
                        </text>
                        <title v-if="node.comment || node.fullName !== node.name">{{ node.fullName }}{{ node.comment ? ' — ' + node.comment : '' }}</title>
                    </g>
                </svg>
            </div>
        </div>
    </div>
</template>

<script setup>
defineProps({
    modelValue: Boolean,
    treeRenderData: { type: Object, default: () => ({ nodes: [], edges: [] }) },
    treeSvgSize: { type: Object, default: () => ({ w: 800, h: 600 }) },
    treeTransform: { type: String, default: '' },
    treeIsPanning: Boolean,
    nodeW: { type: Number, default: 200 },
    nodeH: { type: Number, default: 36 },
});

defineEmits(['update:modelValue', 'reset', 'wheel', 'pan-start', 'toggle-node']);
</script>

<style scoped>
.tree-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    background: rgba(0, 0, 0, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
}

.tree-modal {
    background: #13131f;
    border: 1px solid #313244;
    border-radius: 14px;
    width: 92vw;
    height: 87vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
}

.tree-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 20px;
    border-bottom: 1px solid #313244;
    flex-shrink: 0;
}

.tree-modal-title { color: #cba6f7; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }

.tree-modal-controls { display: flex; gap: 8px; }

.tree-modal-btn {
    padding: 5px 13px;
    border: 1px solid #45475a;
    border-radius: 6px;
    background: #313244;
    color: #cdd6f4;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
}
.tree-modal-btn:hover { background: #45475a; }
.tree-modal-close-btn { border-color: #f38ba855; color: #f38ba8; }
.tree-modal-close-btn:hover { background: #3b1f2b; }

.tree-viewport {
    flex: 1;
    overflow: hidden;
    cursor: grab;
    user-select: none;
    position: relative;
    background: radial-gradient(ellipse at center, #1a1a2e 0%, #11111b 100%);
}
.tree-viewport.panning { cursor: grabbing; }
</style>
