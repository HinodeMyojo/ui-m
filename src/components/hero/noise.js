// Мелкие числовые помощники сцены героя: детерминированный шум, цвета,
// дизеринг. Всё детерминировано от сида — фон одинаков при каждом рендере
// и не «перемешивается» при смене пропсов.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(n, seed = 0) {
  let h = (n | 0) * 374761393 + seed * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hash2(x, y, seed = 0) {
  return hash((x | 0) * 73856093 ^ (y | 0) * 19349663, seed);
}

const smooth = (t) => t * t * (3 - 2 * t);

// Периодический одномерный шум: слои параллакса зациклены по ширине, и шов
// на стыке периода был бы виден при каждом проходе героя.
export function noise1(x, period, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(((i % period) + period) % period, seed);
  const b = hash((((i + 1) % period) + period) % period, seed);
  return a + (b - a) * smooth(f);
}

export function fbm1(x, period, seed = 0, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise1(x * freq, period * freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

// Матрица Байера 4×4: ступенчатый «ретро» градиент вместо гладкого —
// на увеличенных пикселях гладкий градиент выглядит как размазня.
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x, y) {
  return (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;

export function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixRgb(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

export function css(c, alpha = 1) {
  const r = Math.round(clamp(c[0], 0, 255));
  const g = Math.round(clamp(c[1], 0, 255));
  const b = Math.round(clamp(c[2], 0, 255));
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export function mulRgb(c, k) {
  return [c[0] * k[0], c[1] * k[1], c[2] * k[2]];
}

export function scaleRgb(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

// Интерполяция по ключам [[t, value], ...] — небо и свет живут на таких кривых.
export function keyed(keys, t, lerp) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return lerp(v0, v1, (t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

// Все вспомогательные канвасы — программные (willReadFrequently). Сцена
// каждый кадр читает пиксели назад; если источник живёт на видеокарте,
// каждое чтение ждёт GPU, и это было 95 % времени кадра.
export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  c.getContext("2d", { willReadFrequently: true });
  return c;
}
