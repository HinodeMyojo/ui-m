<script setup>
// Карта модуля «Путешествия» на Leaflet.
//
// Подложки без ключей: схема OSM, спутник Esri, рельеф OpenTopo. Тайлы Google
// требуют их собственный JS API, поэтому данные о местах берём из Google
// (поиск, рейтинг, фото), а рисуем всё на OSM — спецификация, раздел 5.
import { ref, shallowRef, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const props = defineProps({
  // Маркеры: { id, lat, lng, title, color, icon, dimmed, selected, badge }
  markers: { type: Array, default: () => [] },
  // Линии: { id, color, dashed, points: [[lat,lng], ...] }
  lines: { type: Array, default: () => [] },
  // Границы страны для первичного фокуса: [minLat, minLng, maxLat, maxLng]
  bbox: { type: Array, default: null },
  center: { type: Array, default: () => [35.6895, 139.6917] },
  zoom: { type: Number, default: 5 },
  layer: { type: String, default: "scheme" },
  selectedId: { type: String, default: "" },
  // Режим постановки точки: следующий клик по карте вернёт координаты.
  picking: { type: Boolean, default: false },
});

const emit = defineEmits(["map-click", "marker-click", "marker-drag", "view-change", "ready"]);

const container = ref(null);
const map = shallowRef(null);
const markerLayer = shallowRef(null);
const lineLayer = shallowRef(null);
const markerIndex = new Map();
const activeLayer = ref(props.layer);
const baseLayers = shallowRef({});

const LAYER_DEFS = {
  scheme: {
    label: "Схема",
    icon: "mdi-map",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 19, attribution: "© OpenStreetMap" },
  },
  satellite: {
    label: "Спутник",
    icon: "mdi-satellite-variant",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, attribution: "© Esri" },
  },
  relief: {
    label: "Рельеф",
    icon: "mdi-terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 17, attribution: "© OpenTopoMap" },
  },
};

