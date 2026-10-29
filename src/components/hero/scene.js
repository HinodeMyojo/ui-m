import { rng, noise1, noise2, bayer, clamp, mix, mixRgb, hex, css, makeCanvas } from "./noise.js";
import { solar, skyState, renderSky, makeStars, drawStars, makeClouds, drawClouds } from "./sky.js";
import { H, HORIZON, FLOOR, PERIOD, buildBackLayers, tintLayer, buildNear, buildTravelStrip } from "./terrain.js";
import { createWeather } from "./weather.js";
import { POSES, PROPS, FIRE, WISP_FRAMES, GEAR, heroPalette, propPalette, compile, breathe, outline } from "./sprites.js";

// Рендерер сцены героя. Вне Vue: получает канвас и пропсы, сам ничего не
// планирует — кадры двигает компонент (12 кадров в секунду и пауза в фоне).
//
// Как устроен кадр:
//  1. «Задник» — небо, звёзды, облака, дальние горы и лес. Он уже освещён
//     (тонируется раз в минуту под время суток) и от костра не зависит.
//  2. «Ближний план» — земля, пещера, герой, реквизит — рисуется без света,
//     голым цветом.
//  3. Попиксельный проход: ближний план умножается на свет неба (с учётом
//     того, что в пещеру небо почти не светит) плюс свет костра и ауры,
//     со ступенчатым дизерингом — свет ложится «пиксельными» кольцами.
//  4. Поверх — то, что светится само: пламя, искры, аура, погода.

export const DEFAULTS = {
  action: "campfire",
  location: "cave",
  fire: 1,
  streak: 0,
  aura: 0,
  whistle: "bell",
  age: 24,
  mood: "good",
  weather: null,
  now: null,
};

const ACTIONS = ["campfire", "sleep", "read", "train", "meditate", "travel"];
const LOCATIONS = ["cave", "mountains", "forest", "ruins"];
const MOODS = ["good", "strong", "weak"];
const KINDS = ["clear", "clouds", "rain", "snow", "fog", "storm"];

export function normalize(p) {
  const w = p.weather && typeof p.weather === "object" ? p.weather : null;
  const kind = KINDS.includes(w?.kind) ? w.kind : "clear";
  const fire = [0, 1, 2, 3].includes(Number(p.fire)) ? Number(p.fire) : 1;
  return {
    action: ACTIONS.includes(p.action) ? p.action : "campfire",
    location: LOCATIONS.includes(p.location) ? p.location : "cave",
    fire,
    streak: Math.max(0, Number(p.streak) || 0),
    aura: clamp(Math.round(Number(p.aura) || 0), 0, 4),
    whistle: GEAR[p.whistle] ? p.whistle : "bell",
    age: clamp(Number(p.age) || 24, 1, 120),
    mood: MOODS.includes(p.mood) ? p.mood : "good",
    weather: {
      kind,
      wind: clamp(Number(w?.wind) || (w ? 0 : 0.15)),
      // Необязательные поля: сила осадков и сторона, куда дует (1 — вправо).
      intensity: clamp(w?.intensity == null ? (kind === "storm" ? 1 : 0.65) : Number(w.intensity) || 0.65),
      dir: Number(w?.dir) < 0 ? -1 : 1,
    },
    now: p.now instanceof Date && !isNaN(p.now) ? p.now : new Date(),
  };
}

// Цвет ауры по уровню: от лунно-серого к белому золоту.
const AURA = [
  null,
  { col: [0.62, 0.72, 0.95], r: 13, i: 0.3, motes: 3 },
  { col: [0.95, 0.82, 0.5], r: 16, i: 0.55, motes: 6 },
  { col: [1.0, 0.84, 0.42], r: 19, i: 0.72, motes: 10 },
  { col: [1.0, 0.95, 0.78], r: 24, i: 1.0, motes: 18 },
];

// Высота пламени растёт со стриком, но не бесконечно: +5 пикселей максимум.
export function flameSize(level, streak) {
  if (level === 0) return { h: 0, grow: 0 };
  const grow = Math.min(5, Math.floor(Math.log2(1 + streak / 4) * 1.6));
  return { h: [0, 10, 12, 14][level] + grow, grow };
}

const LUT_N = 1024;
const lutFire = new Float32Array(LUT_N + 1);
const lutBloom = new Float32Array(LUT_N + 1);
const lutAura = new Float32Array(LUT_N + 1);
const lutRing = new Float32Array(LUT_N + 1);
const BAYER = new Float32Array(16).map((_, k) => bayer(k & 3, k >> 2));

