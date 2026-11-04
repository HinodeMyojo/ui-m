// Разметка поверх страницы: fabric.js и всё, что ему пришлось объяснить.
//
// Каждый объект помечен полем kind — по нему редактор понимает, что это:
//   redact    — закраска сплошным цветом (по умолчанию чёрным);
//   whiteout  — замазка цветом бумаги, подобранным под место;
//   effect    — размытие или пикселизация куска страницы (EffectRect);
//   textcover — замазка под исправленным текстом;
//   highlight, draw, text, shape, image — обычная разметка.
// Первые четыре прячут то, что под ними. Страница с такими объектами при
// сохранении по умолчанию превращается в картинку: закрасить текст в PDF
// прямоугольником — не значит его убрать, он по-прежнему выделяется и
// копируется из-под краски.

import { FabricObject, Rect, StaticCanvas, classRegistry, util } from "fabric";

FabricObject.customProperties = ["kind", "effect", "strength"];

export const HIDING_KINDS = new Set(["redact", "whiteout", "effect", "textcover"]);

export function hidesContent(objects) {
  return objects.some((o) => HIDING_KINDS.has(o.kind));
}

const ACCENT = "#4361ee";

// Ручки покрупнее для пальца: в fabric по умолчанию 13 пикселей, а палец
// промахивается мимо них через раз.
export function styleControls(touch) {
  Object.assign(FabricObject.ownDefaults, {
    transparentCorners: false,
    cornerColor: "#fff",
    cornerStrokeColor: ACCENT,
    borderColor: ACCENT,
    cornerStyle: "circle",
    cornerSize: touch ? 16 : 10,
    touchCornerSize: 34,
    padding: 2,
    borderScaleFactor: 1.5,
  });
}

// --- Размытие и пикселизация ---
//
// Объект не хранит картинку: он каждый раз берёт кусок страницы из-под себя
// (canvas.effectSource — холст с отрисованной страницей и его масштаб). Так
// подвинутое размытие размывает новое место, а не тащит за собой старое, и при
// сохранении эффект считается заново в полном разрешении.
//
// Размытие сделано уменьшением в несколько шагов по половине и обратным
// растяжением: каждый шаг честно усредняет квадрат 2×2. ctx.filter = blur()
// было бы проще, но Safari его не умеет, а пикселизация через одно уменьшение
// не усредняет, а выдёргивает отдельные пиксели — сквозь неё буквы читаются.

function shrink(source, sx, sy, sw, sh, tw, th) {
  let cur = source;
  let cx = sx;
  let cy = sy;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.round(cw / 2));
    next.height = Math.max(1, Math.round(ch / 2));
    const ctx = next.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, cx, cy, cw, ch, 0, 0, next.width, next.height);
    cur = next;
    cx = 0;
    cy = 0;
    cw = next.width;
    ch = next.height;
  }
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(tw));
  out.height = Math.max(1, Math.round(th));
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, cx, cy, cw, ch, 0, 0, out.width, out.height);
  return out;
}

export function effectPatch(src, rect, effect, strength) {
  const s = src.scale;
  const sx = Math.max(0, Math.floor(rect.x * s));
  const sy = Math.max(0, Math.floor(rect.y * s));
  const ex = Math.min(src.canvas.width, Math.ceil((rect.x + rect.w) * s));
  const ey = Math.min(src.canvas.height, Math.ceil((rect.y + rect.h) * s));
  const sw = ex - sx;
  const sh = ey - sy;
  if (sw < 1 || sh < 1) return null;
  // strength — размер «клетки» в точках страницы, а не в пикселях холста:
  // тогда на экране и в сохранённом файле размыто одинаково. Клетка меньше
  // половины кегля оставляет цифры угадываемыми — проверено на номере паспорта.
  const cell = Math.max(1, strength * s);
  const small = shrink(src.canvas, sx, sy, sw, sh, Math.max(1, sw / cell), Math.max(1, sh / cell));
  return {
    canvas: small,
    x: sx / s,
    y: sy / s,
    w: sw / s,
    h: sh / s,
  };
}

const EFFECT_DEFAULTS = {
  // Кэш fabric рисует объект один раз и дальше двигает готовую картинку —
  // размытие тащило бы за собой старое место.
  objectCaching: false,
  lockRotation: true,
  lockScalingFlip: true,
  strokeWidth: 0,
  fill: "rgba(0,0,0,0)",
};

