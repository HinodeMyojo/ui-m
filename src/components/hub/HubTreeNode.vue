<script setup>
import { computed, ref } from "vue";
import { HUB_KIND_ICON, HUB_KINDS, percent } from "@/components/hubApi.js";

// Строка дерева плана: тема, учебник, глава. Рекурсивная — дети рисуются
// такими же строками. Файлы можно бросить прямо на строку.

const props = defineProps({
  node: { type: Object, required: true },
  childrenOf: { type: Function, required: true },
  depth: { type: Number, default: 0 },
  selectedId: { type: String, default: "" },
  collapsed: { type: Object, required: true },
});
const emit = defineEmits(["select", "toggle-done", "add-child", "open-file", "open-link", "drop-files", "collapse"]);

const kids = computed(() => props.childrenOf(props.node.id));
const isCollapsed = computed(() => !!props.collapsed[props.node.id]);
const artifacts = computed(() => props.node.files.filter((f) => f.kind === "artifact"));
const otherFiles = computed(() => props.node.files.filter((f) => f.kind !== "artifact"));

const adding = ref(false);
const draft = ref("");
const draftKind = ref(defaultChildKind(props.node.kind));
const dropping = ref(false);

function defaultChildKind(kind) {
  if (kind === "book") return "chapter";
  if (kind === "stage") return "topic";
  return "chapter";
}

function startAdd() {
  adding.value = true;
  draftKind.value = defaultChildKind(props.node.kind);
}

function submitAdd() {
  const title = draft.value.trim();
  if (!title) {
    adding.value = false;
    return;
  }
  emit("add-child", { parentId: props.node.id, kind: draftKind.value, title });
  draft.value = "";
}

function onDrop(event) {
  dropping.value = false;
  const files = [...(event.dataTransfer?.files || [])];
  if (files.length) emit("drop-files", { nodeId: props.node.id, files });
}

const childKinds = HUB_KINDS.filter((k) => k.key !== "stage");
</script>

<template>
  <div class="htn" :style="{ '--depth': depth }">
    <div
      class="htn-row"
      :class="{ selected: node.id === selectedId, done: node.status === 'done', dropping }"
      @dragover.prevent="dropping = true"
      @dragleave="dropping = false"
      @drop.prevent="onDrop"
    >
      <button
        v-if="kids.length"
        class="htn-caret"
        :class="{ closed: isCollapsed }"
        @click="emit('collapse', node.id)"
      >
        ▾
      </button>
      <span v-else class="htn-caret-space" />

      <button
        class="htn-check"
        :class="node.status"
        :title="node.status === 'done' ? 'Снять отметку' : 'Отметить пройденным'"
        @click="emit('toggle-done', node)"
      >
        <span v-if="node.status === 'done'">✓</span>
        <span v-else-if="node.status === 'active'">◐</span>
      </button>

      <div class="htn-main" @click="emit('select', node.id)">
        <div class="htn-title">
          <span class="htn-icon">{{ node.emoji || HUB_KIND_ICON[node.kind] }}</span>
          <span class="htn-text">{{ node.title }}</span>
          <span v-if="kids.length" class="htn-progress">
            {{ node.leavesDone }}/{{ node.leavesAll }}
          </span>
        </div>

        <div v-if="artifacts.length || node.links.length || otherFiles.length" class="htn-chips" @click.stop>
          <button
            v-for="f in artifacts"
            :key="f.id"
            class="htn-chip artifact"
            :title="f.openCount ? `открыт ${f.openCount} раз` : 'ещё не открывался'"
            @click="emit('open-file', f)"
          >
            ▶ {{ f.title || f.filename }}
          </button>
          <button
            v-for="l in node.links"
            :key="l.id"
            class="htn-chip"
            :class="[l.kind, { missing: l.missing }]"
            @click="emit('open-link', l)"
          >
            <template v-if="l.kind === 'pdf'">📕</template>
            <template v-else-if="l.kind === 'section'">↗</template>
            <template v-else-if="l.kind === 'url'">🔗</template>
            <template v-else>◆</template>
            {{ l.title }}
            <span v-if="l.kind === 'pdf' || l.kind === 'roadmap_item'" class="htn-chip-pct">{{ percent(l.progress) }}%</span>
          </button>
          <button v-for="f in otherFiles" :key="f.id" class="htn-chip" @click="emit('open-file', f)">
            {{ f.kind === "image" ? "🖼" : "📎" }} {{ f.title || f.filename }}
          </button>
        </div>
      </div>

      <button class="htn-add" title="Добавить внутрь" @click="startAdd">＋</button>
    </div>

    <div v-if="adding" class="htn-adder" :style="{ '--depth': depth + 1 }">
      <select v-model="draftKind" class="htn-kind">
        <option v-for="k in childKinds" :key="k.key" :value="k.key">{{ k.icon }} {{ k.label }}</option>
      </select>
      <input
        v-model="draft"
        class="htn-input"
        placeholder="Название (Enter — ещё одна)"
        autofocus
        @keydown.enter.prevent="submitAdd"
        @keydown.esc="adding = false"
        @blur="!draft.trim() && (adding = false)"
      />
    </div>

    <template v-if="!isCollapsed">
      <HubTreeNode
        v-for="k in kids"
        :key="k.id"
        :node="k"
        :children-of="childrenOf"
        :depth="depth + 1"
        :selected-id="selectedId"
        :collapsed="collapsed"
        @select="emit('select', $event)"
        @toggle-done="emit('toggle-done', $event)"
        @add-child="emit('add-child', $event)"
        @open-file="emit('open-file', $event)"
        @open-link="emit('open-link', $event)"
        @drop-files="emit('drop-files', $event)"
        @collapse="emit('collapse', $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.htn-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 7px 8px 7px calc(8px + var(--depth) * 20px);
  border-radius: 12px;
  border: 1px solid transparent;
  transition: background 0.15s;
}

