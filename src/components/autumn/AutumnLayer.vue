<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import {
  autumnLevel,
  cycleAutumn,
  AUTUMN_LABELS,
  AUTUMN_COLORS,
} from "@/composables/useAutumn.js";
import { sky, ensureWeather } from "@/composables/useWeather.js";

// Листопад на весь сайт. Рисуем в canvas, а не сотней DOM-узлов с анимациями:
// тридцать листьев в CSS — это тридцать композитных слоёв на каждом экране,
// а тут один слой и один requestAnimationFrame, который встаёт на паузу,
// когда вкладка не видна.
//
// Ветер и дождь берутся из настоящей погоды в точке пользователя
// (composables/useWeather.js): за окном льёт — льёт и на сайте.

const canvas = ref(null);
const on = computed(() => autumnLevel.value > 0);

// Тем, кто просил систему не дёргать анимациями, оставляем только тыквы и
// тёплый свет — падать ничего не будет.
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let ctx = null;
let raf = 0;
let last = 0;
let width = 0;
let height = 0;
let leaves = [];
let fallen = [];
let drops = [];
let splashes = [];

// --- Форма листа ---

// Листья заданы половинкой контура (x ≥ 0, y вверх, черешок внизу) и
// зеркалятся. Первая попытка была параметрической — радиус, промодулированный
// косинусом, — и давала ровную пятилучевую звезду: цветок, а не лист.
// Настоящий лист несимметричен по вертикали, у него есть черешок и остриё.
const MAPLE_HALF = [
  [0.0, 1.0],
  [0.12, 0.52],
  [0.32, 0.6],
  [0.25, 0.34],
  [0.6, 0.46],
  [0.48, 0.22],
  [0.7, 0.14],
  [0.52, -0.02],
  [0.88, -0.14],
  [0.55, -0.26],
  [0.34, -0.24],
  [0.24, -0.44],
  [0.05, -0.4],
  [0.05, -1.0],
];

// Дуб: лопасти округлые и перекрываются. Первый вариант делал выемки глубже
// самих лопастей — получалась ёлка из отдельных бусин, а не лист.
const OAK_HALF = [
  [0.0, 0.9],
  [0.205, 0.828],
  [0.333, 0.738],
  [0.282, 0.648],
  [0.486, 0.576],
  [0.589, 0.468],
  [0.41, 0.378],
  [0.614, 0.288],
  [0.666, 0.162],
  [0.435, 0.054],
  [0.589, -0.054],
  [0.563, -0.198],
  [0.333, -0.288],
  [0.384, -0.396],
  [0.282, -0.486],
  [0.102, -0.522],
  [0.064, -0.576],
  [0.064, -0.9],
];

function buildLeaf(half) {
  const path = new Path2D();
  path.moveTo(half[0][0], -half[0][1]);
  for (let i = 1; i < half.length; i++) path.lineTo(half[i][0], -half[i][1]);
  for (let i = half.length - 1; i >= 0; i--) {
    if (half[i][0] === 0) continue;
    path.lineTo(-half[i][0], -half[i][1]);
  }
  path.closePath();
  return path;
}

// Берёзовый: гладкое остриё и черешок — та самая форма, которую все рисуют
// в детстве, и на десяти пикселях она читается лучше всего.
function buildBirch() {
  const path = new Path2D();
  path.moveTo(0.05, 0.6);
  path.lineTo(0.05, 1.0);
  path.lineTo(-0.05, 1.0);
  path.lineTo(-0.05, 0.6);
  // Контрольные точки заметно шире самого листа: кривая Безье идёт внутри их
  // оболочки, и с «честными» 0.5 лист выходил узким, как ланцет.
  path.bezierCurveTo(-0.95, 0.34, -0.78, -0.62, 0, -1);
  path.bezierCurveTo(0.78, -0.62, 0.95, 0.34, 0.05, 0.6);
  path.closePath();
  return path;
}

const SHAPES = [buildLeaf(MAPLE_HALF), buildLeaf(OAK_HALF), buildBirch()];

function pickShape() {
  const r = Math.random();
  return r < 0.45 ? SHAPES[0] : r < 0.72 ? SHAPES[1] : SHAPES[2];
}

// --- Ветер ---

// Ветер — это база (из погоды и уровня слоя), медленное «дыхание» и поверх
// них порывы: резко налетают, медленно стихают. Без порывов листопад
// выглядит ровным конвейером, а не улицей.
let gust = { start: -1, dur: 0, peak: 0, next: 2500 };

