// «Я» и «Развитие» — общее состояние: доска ветки, открытая панель «Я»,
// выбранный уровень. Панель героя на главной, полоса уровней над задачами,
// дисциплина и сама панель «Я» смотрят в одно место, поэтому стор модульный,
// а не в каждом компоненте свой. docs/me-module.md (back-m)

import { computed, ref } from "vue";
import { fetchGrowthBoard } from "@/components/growthApi.js";

export const growth = ref(null);
// Месяц дисциплины, который грузит панель героя: из него костёр и стрик.
export const disciplineMonth = ref(null);
export const growthError = ref("");
const loading = ref(false);

// Панель «Я»: открыта ли, какой уровень смотрим, какая вкладка.
export const meOpen = ref(false);
export const meTab = ref("tree");
export const selectedLevelId = ref(null);

export async function loadGrowth() {
  if (loading.value) return;
  loading.value = true;
  try {
    growth.value = await fetchGrowthBoard();
    growthError.value = "";
  } catch (e) {
    growthError.value = e.message || "не удалось загрузить развитие";
  } finally {
    loading.value = false;
  }
}

// growthAct — правка с ответом-доской: доска подменяется целиком.
export async function growthAct(call) {
  try {
    const board = await call();
    if (board) growth.value = board;
    growthError.value = "";
    return true;
  } catch (e) {
    growthError.value = e.message || "не получилось";
    return false;
  }
}

export function openMe(levelId = null, tab = "tree") {
  selectedLevelId.value = levelId;
  meTab.value = tab;
  meOpen.value = true;
}

export function closeMe() {
  meOpen.value = false;
}

export const levelsById = computed(() => {
  const map = new Map();
  for (const l of growth.value?.levels || []) map.set(l.id, l);
  return map;
});

export const skillsById = computed(() => {
  const map = new Map();
  for (const s of growth.value?.skills || []) map.set(s.id, s);
  return map;
});

export const spheresById = computed(() => {
  const map = new Map();
  for (const s of growth.value?.spheres || []) map.set(s.id, s);
  return map;
});

// Взятые в этом месяце уровни, в порядке выбора.
export const pickedLevels = computed(() =>
  (growth.value?.month?.levelIds || []).map((id) => levelsById.value.get(id)).filter(Boolean),
);

export function levelColor(level) {
  const skill = skillsById.value.get(level?.skillId);
  return spheresById.value.get(skill?.sphereId)?.color || "#6e4aff";
}

// Свистки «Созданного в Бездне»: от колокольчика до белого.
export const WHISTLES = {
  bell: { title: "Колокольчик", color: "#c9a96e" },
  red: { title: "Красный свисток", color: "#e5484d" },
  blue: { title: "Синий свисток", color: "#4aa8ff" },
  moon: { title: "Лунный свисток", color: "#c7b8ff" },
  black: { title: "Чёрный свисток", color: "#3a3a46" },
  white: { title: "Белый свисток", color: "#f2f2f2" },
};

export const STATUS_TITLES = {
  done: "пройден",
  active: "взят в этом месяце",
  paused: "на паузе",
  ready: "готов",
  empty: "надо наполнить",
  maintain: "поддержка",
};

export const MONTH_NAMES = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
export const MONTH_NAMES_IN = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
];
