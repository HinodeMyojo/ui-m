<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";

// Диаграмма LikeC4 (React) внутри Vue. Сам React грузится только здесь и
// только когда диаграмма понадобилась: остальному сайту он не нужен.
const props = defineProps({
  dump: { type: Object, default: null },
  layouts: { type: Object, default: () => ({}) },
  viewId: { type: String, default: "" },
  editable: { type: Boolean, default: false },
  variant: { type: String, default: "" },
});
const emit = defineEmits(["navigate", "node-click", "edge-click", "change"]);

const host = ref(null);
const island = shallowRef(null);
const loadError = ref("");

function islandProps() {
  return {
    dump: props.dump,
    layouts: props.layouts,
    viewId: props.viewId,
    editable: props.editable,
    variant: props.variant,
    onNavigate: (to) => emit("navigate", to),
    onNodeClick: (node) => emit("node-click", node),
    onEdgeClick: (edge) => emit("edge-click", edge),
    // Правку ждём: LikeC4 не отпускает перетаскивание, пока она не сохранена.
    onChange: (viewId, change) =>
      new Promise((resolve) => emit("change", { viewId, change, done: resolve })),
  };
}

onMounted(async () => {
  try {
    const { mountDiagram } = await import("./likec4/diagramIsland.js");
    if (!host.value) return;
    island.value = mountDiagram(host.value, islandProps());
  } catch (err) {
    loadError.value = err.message || String(err);
  }
});

watch(
  () => [props.dump, props.layouts, props.viewId, props.editable, props.variant],
  () => island.value?.update(islandProps()),
);

onBeforeUnmount(() => island.value?.unmount());
</script>

<template>
  <div class="ar-diagram">
    <div v-if="loadError" class="ar-error">Диаграмма не загрузилась: {{ loadError }}</div>
    <div ref="host" class="ar-diagram-host" />
  </div>
</template>
