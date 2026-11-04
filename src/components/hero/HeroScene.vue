<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { createScene, HEIGHT } from "./scene.js";
import { createAudio } from "./audio.js";

// Путь длиною в жизнь: герой Хиноде (лучник с мечом за спиной) живёт в
// пиксельной сцене слева на главной. Компонент только планирует кадры и
// переводит пропсы — рисует scene.js, звучит audio.js.
//
// Кадры — 12 в секунду и только пока сцену видно: вкладка в фоне или панель
// за краем экрана — цикл стоит. Сайт открыт весь день, и сцена не должна
// быть заметна по процессору.

const props = defineProps({
  // campfire | sleep | read | train | meditate | travel
  action: { type: String, default: "campfire" },
  // cave | mountains | forest | ruins
  location: { type: String, default: "cave" },
  // Стрик дня: 0 — угли, 1 — жёлтое пламя, 2 — синее, 3 — багровое.
  fire: { type: Number, default: 1 },
  // Дней подряд: пламя чуть растёт, но не больше чем на 5 пикселей.
  streak: { type: Number, default: 0 },
  // 0..4 — свечение вокруг героя.
  aura: { type: Number, default: 0 },
  // bell | red | blue | moon | black | white — снаряжение.
  whistle: { type: String, default: "bell" },
  age: { type: Number, default: 24 },
  // good | strong | weak
  mood: { type: String, default: "good" },
  // { kind: clear|clouds|rain|snow|fog|storm, wind: 0..1 } или null.
  weather: { type: Object, default: null },
  // Время сцены; по умолчанию — сейчас (небо и сезон).
  now: { type: Date, default: null },
  sound: { type: Boolean, default: false },
});

const emit = defineEmits(["click", "update:sound"]);

const FPS = 12;
const wrap = ref(null);
const canvas = ref(null);
const scale = ref(2);
const logicalWidth = ref(180);
const soundOn = ref(props.sound);

// Своё «сейчас», если родитель время не передал. Небо меняется раз в минуту,
// чаще будить реактивность незачем.
const clock = ref(new Date());
let clockTimer = 0;

const reducedQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const reduced = ref(!!reducedQuery?.matches);

let scene = null;
let audio = null;
let raf = 0;
let calmTimer = 0;
let last = 0;
let acc = 0;
let visible = true;
let onScreen = true;
let ro = null;
let io = null;

const sceneProps = computed(() => ({
  action: props.action,
  location: props.location,
  fire: props.fire,
  streak: props.streak,
  aura: props.aura,
  whistle: props.whistle,
  age: props.age,
  mood: props.mood,
  weather: props.weather,
  now: props.now || clock.value,
}));

const ACTION_TEXT = {
  campfire: "сидит у костра",
  sleep: "спит у костра",
  read: "читает у костра",
  train: "тренируется",
  meditate: "медитирует",
  travel: "в пути",
};
const PLACE_TEXT = { cave: "в пещере", mountains: "в горах", forest: "в лесу", ruins: "в руинах" };
const label = computed(
  () => `Хиноде ${ACTION_TEXT[props.action] || ACTION_TEXT.campfire} ${PLACE_TEXT[props.location] || PLACE_TEXT.cave}`,
);

const canvasStyle = computed(() => ({
  width: `${logicalWidth.value * scale.value}px`,
  height: `${HEIGHT * scale.value}px`,
}));
const wrapStyle = computed(() => ({ height: `${HEIGHT * scale.value}px` }));

// --- Кадры ---

function frame(ts) {
  raf = requestAnimationFrame(frame);
  if (!last) last = ts;
  const dt = (ts - last) / 1000;
  last = ts;
  acc += dt;
  if (acc < 1 / FPS) return;
  // После долгой паузы не догоняем пропущенное — просто идём дальше.
  const stepDt = Math.min(acc, 0.25);
  acc = 0;
  scene.step(stepDt);
  scene.draw();
}

function running() {
  return visible && onScreen && !!scene;
}

function play() {
  stopLoop();
  if (!running()) return;
  if (reduced.value) {
    // Тем, кто просил систему не анимировать: неподвижный кадр и лишь редкое
    // мерцание огня — раз в 0,7 с.
    scene.step(0);
    scene.draw();
    calmTimer = setInterval(() => {
      scene.step(0.7);
      scene.draw();
    }, 700);
    return;
  }
  last = 0;
  acc = 1;
  raf = requestAnimationFrame(frame);
}

function stopLoop() {
  cancelAnimationFrame(raf);
  clearInterval(calmTimer);
  raf = 0;
  calmTimer = 0;
}

function onVisibility() {
  visible = !document.hidden;
  if (visible) clock.value = new Date();
  play();
}

function onReducedChange(e) {
  reduced.value = e.matches;
  build();
}

// --- Размер ---

