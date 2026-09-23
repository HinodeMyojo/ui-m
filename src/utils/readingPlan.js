// План чтения — сохранённая прикидка песочницы (back-m: roadmap_reading_plan.go).
//
// Сервер уже посчитал всё: сколько прочитано с начала плана, докуда надо дойти
// сегодня, сколько в день выходит на остаток. Здесь — только слова, одни и те
// же для страницы roadmap'а, карточки книги и читалки.

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function planDate(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]}`;
}

function plural(n, one, few, many) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function daysWord(n) {
  return `${n} ${plural(n, "день", "дня", "дней")}`;
}

// Статус плана словами и тоном для подсветки.
export function planStatusWords(plan) {
  if (!plan) return { text: "", tone: "" };
  const behind = plan.pagesBehind || 0;
  switch (plan.status) {
    case "done":
      return { text: "✅ план выполнен", tone: "ahead" };
    case "overdue":
      return { text: `⌛ срок прошёл, не дочитано ${plan.pagesLeft} стр.`, tone: "late" };
    case "behind":
      return { text: `отстаёшь от плана на ${behind} стр.`, tone: "late" };
    case "ahead":
      return { text: `впереди плана на ${-behind} стр.`, tone: "ahead" };
    default:
      return { text: "идёшь по плану", tone: "ok" };
  }
}

// Строка плана по пункту roadmap'а; null — книга в план не входит.
export function planRowForItem(plan, itemId) {
  if (!plan || !itemId) return null;
  return (plan.items || []).find((row) => row.itemId === itemId) || null;
}

// Что делать с книгой сегодня — одной строкой.
export function planTodayLine(plan, row) {
  if (!plan || !row) return "";
  if (row.finished) return `✅ Цель плана — стр. ${row.targetPage} — достигнута`;
  if (plan.status === "overdue") {
    return `⌛ Срок ${planDate(plan.targetDate)} прошёл: до стр. ${row.targetPage} осталось ${row.pagesLeft} стр.`;
  }
  if (row.todayLeft > 0) {
    return `Сегодня по плану — до стр. ${row.expectedPage}: ещё ${row.todayLeft} стр.`;
  }
  return `На сегодня норма выполнена (по плану — стр. ${row.expectedPage})`;
}

// Итог по книге: цель, срок и темп на остаток.
export function planGoalLine(plan, row) {
  if (!plan || !row) return "";
  const base = `📌 К ${planDate(plan.targetDate)} — до стр. ${row.targetPage}`;
  if (row.finished) return `${base}: готово`;
  if (plan.status === "overdue") return `${base}: осталось ${row.pagesLeft} стр.`;
  return `${base}: осталось ${row.pagesLeft} стр. за ${daysWord(plan.daysLeft)} — ≈ ${row.perDay} стр/день`;
}
