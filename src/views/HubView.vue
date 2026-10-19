<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  createHubNode,
  fetchHubBoard,
  percent,
  saveHubPositions,
} from "@/components/hubApi.js";
import HubPlanModal from "@/components/hub/HubPlanModal.vue";
import { isMobile } from "@/composables/useIsMobile.js";

// Хаб — все планы на одной доске, docs/hub-module.md (back-m).
// Доска — открытый космос: в центре ты, на ближней орбите планы с понятным
// сроком, на дальней — далёкие, без чёткого начала и конца. Планету можно
// утащить куда угодно, тап по ней открывает план.
//
// Зум — смысловой: масштабируются расстояния между планетами, а сами планеты
// и подписи остаются своего размера. Раньше масштабировалось всё целиком, и на
// телефоне, чтобы влезла дальняя орбита, название плана выходило в 5 пикселей.
//
// Планеты медленно ходят вокруг звезды. На сервере лежит место, куда планету
// поставили, — на экране оно повёрнуто на угол, набежавший с открытия доски.
// Поэтому после перезагрузки планета снова там, куда её утащили.

const ORBIT_NEAR = 300;
const ORBIT_FAR = 540;

// Период обращения, мс: дальние ходят вдвое медленнее, как настоящие.
const PERIOD = { near: 6 * 60 * 1000, far: 12 * 60 * 1000 };

const router = useRouter();

const plans = ref([]);
const loading = ref(true);
const error = ref("");
const modalOpen = ref(false);

const space = ref(null);
const starCanvas = ref(null);
const view = reactive({ x: 0, y: 0, scale: 1 });
const size = reactive({ w: 0, h: 0 });

// Пока тянем планету, её место на экране живёт здесь, а не в модели.
const localPos = ref({});

// Время орбит: копится, только пока доску не трогают. Под курсором и под
// пальцем система замирает — в ползущую планету труднее попасть.
const orbitTime = ref(0);
const hovering = ref(false);
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let frame = 0;
let lastTick = 0;

function tick(ts) {
  frame = requestAnimationFrame(tick);
  if (!lastTick) lastTick = ts;
  const dt = ts - lastTick;
  // Хватает ~30 кадров в секунду: планета сдвигается на доли пикселя.
  if (dt < 33) return;
  lastTick = ts;
  if (hovering.value || gesture) return;
  orbitTime.value += Math.min(dt, 100);
}

// Против часовой стрелки — экранная ось y смотрит вниз, поэтому угол со знаком минус.
function angleOf(plan) {
  const period = PERIOD[plan.horizon] || PERIOD.near;
  return (-2 * Math.PI * (orbitTime.value % period)) / period;
}

