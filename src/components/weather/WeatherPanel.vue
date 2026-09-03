<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from "vue";
import {
  place,
  weather,
  loading,
  error,
  rainMode,
  sky,
  refresh,
  ensureWeather,
  setPlace,
  locate,
  geoAvailable,
  weatherIcon,
  weatherText,
} from "@/composables/useWeather.js";

// Погода слева: свёрнутая — узкая полоска с градусом, развёрнутая — карточка
// с деталями и настройкой места. Она же управляет дождём в осеннем слое.
const MapPicker = defineAsyncComponent(() => import("./WeatherMapPicker.vue"));

const open = ref(false);
const mapOpen = ref(false);
const geoError = ref("");

onMounted(ensureWeather);

const icon = computed(() =>
  weather.value ? weatherIcon(weather.value.code, weather.value.day) : "🌡",
);

const RAIN_MODES = [
  { key: "auto", label: "как на улице" },
  { key: "on", label: "всегда" },
  { key: "off", label: "никогда" },
];

// Направление, откуда дует: пользователю понятнее «северо-западный», чем 315°.
const COMPASS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
const windLabel = computed(() => {
  const w = weather.value;
  if (!w) return "";
  const side = COMPASS[Math.round(((w.dir % 360) / 45)) % 8];
  return `${side}, ${w.wind.toFixed(1)} м/с`;
});

