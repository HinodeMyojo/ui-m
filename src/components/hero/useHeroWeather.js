import { computed } from "vue";
import { weather, sky, ensureWeather } from "@/composables/useWeather.js";

// Погода для сцены героя — из того же источника, что панель погоды и осенний
// слой (composables/useWeather.js, Open-Meteo по точке пользователя). Новых
// запросов не делаем: только переводим общее состояние в форму пропа
// HeroScene: { kind, wind, intensity, dir }.
//
// Осадки берём из sky, а не из кода WMO: так сцена слушается переключателя
// «дождь: всегда / никогда» на панели погоды, как и осенний слой.

const FOG = new Set([45, 48]);

// Сильный ветер для сцены — 12 м/с: выше уже шторм, пламя и так лежит.
const WIND_FULL = 12;

export function heroWeatherFrom(w, s) {
  if (!w) return null;
  let kind = "clear";
  if (s.snow > 0) kind = "snow";
  else if (s.rain > 0) kind = w.code >= 95 ? "storm" : "rain";
  else if (FOG.has(w.code)) kind = "fog";
  // Коды 2–3 — облачно; дождевые коды при выключенном дожде — тоже просто тучи.
  else if (w.code >= 2) kind = "clouds";
  const wind = Math.min(1, Math.max(0, (w.wind || 0) / WIND_FULL));
  return {
    kind,
    wind: Math.round(wind * 100) / 100,
    intensity: s.snow || s.rain || 0,
    // sky.push > 0 — ветер с запада, гонит вправо.
    dir: s.push < 0 ? -1 : 1,
  };
}

export function useHeroWeather() {
  // Опрос стартует один раз на всё приложение; без выбранного места и при
  // выключенном Open-Meteo в админке погода остаётся null — сцена тогда
  // рисует ясную погоду со слабым ветром.
  ensureWeather();
  return computed(() => heroWeatherFrom(weather.value, sky.value));
}