function rotate(p, a) {
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

async function load() {
  loading.value = true;
  try {
    const board = await fetchHubBoard();
    plans.value = board?.plans || [];
    localPos.value = {};
    error.value = "";
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function posOf(plan) {
  return localPos.value[plan.id] || rotate({ x: plan.x, y: plan.y }, angleOf(plan));
}

function planetSize(plan) {
  if (isMobile.value) return plan.horizon === "far" ? 30 : 38;
  return plan.horizon === "far" ? 46 : 60;
}

const planets = computed(() =>
  plans.value.map((plan) => {
    const pos = posOf(plan);
    const d = planetSize(plan);
    const r = d / 2 + 5;
    const circumference = 2 * Math.PI * r;
    return {
      plan,
      pos,
      d,
      ring: { r, size: d + 14, circumference, dash: circumference * (plan.progress || 0) },
      color: plan.color || (plan.horizon === "far" ? "#7aa2ff" : "#ffb35c"),
    };
  }),
);

// --- Звёзды ---

// Небо рисуется один раз на холсте: сотни div'ов со звёздами ощутимо
// тормозили бы панораму на телефоне.
function drawStars() {
  const canvas = starCanvas.value;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size.w * dpr;
  canvas.height = size.h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size.w, size.h);
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const count = Math.round((size.w * size.h) / 2600);
  for (let i = 0; i < count; i++) {
    const x = rand() * size.w;
    const y = rand() * size.h;
    const big = rand() > 0.94;
    const r = big ? 1.1 + rand() * 0.9 : 0.3 + rand() * 0.7;
    const alpha = 0.35 + rand() * 0.65;
    const tint = rand();
    ctx.fillStyle =
      tint > 0.85 ? `rgba(170,190,255,${alpha})` : tint > 0.75 ? `rgba(255,214,170,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Мерцающие звёзды поверх холста — их немного, анимирует CSS.
const twinkles = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${(i * 37 + 11) % 100}%`,
  top: `${(i * 53 + 7) % 100}%`,
  delay: `${(i * 0.7) % 5}s`,
  duration: `${3 + (i % 4)}s`,
}));

// --- Камера ---

function measure() {
  const el = space.value;
  if (!el) return;
  size.w = el.clientWidth;
  size.h = el.clientHeight;
  drawStars();
}

// Камера встаёт так, чтобы влезла дальняя орбита. На телефоне — по ширине:
// экран узкий и высокий, и вписывание по меньшей стороне — это и есть ширина,
// но запас под подписи нужен меньше, чем на десктопе.
function center() {
  const fit = isMobile.value
    ? (size.w / 2 - 14) / ORBIT_FAR
    : Math.min(size.w, size.h) / (2 * (ORBIT_FAR + 90));
  view.scale = Math.max(0.2, Math.min(1, fit));
  view.x = 0;
  // Снизу на телефоне полоса карточек планов — центр системы чуть выше неё.
  view.y = isMobile.value ? -40 : 0;
}

// Плоскость только сдвигается: масштаб применяется к координатам, а не к
// размерам — см. «смысловой зум» выше.
const planeStyle = computed(() => ({
  transform: `translate(${size.w / 2 + view.x}px, ${size.h / 2 + view.y}px)`,
}));

// Издалека у планеты остаётся только название: процент и путь по ступеням
// при таком масштабе наезжали на соседей, а на телефоне их и так показывает
// полоса карточек внизу.
const compact = computed(() => view.scale < 0.5);

const orbitNear = computed(() => ORBIT_NEAR * 2 * view.scale + "px");
const orbitFar = computed(() => ORBIT_FAR * 2 * view.scale + "px");

// Подпись у края экрана сдвигается внутрь: иначе у планеты на краю
// название обрезалось. Ширина подписи оценивается по длине названия — точная
// мерка потребовала бы второго прохода отрисовки ради пары пикселей.
function labelHalf(plan) {
  return Math.min(isMobile.value ? 75 : 110, plan.title.length * 3.9 + 6);
}

function labelShift(plan, pos) {
  const half = labelHalf(plan);
  const x = size.w / 2 + view.x + pos.x * view.scale;
  const margin = 8;
  if (x - half < margin) return margin - (x - half);
  if (x + half > size.w - margin) return size.w - margin - (x + half);
  return 0;
}

// Подпись уходит наверх, только когда снизу она легла бы на солнце. Раньше
// наверх шли все планеты верхней половины, но на орбите это значило бы, что
// подпись перескакивает у каждой планеты на каждом обороте.
function labelUp(p) {
  const sunR = isMobile.value ? 27 : 42;
  const x = p.pos.x * view.scale;
  const top = p.pos.y * view.scale + p.d / 2 + 12;
  const height = compact.value ? 22 : 64;
  return Math.abs(x) < labelHalf(p.plan) + sunR && top < sunR && top + height > -sunR;
}

function openPlan(plan) {
  router.push(`/hub/${plan.id}`);
}

function nextStage(plan) {
  const s = (plan.stages || []).find((x) => x.status !== "done");
  return s ? s.title : "";
}

function zoomAt(factor, clientX, clientY) {
  const el = space.value;
  const rect = el.getBoundingClientRect();
  const px = (clientX ?? rect.left + rect.width / 2) - rect.left - size.w / 2 - view.x;
  const py = (clientY ?? rect.top + rect.height / 2) - rect.top - size.h / 2 - view.y;
  const next = Math.min(2.5, Math.max(0.2, view.scale * factor));
  const k = next / view.scale;
  // Точка под курсором остаётся на месте.
  view.x -= px * (k - 1);
  view.y -= py * (k - 1);
  view.scale = next;
}

function onWheel(event) {
  event.preventDefault();
  zoomAt(event.deltaY > 0 ? 0.9 : 1.1, event.clientX, event.clientY);
}

// Указатели: один палец — панорама или перетаскивание планеты, два — щипок.
const pointers = new Map();
let gesture = null;

function onPointerDown(event, plan = null) {
  if (event.button !== undefined && event.button !== 0) return;
  event.stopPropagation();
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  space.value?.setPointerCapture?.(event.pointerId);

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = {
      type: "pinch",
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
    return;
  }
  if (plan) {
    const pos = posOf(plan);
    gesture = { type: "planet", plan, startX: event.clientX, startY: event.clientY, origin: { ...pos }, moved: false };
  } else {
    gesture = { type: "pan", startX: event.clientX, startY: event.clientY, origin: { x: view.x, y: view.y } };
  }
}

function onPointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!gesture) return;

  if (gesture.type === "pinch" && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (gesture.dist > 0) zoomAt(dist / gesture.dist, gesture.mid.x, gesture.mid.y);
    gesture.dist = dist;
    return;
  }
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  if (gesture.type === "pan") {
    view.x = gesture.origin.x + dx;
    view.y = gesture.origin.y + dy;
  } else if (gesture.type === "planet") {
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) gesture.moved = true;
    if (!gesture.moved) return;
    localPos.value = {
      ...localPos.value,
      [gesture.plan.id]: {
        x: Math.round(gesture.origin.x + dx / view.scale),
        y: Math.round(gesture.origin.y + dy / view.scale),
      },
    };
  }
}

