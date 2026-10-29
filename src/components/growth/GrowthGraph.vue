<script setup>
// Граф развития — по эскизу пользователя: каждый навык — строка, уровни идут
// слева направо и соединены стрелками, развилка уходит на соседний ряд.
// Сферы выделены цветными полосами. docs/me-module.md (back-m)
//
// Раскладка своя, без библиотеки: глубина уровня — длина пути до него по
// стрелкам внутри навыка; уровни одной глубины встают друг под другом.
import { computed, ref } from "vue";
import { STATUS_TITLES } from "@/composables/useGrowth.js";

const props = defineProps({
  board: { type: Object, required: true },
  selectedId: { type: String, default: null },
  draft: { type: Object, default: () => new Set() }, // выбор месяца в работе
});
const emit = defineEmits(["select"]);

const COL_W = 196;
const NODE_W = 172;
const NODE_H = 66;
const ROW_H = 80;
const LABEL_W = 210;
const PAD = 14;

const sphereFilter = ref("");
const query = ref("");
const hideDone = ref(false);

const spheres = computed(() => [...(props.board.spheres || [])].sort((a, b) => a.position - b.position));

const layout = computed(() => {
  const q = query.value.trim().toLowerCase();
  const levels = props.board.levels || [];
  const edges = props.board.edges || [];
  const bySkill = new Map();
  for (const l of levels) {
    if (!bySkill.has(l.skillId)) bySkill.set(l.skillId, []);
    bySkill.get(l.skillId).push(l);
  }
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.toId)) incoming.set(e.toId, []);
    incoming.get(e.toId).push(e.fromId);
  }

  const pos = new Map();
  const bands = [];
  const lanes = [];
  let y = PAD;
  let maxCol = 0;

  for (const sphere of spheres.value) {
    if (sphereFilter.value && sphere.id !== sphereFilter.value) continue;
    const skills = (props.board.skills || [])
      .filter((s) => s.sphereId === sphere.id)
      .sort((a, b) => a.position - b.position);
    const bandTop = y;
    let any = false;
    for (const skill of skills) {
      let list = bySkill.get(skill.id) || [];
      if (hideDone.value) list = list.filter((l) => l.status !== "done");
      if (q && !skill.title.toLowerCase().includes(q)) {
        list = list.filter((l) => l.title.toLowerCase().includes(q));
      }
      if (!list.length) continue;
      any = true;

      // Глубина: поддержка — отдельная первая колонка, остальные — по стрелкам.
      const ids = new Set(list.map((l) => l.id));
      const hasMaint = list.some((l) => l.maintenance);
      const depth = new Map();
      const visiting = new Set();
      const depthOf = (l) => {
        if (depth.has(l.id)) return depth.get(l.id);
        if (visiting.has(l.id)) return 0; // цикл — не падаем
        visiting.add(l.id);
        let d = hasMaint ? 1 : 0;
        if (l.maintenance) d = 0;
        else {
          for (const from of incoming.get(l.id) || []) {
            if (!ids.has(from)) continue;
            const prev = list.find((x) => x.id === from);
            if (prev && !prev.maintenance) d = Math.max(d, depthOf(prev) + 1);
          }
        }
        visiting.delete(l.id);
        depth.set(l.id, d);
        return d;
      };
      const cols = new Map();
      for (const l of [...list].sort((a, b) => a.number - b.number || a.position - b.position)) {
        const d = depthOf(l);
        if (!cols.has(d)) cols.set(d, []);
        cols.get(d).push(l);
      }
      const rows = Math.max(1, ...[...cols.values()].map((c) => c.length));
      for (const [d, col] of cols) {
        maxCol = Math.max(maxCol, d);
        col.forEach((l, i) => {
          pos.set(l.id, { x: LABEL_W + d * COL_W, y: y + i * ROW_H + (ROW_H - NODE_H) / 2, level: l });
        });
      }
      lanes.push({ skill, y, h: rows * ROW_H });
      y += rows * ROW_H;
    }
    if (any) {
      bands.push({ sphere, y: bandTop, h: y - bandTop });
      y += 10;
    }
  }

  const paths = [];
  for (const e of edges) {
    const a = pos.get(e.fromId);
    const b = pos.get(e.toId);
    if (!a || !b) continue;
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const dx = Math.max(30, Math.abs(x2 - x1) / 2);
    paths.push({
      id: e.id,
      d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      cross: a.level.skillId !== b.level.skillId,
      done: a.level.status === "done",
    });
  }

  return {
    pos: [...pos.values()],
    bands,
    lanes,
    paths,
    width: LABEL_W + (maxCol + 1) * COL_W + PAD,
    height: y + PAD,
  };
});

function sphereColor(skillId) {
  const skill = (props.board.skills || []).find((s) => s.id === skillId);
  return spheres.value.find((s) => s.id === skill?.sphereId)?.color || "#6e4aff";
}

function badge(level) {
  if (level.maintenance) return "∞";
  return String(level.number);
}

const STATUS_ICONS = { done: "✓", active: "★", paused: "⏸", maintain: "♾" };
</script>

