<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { JP_STROKE_BOX } from "@/components/japaneseApi.js";

// Обводка знака пальцем. Проверка идёт по KanjiVG — тем же путям черт, что
// рисует анимация порядка: эталон уже лежит в базе, сравнивать есть с чем.
//
// Всё считается в браузере, ничего никуда не отправляется. Это было решено
// заранее: сервер free-tier, распознавание рукописи на нём не живёт, а здесь
// оно и не нужно — мы не угадываем знак, а сверяем черту с известной.
//
// Как сверяем. Эталонная черта и нарисованная приводятся к одному числу точек
// по длине дуги, дальше считается среднее расстояние между парами. Отдельно
// проверяются концы: 一 справа налево — это не 一, а зеркало, и по среднему
// расстоянию оно проходит на ура.

const props = defineProps({
  paths: { type: Array, default: () => [] },
  char: { type: String, default: "" },
  // Показывать ли контур целиком. На ранней стадии обводят по видимому
  // образцу, дальше остаётся только уже проведённое.
  guide: { type: Boolean, default: true },
});
const emit = defineEmits(["done"]);

// Порог в координатах KanjiVG (квадрат 109×109). 11 единиц — это примерно
// десятая часть знака: попасть пальцем точнее нельзя, а мимо черты уже не
// промахнёшься.
const TOLERANCE = 11;
const ENDPOINT_TOLERANCE = 26;
const SAMPLES = 24;

const svg = ref(null);
const box = ref(null);
const refPoints = ref([]); // точки эталонных черт
const doneCount = ref(0); // сколько черт уже принято
const drawing = ref(false);
const current = ref([]); // текущий жест в координатах KanjiVG
const shake = ref(false); // черта не принята — короткая тряска вместо вибрации
const attempts = ref(0);
const misses = ref(0);

const total = computed(() => props.paths.length);
const finished = computed(() => total.value > 0 && doneCount.value >= total.value);

// Точки эталона снимаем у настоящих элементов: считать длину пути по строке
// команд SVG — отдельная библиотека ради одной цифры.
async function measure() {
  await nextTick();
  const nodes = svg.value?.querySelectorAll("path.jtc-ref") || [];
  refPoints.value = Array.from(nodes).map((node) => {
    try {
      const len = node.getTotalLength();
      const pts = [];
      for (let i = 0; i < SAMPLES; i++) {
        const p = node.getPointAtLength((len * i) / (SAMPLES - 1));
        pts.push([p.x, p.y]);
      }
      return pts;
    } catch {
      return [];
    }
  });
}

function reset() {
  doneCount.value = 0;
  current.value = [];
  attempts.value = 0;
  misses.value = 0;
}

watch(() => props.paths, async () => {
  reset();
  await measure();
}, { immediate: true });

// --- Ввод ---

function toBox(event) {
  const rect = box.value.getBoundingClientRect();
  const scale = JP_STROKE_BOX / rect.width;
  return [(event.clientX - rect.left) * scale, (event.clientY - rect.top) * scale];
}

function start(event) {
  if (finished.value) return;
  drawing.value = true;
  current.value = [toBox(event)];
  box.value.setPointerCapture?.(event.pointerId);
}

function move(event) {
  if (!drawing.value) return;
  event.preventDefault();
  current.value.push(toBox(event));
}

function end() {
  if (!drawing.value) return;
  drawing.value = false;
  const stroke = current.value;
  current.value = [];
  if (stroke.length < 2) return;

  attempts.value++;
  if (matches(stroke, refPoints.value[doneCount.value])) {
    doneCount.value++;
    if (finished.value) {
      emit("done", { attempts: attempts.value, misses: misses.value });
    }
    return;
  }
  misses.value++;
  shake.value = true;
  setTimeout(() => (shake.value = false), 260);
}

// --- Сверка ---

// Расстояние от точки до отрезка — основа всей сверки.
function pointToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Среднее расстояние от точек одной ломаной до другой ломаной целиком.
//
// Сравнивать точки по порядковому номеру нельзя: рука дрожит, из-за зигзага
// длина линии вырастает, равномерная выборка съезжает вдоль пути — и верно
// проведённая черта не проходит проверку. Расстояние до ближайшего места
// линии от дрожи не зависит.
function meanDistanceTo(points, polyline) {
  let sum = 0;
  for (const p of points) {
    let best = Infinity;
    for (let i = 1; i < polyline.length; i++) {
      const d = pointToSegment(p, polyline[i - 1], polyline[i]);
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / points.length;
}

function polylineLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return sum;
}

// Прореживаем жест: точек в нём бывает под три сотни, а на сверку хватает
// пары десятков — иначе на каждый штрих тратится время, которого в
// шестиминутной сессии нет.
function thin(points, count) {
  if (points.length <= count) return points;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(points[Math.round((i * (points.length - 1)) / (count - 1))]);
  }
  return out;
}