async function onPointerUp(event) {
  pointers.delete(event.pointerId);
  const g = gesture;
  if (pointers.size > 0) {
    // Второй палец отпустили — продолжаем панораму оставшимся.
    const [rest] = [...pointers.values()];
    gesture = { type: "pan", startX: rest.x, startY: rest.y, origin: { x: view.x, y: view.y } };
    return;
  }
  gesture = null;
  if (!g || g.type !== "planet") return;
  if (!g.moved) {
    router.push(`/hub/${g.plan.id}`);
    return;
  }
  const pos = localPos.value[g.plan.id];
  if (!pos) return;
  // Экранное место переводим обратно в «неповёрнутое» и отпускаем планету
  // дальше по орбите сразу, не дожидаясь сервера.
  const stored = rotate(pos, -angleOf(g.plan));
  const prev = { x: g.plan.x, y: g.plan.y };
  g.plan.x = Math.round(stored.x);
  g.plan.y = Math.round(stored.y);
  const next = { ...localPos.value };
  delete next[g.plan.id];
  localPos.value = next;
  try {
    await saveHubPositions([{ id: g.plan.id, x: g.plan.x, y: g.plan.y }]);
  } catch (e) {
    error.value = e.message;
    g.plan.x = prev.x;
    g.plan.y = prev.y;
  }
}