<template>
  <div class="gg">
    <div class="gg-tools">
      <button class="gg-chip" :class="{ on: !sphereFilter }" @click="sphereFilter = ''">Все</button>
      <button
        v-for="s in spheres"
        :key="s.id"
        class="gg-chip"
        :class="{ on: sphereFilter === s.id }"
        :style="{ '--c': s.color }"
        @click="sphereFilter = sphereFilter === s.id ? '' : s.id"
      >{{ s.emoji }} {{ s.title }}</button>
      <input v-model="query" class="gg-search" placeholder="Найти навык или уровень" />
      <label class="gg-check"><input v-model="hideDone" type="checkbox" /> скрыть пройденные</label>
    </div>

    <div class="gg-scroll">
      <div class="gg-canvas" :style="{ width: `${layout.width}px`, height: `${layout.height}px` }">
        <svg class="gg-svg" :width="layout.width" :height="layout.height">
          <defs>
            <marker id="gg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7186" />
            </marker>
          </defs>
          <g v-for="b in layout.bands" :key="b.sphere.id">
            <rect x="4" :y="b.y" :width="layout.width - 8" :height="b.h" rx="12"
              :fill="b.sphere.color" fill-opacity="0.06" :stroke="b.sphere.color" stroke-opacity="0.35" stroke-dasharray="6 6" />
          </g>
          <path v-for="p in layout.paths" :key="p.id" :d="p.d" class="gg-edge"
            :class="{ cross: p.cross, done: p.done }" marker-end="url(#gg-arrow)" />
        </svg>

        <div v-for="b in layout.bands" :key="`t-${b.sphere.id}`" class="gg-sphere"
          :style="{ top: `${b.y + 6}px`, color: b.sphere.color }">{{ b.sphere.emoji }} {{ b.sphere.title }}</div>

        <div v-for="lane in layout.lanes" :key="lane.skill.id" class="gg-skill"
          :style="{ top: `${lane.y + 24}px` }" :title="lane.skill.description">
          <span>{{ lane.skill.emoji }}</span> {{ lane.skill.title }}
        </div>

        <button
          v-for="p in layout.pos"
          :key="p.level.id"
          class="gg-node"
          :class="[
            `st-${p.level.status}`,
            { sel: selectedId === p.level.id, draft: draft.has(p.level.id) },
          ]"
          :style="{ left: `${p.x}px`, top: `${p.y}px`, '--c': sphereColor(p.level.skillId) }"
          :title="`${p.level.title} — ${STATUS_TITLES[p.level.status] || ''}`"
          @click="emit('select', p.level.id)"
        >
          <span class="gg-node-head">
            <span class="gg-num">{{ badge(p.level) }}</span>
            <span class="gg-emoji">{{ p.level.emoji || "◆" }}</span>
            <span v-if="STATUS_ICONS[p.level.status]" class="gg-st">{{ STATUS_ICONS[p.level.status] }}</span>
          </span>
          <span class="gg-title">{{ p.level.title }}</span>
          <span v-if="p.level.status !== 'empty'" class="gg-bar"><em :style="{ width: `${Math.round(p.level.progress * 100)}%` }" /></span>
          <span v-else class="gg-empty">заполнить</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gg {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
}

.gg-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.gg-chip {
  --c: #9aa0b0;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  background: color-mix(in srgb, var(--c) 8%, transparent);
  color: #e8eaf0;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.gg-chip.on {
  background: color-mix(in srgb, var(--c) 30%, transparent);
}

.gg-search {
  margin-left: auto;
  background: #1a1c24;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  color: #e8eaf0;
  padding: 5px 10px;
  width: 220px;
}

.gg-check {
  font-size: 12px;
  color: #9aa0b0;
  display: flex;
  gap: 4px;
  align-items: center;
}

.gg-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-radius: 12px;
  background: radial-gradient(1200px 600px at 20% 0%, #1b1d2b, #111218);
  border: 1px solid #23252f;
  scrollbar-width: thin;
  scrollbar-color: #3a3d4b transparent;
}

.gg-canvas {
  position: relative;
}

.gg-svg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.gg-edge {
  fill: none;
  stroke: #6b7186;
  stroke-width: 1.6;
  opacity: 0.7;
}

.gg-edge.done {
  stroke: #63c94f;
}

.gg-edge.cross {
  stroke-dasharray: 5 5;
  opacity: 0.45;
}

.gg-sphere {
  position: absolute;
  left: 16px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.gg-skill {
  position: absolute;
  left: 16px;
  width: calc(210px - 28px);
  font-size: 13px;
  color: #c9cdda;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gg-node {
  position: absolute;
  width: 172px;
  height: 66px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--c) 55%, #2a2d38);
  background: #191b23;
  color: #e8eaf0;
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
}

.gg-node:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px #0008;
}

.gg-node-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.gg-num {
  min-width: 18px;
  height: 18px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  background: color-mix(in srgb, var(--c) 35%, transparent);
}

.gg-st {
  margin-left: auto;
  font-size: 12px;
}

.gg-title {
  font-size: 12px;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gg-bar {
  margin-top: auto;
  height: 3px;
  border-radius: 2px;
  background: #2a2d38;
  overflow: hidden;
}

.gg-bar em {
  display: block;
  height: 100%;
  background: var(--c);
}

.gg-empty {
  margin-top: auto;
  font-size: 10px;
  color: #8a90a2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.gg-node.st-done {
  background: color-mix(in srgb, var(--c) 30%, #191b23);
  border-color: var(--c);
}

.gg-node.st-active {
  border-color: var(--c);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 40%, transparent), 0 0 18px color-mix(in srgb, var(--c) 45%, transparent);
}

.gg-node.st-paused {
  border-style: dashed;
  border-color: #e3b341;
}

.gg-node.st-empty {
  border-style: dashed;
  opacity: 0.6;
  background: #15161c;
}

.gg-node.st-maintain {
  background: repeating-linear-gradient(135deg, #191b23 0 8px, #1d1f28 8px 16px);
}

.gg-node.draft {
  outline: 2px solid #ffd666;
  outline-offset: 2px;
}

.gg-node.sel {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
</style>
