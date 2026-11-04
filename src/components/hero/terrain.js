import { rng, noise1, fbm1, noise2, bayer, clamp, mix, hex, mixRgb, makeCanvas, hash } from "./noise.js";

// Земля сцены: дальние горы, холмы, лес на горизонте, ближняя земля и
// декорации места (пещера, лес, горы, руины). Всё процедурное и строится
// один раз на смену места/сезона/ширины. Дальние слои зациклены по периоду,
// чтобы в пути прокручиваться без шва.

export const H = 112;
export const HORIZON = 78;
export const FLOOR = 101; // линия, на которой стоят герой и костёр
export const PERIOD = 512;

// --- Пиксельные помощники ---

function put(d, w, x, y, c, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= H) return;
  const i = (y * w + x) * 4;
  d[i] = c[0];
  d[i + 1] = c[1];
  d[i + 2] = c[2];
  d[i + 3] = a;
}

function shade(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

const P = (s) => hex(s);

// --- Сезоны ---

export const SEASONS = {
  winter: {
    grass: [P("#cfd6e2"), P("#a9b3c6"), P("#828ca4")],
    dirt: P("#4c4852"),
    crown: null,
    tuft: [P("#8a7a5a"), P("#6a5c44")],
    snow: true,
  },
  spring: {
    grass: [P("#62803c"), P("#4b6731"), P("#354a25")],
    dirt: P("#4a3d2c"),
    crown: [P("#6a9442"), P("#4b7232"), P("#2f4c22")],
    tuft: [P("#7a9a48"), P("#557636")],
    dots: [P("#d8d0e8"), P("#e6c34a"), P("#c8a0c8")],
  },
  summer: {
    grass: [P("#4d6c30"), P("#3a5426"), P("#283c1c")],
    dirt: P("#45382a"),
    crown: [P("#46733a"), P("#30562a"), P("#1f3a1c")],
    tuft: [P("#5c8038"), P("#3e5c28")],
    dots: [P("#e6c34a"), P("#d8d0e8")],
  },
  autumn: {
    grass: [P("#7c6c36"), P("#5f532a"), P("#433a1e")],
    dirt: P("#4a3826"),
    crown: [P("#cc6a22"), P("#9a4418"), P("#622a12")],
    crown2: [P("#d9a441"), P("#a87428"), P("#6a4a18")],
    tuft: [P("#9a8040"), P("#74602c")],
    dots: [P("#c1440e"), P("#e07b39"), P("#d9a441"), P("#8c5a2b")],
  },
};

const PINE = [P("#3a5046"), P("#26372f"), P("#18241f")];
const SNOW = [P("#e6ebf3"), P("#b2bdd2")];

// --- Дальние горы ---

// Хребет: «гребенчатый» шум (1 − |2n − 1|) даёт острые вершины, а не холмики.
function ridgeLine(seed, top, base, scale, sharp) {
  const per = PERIOD / scale;
  const line = new Float32Array(PERIOD);
  for (let x = 0; x < PERIOD; x++) {
    const n = fbm1(x / scale, per, seed, 4);
    const r = 1 - Math.abs(2 * fbm1(x / (scale * 0.5), per * 2, seed + 3, 3) - 1);
    const v = clamp(mix(n, r, sharp) * 1.35 - 0.2);
    line[x] = mix(base, top, v);
  }
  return line;
}

function slopeAt(line, x) {
  const n = line.length;
  const a = line[(((Math.round(x) - 2) % n) + n) % n];
  const b = line[(((Math.round(x) + 2) % n) + n) % n];
  return b - a;
}

// Скалы с освещением слева: склон, обращённый к свету, светлее; ниже гребня
// тени идут диагональными «контрфорсами», как у настоящих хребтов.
function mountainLayer(seed, opts) {
  const { top, base, scale, sharp, rock, snowline, winter, forest } = opts;
  const c = makeCanvas(PERIOD, H);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(PERIOD, H);
  const d = img.data;
  const line = ridgeLine(seed, top, base, scale, sharp);
  const [lit, mid, dark] = rock;
  const snowY = mix(top, base, winter ? snowline + 0.3 : snowline);
  for (let x = 0; x < PERIOD; x++) {
    const ty = Math.round(line[x]);
    for (let y = Math.max(0, ty); y < H; y++) {
      const depth = y - line[x];
      // Тень спускается по диагонали вниз-влево от гребня.
      const s1 = slopeAt(line, x + depth * 0.7);
      const s2 = slopeAt(line, x - depth * 0.45);
      const gully = (noise2(x / 3, y / 10, seed + 5) - 0.5) * 3;
      const th = bayer(x, y);
      const v = s1 * 0.8 + s2 * 0.4 + gully + (th - 0.5) * 1.2;
      let col = v < -0.6 ? lit : v < 1.2 ? mid : dark;
      const sn = snowY + (noise1(x / 5, PERIOD / 5, seed + 9) - 0.5) * 10 + depth * 0.15;
      if (snowline < 1 && y < sn && depth < 26) col = v < 0.6 ? SNOW[0] : SNOW[1];
      if (forest && depth > forest + noise1(x / 4, PERIOD / 4, seed + 2) * 6) {
        const f = noise2(x / 1.7, y / 1.5, seed + 11);
        if (f > 0.42) col = f > 0.7 ? PINE[2] : shade(PINE[1], 0.9);
      }
      put(d, PERIOD, x, y, col);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, line };
}

// Ель: ярусы, каждый шире предыдущего, левый край подсвечен.
function drawPine(d, w, x0, base, h, cols, snowy, seed) {
  const tiers = Math.max(2, Math.round(h / 4));
  const r = rng(seed);
  for (let y = 0; y < h; y++) {
    const tierPos = (y % Math.ceil(h / tiers)) / Math.ceil(h / tiers);
    const grow = y / h;
    const hw = Math.round(grow * h * 0.32 + tierPos * 1.6);
    const yy = base - h + y;
    for (let dx = -hw; dx <= hw; dx++) {
      let col = dx < -hw * 0.3 ? cols[0] : dx < hw * 0.5 ? cols[1] : cols[2];
      if (snowy && tierPos < 0.2 && dx < 0) col = dx < -hw * 0.4 ? SNOW[0] : SNOW[1];
      put(d, w, (((x0 + dx) % w) + w) % w, yy, col);
    }
  }
  put(d, w, ((x0 % w) + w) % w, base, cols[2]);
  if (r() < 0.2) put(d, w, ((x0 % w) + w) % w, base - h - 1, cols[1]);
}

// Лиственное дерево: круглая крона с дизерингом, свет слева сверху.
function drawCrown(d, w, x0, base, h, cols, seed) {
  const r = rng(seed);
  const trunk = Math.max(2, Math.round(h * 0.3));
  for (let y = 0; y < trunk; y++) put(d, w, (((x0) % w) + w) % w, base - y, P("#2a1e18"));
  const cy = base - trunk - h * 0.35;
  const rad = h * 0.42;
  const blobs = [[0, 0, rad]];
  for (let i = 0; i < 3; i++) blobs.push([(r() - 0.5) * rad * 1.4, (r() - 0.6) * rad, rad * mix(0.5, 0.8, r())]);
  const R = Math.ceil(rad * 1.8);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      let best = -1;
      let up = 0;
      for (const [bx, by, br] of blobs) {
        const v = 1 - Math.hypot(dx - bx, (dy - by) * 1.1) / br;
        if (v > best) {
          best = v;
          up = (-(dy - by) - (dx - bx) * 0.6) / br;
        }
      }
      const th = bayer(x0 + dx, Math.round(cy) + dy);
      if (best + th * 0.3 < 0.12) continue;
      const k = up + (th - 0.5) * 0.5;
      const col = k > 0.35 ? cols[0] : k > -0.25 ? cols[1] : cols[2];
      put(d, w, (((x0 + dx) % w) + w) % w, Math.round(cy + dy), col);
    }
  }
}

