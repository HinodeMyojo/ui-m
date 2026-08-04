<script setup>
// Карта Google: подложка, поиск мест прямо на карте и знакомый вид.
//
// Зачем отдельный движок: тайлы Google законно доступны только через их JS API,
// поэтому Leaflet тут не подходит. Интерфейс наружу такой же, как у TravelMap,
// чтобы экраны не знали, какой движок под ними.
import { ref, shallowRef, onMounted, onBeforeUnmount, watch, nextTick } from "vue";

const props = defineProps({
  apiKey: { type: String, required: true },
  markers: { type: Array, default: () => [] },
  lines: { type: Array, default: () => [] },
  bbox: { type: Array, default: null },
  center: { type: Array, default: () => [35.6895, 139.6917] },
  zoom: { type: Number, default: 5 },
  layer: { type: String, default: "scheme" },
  selectedId: { type: String, default: "" },
  picking: { type: Boolean, default: false },
  // Ограничить поиск страной — коды вида "JP".
  countryCode: { type: String, default: "" },
});

const emit = defineEmits([
  "map-click", "marker-click", "marker-drag", "view-change", "ready", "place-picked",
]);

const container = ref(null);
const searchInput = ref(null);
const map = shallowRef(null);
const markerObjects = new Map();
const lineObjects = [];
const activeLayer = ref(props.layer);
const failed = ref("");
// Карту центрируем по стране один раз: дальше вид принадлежит пользователю.
let fitted = false;

const LAYERS = {
  scheme: { label: "Схема", icon: "mdi-map", type: "roadmap" },
  // Гибрид — спутник с подписями: без них на спутнике ничего не найти.
  satellite: { label: "Спутник", icon: "mdi-satellite-variant", type: "hybrid" },
  relief: { label: "Рельеф", icon: "mdi-terrain", type: "terrain" },
};

// Загрузчик JS API: скрипт грузим один раз на всю страницу.
let loaderPromise = null;

function loadGoogleMaps(apiKey) {
  if (window.google?.maps?.marker) return Promise.resolve(window.google);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      libraries: "places,marker",
      language: "ru",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("не удалось загрузить карту Google"));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

// Маркер рисуем сами: нужен цвет категории и иконка, а не стандартная капля.
function pinElement(item) {
  const wrap = document.createElement("div");
  const selected = item.selected || item.id === props.selectedId;
  wrap.className = [
    "gm-pin",
    item.dimmed ? "gm-pin--dimmed" : "",
    selected ? "gm-pin--selected" : "",
  ].filter(Boolean).join(" ");
  wrap.style.setProperty("--pin-color", item.color || "#1767fd");
  wrap.innerHTML = `
    <i class="mdi ${item.icon || "mdi-map-marker"}"></i>
    ${item.badge ? `<span class="gm-pin__badge">${item.badge}</span>` : ""}`;
  return wrap;
}

function renderMarkers() {
  if (!map.value || !window.google?.maps?.marker) return;
  const { AdvancedMarkerElement } = window.google.maps.marker;

  markerObjects.forEach((marker) => {
    marker.map = null;
  });
  markerObjects.clear();

  props.markers.forEach((item) => {
    if (item.lat == null || item.lng == null) return;
    const marker = new AdvancedMarkerElement({
      map: map.value,
      position: { lat: item.lat, lng: item.lng },
      content: pinElement(item),
      title: item.title || "",
      gmpDraggable: Boolean(item.draggable),
      zIndex: item.id === props.selectedId ? 1000 : 1,
    });
    marker.addListener("click", () => emit("marker-click", item.id));
    if (item.draggable) {
      marker.addListener("dragend", (event) => {
        emit("marker-drag", {
          id: item.id,
          lat: event.latLng.lat(),
          lng: event.latLng.lng(),
        });
      });
    }
    markerObjects.set(item.id, marker);
  });
}

function renderLines() {
  if (!map.value) return;
  lineObjects.forEach((line) => line.setMap(null));
  lineObjects.length = 0;

  props.lines.forEach((line) => {
    if (!line.points || line.points.length < 2) return;
    const polyline = new window.google.maps.Polyline({
      map: map.value,
      path: line.points.map(([lat, lng]) => ({ lat, lng })),
      strokeColor: line.color || "#1767fd",
      strokeOpacity: line.dashed ? 0 : line.dimmed ? 0.4 : 0.9,
      strokeWeight: line.weight || 4,
      // Пунктир в Google рисуется символами, а не dashArray.
      icons: line.dashed
        ? [{
            icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, scale: 3 },
            offset: "0",
            repeat: "14px",
          }]
        : undefined,
    });
    lineObjects.push(polyline);
  });
}