function buildIcon(marker) {
  const color = marker.color || "#1767fd";
  const icon = marker.icon || "mdi-map-marker";
  const classes = [
    "travel-pin",
    marker.dimmed ? "travel-pin--dimmed" : "",
    marker.selected || marker.id === props.selectedId ? "travel-pin--selected" : "",
  ].filter(Boolean).join(" ");

  return L.divIcon({
    className: "travel-pin-wrap",
    html: `
      <div class="${classes}" style="--pin-color:${color}">
        <i class="mdi ${icon}"></i>
        ${marker.badge ? `<span class="travel-pin__badge">${marker.badge}</span>` : ""}
      </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });
}

function renderMarkers() {
  if (!markerLayer.value) return;
  markerLayer.value.clearLayers();
  markerIndex.clear();

  props.markers.forEach((item) => {
    if (item.lat == null || item.lng == null) return;
    const pin = L.marker([item.lat, item.lng], {
      icon: buildIcon(item),
      draggable: Boolean(item.draggable),
      title: item.title || "",
      zIndexOffset: item.id === props.selectedId ? 1000 : 0,
    });
    pin.on("click", () => emit("marker-click", item.id));
    if (item.draggable) {
      pin.on("dragend", (event) => {
        const { lat, lng } = event.target.getLatLng();
        emit("marker-drag", { id: item.id, lat, lng });
      });
    }
    pin.addTo(markerLayer.value);
    markerIndex.set(item.id, pin);
  });
}

function renderLines() {
  if (!lineLayer.value) return;
  lineLayer.value.clearLayers();

  props.lines.forEach((line) => {
    if (!line.points || line.points.length < 2) return;
    L.polyline(line.points, {
      color: line.color || "#1767fd",
      weight: line.weight || 3,
      opacity: line.dimmed ? 0.35 : 0.85,
      dashArray: line.dashed ? "6 8" : null,
    }).addTo(lineLayer.value);
  });
}

function applyLayer(name) {
  if (!map.value) return;
  const next = baseLayers.value[name] || baseLayers.value.scheme;
  Object.entries(baseLayers.value).forEach(([key, layer]) => {
    if (key !== name && map.value.hasLayer(layer)) map.value.removeLayer(layer);
  });
  if (next && !map.value.hasLayer(next)) next.addTo(map.value);
  activeLayer.value = name;
}

function switchLayer(name) {
  applyLayer(name);
}

// Фокус на страну: по границам, если они известны, иначе по центру.
function fitCountry() {
  if (!map.value) return;
  if (props.bbox && props.bbox.length === 4 && props.bbox.some((v) => v !== 0)) {
    map.value.fitBounds(
      [[props.bbox[0], props.bbox[1]], [props.bbox[2], props.bbox[3]]],
      { padding: [24, 24] },
    );
    return;
  }
  map.value.setView(props.center, props.zoom);
}

function focusMarker(id, zoom = 14) {
  const pin = markerIndex.get(id);
  if (pin && map.value) {
    map.value.setView(pin.getLatLng(), Math.max(map.value.getZoom(), zoom), { animate: true });
  }
}

function currentView() {
  if (!map.value) return null;
  const center = map.value.getCenter();
  const bounds = map.value.getBounds();
  return {
    centerLat: center.lat,
    centerLng: center.lng,
    zoom: map.value.getZoom(),
    bboxMinLat: bounds.getSouth(),
    bboxMinLng: bounds.getWest(),
    bboxMaxLat: bounds.getNorth(),
    bboxMaxLng: bounds.getEast(),
  };
}

onMounted(async () => {
  await nextTick();
  map.value = L.map(container.value, {
    center: props.center,
    zoom: props.zoom,
    zoomControl: false,
    attributionControl: true,
  });

  const built = {};
  Object.entries(LAYER_DEFS).forEach(([key, def]) => {
    built[key] = L.tileLayer(def.url, def.options);
  });
  baseLayers.value = built;
  applyLayer(props.layer);

  L.control.zoom({ position: "bottomright" }).addTo(map.value);

  markerLayer.value = L.layerGroup().addTo(map.value);
  lineLayer.value = L.layerGroup().addTo(map.value);

  map.value.on("click", (event) => {
    emit("map-click", { lat: event.latlng.lat, lng: event.latlng.lng });
  });
  map.value.on("moveend zoomend", () => emit("view-change", currentView()));

  fitCountry();
  renderMarkers();
  renderLines();
  emit("ready");
});

onBeforeUnmount(() => {
  if (map.value) {
    map.value.remove();
    map.value = null;
  }
});

watch(() => props.markers, renderMarkers, { deep: true });
watch(() => props.lines, renderLines, { deep: true });
watch(() => props.selectedId, renderMarkers);
watch(() => props.layer, (value) => applyLayer(value));
watch(() => props.bbox, fitCountry);

defineExpose({ focusMarker, fitCountry, currentView, invalidate: () => map.value?.invalidateSize() });
</script>

<template>
  <div class="travel-map" :class="{ 'travel-map--picking': picking }">
    <div ref="container" class="travel-map__canvas"></div>

    <div class="travel-map__layers">
      <button
        v-for="(def, key) in LAYER_DEFS"
        :key="key"
        class="travel-map__layer-btn"
        :class="{ active: activeLayer === key }"
        :title="def.label"
        @click="switchLayer(key)"
      >
        <i class="mdi" :class="def.icon"></i>
        <span>{{ def.label }}</span>
      </button>
    </div>

    <div v-if="picking" class="travel-map__hint">
      Кликни по карте, чтобы поставить точку
    </div>

    <slot></slot>
  </div>
</template>

<style scoped>
.travel-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  background: #1b1e27;
  border-radius: 14px;
  overflow: hidden;
}

.travel-map__canvas {
  width: 100%;
  height: 100%;
}

.travel-map--picking :deep(.leaflet-container) {
  cursor: crosshair;
}

.travel-map__layers {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 500;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  background: rgba(24, 27, 35, 0.9);
  border: 1px solid #333846;
  border-radius: 10px;
  backdrop-filter: blur(6px);
}

.travel-map__layer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: #b9c0cf;
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  white-space: nowrap;
}

.travel-map__layer-btn:hover {
  background: #262b36;
  color: #eaeef7;
}

.travel-map__layer-btn.active {
  background: #1767fd;
  color: #fff;
}

.travel-map__hint {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 500;
  padding: 8px 16px;
  font-size: 13px;
  color: #fff;
  background: rgba(23, 103, 253, 0.92);
  border-radius: 999px;
  pointer-events: none;
}

/* Маркеры рисуются через divIcon, поэтому стили не scoped-изолированы. */
:deep(.travel-pin) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: #fff;
  background: var(--pin-color, #1767fd);
  border: 2px solid #fff;
  border-radius: 50% 50% 50% 4px;
  transform: rotate(-45deg);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.45);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

:deep(.travel-pin i) {
  transform: rotate(45deg);
  font-size: 18px;
}

:deep(.travel-pin--dimmed) {
  opacity: 0.4;
  filter: grayscale(0.7);
}

:deep(.travel-pin--selected) {
  transform: rotate(-45deg) scale(1.22);
  box-shadow: 0 0 0 4px rgba(23, 103, 253, 0.35), 0 4px 14px rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

:deep(.travel-pin__badge) {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  font-size: 11px;
  line-height: 18px;
  color: #12141a;
  text-align: center;
  background: #ffd666;
  border-radius: 9px;
  transform: rotate(45deg);
}

@media (max-width: 720px) {
  .travel-map__layers {
    top: 8px;
    right: 8px;
    flex-direction: row;
  }

  .travel-map__layer-btn span {
    display: none;
  }

  .travel-map__layer-btn {
    padding: 8px;
  }
}
</style>