function treeLayer(seed, season, base, density = 1) {
  const c = makeCanvas(PERIOD, H);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(PERIOD, H);
  const d = img.data;
  const r = rng(seed);
  const S = SEASONS[season];
  const snowy = !!S.snow;
  // Сначала подложка — тёмная полоса подлеска, чтобы между деревьями не
  // просвечивали горы у самой земли.
  for (let x = 0; x < PERIOD; x++) {
    const t = base - 3 - Math.round(noise1(x / 6, PERIOD / 6, seed) * 4);
    for (let y = t; y < H; y++) put(d, PERIOD, x, y, snowy && y < t + 1 ? SNOW[1] : PINE[2]);
  }
  const items = [];
  for (let x = 0; x < PERIOD; x += 2 + Math.floor(r() * 4 / density)) {
    items.push({ x, h: Math.round(mix(7, 18, Math.pow(r(), 1.3))), b: base + Math.floor(r() * 3), deco: r(), s: Math.floor(r() * 1e6) });
  }
  items.sort((a, b) => a.b - b.b);
  for (const it of items) {
    const crown = S.crown && it.deco < (season === "autumn" ? 0.45 : 0.3);
    if (crown) {
      const cols = S.crown2 && it.deco < 0.18 ? S.crown2 : S.crown;
      drawCrown(d, PERIOD, it.x, it.b, it.h * 0.85, cols, it.s);
    } else {
      drawPine(d, PERIOD, it.x, it.b, it.h, PINE, snowy, it.s);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Силуэт разрушенного замка на холме — дальний ориентир для руин. Башни
// узкие и разной высоты, стены с зубцами, верх обломан: целый замок на
// горизонте выглядел бы картонной декорацией.
function drawCastle(d, w, x0, base, col, colLit) {
  const parts = [
    // [смещение, высота, ширина, башня?]
    [0, 15, 4, true],
    [4, 7, 7, false],
    [11, 21, 5, true],
    [16, 9, 9, false],
    [25, 12, 4, true],
    [29, 5, 6, false],
  ];
  for (const [ox, ph, pw, tower] of parts) {
    for (let x = 0; x < pw; x++) {
      const broken = tower ? Math.floor(hash(x0 + ox + x, 3) * 4) : 0;
      // Зубцы стены: каждый второй пиксель на верхней строке.
      const top = ph - broken - (!tower && x % 2 ? 1 : 0);
      for (let y = 0; y < top; y++) {
        const lit = x === 0;
        put(d, w, (x0 + ox + x) % w, base - y, lit ? colLit : col);
      }
    }
    if (tower) put(d, w, (x0 + ox + Math.floor(pw / 2)) % w, base - ph + 6, shade(col, 0.55));
  }
}

export function buildBackLayers(location, season, seed) {
  const winter = season === "winter";
  const tall = location === "mountains";
  const far = mountainLayer(seed + 1, {
    top: tall ? 12 : 26,
    base: HORIZON + 2,
    scale: tall ? 70 : 56,
    sharp: 0.7,
    rock: [P("#7c84a0"), P("#5c6280"), P("#3f4460")],
    snowline: tall ? 0.42 : 0.3,
    winter,
  });
  const mid = mountainLayer(seed + 2, {
    top: tall ? 44 : 52,
    base: HORIZON + 6,
    scale: 36,
    sharp: 0.35,
    rock: [P("#56604f"), P("#3e4640"), P("#2a302e")],
    snowline: winter ? 0.25 : 1,
    winter,
    forest: 4,
  });
  if (location === "ruins") {
    const ctx = mid.canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, PERIOD, H);
    // Замок ставим на самую высокую точку холмов.
    let bx = 0;
    for (let x = 0; x < PERIOD - 50; x++) if (mid.line[x] < mid.line[bx]) bx = x;
    drawCastle(img.data, PERIOD, Math.max(0, bx - 16), Math.round(mid.line[bx]) + 3, P("#3a3f47"), P("#5a606a"));
    ctx.putImageData(img, 0, 0);
  }
  const trees = treeLayer(seed + 3, season, HORIZON + 9, location === "forest" ? 1.6 : 1);
  return [
    { canvas: far.canvas, speed: 0.06, haze: 0.62, amb: 0.9 },
    { canvas: mid.canvas, speed: 0.16, haze: 0.4, amb: 0.85 },
    { canvas: trees, speed: 0.38, haze: 0.2, amb: 0.8 },
  ];
}

// Тонировка дальнего слоя под небо: умножаем на свет и разбавляем дымкой.
// Делается раз в минуту, поэтому честно попиксельно.
export function tintLayer(layer, st) {
  const src = layer.canvas;
  if (!layer.lit) layer.lit = makeCanvas(src.width, src.height);
  const sctx = src.getContext("2d", { willReadFrequently: true });
  const s = sctx.getImageData(0, 0, src.width, src.height);
  const out = layer.lit.getContext("2d");
  const o = out.createImageData(src.width, src.height);
  const a = st.ambient;
  const hz = st.haze;
  const k = layer.haze * (0.75 + st.overcast * 0.35);
  for (let i = 0; i < s.data.length; i += 4) {
    if (!s.data[i + 3]) continue;
    for (let ch = 0; ch < 3; ch++) {
      const lit = s.data[i + ch] * Math.min(1.05, a[ch] * layer.amb);
      o.data[i + ch] = mix(lit, hz[ch], clamp(k));
    }
    o.data[i + 3] = 255;
  }
  out.putImageData(o, 0, 0);
  return layer.lit;
}

// --- Ближняя земля ---

function groundTop(x, seed, w) {
  return HORIZON + 8 + Math.round((noise1(x / 9, Math.max(1, Math.round(w / 9)), seed) - 0.5) * 2);
}

// Ближняя земля: трава/снег/опад, темнее к нижнему краю — кадр «замыкается».
function paintGround(d, w, season, seed, x0, x1, topFn) {
  const S = SEASONS[season];
  const [g0, g1, g2] = S.grass;
  const r = rng(seed + 4);
  for (let x = x0; x < x1; x++) {
    const t = topFn(x);
    for (let y = t; y < H; y++) {
      const depth = (y - t) / (H - t);
      const n = noise2(x / 7, y / 2.6, seed) + (bayer(x, y) - 0.5) * 0.16;
      let col = y === t ? g0 : n > 0.62 ? g0 : n > 0.36 ? g1 : g2;
      if (!S.snow && noise2(x / 9, y / 4, seed + 1) > 0.72) col = mixRgb(col, S.dirt, 0.7);
      col = shade(col, 1 - depth * 0.35);
      put(d, w, x, y, col);
    }
    // Россыпь: цветы весной, листья осенью, камешки зимой.
    if (S.dots && r() < (season === "autumn" ? 0.3 : 0.1)) {
      const y = t + 1 + Math.floor(r() * (H - t - 2));
      put(d, w, x, y, S.dots[Math.floor(r() * S.dots.length)]);
    } else if (S.snow && r() < 0.05) {
      put(d, w, x, t + 2 + Math.floor(r() * 20), P("#4a4650"));
    }
  }
}

function makeTufts(season, seed, w, x0, x1, topFn, density = 1) {
  const S = SEASONS[season];
  const r = rng(seed + 8);
  const tufts = [];
  const n = Math.round(((x1 - x0) / 3) * density * (S.snow ? 0.25 : 1));
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(r() * (x1 - x0));
    const t = topFn(x);
    const y = t + Math.floor(Math.pow(r(), 2) * (H - t - 4));
    tufts.push({ x, y, h: 1 + Math.floor(r() * (y > t + 10 ? 4 : 3)), c: S.tuft[r() < 0.5 ? 0 : 1], ph: r() * 6 });
  }
  return tufts;
}

// --- Пещера ---

// Камень пещеры: четыре тона по шуму, пласты, трещины и светлый кант у
// входа, куда падает свет снаружи.
const ROCK = [P("#221d26"), P("#332c37"), P("#463d48"), P("#5c5058"), P("#7a6c6c")];

function rockAt(x, y, seed, edge) {
  const n = noise2(x / 7, y / 4, seed) * 0.55 + noise2(x / 2.5, y / 2.5, seed + 1) * 0.3 + Math.sin(y * 0.55 + noise2(x / 12, y / 12, seed + 2) * 5) * 0.08;
  let v = n + (bayer(x, y) - 0.5) * 0.18;
  const crack = Math.abs(noise2(x / 3, y / 11, seed + 3) - 0.5) < 0.025;
  if (crack) return ROCK[0];
  if (edge <= 1) return ROCK[4];
  if (edge <= 3) v += 0.25;
  return v > 0.72 ? ROCK[3] : v > 0.5 ? ROCK[2] : v > 0.3 ? ROCK[1] : ROCK[0];
}

function buildCave(d, ao, mask, w, season, seed, layout) {
  const mx = w * 0.55;
  const aw = w * 0.4;
  const top = 9;
  const lip = HORIZON + 10;
  const r = rng(seed + 20);
  const open = (x, y) => {
    if (y > lip) return false;
    const ang = Math.atan2(y - lip, x - mx);
    const jag = 1 + (noise1(ang * 9 + 20, 1000, seed + 4) - 0.5) * 0.16 + (hash(Math.round(ang * 40), seed) - 0.5) * 0.03;
    const nx = (x - mx) / (aw * jag);
    const ny = (y - lip) / ((lip - top) * jag);
    return nx * nx + ny * ny < 1;
  };
  // Стены расходятся книзу: пол пещеры шире входа, как в перспективе.
  const wallL = (y) => Math.max(-1, Math.round(mx - aw * 0.92 - (y - lip) * 1.6));
  const wallR = (y) => Math.min(w, Math.round(mx + aw * 0.92 + (y - lip) * 1.6));
  const isFloor = (x, y) => y > lip && x > wallL(y) && x < wallR(y);
  const openMap = new Uint8Array(w * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) openMap[y * w + x] = open(x, y) ? 1 : 0;
  const edgeDist = (x, y) => {
    for (let k = 1; k <= 4; k++) {
      if ((openMap[y * w + Math.min(w - 1, x + k)] || openMap[y * w + Math.max(0, x - k)]) && y <= lip) return k;
      if (y + k < H && openMap[(y + k) * w + x]) return k;
    }
    return 9;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (openMap[i]) {
        mask[i] = 1;
        continue;
      }
      if (isFloor(x, y)) {
        // Пол: утоптанная земля с камешками, у входа светлее.
        const n = noise2(x / 4, y / 1.6, seed + 7) + (bayer(x, y) - 0.5) * 0.3;
        let col = n > 0.62 ? P("#4a4038") : n > 0.36 ? P("#383029") : P("#29231f");
        if (hash(x * 131 + y * 17, seed) < 0.02) col = P("#5a5250");
        // Занесённые ветром листья — редкие и тёмные: у огня яркие точки
        // читались как раскалённые угли.
        if (season === "autumn" && y < lip + 8 && hash(x * 7 + y * 31, seed + 1) < 0.05) col = shade(SEASONS.autumn.dots[Math.floor(hash(x + y, 2) * 4)], 0.6);
        put(d, w, x, y, col);
        const near = clamp(1 - (y - lip) / 16);
        ao[i] = 0.42 + near * 0.4;
        continue;
      }
      const e = edgeDist(x, y);
      put(d, w, x, y, rockAt(x, y, seed, e));
      ao[i] = e <= 1 ? 0.95 : e <= 3 ? 0.65 : 0.4;
    }
  }

  // Сталактиты и (зимой) сосульки по краю свода.
  for (let x = Math.round(mx - aw * 0.8); x < mx + aw * 0.8; x++) {
    let y = 0;
    while (y < lip && !openMap[y * w + x]) y++;
    if (y >= lip - 20) continue;
    const roll = r();
    if (roll < 0.12) {
      const len = 2 + Math.floor(r() * 5);
      for (let k = 0; k < len; k++) {
        put(d, w, x, y + k, k === 0 ? ROCK[3] : ROCK[2]);
        ao[(y + k) * w + x] = 0.7;
        mask[(y + k) * w + x] = 0;
        if (k < len / 2 && x + 1 < w) {
          put(d, w, x + 1, y + k, ROCK[1]);
          mask[(y + k) * w + x + 1] = 0;
        }
      }
    } else if (season === "winter" && roll < 0.4) {
      const len = 1 + Math.floor(r() * 4);
      for (let k = 0; k < len; k++) {
        put(d, w, x, y + k, k < len - 1 ? P("#a8c4dc") : P("#e2eef8"));
        mask[(y + k) * w + x] = 0;
      }
    } else if (roll < 0.2) {
      // Свисающая лоза с листьями по сезону.
      const len = 4 + Math.floor(r() * 10);
      const S = SEASONS[season];
      for (let k = 0; k < len; k++) {
        const xx = x + Math.round(Math.sin(k * 0.6) * 0.6);
        const leaf = S.crown && hash(k + x * 3, seed) < 0.45;
        put(d, w, xx, y + k, leaf ? S.crown[k % 2] : P("#2c3324"));
        mask[(y + k) * w + xx] = 0;
      }
    }
  }
  return { lip };
}

