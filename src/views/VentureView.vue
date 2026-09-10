<script setup>
import { computed, onMounted, ref, watch } from "vue";
import "@/styles/venture.css";
import { isMobile } from "@/composables/useIsMobile.js";
import {
  fetchVentures,
  fetchVentureFull,
  fetchVentureStats,
  createVenture,
  updateVenture,
  deleteVenture,
  createNode,
  updateNode,
  deleteNode,
  savePositions,
  createLink,
  exportMap,
  importMap,
  percent,
} from "@/components/ventureApi.js";
import VentureCanvas from "@/components/venture/VentureCanvas.vue";
import VentureNodeModal from "@/components/venture/VentureNodeModal.vue";
import VentureProjectModal from "@/components/venture/VentureProjectModal.vue";
import VentureListTab from "@/components/venture/VentureListTab.vue";
import VentureStatsTab from "@/components/venture/VentureStatsTab.vue";

// Раздел «Дорожная карта проекта» — docs/venture-module.md (back-m).
// Не путать с /roadmap: там планы обучения, здесь разработка бизнеса.

const TABS = [
  { code: "map", title: "Карта" },
  { code: "list", title: "Список" },
  { code: "stats", title: "Статистика" },
];

// На телефоне полотно не читается, поэтому по умолчанию открываем список.
const tab = ref(localStorage.getItem("ventureTab") || (isMobile.value ? "list" : "map"));
const ventures = ref([]);
const currentId = ref(localStorage.getItem("ventureId") || "");
const full = ref(null);
const stats = ref(null);
const loadError = ref("");
const busy = ref(false);

const selectedId = ref("");
const linkFrom = ref("");
const nodeModalId = ref("");
const projectModalOpen = ref(false);
const canvas = ref(null);
const fileInput = ref(null);
const zoomLevel = ref(1);

const current = computed(() => ventures.value.find((v) => v.id === currentId.value) || null);
const openNode = computed(
  () => (full.value?.nodes || []).find((n) => n.id === nodeModalId.value) || null,
);
const visibleTabs = computed(() => (isMobile.value ? TABS.filter((t) => t.code !== "map") : TABS));

function selectTab(code) {
  tab.value = code;
  localStorage.setItem("ventureTab", code);
}

watch(currentId, (id) => {
  if (id) localStorage.setItem("ventureId", id);
});

async function loadList() {
  ventures.value = await fetchVentures();
  const known = ventures.value.some((v) => v.id === currentId.value);
  if (!known) {
    const active = ventures.value.find((v) => v.isActive) || ventures.value[0];
    currentId.value = active ? active.id : "";
  }
}

async function loadFull() {
  if (!currentId.value) {
    full.value = null;
    stats.value = null;
    return;
  }
  const [map, statistics] = await Promise.all([
    fetchVentureFull(currentId.value),
    fetchVentureStats(currentId.value),
  ]);
  full.value = map;
  stats.value = statistics;
}

async function reload() {
  loadError.value = "";
  busy.value = true;
  try {
    await loadList();
    await loadFull();
  } catch (err) {
    loadError.value = err.message || String(err);
  } finally {
    busy.value = false;
  }
}

onMounted(reload);

async function run(action) {
  busy.value = true;
  loadError.value = "";
  try {
    await action();
    await reload();
  } catch (err) {
    loadError.value = err.message || String(err);
  } finally {
    busy.value = false;
  }
}

// --- Проект ---

async function saveProject(payload) {
  const { id, ...body } = payload;
  await run(async () => {
    if (id) {
      await updateVenture(id, body);
    } else {
      const created = await createVenture(body);
      currentId.value = created.id;
    }
    projectModalOpen.value = false;
  });
}

async function removeProject(id) {
  if (!window.confirm("Удалить проект вместе со всей картой? Задачи останутся.")) return;
  await run(async () => {
    await deleteVenture(id);
    currentId.value = "";
    projectModalOpen.value = false;
  });
}

// --- Узлы ---

// Новый узел ставится в свободное место справа от самого правого: искать для
// него дырку в раскладке — работа мышки, а не кода.
function nextFreeSpot(isMilestone) {
  const nodes = full.value?.nodes || [];
  if (!nodes.length) return { x: 40, y: 120 };
  const rightmost = nodes.reduce((best, node) => (node.x > best.x ? node : best), nodes[0]);
  return {
    x: rightmost.x + 340,
    y: isMilestone ? 120 : 300,
  };
}