// Целочисленный масштаб: пиксели сцены одинаковые, без «рваных» строк.
// Логическая ширина подгоняется под контейнер, высота постоянная.
function measure() {
  const el = wrap.value;
  if (!el) return;
  const w = el.clientWidth || 360;
  // ~185 логических пикселей на ширину: 340–380 → ×2, 600 → ×3.
  const s = Math.max(1, Math.min(6, Math.round(w / 185)));
  scale.value = s;
  logicalWidth.value = Math.max(120, Math.min(260, Math.ceil(w / s)));
  if (scene) {
    scene.resize(logicalWidth.value);
    scene.draw();
  }
}

function build() {
  stopLoop();
  if (!canvas.value) return;
  scene = createScene(canvas.value, { reduced: reduced.value });
  scene.resize(logicalWidth.value);
  scene.setProps(sceneProps.value);
  scene.onThunder((delay) => audio && audio.thunder(delay));
  // Прогрев: искры и дождь успевают разлететься до первого показа.
  if (!reduced.value) for (let i = 0; i < 24; i++) scene.step(1 / FPS);
  scene.draw();
  play();
}

watch(sceneProps, (p) => {
  if (!scene) return;
  scene.setProps(p);
  if (audio) audio.update(scene.soundState());
  if (!raf) scene.draw();
});

// --- Звук ---

function ensureAudio() {
  if (!audio) audio = createAudio();
  return audio;
}

// Браузер не даёт звучать без жеста. Если звук включён заранее (например,
// родитель помнит выбор), ждём первого клика или клавиши где угодно.
function armGesture() {
  window.addEventListener("pointerdown", onGesture, { once: true, capture: true });
  window.addEventListener("keydown", onGesture, { once: true, capture: true });
}

function disarmGesture() {
  window.removeEventListener("pointerdown", onGesture, { capture: true });
  window.removeEventListener("keydown", onGesture, { capture: true });
}

function onGesture() {
  disarmGesture();
  if (!soundOn.value) return;
  const a = ensureAudio();
  a.start();
  if (scene) a.update(scene.soundState());
}

function setSound(value) {
  soundOn.value = value;
  if (value) {
    const a = ensureAudio();
    a.start();
    if (scene) a.update(scene.soundState());
  } else if (audio) {
    audio.stop();
  }
}

function toggleSound(e) {
  e.stopPropagation();
  setSound(!soundOn.value);
  emit("update:sound", soundOn.value);
}

watch(
  () => props.sound,
  (v) => {
    if (v === soundOn.value) return;
    soundOn.value = v;
    if (v) {
      // Смена пропа сама по себе не жест — запуск может отложиться до клика.
      const a = ensureAudio();
      a.start();
      if (!a.running) armGesture();
      if (scene) a.update(scene.soundState());
    } else if (audio) {
      audio.stop();
    }
  },
);

function onClick(e) {
  emit("click", e);
}

onMounted(() => {
  measure();
  build();
  document.addEventListener("visibilitychange", onVisibility);
  reducedQuery?.addEventListener?.("change", onReducedChange);
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => measure());
    ro.observe(wrap.value);
  }
  if (typeof IntersectionObserver !== "undefined") {
    io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      play();
    });
    io.observe(wrap.value);
  }
  clockTimer = setInterval(() => {
    if (!document.hidden) clock.value = new Date();
  }, 30000);
  if (soundOn.value) armGesture();
});

onBeforeUnmount(() => {
  stopLoop();
  clearInterval(clockTimer);
  document.removeEventListener("visibilitychange", onVisibility);
  reducedQuery?.removeEventListener?.("change", onReducedChange);
  ro?.disconnect();
  io?.disconnect();
  disarmGesture();
  audio?.destroy();
  audio = null;
  scene = null;
});
</script>

<template>
  <div ref="wrap" class="hero-scene" :style="wrapStyle" @click="onClick">
    <canvas ref="canvas" class="hero-canvas" :style="canvasStyle" role="img" :aria-label="label"></canvas>
    <button
      type="button"
      class="hero-sound"
      :class="{ on: soundOn }"
      :aria-label="soundOn ? 'Выключить звук' : 'Включить звук'"
      :title="soundOn ? 'Выключить звук' : 'Включить звук'"
      @click="toggleSound"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
        <template v-if="soundOn">
          <path d="M11 5.5c1 .8 1 4.2 0 5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" />
          <path d="M12.8 3.8c2 1.8 2 6.6 0 8.4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" />
        </template>
        <path v-else d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.hero-scene {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  background: #07080d;
  cursor: pointer;
  user-select: none;
}

.hero-canvas {
  display: block;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
}

/* Кнопка звука — крошечная, проявляется при наведении на сцену. */
.hero-sound {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(8, 9, 14, 0.55);
  color: rgba(230, 226, 214, 0.7);
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.2s, color 0.2s;
}

.hero-scene:hover .hero-sound,
.hero-sound:focus-visible,
.hero-sound.on {
  opacity: 1;
}

.hero-sound.on {
  color: #f0c870;
}

.hero-sound:focus-visible {
  outline: 2px solid #f0c870;
  outline-offset: 1px;
}

@media (hover: none) {
  .hero-sound {
    opacity: 0.85;
    width: 28px;
    height: 28px;
  }
}
</style>