// --- Лес ---

function drawTrunk(d, ao, w, x0, width, season, seed) {
  const S = SEASONS[season];
  const bark = [P("#4a3b30"), P("#33281f"), P("#221a14"), P("#5e4c3c")];
  for (let y = 0; y < H; y++) {
    // Комель расширяется к земле: корни.
    const flare = y > FLOOR - 8 ? Math.round(Math.pow((y - (FLOOR - 8)) / 8, 2) * 4) : 0;
    for (let x = -flare; x < width + flare; x++) {
      const xx = x0 + x;
      if (xx < 0 || xx >= w) continue;
      const u = x / width;
      const n = noise2(xx / 1.5, y / 6, seed);
      let col = u < 0.2 ? bark[3] : u < 0.55 ? bark[0] : u < 0.85 ? bark[1] : bark[2];
      if (n > 0.7) col = bark[2];
      if (S.snow && u < 0.25 && hash(y, seed) < 0.3) col = SNOW[1];
      if (x < 0 || x >= width) col = bark[1];
      put(d, w, xx, y, col);
      ao[y * w + xx] = 0.7;
    }
  }
}

// Крона: тёмные гроздья по верху кадра. Летом зелёная, осенью рыжая,
// зимой — еловые лапы под снегом. wrap — для зацикленной полосы пути.
function canopy(d, ao, w, season, r, wrap) {
  const S = SEASONS[season];
  const cols = S.crown || [P("#34483e"), P("#24332c"), P("#17211d")];
  const count = Math.round((w / 180) * 26);
  for (let i = 0; i < count; i++) {
    const cx = Math.round(r() * w);
    const edge = wrap ? 0.6 : Math.abs(cx - w / 2) / (w / 2) + 0.4;
    const cy = Math.round(-4 + r() * 12 * edge);
    const rad = 5 + r() * 8;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad * 1.4; dx <= rad * 1.4; dx++) {
        let x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (wrap) x = ((x % w) + w) % w;
        if (x < 0 || y < 0 || x >= w || y >= H) continue;
        const v = 1 - Math.hypot(dx / 1.4, dy) / rad;
        if (v + bayer(x, y) * 0.35 < 0.18) continue;
        const k = -dy / rad + (bayer(x, y) - 0.5) * 0.4;
        let col = k > 0.4 ? cols[0] : k > -0.2 ? cols[1] : cols[2];
        if (S.snow && k > 0.5) col = SNOW[1];
        put(d, w, x, y, col);
        if (ao) ao[y * w + x] = 0.65;
      }
    }
  }
}

