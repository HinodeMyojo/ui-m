<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { getDiagram, updateDiagram } from "@/api/diagrams.js";

const router = useRouter();
const route = useRoute();

// ─── State ───────────────────────────────────────────────────────────────────
const diagram = ref(null);
const loading = ref(true);
const saving = ref(false);
const saveTimer = ref(null);
const unsaved = ref(false);
const errorMsg = ref("");

const nodes = ref([]);
const edges = ref([]);
const viewport = reactive({ x: 0, y: 0, zoom: 1 });

// Selection
const selectedIds = ref(new Set());
const editingNodeId = ref(null);

// Tool
const tool = ref("select"); // select | node | edge | pan

// Edge drawing
const drawingEdge = ref(null); // { fromId, x1, y1, x2, y2 }

// Pan/drag
const isPanning = ref(false);
const panStart = ref(null);
const draggingNode = ref(null);
const dragOffset = ref({ x: 0, y: 0 });
const dragMoved = ref(false);

// Canvas element
const svgEl = ref(null);
const containerEl = ref(null);

// Right panel (node details)
const showPanel = ref(false);
const panelNode = ref(null);

// Node picker
const showNodePicker = ref(false);
const nodePickerPos = ref({ x: 0, y: 0 });

// ─── Node types ──────────────────────────────────────────────────────────────
const NODE_TYPES = [
  { type: "service",  label: "Сервис",      icon: "⚙️",  color: "#4f46e5" },
  { type: "database", label: "База данных", icon: "🗄️",  color: "#0891b2" },
  { type: "queue",    label: "Очередь",     icon: "📨",  color: "#d97706" },
  { type: "client",   label: "Клиент",      icon: "🖥️",  color: "#059669" },
  { type: "gateway",  label: "Gateway",     icon: "🔀",  color: "#7c3aed" },
  { type: "cache",    label: "Кэш",         icon: "⚡",  color: "#dc2626" },
  { type: "storage",  label: "Хранилище",   icon: "📦",  color: "#b45309" },
  { type: "external", label: "Внешний",     icon: "🌐",  color: "#374151" },
  { type: "group",    label: "Группа",      icon: "▣",   color: "#1f2937" },
  { type: "note",     label: "Заметка",     icon: "📝",  color: "#854d0e" },
  { type: "process",  label: "Процесс",     icon: "⟳",   color: "#166534" },
  { type: "decision", label: "Решение",     icon: "◇",   color: "#6b21a8" },
];

const NODE_TYPE_MAP = Object.fromEntries(NODE_TYPES.map(t => [t.type, t]));

const EDGE_TYPES = [
  { type: "arrow",          label: "Стрелка" },
  { type: "dashed",         label: "Пунктир" },
  { type: "bidirectional",  label: "Двусторонняя" },
  { type: "thick",          label: "Широкая" },
];

// ─── Computed ─────────────────────────────────────────────────────────────────
const selectedNode = computed(() => {
  if (selectedIds.value.size !== 1) return null;
  const id = [...selectedIds.value][0];
  return nodes.value.find(n => n.id === id) || null;
});

const selectedEdge = computed(() => {
  if (selectedIds.value.size !== 1) return null;
  const id = [...selectedIds.value][0];
  return edges.value.find(e => e.id === id) || null;
});

// Transform string for SVG g element
const transformStr = computed(() =>
  `translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`
);

// ─── Load ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const data = await getDiagram(route.params.id);
    diagram.value = data;
    nodes.value = Array.isArray(data.nodes) ? data.nodes : [];
    edges.value = Array.isArray(data.edges) ? data.edges : [];
    if (data.viewport) {
      viewport.x = data.viewport.x ?? 0;
      viewport.y = data.viewport.y ?? 0;
      viewport.zoom = data.viewport.zoom ?? 1;
    }
  } catch (e) {
    errorMsg.value = "Ошибка загрузки диаграммы";
  } finally {
    loading.value = false;
  }

  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  if (saveTimer.value) clearTimeout(saveTimer.value);
});

// ─── Auto-save ────────────────────────────────────────────────────────────────
function scheduleSave() {
  unsaved.value = true;
  if (saveTimer.value) clearTimeout(saveTimer.value);
  saveTimer.value = setTimeout(saveNow, 1500);
}

async function saveNow() {
  if (!diagram.value) return;
  saving.value = true;
  try {
    await updateDiagram(route.params.id, {
      nodes: nodes.value,
      edges: edges.value,
      viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    });
    unsaved.value = false;
  } catch {
    // silent
  } finally {
    saving.value = false;
  }
}

