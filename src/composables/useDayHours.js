import { ref, onMounted, onBeforeUnmount } from "vue";
import { fetchDayHours, saveDayHours, disciplineLogicalToday } from "@/components/api.js";

// План дня по часам: сколько работать, сколько из этого писать код руками и
// сколько читать. Задаётся на главной — и на десктопе, и на телефоне, — а
// хранится в дне «Сегодня»: «работать» там же и есть «ёмкость дня», поэтому
// число одно на оба экрана.
//
// День логический (сутки начинаются в 03:00, как у дисциплины и «Сегодня»):
// план, вбитый в половине второго ночи, относится ко вчерашнему дню.

export const HOURS_FIELDS = [
  { key: "capacityHours", label: "Работать", icon: "💼" },
  { key: "codeHours", label: "Код руками", icon: "⌨️" },
  { key: "readHours", label: "Читать", icon: "📖" },
];

export const HOURS_STEP = 0.5;
export const HOURS_MAX = 24;

export function formatHoursValue(value) {
  return String(value || 0).replace(".", ",");
}

export function useDayHours() {
  const date = ref(disciplineLogicalToday());
  const hours = ref({ capacityHours: 0, codeHours: 0, readHours: 0 });
  const loading = ref(true);
  const failed = ref(false);
  const saving = ref(false);
  const error = ref("");

  let saveTimer = null;

  async function load() {
    date.value = disciplineLogicalToday();
    loading.value = true;
    failed.value = false;
    try {
      const data = await fetchDayHours(date.value);
      hours.value = {
        capacityHours: data.capacityHours || 0,
        codeHours: data.codeHours || 0,
        readHours: data.readHours || 0,
      };
    } catch (e) {
      failed.value = true;
    } finally {
      loading.value = false;
    }
  }

  // Шаг в полчаса: точнее планировать день бессмысленно, а крупнее — уже
  // не помещается «полчаса почитать перед сном».
  function normalize(value) {
    const n = Number(String(value).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(HOURS_MAX, Math.round(n / HOURS_STEP) * HOURS_STEP);
  }

  function set(key, value) {
    hours.value = { ...hours.value, [key]: normalize(value) };
    scheduleSave();
  }

  function step(key, direction) {
    set(key, (hours.value[key] || 0) + direction * HOURS_STEP);
  }

  // Кнопки ±0,5 жмут подряд, поэтому сохраняем не каждое нажатие, а итог.
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 600);
  }

  async function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    saving.value = true;
    error.value = "";
    try {
      await saveDayHours({ date: date.value, ...hours.value });
    } catch (e) {
      error.value = e.message || "не сохранилось";
    } finally {
      saving.value = false;
    }
  }

  // Вкладку оставили открытой на ночь — утром в ней должен быть новый день,
  // а не вчерашний план.
  function onVisible() {
    if (document.visibilityState !== "visible" || saveTimer) return;
    if (disciplineLogicalToday() !== date.value) load();
  }

  onMounted(() => {
    load();
    document.addEventListener("visibilitychange", onVisible);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", onVisible);
    // Ушли со страницы, не дождавшись паузы, — последнее нажатие не теряем.
    if (saveTimer) flush();
  });

  return { date, hours, loading, failed, saving, error, load, set, step };
}
