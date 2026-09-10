<script setup>
import { computed, ref, watch } from "vue";
import { percent, shortDate, formatMoney } from "@/components/ventureApi.js";

// Полотно дорожной карты: полосы времени, узлы, стрелки зависимостей.
// Раскладка ручная — координаты узлов лежат в базе, авто-раскладка только по кнопке.

const props = defineProps({
  full: { type: Object, required: true },
  selectedId: { type: String, default: "" },
  // linkFrom — узел, от которого сейчас тянут стрелку (режим связывания).
  linkFrom: { type: String, default: "" },
});

const emit = defineEmits(["select", "open", "move", "link", "canvas-click", "zoom"]);

// Размеры карточек фиксированные: стрелки считаются от них, и «резиновая»
// высота заставляла бы пересчитывать пути после каждой правки текста.
const NODE_W = 200;
const NODE_H = 68;
const MILESTONE_W = 288;
const MILESTONE_H = 108;
const BAND_W = 360;

const scale = ref(1);
const canvasEl = ref(null);

// Черновик перетаскивания: пока тянем, координаты живут здесь, а не в модели.
const dragging = ref(null);
const localPos = ref({});

watch(
  () => props.full,
  () => {
    localPos.value = {};
  },
);

function nodeSize(node) {
  return node.isMilestone ? { w: MILESTONE_W, h: MILESTONE_H } : { w: NODE_W, h: NODE_H };
}

function nodePos(node) {
  return localPos.value[node.id] || { x: node.x, y: node.y };
}

const laneById = computed(() => {
  const map = {};
  for (const lane of props.full.lanes || []) map[lane.id] = lane;
  return map;
});

function laneColor(node) {
  const lane = node.laneId ? laneById.value[node.laneId] : null;
  return lane?.color || "#a855f7";
}

// Полосы времени встают слева направо равными зонами: их порядок и есть шкала.
const bands = computed(() =>
  (props.full.periods || []).map((period, index) => ({
    ...period,
    left: index * BAND_W,
    width: BAND_W,
  })),
);

function bandAt(x) {
  const index = Math.floor(x / BAND_W);
  return bands.value[index] || null;
}

const planeSize = computed(() => {
  let maxX = bands.value.length * BAND_W;
  let maxY = 320;
  for (const node of props.full.nodes || []) {
    const pos = nodePos(node);
    const size = nodeSize(node);
    maxX = Math.max(maxX, pos.x + size.w);
    maxY = Math.max(maxY, pos.y + size.h);
  }
  return { width: maxX + 200, height: maxY + 160 };
});

const nodeById = computed(() => {
  const map = {};
  for (const node of props.full.nodes || []) map[node.id] = node;
  return map;
});

// Стрелка идёт от правого края источника к левому краю приёмника.
// Если приёмник левее — заходим снизу, иначе линия пошла бы сквозь карточку.
const paths = computed(() =>
  (props.full.links || [])
    .map((link) => {
      const from = nodeById.value[link.fromNodeId];
      const to = nodeById.value[link.toNodeId];
      if (!from || !to) return null;

      const fromPos = nodePos(from);
      const toPos = nodePos(to);
      const fromSize = nodeSize(from);
      const toSize = nodeSize(to);

      const x1 = fromPos.x + fromSize.w;
      const y1 = fromPos.y + fromSize.h / 2;
      const x2 = toPos.x;
      const y2 = toPos.y + toSize.h / 2;

      // Приёмник левее источника — линия пошла бы сквозь карточки, поэтому
      // разводим контрольные точки шире и стрелка обходит их сбоку.
      const bend = x2 < x1 ? 120 : Math.max(40, (x2 - x1) / 2);
      const d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;

      return {
        id: link.id,
        d,
        kind: link.kind,
        label: link.label,
        color: link.color || laneColor(from),
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
        endX: x2,
        endY: y2,
      };
    })
    .filter(Boolean),
);

// --- Перетаскивание узлов ---

function onNodePointerDown(event, node) {
  if (props.linkFrom) return; // в режиме связывания клик по узлу — это выбор цели
  if (event.button !== 0) return;
  event.stopPropagation();

  const pos = nodePos(node);
  dragging.value = {
    id: node.id,
    startX: event.clientX,
    startY: event.clientY,
    originX: pos.x,
    originY: pos.y,
    moved: false,
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, { once: true });
}

function onPointerMove(event) {
  const drag = dragging.value;
  if (!drag) return;
  const dx = (event.clientX - drag.startX) / scale.value;
  const dy = (event.clientY - drag.startY) / scale.value;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;

  localPos.value = {
    ...localPos.value,
    [drag.id]: {
      x: Math.max(0, Math.round(drag.originX + dx)),
      y: Math.max(0, Math.round(drag.originY + dy)),
    },
  };
}

function onPointerUp() {
  window.removeEventListener("pointermove", onPointerMove);
  const drag = dragging.value;
  dragging.value = null;
  if (!drag) return;

  if (!drag.moved) {
    emit("select", drag.id);
    return;
  }
  const pos = localPos.value[drag.id];
  if (!pos) return;
  // Узел, отпущенный внутри полосы, к ней и привязывается: отдельной кнопки
  // «зафиксировать в квартале» не нужно.
  const band = bandAt(pos.x);
  emit("move", [{ id: drag.id, x: pos.x, y: pos.y, periodId: band ? band.id : null }]);
}

function onNodeClick(node) {
  if (props.linkFrom && props.linkFrom !== node.id) {
    emit("link", node.id);
    return;
  }
  emit("select", node.id);
}