async function createPlan(form) {
  try {
    await createHubNode({ ...form, kind: "plan" });
    modalOpen.value = false;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

function stageLine(plan) {
  return (plan.stages || []).slice(0, 6);
}

let resizeObserver = null;
onMounted(async () => {
  await nextTick();
  measure();
  center();
  resizeObserver = new ResizeObserver(() => measure());
  if (space.value) resizeObserver.observe(space.value);
  load();
  if (!reduceMotion) frame = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  cancelAnimationFrame(frame);
});
</script>

<template>
  <div class="hub">
    <div
      ref="space"
      class="hub-space"
      @pointerdown="onPointerDown($event)"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
    >
      <canvas ref="starCanvas" class="hub-stars" />
      <div class="hub-nebula" />
      <span
        v-for="t in twinkles"
        :key="t.id"
        class="hub-twinkle"
        :style="{ left: t.left, top: t.top, animationDelay: t.delay, animationDuration: t.duration }"
      />

      <div class="hub-plane" :class="{ compact }" :style="planeStyle">
        <div class="hub-orbit far" :style="{ width: orbitFar, height: orbitFar }">
          <span class="hub-orbit-label">далёкие · без чётких сроков</span>
        </div>
        <div class="hub-orbit near" :style="{ width: orbitNear, height: orbitNear }">
          <span class="hub-orbit-label">близкие · до 5–10 лет</span>
        </div>

        <div class="hub-sun">
          <div class="hub-sun-core">ты</div>
        </div>

        <div
          v-for="p in planets"
          :key="p.plan.id"
          class="hub-planet"
          :class="[
            p.plan.horizon,
            { done: p.plan.status === 'done', paused: p.plan.status === 'paused', 'label-up': labelUp(p) },
          ]"
          :style="{
            left: p.pos.x * view.scale + 'px',
            top: p.pos.y * view.scale + 'px',
            '--planet': p.color,
            '--d': p.d + 'px',
            '--shift': labelShift(p.plan, p.pos) + 'px',
          }"
          @pointerdown="onPointerDown($event, p.plan)"
          @pointerenter="hovering = true"
          @pointerleave="hovering = false"
        >
          <svg class="hub-ring" :width="p.ring.size" :height="p.ring.size">
            <circle :cx="p.ring.size / 2" :cy="p.ring.size / 2" :r="p.ring.r" class="hub-ring-bg" />
            <circle
              :cx="p.ring.size / 2"
              :cy="p.ring.size / 2"
              :r="p.ring.r"
              class="hub-ring-fill"
              :stroke-dasharray="`${p.ring.dash} ${p.ring.circumference}`"
              :transform="`rotate(-90 ${p.ring.size / 2} ${p.ring.size / 2})`"
            />
          </svg>
          <div class="hub-planet-body" />
          <div class="hub-planet-label">
            <div class="hub-planet-title">{{ p.plan.title }}</div>
            <div class="hub-planet-meta">
              {{ percent(p.plan.progress) }}%
              <template v-if="p.plan.targetDate"> · до {{ p.plan.targetDate.slice(0, 4) }}</template>
            </div>
            <div v-if="stageLine(p.plan).length" class="hub-planet-path">
              <span
                v-for="(s, i) in stageLine(p.plan)"
                :key="s.id"
                class="hub-step"
                :class="{ done: s.status === 'done', active: s.status === 'active', goal: s.isGoal }"
              >
                <template v-if="i">›</template>{{ s.title }}<template v-if="s.isGoal">🏁</template>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && !plans.length" class="hub-empty" @pointerdown.stop>
        <div class="hub-empty-title">Здесь будут все твои планы</div>
        <p>
          Большие и далёкие, близкие и конкретные. Внутри плана — путь по ступеням (N5 → N4 → N3),
          темы, учебники и главы с артефактами.
        </p>
        <button class="hub-cta" @click="modalOpen = true">＋ Первый план</button>
      </div>
    </div>

    <div class="hub-toolbar" @pointerdown.stop>
      <div class="hub-brand">
        <span class="hub-brand-icon">🪐</span>
        <span>Хаб</span>
      </div>
      <button class="hub-tool primary" @click="modalOpen = true">＋ План</button>
      <button class="hub-tool" title="Вернуть в центр" @click="center">⌖</button>
      <!-- На телефоне зум — щипком, кнопки только занимали бы верх -->
      <template v-if="!isMobile">
        <button class="hub-tool" title="Приблизить" @click="zoomAt(1.2)">＋</button>
        <button class="hub-tool" title="Отдалить" @click="zoomAt(1 / 1.2)">－</button>
      </template>
    </div>

    <!-- Телефон: планеты бывают рядом, и в нужную пальцем не попасть.
         Полоса карточек внизу открывает любой план одним тапом. -->
    <div v-if="isMobile && plans.length" class="hub-dock" @pointerdown.stop>
      <button
        v-for="p in planets"
        :key="p.plan.id"
        class="hub-dock-card"
        :style="{ '--planet': p.color }"
        @click="openPlan(p.plan)"
      >
        <span class="hub-dock-orb" />
        <span class="hub-dock-text">
          <span class="hub-dock-title">{{ p.plan.title }}</span>
          <span class="hub-dock-meta">
            {{ percent(p.plan.progress) }}%<template v-if="nextStage(p.plan)"> · дальше {{ nextStage(p.plan) }}</template>
          </span>
          <span class="hub-dock-bar"><i :style="{ width: percent(p.plan.progress) + '%' }" /></span>
        </span>
      </button>
    </div>

    <div v-if="error" class="hub-error" @pointerdown.stop @click="error = ''">{{ error }}</div>

    <HubPlanModal v-if="modalOpen" @save="createPlan" @close="modalOpen = false" />
  </div>
</template>

<style scoped>
.hub {
  position: relative;
  width: 100%;
  height: calc(100dvh - var(--tabbar-h, 0px));
  overflow: hidden;
  background: #04050b;
  color: #e9ecf8;
}

.hub-space {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  background:
    radial-gradient(1200px 800px at 18% 20%, rgba(86, 54, 168, 0.22), transparent 60%),
    radial-gradient(900px 700px at 82% 78%, rgba(22, 110, 160, 0.2), transparent 60%),
    radial-gradient(600px 500px at 70% 15%, rgba(190, 70, 120, 0.12), transparent 60%),
    #04050b;
}

.hub-space:active {
  cursor: grabbing;
}

