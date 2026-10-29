import { rng, bayer, clamp, mix, mixRgb, hex, keyed, makeCanvas } from "./noise.js";

// Небо сцены: время суток, сезон, солнце, луна, звёзды, облака.
// Всё, что зависит только от времени и погоды, рисуется в кэш раз в минуту —
// каждый кадр сцена лишь копирует готовую картинку.

// --- Солнце и сезоны ---

// Пользователь в Москве (~55° с. ш.), поэтому долгота дня не равна 12 часам:
// в декабре светло ~7 ч, в июне ~17,5 ч. Рассвет в 9 зимой и в 4 летом —
// иначе сцена показывала бы ночь, когда за окном уже день, и наоборот.
export function solar(now) {
  const d = now instanceof Date && !isNaN(now) ? now : new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const doy = (d - start) / 86400000;
  const hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const dayLen = 12.25 + 5.25 * Math.cos((2 * Math.PI * (doy - 172)) / 365);
  const noon = 12.5;
  const sunrise = noon - dayLen / 2;
  const sunset = noon + dayLen / 2;
  // Высота солнца в полдень зимой низкая — день серый и короткий, это видно.
  const peak = 0.4 + 0.6 * clamp((dayLen - 7) / 10.5);
  const nightLen = 24 - dayLen;
  const depth = clamp(nightLen / 13, 0.55, 1);

  let e;
  let dayProgress = -1;
  let nightProgress = -1;
  if (hour >= sunrise && hour <= sunset) {
    dayProgress = (hour - sunrise) / dayLen;
    e = Math.sin(Math.PI * dayProgress) * peak;
  } else {
    const since = hour > sunset ? hour - sunset : hour + 24 - sunset;
    nightProgress = since / nightLen;
    e = -Math.sin(Math.PI * nightProgress) * depth;
  }
  // Сумерки длятся дольше, чем доля синуса у горизонта: растягиваем около нуля.
  e = Math.sign(e) * Math.pow(Math.abs(e), 0.75);

  const month = d.getMonth();
  const season =
    month === 11 || month <= 1
      ? "winter"
      : month <= 4
        ? "spring"
        : month <= 7
          ? "summer"
          : "autumn";

  // Фаза луны от известного новолуния 6 января 2000-го: 0 — новолуние, 0.5 — полная.
  const synodic = 29.530588853;
  const known = Date.UTC(2000, 0, 6, 18, 14);
  let phase = ((d.getTime() - known) / 86400000 / synodic) % 1;
  if (phase < 0) phase += 1;
  const moonLight = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);

  return {
    e,
    hour,
    dayProgress,
    nightProgress,
    evening: hour > noon,
    season,
    month,
    moonPhase: phase,
    moonLight,
  };
}

// --- Палитры по высоте солнца ---

const C = (s) => hex(s);
const lerpRgb = (a, b, t) => mixRgb(a, b, t);

// Ключи подобраны под приглушённый «тёмное фэнтези» тон: день не открыточно
// голубой, ночь не чёрная, а глубокая индиго.
const TOP = [
  [-1, C("#04050b")],
  [-0.45, C("#070a18")],
  [-0.18, C("#141a36")],
  [-0.05, C("#2a2a52")],
  [0.04, C("#3b4673")],
  [0.15, C("#4d6590")],
  [0.4, C("#5a7ea8")],
  [1, C("#557cab")],
];
const MID = [
  [-1, C("#090c19")],
  [-0.45, C("#0e1328")],
  [-0.18, C("#2a2a4e")],
  [-0.05, C("#5b3f63")],
  [0.04, C("#8d5f6a")],
  [0.15, C("#a48a8a")],
  [0.4, C("#8eaac4")],
  [1, C("#88abcb")],
];
const HOR = [
  [-1, C("#10142a")],
  [-0.45, C("#171c36")],
  [-0.18, C("#4a3656")],
  [-0.05, C("#b0574a")],
  [0.04, C("#e08a4e")],
  [0.15, C("#e2b47e")],
  [0.4, C("#c3d2dc")],
  [1, C("#b9cfdf")],
];
// Закат краснее рассвета: вечером горизонт уходит в пурпур, утром — в персик.
const HOR_EVENING_TINT = C("#c0404a");

const AMBIENT = [
  [-1, [0.28, 0.31, 0.5]],
  [-0.45, [0.3, 0.33, 0.52]],
  [-0.18, [0.36, 0.34, 0.52]],
  [-0.05, [0.55, 0.42, 0.48]],
  [0.04, [0.86, 0.62, 0.52]],
  [0.15, [1.0, 0.84, 0.68]],
  [0.4, [1.0, 0.97, 0.92]],
  [1, [1.04, 1.03, 1.0]],
];

