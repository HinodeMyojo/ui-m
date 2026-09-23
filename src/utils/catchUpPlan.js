// Песочница «как догнать график» — прикидка, а не план.
//
// Сама ничего не меняет: человек выбирает материалы, ставит срок и смотрит,
// сколько выходит страниц в день и что станет с отставанием. Понравившуюся
// прикидку можно сохранить планом чтения (RoadmapCatchUp.vue, utils/readingPlan.js).
// Отставание считается ровно так же, как его показывают полоса статуса и
// виджеты (roadmap_calc.go): прогресс квартала — среднее по пунктам первого
// эшелона, отставание — сколько времени квартала прошло минус сделанная доля.

import { pagesPerHour, minutesFor } from "./readingGoal.js";

function dayCount(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to - from) / 86400000) + 1;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function todayIso() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function addDays(iso, days) {
  const base = new Date(`${iso}T00:00:00`);
  base.setDate(base.getDate() + days);
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${base.getFullYear()}-${m}-${d}`;
}

// Доля квартала, которая пройдёт к выбранной дате. К этой отметке и надо
// подтянуть прогресс, чтобы сравняться с графиком.
export function timeProgressAt(quarter, dateIso) {
  const length = dayCount(quarter?.startDate, quarter?.endDate);
  if (!length) return 0;
  const passed = dayCount(quarter.startDate, dateIso);
  return clamp01(passed / length);
}

// Материалы, которые вообще можно поставить в песочницу: незакрытые, с
// известным объёмом в страницах.
export function catchUpCandidates(quarter) {
  return (quarter?.items || [])
    .filter(
      (item) =>
        item.status !== "done" &&
        item.status !== "skipped" &&
        (item.progressTotal || 0) > (item.progressCurrent || 0),
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      emoji: item.emoji,
      tier: item.tier,
      unit: item.progressUnit || "стр.",
      current: item.progressCurrent || 0,
      total: item.progressTotal || 0,
      remaining: (item.progressTotal || 0) - (item.progressCurrent || 0),
      // В процент квартала идут только пункты первого эшелона: остальные
      // читать не вредно, но график они не двигают.
      counts: item.tier === 1,
    }));
}

function coreCountOf(quarter) {
  return (quarter?.items || []).filter((i) => i.tier === 1).length || 1;
}

// Прибавка к прогрессу квартала от прочитанных страниц одного материала.
function quarterGain(candidate, pages, coreCount) {
  if (!candidate.counts || !candidate.total) return 0;
  const before = clamp01(candidate.current / candidate.total);
  const after = clamp01((candidate.current + pages) / candidate.total);
  return (after - before) / coreCount;
}

// Основной расчёт. plan — { [itemId]: страниц }, targetDate — к какому числу
// хотим сравняться с графиком.
export function catchUpResult({ quarter, candidates, plan, targetDate, from = todayIso(), rate }) {
  const coreCount = coreCountOf(quarter);
  const days = Math.max(1, dayCount(from, targetDate));
  const progressNow = quarter?.progress || 0;
  const targetShare = timeProgressAt(quarter, targetDate);

  const rows = [];
  let pagesTotal = 0;
  let gain = 0;
  for (const candidate of candidates) {
    const pages = Math.max(0, Math.min(candidate.remaining, Number(plan[candidate.id]) || 0));
    if (!pages) continue;
    const itemGain = quarterGain(candidate, pages, coreCount);
    pagesTotal += pages;
    gain += itemGain;
    rows.push({
      ...candidate,
      pages,
      perDay: Math.ceil(pages / days),
      finishes: candidate.current + pages >= candidate.total,
      gain: itemGain,
    });
  }

  const progressAfter = clamp01(progressNow + gain);
  const behindNow = quarter?.behind || 0;
  const behindAfter = targetShare - progressAfter;
  // Сколько прогресса квартала не хватает до графика на выбранную дату.
  const shortfall = Math.max(0, targetShare - progressAfter);

  const perDay = Math.ceil(pagesTotal / days);
  const minutes = rate ? minutesFor(perDay, rate) : 0;

  return {
    days,
    rows,
    pagesTotal,
    perDay,
    minutesPerDay: minutes,
    progressNow,
    progressAfter,
    targetShare,
    behindNow,
    behindAfter,
    onSchedule: behindAfter <= 0.02,
    shortfall,
  };
}

// «Разложи сам»: распределить недостающий прогресс по выбранным материалам
// пропорционально их остатку. Отдаёт страницы по материалам; если даже дочитав
// всё выбранное график не догнать, вернёт остаток нераспределённым.
export function distributeToCatchUp({ quarter, candidates, selected, targetDate, from = todayIso() }) {
  const coreCount = coreCountOf(quarter);
  const chosen = candidates.filter((c) => selected.includes(c.id) && c.counts);
  const targetShare = timeProgressAt(quarter, targetDate);
  let need = Math.max(0, targetShare - (quarter?.progress || 0));

  const plan = {};
  for (const c of candidates) {
    if (selected.includes(c.id)) plan[c.id] = 0;
  }
  if (!chosen.length || need <= 0) return { plan, need, days: Math.max(1, dayCount(from, targetDate)) };

  // Вклад страницы разный у толстой и тонкой книги, поэтому делим не страницы,
  // а сам недостающий прогресс — поровну по способности каждого материала.
  const capacity = chosen.map((c) => ({
    c,
    max: quarterGain(c, c.remaining, coreCount),
  }));
  const totalCapacity = capacity.reduce((sum, x) => sum + x.max, 0);
  if (totalCapacity <= 0) return { plan, need, days: Math.max(1, dayCount(from, targetDate)) };

  const share = Math.min(1, need / totalCapacity);
  let covered = 0;
  for (const { c, max } of capacity) {
    const wanted = max * share;
    const pages = Math.min(c.remaining, Math.ceil((wanted * coreCount) * c.total));
    plan[c.id] = pages;
    covered += quarterGain(c, pages, coreCount);
  }
  need = Math.max(0, need - covered);
  return { plan, need, days: Math.max(1, dayCount(from, targetDate)) };
}

export { pagesPerHour };