// Watch for changes
watch([nodes, edges], scheduleSave, { deep: true });

// ─── SVG helpers ──────────────────────────────────────────────────────────────
function svgPoint(clientX, clientY) {
  const rect = svgEl.value.getBoundingClientRect();
  return {
    x: (clientX - rect.left - viewport.x) / viewport.zoom,
    y: (clientY - rect.top - viewport.y) / viewport.zoom,
  };
}

function nodeCenter(node) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

// ─── Viewport (pan + zoom) ───────────────────────────────────────────────────
function onWheel(e) {
  e.preventDefault();
  const rect = svgEl.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(4, Math.max(0.15, viewport.zoom * factor));
  viewport.x = mx - (mx - viewport.x) * (newZoom / viewport.zoom);
  viewport.y = my - (my - viewport.y) * (newZoom / viewport.zoom);
  viewport.zoom = newZoom;
  scheduleSave();
}

// ─── Mouse events ─────────────────────────────────────────────────────────────
function onSvgMouseDown(e) {
  if (e.button !== 0) return;

  // Pan mode or middle button
  if (tool.value === "pan" || e.altKey) {
    isPanning.value = true;
    panStart.value = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
    return;
  }

  if (tool.value === "node") {
    // Show node picker at click position
    const pt = svgPoint(e.clientX, e.clientY);
    nodePickerPos.value = pt;
    showNodePicker.value = true;
    return;
  }

  // Deselect on background click
  if (e.target === svgEl.value || e.target.classList.contains("canvas-bg")) {
    selectedIds.value = new Set();
    showPanel.value = false;
    editingNodeId.value = null;
  }
}

function onSvgMouseMove(e) {
  if (isPanning.value && panStart.value) {
    viewport.x = e.clientX - panStart.value.x;
    viewport.y = e.clientY - panStart.value.y;
    return;
  }

  if (draggingNode.value) {
    const pt = svgPoint(e.clientX, e.clientY);
    const node = nodes.value.find(n => n.id === draggingNode.value);
    if (node) {
      node.x = pt.x - dragOffset.value.x;
      node.y = pt.y - dragOffset.value.y;
      dragMoved.value = true;
    }
    return;
  }

  if (drawingEdge.value) {
    const pt = svgPoint(e.clientX, e.clientY);
    drawingEdge.value.x2 = pt.x;
    drawingEdge.value.y2 = pt.y;
  }
}

function onSvgMouseUp(e) {
  isPanning.value = false;
  panStart.value = null;

  if (draggingNode.value) {
    draggingNode.value = null;
    if (dragMoved.value) scheduleSave();
    dragMoved.value = false;
  }

  if (drawingEdge.value) {
    drawingEdge.value = null;
  }
}

// ─── Node events ──────────────────────────────────────────────────────────────
function onNodeMouseDown(e, node) {
  e.stopPropagation();
  if (e.button !== 0) return;

  if (tool.value === "edge") {
    const c = nodeCenter(node);
    drawingEdge.value = { fromId: node.id, x1: c.x, y1: c.y, x2: c.x, y2: c.y };
    return;
  }

  if (tool.value === "select" || tool.value === "pan") {
    if (!e.shiftKey) selectedIds.value = new Set([node.id]);
    else selectedIds.value = new Set([...selectedIds.value, node.id]);

    draggingNode.value = node.id;
    dragMoved.value = false;
    const pt = svgPoint(e.clientX, e.clientY);
    dragOffset.value = { x: pt.x - node.x, y: pt.y - node.y };
  }
}

function onNodeMouseUp(e, node) {
  e.stopPropagation();
  if (drawingEdge.value && drawingEdge.value.fromId !== node.id) {
    addEdge(drawingEdge.value.fromId, node.id);
    drawingEdge.value = null;
    return;
  }
  if (!dragMoved.value && tool.value === "select") {
    openPanel(node);
  }
}

// ─── Node picker ──────────────────────────────────────────────────────────────
function pickNodeType(typeDef) {
  addNode(typeDef.type, nodePickerPos.value);
  showNodePicker.value = false;
  tool.value = "select";
}