export class EffectRect extends Rect {
  static type = "EffectRect";

  constructor(options = {}) {
    super({ ...EFFECT_DEFAULTS, ...options });
    this.setControlsVisibility({ mtr: false });
    this._patchKey = "";
    this._patch = null;
  }

  // Где объект на странице прямо сейчас. Не getCoords(): те пересчитываются
  // только в конце перетаскивания, а размытие должно ехать вместе с пальцем,
  // в том числе внутри выделения из нескольких объектов.
  sceneRect() {
    const m = this.calcTransformMatrix();
    const w = this.width / 2;
    const h = this.height / 2;
    const pts = [
      [-w, -h],
      [w, -h],
      [w, h],
      [-w, h],
    ].map(([x, y]) => util.transformPoint({ x, y }, m));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  _render(ctx) {
    const w = this.width;
    const h = this.height;
    const src = this.canvas?.effectSource;
    if (!src) {
      ctx.fillStyle = "rgba(120,120,120,.5)";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      return;
    }
    const rect = this.sceneRect();
    const key = `${src.id}|${rect.x.toFixed(2)}|${rect.y.toFixed(2)}|${rect.w.toFixed(2)}|${rect.h.toFixed(2)}|${this.effect}|${this.strength}`;
    if (key !== this._patchKey) {
      this._patch = effectPatch(src, rect, this.effect, this.strength);
      this._patchKey = key;
    }
    const patch = this._patch;
    if (!patch) return;
    // Из координат страницы — в собственные координаты объекта: начало в
    // центре, масштаб объекта уже наложен на ctx.
    const kx = w / rect.w;
    const ky = h / rect.h;
    ctx.save();
    ctx.imageSmoothingEnabled = this.effect !== "pixelate";
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      patch.canvas,
      -w / 2 + (patch.x - rect.x) * kx,
      -h / 2 + (patch.y - rect.y) * ky,
      patch.w * kx,
      patch.h * ky,
    );
    ctx.restore();
    if (this.canvas?.showEffectFrames) {
      ctx.save();
      ctx.setLineDash([4 / this.scaleX, 3 / this.scaleX]);
      ctx.lineWidth = 1 / this.scaleX;
      ctx.strokeStyle = "rgba(67,97,238,.6)";
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
}

classRegistry.setClass(EffectRect);

// --- Цвета из-под объекта ---

function readPixels(src, rect, pad) {
  const s = src.scale;
  const x = Math.max(0, Math.floor((rect.x - pad) * s));
  const y = Math.max(0, Math.floor((rect.y - pad) * s));
  const ex = Math.min(src.canvas.width, Math.ceil((rect.x + rect.w + pad) * s));
  const ey = Math.min(src.canvas.height, Math.ceil((rect.y + rect.h + pad) * s));
  if (ex - x < 1 || ey - y < 1) return null;
  const data = src.canvas.getContext("2d", { willReadFrequently: true }).getImageData(x, y, ex - x, ey - y);
  return data;
}

const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// paperColor — цвет бумаги вокруг прямоугольника. Берём рамку в пару точек
// шириной и самый частый оттенок в ней: у скана бумага не белая, а белая
// замазка на сером листе видна за метр.
export function paperColor(src, rect) {
  const data = readPixels(src, rect, 2);
  if (!data) return "#ffffff";
  const { width, height } = data;
  const d = data.data;
  const ring = Math.max(1, Math.round(2 * src.scale));
  const buckets = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x < ring || y < ring || x >= width - ring || y >= height - ring;
      if (!edge) continue;
      const i = (y * width + x) * 4;
      const key = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++;
      b.r += d[i];
      b.g += d[i + 1];
      b.b += d[i + 2];
      buckets.set(key, b);
    }
  }
  let best = null;
  for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
  if (!best) return "#ffffff";
  return hex(best.r / best.n, best.g / best.n, best.b / best.n);
}