function applyLayer(name) {
  if (!map.value) return;
  activeLayer.value = name;
  map.value.setMapTypeId((LAYERS[name] || LAYERS.scheme).type);
}

function fitCountry(force = false) {
  if (!map.value) return;
  if (fitted && !force) return;

  const box = props.bbox;
  if (box && box.length === 4 && box.some((v) => v !== 0)) {
    map.value.fitBounds({
      south: box[0], west: box[1], north: box[2], east: box[3],
    }, 24);
  } else {
    map.value.setCenter({ lat: props.center[0], lng: props.center[1] });
    map.value.setZoom(props.zoom);
  }
  fitted = true;
}

function focusMarker(id, zoom = 15) {
  const marker = markerObjects.get(id);
  if (!marker || !map.value) return;
  map.value.panTo(marker.position);
  if (map.value.getZoom() < zoom) map.value.setZoom(zoom);
}

function currentView() {
  if (!map.value) return null;
  const center = map.value.getCenter();
  const bounds = map.value.getBounds();
  const view = { centerLat: center.lat(), centerLng: center.lng(), zoom: map.value.getZoom() };
  if (bounds) {
    view.bboxMinLat = bounds.getSouthWest().lat();
    view.bboxMinLng = bounds.getSouthWest().lng();
    view.bboxMaxLat = bounds.getNorthEast().lat();
    view.bboxMaxLng = bounds.getNorthEast().lng();
  }
  return view;
}

// Поиск: автодополнение Google прямо над картой. Ради него всё и затевалось —
// японские названия набирать вручную невозможно.
function setupSearch() {
  if (!searchInput.value || !window.google?.maps?.places) return;

  const options = {
    fields: ["geometry", "name", "formatted_address", "place_id", "rating", "types"],
  };
  if (props.countryCode) {
    options.componentRestrictions = { country: props.countryCode.toLowerCase() };
  }

  const autocomplete = new window.google.maps.places.Autocomplete(searchInput.value, options);
  autocomplete.bindTo("bounds", map.value);

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place.geometry?.location) return;

    const found = {
      title: place.name || "",
      address: place.formatted_address || "",
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      externalId: place.place_id || "",
      provider: "google",
      rating: place.rating ?? null,
      kind: place.types?.[0] || "",
    };
    // Показываем найденное место, но вид не сбрасываем: пользователь сам решит.
    map.value.panTo(place.geometry.location);
    if (map.value.getZoom() < 15) map.value.setZoom(15);
    emit("place-picked", found);
    searchInput.value.value = "";
  });
}

onMounted(async () => {
  await nextTick();
  try {
    await loadGoogleMaps(props.apiKey);
  } catch (e) {
    failed.value = e.message;
    return;
  }

  map.value = new window.google.maps.Map(container.value, {
    center: { lat: props.center[0] || 0, lng: props.center[1] || 0 },
    zoom: props.zoom,
    mapTypeId: (LAYERS[props.layer] || LAYERS.scheme).type,
    mapTypeControl: false,
    streetViewControl: true,
    fullscreenControl: false,
    zoomControl: true,
    // Идентификатор нужен для собственных маркеров.
    mapId: "travel-map",
    gestureHandling: "greedy",
  });

  map.value.addListener("click", (event) => {
    emit("map-click", { lat: event.latLng.lat(), lng: event.latLng.lng() });
  });
  map.value.addListener("idle", () => emit("view-change", currentView()));

  fitCountry();
  renderMarkers();
  renderLines();
  setupSearch();
  emit("ready");
});

onBeforeUnmount(() => {
  markerObjects.forEach((marker) => {
    marker.map = null;
  });
  markerObjects.clear();
  lineObjects.forEach((line) => line.setMap(null));
});

watch(() => props.markers, renderMarkers, { deep: true });
watch(() => props.lines, renderLines, { deep: true });
watch(() => props.selectedId, renderMarkers);
watch(() => props.layer, (value) => applyLayer(value));
// Сменилась страна — только тогда переставляем вид.
watch(() => (props.bbox || []).join(","), () => {
  fitted = false;
  fitCountry();
});