function buildForest(d, ao, w, season, seed) {
  const r = rng(seed + 30);
  drawTrunk(d, ao, w, 2, 10, season, seed + 1);
  drawTrunk(d, ao, w, w - 13, 9, season, seed + 2);
  drawTrunk(d, ao, w, Math.round(w * 0.2), 4, season, seed + 3);
  canopy(d, ao, w, season, r, false);
  // Папоротники и грибы у земли.
  const fern = season === "winter" ? null : season === "autumn" ? [P("#8a6a2c"), P("#5e4620")] : [P("#4f7a36"), P("#335224")];
  if (fern) {
    for (let i = 0; i < 7; i++) {
      const fx = Math.round(r() * w);
      const fy = FLOOR + 2 + Math.round(r() * 8);
      for (let k = 0; k < 5; k++) {
        put(d, w, fx - k, fy - Math.round(k * 0.6), fern[k % 2]);
        put(d, w, fx + k, fy - Math.round(k * 0.6), fern[(k + 1) % 2]);
        put(d, w, fx, fy - k, fern[0]);
      }
    }
    for (let i = 0; i < 3; i++) {
      const mxx = Math.round(r() * w);
      const myy = FLOOR + 3 + Math.round(r() * 6);
      put(d, w, mxx, myy, P("#d8ccb0"));
      put(d, w, mxx - 1, myy - 1, P("#a8321e"));
      put(d, w, mxx, myy - 1, P("#c8442a"));
      put(d, w, mxx + 1, myy - 1, P("#a8321e"));
    }
  }
  for (let i = 0; i < w * H; i++) if (!ao[i]) ao[i] = 0.82;
}

