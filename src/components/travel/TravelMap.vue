<script setup>
// Карта модуля «Путешествия» — переключатель движка.
//
// Основной движок — Google: знакомый вид, спутник с подписями и поиск мест
// прямо на карте (иначе японские названия набирать невозможно). Запасной —
// Leaflet на бесплатных подложках: работает, когда ключа нет.
//
// Экраны про это не знают: интерфейс и события одинаковые у обоих движков.
import { ref, shallowRef, computed, onMounted } from "vue";
import GoogleTravelMap from "./GoogleTravelMap.vue";
import LeafletTravelMap from "./LeafletTravelMap.vue";
import { fetchTravelSettings } from "@/components/api.js";

const props = defineProps({
  markers: { type: Array, default: () => [] },
  lines: { type: Array, default: () => [] },
  bbox: { type: Array, default: null },
  center: { type: Array, default: () => [35.6895, 139.6917] },
  zoom: { type: Number, default: 5 },
  layer: { type: String, default: "scheme" },
  selectedId: { type: String, default: "" },
  picking: { type: Boolean, default: false },
  countryCode: { type: String, default: "" },
});

const emit = defineEmits([
  "map-click", "marker-click", "marker-drag", "view-change", "ready", "place-picked",
]);

// Настройки одни на всё приложение — тянем один раз и держим в модуле.
let settingsPromise = null;
const settings = ref(null);
const engineRef = shallowRef(null);

const useGoogle = computed(
  () => settings.value?.mapEngine === "google" && Boolean(settings.value?.googleApiKey),
);

onMounted(async () => {
  if (!settingsPromise) settingsPromise = fetchTravelSettings();
  try {
    settings.value = await settingsPromise;
  } catch {
    // Настройки не пришли — работаем на бесплатной подложке.
    settings.value = { mapEngine: "osm" };
  }
});

// Наружу отдаём те же методы, что и у движков: экраны вызывают их через ref.
defineExpose({
  focusMarker: (...args) => engineRef.value?.focusMarker(...args),
  fitCountry: (...args) => engineRef.value?.fitCountry(...args),
  currentView: () => engineRef.value?.currentView(),
  invalidate: () => engineRef.value?.invalidate(),
});
</script>

<template>
  <GoogleTravelMap
    v-if="settings && useGoogle"
    ref="engineRef"
    :api-key="settings.googleApiKey"
    :markers="markers"
    :lines="lines"
    :bbox="bbox"
    :center="center"
    :zoom="zoom"
    :layer="layer"
    :selected-id="selectedId"
    :picking="picking"
    :country-code="countryCode"
    @map-click="emit('map-click', $event)"
    @marker-click="emit('marker-click', $event)"
    @marker-drag="emit('marker-drag', $event)"
    @view-change="emit('view-change', $event)"
    @place-picked="emit('place-picked', $event)"
    @ready="emit('ready')"
  >
    <slot></slot>
  </GoogleTravelMap>

  <LeafletTravelMap
    v-else-if="settings"
    ref="engineRef"
    :markers="markers"
    :lines="lines"
    :bbox="bbox"
    :center="center"
    :zoom="zoom"
    :layer="layer"
    :selected-id="selectedId"
    :picking="picking"
    @map-click="emit('map-click', $event)"
    @marker-click="emit('marker-click', $event)"
    @marker-drag="emit('marker-drag', $event)"
    @view-change="emit('view-change', $event)"
    @ready="emit('ready')"
  >
    <slot></slot>
  </LeafletTravelMap>

  <div v-else class="travel-map-loading">Загружаю карту…</div>
</template>

<style scoped>
.travel-map-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 240px;
  font-size: 13px;
  color: #6e7688;
  background: #1b1e27;
  border-radius: 14px;
}
</style>