// --- Панорама и зум ---

const panning = ref(false);

function onCanvasPointerDown(event) {
  if (event.button !== 0) return;
  const el = canvasEl.value;
  if (!el) return;

  panning.value = true;
  const startX = event.clientX;
  const startY = event.clientY;
  const scrollLeft = el.scrollLeft;
  const scrollTop = el.scrollTop;
  let moved = false;

  function move(moveEvent) {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    el.scrollLeft = scrollLeft - dx;
    el.scrollTop = scrollTop - dy;
  }

  function up() {
    window.removeEventListener("pointermove", move);
    panning.value = false;
    if (!moved) emit("canvas-click");
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

function zoom(delta) {
  scale.value = Math.min(1.6, Math.max(0.4, Math.round((scale.value + delta) * 10) / 10));
  emit("zoom", scale.value);
}

function onWheel(event) {
  // Зум только с Ctrl: иначе колесо перестанет прокручивать длинную карту.
  if (!event.ctrlKey) return;
  event.preventDefault();
  zoom(event.deltaY > 0 ? -0.1 : 0.1);
}

defineExpose({ zoom, scale });
</script>

<template>
  <div class="vt-canvas-wrap">
    <div
      ref="canvasEl"
      class="vt-canvas"
      :class="{ 'is-panning': panning, 'is-linking': !!linkFrom }"
      @pointerdown.self="onCanvasPointerDown"
      @wheel="onWheel"
    >
      <div
        class="vt-plane"
        :style="{
          width: planeSize.width + 'px',
          height: planeSize.height + 'px',
          transform: `scale(${scale})`,
        }"
        @pointerdown.self="onCanvasPointerDown"
      >
        <!-- Полосы времени: кварталы или месяцы с плановым бюджетом -->
        <div
          v-for="band in bands"
          :key="band.id"
          class="vt-band"
          :class="{ 'is-current': band.isCurrent }"
          :style="{ left: band.left + 'px', width: band.width + 'px' }"
        >
          <div class="vt-band-title">{{ band.title }}</div>
          <div v-if="band.budgetPlan" class="vt-band-budget">
            бюджет {{ formatMoney(band.budgetPlan, full.venture.currency) }}
          </div>
        </div>

        <!-- Стрелки зависимостей -->
        <svg class="vt-links" :width="planeSize.width" :height="planeSize.height">
          <defs>
            <marker
              v-for="path in paths"
              :id="`vt-arrow-${path.id}`"
              :key="path.id"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" :fill="path.color" />
            </marker>
          </defs>
          <g v-for="path in paths" :key="path.id">
            <path
              :d="path.d"
              fill="none"
              :stroke="path.color"
              stroke-width="2"
              :stroke-dasharray="path.kind === 'soft' ? '7 6' : ''"
              :marker-end="`url(#vt-arrow-${path.id})`"
            />
            <text
              v-if="path.label"
              :x="path.midX"
              :y="path.midY - 8"
              text-anchor="middle"
              font-size="11"
              :fill="path.color"
            >
              {{ path.label }}
            </text>
          </g>
        </svg>

        <!-- Узлы -->
        <div
          v-for="node in full.nodes"
          :key="node.id"
          class="vt-node"
          :class="{
            'is-milestone': node.isMilestone,
            'is-selected': node.id === selectedId,
            'is-link-source': node.id === linkFrom,
            'is-dragging': dragging && dragging.id === node.id,
          }"
          :style="{
            left: nodePos(node).x + 'px',
            top: nodePos(node).y + 'px',
            width: nodeSize(node).w + 'px',
            minHeight: nodeSize(node).h + 'px',
            '--vt-node-color': laneColor(node),
            opacity: node.status === 'dropped' ? 0.45 : 1,
          }"
          @pointerdown="onNodePointerDown($event, node)"
          @click.stop="onNodeClick(node)"
          @dblclick.stop="emit('open', node.id)"
        >
          <div class="vt-node-head">
            <div
              class="vt-dot"
              :class="{
                'is-done': node.status === 'done',
                'is-progress': node.status === 'in_progress',
              }"
            >
              <span v-if="node.status === 'done'">✓</span>
              <span v-else-if="node.emoji && !node.isMilestone">{{ node.emoji }}</span>
            </div>
            <div style="min-width: 0">
              <div class="vt-node-title">{{ node.title }}</div>
              <div v-if="node.subtitle" class="vt-node-subtitle">{{ node.subtitle }}</div>
            </div>
          </div>

          <div v-if="node.isMilestone" class="vt-node-progress">
            <div class="vt-bar"><i :style="{ width: percent(node.progress) + '%' }" /></div>
            <span>{{ percent(node.progress) }}%</span>
          </div>

          <div class="vt-node-meta">
            <span v-if="node.planEnd" class="vt-chip" :class="{ 'is-late': node.isLate }">
              {{ shortDate(node.planEnd) }}
            </span>
            <span v-if="node.taskCount" class="vt-chip">
              задачи {{ node.taskDoneCount }}/{{ node.taskCount }}
            </span>
            <span v-if="node.draftOpenCount" class="vt-chip is-warn">
              черновиков {{ node.draftOpenCount }}
            </span>
            <span v-if="node.dependencyWarning" class="vt-chip is-warn" title="Предок ещё не закрыт">
              ⚠ раньше предка
            </span>
          </div>
        </div>

        <div v-if="!full.nodes.length" class="vt-empty" style="padding-top: 80px">
          Пусто. Добавьте первую веху — например «Концепция».
        </div>
      </div>
    </div>
  </div>
</template>