// --- Горы (ближний план) ---

function boulder(d, ao, w, cx, base, rw, rh, seed, snowy) {
  for (let y = base - rh; y <= base + 2; y++) {
    for (let x = cx - rw; x <= cx + rw; x++) {
      const nx = (x - cx) / rw;
      const ny = (y - base) / rh;
      const jag = (noise2(x / 3, y / 3, seed) - 0.5) * 0.5;
      if (nx * nx + ny * ny > 1 + jag) continue;
      const lightK = -nx * 0.6 - ny * 0.8 + (bayer(x, y) - 0.5) * 0.4;
      let col = lightK > 0.7 ? ROCK[4] : lightK > 0.3 ? P("#4c4650") : lightK > -0.1 ? P("#38343e") : P("#26232b");
      if (snowy && ny < -0.55 + jag * 0.5) col = lightK > 0.4 ? SNOW[0] : SNOW[1];
      put(d, w, x, y, col);
      if (ao && x >= 0 && x < w && y >= 0 && y < H) ao[y * w + x] = 0.9;
    }
  }
}

// Мёртвое дерево: рекурсивные ветви по одному пикселю — силуэт на фоне неба.
function deadTree(d, w, x, y, ang, len, depth, r) {
  const col = depth > 2 ? P("#2e2420") : P("#211a17");
  let px = x;
  let py = y;
  for (let k = 0; k < len; k++) {
    px += Math.cos(ang);
    py += Math.sin(ang);
    put(d, w, Math.round(px), Math.round(py), col);
    if (depth > 3) put(d, w, Math.round(px) + 1, Math.round(py), col);
    ang += (r() - 0.5) * 0.3;
  }
  if (depth <= 0) return;
  deadTree(d, w, px, py, ang - 0.35 - r() * 0.4, len * 0.72, depth - 1, r);
  deadTree(d, w, px, py, ang + 0.3 + r() * 0.4, len * 0.68, depth - 1, r);
}