function addNode(type, pos) {
  const def = NODE_TYPE_MAP[type] || NODE_TYPES[0];
  const isGroup = type === "group";
  const isDiamond = type === "decision";
  const w = isGroup ? 260 : isDiamond ? 120 : 160;
  const h = isGroup ? 160 : isDiamond ? 80 : 80;
  const node = {
    id: crypto.randomUUID(),
    type,
    x: pos.x - w / 2,
    y: pos.y - h / 2,
    width: w,
    height: h,
    label: def.label,
    description: "",
    technology: "",
    status: "active",
    color: def.color,
    tags: [],
    meta: {},
  };
  nodes.value.push(node);
  selectedIds.value = new Set([node.id]);
  openPanel(node);
}

// ─── Edge ────────────────────────────────────────────────────────────────────
function addEdge(fromId, toId) {
  const edge = {
    id: crypto.randomUUID(),
    fromId,
    toId,
    type: "arrow",
    label: "",
    protocol: "",
    color: "",
  };
  edges.value.push(edge);
  selectedIds.value = new Set([edge.id]);
  showPanel.value = true;
  panelNode.value = null;
}

function onEdgeClick(e, edge) {
  e.stopPropagation();
  selectedIds.value = new Set([edge.id]);
  showPanel.value = true;
  panelNode.value = null;
}

// ─── Panel ───────────────────────────────────────────────────────────────────
function openPanel(node) {
  panelNode.value = node;
  showPanel.value = true;
}

// ─── Delete ──────────────────────────────────────────────────────────────────
function deleteSelected() {
  for (const id of selectedIds.value) {
    nodes.value = nodes.value.filter(n => n.id !== id);
    edges.value = edges.value.filter(e => e.id !== id && e.fromId !== id && e.toId !== id);
  }
  selectedIds.value = new Set();
  showPanel.value = false;
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
function onKeyDown(e) {
  if (editingNodeId.value) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
  if (e.key === "s" && !e.ctrlKey) tool.value = "select";
  if (e.key === "n") { tool.value = "node"; }
  if (e.key === "e") tool.value = "edge";
  if (e.key === "h") tool.value = "pan";
  if ((e.key === "s" && e.ctrlKey) || (e.key === "s" && e.metaKey)) {
    e.preventDefault();
    saveNow();
  }
}

// ─── Edge path ────────────────────────────────────────────────────────────────
function edgePath(edge) {
  const from = nodes.value.find(n => n.id === edge.fromId);
  const to = nodes.value.find(n => n.id === edge.toId);
  if (!from || !to) return "";
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  const tx = to.x + to.width / 2;
  const ty = to.y + to.height / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  const cx = fx + dx * 0.5;
  const cy = fy + dy * 0.5;
  return `M ${fx} ${fy} Q ${cx} ${fy} ${tx} ${ty}`;
}

function edgeMidpoint(edge) {
  const from = nodes.value.find(n => n.id === edge.fromId);
  const to = nodes.value.find(n => n.id === edge.toId);
  if (!from || !to) return { x: 0, y: 0 };
  return {
    x: (from.x + from.width / 2 + to.x + to.width / 2) / 2,
    y: (from.y + from.height / 2 + to.y + to.height / 2) / 2,
  };
}

function edgeStrokeDash(type) {
  if (type === "dashed") return "8 5";
  return "none";
}
function edgeStrokeWidth(type) {
  return type === "thick" ? 4 : 2;
}

// ─── Node shape ───────────────────────────────────────────────────────────────
function nodeShape(node) {
  const { type, x, y, width: w, height: h } = node;
  if (type === "database") {
    const rx = w / 2, ry = 12;
    const top = `M ${x} ${y + ry} a ${rx} ${ry} 0 0 1 ${w} 0 a ${rx} ${ry} 0 0 1 -${w} 0`;
    const body = `M ${x} ${y + ry} l 0 ${h - ry * 2} a ${rx} ${ry} 0 0 0 ${w} 0 l 0 -${h - ry * 2}`;
    return { type: "path", d: top + " " + body };
  }
  if (type === "decision") {
    const cx = x + w / 2, cy = y + h / 2;
    return { type: "path", d: `M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z` };
  }
  if (type === "group") return { type: "rect", rx: 12 };
  return { type: "rect", rx: 10 };
}

function nodeIconPos(node) {
  return { x: node.x + 14, y: node.y + node.height / 2 - 8 };
}

function nodeLabelPos(node) {
  const hasIcon = node.type !== "group" && node.type !== "note";
  return {
    x: node.x + node.width / 2,
    y: node.y + (node.type === "group" ? 22 : node.height / 2 + (node.technology ? -8 : 0)),
  };
}

function nodeTechPos(node) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 + 10 };
}

