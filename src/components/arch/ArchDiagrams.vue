<script setup>
import { computed, inject, ref, watch } from "vue";
import { VIEW_GROUPS, viewList } from "./archModel.js";
import ArchDiagram from "./ArchDiagram.vue";
import ArchElementPanel from "./ArchElementPanel.vue";

// Диаграммы проекта: структура C4, сценарии, развёртывание. Клик по блоку —
// карточка элемента справа, клик по стрелке сценария — подробности шага.
const arch = inject("arch");
const { dump, selection, layouts, errors } = arch;

const query = ref("");
const editable = ref(false);
const variant = ref("");
const edge = ref(null);

const views = computed(() => viewList(dump.value));
const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  return VIEW_GROUPS.map((g) => ({
    ...g,
    views: views.value.filter(
      (v) => v.type === g.type && (!q || v.title.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)),
    ),
  })).filter((g) => g.views.length);
});

const current = computed(() => {
  const list = views.value;
  return list.find((v) => v.id === selection.view) || list.find((v) => v.id === "index") || list[0] || null;
});

watch(
  current,
  (v) => {
    if (v && selection.view !== v.id) selection.view = v.id;
  },
  { immediate: true },
);

// Другой сценарий — свой выбор вида; ручную раскладку и выделение сбрасываем.
watch(
  () => selection.view,
  () => {
    variant.value = "";
    edge.value = null;
  },
);

const hasManual = computed(() => !!(current.value && layouts.value[current.value.id]));

function onNode(node) {
  edge.value = null;
  selection.element = node.modelRef || node.id;
}

function onEdge(e) {
  selection.element = "";
  edge.value = e;
}

function closePanel() {
  selection.element = "";
  edge.value = null;
}
</script>

<template>
  <div class="ar-split" :class="{ 'is-three': selection.element || edge }">
    <div class="ar-side">
      <input v-model="query" class="ar-input" placeholder="Найти диаграмму" style="margin-bottom: 4px" />
      <div v-if="!views.length" class="ar-muted" style="padding: 10px; font-size: 13px">
        Диаграмм пока нет. Добавьте <span class="ar-mono">views</span> в модель — во вкладке «Редактор».
      </div>
      <template v-for="g in groups" :key="g.type">
        <div class="ar-group-title">{{ g.icon }} {{ g.title }}</div>
        <div
          v-for="v in g.views"
          :key="v.id"
          class="ar-item"
          :class="{ 'is-active': current && v.id === current.id }"
          :title="v.description || v.id"
          @click="selection.view = v.id"
        >
          <span class="ar-item-label">{{ v.title }}</span>
          <span v-if="layouts[v.id]" class="ar-dim" title="ручная раскладка">✋</span>
        </div>
      </template>
    </div>

    <div class="ar-pane">
      <div class="ar-pane-head">
        <template v-if="current">
          <strong style="font-size: 14px">{{ current.title }}</strong>
          <span class="ar-mono ar-dim" style="font-size: 12px">{{ current.id }}</span>
        </template>
        <div class="ar-spacer" />
        <template v-if="current?.type === 'dynamic'">
          <button class="ar-btn is-small" :class="{ 'is-active': variant === 'sequence' || (!variant && current.variant === 'sequence') }" @click="variant = 'sequence'">
            Sequence
          </button>
          <button class="ar-btn is-small" :class="{ 'is-active': variant === 'diagram' || (!variant && current.variant !== 'sequence') }" @click="variant = 'diagram'">
            Схема
          </button>
        </template>
        <button
          class="ar-btn is-small"
          :class="{ 'is-active': editable }"
          title="Двигать блоки и менять стиль прямо на диаграмме. Раскладка сохраняется сама."
          @click="editable = !editable"
        >
          ✋ {{ editable ? "Готово" : "Раскладка" }}
        </button>
        <span v-if="hasManual" class="ar-chip" title="У диаграммы ручная раскладка">ручная</span>
        <button v-if="current" class="ar-btn is-small" @click="arch.openSource({ view: current.id })">
          ‹›&nbsp;Код
        </button>
      </div>
      <div v-if="errors.length" class="ar-note" style="margin: 8px 10px 0">
        В модели ошибки ({{ errors.length }}) — показана последняя часть, которая разобралась.
        <a href="#" @click.prevent="arch.go('editor')">Открыть редактор</a>
      </div>
      <div class="ar-pane-body">
        <ArchDiagram
          v-if="dump && current"
          :dump="dump"
          :layouts="layouts"
          :view-id="current.id"
          :editable="editable"
          :variant="variant"
          @navigate="selection.view = $event"
          @node-click="onNode"
          @edge-click="onEdge"
          @change="arch.applyDiagramChange"
        />
        <div v-else-if="arch.building.value" class="ar-empty">Разбираю модель…</div>
      </div>
    </div>

    <ArchElementPanel
      v-if="selection.element || edge"
      :element-id="selection.element"
      :edge="edge"
      :view-id="current?.id || ''"
      @close="closePanel"
    />
  </div>
</template>
