// Цель на сессию чтения — docs/pdf-library.md (back-m).
//
// Это намерение, а не план: «сейчас хочу прочесть 50 страниц». Нигде не
// сохраняется и умирает вместе со вкладкой (composables/useReadingGoal.js).
// Здесь — только счёт: сколько это по времени при личном темпе и что цель
// сделает с графиком roadmap'а.

// Оценка по умолчанию — полторы минуты на страницу, ровно та же, по которой
// читалка показывает время книги (usePdfProgress.js).
export const DEFAULT_PAGES_PER_HOUR = 40;

// Темп меньше трёх и больше трёхсот страниц в час — не темп, а битая запись:
// прыжок в конец книги через оглавление или секунды, натикавшие впустую.
const MIN_RATE = 3;
const MAX_RATE = 300;
// Четверть часа и десяток страниц — минимум, на котором среднее что-то значит.
const MIN_HOURS = 0.25;
const MIN_PAGES = 10;

export const RATE_SOURCES = {
  book: "по этой книге",
  library: "по всей библиотеке",
  default: "оценка по умолчанию",
};

// Сколько страниц реально прочитано: считаем по maxPage — докуда дочитали.
function pagesReadOf(file) {
  return Math.max(0, (file?.maxPage || file?.currentPage || 0) - 1);
}

function rateOf(pages, hours) {
  if (!(hours >= MIN_HOURS) || pages < MIN_PAGES) return 0;
  const rate = pages / hours;
  return rate >= MIN_RATE && rate <= MAX_RATE ? rate : 0;
}

// Личный темп в страницах в час. Своя история книги точнее общей: справочник
// и роман читаются с разной скоростью. Нет истории — берём библиотеку целиком,
// нет и её — полторы минуты на страницу.
export function pagesPerHour(file, library = []) {
  const own = rateOf(pagesReadOf(file), file?.hoursRead || 0);
  if (own) return { value: own, source: "book" };

  let pages = 0;
  let hours = 0;
  for (const f of library || []) {
    pages += pagesReadOf(f);
    hours += f?.hoursRead || 0;
  }
  const shared = rateOf(pages, hours);
  if (shared) return { value: shared, source: "library" };

  return { value: DEFAULT_PAGES_PER_HOUR, source: "default" };
}

export function minutesFor(pages, rate) {
  if (!pages || !rate) return 0;
  return Math.max(1, Math.round((pages / rate) * 60));
}