function gustAt(ts) {
  if (gust.start < 0) {
    if (ts < gust.next) return 0;
    gust.start = ts;
    gust.dur = 1300 + Math.random() * 2800;
    const room = autumnLevel.value === 2 ? 2.4 : 1;
    gust.peak = (0.5 + Math.random() * 1.6) * room * (0.6 + sky.value.wind / 10);
  }
  const k = (ts - gust.start) / gust.dur;
  if (k >= 1) {
    gust.start = -1;
    const calmFor = autumnLevel.value === 2 ? 1500 : 5000;
    gust.next = ts + calmFor + Math.random() * 9000;
    return 0;
  }
  return gust.peak * Math.sin(Math.pow(k, 0.4) * Math.PI);
}

function windAt(ts) {
  const w = sky.value;
  const strong = autumnLevel.value === 2;
  // Метры в секунду с улицы — в экранные единицы. 10 м/с уже гнёт деревья.
  const base = (w.known ? 0.2 + Math.min(1.4, w.wind / 8) : 0.45) * (strong ? 2.1 : 1);
  const breathe = 0.6 + 0.4 * Math.sin(ts * 0.00011) + 0.22 * Math.sin(ts * 0.00039);
  const dir = w.known ? (w.push >= 0 ? 1 : -1) * Math.max(0.35, Math.abs(w.push)) : 0.7;
  return dir * (base * breathe + gustAt(ts));
}

// --- Частицы ---

function spawnLeaf(fromTop) {
  const size = 6 + Math.random() * 9;
  return {
    x: Math.random() * width,
    y: fromTop ? -30 - Math.random() * height * 0.8 : Math.random() * height,
    size,
    color: AUTUMN_COLORS[(Math.random() * AUTUMN_COLORS.length) | 0],
    shape: pickShape(),
    rot: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.03,
    vy: 0.3 + Math.random() * 0.5 + size * 0.014,
    sway: 0.35 + Math.random() * 1.1,
    swayFreq: 0.0009 + Math.random() * 0.0017,
    phase: Math.random() * Math.PI * 2,
    flip: Math.random() * Math.PI * 2,
    flipSpeed: 0.0012 + Math.random() * 0.0026,
    // Насколько лист парусит: широкий кленовый ловит ветер сильнее берёзового.
    drag: 0.7 + Math.random() * 0.9,
    alpha: 0.45 + Math.random() * 0.45,
  };
}

// Дождь и снег разложены на три плана глубины с фиксированной прозрачностью.
// Это не только вид «ближе — темнее», но и способ рисовать: у частиц одного
// плана общие настройки кисти, значит весь план уходит одним stroke/fill,
// а не двумя сотнями отдельных вызовов.
const RAIN_LAYERS = [
  { alpha: 0.16, width: 0.7, len: 9, speed: 11 },
  { alpha: 0.28, width: 1, len: 15, speed: 15 },
  { alpha: 0.46, width: 1.4, len: 22, speed: 20 },
];

const SNOW_LAYERS = [
  { alpha: 0.3, r: 1, speed: 0.55 },
  { alpha: 0.5, r: 1.7, speed: 0.95 },
  { alpha: 0.75, r: 2.6, speed: 1.5 },
];

function spawnDrop(fromTop) {
  const layer = (Math.random() * 3) | 0;
  return {
    layer,
    x: Math.random() * (width + 400) - 200,
    y: fromTop ? -Math.random() * height : Math.random() * height,
    vy: RAIN_LAYERS[layer].speed * (0.85 + Math.random() * 0.3),
  };
}

function spawnFlake(fromTop) {
  const layer = (Math.random() * 3) | 0;
  return {
    layer,
    x: Math.random() * width,
    y: fromTop ? -Math.random() * height : Math.random() * height,
    vy: SNOW_LAYERS[layer].speed * (0.8 + Math.random() * 0.5),
    phase: Math.random() * Math.PI * 2,
    freq: 0.0008 + Math.random() * 0.002,
    sway: 0.3 + Math.random() * 0.9,
  };
}

function leafCount() {
  const base = Math.min(34, Math.max(10, Math.round(width / 38)));
  return autumnLevel.value === 2 ? Math.round(base * 1.8) : base;
}

