<script setup>
import { computed } from "vue";
import { percent, shortDate, nodeStatusMeta } from "@/components/ventureApi.js";

// Тот же граф списком: на телефоне и при разборе планов читать удобнее, чем
// полотно. Порядок — вехи по сроку, под каждой её узлы.

const props = defineProps({
  full: { type: Object, required: true },
});

const emit = defineEmits(["open"]);

const laneById = computed(() => {
  const map = {};
  for (const lane of props.full.lanes || []) map[lane.id] = lane;
  return map;
});

function laneColor(node) {
  return (node.laneId && laneById.value[node.laneId]?.color) || "#a855f7";
}

// К какой вехе относится узел — идём по стрелкам вперёд до первой вехи,
// ровно как считает сервер.
const groups = computed(() => {
  const nodes = props.full.nodes || [];
  const links = props.full.links || [];
  const milestones = new Set(nodes.filter((n) => n.isMilestone).map((n) => n.id));
  const outgoing = {};
  for (const link of links) {
    (outgoing[link.fromNodeId] ||= []).push(link.toNodeId);
  }

  function ownerOf(id) {
    const seen = new Set([id]);
    const queue = [...(outgoing[id] || [])];
    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);
      if (milestones.has(current)) return current;
      queue.push(...(outgoing[current] || []));
    }
    return null;
  }

  const children = {};
  const orphans = [];
  for (const node of nodes) {
    if (node.isMilestone) continue;
    const owner = ownerOf(node.id);
    if (owner) (children[owner] ||= []).push(node);
    else orphans.push(node);
  }

  const ordered = nodes
    .filter((n) => n.isMilestone)
    .sort((a, b) => (a.planEnd || "9999").localeCompare(b.planEnd || "9999"));

  return { milestones: ordered, children, orphans };
});
</script>

<template>
  <div class="vt-list">
    <div v-for="milestone in groups.milestones" :key="milestone.id" class="vt-card">
      <div class="vt-row vt-mobile-node" :style="{ '--vt-node-color': laneColor(milestone) }">
        <div style="flex: 1; cursor: pointer" @click="emit('open', milestone.id)">
          <div style="font-size: 17px; font-weight: 600">
            {{ milestone.emoji }} {{ milestone.title }}
          </div>
          <div v-if="milestone.subtitle" class="vt-muted">{{ milestone.subtitle }}</div>
        </div>
        <span class="vt-chip" :class="{ 'is-late': milestone.isLate }">
          {{ shortDate(milestone.planEnd) || nodeStatusMeta(milestone.status).title }}
        </span>
      </div>

      <div class="vt-row" style="margin: 8px 0">
        <div class="vt-bar" :style="{ '--vt-node-color': laneColor(milestone) }">
          <i :style="{ width: percent(milestone.progress) + '%', background: laneColor(milestone) }" />
        </div>
        <span>{{ percent(milestone.progress) }}%</span>
      </div>

      <div class="vt-list">
        <div
          v-for="node in groups.children[milestone.id] || []"
          :key="node.id"
          class="vt-item is-clickable"
          @click="emit('open', node.id)"
        >
          <span class="vt-legend-dot" :style="{ background: laneColor(node) }" />
          <span style="flex: 1">{{ node.emoji }} {{ node.title }}</span>
          <span v-if="node.taskCount" class="vt-chip">
            {{ node.taskDoneCount }}/{{ node.taskCount }}
          </span>
          <span class="vt-muted">{{ percent(node.progress) }}%</span>
        </div>
      </div>
    </div>

    <div v-if="groups.orphans.length" class="vt-card">
      <div class="vt-label">Вне вех</div>
      <div class="vt-muted" style="margin-bottom: 8px">
        Эти узлы не ведут стрелкой ни к одной вехе, поэтому в процент проекта не идут.
      </div>
      <div class="vt-list">
        <div
          v-for="node in groups.orphans"
          :key="node.id"
          class="vt-item is-clickable"
          @click="emit('open', node.id)"
        >
          <span class="vt-legend-dot" :style="{ background: laneColor(node) }" />
          <span style="flex: 1">{{ node.emoji }} {{ node.title }}</span>
          <span class="vt-muted">{{ percent(node.progress) }}%</span>
        </div>
      </div>
    </div>

    <div v-if="!full.nodes.length" class="vt-empty">Карта пуста.</div>
  </div>
</template>
