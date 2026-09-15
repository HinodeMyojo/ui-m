<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue";
import {
  JP_STROKE_BOX,
  JP_GROUP_COLORS,
  JP_WRITE_BY_KEYS,
  JP_WRITE_OUTLINE,
  JP_WRITE_ZONES,
  JP_WRITE_STAGE_LABELS,
} from "@/components/japaneseApi.js";

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

// Лестница помощи. Один и тот же холст проверяет разное в зависимости от того,
// что на нём осталось: по видимому контуру знак «пишет» и тот, кто его не
// помнит, а на пустом квадрате — только тот, кто помнит.
//
// Ступени ровно те, о которых просил пользователь: «первая итерация — тебе
// показывают порядок написания ключей; следующая — просто иероглиф; следующая —
// только зоны по цветам, где были ключи; дальше — сам, без помощи». Номера
// ступеней общие с сервером и лежат в japaneseApi.js.

const props = defineProps({
  paths: { type: Array, default: () => [] },
  char: { type: String, default: "" },
  // Ступень письма, 1..4. Ноль и отсутствие — обычная обводка по контуру,
  // как её открывает лист знака вне сессии.
  stage: { type: Number, default: 0 },
  // Какие черты какому ключу принадлежат: [{char, meaningRu, strokes:[..]}].
  // Нужны первой ступени (раскрасить) и третьей (оставить одни зоны).
  groups: { type: Array, default: () => [] },
});
const emit = defineEmits(["done"]);

// Порог в координатах KanjiVG (квадрат 109×109). 11 единиц — это примерно
// десятая часть знака: попасть пальцем точнее нельзя, а мимо черты уже не
// промахнёшься.
const TOLERANCE = 11;
const ENDPOINT_TOLERANCE = 26;
const SAMPLES = 24;

// Строгость зависит от того, что видно на экране, и это не поблажка.
//
// По контуру человек ведёт пальцем по линии — требовать попадания в линию
// честно. По зонам и по памяти он воспроизводит знак, видя в лучшем случае
// прямоугольник: там проверяется форма, направление и примерное место, а не
// попадание в невидимую линию с точностью до десятой доли квадрата. На этом и
// сломалось письмо 白: первая черта короткая (33 единицы), допуск по концам
// считается от её длины и выходил 11.7 — то есть начать надо было в
// тридцати пикселях от точки, которой на экране нет.
const STAGE_TOLERANCE = {
  [JP_WRITE_BY_KEYS]: 12,
  [JP_WRITE_OUTLINE]: TOLERANCE,
  [JP_WRITE_ZONES]: 16,
  [JP_WRITE_BLIND]: 18,
};

// После скольких промахов по одной черте показываем её саму, и после
// скольких засчитываем. Застрять на одной черте — худшее, что может случиться
// с шестиминутной сессией: человек уходит не доучив, а карточка остаётся
// недописанной.
const HELP_AFTER = 2;
const FORCE_AFTER = 5;

const svg = ref(null);
const box = ref(null);
const refPoints = ref([]); // точки эталонных черт
const zones = ref([]); // прямоугольники ключей для третьей ступени
const doneCount = ref(0); // сколько черт уже принято
const drawing = ref(false);
const current = ref([]); // текущий жест в координатах KanjiVG
const shake = ref(false); // черта не принята — короткая тряска вместо вибрации
const attempts = ref(0);
const misses = ref(0);
// Промахи по черте, которую пишут прямо сейчас: по ним решается, пора ли
// показать её и пора ли зачесть.
const strokeMisses = ref(0);
// Почему черта не принята — словами. Молчаливая тряска не учит: человек
// повторяет ровно то же самое и решает, что сломан не он, а программа.
const rejected = ref("");

// Что видно на этой ступени. Вне сессии (stage = 0) остаётся прежнее
// поведение: контур показан целиком.
const showOutline = computed(() => props.stage === 0 || props.stage <= JP_WRITE_OUTLINE);
const showColors = computed(() => props.stage === JP_WRITE_BY_KEYS && props.groups.length > 0);
const showZones = computed(() => props.stage === JP_WRITE_ZONES && zones.value.length > 0);

