export const CALENDAR_CONFIG = {
  TASK_HEIGHT: 75,
  TASK_MARGIN: 24,
  TASK_TOTAL_HEIGHT: 99,
  TASKS_TOP_OFFSET: 50,
  MAX_TASK_WIDTH_PERC: 1,
  MIN_TASK_WIDTH: 120,
} as const;

export const DEFAULT_TASK_COLOR = "#25636A";
export const CONFETTI_DELAY_MS = 200;
export const CONFETTI_COLORS = [
  "#ffec3d",
  "#ff85c0",
  "#5cdbd3",
  "#ffd666",
  "#69c0ff",
  "#b37feb",
  "#ff7875",
  "#95de64",
  "#fffbe6",
  "#ffadd2",
  "#bae7ff",
  "#ffd6e7",
];

export const CONFETTI_PRESETS = [
  {
    particleCount: 90,
    spread: 80,
    startVelocity: 38,
    origin: { y: 0.35 },
    scalar: 1.1,
    gravity: 0.85,
    ticks: 180,
  },
  {
    particleCount: 60,
    angle: 120,
    spread: 100,
    startVelocity: 32,
    origin: { x: 0.2, y: 0.45 },
    scalar: 0.9,
    gravity: 0.95,
    ticks: 140,
  },
  {
    particleCount: 60,
    angle: 60,
    spread: 100,
    startVelocity: 32,
    origin: { x: 0.8, y: 0.45 },
    scalar: 0.9,
    gravity: 0.95,
    ticks: 140,
  },
] as const;