export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  if (total < 60) return `${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

// --- Влияние на roadmap ---

function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to - from) / 86400000) + 1;
}

// Длина квартала в днях — по ней отставание в долях переводится в дни:
// «отстаёшь на 12%» само по себе не говорит ничего.
export function quarterLengthDays(quarter) {
  return daysBetween(quarter?.startDate, quarter?.endDate);
}

// Пункт плана вместе с кварталом, в котором он лежит (null — бэклог).
export function findRoadmapItem(full, itemId) {
  if (!full || !itemId) return null;
  for (const quarter of full.quarters || []) {
    const item = (quarter.items || []).find((i) => i.id === itemId);
    if (item) return { item, quarter };
  }
  const item = (full.backlog || []).find((i) => i.id === itemId);
  return item ? { item, quarter: null } : null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// Что цель даст плану обучения.
//
// Прогресс квартала — среднее по пунктам Э1 (roadmap_calc.go), поэтому доля
// пункта делится на число таких пунктов. Э2/Э3 в процент квартала не входят
// вовсе: для них честнее сказать это прямо, чем рисовать несуществующий сдвиг.
//
// behind — сколько времени квартала прошло минус сделанная доля: больше нуля
// значит отстаём. Ту же величину показывают полоса статуса и виджеты.
export function goalImpact({ full, itemId, pages, fromPage, pageCount }) {
  const found = findRoadmapItem(full, itemId);
  if (!found || !pages) return null;
  const { item, quarter } = found;

  const total = item.progressTotal || pageCount || 0;
  // Читалка двигает пункт только вперёд (roadmap_pdf.go), поэтому старт —
  // максимум из отметки в плане и страницы, с которой садимся читать.
  const from = Math.max(item.progressCurrent || 0, fromPage || 0);
  const to = total ? Math.min(total, from + pages) : from + pages;
  const counted = Math.max(0, to - from);

  const itemNow = total ? clamp01(from / total) : item.progress || 0;
  const itemAfter = total ? clamp01(to / total) : item.progress || 0;

  const result = {
    itemTitle: item.title,
    tier: item.tier,
    counted,
    pagesLost: pages - counted, // цель упёрлась в конец книги
    itemNow,
    itemAfter,
    quarterNumber: quarter?.number || 0,
    quarterTitle: quarter?.title || "",
    inQuarter: !!quarter,
    isCore: item.tier === 1,
    isCurrentQuarter: !!quarter?.isCurrent,
    quarterStarted: !!quarter && (quarter.timeProgress || 0) > 0,
    quarterDelta: 0,
    behindNow: quarter?.behind || 0,
    behindAfter: quarter?.behind || 0,
    daysNow: 0,
    daysAfter: 0,
  };

  if (!quarter || item.tier !== 1) return result;

  const coreCount = (quarter.items || []).filter((i) => i.tier === 1).length || 1;
  result.quarterDelta = (itemAfter - itemNow) / coreCount;
  result.behindAfter = result.behindNow - result.quarterDelta;

  const length = daysBetween(quarter.startDate, quarter.endDate);
  if (length > 0) {
    result.daysNow = result.behindNow * length;
    result.daysAfter = result.behindAfter * length;
  }
  return result;
}

// Словами: «отстаёшь на 12%» / «опережаешь на 4%» / «идёшь по плану».
// Порог в 2% — шум округления, а не отставание (RoadmapStatusBar.vue).
export function behindWords(behind) {
  const pct = Math.round((behind || 0) * 100);
  if (pct > 2) return { text: `отстаёшь на ${pct}%`, tone: "late" };
  if (pct < -2) return { text: `опережаешь на ${-pct}%`, tone: "ahead" };
  return { text: "идёшь по плану", tone: "ok" };
}

export function formatDays(days) {
  const value = Math.abs(days || 0);
  if (value < 1) return "";
  const whole = Math.round(value);
  const last = whole % 10;
  const tens = whole % 100;
  if (tens >= 11 && tens <= 14) return `${whole} дней`;
  if (last === 1) return `${whole} день`;
  if (last >= 2 && last <= 4) return `${whole} дня`;
  return `${whole} дней`;
}

// --- Готовые строки ---
//
// Одни и те же три строки показывают карточка книги и читалка. Держим их здесь,
// чтобы «≈ 1 ч 26 мин» в двух местах не разъезжались.

export function goalTimeLine(file, library, pages) {
  if (!pages) return "";
  const rate = pagesPerHour(file, library);
  const minutes = minutesFor(pages, rate.value);
  return `≈ ${formatDuration(minutes)} · темп ${Math.round(rate.value)} стр/ч (${RATE_SOURCES[rate.source]})`;
}

export function goalBookLine(file, pages, fromPage) {
  const total = file?.pageCount || 0;
  if (!total || !pages) return "";
  const start = Math.max(1, fromPage || 1);
  const target = Math.min(total, start + pages);
  if (target >= total) {
    const extra = start + pages - total;
    return extra
      ? `дочитаете книгу до конца — в цели лишние ${extra} стр.`
      : "дочитаете книгу до конца";
  }
  return `дочитаете до ${target}-й страницы — ${Math.round((target / total) * 100)}% книги`;
}

// Как дела в плане до всякой цели: от этой цифры и выбирают, сколько читать.
export function goalPlanStatus(full, itemId) {
  const quarter = findRoadmapItem(full, itemId)?.quarter;
  if (!quarter || !(quarter.timeProgress > 0)) return "";
  const now = behindWords(quarter.behind);
  const days = formatDays((quarter.behind || 0) * quarterLengthDays(quarter));
  return `🗺️ Q${quarter.number}: ${now.text}${days ? ` (≈ ${days} квартала)` : ""}`;
}

// Что цель сделает с графиком. Отставание показываем и в процентах, и в днях
// квартала: «отстаёшь на 12%» ничего не говорит о том, сколько это в жизни.
export function goalPlanLine({ full, itemId, pages, fromPage, pageCount }) {
  const data = goalImpact({ full, itemId, pages, fromPage, pageCount });
  if (!data) return null;
  const quarter = `Q${data.quarterNumber}`;
  const asPct = (value) => `${Math.round(value * 100)}%`;

  if (!data.inQuarter) {
    return {
      text: `🗺️ Пункт в бэклоге — на график квартала не влияет. Прогресс книги в плане: ${asPct(data.itemNow)} → ${asPct(data.itemAfter)}`,
      tone: "",
    };
  }
  if (!data.isCore) {
    return {
      text: `🗺️ ${quarter}: пункт не первого эшелона, в процент квартала не идёт. Прогресс книги в плане: ${asPct(data.itemNow)} → ${asPct(data.itemAfter)}`,
      tone: "",
    };
  }
  const delta = Math.round(data.quarterDelta * 100);
  if (!data.quarterStarted) {
    return { text: `🗺️ ${quarter} ещё не начался — цель уйдёт в задел: +${delta}% к прогрессу квартала`, tone: "ahead" };
  }
  const now = behindWords(data.behindNow);
  if (!delta) {
    return { text: `🗺️ ${quarter}: ${now.text}, но график цель сдвинет меньше чем на процент`, tone: now.tone };
  }
  const after = behindWords(data.behindAfter);
  const daysNow = formatDays(data.daysNow);
  const daysAfter = formatDays(data.daysAfter);
  const nowText = daysNow ? `${now.text} (≈ ${daysNow} квартала)` : now.text;
  const afterText =
    after.tone === "ok"
      ? "выйдешь в график"
      : daysAfter
        ? `${after.text} (≈ ${daysAfter})`
        : after.text;
  return { text: `🗺️ ${quarter}: сейчас ${nowText} → ${afterText}`, tone: after.tone };
}
