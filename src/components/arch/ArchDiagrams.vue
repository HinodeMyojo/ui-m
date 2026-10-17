<script setup>
import { computed, inject, ref, watch } from "vue";
import { richText, scopedViewOf, sortViews, VIEW_GROUPS, VIEW_SORTS, viewList, viewTrail } from "./archModel.js";
import ArchDiagram from "./ArchDiagram.vue";
import ArchElementPanel from "./ArchElementPanel.vue";

// Диаграммы проекта: структура C4, сценарии, развёртывание. Клик по блоку
// проваливает внутрь него, если внутри есть своя диаграмма, и показывает
// карточку справа; клик по стрелке сценария — подробности шага.
const arch = inject("arch");
const { dump, selection, layouts, errors } = arch;

const query = ref("");
const editable = ref(false);
const variant = ref("");
const edge = ref(null);

// Порядок сценариев помнится между заходами.
const SORT_KEY = "arch.viewSort";
function readSort() {
  try {
    return localStorage.getItem(SORT_KEY) || "title";
  } catch {
    return "title";
  }
}
const sortMode = ref(readSort());
watch(sortMode, (v) => {
  try {
    localStorage.setItem(SORT_KEY, v);
  } catch {
    // приватное окно — просто не запомним
  }
});

const views = computed(() => sortViews(viewList(dump.value), sortMode.value));
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

const trail = computed(() => (current.value ? viewTrail(dump.value, current.value.id) : []));

const hasManual = computed(() => !!(current.value && layouts.value[current.value.id]));

function onNode(node) {
  edge.value = null;
  const fqn = node.modelRef || node.id;
  const inner = scopedViewOf(dump.value, fqn);
  if (inner && inner.id !== current.value?.id) {
    // Провалились внутрь — схеме нужна вся ширина; о блоке скажет строка сверху.
    selection.view = inner.id;
    selection.element = "";
    return;
  }
  selection.element = fqn;
}

// О чём текущая схема: блок, внутрь которого провалились, или описание схемы.
const about = computed(() => {
  const v = current.value;
  if (!v) return null;
  const el = v.viewOf ? dump.value?.elements?.[v.viewOf] : null;
  const text = richText(el?.description) || v.description || "";
  const first = text.split(/\n\s*\n/)[0].replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
  return first ? { text: first, element: el ? v.viewOf : "" } : null;
});

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
  <div class="ar-split" :class="{ 'is-three is-panel': selection.element || edge }">
    <div class="ar-side">
      <input v-model="query" class="ar-input" placeholder="Найти диаграмму" style="margin-bottom: 4px" />
      <div v-if="!views.length" class="ar-muted" style="padding: 10px; font-size: 13px">
        Диаграмм пока нет. Добавьте <span class="ar-mono">views</span> в модель — во вкладке «Редактор».
      </div>
      <template v-for="g in groups" :key="g.type">
        <div class="ar-group-title ar-row" style="gap: 6px">
          <span>{{ g.icon }} {{ g.title }}</span>
          <template v-if="g.type === 'dynamic'">
            <span class="ar-spacer" />
            <select v-model="sortMode" class="ar-select is-tiny" title="Порядок сценариев">
              <option v-for="o in VIEW_SORTS" :key="o.code" :value="o.code">{{ o.title }}</option>
            </select>
          </template>
        </div>
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
          <template v-for="t in trail" :key="t.id">
            <a href="#" class="ar-crumb" @click.prevent="selection.view = t.id">{{ t.title }}</a>
            <span class="ar-dim">›</span>
          </template>
          <strong style="font-size: 14px">{{ current.title }}</strong>
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
      <div v-if="about" class="ar-about">
        {{ about.text }}
        <a v-if="about.element" href="#" @click.prevent="selection.element = about.element">подробнее</a>
      </div>
      <div v-if="current?.type === 'element'" class="ar-hint">
        Нажмите на блок: если внутри есть схема — провалитесь в неё, иначе справа откроется, что он делает.
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