function nodeColor(node) {
  return node.color || NODE_TYPE_MAP[node.type]?.color || "#4f46e5";
}

function statusDot(status) {
  return { active: "#22c55e", deprecated: "#f59e0b", planned: "#60a5fa", failed: "#ef4444" }[status] || "#6b7280";
}

// ─── Fit to screen ───────────────────────────────────────────────────────────
function fitView() {
  if (!nodes.value.length) return;
  const xs = nodes.value.map(n => n.x);
  const ys = nodes.value.map(n => n.y);
  const xe = nodes.value.map(n => n.x + n.width);
  const ye = nodes.value.map(n => n.y + n.height);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xe), maxY = Math.max(...ye);
  const rect = svgEl.value.getBoundingClientRect();
  const padding = 80;
  const zoom = Math.min(
    (rect.width - padding * 2) / (maxX - minX),
    (rect.height - padding * 2) / (maxY - minY),
    1.5
  );
  viewport.zoom = zoom;
  viewport.x = (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom;
  viewport.y = (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom;
}
</script>

<template>
  <div class="editor" ref="containerEl">
    <!-- Loading -->
    <div v-if="loading" class="center-state">
      <div class="spinner"></div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="center-state err">{{ errorMsg }}</div>

    <template v-else>
      <!-- Top bar -->
      <div class="topbar">
        <button class="topbar-back" @click="router.push('/diagrams')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <span class="topbar-title">{{ diagram?.name }}</span>
        <div class="topbar-status">
          <span v-if="saving" class="status-text saving">Сохраняю...</span>
          <span v-else-if="unsaved" class="status-text unsaved">Не сохранено</span>
          <span v-else class="status-text saved">Сохранено</span>
        </div>
        <button class="topbar-save" @click="saveNow" :disabled="saving">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          Сохранить
        </button>
      </div>

      <!-- Toolbar -->
      <div class="toolbar">
        <button
          v-for="t in [
            { id:'select', icon:'⬡', label:'Выбор (S)' },
            { id:'node',   icon:'⊞', label:'Добавить узел (N)' },
            { id:'edge',   icon:'→', label:'Соединить (E)' },
            { id:'pan',    icon:'✥', label:'Перемещение (H)' },
          ]"
          :key="t.id"
          :class="['tool-btn', { active: tool === t.id }]"
          :title="t.label"
          @click="tool = t.id; showNodePicker = false"
        >{{ t.icon }}</button>

        <div class="toolbar-sep"></div>

        <button class="tool-btn" title="Вписать всё (F)" @click="fitView">⊡</button>
        <button class="tool-btn danger" title="Удалить выбранное (Del)" @click="deleteSelected" :disabled="!selectedIds.size">✕</button>
      </div>

      <!-- Main SVG canvas -->
      <svg
        ref="svgEl"
        class="canvas"
        :style="{ cursor: tool === 'pan' || isPanning ? 'grab' : tool === 'node' ? 'crosshair' : tool === 'edge' ? 'cell' : 'default' }"
        @mousedown="onSvgMouseDown"
        @mousemove="onSvgMouseMove"
        @mouseup="onSvgMouseUp"
        @wheel.prevent="onWheel"
        @contextmenu.prevent
      >
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.5)"/>
          </marker>
          <marker id="arrow-sel" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#a78bfa"/>
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <!-- Background grid -->
        <rect class="canvas-bg" width="100%" height="100%" fill="url(#grid-pattern)"/>
        <defs>
          <pattern id="grid-pattern" x="0" y="0"
            :width="20 * viewport.zoom"
            :height="20 * viewport.zoom"
            patternUnits="userSpaceOnUse"
            :patternTransform="`translate(${viewport.x % (20 * viewport.zoom)}, ${viewport.y % (20 * viewport.zoom)})`"
          >
            <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.07)"/>
          </pattern>
        </defs>

        <g :transform="transformStr">
          <!-- Groups first (behind everything) -->
          <g v-for="node in nodes.filter(n => n.type === 'group')" :key="'g-'+node.id">
            <rect
              :x="node.x" :y="node.y"
              :width="node.width" :height="node.height"
              rx="12"
              :fill="nodeColor(node) + '18'"
              :stroke="selectedIds.has(node.id) ? '#a78bfa' : nodeColor(node) + '55'"
              stroke-width="1.5"
              stroke-dasharray="6 4"
              @mousedown="e => onNodeMouseDown(e, node)"
              @mouseup="e => onNodeMouseUp(e, node)"
              style="cursor:move"
            />
            <text :x="node.x + 14" :y="node.y + 20" fill="rgba(255,255,255,0.5)" font-size="12" font-family="system-ui">
              {{ node.label }}
            </text>
          </g>

          <!-- Edges -->
          <g v-for="edge in edges" :key="edge.id">
            <path
              :d="edgePath(edge)"
              :stroke="selectedIds.has(edge.id) ? '#a78bfa' : (edge.color || 'rgba(255,255,255,0.35)')"
              :stroke-width="edgeStrokeWidth(edge.type)"
              :stroke-dasharray="edgeStrokeDash(edge.type)"
              fill="none"
              :marker-end="edge.type === 'bidirectional' ? 'none' : (selectedIds.has(edge.id) ? 'url(#arrow-sel)' : 'url(#arrow)')"
              :marker-start="edge.type === 'bidirectional' ? 'url(#arrow)' : 'none'"
              :filter="selectedIds.has(edge.id) ? 'url(#glow)' : 'none'"
              style="cursor:pointer"
              @mousedown="e => onEdgeClick(e, edge)"
            />
            <!-- Edge label -->
            <g v-if="edge.label || edge.protocol" :transform="`translate(${edgeMidpoint(edge).x}, ${edgeMidpoint(edge).y})`">
              <rect x="-30" y="-11" width="60" height="18" rx="5" fill="#13131f" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
              <text text-anchor="middle" y="4" fill="rgba(255,255,255,0.7)" font-size="10" font-family="system-ui">
                {{ edge.label || edge.protocol }}
              </text>
            </g>
          </g>

          <!-- Drawing edge preview -->
          <line
            v-if="drawingEdge"
            :x1="drawingEdge.x1" :y1="drawingEdge.y1"
            :x2="drawingEdge.x2" :y2="drawingEdge.y2"
            stroke="#a78bfa" stroke-width="2" stroke-dasharray="6 3"
            marker-end="url(#arrow-sel)"
          />

          <!-- Regular nodes -->
          <g
            v-for="node in nodes.filter(n => n.type !== 'group')"
            :key="node.id"
            @mousedown="e => onNodeMouseDown(e, node)"
            @mouseup="e => onNodeMouseUp(e, node)"
            style="cursor:move"
          >
            <!-- Shadow -->
            <rect
              v-if="nodeShape(node).type === 'rect'"
              :x="node.x + 3" :y="node.y + 4"
              :width="node.width" :height="node.height"
              :rx="nodeShape(node).rx || 10"
              fill="rgba(0,0,0,0.4)"
            />

            <!-- Shape body -->
            <rect
              v-if="nodeShape(node).type === 'rect'"
              :x="node.x" :y="node.y"
              :width="node.width" :height="node.height"
              :rx="nodeShape(node).rx || 10"
              :fill="nodeColor(node) + (node.type === 'note' ? 'dd' : '22')"
              :stroke="selectedIds.has(node.id) ? '#a78bfa' : nodeColor(node)"
              :stroke-width="selectedIds.has(node.id) ? 2.5 : 1.5"
              :filter="selectedIds.has(node.id) ? 'url(#glow)' : 'none'"
            />
            <path
              v-else
              :d="nodeShape(node).d"
              :fill="nodeColor(node) + '22'"
              :stroke="selectedIds.has(node.id) ? '#a78bfa' : nodeColor(node)"
              :stroke-width="selectedIds.has(node.id) ? 2.5 : 1.5"
            />

            <!-- Accent line (top) -->
            <rect
              v-if="nodeShape(node).type === 'rect' && node.type !== 'note'"
              :x="node.x + (nodeShape(node).rx || 10)" :y="node.y"
              :width="node.width - (nodeShape(node).rx || 10) * 2" height="3"
              :fill="nodeColor(node)"
              :rx="1"
            />

            <!-- Status dot -->
            <circle
              :cx="node.x + node.width - 10" :cy="node.y + 10" r="4"
              :fill="statusDot(node.status)"
            />

            <!-- Icon -->
            <text
              v-if="node.type !== 'group' && node.type !== 'note' && node.type !== 'decision'"
              :x="node.x + 14" :y="node.y + node.height / 2 + 5"
              font-size="16" font-family="system-ui"
            >{{ NODE_TYPE_MAP[node.type]?.icon }}</text>

            <!-- Label -->
            <text
              :x="nodeLabelPos(node).x" :y="nodeLabelPos(node).y + 5"
              text-anchor="middle"
              font-size="13" font-weight="600"
              font-family="system-ui"
              fill="rgba(255,255,255,0.9)"
              pointer-events="none"
            >{{ node.label }}</text>

            <!-- Technology -->
            <text
              v-if="node.technology"
              :x="nodeTechPos(node).x" :y="nodeTechPos(node).y + 5"
              text-anchor="middle" font-size="11"
              font-family="system-ui"
              fill="rgba(255,255,255,0.4)"
              pointer-events="none"
            >{{ node.technology }}</text>
          </g>
        </g>
      </svg>

      <!-- Node type picker popup -->
      <Transition name="pop">
        <div
          v-if="showNodePicker"
          class="node-picker"
          :style="{
            left: nodePickerPos.x * viewport.zoom + viewport.x + 'px',
            top: nodePickerPos.y * viewport.zoom + viewport.y + 'px',
          }"
        >
          <p class="picker-title">Выберите тип узла</p>
          <div class="picker-grid">
            <button
              v-for="t in NODE_TYPES"
              :key="t.type"
              class="picker-item"
              @click="pickNodeType(t)"
              :style="{ '--c': t.color }"
            >
              <span class="picker-icon">{{ t.icon }}</span>
              <span class="picker-label">{{ t.label }}</span>
            </button>
          </div>
          <button class="picker-cancel" @click="showNodePicker = false; tool = 'select'">Отмена</button>
        </div>
      </Transition>

      <!-- Side panel -->
      <Transition name="slide">
        <div v-if="showPanel && (selectedNode || selectedEdge)" class="panel">
          <div class="panel-header">
            <span>{{ selectedNode ? 'Узел' : 'Связь' }}</span>
            <button class="panel-close" @click="showPanel = false">✕</button>
          </div>

          <!-- Node panel -->
          <template v-if="selectedNode">
            <div class="panel-section">
              <label>Название</label>
              <input v-model="selectedNode.label" type="text" placeholder="Название узла"/>
            </div>
            <div class="panel-section">
              <label>Тип</label>
              <select v-model="selectedNode.type">
                <option v-for="t in NODE_TYPES" :key="t.type" :value="t.type">{{ t.icon }} {{ t.label }}</option>
              </select>
            </div>
            <div class="panel-section">
              <label>Технология / стек</label>
              <input v-model="selectedNode.technology" type="text" placeholder="Go, PostgreSQL, Redis..."/>
            </div>
            <div class="panel-section">
              <label>Описание</label>
              <textarea v-model="selectedNode.description" rows="3" placeholder="Что делает этот узел..."/>
            </div>
            <div class="panel-section">
              <label>Статус</label>
              <div class="status-pills">
                <button
                  v-for="s in ['active','planned','deprecated','failed']"
                  :key="s"
                  :class="['status-pill', s, { active: selectedNode.status === s }]"
                  @click="selectedNode.status = s"
                >{{ { active:'Активен', planned:'Планируется', deprecated:'Устарел', failed:'Недоступен' }[s] }}</button>
              </div>
            </div>
            <div class="panel-section">
              <label>Цвет</label>
              <div class="color-row">
                <input type="color" v-model="selectedNode.color" class="color-input"/>
                <button
                  v-for="t in NODE_TYPES"
                  :key="t.type"
                  class="color-dot"
                  :style="{ background: t.color }"
                  :title="t.label"
                  @click="selectedNode.color = t.color"
                />
              </div>
            </div>
            <div class="panel-section size-row">
              <div>
                <label>Ширина</label>
                <input type="number" v-model.number="selectedNode.width" min="80" max="600" step="10"/>
              </div>
              <div>
                <label>Высота</label>
                <input type="number" v-model.number="selectedNode.height" min="40" max="400" step="10"/>
              </div>
            </div>
            <div class="panel-section">
              <label>Мета-данные</label>
              <div v-for="(val, key) in selectedNode.meta" :key="key" class="meta-row">
                <span class="meta-key">{{ key }}</span>
                <input :value="val" @input="selectedNode.meta[key] = $event.target.value" class="meta-val"/>
                <button class="meta-del" @click="delete selectedNode.meta[key]">✕</button>
              </div>
              <button class="add-meta-btn" @click="selectedNode.meta[`key${Date.now()}`] = ''">+ Добавить</button>
            </div>
            <button class="del-node-btn" @click="deleteSelected">Удалить узел</button>
          </template>

          <!-- Edge panel -->
          <template v-if="selectedEdge">
            <div class="panel-section">
              <label>Подпись</label>
              <input v-model="selectedEdge.label" type="text" placeholder="Название связи..."/>
            </div>
            <div class="panel-section">
              <label>Протокол</label>
              <input v-model="selectedEdge.protocol" type="text" placeholder="HTTP, gRPC, AMQP..."/>
            </div>
            <div class="panel-section">
              <label>Тип линии</label>
              <div class="edge-type-pills">
                <button
                  v-for="et in EDGE_TYPES"
                  :key="et.type"
                  :class="['edge-pill', { active: selectedEdge.type === et.type }]"
                  @click="selectedEdge.type = et.type"
                >{{ et.label }}</button>
              </div>
            </div>
            <div class="panel-section">
              <label>Описание</label>
              <textarea v-model="selectedEdge.description" rows="3" placeholder="Описание связи..."/>
            </div>
            <button class="del-node-btn" @click="deleteSelected">Удалить связь</button>
          </template>
        </div>
      </Transition>

      <!-- Mini map / zoom info -->
      <div class="zoom-badge">{{ Math.round(viewport.zoom * 100) }}%</div>

      <!-- Help hint -->
      <div class="hints">
        <span>S — выбор</span>
        <span>N — узел</span>
        <span>E — связь</span>
        <span>H — рука</span>
        <span>Del — удалить</span>
        <span>Ctrl+S — сохранить</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.editor {
  position: fixed;
  inset: 0;
  background: #0a0a10;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: system-ui, sans-serif;
  color: #fff;
}