function buildMountains(d, ao, w, season, seed) {
  const r = rng(seed + 40);
  const snowy = season === "winter";
  boulder(d, ao, w, 6, FLOOR + 6, 16, 14, seed, snowy);
  boulder(d, ao, w, w - 6, FLOOR + 8, 14, 10, seed + 1, snowy);
  boulder(d, ao, w, Math.round(w * 0.8), FLOOR + 1, 5, 4, seed + 2, snowy);
  deadTree(d, w, 9, FLOOR - 6, -Math.PI / 2 + 0.12, 16, 4, r);
  // Каменная пирамидка-тур: путевой знак.
  const tx = w - 18;
  [[0, 0, 4], [0, -2, 3], [1, -4, 2], [1, -5, 1]].forEach(([ox, oy, rw]) => boulder(d, null, w, tx + ox, FLOOR - 9 + oy, rw, 1.6, seed + 9 + oy, snowy));
}

// --- Руины ---

const STONE = [P("#8a8478"), P("#6a655c"), P("#4c4842"), P("#33302c")];

function column(d, ao, w, x0, cw, topY, season, seed, broken) {
  const S = SEASONS[season];
  for (let y = topY; y <= FLOOR + 1; y++) {
    const capital = y < topY + 3 && !broken;
    const bw = capital ? cw + 2 : y > FLOOR - 2 ? cw + 2 : cw;
    const off = capital || y > FLOOR - 2 ? -1 : 0;
    for (let x = 0; x < bw; x++) {
      const xx = x0 + off + x;
      // Обломанная верхушка: зубчатый край.
      if (broken && y < topY + hash(xx, seed) * 6) continue;
      const u = x / bw;
      let col = u < 0.25 ? STONE[0] : u < 0.6 ? STONE[1] : u < 0.85 ? STONE[2] : STONE[3];
      // Каннелюры — вертикальные желобки.
      if (!capital && x % 3 === 2 && u > 0.2 && u < 0.85) col = STONE[2];
      if (noise2(xx / 2, y / 3, seed) > 0.75) col = STONE[3];
      if (y % 9 === 0 && !capital) col = STONE[3];
      put(d, w, xx, y, col);
      if (ao && xx >= 0 && xx < w) ao[y * w + xx] = 0.92;
    }
  }
  // Плющ взбирается по колонне.
  const ivy = S.crown || [P("#3a4a30"), P("#2a3624")];
  for (let k = 0; k < 18; k++) {
    const y = FLOOR - Math.floor(hash(k, seed + 5) * (FLOOR - topY) * 0.8);
    const x = x0 + Math.floor(hash(k, seed + 6) * cw);
    put(d, w, x, y, ivy[k % 2]);
    put(d, w, x, y + 1, ivy[(k + 1) % 2]);
  }
}

