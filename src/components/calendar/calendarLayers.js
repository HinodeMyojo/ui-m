// Слои календаря: подписи и цвета. Ключи — те же, что на сервере
// (entities.CalendarCategories), их не переименовывать.

export const LAYERS = [
  { key: "university", title: "Учёба", emoji: "🎓", color: "#8b5cf6" },
  { key: "work", title: "Работа", emoji: "💼", color: "#0ea5e9" },
  { key: "personal", title: "Личное", emoji: "🙂", color: "#22c55e" },
  { key: "sport", title: "Спорт", emoji: "🏋️", color: "#f97316" },
  { key: "travel", title: "Путешествия", emoji: "✈️", color: "#eab308" },
  { key: "google", title: "Из Google", emoji: "📆", color: "#64748b" },
];

export const layerOf = (key) => LAYERS.find((l) => l.key === key) || LAYERS[2];

// Палитра своего цвета события — чтобы не лезть в пипетку ради «покрасить».
export const PALETTE = ["#8b5cf6", "#6e4aff", "#0ea5e9", "#14b8a6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899", "#64748b"];

export const eventColor = (ev) => ev.color || layerOf(ev.category).color;

// Зона браузера — в ней человек видит и вводит время.
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";

const pad = (n) => String(n).padStart(2, "0");

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Логическое «сегодня»: сутки начинаются в 03:00, как в «Сегодня».
export function logicalToday() {
  return ymd(new Date(Date.now() - 3 * 60 * 60 * 1000));
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + days));
}

// Дата YYYY-MM-DD → локальная полночь (new Date("2026-11-24") дал бы UTC).
export function parseDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatRange(ev) {
  if (ev.allDay) {
    const start = parseDay(ev.start);
    const last = parseDay(addDays(ev.end, -1));
    const fmt = (d) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    return ymd(start) === ymd(last) ? "весь день" : `${fmt(start)} — ${fmt(last)}`;
  }
  return `${hm(new Date(ev.start))}–${hm(new Date(ev.end))}`;
}

export function minutesLabel(min) {
  if (min < 1) return "сейчас";
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d} д ${h % 24} ч`;
  }
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