const updatedAt = computed(() => {
  if (!weather.value) return "";
  return new Date(weather.value.at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
});

async function useMyPlace() {
  geoError.value = "";
  try {
    await locate();
  } catch (e) {
    geoError.value = e.message;
  }
}

function onPick({ lat, lon, name }) {
  setPlace(lat, lon, name, "map");
  mapOpen.value = false;
}
</script>

<template>
  <div class="wx" :class="{ open }">
    <button
      class="wx-pill"
      :title="place ? `${place.name || 'погода'} — открыть` : 'Настроить погоду'"
      @click="open = !open"
    >
      <span class="wx-pill-icon">{{ icon }}</span>
      <span v-if="weather" class="wx-pill-temp">{{ weather.temp }}°</span>
      <span v-else class="wx-pill-temp dim">?</span>
    </button>

    <div v-if="open" class="wx-card">
      <header class="wx-head">
        <span class="wx-name">{{ place?.name || "Место не выбрано" }}</span>
        <button class="wx-x" title="Свернуть" @click="open = false">×</button>
      </header>

      <div v-if="weather" class="wx-main">
        <span class="wx-icon">{{ icon }}</span>
        <div class="wx-now">
          <b>{{ weather.temp }}°</b>
          <span>{{ weatherText(weather.code) }}</span>
        </div>
      </div>

      <dl v-if="weather" class="wx-rows">
        <div><dt>ощущается</dt><dd>{{ weather.feels }}°</dd></div>
        <div><dt>ветер</dt><dd>{{ windLabel }}</dd></div>
        <div v-if="weather.humidity !== null"><dt>влажность</dt><dd>{{ weather.humidity }}%</dd></div>
        <div v-if="weather.rainChance !== null">
          <dt>осадки</dt>
          <dd>{{ weather.rainChance }}%</dd>
        </div>
        <div v-if="Number.isFinite(weather.min)">
          <dt>сегодня</dt>
          <dd>{{ weather.min }}° … {{ weather.max }}°</dd>
        </div>
      </dl>

      <p v-if="sky.rain > 0" class="wx-live">за окном дождь — и на сайте тоже 🌧</p>
      <p v-else-if="sky.snow > 0" class="wx-live">за окном снег ❄</p>

      <p v-if="!place" class="wx-empty">
        Укажите место — и сайт начнёт жить по вашей погоде: ветер, дождь, снег.
      </p>
      <p v-if="error" class="wx-err">{{ error }}</p>
      <p v-if="geoError" class="wx-err">{{ geoError }}</p>

      <div class="wx-actions">
        <button class="wx-btn" :disabled="!geoAvailable" @click="useMyPlace">📍 Моё место</button>
        <button class="wx-btn" @click="mapOpen = true">🗺 На карте</button>
        <button class="wx-btn icon" :disabled="loading || !place" title="Обновить" @click="refresh">
          ⟳
        </button>
      </div>
      <p v-if="!geoAvailable" class="wx-note">
        Геолокация работает только по https — поставьте точку на карте.
      </p>

      <div class="wx-rain">
        <span>Дождь на сайте</span>
        <div class="wx-seg">
          <button
            v-for="m in RAIN_MODES"
            :key="m.key"
            :class="{ on: rainMode === m.key }"
            @click="rainMode = m.key"
          >
            {{ m.label }}
          </button>
        </div>
      </div>

      <p v-if="updatedAt" class="wx-note">обновлено в {{ updatedAt }}</p>
    </div>

    <MapPicker
      v-if="mapOpen"
      :lat="place?.lat ?? 55.7558"
      :lon="place?.lon ?? 37.6173"
      @close="mapOpen = false"
      @pick="onPick"
    />
  </div>
</template>

<style scoped>
.wx {
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1500;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.wx-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 44px;
  padding: 9px 0 10px;
  border: 1px solid rgba(224, 123, 57, 0.3);
  border-left: none;
  border-radius: 0 12px 12px 0;
  background: rgba(24, 25, 31, 0.82);
  backdrop-filter: blur(6px);
  color: #e8eaf2;
  cursor: pointer;
  opacity: 0.62;
  transition: opacity 0.2s, box-shadow 0.2s, background 0.2s;
}

.wx-pill:hover,
.wx.open .wx-pill {
  opacity: 1;
  box-shadow: 0 0 18px rgba(224, 123, 57, 0.28);
}

.wx-pill-icon {
  font-size: 17px;
  line-height: 1;
}

.wx-pill-temp {
  font-size: 12.5px;
  font-weight: 700;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.wx-pill-temp.dim {
  color: #7a7f8e;
}

.wx-card {
  width: 246px;
  background: rgba(24, 25, 31, 0.96);
  border: 1px solid #2f3340;
  border-radius: 14px;
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  animation: wx-in 0.18s ease;
}

@keyframes wx-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
}

.wx-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wx-name {
  color: #e6c48a;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wx-x {
  margin-left: auto;
  background: none;
  border: none;
  color: #8f95a6;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.wx-x:hover {
  color: #fff;
}

.wx-main {
  display: flex;
  align-items: center;
  gap: 11px;
}

.wx-icon {
  font-size: 30px;
  line-height: 1;
}

.wx-now {
  display: flex;
  flex-direction: column;
}

.wx-now b {
  color: #f0f2f7;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.05;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.wx-now span {
  color: #9aa0b1;
  font-size: 12px;
}

.wx-rows {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.wx-rows > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.wx-rows dt {
  color: #7a7f8e;
  font-size: 11.5px;
}

.wx-rows dd {
  margin: 0;
  color: #cfd3e0;
  font-size: 11.5px;
}

.wx-live {
  margin: 0;
  color: #9dc0e8;
  font-size: 11.5px;
}

.wx-empty {
  margin: 0;
  color: #8f95a6;
  font-size: 11.5px;
  line-height: 1.5;
}

.wx-err {
  margin: 0;
  color: #ff9ba0;
  font-size: 11.5px;
  line-height: 1.45;
}

.wx-note {
  margin: 0;
  color: #5b6070;
  font-size: 10.5px;
  line-height: 1.45;
}

.wx-actions {
  display: flex;
  gap: 5px;
}

.wx-btn {
  flex: 1;
  background: #22242d;
  border: 1px solid #333747;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 7px 6px;
  font-size: 11.5px;
  cursor: pointer;
  white-space: nowrap;
}

.wx-btn:hover:not(:disabled) {
  border-color: #e07b39;
  color: #ffd9b0;
}

.wx-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.wx-btn.icon {
  flex: 0 0 32px;
}

.wx-rain {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.wx-rain > span {
  color: #7a7f8e;
  font-size: 11px;
}

.wx-seg {
  display: flex;
  gap: 2px;
  background: #16171d;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  padding: 2px;
}

.wx-seg button {
  flex: 1;
  background: transparent;
  border: none;
  color: #8f95a6;
  border-radius: 6px;
  padding: 5px 2px;
  font-size: 10.5px;
  cursor: pointer;
  white-space: nowrap;
}

.wx-seg button.on {
  background: rgba(224, 123, 57, 0.22);
  color: #ffd9b0;
  font-weight: 600;
}

@media (max-width: 768px) {
  .wx-pill {
    width: 38px;
    padding: 7px 0 8px;
  }
  .wx-pill-icon {
    font-size: 15px;
  }
  .wx-card {
    width: min(250px, calc(100vw - 62px));
  }
}
</style>