async function addNode(isMilestone) {
  if (!currentId.value) return;
  const spot = nextFreeSpot(isMilestone);
  await run(async () => {
    const created = await createNode(currentId.value, {
      title: isMilestone ? "Новая веха" : "Новый узел",
      isMilestone,
      status: "planned",
      weight: 1,
      x: spot.x,
      y: spot.y,
      laneId: full.value?.lanes?.[0]?.id || null,
    });
    selectedId.value = created.id;
    nodeModalId.value = created.id;
  });
}

async function saveNode(payload) {
  const id = nodeModalId.value;
  await run(async () => {
    await updateNode(id, payload);
    nodeModalId.value = "";
  });
}

async function removeNode(id) {
  if (!window.confirm("Удалить узел вместе со стрелками и черновиками?")) return;
  await run(async () => {
    await deleteNode(id);
    nodeModalId.value = "";
    selectedId.value = "";
  });
}

// Перетаскивание сохраняется молча: перезагружать всю карту после каждого
// сдвига мышкой — лишний запрос и мигание.
async function moveNodes(items) {
  try {
    await savePositions(items);
    for (const item of items) {
      const node = (full.value?.nodes || []).find((n) => n.id === item.id);
      if (node) Object.assign(node, { x: item.x, y: item.y, periodId: item.periodId });
    }
  } catch (err) {
    loadError.value = err.message || String(err);
  }
}

// --- Связи ---

function startLink(id) {
  linkFrom.value = id;
  nodeModalId.value = "";
}

async function finishLink(toId) {
  const fromId = linkFrom.value;
  linkFrom.value = "";
  if (!fromId || fromId === toId) return;
  const soft = window.confirm(
    "Сплошная стрелка — жёсткая зависимость.\nОК — жёсткая, Отмена — мягкая (пунктир).",
  );
  await run(() =>
    createLink(currentId.value, {
      fromNodeId: fromId,
      toNodeId: toId,
      kind: soft ? "hard" : "soft",
    }),
  );
}

// --- Авто-раскладка ---

// Вехи в ряд по сроку, их узлы — лесенкой под ними. Не идеал, но снимает
// боль «после импорта всё в одной точке».
async function autoLayout() {
  if (!full.value) return;
  const nodes = full.value.nodes || [];
  const links = full.value.links || [];
  const milestones = nodes
    .filter((n) => n.isMilestone)
    .sort((a, b) => (a.planEnd || "9999").localeCompare(b.planEnd || "9999"));

  const outgoing = {};
  for (const link of links) (outgoing[link.fromNodeId] ||= []).push(link.toNodeId);
  const milestoneIds = new Set(milestones.map((m) => m.id));

  function ownerOf(id) {
    const seen = new Set([id]);
    const queue = [...(outgoing[id] || [])];
    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);
      if (milestoneIds.has(current)) return current;
      queue.push(...(outgoing[current] || []));
    }
    return null;
  }

  const positions = [];
  const columnOf = {};
  milestones.forEach((milestone, index) => {
    columnOf[milestone.id] = index;
    positions.push({ id: milestone.id, x: 40 + index * 360, y: 110, periodId: milestone.periodId });
  });

  const rowUsed = {};
  for (const node of nodes) {
    if (node.isMilestone) continue;
    const owner = ownerOf(node.id);
    const column = owner ? columnOf[owner] : milestones.length;
    const row = (rowUsed[column] = (rowUsed[column] || 0) + 1);
    positions.push({
      id: node.id,
      x: 40 + column * 360,
      y: 280 + (row - 1) * 110,
      periodId: node.periodId,
    });
  }

  await run(() => savePositions(positions));
}

// --- Импорт и экспорт ---

