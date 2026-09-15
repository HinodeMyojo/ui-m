<script setup>
import { ref, computed, onMounted, watch } from "vue";

// Письмо буквы пальцем. Проверка идёт по самой букве, а не по эталонным
// чертам: свободного набора контуров для арабицы, аналога KanjiVG, не
// существует, зато буква есть в любом шрифте — и её начертание можно
// нарисовать в невидимый холст и сравнить с тем, что провёл палец.
//
// Считается две вещи:
//   • попадание — какая доля проведённого легла на букву (не мимо);
//   • покрытие — какую долю буквы палец закрасил (не half-heartedly).
// Обе нужны: одно попадание проходит точкой в середине буквы, одно покрытие —
// закрашиванием всего квадрата.
//
// Пороги намеренно снисходительные. Урок японского модуля: дрожь руки и
// толщина пальца — это не незнание знака, и строгая проверка заваливает
// верную попытку чаще, чем пропускает неверную.

const props = defineProps({
  char: { type: String, required: true },
  // 1 — контур виден целиком, 2 — от него остался бледный след, 3 — пустой
  // квадрат: буква пишется по памяти.
  stage: { type: Number, default: 1 },
});
const emit = defineEmits(["result"]);

// Пороги подобраны прогоном по настоящим буквам (см. ниже). Различает всё
// «попадание»: провёденное по букве даёт 0.76–0.86, каракули поперёк — 0.06–0.14.
// Покрытие оставлено низким намеренно: им проверяется только то, что человек
// не поставил точку в середине и не ушёл, а сколько именно штрихов он сделал —
// его дело. ك одним движением закрашивает 0.37, двумя — заметно больше.
const PASS_INSIDE = 0.6;
const PASS_COVER = 0.33;
// Сетка, на которой считаются доли. Пиксель в пиксель на телефоне — это
// четверть миллиона точек на каждую проверку; ста двадцати хватает.
const GRID = 120;

const box = ref(null);
const inkCanvas = ref(null);
const size = ref(280);
const drawing = ref(false);
const strokes = ref([]); // [[{x,y}...], ...] в долях 0..1
const verdict = ref(null); // { pass, inside, cover }
const hint = ref(false);

let mask = null; // Uint8Array GRID*GRID — где стоит буква
let maskArea = 0;

const guideOpacity = computed(() => {
  if (props.stage <= 1) return 0.3;
  if (props.stage === 2) return 0.09;
  return 0;
});

// Шрифт берём тот же, что и весь арабский текст раздела: маска обязана
// совпадать с тем, что человек видит на экране.
const FONT = '"Geeza Pro", "Noto Naskh Arabic", "Traditional Arabic", serif';

function buildMask() {
  const c = document.createElement("canvas");
  c.width = GRID;
  c.height = GRID;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, GRID, GRID);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  // Обводка поверх заливки утолщает начертание: тонкие хвосты (у ر, ي) иначе
  // занимают пару пикселей, и попасть в них пальцем нельзя в принципе.
  ctx.lineWidth = 6;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(GRID * 0.62)}px ${FONT}`;
  ctx.fillText(props.char, GRID / 2, GRID / 2);
  ctx.strokeText(props.char, GRID / 2, GRID / 2);

  const data = ctx.getImageData(0, 0, GRID, GRID).data;
  mask = new Uint8Array(GRID * GRID);
  maskArea = 0;
  for (let i = 0; i < mask.length; i++) {
    if (data[i * 4 + 3] > 40) {
      mask[i] = 1;
      maskArea++;
    }
  }
}

function redraw() {
  const canvas = inkCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const s = canvas.width;
  ctx.clearRect(0, 0, s, s);

  // Подсказка: сама буква под пальцем. На третьей ступени её нет вовсе, а
  // кнопка «подсмотреть» показывает её на секунду — и засчитывает попытку
  // как трудную.
  const opacity = hint.value ? 0.35 : guideOpacity.value;
  if (opacity > 0) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#e8eaf2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(s * 0.62)}px ${FONT}`;
    ctx.fillText(props.char, s / 2, s / 2);
    ctx.restore();
  }

  ctx.lineWidth = s * 0.08;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = verdict.value ? (verdict.value.pass ? "#63c94f" : "#e5484d") : "#18a999";
  for (const stroke of strokes.value) {
    if (stroke.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x * s, stroke[0].y * s);
    for (const point of stroke.slice(1)) ctx.lineTo(point.x * s, point.y * s);
    ctx.stroke();
  }
}