// Черту показываем и на слепых ступенях, если она не даётся: это помощь, а
// не отмена задания — следующую снова пишут по памяти.
const helpNow = computed(() => strokeMisses.value >= HELP_AFTER);

const tolerance = computed(() => STAGE_TOLERANCE[props.stage] || TOLERANCE);
const stageLabel = computed(() => JP_WRITE_STAGE_LABELS[props.stage] || "");

// Цвет черты по ключу, которому она принадлежит. Цвета те же, что в разборе
// состава и в анимации порядка: глаз не должен искать соответствие заново.
const strokeColor = computed(() => {
  const out = new Array(props.paths.length).fill("");
  props.groups.forEach((group, gi) => {
    const color = JP_GROUP_COLORS[gi % JP_GROUP_COLORS.length];
    for (const index of group.strokes || []) out[index] = color;
  });
  return out;
});

// Какой ключ пишется прямо сейчас — подпись к первой ступени. Порядок черт без
// имени ключа остаётся порядком палочек; с именем это уже «сначала человек,
// потом дерево».
const currentGroup = computed(() => {
  if (!showColors.value) return null;
  return props.groups.find((g) => (g.strokes || []).includes(doneCount.value)) || null;
});

const total = computed(() => props.paths.length);
const finished = computed(() => total.value > 0 && doneCount.value >= total.value);

// Точки эталона снимаем у настоящих элементов: считать длину пути по строке
// команд SVG — отдельная библиотека ради одной цифры.
async function measure() {
  await nextTick();
  const nodes = svg.value?.querySelectorAll("path.jtc-ref") || [];
  const boxes = [];
  refPoints.value = Array.from(nodes).map((node) => {
    try {
      const len = node.getTotalLength();
      const pts = [];
      for (let i = 0; i < SAMPLES; i++) {
        const p = node.getPointAtLength((len * i) / (SAMPLES - 1));
        pts.push([p.x, p.y]);
      }
      boxes.push(node.getBBox());
      return pts;
    } catch {
      boxes.push(null);
      return [];
    }
  });
  zones.value = measureZones(boxes);
}

// Зоны третьей ступени — охватывающие прямоугольники ключей. Считаются по
// настоящим границам черт (getBBox), а не по разметке: где именно на квадрате
// стоит ключ, знает только начертание.
//
// Прямоугольник чуть шире черт: обводка по самой кромке читается как контур, а
// зона должна говорить «здесь», а не «вот так».
function measureZones(boxes) {
  const PAD = 3;
  const out = [];
  props.groups.forEach((group, gi) => {
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const index of group.strokes || []) {
      const b = boxes[index];
      if (!b) continue;
      x1 = Math.min(x1, b.x);
      y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.width);
      y2 = Math.max(y2, b.y + b.height);
    }
    if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;
    out.push({
      char: group.char,
      color: JP_GROUP_COLORS[gi % JP_GROUP_COLORS.length],
      x: Math.max(0, x1 - PAD),
      y: Math.max(0, y1 - PAD),
      w: Math.min(JP_STROKE_BOX, x2 - x1 + PAD * 2),
      h: Math.min(JP_STROKE_BOX, y2 - y1 + PAD * 2),
    });
  });
  return out;
}

function reset() {
  doneCount.value = 0;
  current.value = [];
  attempts.value = 0;
  misses.value = 0;
  strokeMisses.value = 0;
  rejected.value = "";
}

// Следим за приметами знака, а не за самим массивом путей.
//
// Это не придирка к стилю: родитель отдаёт `card.strokePaths || []`, и при
// отсутствии путей это каждый раз новый массив. Слежка за ссылкой срабатывала
// на каждой перерисовке, measure() писала зоны, зоны перерисовывали холст — и
// вкладка падала целиком. Поймано живым прогоном: браузер умирал на второй
// обводке.
watch(
  () => `${props.char}|${props.stage}|${props.paths.length}`,
  async () => {
    reset();
    await measure();
  },
  { immediate: true },
);

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
  const verdict = check(stroke, refPoints.value[doneCount.value]);
  if (verdict.ok) {
    accept();
    return;
  }

  misses.value++;
  strokeMisses.value++;
  rejected.value = verdict.reason;
  shake.value = true;
  setTimeout(() => (shake.value = false), 260);

  // Пятый промах по одной и той же черте — засчитываем и идём дальше. Промахи
  // никуда не деваются: они уходят в оценку карточки, и «трудно» человек
  // получит честно. А вот упереться в черту и не выйти из карточки вовсе —
  // это не строгость, это тупик.
  if (strokeMisses.value >= FORCE_AFTER) {
    accept();
    rejected.value = "засчитано с натяжкой — посмотри, как она пишется";
  }
}