/* ── Top bar ── */
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 48px;
  background: rgba(13,13,20,0.98);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  z-index: 10;
  flex-shrink: 0;
}
.topbar-back {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: rgba(255,255,255,0.7);
  cursor: pointer; transition: all .2s;
}
.topbar-back:hover { background: rgba(255,255,255,0.1); color:#fff; }
.topbar-title { font-weight: 600; font-size: 15px; flex: 1; }
.topbar-status { font-size: 12px; }
.status-text { padding: 4px 10px; border-radius: 20px; font-size: 12px; }
.saving  { color: #60a5fa; }
.unsaved { color: #f59e0b; }
.saved   { color: #22c55e; }
.topbar-save {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  border: none; border-radius: 8px; color: #fff;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all .2s;
}
.topbar-save:hover:not(:disabled) { opacity: .9; }
.topbar-save:disabled { opacity: .5; }

/* ── Toolbar ── */
.toolbar {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
  background: rgba(13,13,20,0.95);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  padding: 8px;
}
.tool-btn {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: rgba(255,255,255,0.6);
  font-size: 18px;
  cursor: pointer;
  transition: all .15s;
}
.tool-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
.tool-btn.active { background: rgba(124,58,237,0.25); border-color: #7c3aed; color: #a78bfa; }
.tool-btn.danger:hover { background: rgba(239,68,68,0.2); color: #f87171; }
.tool-btn:disabled { opacity: .3; cursor: default; }
.toolbar-sep { height: 1px; background: rgba(255,255,255,0.08); margin: 2px 0; }

/* ── Canvas ── */
.canvas {
  flex: 1;
  width: 100%;
  user-select: none;
}
.canvas-bg { pointer-events: all; }

/* ── Node picker ── */
.node-picker {
  position: absolute;
  z-index: 20;
  background: #13131f;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 16px;
  width: 320px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
}
.picker-title {
  font-size: 12px;
  color: rgba(255,255,255,0.4);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: .06em;
}
.picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.picker-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 4px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  color: #fff; cursor: pointer;
  transition: all .15s;
}
.picker-item:hover {
  background: color-mix(in srgb, var(--c) 20%, transparent);
  border-color: var(--c);
}
.picker-icon { font-size: 20px; }
.picker-label { font-size: 11px; color: rgba(255,255,255,0.6); }
.picker-cancel {
  width: 100%; padding: 8px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: rgba(255,255,255,0.5); cursor: pointer;
  font-size: 13px; transition: all .15s;
}
.picker-cancel:hover { background: rgba(255,255,255,0.1); color: #fff; }

/* ── Side panel ── */
.panel {
  position: absolute;
  right: 0; top: 48px; bottom: 0;
  width: 300px;
  background: rgba(13,13,20,0.98);
  border-left: 1px solid rgba(255,255,255,0.07);
  overflow-y: auto;
  z-index: 10;
  padding-bottom: 24px;
}
.panel::-webkit-scrollbar { width: 4px; }
.panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  font-weight: 600; font-size: 14px;
  position: sticky; top: 0;
  background: rgba(13,13,20,0.98);
}
.panel-close {
  background: none; border: none; color: rgba(255,255,255,0.4);
  font-size: 16px; cursor: pointer; padding: 4px;
}
.panel-close:hover { color: #fff; }

.panel-section {
  padding: 14px 20px 0;
}
.panel-section label {
  display: block; font-size: 11px; color: rgba(255,255,255,0.4);
  text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px;
}
.panel-section input[type="text"],
.panel-section input[type="number"],
.panel-section select,
.panel-section textarea {
  width: 100%; padding: 9px 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: #fff; font-size: 13px;
  outline: none; transition: border-color .2s; box-sizing: border-box;
}
.panel-section input:focus,
.panel-section select:focus,
.panel-section textarea:focus { border-color: #7c3aed; }
.panel-section textarea { resize: vertical; min-height: 64px; }
.panel-section select { appearance: none; cursor: pointer; }

.size-row { display: flex; gap: 10px; }
.size-row > div { flex: 1; }

/* Status pills */
.status-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.status-pill {
  padding: 5px 10px; border-radius: 20px;
  font-size: 12px; cursor: pointer;
  border: 1px solid transparent;
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.5);
  transition: all .15s;
}
.status-pill.active.active   { background: rgba(34,197,94,.2);  border-color: #22c55e; color: #4ade80; }
.status-pill.planned.active  { background: rgba(96,165,250,.2); border-color: #60a5fa; color: #93c5fd; }
.status-pill.deprecated.active { background: rgba(245,158,11,.2); border-color: #f59e0b; color: #fcd34d; }
.status-pill.failed.active   { background: rgba(239,68,68,.2);  border-color: #ef4444; color: #f87171; }

/* Edge type pills */
.edge-type-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.edge-pill {
  padding: 5px 10px; border-radius: 20px;
  font-size: 12px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.5);
  transition: all .15s;
}
.edge-pill.active { background: rgba(124,58,237,.25); border-color: #7c3aed; color: #a78bfa; }

/* Color row */
.color-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.color-input { width: 32px; height: 32px; border: none; border-radius: 8px; padding: 0; cursor: pointer; background: none; }
.color-dot {
  width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent;
  cursor: pointer; transition: all .15s;
}
.color-dot:hover { transform: scale(1.25); border-color: #fff; }

/* Meta */
.meta-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.meta-key { font-size: 12px; color: rgba(255,255,255,.4); width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; }
.meta-val { flex: 1; padding: 6px 8px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 6px; color: #fff; font-size: 12px; outline: none; }
.meta-del { background: none; border: none; color: rgba(255,255,255,.3); cursor: pointer; font-size: 13px; padding: 2px; }
.meta-del:hover { color: #f87171; }
.add-meta-btn { font-size: 12px; color: rgba(124,58,237,.8); background: none; border: none; cursor: pointer; padding: 2px 0; }
.add-meta-btn:hover { color: #a78bfa; }

.del-node-btn {
  margin: 20px 20px 0;
  width: calc(100% - 40px);
  padding: 10px;
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: 10px;
  color: #f87171;
  font-size: 13px; cursor: pointer; transition: all .2s;
}
.del-node-btn:hover { background: rgba(239,68,68,.2); }

/* ── Zoom badge ── */
.zoom-badge {
  position: absolute;
  bottom: 40px; left: 76px;
  background: rgba(13,13,20,0.9);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px; color: rgba(255,255,255,0.5);
  pointer-events: none;
}

/* ── Hints ── */
.hints {
  position: absolute;
  bottom: 14px; left: 76px;
  display: flex; gap: 12px;
  font-size: 11px; color: rgba(255,255,255,0.25);
  pointer-events: none;
}

/* ── States ── */
.center-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: rgba(255,255,255,0.5);
}
.err { color: #f87171; }

.spinner {
  width: 36px; height: 36px;
  border: 3px solid rgba(124,58,237,.2);
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Transitions ── */
.pop-enter-active, .pop-leave-active { transition: all .18s; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: scale(.92); }

.slide-enter-active, .slide-leave-active { transition: transform .22s, opacity .22s; }
.slide-enter-from, .slide-leave-to { transform: translateX(20px); opacity: 0; }
</style>
