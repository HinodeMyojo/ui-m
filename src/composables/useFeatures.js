// Вкусняшки: какие разделы, слои и внешние сервисы включены у этой учётки.
//
// Каталог приезжает с сервера — там же его читают телеграм-боты, и второй
// список в браузере рано или поздно разъехался бы с первым. Здесь остаётся
// только то, что каталог знать не должен: гифки вместо иконок у двух плиток
// и проверка «пускать ли на этот путь».
//
// Состояние — один модульный ref на всё приложение, как isMobile: настройки
// читают и главная, и таб-бар, и навигационный страж, и запрашивать их
// каждому по разу — это лишние запросы на 0.2 ядра сервера.

import { computed, ref } from "vue";
import { fetchFeatures } from "@/components/featuresApi.js";

const CACHE_KEY = "features.v1";

// Слепок из localStorage нужен ради первого кадра: без него после перезагрузки
// страницы плитки выключенных разделов успевают мигнуть, а страж пропускает
// на закрытый маршрут, потому что ответа сервера ещё нет.
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const features = ref(readCache());

let pending = null;

function apply(state) {
  features.value = state;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // Приватный режим: работаем без слепка, состояние живёт в памяти.
  }
}

// loadFeatures вызывается один раз при старте приложения. Повторный вызов
// возвращает тот же запрос: карточки монтируются пачкой и спросили бы разом.
export function loadFeatures(force = false) {
  if (pending && !force) return pending;
  pending = fetchFeatures()
    .then((state) => {
      apply(state);
      return state;
    })
    .catch((err) => {
      // Сервер недоступен — остаёмся на слепке (или на «всё включено»).
      // Прятать разделы из-за сетевой ошибки хуже, чем показать лишнее.
      console.warn("Настройки вкусняшек не загружены:", err);
      return features.value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

// setFeatures — состояние, вернувшееся из админки после сохранения.
export function setFeatures(state) {
  if (state) apply(state);
}

// clearFeatures — выход из учётки: следующий вошедший не должен получить
// чужой набор разделов.
export function clearFeatures() {
  features.value = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* пусто */
  }
}

// isOn — главный вопрос ко всему этому файлу.
//
// Пока настройки не загрузились, ответ «включено»: приложение до появления
// админки выглядело именно так, и мигать спрятанным содержимым при каждом
// заходе нельзя.
export function isOn(key) {
  const enabled = features.value?.enabled;
  if (!enabled || !(key in enabled)) return true;
  return enabled[key];
}

export const catalog = computed(() => features.value?.catalog || []);

function defByKey(key) {
  return catalog.value.find((def) => def.key === key);
}

// tiles — плитки модалки на главной: в сохранённом порядке и только включённые.
export const tiles = computed(() => {
  const order = features.value?.order;
  const defs = catalog.value.filter((def) => def.tile);
  if (!order?.length) return defs.filter((def) => isOn(def.key));
  return order
    .map(defByKey)
    .filter((def) => def?.tile && isOn(def.key));
});

// tabs — разделы в нижнем меню телефона, кроме «Главной» и «Ещё».
export const tabs = computed(() => {
  const keys = features.value?.tabs;
  if (!keys) return [];
  return keys.map(defByKey).filter((def) => def && isOn(def.key));
});

// moreModules — всё остальное включённое, что открывается по пути: лист «Ещё».
export const moreModules = computed(() => {
  const inTabs = new Set(tabs.value.map((def) => def.key));
  return catalog.value.filter(
    (def) => def.route && !inTabs.has(def.key) && isOn(def.key),
  );
});

// routeAllowed — пускать ли на путь. Выключенный раздел закрыт целиком,
// вместе со своими мобильными раскладками и вложенными страницами.
export function routeAllowed(path) {
  const enabled = features.value?.enabled;
  if (!enabled) return true;
  for (const def of catalog.value) {
    if (isOn(def.key)) continue;
    for (const route of def.routes || []) {
      if (path === route || path.startsWith(`${route}/`)) return false;
    }
  }
  return true;
}