function matches(stroke, reference) {
  if (!reference?.length) return false;
  const drawn = thin(stroke, SAMPLES);

  // Концы важнее середины: 一 справа налево ложится на эталон идеально, и
  // только направление отличает знак от зеркала. Допуск считается от длины
  // черты — у короткой перепутанные концы разъезжаются всего на десяток
  // единиц, и общий порог в 26 пропустил бы её как верную.
  const refLen = polylineLength(reference);

  // Черту надо провести целиком. У коротких черт — а первая черта 語 всего
  // одиннадцать единиц — обведённая половина укладывается и в допуск по
  // концам, и в расстояние до линии: единственное, чем она отличается, это
  // длина. Верхней границы нет намеренно: дрожь руки длину только добавляет.
  if (polylineLength(stroke) < refLen * 0.6) return false;

  const endTolerance = Math.max(9, Math.min(ENDPOINT_TOLERANCE, refLen * 0.35));
  const last = drawn.length - 1;
  const head = Math.hypot(drawn[0][0] - reference[0][0], drawn[0][1] - reference[0][1]);
  const tail = Math.hypot(
    drawn[last][0] - reference[reference.length - 1][0],
    drawn[last][1] - reference[reference.length - 1][1],
  );
  if (head > endTolerance || tail > endTolerance) return false;

  // Обе стороны: первая ловит, когда рисуют мимо, вторая — когда обвели
  // только кусок черты и остановились.
  const off = meanDistanceTo(drawn, reference);
  const uncovered = meanDistanceTo(reference, drawn);
  return off <= TOLERANCE && uncovered <= TOLERANCE;
}

// --- Отрисовка ---

const currentPath = computed(() => {
  if (current.value.length < 2) return "";
  return current.value.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
});

function hint() {
  // Подсказка — не бесплатная: она засчитывается промахом, иначе обводка
  // превращается в обводку по подсказке.
  misses.value++;
  doneCount.value++;
  if (finished.value) emit("done", { attempts: attempts.value, misses: misses.value });
}

onMounted(measure);

defineExpose({ reset });
</script>

<template>
  <div class="jtc">
    <div
      ref="box"
      class="jtc-box"
      :class="{ 'is-shake': shake, 'is-done': finished }"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="end"
      @pointercancel="end"
      @pointerleave="end"
    >
      <svg ref="svg" :viewBox="`0 0 ${JP_STROKE_BOX} ${JP_STROKE_BOX}`" class="jtc-svg">
        <g class="jtc-guide">
          <line :x1="JP_STROKE_BOX / 2" y1="0" :x2="JP_STROKE_BOX / 2" :y2="JP_STROKE_BOX" />
          <line x1="0" :y1="JP_STROKE_BOX / 2" :x2="JP_STROKE_BOX" :y2="JP_STROKE_BOX / 2" />
        </g>

        <!-- Эталон: измеряется всегда, видно — только если просили образец. -->
        <path
          v-for="(d, i) in paths"
          :key="`ref-${i}`"
          :d="d"
          class="jtc-ref"
          :class="{ 'is-hidden': !guide && i >= doneCount, 'is-next': guide && i === doneCount }"
        />

        <!-- Уже принятые черты остаются на месте: знак собирается на глазах. -->
        <path v-for="i in doneCount" :key="`ok-${i}`" :d="paths[i - 1]" class="jtc-ok" />

        <path v-if="currentPath" :d="currentPath" class="jtc-ink" />
      </svg>
    </div>

    <div class="jtc-bar">
      <span class="jtc-count">{{ doneCount }} / {{ total }}</span>
      <span v-if="misses" class="jtc-miss">промахов {{ misses }}</span>
      <span class="jtc-spacer"></span>
      <button v-if="!finished" class="jtc-btn" @click="hint">Показать черту</button>
      <button v-if="doneCount || misses" class="jtc-btn" @click="reset">Заново</button>
    </div>
  </div>
</template>

<style scoped>
.jtc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  width: 100%;
}

/* Квадрат тянется по ширине, но не больше, чем помещается по высоте: на
   телефоне под холстом ещё кнопки, и подниматься выше середины ему нельзя. */
.jtc-box {
  width: 100%;
  max-width: 300px;
  aspect-ratio: 1;
  border-radius: 14px;
  background: #16171d;
  border: 1px solid var(--m-line, #262933);
  touch-action: none; /* иначе жест уедет в скролл страницы */
  -webkit-tap-highlight-color: transparent;
  cursor: crosshair;
}

.jtc-box.is-done {
  border-color: rgba(99, 201, 79, 0.6);
}

/* Черта не принята — короткая тряска. Вибрации в Safari нет, а сказать об
   ошибке чем-то надо. */
.jtc-box.is-shake {
  animation: jtc-shake 0.25s;
}

@keyframes jtc-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-6px);
  }
  75% {
    transform: translateX(6px);
  }
}

.jtc-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.jtc-guide line {
  stroke: #2a2d38;
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.jtc-ref {
  fill: none;
  stroke: #33363f;
  stroke-width: 3.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.jtc-ref.is-hidden {
  stroke: transparent;
}

/* Следующая черта подсвечена: обводят её, а не любую. */
.jtc-ref.is-next {
  stroke: #4a4270;
}

.jtc-ok {
  fill: none;
  stroke: #63c94f;
  stroke-width: 3.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.jtc-ink {
  fill: none;
  stroke: #a58bff;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.jtc-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 300px;
  font-size: 12px;
  color: var(--m-muted, #7a7f8e);
}

.jtc-count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.jtc-miss {
  color: var(--m-yellow, #ffd666);
}

.jtc-spacer {
  flex: 1;
}

.jtc-btn {
  min-height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  font-size: 12px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
</style>
