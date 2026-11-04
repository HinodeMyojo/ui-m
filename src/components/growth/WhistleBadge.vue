<script setup>
// Свисток с аурой. docs/me-module.md (back-m)
//
// Свисток — ранг: цвет корпуса. Аура — ореол вокруг, пять ступеней, и каждая
// узнаётся с одного взгляда, а не по оттенку: 0 — ничего, 1 — тёплое
// свечение, 2 — кольцо, 3 — кольцо и искры, 4 — лучи. Так «аура 3 из 4»
// видна даже в маленьком значке.
import { computed } from "vue";
import { AURA_LEVELS, WHISTLES } from "@/composables/useGrowth.js";

const props = defineProps({
  whistle: { type: String, default: "bell" },
  aura: { type: Number, default: 0 },
  size: { type: Number, default: 64 },
  // Без ауры — для лестницы свистков, где важен только сам свисток.
  bare: { type: Boolean, default: false },
  dim: { type: Boolean, default: false },
});

const level = computed(() => (props.bare ? 0 : Math.max(0, Math.min(4, Math.round(props.aura)))));
const a = computed(() => AURA_LEVELS[level.value]);
const color = computed(() => (WHISTLES[props.whistle] || WHISTLES.bell).color);
const sparks = computed(() => (level.value >= 3 ? Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2) : []));
const rays = computed(() => (level.value >= 4 ? Array.from({ length: 12 }, (_, i) => i * 30) : []));
const uid = `wb-${Math.random().toString(36).slice(2, 8)}`;
const motion = typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
</script>

<template>
  <svg :width="size" :height="size" viewBox="-60 -60 120 120" class="whistle-badge" :class="{ dim }" aria-hidden="true">
    <defs>
      <radialGradient :id="`${uid}-glow`">
        <stop offset="35%" :stop-color="a.color" :stop-opacity="a.glow" />
        <stop offset="100%" :stop-color="a.color" stop-opacity="0" />
      </radialGradient>
      <linearGradient :id="`${uid}-body`" x1="0" x2="1">
        <stop offset="0%" :stop-color="color" />
        <stop offset="45%" stop-color="#ffffff" stop-opacity="0.55" />
        <stop offset="55%" :stop-color="color" />
        <stop offset="100%" :stop-color="color" stop-opacity="0.75" />
      </linearGradient>
    </defs>

    <!-- Аура -->
    <g v-if="level > 0" class="wb-aura">
      <circle r="58" :fill="`url(#${uid}-glow)`" />
      <!-- Вращение — SMIL вокруг (0,0): CSS-поворот в SVG с отрицательным
           viewBox крутит вокруг чужой точки, и кольцо уезжает в сторону. -->
      <g v-if="rays.length">
        <line v-for="deg in rays" :key="deg" x1="0" y1="-40" x2="0" y2="-57" :stroke="a.color" stroke-width="2.2"
          stroke-linecap="round" :transform="`rotate(${deg})`" opacity="0.8" />
        <animateTransform v-if="motion" attributeName="transform" type="rotate" from="0" to="-360" dur="40s" repeatCount="indefinite" />
      </g>
      <g v-if="level >= 2">
        <circle r="38" fill="none" :stroke="a.color" stroke-width="1.6" stroke-dasharray="4 5" opacity="0.85" />
        <animateTransform v-if="motion" attributeName="transform" type="rotate" from="0" to="360" dur="18s" repeatCount="indefinite" />
      </g>
      <g v-for="(t, i) in sparks" :key="i" class="wb-spark" :style="{ animationDelay: `${i * 0.3}s` }">
        <circle :cx="Math.cos(t) * 46" :cy="Math.sin(t) * 46" r="2.6" :fill="a.color" />
      </g>
    </g>

    <circle r="31" fill="#14151b" :stroke="level ? a.color : '#3a3d4b'" stroke-opacity="0.7" stroke-width="2" />

    <!-- Свисток: кольцо, шейка, корпус-трубка с прорезью, мундштук -->
    <g transform="rotate(-32)">
      <path d="M 0 -27 C -9 -36 -4 -46 6 -44" fill="none" :stroke="color" stroke-width="2.2" opacity="0.6" />
      <circle cx="0" cy="-24" r="5.2" fill="none" :stroke="color" stroke-width="3" />
      <rect x="-3" y="-19.5" width="6" height="5" :fill="color" />
      <rect x="-7.5" y="-15" width="15" height="34" rx="6" :fill="`url(#${uid}-body)`" />
      <rect x="-7.5" y="-15" width="15" height="34" rx="6" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="1.2" />
      <rect x="-7.5" y="-9" width="15" height="2" fill="#000" opacity="0.28" />
      <rect x="-7.5" y="10" width="15" height="2" fill="#000" opacity="0.28" />
      <rect x="-4" y="-4" width="8" height="5" rx="1.5" fill="#000" opacity="0.6" />
      <path d="M -5 19 L -4 26 L 4 26 L 5 19 Z" :fill="color" stroke="#000" stroke-opacity="0.4" stroke-width="1" />
    </g>
  </svg>
</template>

<style scoped>
.whistle-badge {
  flex: none;
  overflow: visible;
}

.whistle-badge.dim {
  filter: grayscale(0.85) brightness(0.6);
}

@media (prefers-reduced-motion: no-preference) {
  .wb-aura {
    animation: wb-breathe 3.2s ease-in-out infinite;
  }
  .wb-spark {
    animation: wb-twinkle 2.4s ease-in-out infinite;
  }
}

@keyframes wb-breathe {
  50% {
    opacity: 0.72;
  }
}

@keyframes wb-twinkle {
  0%,
  100% {
    opacity: 0.15;
  }
  50% {
    opacity: 1;
  }
}
</style>