function dropCount() {
  const s = sky.value;
  if (s.snow > 0) return Math.round(Math.min(150, (width / 12) * s.snow));
  if (s.rain > 0) return Math.round(Math.min(260, (width / 7) * s.rain));
  return 0;
}

function syncCount() {
  const need = leafCount();
  while (leaves.length < need) leaves.push(spawnLeaf(leaves.length > 0));
  if (leaves.length > need) leaves.length = need;

  const snowing = sky.value.snow > 0;
  const wet = dropCount();
  // Смена дождя на снег — это другие частицы, а не другое их количество.
  if (drops.length && drops[0].isFlake !== snowing) drops = [];
  while (drops.length < wet) {
    const p = snowing ? spawnFlake(drops.length > 0) : spawnDrop(drops.length > 0);
    p.isFlake = snowing;
    drops.push(p);
  }
  if (drops.length > wet) drops.length = wet;
}

function resize() {
  if (!canvas.value) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.value.width = Math.round(width * dpr);
  canvas.value.height = Math.round(height * dpr);
  canvas.value.style.width = width + "px";
  canvas.value.style.height = height + "px";
  ctx = canvas.value.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  syncCount();
}

function drawLeaf(leaf, alpha) {
  // cos(flip) — лист, поворачивающийся к нам ребром: дешёвая имитация третьей
  // оси, без которой листопад выглядит плоскими наклейками.
  const squash = 0.28 + 0.72 * Math.abs(Math.cos(leaf.flip));
  ctx.save();
  ctx.translate(leaf.x, leaf.y);
  ctx.rotate(leaf.rot);
  ctx.scale(leaf.size * squash, leaf.size);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = leaf.color;
  ctx.fill(leaf.shape);
  ctx.restore();
}

function frame(ts) {
  raf = requestAnimationFrame(frame);
  if (document.hidden || !ctx) {
    last = ts;
    return;
  }
  const dt = Math.min(48, ts - last || 16);
  last = ts;
  ctx.clearRect(0, 0, width, height);

  const wind = windAt(ts);
  const step = dt * 0.06;
  const ground = height - 6;

  // Опавшая листва: полежала у нижнего края и истлела. Порыв её подметает.
  for (let i = fallen.length - 1; i >= 0; i--) {
    const leaf = fallen[i];
    leaf.age += dt;
    const alive = 1 - leaf.age / leaf.life;
    if (alive <= 0 || leaf.x < -60 || leaf.x > width + 60) {
      fallen.splice(i, 1);
      continue;
    }
    if (Math.abs(wind) > 1.1) leaf.x += wind * step * 0.9;
    drawLeaf(leaf, leaf.alpha * 0.75 * Math.min(1, alive * 2.5));
  }

  for (const leaf of leaves) {
    leaf.y += leaf.vy * step;
    leaf.phase += leaf.swayFreq * dt;
    leaf.x += (Math.sin(leaf.phase) * leaf.sway + wind * 3 * leaf.drag) * step;
    // Под ветром лист не только сносит, но и раскручивает.
    leaf.rot += (leaf.spin + wind * 0.004 * leaf.drag) * step;
    leaf.flip += leaf.flipSpeed * dt * (1 + Math.abs(wind) * 0.35);

    if (leaf.x < -70) leaf.x = width + 60;
    else if (leaf.x > width + 70) leaf.x = -60;

    if (leaf.y >= ground) {
      if (fallen.length < 70) {
        fallen.push({
          ...leaf,
          y: ground + Math.random() * 6,
          rot: Math.PI / 2 + (Math.random() - 0.5) * 0.7,
          flip: 0,
          age: 0,
          life: 9000 + Math.random() * 7000,
        });
      }
      Object.assign(leaf, spawnLeaf(true), { y: -20 - Math.random() * 120 });
      continue;
    }
    drawLeaf(leaf, leaf.alpha);
  }

  if (drops.length) {
    if (drops[0].isFlake) drawSnow(dt, wind, step);
    else drawRain(dt, wind, step, ground);
  }
}