function accept() {
  doneCount.value++;
  strokeMisses.value = 0;
  rejected.value = "";
  if (finished.value) {
    emit("done", { attempts: attempts.value, misses: misses.value });
  }
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

// check — принята ли черта, и если нет, то чем она не подошла. Причина не
// украшение: без неё человек повторяет то же самое движение и приходит к
// выводу, что сломана программа. Чаще всего он прав лишь наполовину — черта
// ведётся не в ту сторону или не доводится до конца.
function check(stroke, reference) {
  if (!reference?.length) return { ok: false, reason: "начертание не загрузилось" };
  const drawn = thin(stroke, SAMPLES);
  const last = drawn.length - 1;

  const refLen = polylineLength(reference);
  const refEnd = reference[reference.length - 1];

  // Концы важнее середины: 一 справа налево ложится на эталон идеально, и
  // только направление отличает знак от зеркала. Допуск считается от длины
  // черты, но с полом: у короткой черты доля от длины выходит меньше, чем
  // палец вообще способен повторить, — а на слепых ступенях и целиться не во
  // что.
  const blind = !showOutline.value;
  const endTolerance = blind
    ? Math.max(14, Math.min(30, refLen * 0.4))
    : Math.max(9, Math.min(ENDPOINT_TOLERANCE, refLen * 0.35));

  const head = Math.hypot(drawn[0][0] - reference[0][0], drawn[0][1] - reference[0][1]);
  const tail = Math.hypot(drawn[last][0] - refEnd[0], drawn[last][1] - refEnd[1]);

  // Черту надо провести целиком. У коротких черт — а первая черта 語 всего
  // одиннадцать единиц — обведённая половина укладывается и в допуск по
  // концам, и в расстояние до линии: единственное, чем она отличается, это
  // длина. Верхней границы нет намеренно: дрожь руки длину только добавляет.
  if (polylineLength(stroke) < refLen * 0.6) {
    return { ok: false, reason: "черта короче — веди её до конца" };
  }

  if (head > endTolerance || tail > endTolerance) {
    // Перевёрнутая черта ложится на эталон идеально, и человек искренне не
    // понимает, чем она плоха. Говорим прямо: порядок и направление черт —
    // половина того, ради чего письмо вообще спрашивают.
    const reverseHead = Math.hypot(drawn[0][0] - refEnd[0], drawn[0][1] - refEnd[1]);
    const reverseTail = Math.hypot(
      drawn[last][0] - reference[0][0],
      drawn[last][1] - reference[0][1],
    );
    if (reverseHead <= endTolerance && reverseTail <= endTolerance) {
      return { ok: false, reason: "эта черта ведётся в другую сторону" };
    }
    if (head > endTolerance && tail <= endTolerance) {
      return { ok: false, reason: "начало черты не там" };
    }
    if (tail > endTolerance && head <= endTolerance) {
      return { ok: false, reason: "конец черты не там" };
    }
    return { ok: false, reason: "черта не на своём месте" };
  }

  // Обе стороны: первая ловит, когда рисуют мимо, вторая — когда обвели
  // только кусок черты и остановились.
  const off = meanDistanceTo(drawn, reference);
  const uncovered = meanDistanceTo(reference, drawn);
  if (off > tolerance.value) return { ok: false, reason: "форма не та" };
  if (uncovered > tolerance.value) return { ok: false, reason: "черта пройдена не вся" };
  return { ok: true, reason: "" };
}

// --- Отрисовка ---

const currentPath = computed(() => {
  if (current.value.length < 2) return "";
  return current.value.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
});

// Пропуск черты. Называется тем, что делает: кнопка «Показать черту» на самом
// деле переходила к следующей, и человек, нажав её в надежде увидеть образец,
// терял черту вместе с оценкой. Сам образец теперь показывается сам после
// двух промахов и денег не стоит — стоит промах, который уже случился.
function hint() {
  misses.value++;
  strokeMisses.value = 0;
  rejected.value = "";
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

        <!-- Зоны ключей: третья ступень. Контура нет, но видно, где что
             стоит, — это подсказка про расположение, а не про начертание. -->
        <g v-if="showZones" class="jtc-zones">
          <rect
            v-for="z in zones"
            :key="`zone-${z.char}`"
            :x="z.x"
            :y="z.y"
            :width="z.w"
            :height="z.h"
            :stroke="z.color"
            :fill="z.color"
            rx="3"
          />
        </g>

        <!-- Эталон: измеряется всегда, видно — только если ступень это
             позволяет. Черты первой ступени раскрашены по ключам: видно не
             только порядок, но и то, какой ключ сейчас пишется. -->
        <path
          v-for="(d, i) in paths"
          :key="`ref-${i}`"
          :d="d"
          class="jtc-ref"
          :class="{
            'is-hidden': !showOutline && i >= doneCount && !(helpNow && i === doneCount),
            'is-next': i === doneCount && (showOutline || helpNow),
          }"
          :style="showColors && i >= doneCount ? { stroke: strokeColor[i] || undefined } : null"
          :opacity="showColors && i > doneCount ? 0.35 : null"
        />

        <!-- Уже принятые черты остаются на месте: знак собирается на глазах. -->
        <path v-for="i in doneCount" :key="`ok-${i}`" :d="paths[i - 1]" class="jtc-ok" />

        <path v-if="currentPath" :d="currentPath" class="jtc-ink" />
      </svg>
    </div>

    <!-- Лестница ступеней: видно, где ты и сколько осталось. Без неё письмо
         четыре раза подряд выглядит как заевшая пластинка. -->
    <div v-if="stage" class="jtc-stairs">
      <span
        v-for="s in 4"
        :key="s"
        class="jtc-stair"
        :class="{ 'is-done': s < stage, 'is-now': s === stage }"
      ></span>
      <span class="jtc-stage-label">{{ stage }}/4 — {{ stageLabel }}</span>
    </div>

    <div v-if="currentGroup" class="jtc-now">
      <span class="jtc-now-char">{{ currentGroup.char }}</span>
      <span v-if="currentGroup.meaningRu" class="jtc-now-meaning">{{ currentGroup.meaningRu }}</span>
    </div>

    <div v-if="rejected" class="jtc-why">{{ rejected }}</div>

    <div class="jtc-bar">
      <span class="jtc-count">{{ doneCount }} / {{ total }}</span>
      <span v-if="misses" class="jtc-miss">промахов {{ misses }}</span>
      <span class="jtc-spacer"></span>
      <button v-if="!finished" class="jtc-btn" @click="hint">Пропустить черту</button>
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

/* Зоны ключей: заливка едва заметная, рамка пунктиром. Сплошной прямоугольник
   поверх пустого квадрата читается как рамка для рисования, а не как «здесь
   стоял ключ». */
.jtc-zones rect {
  fill-opacity: 0.08;
  stroke-width: 1;
  stroke-dasharray: 3 3;
  stroke-opacity: 0.55;
}

.jtc-stairs {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  max-width: 300px;
  font-size: 12px;
  color: var(--m-muted, #7a7f8e);
}

.jtc-stair {
  width: 22px;
  height: 4px;
  border-radius: 2px;
  background: #2a2d38;
}

.jtc-stair.is-done {
  background: #63c94f;
}

.jtc-stair.is-now {
  background: var(--m-accent, #6e4aff);
}

.jtc-stage-label {
  margin-left: 4px;
}

.jtc-now {
  display: flex;
  align-items: baseline;
  gap: 7px;
  width: 100%;
  max-width: 300px;
  font-size: 13px;
  color: #cfd3e0;
}

.jtc-now-char {
  font-size: 19px;
}

.jtc-now-meaning {
  color: var(--m-muted, #7a7f8e);
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

/* Причина отказа стоит под холстом, а не поверх него: поверх она закрывала бы
   то самое место, куда надо смотреть. */
.jtc-why {
  font-size: 12px;
  color: #ffd666;
  text-align: center;
  min-height: 15px;
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