.hub-stars {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.hub-nebula {
  position: absolute;
  inset: -20%;
  pointer-events: none;
  background: radial-gradient(closest-side, rgba(140, 110, 255, 0.07), transparent),
    radial-gradient(closest-side at 30% 70%, rgba(80, 200, 255, 0.05), transparent);
  animation: hub-drift 60s ease-in-out infinite alternate;
}

@keyframes hub-drift {
  to {
    transform: translate(4%, -3%) scale(1.05);
  }
}

.hub-twinkle {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 6px 2px rgba(200, 215, 255, 0.8);
  opacity: 0.2;
  pointer-events: none;
  animation: hub-twinkle ease-in-out infinite;
}

@keyframes hub-twinkle {
  50% {
    opacity: 1;
  }
}

.hub-plane {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
}

.hub-orbit {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  border-radius: 50%;
  border: 1px dashed rgba(160, 175, 230, 0.18);
  pointer-events: none;
}

.hub-orbit.near {
  border-color: rgba(255, 190, 120, 0.22);
}

/* Подпись — внизу орбиты: наверху встаёт первая планета и закрывала её. */
.hub-orbit-label {
  position: absolute;
  bottom: -9px;
  left: 50%;
  translate: -50% 0;
  padding: 0 10px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: rgba(200, 210, 240, 0.5);
  background: #05060d;
  border-radius: 10px;
  white-space: nowrap;
}

.hub-sun {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #fff6d6, #ffcb5c 45%, #ff8a2b 75%, #c2410c);
  box-shadow:
    0 0 40px 12px rgba(255, 170, 60, 0.45),
    0 0 120px 40px rgba(255, 120, 40, 0.18);
  display: grid;
  place-items: center;
  pointer-events: none;
  animation: hub-pulse 6s ease-in-out infinite;
}

@keyframes hub-pulse {
  50% {
    box-shadow:
      0 0 52px 16px rgba(255, 170, 60, 0.55),
      0 0 140px 50px rgba(255, 120, 40, 0.22);
  }
}

.hub-sun-core {
  font-weight: 800;
  font-size: 15px;
  color: #5a2306;
  letter-spacing: 0.06em;
}

.hub-planet {
  position: absolute;
  translate: -50% calc(var(--d) / -2);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.hub-ring {
  position: absolute;
  top: -7px;
  left: 50%;
  margin-left: calc(var(--d) / -2 - 7px);
  pointer-events: none;
}

.hub-ring-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 3;
}

.hub-ring-fill {
  fill: none;
  stroke: var(--planet);
  stroke-width: 3;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px var(--planet));
  transition: stroke-dasharray 0.6s;
}

.hub-planet-body {
  width: var(--d);
  height: var(--d);
  border-radius: 50%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.55), transparent 32%),
    radial-gradient(circle at 70% 75%, rgba(0, 0, 0, 0.55), transparent 60%),
    radial-gradient(circle, color-mix(in srgb, var(--planet) 85%, #fff), var(--planet) 60%, color-mix(in srgb, var(--planet) 45%, #000));
  box-shadow:
    0 0 18px 1px color-mix(in srgb, var(--planet) 45%, transparent),
    inset calc(var(--d) * -0.1) calc(var(--d) * -0.12) calc(var(--d) * 0.25) rgba(0, 0, 0, 0.45);
  transition: transform 0.2s, box-shadow 0.2s;
}

.hub-planet:hover .hub-planet-body {
  transform: scale(1.07);
  box-shadow:
    0 0 28px 4px color-mix(in srgb, var(--planet) 60%, transparent),
    inset calc(var(--d) * -0.1) calc(var(--d) * -0.12) calc(var(--d) * 0.25) rgba(0, 0, 0, 0.45);
}

.hub-planet.far .hub-planet-body {
  filter: saturate(0.8);
}

.hub-planet.paused {
  opacity: 0.55;
}

.hub-planet-label {
  transform: translateX(var(--shift, 0px));
}

/* Ширина — по тексту: у планеты, стоящей в точке нулевой ширины, иначе
   доступно ноль пикселей, и название ломалось по словам. */
.hub-planet-label {
  margin-top: 12px;
  text-align: center;
  width: max-content;
  max-width: 220px;
  pointer-events: none;
}

.hub-planet-title {
  font-weight: 700;
  font-size: 15px;
  color: #f4f6ff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
}

.hub-planet-meta {
  font-size: 12px;
  color: #a7aec8;
  margin-top: 2px;
}

.hub-planet-path {
  margin-top: 5px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px;
  font-size: 11.5px;
}

.hub-step {
  color: #7d849e;
}

.hub-step.active {
  color: #ffd68a;
}

.hub-step.done {
  color: #8fd8a0;
}

.hub-step.goal {
  font-weight: 700;
}

.hub-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.hub-toolbar > * {
  pointer-events: auto;
}

.hub-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  padding: 8px 14px;
  border-radius: 14px;
  background: rgba(14, 16, 28, 0.7);
  border: 1px solid rgba(120, 130, 190, 0.2);
  backdrop-filter: blur(8px);
  font-weight: 700;
  letter-spacing: 0.03em;
}

