import { rng, noise1, bayer, clamp, mix, mixRgb, css, makeCanvas } from "./noise.js";
import { H, HORIZON } from "./terrain.js";
import { makeBolt } from "./sky.js";

// Погода и мелкая жизнь сцены: дождь, снег, листья, светлячки, туман, молнии.
// Частиц немного и все они — прямоугольники 1×1: сцена живёт весь день,
// и на слабом ноутбуке она не должна быть заметна в диспетчере задач.

const FOG_W = 256;
const FOG_H = 22;

// Туман — полосы с постеризованной прозрачностью: четыре ступени плотности,
// дизеринг только на стыке ступеней. Чистый дизеринг 50 % читался как
// шахматная доска, а гладкая заливка — как мыльная плёнка.
function fogTexture(seed, density) {
  const c = makeCanvas(FOG_W, FOG_H);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(FOG_W, FOG_H);
  for (let y = 0; y < FOG_H; y++) {
    const fy = Math.sin((y / (FOG_H - 1)) * Math.PI);
    for (let x = 0; x < FOG_W; x++) {
      const n = noise1(x / 16 + y * 0.04, FOG_W / 16, seed) * 0.6 + noise1(x / 8, FOG_W / 8, seed + 1) * 0.4;
      const v = clamp(fy * (0.2 + n) * density);
      const q = Math.floor(v * 4 + (bayer(x, y) - 0.5) * 0.6) / 4;
      if (q <= 0) continue;
      const i = (y * FOG_W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(clamp(q) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tinted(tex, color) {
  const c = makeCanvas(tex.width, tex.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(tex, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = css(color);
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export function createWeather(seed = 1) {
  const r = rng(seed);
  const s = {
    drops: [],
    flakes: [],
    leaves: [],
    flies: [],
    splashes: [],
    fogTex: [fogTexture(seed, 0.9), fogTexture(seed + 5, 1.2)],
    fogTint: null,
    fogKey: "",
    bolt: null,
    boltLife: 0,
    flash: 0,
    nextBolt: 4 + r() * 6,
    onThunder: null,
  };

  function spawnDrop(W, top) {
    return { x: r() * (W + 40) - 20, y: top ? -r() * 20 : r() * H, z: mix(HORIZON + 4, H, Math.pow(r(), 0.7)), len: 3 + Math.floor(r() * 3) };
  }

  function spawnFlake(W, top) {
    return { x: r() * (W + 40) - 20, y: top ? -2 : r() * H, z: mix(HORIZON + 4, H, r()), ph: r() * 6, big: r() < 0.18, sp: mix(12, 26, r()) };
  }

  function spawnLeaf(W, dir, fromSide) {
    return {
      x: fromSide ? (dir > 0 ? -4 : W + 4) : r() * W,
      y: mix(10, H - 10, r()),
      ph: r() * 6,
      c: Math.floor(r() * 4),
      sp: mix(0.6, 1.4, r()),
    };
  }

  // cfg: { kind, wind, dir, intensity, season, night, W }
  function update(dt, cfg) {
    const { W, kind, wind, dir } = cfg;
    const push = wind * dir;
    const rain = kind === "rain" || kind === "storm" ? cfg.intensity : 0;
    const snow = kind === "snow" ? cfg.intensity : 0;

    const wantDrops = Math.round(rain * 110);
    while (s.drops.length < wantDrops) s.drops.push(spawnDrop(W, false));
    if (s.drops.length > wantDrops) s.drops.length = wantDrops;
    for (const d of s.drops) {
      d.y += 150 * dt;
      d.x += push * 70 * dt;
      if (d.y >= d.z) {
        if (s.splashes.length < 40) s.splashes.push({ x: Math.round(d.x), y: Math.round(d.z), life: 2 });
        Object.assign(d, spawnDrop(W, true));
      }
    }
    for (const sp of s.splashes) sp.life--;
    s.splashes = s.splashes.filter((sp) => sp.life > 0);

    const wantFlakes = Math.round(snow * 90);
    while (s.flakes.length < wantFlakes) s.flakes.push(spawnFlake(W, false));
    if (s.flakes.length > wantFlakes) s.flakes.length = wantFlakes;
    for (const f of s.flakes) {
      f.ph += dt * 2;
      f.y += f.sp * dt * (f.big ? 1.3 : 1);
      f.x += (push * 40 + Math.sin(f.ph) * 6) * dt;
      if (f.y >= f.z || f.x < -25 || f.x > W + 25) Object.assign(f, spawnFlake(W, true));
    }

    // Листья — осенью всегда немного, на ветру больше; весной лепестки.
    const leafy = cfg.season === "autumn" || cfg.season === "spring";
    const wantLeaves = leafy ? Math.round(3 + wind * 12) : 0;
    while (s.leaves.length < wantLeaves) s.leaves.push(spawnLeaf(W, dir || 1, false));
    if (s.leaves.length > wantLeaves) s.leaves.length = wantLeaves;
    for (const l of s.leaves) {
      l.ph += dt * 3 * l.sp;
      l.x += ((dir || 1) * (6 + wind * 45) * l.sp + Math.sin(l.ph) * 5) * dt;
      l.y += (7 + Math.cos(l.ph * 1.3) * 9) * dt;
      if (l.x < -8 || l.x > W + 8 || l.y > H) Object.assign(l, spawnLeaf(W, dir || 1, true));
    }

    // Светлячки — тёплыми ночами без дождя.
    const flies = (cfg.season === "summer" || cfg.season === "spring") && cfg.night > 0.5 && !rain ? 9 : 0;
    while (s.flies.length < flies) s.flies.push({ x: r() * W, y: mix(HORIZON, H - 8, r()), ph: r() * 6, bl: r() * 6 });
    if (s.flies.length > flies) s.flies.length = flies;
    for (const f of s.flies) {
      f.ph += dt * 0.8;
      f.bl += dt * 1.7;
      f.x += Math.cos(f.ph * 1.3) * 4 * dt;
      f.y += Math.sin(f.ph) * 3 * dt;
    }

    // Гроза: удар раз в 6–16 с, вспышка гаснет за пару кадров, гром — с задержкой.
    if (kind === "storm") {
      s.nextBolt -= dt;
      if (s.nextBolt <= 0) {
        s.bolt = makeBolt(W, HORIZON, Math.floor(r() * 1e6));
        s.boltLife = 2;
        s.flash = 1;
        s.nextBolt = 6 + r() * 10;
        if (s.onThunder) s.onThunder(0.4 + r() * 1.6);
      }
    }
    if (s.boltLife > 0) s.boltLife--;
    s.flash *= 0.45;
    if (s.flash < 0.03) s.flash = 0;
  }

  function drawBolt(ctx) {
    if (!s.bolt || s.boltLife <= 0) return;
    ctx.fillStyle = s.boltLife > 1 ? "#f4f0ff" : "#a8a0e0";
    for (const [x, y] of s.bolt) ctx.fillRect(x, y, 1, 1);
  }

  // Полосы тумана. Цвет — от горизонта, поэтому ночью туман синий, на закате
  // розоватый; пересобирается вместе с небом.
  function drawFog(ctx, W, t, cfg, layer) {
    const kind = cfg.kind;
    const key = cfg.fogColor.map(Math.round).join(",");
    if (key !== s.fogKey) {
      s.fogTint = s.fogTex.map((tex) => tinted(tex, cfg.fogColor));
      s.fogKey = key;
    }
    const thick = kind === "fog" ? 1 : kind === "rain" || kind === "storm" || kind === "snow" ? 0.55 : 0.32;
    const drift = t * (2 + cfg.wind * 10) * (cfg.dir || 1);
    const band = (tex, y, alpha, speed) => {
      const off = ((((drift * speed) % FOG_W) + FOG_W) % FOG_W) | 0;
      ctx.globalAlpha = alpha;
      for (let x = -off; x < W; x += FOG_W) ctx.drawImage(tex, x, y);
    };
    if (layer === 0) band(s.fogTint[0], HORIZON - 16, 0.7 * thick, 0.4);
    if (layer === 1) band(s.fogTint[1], HORIZON - 6, 0.9 * thick, 0.7);
    if (layer === 1 && kind === "fog") band(s.fogTint[0], HORIZON + 4, 0.55, 1.1);
    if (layer === 2 && kind === "fog") band(s.fogTint[1], H - 13, 0.3, 1.6);
    ctx.globalAlpha = 1;
  }

  function drawFront(ctx, W, t, cfg) {
    const amb = cfg.ambient;
    const lum = clamp((amb[0] + amb[1] + amb[2]) / 3, 0.25, 1.1);
    if (s.drops.length) {
      const c = mixRgb([150, 165, 195], [200, 210, 230], lum - 0.25);
      ctx.fillStyle = css(c, 0.55);
      const slope = (cfg.wind * (cfg.dir || 1) * 70) / 150;
      for (const d of s.drops) {
        for (let k = 0; k < d.len; k++) ctx.fillRect(Math.round(d.x - slope * k), Math.round(d.y - k), 1, 1);
      }
      ctx.fillStyle = css(c, 0.7);
      for (const sp of s.splashes) {
        ctx.fillRect(sp.x - 1, sp.y - 1, 1, 1);
        ctx.fillRect(sp.x + 1, sp.y - 1, 1, 1);
      }
    }
    if (s.flakes.length) {
      const c = mixRgb([170, 180, 205], [245, 248, 255], lum - 0.2);
      ctx.fillStyle = css(c, 0.9);
      for (const f of s.flakes) {
        ctx.fillRect(Math.round(f.x), Math.round(f.y), f.big ? 2 : 1, 1);
        if (f.big) ctx.fillRect(Math.round(f.x), Math.round(f.y) + 1, 1, 1);
      }
    }
    if (s.leaves.length) {
      const cols = cfg.season === "spring" ? ["#e8d8e8", "#f0e6f0", "#d8c0d8", "#ffffff"] : ["#c1440e", "#e07b39", "#d9a441", "#8c5a2b"];
      for (const l of s.leaves) {
        const c = mixRgb(hexish(cols[l.c]), [20, 20, 30], 1 - lum);
        ctx.fillStyle = css(c);
        const flat = Math.sin(l.ph) > 0;
        ctx.fillRect(Math.round(l.x), Math.round(l.y), flat ? 2 : 1, 1);
      }
    }
    for (const f of s.flies) {
      const a = clamp(Math.sin(f.bl) * 1.4);
      if (a <= 0.05) continue;
      ctx.fillStyle = `rgba(215,255,120,${a})`;
      ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
      ctx.fillStyle = `rgba(160,220,90,${a * 0.3})`;
      ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y), 3, 1);
      ctx.fillRect(Math.round(f.x), Math.round(f.y) - 1, 1, 3);
    }
  }

  return { state: s, update, drawBolt, drawFog, drawFront, set onThunder(fn) { s.onThunder = fn; } };
}

function hexish(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
