import { ref, watch } from "vue";

// Осенний слой — отдельная часть приложения: страницы о нём ничего не знают,
// его подключает App.vue поверх всего. Состояние живёт здесь, а не в компоненте,
// чтобы кнопка-переключатель и сам слой не гоняли пропсы через всё дерево.

const KEY = "autumnVibeLevel";

// 0 — выключено, 1 — спокойный листопад, 2 — ветреный день.
const raw = localStorage.getItem(KEY);
const parsed = raw === null ? 1 : Number(raw);
export const autumnLevel = ref([0, 1, 2].includes(parsed) ? parsed : 1);

watch(autumnLevel, (value) => {
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // Приватный режим Safari бросается на запись — вайб от этого не должен падать.
  }
});

export function cycleAutumn() {
  autumnLevel.value = (autumnLevel.value + 1) % 3;
}

export const AUTUMN_LABELS = [
  "Осень выключена — включить листопад",
  "Спокойный листопад — добавить ветра",
  "Ветреный день — выключить",
];

// Одна палитра на листья, конфетти и акценты: осень должна быть узнаваемо
// одного цвета во всех местах, где мы её рисуем.
export const AUTUMN_COLORS = [
  "#c1440e",
  "#e07b39",
  "#d9a441",
  "#a8461c",
  "#8c5a2b",
  "#e8b04b",
  "#b5651d",
  "#7a3b12",
];
