<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import { JP_STROKE_BOX } from "@/components/japaneseApi.js";

// Порядок черт по данным KanjiVG. Черты приходят готовыми путями в квадрате
// 109×109 и уже в порядке написания — рисовать их нужно по одной, иначе это
// просто картинка иероглифа, которых и так полный экран.
//
// Длина каждого пути меряется у настоящего элемента (getTotalLength): считать
// её по строке команд SVG — отдельная библиотека ради одной цифры.

const props = defineProps({
  paths: { type: Array, default: () => [] },
  size: { type: Number, default: 200 },
});

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
          strokeDasharray: lengths[i] || 'none',
          strokeDashoffset: i < shown ? 0 : lengths[i] || 0,
        }"
      />
    </svg>

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

/* Черта, которая рисуется прямо сейчас, подсвечена: за ней и следят. */
.jso-stroke.is-next {
  stroke: #a58bff;
}
</style>