defineExpose({
  focusMarker,
  fitCountry: () => fitCountry(true),
  currentView,
  invalidate: () => window.google?.maps?.event?.trigger(map.value, "resize"),
});
</script>

<template>
  <div class="gmap" :class="{ 'gmap--picking': picking }">
    <div v-if="failed" class="gmap__failed">
      {{ failed }}. Проверь ключ и включённые API в консоли Google.
    </div>
    <div ref="container" class="gmap__canvas"></div>

    <!-- Поиск мест: ради него и нужен Google -->
    <div class="gmap__search">
      <i class="mdi mdi-magnify"></i>
      <input ref="searchInput" type="text" placeholder="Найти место…" />
    </div>

    <div class="gmap__layers">
      <button
        v-for="(def, key) in LAYERS"
        :key="key"
        :class="{ active: activeLayer === key }"
        :title="def.label"
        @click="applyLayer(key)"
      >
        <i class="mdi" :class="def.icon"></i>
        <span>{{ def.label }}</span>
      </button>
    </div>

    <div v-if="picking" class="gmap__hint">Кликни по карте, чтобы поставить точку</div>
    <slot></slot>
  </div>
</template>

<style scoped>
.gmap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  overflow: hidden;
  background: #1b1e27;
  border-radius: 14px;
}

.gmap__canvas {
  width: 100%;
  height: 100%;
}

.gmap--picking :deep(.gm-style) {
  cursor: crosshair !important;
}

.gmap__failed {
  position: absolute;
  inset: 0;
  z-index: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-size: 13px;
  color: #ff9d9f;
  text-align: center;
  background: #12141a;
}

.gmap__search {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 500;
  display: flex;
  gap: 7px;
  align-items: center;
  width: min(340px, calc(100% - 130px));
  padding: 8px 12px;
  background: rgba(24, 27, 35, 0.94);
  border: 1px solid #333846;
  border-radius: 10px;
  backdrop-filter: blur(6px);
}

.gmap__search i {
  color: #6e7688;
}

.gmap__search input {
  flex: 1;
  font-size: 13px;
  color: #eaeef7;
  background: transparent;
  border: none;
  outline: none;
}

.gmap__layers {
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

.gmap__layers button {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 10px;
  font-size: 12px;
  color: #b9c0cf;
  white-space: nowrap;
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
}

.gmap__layers button.active {
  color: #fff;
  background: #1767fd;
}

.gmap__hint {
  position: absolute;
  bottom: 16px;
  left: 50%;
  z-index: 500;
  padding: 8px 16px;
  font-size: 13px;
  color: #fff;
  pointer-events: none;
  background: rgba(23, 103, 253, 0.92);
  border-radius: 999px;
  transform: translateX(-50%);
}

/* Маркеры создаются вручную, поэтому стили не изолированы. */
:deep(.gm-pin) {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: #fff;
  background: var(--pin-color, #1767fd);
  border: 2px solid #fff;
  border-radius: 50% 50% 50% 4px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.45);
  transform: rotate(-45deg);
}

:deep(.gm-pin i) {
  font-size: 17px;
  transform: rotate(45deg);
}

:deep(.gm-pin--dimmed) {
  opacity: 0.45;
  filter: grayscale(0.6);
}

:deep(.gm-pin--selected) {
  box-shadow: 0 0 0 4px rgba(23, 103, 253, 0.4), 0 4px 14px rgba(0, 0, 0, 0.5);
  transform: rotate(-45deg) scale(1.2);
}

:deep(.gm-pin__badge) {
  position: absolute;
  top: -7px;
  right: -7px;
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

/* Всплывашки Google по умолчанию светлые — приглушаем под тёмный интерфейс. */
:deep(.gm-style-iw) {
  background: #1b1e27 !important;
}

@media (max-width: 720px) {
  .gmap__search {
    width: calc(100% - 100px);
    padding: 10px 12px;
  }

  .gmap__layers {
    flex-direction: row;
    top: auto;
    bottom: 12px;
    right: 12px;
  }

  .gmap__layers button span {
    display: none;
  }

  .gmap__layers button {
    padding: 9px;
  }
}
</style>