const SUN_COLOR = [
  [-0.1, C("#ff5a32")],
  [0.05, C("#ff8a3c")],
  [0.2, C("#ffd28a")],
  [1, C("#fff4dc")],
];

// Сколько неба закрыто: от этого серость, потемнение и пропажа звёзд.
const OVERCAST = { clear: 0, clouds: 0.45, fog: 0.6, rain: 0.8, snow: 0.7, storm: 1 };

function grey(c, k) {
  const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
  return [l * k, l * k, l * k * 1.06];
}

export function skyState(sol, weather) {
  const kind = weather?.kind || "clear";
  const oc = OVERCAST[kind] ?? 0;
  const e = sol.e;
  let top = keyed(TOP, e, lerpRgb);
  let mid = keyed(MID, e, lerpRgb);
  let hor = keyed(HOR, e, lerpRgb);
  if (sol.evening && e > -0.3 && e < 0.2) {
    const k = 0.35 * (1 - Math.abs(e - -0.04) / 0.26);
    hor = mixRgb(hor, HOR_EVENING_TINT, clamp(k));
  }
  const night = clamp((-e - 0.05) / 0.35);
  // Серость облаков: днём светло-серая, ночью почти не видна.
  const greyK = kind === "storm" ? 0.55 : kind === "rain" ? 0.7 : 0.85;
  top = mixRgb(top, grey(top, greyK), oc * 0.85);
  mid = mixRgb(mid, grey(mid, greyK), oc * 0.85);
  hor = mixRgb(hor, grey(hor, greyK * 1.05), oc * 0.75);

  let ambient = keyed(AMBIENT, e, lerpRgb).slice();
  // Лунный свет в полнолуние заметно светлее безлунной ночи.
  const moonBoost = 1 + 0.3 * sol.moonLight * night * (1 - oc);
  ambient = ambient.map((v) => v * moonBoost);
  const g = (ambient[0] + ambient[1] + ambient[2]) / 3;
  ambient = ambient.map((v) => mix(v, g, oc * 0.5) * (1 - oc * (kind === "storm" ? 0.38 : 0.22)));

  const sun = keyed(SUN_COLOR, e, lerpRgb);
  return {
    top,
    mid,
    hor,
    ambient,
    night,
    overcast: oc,
    sun,
    e,
    starAlpha: night * (1 - oc * 0.95),
    // Дымка на дальних горах — цвет горизонта, чуть разбавленный серым.
    haze: mixRgb(hor, mid, 0.35),
  };
}

// --- Отрисовка неба в кэш ---

function skyAt(st, t) {
  // t: 0 — верх, 1 — горизонт. Средняя точка ниже середины: у горизонта
  // свечение узкое, как в настоящих сумерках.
  if (t < 0.62) return mixRgb(st.top, st.mid, t / 0.62);
  return mixRgb(st.mid, st.hor, (t - 0.62) / 0.38);
}

// Солнце и луна идут по дуге над горизонтом слева направо.
export function bodyPos(sol, W, horizon) {
  if (sol.dayProgress >= 0) {
    const p = sol.dayProgress;
    return { kind: "sun", x: Math.round(mix(-6, W + 6, p)), y: Math.round(horizon - Math.sin(Math.PI * p) * horizon * 0.82 + 4) };
  }
  const p = sol.nightProgress;
  return { kind: "moon", x: Math.round(mix(W * 0.08, W * 0.92, p)), y: Math.round(horizon - Math.sin(Math.PI * p) * horizon * 0.72 + 2) };
}

