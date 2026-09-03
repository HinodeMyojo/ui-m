<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import {
  autumnLevel,
  cycleAutumn,
  AUTUMN_LABELS,
  AUTUMN_COLORS,
} from "@/composables/useAutumn.js";

// Листопад на весь сайт. Рисуем в canvas, а не сотней DOM-узлов с анимациями:
// тридцать листьев в CSS — это тридцать композитных слоёв на каждом экране,
// а тут один слой и один requestAnimationFrame, который встаёт на паузу,
// когда вкладка не видна.

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

// Лист рисуем один раз в единичном круге и потом просто масштабируем.
// Пять лопастей клёна — это радиус, промодулированный косинусом, а не
// пятнадцать вручную расставленных точек.
function buildMaple() {
  const path = new Path2D();
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = 0.42 + 0.58 * Math.pow(Math.abs(Math.cos(2.5 * a)), 0.7);
    const x = Math.sin(a) * r;
    const y = -Math.cos(a) * r;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

function buildOval() {
  const path = new Path2D();
  path.moveTo(0, -1);
  path.bezierCurveTo(0.72, -0.52, 0.72, 0.52, 0, 1);
  path.bezierCurveTo(-0.72, 0.52, -0.72, -0.52, 0, -1);
  path.closePath();
  return path;
}

const MAPLE = buildMaple();
const OVAL = buildOval();

function spawn(fromTop) {
  const size = 7 + Math.random() * 13;
  return {
    x: Math.random() * width,
    y: fromTop ? -30 - Math.random() * height * 0.8 : Math.random() * height,
    size,
    color: AUTUMN_COLORS[(Math.random() * AUTUMN_COLORS.length) | 0],
    shape: Math.random() < 0.55 ? MAPLE : OVAL,
    rot: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.03,
    vy: 0.3 + Math.random() * 0.5 + size * 0.012,
    sway: 0.35 + Math.random() * 1.1,
    swayFreq: 0.0009 + Math.random() * 0.0017,
    phase: Math.random() * Math.PI * 2,
    flip: Math.random() * Math.PI * 2,
    flipSpeed: 0.0012 + Math.random() * 0.0026,
    alpha: 0.45 + Math.random() * 0.45,
  };
}

function targetCount() {
  const base = Math.min(34, Math.max(10, Math.round(width / 38)));
  return autumnLevel.value === 2 ? Math.round(base * 1.8) : base;
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

function syncCount() {
  const need = targetCount();
  while (leaves.length < need) leaves.push(spawn(leaves.length > 0));
  if (leaves.length > need) leaves.length = need;
}

function draw(leaf, alpha) {
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

  const storm = autumnLevel.value === 2;
  const gust =
    (storm ? 2.2 : 0.9) *
    (0.3 + Math.sin(ts * 0.00013) * 0.5 + Math.sin(ts * 0.00047) * 0.25);
  const speed = storm ? 1.7 : 1;
  const step = dt * 0.06;

  // Опавшая листва: полежала у нижнего края и истлела.
  for (let i = fallen.length - 1; i >= 0; i--) {
    const leaf = fallen[i];
    leaf.age += dt;
    const left = 1 - leaf.age / leaf.life;
    if (left <= 0) {
      fallen.splice(i, 1);
      continue;
    }
    draw(leaf, leaf.alpha * 0.75 * Math.min(1, left * 2.5));
  }

  const ground = height - 6;
  for (const leaf of leaves) {
    leaf.y += leaf.vy * speed * step;
    leaf.phase += leaf.swayFreq * dt;
    leaf.x += (Math.sin(leaf.phase) * leaf.sway + gust) * step;
    leaf.rot += leaf.spin * speed * step;
    leaf.flip += leaf.flipSpeed * dt;

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
      Object.assign(leaf, spawn(true), { y: -20 - Math.random() * 120 });
      continue;
    }
    draw(leaf, leaf.alpha);
  }
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
}

onMounted(() => {
  window.addEventListener("resize", resize);
  if (on.value) start();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  stop();
});

watch(on, (value) => (value ? start() : stop()));
// Смена силы ветра не пересоздаёт слой — только досыпает или убирает листья.
watch(autumnLevel, () => {
  if (on.value && ctx) syncCount();
});
</script>

<template>
  <div v-if="on" class="autumn" aria-hidden="true">
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
  background:
    radial-gradient(120% 55% at 50% -12%, rgba(224, 123, 57, 0.12), transparent 62%),
    radial-gradient(70% 45% at 8% 108%, rgba(193, 68, 14, 0.13), transparent 70%),
    radial-gradient(70% 45% at 95% 106%, rgba(217, 164, 65, 0.1), transparent 70%);
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