// inkColor — цвет текста внутри прямоугольника: среднее по самым тёмным
// пикселям. Исправленная строка должна быть того же цвета, что соседние.
export function inkColor(src, rect) {
  const data = readPixels(src, rect, 0);
  if (!data) return "#000000";
  const d = data.data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i] + d[i + 1] + d[i + 2], i]);
  px.sort((a, b) => a[0] - b[0]);
  // 3%, а не больше: в шире выборку попадают сглаженные края букв, и правка
  // выходила заметно бледнее соседних строк.
  const take = Math.max(1, Math.floor(px.length * 0.03));
  let r = 0;
  let g = 0;
  let b = 0;
  for (let k = 0; k < take; k++) {
    const i = px[k][1];
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  return hex(r / take, g / take, b / take);
}

// --- Отрисовка разметки вне экрана (миниатюры и сохранение) ---

// renderObjects рисует разметку страницы на отдельном холсте в нужном
// масштабе. base — холст с самой страницей в том же масштабе: он нужен
// размытию, а при flatten ещё и ложится подложкой.
export async function renderObjects(objects, W, H, scale, { base = null, flatten = false } = {}) {
  const width = Math.max(1, Math.round(W * scale));
  const height = Math.max(1, Math.round(H * scale));
  const sc = new StaticCanvas(undefined, { width, height, enableRetinaScaling: false, renderOnAddRemove: false });
  try {
    if (base) sc.effectSource = { id: `x${Math.random()}`, canvas: base, scale: base.width / W };
    const live = await util.enlivenObjects(objects);
    live.forEach((o) => sc.add(o));
    sc.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    sc.renderAll();
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    if (flatten && base) ctx.drawImage(base, 0, 0, width, height);
    ctx.drawImage(sc.getElement(), 0, 0);
    return out;
  } finally {
    sc.dispose();
  }
}

// --- Текстовый слой для сохранения ---

// searchableText — что положить невидимым текстом под картинку страницы.
// Распознанные слова, на которые легла замазка или размытие, выкидываются:
// иначе спрятанный номер находился бы обычным поиском по файлу. Дописанный
// текст, наоборот, добавляется — по нему тоже должен работать поиск.
export async function searchableText(objects, lines) {
  const live = objects.length ? await util.enlivenObjects(objects) : [];
  const hiding = live
    .filter((o) => HIDING_KINDS.has(o.kind))
    .map((o) => o.getBoundingRect());
  const covered = (w) =>
    hiding.some((r) => {
      const ix = Math.min(w.x + w.w, r.left + r.width) - Math.max(w.x, r.left);
      const iy = Math.min(w.y + w.h, r.top + r.height) - Math.max(w.y, r.top);
      // Задета хотя бы треть слова — считаем спрятанным.
      return ix > 0 && iy > 0 && ix * iy > w.w * w.h * 0.3;
    });
  const out = [];
  for (const line of lines || []) {
    const words = (line.words?.length ? line.words : [line]).filter((w) => !covered(w));
    if (words.length) out.push({ ...line, words });
  }
  for (const o of live) {
    if (o.kind !== "text" || Math.abs(o.angle || 0) > 0.5 || !o.text?.trim()) continue;
    const r = o.getBoundingRect();
    const rows = o.text.split(/\r?\n/);
    const h = r.height / rows.length;
    rows.forEach((row, i) => {
      if (row.trim()) out.push({ text: row, x: r.left, y: r.top + i * h, w: r.width, h, words: [] });
    });
  }
  return out;
}

// --- Поворот разметки вместе со страницей ---

export async function rotateObjects(objects, W, H, clockwise) {
  if (!objects.length) return objects;
  const live = await util.enlivenObjects(objects);
  const out = [];
  for (const o of live) {
    const c = o.getCenterPoint();
    const [nx, ny] = clockwise ? [H - c.y, c.x] : [c.y, W - c.x];
    if (o instanceof EffectRect) {
      // Размытие не умеет стоять под углом — у него меняются местами стороны.
      const w = o.width * o.scaleX;
      const h = o.height * o.scaleY;
      o.set({ width: h, height: w, scaleX: 1, scaleY: 1, left: nx - h / 2, top: ny - w / 2 });
    } else {
      o.rotate((o.angle || 0) + (clockwise ? 90 : -90));
      o.setPositionByOrigin({ x: nx, y: ny }, "center", "center");
    }
    o.setCoords();
    out.push(o.toObject());
  }
  return out;
}
