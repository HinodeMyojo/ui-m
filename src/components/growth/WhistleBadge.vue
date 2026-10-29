<script setup>
// Свисток с аурой. Ранг — цвет свистка, аура — свечение вокруг: от тусклой
// (0) до сияющей (4). Чем выше аура, тем шире и ярче ореол и тем больше
// искр по кругу.
import { computed } from "vue";
import { WHISTLES } from "@/composables/useGrowth.js";

const props = defineProps({
  whistle: { type: String, default: "bell" },
  aura: { type: Number, default: 0 },
  size: { type: Number, default: 44 },
});

const AURA = [
  { color: "#5b616e", glow: 0.15, r: 0.62 },
  { color: "#b08a5a", glow: 0.3, r: 0.72 },
  { color: "#e3b341", glow: 0.45, r: 0.8 },
  { color: "#ffd98a", glow: 0.6, r: 0.9 },
  { color: "#fff3c4", glow: 0.8, r: 0.98 },
];

const a = computed(() => AURA[Math.max(0, Math.min(4, props.aura))]);
const color = computed(() => (WHISTLES[props.whistle] || WHISTLES.bell).color);
const sparks = computed(() =>
  Array.from({ length: props.aura * 2 }, (_, i) => (i / Math.max(1, props.aura * 2)) * Math.PI * 2),
);
const uid = `wb-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <svg :width="size" :height="size" viewBox="-50 -50 100 100" class="whistle-badge" aria-hidden="true">
    <defs>
      <radialGradient :id="uid">
        <stop offset="0%" :stop-color="a.color" :stop-opacity="a.glow" />
        <stop offset="100%" :stop-color="a.color" stop-opacity="0" />
      </radialGradient>
    </defs>
    <circle class="wb-aura" r="50" :fill="`url(#${uid})`" :style="{ transform: `scale(${a.r})` }" />
    <circle r="27" fill="#14151b" :stroke="a.color" stroke-opacity="0.55" stroke-width="2" />
    <g v-for="(t, i) in sparks" :key="i" class="wb-spark" :style="{ animationDelay: `${i * 0.35}s` }">
      <circle :cx="Math.cos(t) * 36" :cy="Math.sin(t) * 36" r="2.2" :fill="a.color" />
    </g>
    <!-- Свисток: шнурок, кольцо, корпус с прорезью -->
    <g transform="rotate(-35)">
      <path d="M -2 -24 Q -10 -34 2 -38" fill="none" :stroke="color" stroke-width="2" opacity="0.7" />
      <circle cx="0" cy="-19" r="4" fill="none" :stroke="color" stroke-width="2.5" />
      <rect x="-6" y="-15" width="12" height="30" rx="5" :fill="color" />
      <rect x="-6" y="-15" width="12" height="30" rx="5" fill="none" stroke="#000" stroke-opacity="0.35" />
      <rect x="-3" y="-8" width="6" height="3" rx="1" fill="#000" opacity="0.5" />
      <rect x="-4" y="9" width="8" height="2" fill="#fff" opacity="0.25" />
    </g>
  </svg>
</template>

<style scoped>
.whistle-badge {
  flex: none;
  overflow: visible;
}

.wb-aura {
  transform-origin: center;
  transform-box: fill-box;
}

@media (prefers-reduced-motion: no-preference) {
  .wb-aura {
    animation: wb-breathe 3.2s ease-in-out infinite;
  }
  .wb-spark {
    animation: wb-twinkle 2.8s ease-in-out infinite;
  }
}

@keyframes wb-breathe {
  50% {
    opacity: 0.7;
  }
}

@keyframes wb-twinkle {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
}
</style>