function buildRuins(d, ao, w, season, seed) {
  const r = rng(seed + 50);
  column(d, ao, w, 6, 7, 26, season, seed + 1, true);
  column(d, ao, w, w - 14, 7, 18, season, seed + 2, false);
  const ax = w - 34;
  // Перекладина-архитрав на правой колонне, обломанная.
  for (let x = w - 30; x < w; x++) {
    for (let y = 14; y < 18; y++) {
      if (x < w - 30 + hash(y, seed) * 6) continue;
      put(d, w, x, y, y === 14 ? STONE[0] : y === 17 ? STONE[3] : STONE[1]);
      ao[y * w + x] = 0.92;
    }
  }
  column(d, ao, w, ax, 6, 46, season, seed + 3, true);
  // Обломки и плиты на земле.
  for (let i = 0; i < 6; i++) {
    const bx = Math.round(r() * w);
    const by = FLOOR + 2 + Math.round(r() * 8);
    const bw = 3 + Math.floor(r() * 5);
    for (let y = 0; y < 3; y++) for (let x = 0; x < bw; x++) put(d, w, bx + x, by + y, y === 0 ? STONE[1] : STONE[2 + (x === bw - 1 ? 1 : 0)]);
  }
  // Плиты древней мостовой проступают сквозь траву.
  for (let y = FLOOR - 4; y < H; y++) {
    for (let x = 0; x < w; x++) {
      const gx = Math.floor((x + (Math.floor(y / 4) % 2) * 3) / 7);
      const gy = Math.floor(y / 4);
      if (hash(gx * 31 + gy, seed + 8) < 0.35) {
        const edge = (x + (Math.floor(y / 4) % 2) * 3) % 7 === 0 || y % 4 === 0;
        put(d, w, x, y, edge ? STONE[3] : shade(STONE[2], 0.9));
      }
    }
  }
}

