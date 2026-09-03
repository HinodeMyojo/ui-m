<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount, nextTick } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { searchPlaces } from "@/composables/useWeather.js";

// Карта для выбора точки погоды. Вынесена в отдельный компонент и грузится
// лениво: Leaflet весит больше, чем весь осенний слой, и на каждой странице
// он не нужен.

const props = defineProps({
  lat: { type: Number, default: 55.7558 },
  lon: { type: Number, default: 37.6173 },
});
const emit = defineEmits(["close", "pick"]);

const container = ref(null);
const map = shallowRef(null);
const marker = shallowRef(null);
const point = ref({ lat: props.lat, lon: props.lon, name: "" });

const query = ref("");
const results = ref([]);
const searching = ref(false);
const searchError = ref("");
let searchTimer = null;

function place(lat, lon, name = "") {
  point.value = { lat, lon, name };
  if (!map.value) return;
  if (marker.value) marker.value.setLatLng([lat, lon]);
  else marker.value = L.marker([lat, lon]).addTo(map.value);
}

onMounted(async () => {
  await nextTick();
  map.value = L.map(container.value, {
    center: [point.value.lat, point.value.lon],
    zoom: 9,
    zoomControl: false,
    attributionControl: true,
  });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map.value);
  L.control.zoom({ position: "bottomright" }).addTo(map.value);
  place(point.value.lat, point.value.lon);
  map.value.on("click", (event) => place(event.latlng.lat, event.latlng.lng));
});

onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  map.value?.remove();
});

function onQuery() {
  clearTimeout(searchTimer);
  searchError.value = "";
  if (query.value.trim().length < 2) {
    results.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    searching.value = true;
    try {
      results.value = await searchPlaces(query.value);
    } catch (e) {
      searchError.value = e.message || "поиск не удался";
      results.value = [];
    } finally {
      searching.value = false;
    }
  }, 400);
}

function choose(found) {
  place(found.lat, found.lon, found.name);
  map.value?.setView([found.lat, found.lon], 10);
  results.value = [];
  query.value = found.name;
}

function save() {
  emit("pick", {
    lat: point.value.lat,
    lon: point.value.lon,
    name: point.value.name || `${point.value.lat.toFixed(2)}, ${point.value.lon.toFixed(2)}`,
  });
}
</script>

<template>
  <div class="wmp-overlay" @click.self="emit('close')">
    <div class="wmp-card">
      <header class="wmp-head">
        <h3>Откуда брать погоду</h3>
        <button class="wmp-x" @click="emit('close')">×</button>
      </header>

      <div class="wmp-search">
        <input
          v-model="query"
          class="wmp-input"
          placeholder="Город — или просто ткните в карту"
          @input="onQuery"
        />
        <div v-if="searching" class="wmp-hint">ищу…</div>
        <div v-else-if="searchError" class="wmp-hint bad">{{ searchError }}</div>
        <ul v-if="results.length" class="wmp-results">
          <li v-for="r in results" :key="`${r.lat},${r.lon}`">
            <button @click="choose(r)">
              <b>{{ r.name }}</b>
              <span v-if="r.hint">{{ r.hint }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div ref="container" class="wmp-map"></div>

      <footer class="wmp-foot">
        <span class="wmp-coords">
          {{ point.lat.toFixed(4) }}, {{ point.lon.toFixed(4) }}
        </span>
        <button class="wmp-btn ghost" @click="emit('close')">Отмена</button>
        <button class="wmp-btn primary" @click="save">Сохранить</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.wmp-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.wmp-card {
  width: 100%;
  max-width: 620px;
  background: #1b1d24;
  border: 1px solid #2f3340;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
}

.wmp-head {
  display: flex;
  align-items: center;
  padding: 14px 16px 10px;
}

.wmp-head h3 {
  margin: 0;
  font-size: 15px;
  color: #f0f2f7;
  font-weight: 600;
}

.wmp-x {
  margin-left: auto;
  background: none;
  border: none;
  color: #8f95a6;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.wmp-x:hover {
  color: #fff;
}

.wmp-search {
  padding: 0 16px 10px;
  position: relative;
}

.wmp-input {
  width: 100%;
  box-sizing: border-box;
  background: #16171d;
  border: 1px solid #2f3340;
  border-radius: 9px;
  color: #e8eaf2;
  padding: 9px 12px;
  font-size: 13.5px;
  outline: none;
}

.wmp-input:focus {
  border-color: #e07b39;
}

.wmp-hint {
  color: #7a7f8e;
  font-size: 11.5px;
  padding: 5px 2px 0;
}

.wmp-hint.bad {
  color: #ff9ba0;
}

.wmp-results {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  position: absolute;
  left: 16px;
  right: 16px;
  z-index: 5;
  background: #21242e;
  border: 1px solid #333747;
  border-radius: 10px;
  overflow: hidden;
  max-height: 220px;
  overflow-y: auto;
}

.wmp-results button {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.wmp-results button:hover {
  background: #2a2e3b;
}

.wmp-results b {
  color: #e8eaf2;
  font-size: 13px;
  font-weight: 500;
}

.wmp-results span {
  color: #7a7f8e;
  font-size: 11px;
}

.wmp-map {
  height: 340px;
  background: #101219;
}

.wmp-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #262a36;
}

.wmp-coords {
  margin-right: auto;
  color: #8f95a6;
  font-size: 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.wmp-btn {
  border-radius: 9px;
  padding: 8px 15px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #333747;
  background: #22242d;
  color: #cfd3e0;
}

.wmp-btn.primary {
  background: #e07b39;
  border-color: #e07b39;
  color: #1a1206;
  font-weight: 600;
}

.wmp-btn.ghost {
  background: transparent;
  color: #8f95a6;
}

@media (max-width: 640px) {
  .wmp-overlay {
    padding: 10px;
  }
  .wmp-map {
    height: 260px;
  }
}
</style>