export function createScene(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext("2d");
  let W = 180;
  let props = normalize(DEFAULTS);
  const seed = 1789;
  const back = makeCanvas(W, H);
  const backCtx = back.getContext("2d", { willReadFrequently: true });
  const near = makeCanvas(W, H);
  const nearCtx = near.getContext("2d", { willReadFrequently: true });
  const fx = makeCanvas(W, H);
  const fxCtx = fx.getContext("2d");
  const skyCanvas = makeCanvas(W, H);
  const flameCanvas = makeCanvas(32, 32);
  const flameCtx = flameCanvas.getContext("2d");
  const flameImg = flameCtx.createImageData(32, 32);
  let out = null;
  let vignette = null;
  const weather = createWeather(seed);
  const pal = propPalette();
  const r = rng(seed + 100);

  let time = 0;
  let scroll = 0;
  let sol = null;
  let st = null;
  let skyKey = "";
  let backKey = "";
  let nearKey = "";
  let backLayers = null;
  let nearScene = null;
  let strip = null;
  let stars = null;
  let clouds = null;
  let layout = null;
  const sparks = [];
  const smoke = [];
  const motes = [];
  const arrows = [];
  let stuck = [];
  let lastShot = -1;
  let thunderCb = null;
  let auraTint = null;
  let palette = null;
  let paletteKey = "";
  weather.onThunder = (delay) => thunderCb && thunderCb(delay);

  // --- Подготовка ---

  function resize(w) {
    const nw = clamp(Math.round(w), 120, 260);
    if (nw === W && canvas.width === W) return;
    W = nw;
    for (const c of [canvas, back, near, fx]) {
      c.width = W;
      c.height = H;
    }
    out = null;
    vignette = null;
    skyKey = backKey = nearKey = "";
  }

  function setProps(p) {
    props = normalize({ ...DEFAULTS, ...p });
  }

  function ensure() {
    const p = props;
    sol = solar(p.now);
    const minute = Math.floor(p.now.getTime() / 60000);
    const bk = `${p.location}|${sol.season}|${W}`;
    if (bk !== backKey) {
      backLayers = buildBackLayers(p.location === "cave" && p.action === "travel" ? "mountains" : p.location, sol.season, seed);
      stars = makeStars(W, HORIZON, seed);
      backKey = bk;
      skyKey = "";
    }
    const sk = `${minute}|${p.weather.kind}|${W}|${bk}`;
    if (sk !== skyKey) {
      st = skyState(sol, p.weather);
      renderSky(skyCanvas, W, H, HORIZON, sol, st, seed);
      clouds = makeClouds(W, HORIZON, st, p.weather, seed + (minute % 7));
      for (const l of backLayers) tintLayer(l, st);
      skyKey = sk;
    }
    const nk = `${p.location}|${sol.season}|${W}|${p.action === "travel"}`;
    if (nk !== nearKey) {
      if (p.action === "travel") {
        strip = buildTravelStrip(p.location === "cave" ? "mountains" : p.location, sol.season, seed);
        nearScene = null;
      } else {
        nearScene = buildNear(W, p.location, sol.season, seed);
        strip = null;
      }
      nearKey = nk;
      layout = null;
    }
    layout = makeLayout();
    if (!out) {
      out = ctx.createImageData(W, H);
      vignette = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = (x - W / 2) / (W / 2);
          const dy = (y - H * 0.55) / (H * 0.6);
          const d = Math.sqrt(dx * dx * 0.8 + dy * dy);
          vignette[y * W + x] = 1 - 0.4 * Math.pow(clamp((d - 0.6) / 0.6), 1.6);
        }
      }
    }
  }

  // Где стоят герой, костёр и реквизит — зависит от действия и ширины.
  function makeLayout() {
    const p = props;
    const cave = p.location === "cave";
    const cx = Math.round(W / 2) + (cave ? Math.round(W * 0.04) : 0);
    const L = { cx, fire: null, hero: { x: cx - 12, y: FLOOR }, seat: null, bedroll: null, target: null, wisp: null };
    if (p.action === "train") {
      L.hero = { x: cx - 14, y: FLOOR };
      L.fire = { x: cx - 40, y: FLOOR };
      L.target = { x: Math.min(W - 16, cx + 42), y: FLOOR };
    } else if (p.action === "travel") {
      L.hero = { x: cx - 4, y: FLOOR };
      L.wisp = { x: cx - 18, y: FLOOR - 26 };
    } else if (p.action === "sleep") {
      L.fire = { x: cx + 18, y: FLOOR };
      L.bedroll = { x: cx - 13, y: FLOOR - 2 };
      L.hero = { x: cx - 13 + POSES.lie.anchor[0], y: FLOOR - 1 };
    } else if (p.action === "meditate") {
      L.fire = { x: cx + 10, y: FLOOR };
      L.hero = { x: cx - 10, y: FLOOR };
    } else {
      L.fire = { x: cx + 10, y: FLOOR };
      L.hero = { x: cx - 12, y: FLOOR };
      L.seat = { x: cx - 18, y: FLOOR - 3 };
    }
    return L;
  }

  // --- Герой ---

  function heroPose(t) {
    const p = props;
    const pose = (name, rows, extra = {}) => ({ name, def: POSES[name], rows: rows || POSES[name].rows, ...extra });
    const breath = (name, period) => {
      const def = POSES[name];
      const out = Math.floor(t / period) % 2 === 1 && !reduced;
      return pose(name, out ? breathe(def.rows, def.breath) : def.rows, { breathOut: out });
    };
    const tempo = p.mood === "weak" ? 1.35 : p.mood === "strong" ? 0.8 : 1;
    switch (p.action) {
      case "sleep":
        return pose("lie");
      case "meditate":
        return breath("meditate", 2.2);
      case "read":
        return breath(p.mood === "weak" ? "sitWeak" : "read", 1.6 * tempo);
      case "travel": {
        const def = POSES.walk;
        const step = reduced ? 0 : Math.floor(t / (0.17 * tempo)) % 4;
        let rows = def.frames[step];
        // Усталость: голова опущена на пиксель — ссутулился в пути.
        if (p.mood === "weak") rows = breathe(rows, 9);
        return { name: "walk", def, rows, step };
      }
      case "train": {
        const cyc = t % 16;
        if (cyc < 10) {
          const shot = cyc % 2.5;
          return pose(shot > 0.8 && shot < 2.0 ? "archerDraw" : "archer", null, { bow: true, draw: shot > 0.8 && shot < 2.0 ? (shot - 0.8) / 1.2 : 0, shotIndex: Math.floor(t / 2.5) });
        }
        const k = Math.floor((cyc - 10) / 0.35) % 4;
        // Связка: замах — удар — возврат — укол.
        return pose(k === 0 ? "swordRaised" : "sword", null, { sword: true, swing: k });
      }
      default: {
        const name = p.mood === "weak" ? "sitWeak" : p.mood === "strong" ? "sitStrong" : "sit";
        return breath(name, (p.mood === "weak" ? 1.9 : p.mood === "strong" ? 1.2 : 1.5) * 1);
      }
    }
  }

  function gearKey() {
    const p = props;
    // Возраст целыми годами: седина между 50 и 70 нарастает постепенно.
    return `${p.whistle}|${Math.floor(p.age)}`;
  }

  function drawHero(c, L, hp, palette, gk, glowList) {
    const def = hp.def;
    const key = `${hp.name}|${hp.step ?? ""}|${hp.breathOut ? 1 : 0}|${props.mood}|${gk}`;
    const spr = compile(hp.rows, palette, key);
    const x = L.hero.x - def.anchor[0];
    const y = L.hero.y - def.anchor[1];
    // Контактная тень под героем.
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(x + 1, L.hero.y, spr.width - 2, 1);
    c.drawImage(spr, x, y);
    const glow = compile(hp.rows, palette, key, true);
    if (glow) glowList.push([glow, x, y]);
    return { x, y, w: spr.width, h: spr.height, spr, key };
  }

  function px(c, x, y, col) {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  // Лук рисуем линиями: тетива честно тянется к руке, при выстреле — прямая.
  function drawBow(c, hb, hp, palette) {
    const def = hp.def;
    const gx = hb.x + def.hand[0];
    const gy = hb.y + def.hand[1];
    const long = GEAR[props.whistle].longBow;
    const half = long ? 9 : 6;
    const bend = 2 + Math.round(hp.draw * 2);
    const wood = css(palette.y);
    const dark = css(palette.Y);
    const tips = [];
    for (let i = -half; i <= half; i++) {
      const u = i / half;
      const x = gx - Math.round(bend * u * u);
      px(c, x, gy + i, Math.abs(i) <= 1 ? dark : wood);
      if (Math.abs(i) === half) tips.push([x, gy + i]);
    }
    const string = css(palette.g);
    const hand = hp.draw > 0 ? [hb.x + def.pull[0], hb.y + def.pull[1]] : null;
    const line = (a, b) => {
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      for (let k = 0; k <= n; k++) px(c, mix(a[0], b[0], k / n), mix(a[1], b[1], k / n), string);
    };
    if (hand) {
      line(tips[0], hand);
      line(hand, tips[1]);
      // Стрела на тетиве.
      for (let x = hand[0]; x <= gx + 2; x++) px(c, x, hand[1] + (x > gx - 2 ? 1 : 0) * 0, x >= gx + 1 ? "#b8bcc8" : "#8a6a48");
      px(c, hand[0] - 1, hand[1] - 1, "#a33326");
    } else {
      line(tips[0], tips[1]);
    }
  }

  // Меч: клинок по углу из кадра связки; на ударе — бледный шлейф дуги.
  function drawSword(c, hb, hp) {
    const def = hp.def;
    const hx = hb.x + def.hand[0];
    const hy = hb.y + def.hand[1];
    const ANG = [-1.9, 0.35, 0.1, -0.05];
    const a = ANG[hp.swing];
    const len = 10;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    px(c, hx - dx * 2, hy - dy * 2, "#3a2820");
    px(c, hx - dx, hy - dy, "#3a2820");
    px(c, hx - dy * 1.5, hy + dx * 1.5, "#8a8e9c");
    px(c, hx + dy * 1.5, hy - dx * 1.5, "#8a8e9c");
    for (let k = 1; k <= len; k++) px(c, hx + dx * k, hy + dy * k, k === len ? "#e8ecf4" : k % 3 === 0 ? "#9aa0ae" : "#cdd2dc");
  }

  function swordTrail(c, hb, hp) {
    if (!hp.sword || hp.swing !== 1) return;
    const def = hp.def;
    const hx = hb.x + def.hand[0];
    const hy = hb.y + def.hand[1];
    c.fillStyle = "rgba(220,230,255,0.35)";
    for (let a = -1.8; a < 0.3; a += 0.12) {
      c.fillRect(Math.round(hx + Math.cos(a) * 10), Math.round(hy + Math.sin(a) * 10), 1, 1);
      c.fillRect(Math.round(hx + Math.cos(a) * 9), Math.round(hy + Math.sin(a) * 9), 1, 1);
    }
  }

  // --- Огонь ---

  function drawFlame(c, x0, base, level, t, wind) {
    const { h } = flameSize(level, props.streak);
    if (!h) return;
    const ramp = FIRE[level].ramp.map(hex);
    const d = flameImg.data;
    d.fill(0);
    const fw = 32;
    const cxf = 16;
    const halfW = h * 0.34;
    const tt = reduced ? Math.floor(t * 1.5) * 0.37 : t;
    for (let yy = 0; yy < Math.min(31, h + 4); yy++) {
      const u = yy / h;
      const width = halfW * (u < 0.2 ? 0.8 + u : Math.pow(Math.max(0, 1 - u), 0.85) * 1.15);
      const skew = wind * u * u * h * 0.55 + Math.sin(tt * 6 + u * 4) * u * 0.9;
      for (let xx = -12; xx <= 12; xx++) {
        const dx = xx - skew;
        const shape = 1 - Math.abs(dx) / Math.max(0.6, width);
        if (shape <= -0.3) continue;
        const n = noise2(xx * 0.42, (yy - tt * 16) * 0.3, 77) * 0.75 + noise2(xx * 0.9, (yy - tt * 22) * 0.6, 78) * 0.35;
        const heat = shape * 0.95 + (1 - u) * 0.55 - n * 0.7 - u * 0.25;
        let idx = -1;
        if (heat > 1.08) idx = 5;
        else if (heat > 0.86) idx = 4;
        else if (heat > 0.64) idx = 3;
        else if (heat > 0.44) idx = 2;
        else if (heat > 0.26) idx = 1;
        else if (heat > 0.12) idx = 0;
        if (idx < 0) continue;
        const X = cxf + xx;
        const Y = 31 - yy;
        if (X < 0 || X >= fw || Y < 0) continue;
        const i = (Y * fw + X) * 4;
        d[i] = ramp[idx][0];
        d[i + 1] = ramp[idx][1];
        d[i + 2] = ramp[idx][2];
        d[i + 3] = 255;
      }
    }
    flameCtx.putImageData(flameImg, 0, 0);
    c.drawImage(flameCanvas, x0 - cxf, base - 31);
  }

  function updateParticles(dt, L, wind) {
    const p = props;
    const fireOn = L.fire || L.wisp;
    if (fireOn) {
      const src = L.wisp || L.fire;
      const lvl = p.fire;
      const rate = [0.6, 2.2, 3, 4][lvl] * (L.wisp ? 0.4 : 1);
      if (r() < rate * dt * 3) {
        const top = L.wisp ? src.y : src.y - 3 - flameSize(lvl, p.streak).h * 0.5;
        sparks.push({ x: src.x + (r() - 0.5) * 5, y: top, vx: (r() - 0.5) * 6, vy: -mix(10, 22, r()), life: mix(0.8, 2, r()), c: r() < 0.6 ? 0 : 1 });
      }
      if (!L.wisp && r() < (lvl === 0 ? 1.4 : 0.6) * dt * 3) {
        smoke.push({ x: src.x + (r() - 0.5) * 3, y: src.y - 4 - flameSize(lvl, p.streak).h * 0.7, life: 0, max: mix(2.5, 4.5, r()) });
      }
    }
    for (const s of sparks) {
      s.life -= dt;
      s.x += (s.vx + wind * 30) * dt;
      s.y += s.vy * dt;
      s.vx += (r() - 0.5) * 20 * dt;
    }
    for (const s of smoke) {
      s.life += dt;
      s.y -= 6 * dt;
      s.x += (wind * 14 + Math.sin(s.life * 2) * 1.5) * dt;
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0 || sparks.length > 40) sparks.splice(i, 1);
    for (let i = smoke.length - 1; i >= 0; i--) if (smoke[i].life > smoke[i].max) smoke.splice(i, 1);

    // Пылинки ауры поднимаются вокруг героя и гаснут.
    const a = AURA[auraLevel()];
    const want = a ? a.motes : 0;
    if (motes.length < want && r() < dt * 6) {
      const ang = r() * Math.PI * 2;
      const rad = mix(3, a.r * 0.7, r());
      motes.push({ x: L.hero.x + 2 + Math.cos(ang) * rad, y: L.hero.y - 9 + Math.sin(ang) * rad * 0.7, life: 0, max: mix(1.4, 3, r()), sp: mix(3, 7, r()), ph: r() * 6 });
    }
    for (const m of motes) {
      m.life += dt;
      m.y -= m.sp * dt;
      m.x += Math.sin(m.life * 2 + m.ph) * 2 * dt;
    }
    for (let i = motes.length - 1; i >= 0; i--) if (motes[i].life > motes[i].max || motes.length > want + 2) motes.splice(i, 1);

    for (const ar of arrows) ar.x += 170 * dt;
    for (let i = arrows.length - 1; i >= 0; i--) {
      if (L.target && arrows[i].x >= L.target.x - 3) {
        stuck.push({ dx: -3 - Math.floor(r() * 2), dy: arrows[i].y - (L.target.y - 9) });
        if (stuck.length > 5) stuck = stuck.slice(-3);
        arrows.splice(i, 1);
      } else if (arrows[i].x > W + 5) arrows.splice(i, 1);
    }
  }

  function auraLevel() {
    // Медитация всегда даёт хотя бы слабое свечение — так задумано действием.
    return props.action === "meditate" ? Math.max(1, props.aura) : props.aura;
  }

  // --- Кадр ---

  function step(dt) {
    ensure();
    const p = props;
    time += dt;
    // Без анимации частицы стоят на месте (и молния не бьёт — вспышки для
    // тех, кто просил покоя, хуже всего). Время идёт только ради мерцания огня.
    const pdt = reduced ? 0 : dt;
    if (p.action === "travel") scroll += pdt * (p.mood === "weak" ? 9 : p.mood === "strong" ? 15 : 12);
    const wind = p.weather.wind * p.weather.dir;
    weather.update(pdt, { W, ...p.weather, season: sol.season, night: st.night });
    updateParticles(pdt, layout, wind);
  }

  function draw() {
    ensure();
    const p = props;
    const L = layout;
    const t = time;
    const wind = p.weather.wind * p.weather.dir;
    const travel = p.action === "travel";

    // 1. Задник.
    backCtx.drawImage(skyCanvas, 0, 0);
    drawStars(backCtx, stars, t, st.starAlpha, reduced);
    drawClouds(backCtx, clouds, W, reduced ? 0 : t, p.weather.wind, 1 - st.night * 0.35);
    weather.drawBolt(backCtx);
    const fogLum = (st.ambient[0] + st.ambient[1] + st.ambient[2]) / 3;
    const fogBase = mixRgb(st.haze, [200, 205, 215], 0.25 * (1 - st.night));
    // Густой туман — светлая пелена даже ночью: он рассеивает лунный свет.
    const fogColor = p.weather.kind === "fog" ? mixRgb(fogBase, [170, 178, 196].map((v) => v * Math.min(1, fogLum + 0.25)), 0.55) : fogBase;
    const fogCfg = { ...p.weather, fogColor };
    const scrollX = travel ? scroll : 0;
    backLayers.forEach((l, i) => {
      // Каждому месту — свой «кадр» хребта: сдвиг подобран, чтобы в проёме
      // пещеры оказалась вершина, а не седловина.
      const off = ((Math.floor(scrollX * l.speed + 60 + i * 37) % PERIOD) + PERIOD) % PERIOD;
      backCtx.drawImage(l.lit, -off, 0);
      if (PERIOD - off < W) backCtx.drawImage(l.lit, PERIOD - off, 0);
      if (i < 2) weather.drawFog(backCtx, W, reduced ? 0 : t, fogCfg, i);
    });

    // 2. Ближний план без света.
    nearCtx.clearRect(0, 0, W, H);
    let ao = null;
    let reach = null;
    let tufts;
    let tuftOff = 0;
    if (travel) {
      const off = ((Math.floor(scrollX) % PERIOD) + PERIOD) % PERIOD;
      nearCtx.drawImage(strip.canvas, -off, 0);
      if (PERIOD - off < W) nearCtx.drawImage(strip.canvas, PERIOD - off, 0);
      tufts = strip.tufts;
      tuftOff = off;
    } else {
      nearCtx.drawImage(nearScene.canvas, 0, 0);
      ao = nearScene.ao;
      reach = nearScene.reach;
      tufts = nearScene.tufts;
    }
    drawTufts(nearCtx, tufts, tuftOff, t, wind, travel ? PERIOD : 0);

    const gk = gearKey();
    if (gk !== paletteKey) {
      palette = heroPalette(p.whistle, p.age);
      paletteKey = gk;
    }
    const glowList = [];
    if (L.seat) nearCtx.drawImage(compile(PROPS.log, pal, "log"), L.seat.x, L.seat.y);
    if (L.bedroll) nearCtx.drawImage(compile(PROPS.bedroll, pal, "bedroll"), L.bedroll.x, L.bedroll.y);
    if (L.fire) {
      const ember = p.fire === 0;
      nearCtx.fillStyle = "rgba(0,0,0,0.3)";
      nearCtx.fillRect(L.fire.x - 7, L.fire.y, 15, 1);
      nearCtx.drawImage(compile(ember ? PROPS.embers : PROPS.campfire, pal, ember ? "embers" : "campfire"), L.fire.x - 6, L.fire.y - 4);
    }
    if (L.target) drawTarget(nearCtx, L.target);
    // В покое герой замирает в одной позе (у лучника — с натянутым луком).
    const hp = heroPose(reduced ? 1.5 : t);
    const hb = drawHero(nearCtx, L, hp, palette, gk, glowList);
    if (hp.bow) drawBow(nearCtx, hb, hp, palette);
    if (hp.sword) drawSword(nearCtx, hb, hp);
    if (p.action === "read") drawBook(nearCtx, hb, hp, t);
    if (hp.bow && hp.draw === 0 && hp.shotIndex !== lastShot && t % 2.5 > 2.0 && !reduced) {
      lastShot = hp.shotIndex;
      arrows.push({ x: hb.x + hp.def.hand[0] + 2, y: hb.y + hp.def.hand[1] });
    }
    for (const ar of arrows) drawArrow(nearCtx, ar.x, ar.y);

    // 3. Свет.
    light(L, ao, reach, t, hb);

    // 4. Светящееся поверх.
    if (L.fire) {
      if (p.fire > 0) drawFlame(ctx, L.fire.x, L.fire.y - 2, p.fire, t, wind);
      else drawEmbers(ctx, L.fire, t);
    }
    if (L.wisp) drawWisp(ctx, L, t);
    for (const [g, x, y] of glowList) {
      ctx.globalAlpha = 0.3 + (reduced ? 0 : 0.15 * Math.sin(t * 3));
      ctx.drawImage(g, x - 1, y);
      ctx.drawImage(g, x + 1, y);
      ctx.drawImage(g, x, y - 1);
      ctx.drawImage(g, x, y + 1);
      ctx.globalAlpha = 1;
      ctx.drawImage(g, x, y);
    }
    drawAuraOutline(ctx, hb, t);
    drawSparks(ctx);
    drawSmoke(ctx);
    drawMotes(ctx, L, t);
    swordTrail(ctx, hb, hp);

    // Погода — в пещере только снаружи свода.
    const front = { ...p.weather, season: sol.season, ambient: st.ambient };
    const mask = !travel && nearScene.maskCanvas;
    if (mask) {
      fxCtx.clearRect(0, 0, W, H);
      weather.drawFront(fxCtx, W, t, front);
      fxCtx.globalCompositeOperation = "destination-in";
      fxCtx.drawImage(mask, 0, 0);
      fxCtx.globalCompositeOperation = "source-over";
      ctx.drawImage(fx, 0, 0);
    } else {
      weather.drawFront(ctx, W, t, front);
    }
    weather.drawFog(ctx, W, reduced ? 0 : t, fogCfg, 2);
    if (p.location === "forest" && !travel) drawRays(ctx, t);
    const flash = weather.state.flash;
    if (flash > 0) {
      ctx.fillStyle = `rgba(210,215,255,${flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawTufts(c, tufts, off, t, wind, period) {
    for (const tf of tufts) {
      let x = tf.x - off;
      if (period) {
        if (x < -2) x += period;
        if (x > W + 2) continue;
      }
      const sway = reduced ? 0 : Math.sin(t * 1.8 + tf.ph + tf.x * 0.1) * (0.4 + Math.abs(wind) * 0.8);
      const bend = wind * 1.6 + sway;
      c.fillStyle = css(tf.c);
      for (let k = 0; k < tf.h; k++) {
        const bx = Math.round((bend * (k + 1)) / (tf.h + 1));
        c.fillRect(x + bx, tf.y - k - 1, 1, 1);
      }
    }
  }

  function drawTarget(c, T) {
    const spr = compile(PROPS.target, pal, "target");
    const x = T.x - 4;
    const y = T.y - spr.height + 1;
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.fillRect(x, T.y + 1, spr.width, 1);
    c.drawImage(spr, x, y);
    for (const s of stuck) drawArrowStuck(c, x + 4 + s.dx, T.y - 9 + Math.round(clamp(s.dy, -3, 3)));
  }

  function drawArrow(c, x, y) {
    x = Math.round(x);
    c.fillStyle = "#8a6a48";
    c.fillRect(x - 4, y, 4, 1);
    c.fillStyle = "#c8ccd6";
    c.fillRect(x, y, 1, 1);
    c.fillStyle = "#a33326";
    c.fillRect(x - 5, y - 1, 1, 1);
    c.fillRect(x - 5, y + 1, 1, 1);
  }

  function drawArrowStuck(c, x, y) {
    c.fillStyle = "#8a6a48";
    c.fillRect(x - 3, y, 3, 1);
    c.fillStyle = "#a33326";
    c.fillRect(x - 4, y - 1, 1, 1);
  }

  function drawBook(c, hb, hp, t) {
    const def = POSES.read;
    const frame = reduced ? 0 : Math.floor(t / 0.25) % 28 === 1 ? 1 : Math.floor(t / 0.25) % 28 === 2 ? 2 : 0;
    const spr = compile(PROPS.book[frame], pal, `book${frame}`);
    const hand = hp.name === "read" ? def.hand : [11, 11];
    c.drawImage(spr, hb.x + hand[0] - 3, hb.y + hand[1] - 2);
  }

  function drawEmbers(c, F, t) {
    // Угли дышат: пиксели вспыхивают и гаснут вразнобой.
    const ramp = FIRE[0].ramp;
    for (let i = 0; i < 9; i++) {
      const x = F.x - 4 + ((i * 5) % 9);
      const y = F.y - 1 - (i % 3 === 0 ? 1 : 0);
      const v = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t * (1.3 + (i % 4) * 0.4) + i * 2.1);
      c.fillStyle = ramp[Math.min(5, 1 + Math.floor(v * 4))];
      c.fillRect(x, y, 1, 1);
    }
  }

  function drawWisp(c, L, t) {
    const lvl = props.fire;
    const f = WISP_FRAMES[reduced ? 0 : Math.floor(t * 8) % 4];
    const ramp = FIRE[lvl].ramp;
    const bob = reduced ? 0 : Math.round(Math.sin(t * 2.2) * 2);
    const x0 = L.wisp.x - 2;
    const y0 = L.wisp.y + bob - 3;
    for (let y = 0; y < f.length; y++) {
      for (let x = 0; x < f[y].length; x++) {
        const ch = f[y][x];
        if (ch === ".") continue;
        // У погасшего стрика огонёк — тусклый уголёк, без белой сердцевины.
        let idx = 5 - Number(ch);
        if (lvl === 0) idx = Math.max(0, idx - 2);
        c.fillStyle = ramp[idx];
        c.fillRect(x0 + x, y0 + y, 1, 1);
      }
    }
  }

  // Пиксельный контур свечения вокруг силуэта — со второго уровня ауры.
  // Это главный признак ауры: читается даже днём, когда ореол почти не виден.
  function drawAuraOutline(c, hb, t) {
    const lvl = auraLevel();
    if (lvl < 2) return;
    const A = AURA[lvl];
    const pulse = reduced ? 0.75 : 0.6 + 0.4 * Math.sin(t * 2.1);
    const tk = `${hb.key}|${lvl}`;
    if (!auraTint || auraTint.key !== tk) {
      const ol = outline(hb.spr, hb.key);
      const tc = makeCanvas(ol.width, ol.height);
      const tctx = tc.getContext("2d");
      tctx.drawImage(ol, 0, 0);
      tctx.globalCompositeOperation = "source-in";
      tctx.fillStyle = css(mixRgb(A.col.map((v) => v * 255), [255, 255, 255], 0.25));
      tctx.fillRect(0, 0, tc.width, tc.height);
      auraTint = { key: tk, canvas: tc };
    }
    c.globalAlpha = Math.min(1, (0.3 + lvl * 0.12) * pulse);
    c.drawImage(auraTint.canvas, hb.x - 1, hb.y - 1);
    c.globalAlpha = 1;
  }

  function drawSparks(c) {
    const ramp = FIRE[props.fire].spark;
    for (const s of sparks) {
      c.globalAlpha = clamp(s.life * 1.5);
      c.fillStyle = ramp[s.c];
      c.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    c.globalAlpha = 1;
  }

  function drawSmoke(c) {
    const amb = st.ambient;
    const col = [110 * amb[0] + 20, 110 * amb[1] + 20, 115 * amb[2] + 24];
    for (const s of smoke) {
      const k = s.life / s.max;
      const a = (1 - k) * 0.28 * (props.fire === 0 ? 1.4 : 1);
      const size = 1 + Math.floor(k * 3);
      c.fillStyle = css(col, a);
      c.fillRect(Math.round(s.x - size / 2), Math.round(s.y), size, size > 2 ? 2 : 1);
    }
  }

  function drawMotes(c, L, t) {
    const lvl = auraLevel();
    const a = AURA[lvl];
    if (!a) return;
    const col = a.col.map((v) => v * 255);
    for (const m of motes) {
      const k = m.life / m.max;
      const alpha = Math.sin(k * Math.PI) * (reduced ? 0.6 : 1);
      c.fillStyle = css(mixRgb(col, [255, 255, 255], 0.4), alpha);
      const x = Math.round(m.x);
      const y = Math.round(m.y);
      c.fillRect(x, y, 1, 1);
      // На высоких уровнях часть пылинок — «крестики»-искры.
      if (lvl >= 3 && (m.ph > 4.5) && alpha > 0.5) {
        c.fillStyle = css(col, alpha * 0.45);
        c.fillRect(x - 1, y, 1, 1);
        c.fillRect(x + 1, y, 1, 1);
        c.fillRect(x, y - 1, 1, 1);
        c.fillRect(x, y + 1, 1, 1);
      }
    }
    // Четвёртый уровень: столб света над героем — сплошные полосы с плавным
    // затуханием вверх (дизеринг здесь давал шахматку, а не сияние).
    if (lvl === 4) {
      const pulse = reduced ? 0.8 : 0.65 + 0.35 * Math.sin(t * 1.6);
      const x0 = L.hero.x + 1;
      const top = L.hero.y - 40;
      for (let y = top; y < L.hero.y - 8; y++) {
        const k = (y - top) / (L.hero.y - 8 - top);
        const fade = Math.pow(k, 1.4) * pulse;
        c.fillStyle = css(col, 0.42 * fade);
        c.fillRect(x0, y, 2, 1);
        c.fillStyle = css(col, 0.18 * fade);
        c.fillRect(x0 - 2, y, 2, 1);
        c.fillRect(x0 + 2, y, 2, 1);
      }
    }
  }

  // Лучи сквозь крону в лесу днём: широкие полосы, каждая строка сдвинута на
  // пиксель-другой — край луча получается «лесенкой», как в пиксель-арте.
  function drawRays(c, t) {
    const day = clamp(st.e / 0.25) * (1 - st.overcast);
    if (day < 0.1) return;
    const sun = mixRgb(st.sun, [255, 250, 230], 0.4);
    for (let i = 0; i < 3; i++) {
      const x0 = W * (0.22 + i * 0.24);
      const width = 5 + i * 2;
      const a = day * (0.07 + 0.025 * Math.sin((reduced ? 0 : t) * 0.6 + i * 2));
      for (let y = 4; y < FLOOR + 4; y++) {
        const fade = y < 14 ? (y - 4) / 10 : 1 - (y - 14) / (FLOOR - 10) * 0.6;
        c.fillStyle = css(sun, a * fade);
        c.fillRect(Math.round(x0 + (y - 4) * 0.4), y, width, 1);
      }
    }
  }

  // --- Попиксельный свет ---

  function light(L, ao, reach, t, hb) {
    const p = props;
    const b = backCtx.getImageData(0, 0, W, H).data;
    const n = nearCtx.getImageData(0, 0, W, H).data;
    const o = out.data;
    const flash = weather.state.flash;
    const amb = st.ambient.map((v) => v + flash * 0.9);
    const ambLum = (amb[0] + amb[1] + amb[2]) / 3;

    // Костёр (или огонёк в пути).
    const src = L.fire || L.wisp;
    let fxp = 0;
    let fyp = 0;
    let fR = 1;
    let fI = 0;
    let fc = [0, 0, 0];
    if (src) {
      const lvl = p.fire;
      const { h, grow } = flameSize(lvl, p.streak);
      fxp = src.x;
      fyp = L.wisp ? src.y : src.y - 3 - h * 0.35;
      const flick = reduced ? 0.95 : 0.84 + 0.16 * noise1(t * 7, 1000, 3) + 0.05 * Math.sin(t * 23);
      // В пещере свет отражается от стен и бьёт дальше, чем в чистом поле.
      const cave = p.location === "cave" && !L.wisp ? 1.4 : 1;
      fR = (lvl === 0 ? 34 : 58 + lvl * 4 + grow * 2) * (L.wisp ? 0.55 : 1) * cave;
      fI = (lvl === 0 ? 1.15 : 1.6 + lvl * 0.05) * flick * (L.wisp ? 0.7 : 1);
      fc = FIRE[lvl].light;
    }
    const inCave = p.location === "cave" && !L.wisp;
    const fallK = inCave ? 1.5 : 1.7;
    // В пещере свод над костром близко, хоть на экране до него и далеко:
    // вертикаль считаем короче, иначе потолок остаётся чёрным.
    const fyK = inCave ? 0.75 : 1.3;
    // Отражённый свет: замкнутая пещера вся чуть подсвечена огнём.
    const bounce = inCave ? 0.2 * fI : 0;
    // Днём на открытом месте костёр почти не заметен: так и задумано, но
    // в пещере ao низкий — и огонь снова главный источник.
    const fireDay = 1 - clamp(ambLum - 0.35) * 0.7;
    const bloomI = 0.32 * (0.4 + st.night * 0.6) * (p.fire === 0 ? 0.6 : 1);

    const lv = auraLevel();
    const A = AURA[lv];
    const ax = hb.x + hb.w / 2;
    const ay = hb.y + hb.h * 0.45;
    const pulse = reduced ? 1 : 0.82 + 0.18 * Math.sin(t * 2.1);
    const aR = A ? A.r * (0.95 + 0.05 * pulse) : 1;
    const aI = A ? A.i * pulse : 0;
    const ac = A ? A.col : [0, 0, 0];

    // Таблицы спада по квадрату расстояния: без sqrt и pow на каждый пиксель.
    // u = d²/R², индекс — u·LUT_N. Свет, свечение воздуха и ореол ауры.
    for (let k = 0; k <= LUT_N; k++) {
      const d = Math.sqrt(k / LUT_N);
      lutFire[k] = Math.pow(1 - d, fallK) * fI;
      const bk = d < 0.6 ? 1 - d / 0.6 : 0;
      lutBloom[k] = bk * bk * bk * bloomI * fireDay * 10;
      lutAura[k] = (1 - d) * aI;
      const ring = d < 0.45 ? 0.35 + d * 1.4 : (1 - d) / 0.55;
      lutRing[k] = ring * ring * aI * 0.42 * 8;
    }
    const fR2 = fR * fR;
    const aR2 = aR * aR;
    const Q = 7;
    const ar0 = ac[0] * 0.35;
    const ag0 = ac[1] * 0.35;
    const ab0 = ac[2] * 0.35;
    for (let y = 0; y < H; y++) {
      const fdy = (y - fyp) * fyK;
      const fdy2 = fdy * fdy;
      const ady = (y - ay) * 1.15;
      const ady2 = ady * ady;
      const brow = (y & 3) * 4;
      for (let x = 0; x < W; x++) {
        const j = y * W + x;
        const i = j * 4;
        const th = BAYER[brow + (x & 3)];
        let fu = -1;
        if (fI > 0) {
          const dx = x - fxp;
          const d2 = dx * dx + fdy2;
          if (d2 < fR2) fu = ((d2 / fR2) * LUT_N) | 0;
        }
        let au = -1;
        if (aI > 0) {
          const dx = x - ax;
          const d2 = dx * dx + ady2;
          if (d2 < aR2) au = ((d2 / aR2) * LUT_N) | 0;
        }
        let rr;
        let gg;
        let bb;
        const na = n[i + 3];
        if (na > 0) {
          const a = ao ? ao[j] : 1;
          const fl = fu >= 0 ? lutFire[fu] : 0;
          const depth = reach && na === 255 ? reach[j] : 1;
          const fk = fl * depth * (a < 0.6 ? 1 : fireDay) + (a < 0.7 ? bounce : 0);
          const al = au >= 0 ? lutAura[au] : 0;
          // Спрайтам (альфа 254) — небольшая добавка света: героя должно быть
          // видно и у погасшего костра, иначе слабый день читается как пустой кадр.
          const lift = na === 254 ? 0.2 : 0;
          // Ступени света с дизерингом: кольца от костра — «пиксельные».
          let lr = Math.floor((amb[0] * a + fk * fc[0] + al * ar0 + lift) * Q + th) / Q;
          let lg = Math.floor((amb[1] * a + fk * fc[1] + al * ag0 + lift) * Q + th) / Q;
          let lb = Math.floor((amb[2] * a + fk * fc[2] + al * ab0 + lift * 1.2) * Q + th) / Q;
          if (lr > 1.6) lr = 1.6;
          if (lg > 1.6) lg = 1.6;
          if (lb > 1.6) lb = 1.6;
          rr = n[i] * lr;
          gg = n[i + 1] * lg;
          bb = n[i + 2] * lb;
        } else {
          rr = b[i];
          gg = b[i + 1];
          bb = b[i + 2];
        }
        // Свечение воздуха вокруг огня.
        if (fu >= 0) {
          const gl = Math.floor(lutBloom[fu] + th) / 10;
          if (gl > 0) {
            rr += fc[0] * 255 * gl;
            gg += fc[1] * 255 * gl;
            bb += fc[2] * 255 * gl;
          }
        }
        // Ореол ауры — кольцо, а не пятно: максимум на середине радиуса,
        // в центре слабее, чтобы свечение не заливало самого героя.
        if (au >= 0) {
          const gl = Math.floor(lutRing[au] + th) / 8;
          if (gl > 0) {
            rr += ac[0] * 255 * gl;
            gg += ac[1] * 255 * gl;
            bb += ac[2] * 255 * gl;
          }
        }
        // Вигнетка и лёгкий грейдинг: чуть приглушаем цвет, тени уходят в синий.
        const v = vignette[j];
        const lum = (rr * 0.3 + gg * 0.55 + bb * 0.15) * 0.1;
        o[i] = (rr * 0.9 + lum) * v + 4;
        o[i + 1] = (gg * 0.9 + lum) * v + 5;
        o[i + 2] = (bb * 0.9 + lum) * v + 10;
        o[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  function onThunder(cb) {
    thunderCb = cb;
  }

  // Состояние для звука: что сейчас слышно в сцене.
  function soundState() {
    const p = props;
    return {
      fire: p.action === "travel" ? -1 : p.fire,
      kind: p.weather.kind,
      wind: p.weather.wind,
      intensity: p.weather.intensity,
      indoor: p.location === "cave" && p.action !== "travel",
    };
  }

  return {
    resize,
    setProps,
    step,
    draw,
    onThunder,
    soundState,
    get width() {
      return W;
    },
  };
}

export { H as HEIGHT };
