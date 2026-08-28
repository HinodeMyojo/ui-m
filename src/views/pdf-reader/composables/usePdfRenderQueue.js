// Очередь отрисовки страниц.
//
// Вокруг экрана живёт окно из четырёх-шести страниц, и без очереди все они
// начинали рисоваться разом. Отрисовка pdf.js — работа для одного потока, так
// что пять параллельных запросов не ускоряют ничего: они просто делят время
// поровну, и та страница, на которую человек смотрит, появляется впятеро позже,
// чем могла бы. Замер на эмуляции айфона: 2,8 с против 0,8 с у той же страницы,
// нарисованной в одиночку.
//
// Поэтому рисуем строго по одной и каждый раз выбираем ту, что ближе к центру
// экрана. Приоритет считается в момент выбора, а не в момент постановки: пока
// очередь разбирается, человек мог пролистнуть, и ближайшей стала другая
// страница.

const pending = new Map(); // key -> { distance, job }
let running = false;
let paused = false;

/**
 * @param key       номер страницы (в пределах одной читалки этого достаточно)
 * @param distance  функция, возвращающая расстояние до центра экрана в пикселях
 * @param job       собственно отрисовка, async
 */
export function scheduleRender(key, distance, job) {
  pending.set(key, { distance, job });
  pump();
}

export function cancelRender(key) {
  pending.delete(key);
}

// Пока лист летит под пальцем, рисовать бессмысленно: страница успеет уехать с
// экрана, а кадры прокрутки мы у неё уже отняли. Отрисовку возобновляем, когда
// прокрутка утихла.
export function setRenderPaused(value) {
  paused = value;
  if (!paused) pump();
}

// Сменился документ — всё, что стояло в очереди, уже не про него.
export function resetRenderQueue() {
  pending.clear();
  paused = false;
}

function pickNext() {
  let bestKey = null;
  let best = Infinity;
  for (const [key, entry] of pending) {
    let d;
    try {
      d = entry.distance();
    } catch {
      d = Number.MAX_SAFE_INTEGER;
    }
    if (d < best) {
      best = d;
      bestKey = key;
    }
  }
  return bestKey;
}

async function pump() {
  if (running || paused) return;
  running = true;
  try {
    for (;;) {
      if (paused) break;
      const key = pickNext();
      if (key === null) break;
      const { job } = pending.get(key);
      pending.delete(key);
      try {
        await job();
      } catch {
        // Страница сама разберётся со своей ошибкой — очередь идёт дальше.
      }
    }
  } finally {
    running = false;
  }
}