// --- Сборка ближнего плана ---

// Статичный ближний план для всех действий, кроме пути. ao — сколько
// небесного света доходит до пикселя (в пещере мало), mask — где идут дождь
// и снег (под сводом не идут).
export function buildNear(w, location, season, seed) {
  const c = makeCanvas(w, H);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, H);
  const d = img.data;
  const ao = new Float32Array(w * H);
  const mask = new Uint8Array(w * H).fill(location === "cave" ? 0 : 1);
  const topFn = (x) => groundTop(x, seed, w);
  paintGround(d, w, season, seed, 0, w, topFn);
  let tufts = makeTufts(season, seed, w, 0, w, topFn, location === "cave" ? 0 : 1);
  let extra = {};
  if (location === "cave") extra = buildCave(d, ao, mask, w, season, seed, null);
  else if (location === "forest") buildForest(d, ao, w, season, seed);
  else if (location === "mountains") buildMountains(d, ao, w, season, seed);
  else if (location === "ruins") buildRuins(d, ao, w, season, seed);
  // reach — докуда достаёт свет костра. Голая земля у горизонта далеко
  // в глубине кадра, и подсвечивать её как ближнюю нельзя: в пещере это
  // давало яркую полосу на пороге. Декорации (скалы, стволы) — рядом, им 1.
  const reach = new Float32Array(w * H);
  const g0 = HORIZON + 8;
  for (let y = 0; y < H; y++) {
    const gr = Math.pow(clamp((y - g0) / (FLOOR - g0)), 1.6);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      reach[i] = ao[i] && !(location === "cave" && mask[i]) ? 1 : Math.max(0.08, gr);
    }
  }
  for (let i = 0; i < ao.length; i++) if (!ao[i]) ao[i] = 1;
  if (location === "cave") {
    // Трава видна только снаружи, в проёме.
    tufts = makeTufts(season, seed, w, 0, w, topFn, 1).filter((t) => mask[t.y * w + t.x] && t.y < (extra.lip || H));
  }
  ctx.putImageData(img, 0, 0);
  const maskCanvas = makeCanvas(w, H);
  if (location === "cave") {
    const mctx = maskCanvas.getContext("2d");
    const m = mctx.createImageData(w, H);
    for (let i = 0; i < mask.length; i++) m.data[i * 4 + 3] = mask[i] ? 255 : 0;
    mctx.putImageData(m, 0, 0);
  }
  return { canvas: c, ao, reach, mask, maskCanvas: location === "cave" ? maskCanvas : null, tufts, lip: extra.lip, groundAt: topFn };
}

// Полоса земли для пути: зациклена по PERIOD, с редкими декорациями места.
export function buildTravelStrip(location, season, seed) {
  const w = PERIOD;
  const c = makeCanvas(w, H);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, H);
  const d = img.data;
  const topFn = (x) => groundTop(x, seed, w);
  paintGround(d, w, season, seed, 0, w, topFn);
  const r = rng(seed + 60);
  const snowy = season === "winter";
  const dummyAo = new Float32Array(w * H);
  // Тропа: утоптанная полоса под ногами.
  for (let x = 0; x < w; x++) {
    for (let y = FLOOR - 1; y <= FLOOR + 3; y++) {
      if (bayer(x, y) < 0.3 + (y === FLOOR - 1 || y === FLOOR + 3 ? -0.2 : 0.3)) continue;
      put(d, w, x, y, snowy ? P("#9aa4b8") : shade(SEASONS[season].dirt, 1.1));
    }
  }
  for (let x = 30; x < w - 30; x += 60 + Math.floor(r() * 50)) {
    const kind = location === "forest" ? "tree" : location === "ruins" ? (r() < 0.6 ? "column" : "rock") : "rock";
    if (kind === "tree") {
      drawTrunk(d, dummyAo, w, x, 7 + Math.floor(r() * 5), season, seed + x);
    } else if (kind === "column") {
      column(d, dummyAo, w, x, 6, 30 + Math.floor(r() * 30), season, seed + x, true);
    } else {
      boulder(d, null, w, x, FLOOR + 4 + Math.floor(r() * 4), 4 + Math.floor(r() * 7), 3 + Math.floor(r() * 5), seed + x, snowy);
    }
  }
  if (location === "forest") canopy(d, null, w, season, r, true);
  ctx.putImageData(img, 0, 0);
  const tufts = makeTufts(season, seed, w, 0, w, topFn, 1);
  return { canvas: c, tufts, period: w, ao: location === "forest" ? 0.85 : 1 };
}