.htn-row:hover {
  background: rgba(130, 140, 200, 0.07);
}

.htn-row.selected {
  background: rgba(139, 124, 255, 0.12);
  border-color: rgba(139, 124, 255, 0.35);
}

.htn-row.dropping {
  border-color: #38bdf8;
  border-style: dashed;
  background: rgba(56, 189, 248, 0.08);
}

.htn-caret,
.htn-caret-space {
  width: 18px;
  flex-shrink: 0;
  margin-top: 4px;
}

.htn-caret {
  background: none;
  border: 0;
  color: #7d849e;
  cursor: pointer;
  padding: 0;
  font-size: 13px;
  transition: transform 0.15s;
}

.htn-caret.closed {
  transform: rotate(-90deg);
}

.htn-check {
  width: 22px;
  height: 22px;
  margin-top: 1px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid #4a5070;
  background: transparent;
  color: #0b0d16;
  font-size: 12px;
  font-weight: 800;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.htn-check.done {
  background: #34d399;
  border-color: #34d399;
}

.htn-check.active {
  border-color: #ffd68a;
  color: #ffd68a;
}

.htn-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.htn-title {
  display: flex;
  align-items: baseline;
  gap: 7px;
  color: #e9ecf8;
  font-size: 14.5px;
  line-height: 1.35;
}

.htn-icon {
  flex-shrink: 0;
}

.htn-text {
  overflow-wrap: anywhere;
}

.htn-row.done .htn-text {
  color: #8b91aa;
  text-decoration: line-through;
  text-decoration-color: rgba(139, 145, 170, 0.5);
}

.htn-progress {
  font-size: 12px;
  color: #7d849e;
  flex-shrink: 0;
}

.htn-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.htn-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid #2c3146;
  background: #151827;
  color: #cfd3e6;
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.htn-chip:hover {
  border-color: #8b7cff;
}

.htn-chip.artifact {
  background: linear-gradient(135deg, rgba(109, 91, 255, 0.28), rgba(59, 130, 246, 0.22));
  border-color: rgba(139, 124, 255, 0.5);
  color: #f0eeff;
  font-weight: 600;
}

.htn-chip.pdf {
  border-color: rgba(255, 140, 120, 0.35);
}

.htn-chip.missing {
  opacity: 0.5;
  text-decoration: line-through;
}

.htn-chip-pct {
  color: #8b91aa;
  font-size: 11.5px;
}

.htn-add {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #6f7590;
  font-size: 15px;
  cursor: pointer;
  opacity: 0.55;
}

.htn-row:hover .htn-add,
.htn-row.selected .htn-add {
  opacity: 1;
  border-color: #2c3146;
}

.htn-adder {
  display: flex;
  gap: 6px;
  padding: 4px 8px 8px calc(52px + var(--depth) * 20px);
}

.htn-kind,
.htn-input {
  background: #0b0d16;
  border: 1px solid #2a2f45;
  border-radius: 9px;
  color: #eef0f8;
  font-size: 14px;
  padding: 7px 9px;
  outline: none;
}

.htn-input {
  flex: 1;
  min-width: 0;
}

.htn-input:focus {
  border-color: #8b7cff;
}

@media (hover: none) {
  .htn-add {
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .htn-row {
    padding-left: calc(4px + var(--depth) * 14px);
    padding-top: 8px;
    padding-bottom: 8px;
  }

  /* Галочка под палец: 22px на телефоне — это промах через раз */
  .htn-check {
    width: 28px;
    height: 28px;
    margin-top: -2px;
  }

  .htn-add {
    width: 34px;
    height: 34px;
    margin-top: -4px;
  }

  .htn-chip {
    padding: 7px 11px;
    font-size: 13px;
  }

  .htn-kind,
  .htn-input {
    font-size: 16px;
  }

  .htn-adder {
    padding-left: calc(30px + var(--depth) * 14px);
    flex-wrap: wrap;
  }

  .htn-kind {
    flex-basis: 100%;
  }
}
</style>