function drawRain(dt, wind, step, ground) {
  const slant = wind * 2.4;
  for (const drop of drops) {
    drop.y += drop.vy * step;
    drop.x += slant * step;
    if (drop.y > ground) {
      if (splashes.length < 40 && Math.random() < 0.35) {
        splashes.push({ x: drop.x, y: ground, age: 0, r: 1 + Math.random() * 2 });
      }
      drop.y = -20 - Math.random() * 60;
      drop.x = Math.random() * (width + 400) - 200;
    }
    if (drop.x < -220) drop.x = width + 200;
    else if (drop.x > width + 220) drop.x = -200;
  }

  ctx.save();
  ctx.strokeStyle = "#b2cce6";
  ctx.lineCap = "round";
  for (let l = 0; l < RAIN_LAYERS.length; l++) {
    const def = RAIN_LAYERS[l];
    ctx.globalAlpha = def.alpha;
    ctx.lineWidth = def.width;
    ctx.beginPath();
    for (const drop of drops) {
      if (drop.layer !== l) continue;
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - slant * 0.9, drop.y - def.len);
    }
    ctx.stroke();
  }
  ctx.restore();

  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.age += dt;
    const k = s.age / 320;
    if (k >= 1) {
      splashes.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.5;
    ctx.strokeStyle = "rgba(190, 214, 238, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r + k * 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSnow(dt, wind, step) {
  for (const flake of drops) {
    flake.y += flake.vy * step;
    flake.phase += flake.freq * dt;
    flake.x += (Math.sin(flake.phase) * flake.sway + wind * 1.6) * step;
    if (flake.y > height + 6) {
      flake.y = -10;
      flake.x = Math.random() * width;
    }
    if (flake.x < -30) flake.x = width + 20;
    else if (flake.x > width + 30) flake.x = -20;
  }

  ctx.save();
  ctx.fillStyle = "#eef4ff";
  for (let l = 0; l < SNOW_LAYERS.length; l++) {
    const def = SNOW_LAYERS[l];
    ctx.globalAlpha = def.alpha;
    ctx.beginPath();
    for (const flake of drops) {
      if (flake.layer !== l) continue;
      // moveTo перед дугой — иначе Canvas соединит снежинки линиями в один
      // непрерывный путь.
      ctx.moveTo(flake.x + def.r, flake.y);
      ctx.arc(flake.x, flake.y, def.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

function start() {
  if (calm || raf) return;
  nextTick(() => {
    resize();
    last = 0;
    raf = requestAnimationFrame(frame);
  });
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  leaves = [];
  fallen = [];
  drops = [];
  splashes = [];
}

onMounted(() => {
  window.addEventListener("resize", resize);
  ensureWeather();
  if (on.value) start();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  stop();
});

watch(on, (value) => (value ? start() : stop()));
// Смена силы ветра или погоды не пересоздаёт слой — только досыпает частиц.
watch([autumnLevel, () => sky.value.rain, () => sky.value.snow], () => {
  if (on.value && ctx) syncCount();
});

// Ливень стоит подсветить и вне канваса: экран слегка холодает.
const wet = computed(() => on.value && !calm && sky.value.rain > 0.55);
</script>

<template>
  <div v-if="on" class="autumn" :class="{ wet }" aria-hidden="true">
    <canvas v-if="!calm" ref="canvas" class="autumn-canvas"></canvas>
    <div class="autumn-warm"></div>

    <svg class="autumn-pumpkin left" viewBox="0 0 100 96">
      <rect x="46" y="10" width="8" height="16" rx="4" fill="#6f4a2a" />
      <path d="M54 22q3-13 15-17-10 9-8 18z" fill="#5f8a3a" />
      <ellipse cx="50" cy="58" rx="43" ry="34" fill="#e0761f" />
      <ellipse cx="28" cy="58" rx="21" ry="33" fill="#c05a12" opacity=".5" />
      <ellipse cx="72" cy="58" rx="21" ry="33" fill="#c05a12" opacity=".5" />
      <ellipse cx="50" cy="58" rx="15" ry="34" fill="#f5942f" opacity=".65" />
      <g fill="#2a1408">
        <path d="M31 48l14 9-14 4z" />
        <path d="M69 48l-14 9 14 4z" />
        <path d="M30 70q20 14 40 0-6 4-10 1-4 5-10 1-4 5-10 1-4 3-10-3z" />
      </g>
    </svg>

    <svg class="autumn-pumpkin right" viewBox="0 0 100 96">
      <rect x="47" y="14" width="7" height="14" rx="3.5" fill="#6f4a2a" />
      <path d="M47 24q-4-12-16-15 11 8 9 16z" fill="#5f8a3a" />
      <ellipse cx="50" cy="60" rx="38" ry="30" fill="#d2691e" />
      <ellipse cx="31" cy="60" rx="18" ry="29" fill="#b0500f" opacity=".5" />
      <ellipse cx="69" cy="60" rx="18" ry="29" fill="#b0500f" opacity=".5" />
      <ellipse cx="50" cy="60" rx="13" ry="30" fill="#e88433" opacity=".6" />
      <g fill="#2a1408">
        <circle cx="37" cy="54" r="5" />
        <circle cx="63" cy="54" r="5" />
        <path d="M34 70q16 11 32 0-5 4-8 1-3 4-8 1-3 4-8 1-3 3-8-3z" />
      </g>
    </svg>
  </div>

  <button
    class="autumn-toggle"
    :class="{ off: autumnLevel === 0, storm: autumnLevel === 2 }"
    :title="AUTUMN_LABELS[autumnLevel]"
    @click="cycleAutumn"
  >
    🍂
  </button>
</template>

<style scoped>
.autumn {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
}

.autumn-canvas {
  position: absolute;
  inset: 0;
}

/* Тёплый свет по краям: осень должна чувствоваться, даже когда лист не летит
   мимо глаз. screen — чтобы не пачкать тёмный фон, а подсвечивать его. */
.autumn-warm {
  position: absolute;
  inset: 0;
  mix-blend-mode: screen;
  transition: background 1.2s ease;
  background:
    radial-gradient(120% 55% at 50% -12%, rgba(224, 123, 57, 0.12), transparent 62%),
    radial-gradient(70% 45% at 8% 108%, rgba(193, 68, 14, 0.13), transparent 70%),
    radial-gradient(70% 45% at 95% 106%, rgba(217, 164, 65, 0.1), transparent 70%);
}

/* В ливень тёплый свет уходит в холодный — сцена вся целиком становится сырой */
.autumn.wet .autumn-warm {
  background:
    radial-gradient(120% 55% at 50% -12%, rgba(120, 160, 205, 0.14), transparent 62%),
    radial-gradient(70% 45% at 8% 108%, rgba(90, 120, 165, 0.12), transparent 70%),
    radial-gradient(70% 45% at 95% 106%, rgba(150, 130, 90, 0.08), transparent 70%);
}

.autumn-pumpkin {
  position: absolute;
  bottom: 6px;
  width: 74px;
  height: 71px;
  opacity: 0.34;
  filter: drop-shadow(0 0 14px rgba(255, 146, 40, 0.4));
  animation: pumpkin-glow 4.5s ease-in-out infinite;
}

.autumn-pumpkin.left {
  left: 10px;
}

.autumn-pumpkin.right {
  right: 10px;
  width: 58px;
  height: 56px;
  animation-delay: 1.7s;
}

@keyframes pumpkin-glow {
  0%,
  100% {
    opacity: 0.3;
    filter: drop-shadow(0 0 10px rgba(255, 146, 40, 0.32));
  }
  45% {
    opacity: 0.42;
    filter: drop-shadow(0 0 20px rgba(255, 168, 60, 0.6));
  }
  60% {
    opacity: 0.33;
  }
}

/* Переключатель — единственная кликабельная часть слоя. Держим его ниже
   модалок (2000), но выше страниц. */
.autumn-toggle {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 1500;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(224, 123, 57, 0.35);
  background: rgba(26, 20, 16, 0.72);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.38;
  transition: opacity 0.2s, transform 0.2s, box-shadow 0.2s;
}

.autumn-toggle:hover {
  opacity: 1;
  transform: scale(1.1);
  box-shadow: 0 0 16px rgba(224, 123, 57, 0.45);
}

.autumn-toggle.off {
  filter: grayscale(1);
  opacity: 0.22;
}

.autumn-toggle.storm {
  border-color: rgba(232, 176, 75, 0.7);
  box-shadow: 0 0 12px rgba(224, 123, 57, 0.35);
}

@media (prefers-reduced-motion: reduce) {
  .autumn-pumpkin {
    animation: none;
  }
}

/* Снизу на телефоне — таб-бар, кнопку и тыквы поднимаем над ним. */
@media (max-width: 768px) {
  .autumn-toggle {
    bottom: calc(66px + env(safe-area-inset-bottom, 0px));
    width: 30px;
    height: 30px;
    font-size: 13px;
  }
  .autumn-pumpkin {
    bottom: calc(58px + env(safe-area-inset-bottom, 0px));
    width: 52px;
    height: 50px;
    opacity: 0.26;
  }
  .autumn-pumpkin.right {
    width: 42px;
    height: 40px;
  }
}
</style>
