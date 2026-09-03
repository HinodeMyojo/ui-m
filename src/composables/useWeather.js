import { ref, computed, watch } from "vue";

// Настоящая погода в точке пользователя. Нужна двум потребителям сразу:
// панели слева и осеннему слою — тот по ней льёт дождь и гонит ветер.
// Поэтому состояние общее и живёт здесь, а не внутри виджета.
//
// Open-Meteo: без ключа, без регистрации, с CORS. Сайт открывают по http,
// поэтому запрос идёт на https — в обратную сторону браузер бы его срезал.

const PLACE_KEY = "weatherPlace";
const RAIN_KEY = "weatherRainMode";
const REFRESH_MS = 10 * 60 * 1000;

function readPlace() {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return Number.isFinite(value?.lat) && Number.isFinite(value?.lon) ? value : null;
  } catch {
    return null;
  }
}

export const place = ref(readPlace());
export const weather = ref(null);
export const loading = ref(false);
export const error = ref("");

// авто — как на улице, вкл — дождь принудительно, выкл — сухо при любой погоде
export const rainMode = ref(localStorage.getItem(RAIN_KEY) || "auto");
watch(rainMode, (v) => localStorage.setItem(RAIN_KEY, v));

watch(place, (value) => {
  try {
    if (value) localStorage.setItem(PLACE_KEY, JSON.stringify(value));
    else localStorage.removeItem(PLACE_KEY);
  } catch {
    // Приватный режим — погода просто не запомнится до перезагрузки.
  }
  if (value) refresh();
});

// --- Коды WMO ---

const SNOW = new Set([71, 73, 75, 77, 85, 86]);
const RAIN = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

const TEXT = {
  0: "ясно",
  1: "почти ясно",
  2: "переменная облачность",
  3: "пасмурно",
  45: "туман",
  48: "изморозь",
  51: "морось",
  53: "морось",
  55: "сильная морось",
  56: "ледяная морось",
  57: "ледяная морось",
  61: "небольшой дождь",
  63: "дождь",
  65: "сильный дождь",
  66: "ледяной дождь",
  67: "ледяной дождь",
  71: "небольшой снег",
  73: "снег",
  75: "сильный снег",
  77: "снежная крупа",
  80: "ливень",
  81: "ливень",
  82: "сильный ливень",
  85: "снегопад",
  86: "сильный снегопад",
  95: "гроза",
  96: "гроза с градом",
  99: "гроза с градом",
};

export function weatherText(code) {
  return TEXT[code] || "погода";
}

export function weatherIcon(code, day = true) {
  if (SNOW.has(code)) return "🌨";
  if (code >= 95) return "⛈";
  if (code >= 80) return "🌧";
  if (code >= 61) return "🌧";
  if (code >= 51) return "🌦";
  if (code === 45 || code === 48) return "🌫";
  if (code === 3) return "☁️";
  if (code === 2) return day ? "⛅" : "☁️";
  if (code === 1) return day ? "🌤" : "🌙";
  return day ? "☀️" : "🌙";
}

// --- Загрузка ---

let timer = null;
let started = false;

export async function refresh() {
  const at = place.value;
  if (!at) return;
  loading.value = true;
  error.value = "";
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${at.lat.toFixed(4)}&longitude=${at.lon.toFixed(4)}` +
      "&current=temperature_2m,apparent_temperature,is_day,precipitation,weather_code," +
      "wind_speed_10m,wind_direction_10m,relative_humidity_2m" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&wind_speed_unit=ms&timezone=auto&forecast_days=1";
    const response = await fetch(url);
    if (!response.ok) throw new Error("сервис погоды не ответил");
    const data = await response.json();
    const c = data.current || {};
    weather.value = {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      day: c.is_day !== 0,
      code: c.weather_code ?? 0,
      precipitation: c.precipitation || 0,
      wind: c.wind_speed_10m || 0,
      dir: c.wind_direction_10m ?? 250,
      humidity: c.relative_humidity_2m ?? null,
      max: Math.round(data.daily?.temperature_2m_max?.[0]),
      min: Math.round(data.daily?.temperature_2m_min?.[0]),
      rainChance: data.daily?.precipitation_probability_max?.[0] ?? null,
      at: Date.now(),
    };
  } catch (e) {
    error.value = e.message || "не удалось узнать погоду";
  } finally {
    loading.value = false;
  }
}

// Опрашивать погоду начинаем только когда её кто-то показывает: пустой
// таймер на каждой вкладке никому не нужен.
export function ensureWeather() {
  if (started) return;
  started = true;
  if (place.value) refresh();
  timer = setInterval(() => {
    if (!document.hidden && place.value) refresh();
  }, REFRESH_MS);
}

export function stopWeather() {
  clearInterval(timer);
  started = false;
}

export function setPlace(lat, lon, name, source) {
  place.value = { lat: Number(lat), lon: Number(lon), name: name || "", source };
}

// Геолокация браузера живёт только в защищённом контексте. Сайт открывают по
// голому http, поэтому кнопка честно предупреждает, а не молча ничего не делает.
export const geoAvailable = computed(
  () => typeof navigator !== "undefined" && !!navigator.geolocation && window.isSecureContext,
);

export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("браузер не умеет геолокацию"));
    if (!window.isSecureContext) {
      return reject(new Error("геолокация работает только по https — поставьте точку на карте"));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPlace(pos.coords.latitude, pos.coords.longitude, "Моё место", "geo");
        resolve(place.value);
      },
      (err) => reject(new Error(err.message || "не удалось определить место")),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  });
}

export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(q)}&count=6&language=ru&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("поиск не удался");
  const data = await response.json();
  return (data.results || []).map((r) => ({
    lat: r.latitude,
    lon: r.longitude,
    name: r.name,
    hint: [r.admin1, r.country].filter(Boolean).join(", "),
  }));
}

// --- То, что видит осенний слой ---

// Сила осадков: сначала по коду («морось» и «сильный ливень» — разные стены
// воды), потом добавка по фактическим миллиметрам.
const HEAVY = new Set([65, 67, 75, 82, 86]);
const SHOWER = new Set([80, 81, 85]);
const DRIZZLE = new Set([51, 53, 55, 56, 57]);

function intensity(code, mm) {
  let base = 0.6;
  if (code >= 95) base = 1;
  else if (HEAVY.has(code)) base = 0.9;
  else if (SHOWER.has(code)) base = 0.8;
  else if (DRIZZLE.has(code)) base = 0.32;
  return Math.min(1, base + Math.min(0.3, (mm || 0) / 6));
}

export const sky = computed(() => {
  const w = weather.value;
  const mode = rainMode.value;
  let rain = 0;
  let snow = 0;
  if (w) {
    if (SNOW.has(w.code)) snow = intensity(w.code, w.precipitation);
    else if (RAIN.has(w.code)) rain = intensity(w.code, w.precipitation);
  }
  if (mode === "on") {
    if (!snow) rain = Math.max(rain, 0.6);
  } else if (mode === "off") {
    rain = 0;
    snow = 0;
  }
  return {
    rain,
    snow,
    // Метеорологическое направление — откуда дует. На экране нас интересует
    // только восток-запад: ветер с запада (270°) гонит листья вправо.
    wind: w?.wind || 0,
    push: w ? -Math.sin(((w.dir ?? 250) * Math.PI) / 180) : 0.6,
    known: !!w,
  };
});