export function renderSky(canvas, W, H, horizon, sol, st, seed) {
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const body = bodyPos(sol, W, horizon);
  const bands = 14;
  const sunGlow = body.kind === "sun" ? clamp(1 - st.overcast * 1.2) : 0;
  const moonGlow = body.kind === "moon" ? st.night * (0.25 + 0.75 * sol.moonLight) * (1 - st.overcast * 0.9) : 0;
  const glowCol = body.kind === "sun" ? st.sun : [190, 205, 235];
  const glowR = body.kind === "sun" ? 36 : 26;

  for (let y = 0; y < H; y++) {
    const ty = clamp(y / horizon);
    for (let x = 0; x < W; x++) {
      const th = bayer(x, y);
      // Ступенчатый градиент с дизерингом между соседними полосами.
      const q = Math.floor(ty * bands + th - 0.5) / bands;
      let c = skyAt(st, clamp(q));
      const dx = x - body.x;
      const dy = (y - body.y) * 1.2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const glow = sunGlow || moonGlow;
      if (glow > 0 && dist < glowR) {
        let k = 1 - dist / glowR;
        k = Math.floor((k * k * glow * 0.9) * 6 + th - 0.5) / 6;
        if (k > 0) c = mixRgb(c, glowCol, clamp(k * 0.75));
      }
      const i = (y * W + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }

  // Млечный путь: россыпь тусклых точек по диагонали, только ясной ночью.
  if (st.starAlpha > 0.2) {
    const r = rng(seed + 91);
    const n = Math.round(260 * st.starAlpha);
    for (let k = 0; k < n; k++) {
      const u = r();
      const x = Math.round(u * W);
      const yc = mix(horizon * 0.05, horizon * 0.7, u);
      const y = Math.round(yc + (r() + r() + r() - 1.5) * 12);
      if (y < 0 || y >= horizon) continue;
      const i = (y * W + x) * 4;
      const a = 0.12 + r() * 0.18;
      d[i] = mix(d[i], 170, a);
      d[i + 1] = mix(d[i + 1], 175, a);
      d[i + 2] = mix(d[i + 2], 210, a);
    }
  }
  ctx.putImageData(img, 0, 0);

  if (body.kind === "sun" && st.e > -0.08) drawSun(ctx, body, st);
  if (body.kind === "moon" && st.night > 0.05) drawMoon(ctx, body, sol, st);
  return body;
}

function drawSun(ctx, body, st) {
  // За сплошной облачностью диска не видно — только ровный серый свет.
  const a = clamp(1 - st.overcast * 1.6);
  if (a <= 0.05) return;
  const core = mixRgb(st.sun, [255, 250, 235], 0.5);
  ctx.globalAlpha = a;
  ctx.fillStyle = `rgb(${core.map(Math.round).join(",")})`;
  // Диск 5×5 со срезанными углами.
  ctx.fillRect(body.x - 1, body.y - 2, 3, 5);
  ctx.fillRect(body.x - 2, body.y - 1, 5, 3);
  ctx.globalAlpha = 1;
}

// Пиксельная луна 9×9 с кратерами и честной фазой.
const MOON_CRATERS = new Set(["-2,-1", "1,-2", "2,1", "-1,2", "0,0", "2,-1"]);
function drawMoon(ctx, body, sol, st) {
  const r = 4.3;
  const phase = sol.moonPhase;
  const k = Math.cos(2 * Math.PI * phase);
  const waxing = phase < 0.5;
  const alpha = clamp(st.night * (1 - st.overcast * 0.85));
  if (alpha <= 0.05) return;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const rr = Math.sqrt(dx * dx + dy * dy);
      if (rr > r) continue;
      const nx = dx / r;
      const ny = dy / r;
      const w = Math.sqrt(Math.max(0, 1 - ny * ny));
      const lit = waxing ? nx > k * w : nx < -k * w;
      let c;
      if (lit) {
        c = MOON_CRATERS.has(`${dx},${dy}`) ? [176, 182, 196] : [222, 226, 236];
        if (rr > r - 1) c = [196, 202, 218];
      } else {
        c = [32, 36, 54];
      }
      ctx.globalAlpha = lit ? alpha : alpha * 0.8;
      ctx.fillStyle = `rgb(${c.join(",")})`;
      ctx.fillRect(body.x + dx, body.y + dy, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// --- Звёзды ---

export function makeStars(W, horizon, seed) {
  const r = rng(seed + 7);
  const stars = [];
  const n = Math.round(W * 0.42);
  for (let i = 0; i < n; i++) {
    const y = Math.floor(Math.pow(r(), 1.4) * horizon * 0.85);
    stars.push({
      x: Math.floor(r() * W),
      y,
      b: 0.35 + r() * 0.65,
      ph: r() * Math.PI * 2,
      sp: 0.6 + r() * 2.2,
      big: r() < 0.06,
    });
  }
  return stars;
}

export function drawStars(ctx, stars, t, alpha, still) {
  if (alpha <= 0.02) return;
  for (const s of stars) {
    const tw = still ? 1 : 0.65 + 0.35 * Math.sin(t * s.sp + s.ph);
    const a = alpha * s.b * tw;
    if (a < 0.08) continue;
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = s.b > 0.8 ? "#f4f0ff" : "#c8d2f0";
    ctx.fillRect(s.x, s.y, 1, 1);
    if (s.big && a > 0.5) {
      ctx.globalAlpha = a * 0.35;
      ctx.fillRect(s.x - 1, s.y, 3, 1);
      ctx.fillRect(s.x, s.y - 1, 1, 3);
    }
  }
  ctx.globalAlpha = 1;
}

// --- Облака ---

// Облако — объединение кругов, затенённое снизу. Рисуем в маленький канвас:
// освещение облака зависит от времени, поэтому набор пересобирается раз в минуту.
function cloudSprite(seed, w, h, lit, mid, shade, dark) {
  const r = rng(seed);
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const blobs = [];
  const n = 3 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const bx = mix(w * 0.18, w * 0.82, (i + r() * 0.6) / n);
    const br = mix(h * 0.28, h * 0.5, r());
    blobs.push([bx, h - br - 1, br]);
  }
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = -1;
      let up = 0;
      for (const [bx, by, br] of blobs) {
        const dx = x - bx;
        const dy = (y - by) * 1.5;
        const v = 1 - Math.sqrt(dx * dx + dy * dy) / br;
        if (v > best) {
          best = v;
          up = (by - y) / br;
        }
      }
      // Плоское дно: у облаков в пиксель-арте нижний край ровный.
      if (y > h - 2) best = -1;
      const th = bayer(x, y);
      if (best + th * 0.25 < 0.08) continue;
      const shadeK = up + 0.35 + (th - 0.5) * 0.3;
      const col = shadeK > 0.75 ? lit : shadeK > 0.35 ? mid : shadeK > 0 ? shade : dark;
      const i = (y * w + x) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const CLOUD_COUNT = { clear: 2, clouds: 6, fog: 3, rain: 8, snow: 7, storm: 9 };

export function makeClouds(W, horizon, st, weather, seed) {
  const kind = weather?.kind || "clear";
  const n = CLOUD_COUNT[kind] ?? 2;
  const r = rng(seed + 33);
  const dark = kind === "storm" || kind === "rain";
  // Облако почти цвета неба на своей высоте, чуть подсвеченное источником:
  // контрастные облака с тёмным низом читались как летающие скалы.
  const base = mixRgb(st.mid, st.top, 0.3);
  const light = st.night > 0.5 ? mixRgb(base, [140, 150, 185], 0.3) : mixRgb(st.hor, st.sun, 0.3);
  const k = dark ? 0.8 : 1;
  const lit = mixRgb(base, light, 0.6).map((v) => clamp(v * k, 0, 255));
  const mid = mixRgb(base, light, 0.32).map((v) => v * k);
  const flat = kind === "rain" || kind === "snow" || kind === "storm" || kind === "fog";
  const shade = base.map((v) => v * (flat ? 0.97 : 0.94) * k);
  const darkC = base.map((v) => v * (flat ? 0.93 : 0.86) * k);
  const clouds = [];
  for (let i = 0; i < n; i++) {
    const w = Math.round(mix(26, 54, r()) * (dark ? 1.4 : 1));
    const h = Math.round(w * mix(0.22, 0.32, r()));
    clouds.push({
      img: cloudSprite(seed + i * 13, w, h, lit, mid, shade, darkC),
      x: r() * (W + 60),
      y: Math.round(mix(2, horizon * (dark ? 0.45 : 0.6), r())),
      sp: mix(0.6, 1.4, r()),
    });
  }
  // Дальние ряды — первыми, чтобы ближние перекрывали их.
  clouds.sort((a, b) => a.y - b.y);
  return clouds;
}

export function drawClouds(ctx, clouds, W, t, wind, alpha) {
  const span = W + 60;
  for (const c of clouds) {
    const x = Math.round(((((c.x + t * c.sp * (0.6 + wind * 3)) % span) + span) % span) - 50);
    ctx.globalAlpha = alpha;
    ctx.drawImage(c.img, x, c.y);
  }
  ctx.globalAlpha = 1;
}

// Молния: ломаная из облака к горизонту, пересчитывается на каждый удар.
export function makeBolt(W, horizon, seed) {
  const r = rng(seed);
  const pts = [];
  let x = Math.round(mix(W * 0.15, W * 0.85, r()));
  for (let y = 4; y < horizon - 4; y += 1) {
    if (r() < 0.35) x += r() < 0.5 ? -1 : 1;
    pts.push([x, y]);
    if (r() < 0.04 && pts.length > 8) {
      // Ветка: короткий отросток в сторону.
      const dir = r() < 0.5 ? -1 : 1;
      let bx = x;
      for (let k = 1; k < 8; k++) {
        bx += r() < 0.6 ? dir : 0;
        pts.push([bx, y + k]);
      }
    }
  }
  return pts;
}