async function doExport() {
  if (!currentId.value) return;
  try {
    const map = await exportMap(currentId.value);
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${map.title || "venture"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    loadError.value = err.message || String(err);
  }
}

async function doImport(event) {
  const file = event.target.files?.[0];
  if (!file || !currentId.value) return;
  const text = await file.text();
  event.target.value = "";
  await run(async () => {
    const map = JSON.parse(text);
    await importMap(currentId.value, map);
  });
}
</script>

<template>
  <div class="vt">
    <div class="vt-header">
      <div>
        <h1 class="vt-title">Дорожная карта</h1>
        <div class="vt-sub">
          {{ current?.subtitle || "Разработка проектов: вехи, направления, задачи" }}
        </div>
      </div>

      <div class="vt-row">
        <select v-if="ventures.length" v-model="currentId" class="vt-select" @change="reload">
          <option v-for="venture in ventures" :key="venture.id" :value="venture.id">
            {{ venture.emoji }} {{ venture.title }} — {{ percent(venture.progress) }}%
          </option>
        </select>
        <button class="vt-btn" @click="projectModalOpen = true">
          {{ ventures.length ? "Проект" : "＋ Создать проект" }}
        </button>
      </div>
    </div>

    <div v-if="loadError" class="vt-error">{{ loadError }}</div>

    <div v-if="!ventures.length && !busy" class="vt-card vt-empty">
      Проектов пока нет. Заведите первый — например «Игра»: вместе с ним появятся
      направления и год кварталов.
    </div>

    <template v-else-if="full">
      <div class="vt-tabs">
        <button
          v-for="item in visibleTabs"
          :key="item.code"
          class="vt-tab"
          :class="{ 'is-active': tab === item.code }"
          @click="selectTab(item.code)"
        >
          {{ item.title }}
        </button>
        <div class="vt-spacer" />
        <template v-if="tab === 'map'">
          <button class="vt-btn is-small" :disabled="busy" @click="addNode(true)">＋ Веха</button>
          <button class="vt-btn is-small" :disabled="busy" @click="addNode(false)">＋ Узел</button>
          <button class="vt-btn is-small" :disabled="busy" @click="autoLayout">Разложить</button>
        </template>
        <button class="vt-btn is-small" @click="doExport">Выгрузить</button>
        <button class="vt-btn is-small" @click="fileInput?.click()">Загрузить</button>
        <input ref="fileInput" type="file" accept="application/json" hidden @change="doImport" />
      </div>

      <div v-if="linkFrom" class="vt-card" style="border-color: var(--vt-info)">
        Кликните узел, к которому ведёт стрелка.
        <button class="vt-btn is-small" @click="linkFrom = ''">Отмена</button>
      </div>

      <template v-if="tab === 'map' && !isMobile">
        <VentureCanvas
          ref="canvas"
          :full="full"
          :selected-id="selectedId"
          :link-from="linkFrom"
          @select="selectedId = $event"
          @open="nodeModalId = $event"
          @move="moveNodes"
          @link="finishLink"
          @canvas-click="selectedId = ''"
          @zoom="zoomLevel = $event"
        />

        <div class="vt-foot">
          <div class="vt-legend">
            <div v-for="lane in full.lanes" :key="lane.id" class="vt-legend-item">
              <span class="vt-legend-dot" :style="{ background: lane.color }" />
              {{ lane.title }}
            </div>
            <div class="vt-legend-item vt-muted">
              сплошная — жёсткая зависимость, пунктир — мягкая
            </div>
          </div>
          <div class="vt-row">
            <span class="vt-muted">
              {{ percent(full.venture.progress) }}% проекта · двойной клик по узлу — карточка
            </span>
            <div class="vt-zoom">
              <button @click="canvas?.zoom(-0.1)">−</button>
              <span>{{ Math.round(zoomLevel * 100) }}%</span>
              <button @click="canvas?.zoom(0.1)">＋</button>
            </div>
          </div>
        </div>
      </template>

      <VentureListTab v-else-if="tab === 'list' || isMobile" :full="full" @open="nodeModalId = $event" />

      <VentureStatsTab v-else-if="tab === 'stats' && stats" :stats="stats" />
    </template>

    <VentureNodeModal
      v-if="openNode"
      :node="openNode"
      :lanes="full.lanes"
      :periods="full.periods"
      @close="nodeModalId = ''"
      @save="saveNode"
      @delete="removeNode"
      @changed="reload"
      @link-start="startLink"
    />

    <VentureProjectModal
      v-if="projectModalOpen"
      :venture="full?.venture || null"
      :lanes="full?.lanes || []"
      :periods="full?.periods || []"
      @close="projectModalOpen = false"
      @save="saveProject"
      @delete="removeProject"
      @changed="reload"
    />
  </div>
</template>
