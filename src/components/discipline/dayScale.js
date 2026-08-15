// Как красится день дисциплины — виджет, полная страница и матрица должны
// показывать одно и то же, поэтому цвета и шкала живут здесь.
// Статусы дня считает бэк: docs/discipline-module.md

export const STATUS_COLORS = {
  pre: "#3a3d47",
  future: "#2a2d38",
  pending: "#5b616e",
  fail: "#e5484d",
  rest: "#4aa8ff",
  min: "#ffd666",
  mid: "#63c94f",
  max: "#8b5cf6",
};

export const STATUS_LABELS = {
  pre: "вне учёта",
  future: "впереди",
  pending: "в процессе",
  fail: "провал",
  rest: "отдых",
  min: "минимум",
  mid: "средний",
  max: "макс",
};

// Доля сделанного за день: считаем все обязательные шаги — и минимумы, и средние.
export function dayProgress(day) {
  const total = (day.minTotal || 0) + (day.midTotal || 0);
  if (!total) return 0;
  return Math.min(1, ((day.minDone || 0) + (day.midDone || 0)) / total);
}

// Шкала от красного к зелёному.
const PROGRESS_STOPS = [
  [0, [229, 72, 77]],
  [0.35, [242, 145, 61]],
  [0.7, [255, 214, 102]],
  [1, [99, 201, 79]],
];

export function progressColor(p) {
  let i = 0;
  while (i < PROGRESS_STOPS.length - 2 && p > PROGRESS_STOPS[i + 1][0]) i++;
  const [from, a] = PROGRESS_STOPS[i];
  const [to, b] = PROGRESS_STOPS[i + 1];
  const k = to === from ? 0 : (p - from) / (to - from);
  return `rgb(${a.map((v, n) => Math.round(v + (b[n] - v) * k)).join(",")})`;
}

// Незакрытый день — не плашка, а шкала: снизу залито ровно настолько, насколько
// день сделан. Полностью красным остаётся только день, в котором не сделано
// ничего — иначе месяц мелких шагов выглядит сплошной стеной провалов.
// Закрытые дни одноцветные: там уровень важнее процента.
export function dayCellStyle(day) {
  const base = STATUS_COLORS[day.status] || STATUS_COLORS.future;
  if (day.status !== "fail" && day.status !== "pending") return { background: base };
  const p = dayProgress(day);
  if (p <= 0) return { background: base };
  const edge = `${Math.round(p * 100)}%`;
  const empty = day.status === "fail" ? "#4a2b30" : "#3a3d47";
  return {
    background: `linear-gradient(to top, ${progressColor(p)} ${edge}, ${empty} ${edge})`,
  };
}

export function dayCellTitle(day) {
  const parts = [`${day.day}: ${STATUS_LABELS[day.status] || "…"}`];
  const total = (day.minTotal || 0) + (day.midTotal || 0);
  if (total) parts.push(`сделано ${(day.minDone || 0) + (day.midDone || 0)} из ${total}`);
  if (day.note) parts.push(day.note);
  return parts.join(" — ");
}