function pointFrom(event) {
  const rect = inkCanvas.value.getBoundingClientRect();
  const touch = event.touches?.[0] || event.changedTouches?.[0] || event;
  return {
    x: Math.min(1, Math.max(0, (touch.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (touch.clientY - rect.top) / rect.height)),
  };
}

function start(event) {
  if (verdict.value) return;
  event.preventDefault();
  drawing.value = true;
  strokes.value.push([pointFrom(event)]);
  redraw();
}

function move(event) {
  if (!drawing.value) return;
  event.preventDefault();
  strokes.value[strokes.value.length - 1].push(pointFrom(event));
  redraw();
}

function end() {
  drawing.value = false;
}

function clear() {
  strokes.value = [];
  verdict.value = null;
  redraw();
}

// check рисует проведённое в такую же сетку и считает две доли.
function check() {
  if (!mask || !strokes.value.length) return;
  const c = document.createElement("canvas");
  c.width = GRID;
  c.height = GRID;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.lineWidth = GRID * 0.085;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#fff";
  for (const stroke of strokes.value) {
    if (!stroke.length) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x * GRID, stroke[0].y * GRID);
    if (stroke.length === 1) ctx.lineTo(stroke[0].x * GRID + 0.1, stroke[0].y * GRID);
    else for (const point of stroke.slice(1)) ctx.lineTo(point.x * GRID, point.y * GRID);
    ctx.stroke();
  }

  const data = ctx.getImageData(0, 0, GRID, GRID).data;
  let ink = 0;
  let inside = 0;
  let covered = 0;
  for (let i = 0; i < mask.length; i++) {
    const drawn = data[i * 4 + 3] > 40;
    if (drawn) {
      ink++;
      if (mask[i]) inside++;
    }
    if (mask[i] && drawn) covered++;
  }
  if (!ink) return;

  const insideRatio = inside / ink;
  const coverRatio = maskArea ? covered / maskArea : 0;
  // Подсмотревший проходит, но ответ считается трудным: подсказка не должна
  // засчитываться наравне с письмом по памяти.
  const pass = insideRatio >= PASS_INSIDE && coverRatio >= PASS_COVER;
  verdict.value = { pass, inside: insideRatio, cover: coverRatio, hinted: hint.value };
  redraw();
  emit("result", verdict.value);
}

function peek() {
  hint.value = true;
  redraw();
  setTimeout(() => {
    hint.value = false;
    redraw();
  }, 900);
}

function fit() {
  const width = box.value?.clientWidth || 280;
  size.value = Math.max(200, Math.min(320, width));
  const canvas = inkCanvas.value;
  if (canvas) {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.value * ratio;
    canvas.height = size.value * ratio;
    canvas.style.width = `${size.value}px`;
    canvas.style.height = `${size.value}px`;
  }
  redraw();
}

watch(
  () => [props.char, props.stage],
  () => {
    clear();
    buildMask();
    redraw();
  },
);

onMounted(() => {
  buildMask();
  fit();
});

defineExpose({ check, clear });
</script>

<template>
  <div ref="box" class="art">
    <div class="art-frame" :style="{ width: size + 'px', height: size + 'px' }">
      <canvas
        ref="inkCanvas"
        class="art-ink"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="end"
        @pointerleave="end"
        @touchstart.prevent="start"
        @touchmove.prevent="move"
        @touchend="end"
      ></canvas>
    </div>

    <p v-if="verdict" class="art-verdict" :class="{ pass: verdict.pass }">
      {{ verdict.pass ? "Похоже" : "Не сошлось" }}
      <small>по линии {{ Math.round(verdict.inside * 100) }}%, закрашено {{ Math.round(verdict.cover * 100) }}%</small>
    </p>
    <p v-else class="art-hint">
      {{
        stage >= 3
          ? "Напишите букву по памяти"
          : stage === 2
            ? "Обведите бледный след"
            : "Обведите букву пальцем"
      }}
    </p>

    <div class="art-btns">
      <button class="ar-btn ar-btn-sm" @click="clear">Стереть</button>
      <button v-if="stage >= 2 && !verdict" class="ar-btn ar-btn-sm" @click="peek">Подсмотреть</button>
      <button v-if="!verdict" class="ar-btn ar-btn-sm ar-btn-accent" :disabled="!strokes.length" @click="check">
        Проверить
      </button>
    </div>
  </div>
</template>

<style scoped>
.art {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.art-frame {
  border-radius: 16px;
  border: 1px dashed #2f3340;
  background: #1b1d24;
  /* Квадрат для письма: линия посередине не рисуется намеренно — арабская
     буква стоит на строке, а не между линеек прописи. */
  touch-action: none;
}

.art-ink {
  display: block;
  touch-action: none;
}

.art-hint,
.art-verdict {
  margin: 0;
  font-size: 13px;
  color: #7a7f8e;
  text-align: center;
}

.art-verdict {
  color: #e5484d;
  font-weight: 700;
}

.art-verdict.pass {
  color: #63c94f;
}

.art-verdict small {
  display: block;
  font-weight: 400;
  color: #7a7f8e;
}

.art-btns {
  display: flex;
  gap: 6px;
}
</style>
