<script setup>
// Граф развития — по эскизу пользователя: каждый навык — строка, уровни идут
// слева направо и соединены стрелками, развилка уходит на соседний ряд.
// Сферы выделены цветными полосами, подсферы — полосами внутри родителя.
// docs/me-module.md (back-m)
//
// Раскладка своя, без библиотеки: глубина уровня — длина пути до него по
// стрелкам внутри навыка; уровни одной глубины встают друг под другом.
//
// Режим «Править ветку» показывает пустые сферы и навыки и даёт кнопки:
// новая сфера и подсфера, навык, уровень, правка и удаление. Ветку человек
// собирает сам, каркас — только ориентир.
import { computed, ref } from "vue";
import { STATUS_TITLES } from "@/composables/useGrowth.js";
import GrowthEditDialog from "./GrowthEditDialog.vue";

const props = defineProps({
  board: { type: Object, required: true },
  selectedId: { type: String, default: null },
  draft: { type: Object, default: () => new Set() }, // выбор месяца в работе
});
const emit = defineEmits(["select"]);

const COL_W = 196;
const NODE_W = 172;
const NODE_H = 78;
const ROW_H = 92;
const LABEL_W = 220;
const PAD = 14;
const HEAD_H = 26; // строка с названием сферы
const INDENT = 10; // отступ полосы подсферы

const sphereFilter = ref("");
const query = ref("");
const hideDone = ref(false);
const editMode = ref(false);
const dialog = ref(null); // { mode, target, parentId, skillId, afterId }

const allSpheres = computed(() => props.board.spheres || []);
const childrenOf = computed(() => {
  const map = new Map();
  for (const s of allSpheres.value) {
    const key = s.parentId || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position);
  return map;
});
// Верхние сферы — для фильтра; сфера с потерянным родителем тоже верхняя.
const rootSpheres = computed(() => {
  const ids = new Set(allSpheres.value.map((s) => s.id));
  return allSpheres.value
    .filter((s) => !s.parentId || !ids.has(s.parentId))
    .sort((a, b) => a.position - b.position);
});

const layout = computed(() => {
  const q = query.value.trim().toLowerCase();
  const levels = props.board.levels || [];
  const edges = props.board.edges || [];
  const bySkill = new Map();
  for (const l of levels) {
    if (!bySkill.has(l.skillId)) bySkill.set(l.skillId, []);
    bySkill.get(l.skillId).push(l);
  }
  const skillsBySphere = new Map();
  for (const s of props.board.skills || []) {
    if (!skillsBySphere.has(s.sphereId)) skillsBySphere.set(s.sphereId, []);
    skillsBySphere.get(s.sphereId).push(s);
  }
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.toId)) incoming.set(e.toId, []);
    incoming.get(e.toId).push(e.fromId);
  }

  const pos = new Map();
  const bands = [];
  const lanes = [];
  const ghosts = []; // «+ первый уровень» у пустого навыка в режиме правки
  let y = PAD;
  let maxCol = 0;
  const seen = new Set();

  function laneFor(skill, depthIndent) {
    let list = bySkill.get(skill.id) || [];
    if (hideDone.value) list = list.filter((l) => l.status !== "done");
    if (q && !skill.title.toLowerCase().includes(q)) {
      list = list.filter((l) => l.title.toLowerCase().includes(q));
    }
    if (!list.length) {
      if (!editMode.value || (q && !skill.title.toLowerCase().includes(q))) return false;
      lanes.push({ skill, y, h: ROW_H, indent: depthIndent, empty: true });
      ghosts.push({ skill, x: LABEL_W, y: y + (ROW_H - NODE_H) / 2 });
      y += ROW_H;
      return true;
    }

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
    const last = [...list].filter((l) => !l.maintenance).sort((a, b) => b.number - a.number)[0];
    lanes.push({ skill, y, h: rows * ROW_H, indent: depthIndent, lastId: last?.id || null });
    y += rows * ROW_H;
    return true;
  }

  function walk(sphere, depth, path) {
    if (seen.has(sphere.id)) return false; // цикл в данных
    seen.add(sphere.id);
    const indent = 4 + depth * INDENT;
    const bandTop = y;
    const bandIndex = bands.length;
    bands.push(null); // место родителя — раньше детей, чтобы рисовался под ними
    y += HEAD_H;
    let any = false;
    const skills = [...(skillsBySphere.get(sphere.id) || [])].sort((a, b) => a.position - b.position);
    for (const skill of skills) {
      if (laneFor(skill, indent)) any = true;
    }
    for (const child of childrenOf.value.get(sphere.id) || []) {
      if (walk(child, depth + 1, [...path, sphere.title])) any = true;
    }
    if (!any && !editMode.value) {
      y = bandTop;
      bands.splice(bandIndex);
      return false;
    }
    y += 6;
    bands[bandIndex] = { sphere, y: bandTop, h: y - bandTop, indent, depth, path };
    y += depth ? 4 : 10;
    return true;
  }

  for (const sphere of rootSpheres.value) {
    if (sphereFilter.value && sphere.id !== sphereFilter.value) continue;
    walk(sphere, 0, []);
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

  const width = LABEL_W + (maxCol + 1) * COL_W + PAD;
  return {
    pos: [...pos.values()],
    bands: bands.filter(Boolean),
    lanes,
    ghosts,
    paths,
    width: Math.max(width, LABEL_W + 2 * COL_W),
    height: y + PAD,
  };
});

function sphereColor(skillId) {
  const skill = (props.board.skills || []).find((s) => s.id === skillId);
  return allSpheres.value.find((s) => s.id === skill?.sphereId)?.color || "#6e4aff";
}

function badge(level) {
  if (level.maintenance) return "∞";
  return String(level.number);
}