.hub-tool {
  min-width: 40px;
  height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(120, 130, 190, 0.25);
  background: rgba(14, 16, 28, 0.72);
  backdrop-filter: blur(8px);
  color: #dfe3f4;
  font-size: 15px;
  cursor: pointer;
}

.hub-tool:hover {
  border-color: #8b7cff;
}

.hub-tool.primary {
  background: linear-gradient(135deg, #6d5bff, #3b82f6);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}

.hub-empty {
  position: absolute;
  left: 50%;
  top: 62%;
  translate: -50% 0;
  width: min(420px, calc(100% - 32px));
  text-align: center;
  background: rgba(12, 14, 26, 0.78);
  border: 1px solid rgba(120, 130, 190, 0.22);
  border-radius: 18px;
  padding: 18px 20px 20px;
  backdrop-filter: blur(10px);
}

.hub-empty-title {
  font-weight: 700;
  font-size: 17px;
}

.hub-empty p {
  color: #a7aec8;
  font-size: 13.5px;
  line-height: 1.5;
}

.hub-cta {
  margin-top: 4px;
  padding: 10px 18px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #6d5bff, #3b82f6);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}

.hub-error {
  position: absolute;
  left: 50%;
  bottom: 18px;
  translate: -50% 0;
  max-width: calc(100% - 32px);
  padding: 10px 16px;
  border-radius: 12px;
  background: #2a1418;
  border: 1px solid #5c2a31;
  color: #ffb3b8;
  font-size: 13px;
  cursor: pointer;
}

/* Полоса карточек планов — только телефон */
.hub-dock {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 8px;
  padding: 10px 12px 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  background: linear-gradient(to top, rgba(4, 5, 11, 0.92) 55%, transparent);
}

.hub-dock::-webkit-scrollbar {
  display: none;
}

.hub-dock-card {
  flex: 0 0 auto;
  width: min(250px, 72vw);
  scroll-snap-align: start;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(120, 130, 190, 0.25);
  background: rgba(14, 16, 28, 0.85);
  backdrop-filter: blur(10px);
  color: #e9ecf8;
  text-align: left;
}

.hub-dock-orb {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 19px;
  background:
    radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.5), transparent 34%),
    radial-gradient(circle, color-mix(in srgb, var(--planet) 80%, #fff), var(--planet) 60%, color-mix(in srgb, var(--planet) 45%, #000));
}

.hub-dock-text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hub-dock-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hub-dock-meta {
  font-size: 12px;
  color: #9aa2c4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hub-dock-bar {
  height: 3px;
  margin-top: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.hub-dock-bar i {
  display: block;
  height: 100%;
  background: var(--planet);
}

/* Планета над солнцем подписывается сверху: подпись снизу ложилась на солнце. */
.hub-planet.label-up .hub-planet-label {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  translate: -50% 0;
  margin: 0;
}

.hub-plane.compact .hub-planet-meta,
.hub-plane.compact .hub-planet-path {
  display: none;
}

.hub-plane.compact .hub-planet-label {
  margin-top: 7px;
}

@media (max-width: 768px) {
  .hub-sun {
    width: 54px;
    height: 54px;
  }

  .hub-sun-core {
    font-size: 12px;
  }

  .hub-planet-title {
    font-size: 13px;
  }

  .hub-planet-label {
    margin-top: 9px;
    max-width: 150px;
  }

  .hub-planet-meta {
    font-size: 11.5px;
  }

  .hub-orbit-label {
    font-size: 10.5px;
  }

  .hub-empty {
    top: auto;
    bottom: 24px;
  }

  .hub-error {
    bottom: 110px;
  }
}

@media (max-width: 640px) {
  .hub-toolbar {
    top: calc(8px + env(safe-area-inset-top, 0px));
    left: 8px;
    right: 8px;
    gap: 6px;
  }

  .hub-brand {
    padding: 8px 10px;
  }

  .hub-tool {
    min-width: 38px;
    height: 38px;
    padding: 0 10px;
  }
}
</style>
