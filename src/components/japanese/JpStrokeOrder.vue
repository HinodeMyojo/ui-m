<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { JP_STROKE_BOX, JP_GROUP_COLORS } from "@/components/japaneseApi.js";

// Порядок черт по данным KanjiVG. Черты приходят готовыми путями в квадрате
// 109×109 и уже в порядке написания — рисовать их нужно по одной, иначе это
// просто картинка иероглифа, которых и так полный экран.
//
// Длина каждого пути меряется у настоящего элемента (getTotalLength): считать
// её по строке команд SVG — отдельная библиотека ради одной цифры.

const props = defineProps({
  paths: { type: Array, default: () => [] },
  size: { type: Number, default: 200 },
  // Разбиение черт по составляющим: [{ char, meaningRu, strokes: [0,1,2] }].
  // Черты каждой части рисуются своим цветом — так «語 это 言 плюс 吾» видно
  // на самом знаке, а не только списком под ним.
  groups: { type: Array, default: () => [] },
});

// Цвет по чертам нужен там, где есть граница между частями. Одна
// составляющая на весь знак — это сам знак, красить его незачем; а вот одна
// составляющая на часть черт (у 強 размечен только 弓) границу как раз
// показывает, и цвет там по делу.
const colored = computed(() => {
  if (props.groups.length > 1) return true;
  if (props.groups.length === 1) {
    return (props.groups[0].strokes?.length || 0) < props.paths.length;
  }
  return false;
});

const strokeColors = computed(() => {
  const out = new Array(props.paths.length).fill("");
  if (!colored.value) return out;
  props.groups.forEach((g, gi) => {
    const color = JP_GROUP_COLORS[gi % JP_GROUP_COLORS.length];
    (g.strokes || []).forEach((n) => {
      if (n >= 0 && n < out.length) out[n] = color;
    });
  });
  return out;
});

const legend = computed(() =>
  colored.value
    ? props.groups.map((g, gi) => ({
        char: g.char,
        meaning: g.meaningRu || "",
        color: JP_GROUP_COLORS[gi % JP_GROUP_COLORS.length],
      }))
    : [],
);

const svg = ref(null);
const lengths = ref([]);
const shown = ref(0);
let timer = null;

const STROKE_MS = 380;

async function measure() {
  await nextTick();
  const nodes = svg.value?.querySelectorAll("path") || [];
  lengths.value = Array.from(nodes).map((n) => {
    try {
      return n.getTotalLength();
    } catch {
      // jsdom и старые движки могут не уметь мерить путь — тогда черта просто
      // появится целиком, без прорисовки.
      return 0;
    }
  });
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function play() {
  stop();
  shown.value = 0;
  timer = setInterval(() => {
    shown.value += 1;
    if (shown.value >= props.paths.length) stop();
  }, STROKE_MS);
}

function showAll() {
  stop();
  shown.value = props.paths.length;
}

watch(
  () => props.paths,
  async () => {
    await measure();
    showAll();
  },
  { immediate: true },
);

onBeforeUnmount(stop);
</script>

<template>
  <div v-if="paths.length" class="jso">
    <svg
      ref="svg"
      :viewBox="`0 0 ${JP_STROKE_BOX} ${JP_STROKE_BOX}`"
      :width="size"
      :height="size"
      class="jso-svg"
    >
      <!-- Сетка как в прописях: без неё непонятно, где центр знака. -->
      <g class="jso-guide">
        <line :x1="JP_STROKE_BOX / 2" y1="0" :x2="JP_STROKE_BOX / 2" :y2="JP_STROKE_BOX" />
        <line x1="0" :y1="JP_STROKE_BOX / 2" :x2="JP_STROKE_BOX" :y2="JP_STROKE_BOX / 2" />
      </g>
      <path
        v-for="(d, i) in paths"
        :key="i"
        :d="d"
        class="jso-stroke"
        :class="{ 'is-next': i === shown }"
        :style="{
          stroke: strokeColors[i] || undefined,
          strokeDasharray: lengths[i] || 'none',
          strokeDashoffset: i < shown ? 0 : lengths[i] || 0,
        }"
      />
    </svg>

    <!-- Подпись к цветам: без неё раскраска — просто пёстрый знак. -->
    <div v-if="legend.length" class="jso-legend">
      <span v-for="p in legend" :key="p.char" class="jso-legend-part">
        <b :style="{ color: p.color }">{{ p.char }}</b>
        <template v-if="p.meaning"> {{ p.meaning }}</template>
      </span>
    </div>

    <div class="jso-tools">
      <button class="jp-btn jp-btn-sm" @click="play">▶ По чертам</button>
      <button class="jp-btn jp-btn-sm" @click="showAll">Целиком</button>
      <span class="jp-muted">{{ paths.length }} черт</span>
    </div>
  </div>
</template>

<style scoped>
.jso {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.jso-svg {
  background: #16171d;
  border: 1px solid #2a2d38;
  border-radius: 12px;
}

.jso-guide line {
  stroke: #2a2d38;
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.jso-stroke {
  fill: none;
  stroke: #e8eaf2;
  stroke-width: 3.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke-dashoffset 360ms linear;
}

/* Черта, которая рисуется прямо сейчас, подсвечена: за ней и следят.
   У раскрашенного знака цвет черты занят составляющей, поэтому текущую
   выделяет толщина — иначе подсветка съела бы разбор. */
.jso-stroke.is-next {
  stroke: #a58bff;
  stroke-width: 4.8;
}

.jso-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.jso-legend-part {
  font-size: 12px;
  color: #cfd3e0;
  background: #22242d;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  padding: 3px 8px;
}

.jso-legend-part b {
  font-size: 15px;
  margin-right: 3px;
}
</style>