function open(mode, extra = {}) {
  dialog.value = { mode, target: null, parentId: null, skillId: null, afterId: null, ...extra };
}

const STATUS_ICONS = { done: "✓", active: "★", paused: "⏸", maintain: "♾" };
</script>

<template>
  <div class="gg">
    <div class="gg-tools">
      <button class="gg-chip" :class="{ on: !sphereFilter }" @click="sphereFilter = ''">Все</button>
      <button
        v-for="s in rootSpheres"
        :key="s.id"
        class="gg-chip"
        :class="{ on: sphereFilter === s.id }"
        :style="{ '--c': s.color }"
        @click="sphereFilter = sphereFilter === s.id ? '' : s.id"
      >{{ s.emoji }} {{ s.title }}</button>
      <input v-model="query" class="gg-search" placeholder="Найти навык или уровень" />
      <label class="gg-check"><input v-model="hideDone" type="checkbox" /> скрыть пройденные</label>
      <button class="gg-edit-toggle" :class="{ on: editMode }" @click="editMode = !editMode">
        {{ editMode ? "✓ Готово" : "✎ Править навыки" }}
      </button>
    </div>
    <div v-if="editMode" class="gg-edit-bar">
      <span>Режим правки: видны пустые сферы и навыки, у названий — кнопки. Своя сфера, подсфера, навык, уровень; правка и перенос — через ✎.</span>
      <button class="gg-mini primary" @click="open('sphere-new')">+ сфера</button>
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
            <rect :x="b.indent" :y="b.y" :width="layout.width - b.indent * 2" :height="b.h" rx="12"
              :fill="b.sphere.color" :fill-opacity="b.depth ? 0.05 : 0.06" :stroke="b.sphere.color"
              :stroke-opacity="b.depth ? 0.25 : 0.35" :stroke-dasharray="b.depth ? '3 5' : '6 6'" />
          </g>
          <path v-for="p in layout.paths" :key="p.id" :d="p.d" class="gg-edge"
            :class="{ cross: p.cross, done: p.done }" marker-end="url(#gg-arrow)" />
        </svg>

        <div v-for="b in layout.bands" :key="`t-${b.sphere.id}`" class="gg-sphere" :class="{ sub: b.depth }"
          :style="{ top: `${b.y + 6}px`, left: `${b.indent + 12}px`, color: b.sphere.color }">
          <span>{{ b.sphere.emoji }} {{ b.sphere.title }}</span>
          <span v-if="editMode" class="gg-acts">
            <button class="gg-mini" title="Новый навык в сфере" @click="open('skill-new', { parentId: b.sphere.id })">+ навык</button>
            <button v-if="b.depth < 2" class="gg-mini" title="Подсфера внутри"
              @click="open('sphere-new', { parentId: b.sphere.id })">+ подсфера</button>
            <button class="gg-mini" title="Править сферу" @click="open('sphere', { target: b.sphere })">✎</button>
          </span>
        </div>

        <div v-for="lane in layout.lanes" :key="lane.skill.id" class="gg-skill"
          :style="{ top: `${lane.y + 18}px`, left: `${lane.indent + 12}px`, width: `${LABEL_W - lane.indent - 24}px` }"
          :title="lane.skill.description">
          <span class="gg-skill-name"><span>{{ lane.skill.emoji }}</span> {{ lane.skill.title }}</span>
          <span v-if="lane.skill.travelCountry && !editMode" class="gg-skill-tag">🧭 места в «Путешествиях»</span>
          <span v-if="editMode" class="gg-acts">
            <button class="gg-mini" title="Править навык" @click="open('skill', { target: lane.skill })">✎ навык</button>
            <button class="gg-mini" title="Новый уровень после последнего"
              @click="open('level-new', { skillId: lane.skill.id, afterId: lane.lastId })">+ уровень</button>
          </span>
        </div>

        <button v-for="g in layout.ghosts" :key="`g-${g.skill.id}`" class="gg-node gg-ghost"
          :style="{ left: `${g.x}px`, top: `${g.y}px` }" @click="open('level-new', { skillId: g.skill.id })">
          <span class="gg-title">+ первый уровень</span>
        </button>
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
    <GrowthEditDialog v-if="dialog" v-bind="dialog" @close="dialog = null" />
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
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
}

.gg-sphere.sub {
  font-size: 10px;
  opacity: 0.9;
}

.gg-skill {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #c9cdda;
}

.gg-skill-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gg-skill-tag {
  font-size: 10px;
  color: #7fd8c2;
}

.gg-acts {
  display: flex;
  gap: 4px;
  letter-spacing: 0;
  text-transform: none;
  font-weight: 400;
}

.gg-mini {
  border: 1px solid #343746;
  background: #1d1f28;
  color: #c9cdda;
  border-radius: 6px;
  padding: 1px 7px;
  font-size: 11px;
  cursor: pointer;
}

.gg-mini:hover {
  border-color: #6e4aff;
  color: #fff;
}

.gg-mini.primary {
  background: #6e4aff;
  border-color: #6e4aff;
  color: #fff;
}

.gg-edit-toggle {
  border: 1px solid #343746;
  background: #1a1c24;
  color: #e8eaf0;
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
}

.gg-edit-toggle.on {
  background: #6e4aff;
  border-color: #6e4aff;
}

.gg-edit-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #b9bfd0;
  padding: 6px 10px;
  border-radius: 8px;
  background: #6e4aff1a;
  border: 1px dashed #6e4aff66;
}

.gg-ghost {
  border-style: dashed;
  border-color: #6e4aff88;
  background: #6e4aff10;
  color: #b9a8ff;
  justify-content: center;
  align-items: center;
}

.gg-node {
  position: absolute;
  width: 172px;
  height: 78px;
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
  line-height: 1.25;
  min-height: 2.5em;
  flex: none;
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
