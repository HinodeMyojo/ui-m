<script setup>
// Задник раздела: ночная пустыня.
//
// Всё нарисовано вектором прямо здесь, без картинок и без анимации в
// JavaScript: картинка — это лишняя загрузка на телефоне, а анимация кадрами —
// лишняя работа процессора там, где её и так мало. Барханы, пальмы и звёзды
// стоят неподвижно, мерцают только звёзды, и то средствами CSS.
//
// Слой ничего не перехватывает (pointer-events: none) и лежит под содержимым:
// раздел должен читаться в первую очередь, а пустыня — быть фоном, а не
// зрелищем. Поэтому же у неё низкая непрозрачность: цвет настроения, а не
// отдельная картина.

const props = defineProps({
  // dim — приглушённый вариант для сессии: во время ответа задник не должен
  // тянуть взгляд на себя.
  dim: { type: Boolean, default: false },
});

// Звёзды расставлены руками, а не случайно: случайные сбиваются в кучки, и
// небо выглядит грязным. Третье число — задержка мерцания.
const STARS = [
  [6, 12, 0],
  [14, 26, 1.4],
  [23, 8, 2.8],
  [31, 19, 0.7],
  [42, 6, 2.1],
  [54, 15, 3.5],
  [63, 9, 1.1],
  [71, 22, 2.4],
  [79, 7, 0.4],
  [88, 17, 3.1],
  [94, 11, 1.8],
  [37, 29, 4.2],
];
</script>

<template>
  <div class="ars-scene" :class="{ dim: props.dim }" aria-hidden="true">
    <div class="ars-sky"></div>

    <span
      v-for="(star, i) in STARS"
      :key="i"
      class="ars-star"
      :style="{ left: star[0] + '%', top: star[1] + '%', animationDelay: star[2] + 's' }"
    ></span>

    <!-- Месяц: вырезан вторым кругом, а не нарисован дугой — так у него
         получается настоящий острый рог. -->
    <svg class="ars-moon" viewBox="0 0 60 60">
      <defs>
        <mask id="ar-moon-mask">
          <rect width="60" height="60" fill="#000" />
          <circle cx="30" cy="30" r="18" fill="#fff" />
          <circle cx="40" cy="24" r="16" fill="#000" />
        </mask>
      </defs>
      <circle cx="30" cy="30" r="18" fill="#f2d9a0" mask="url(#ar-moon-mask)" />
    </svg>

    <!-- Барханы тремя слоями: дальний светлее и выше, ближний темнее и ниже.
         Глубину даёт именно это, а не тени. -->
    <svg class="ars-dunes" viewBox="0 0 1200 260" preserveAspectRatio="none">
      <path
        class="ars-dune-far"
        d="M0 190 C 140 150, 250 205, 390 178 C 520 152, 610 196, 760 170 C 900 146, 1020 192, 1200 162 L1200 260 L0 260 Z"
      />
      <path
        class="ars-dune-mid"
        d="M0 218 C 120 186, 280 232, 430 206 C 560 184, 700 226, 850 202 C 980 182, 1100 220, 1200 200 L1200 260 L0 260 Z"
      />
      <path
        class="ars-dune-near"
        d="M0 244 C 160 222, 300 252, 470 236 C 640 220, 780 250, 960 234 C 1080 224, 1150 242, 1200 236 L1200 260 L0 260 Z"
      />
    </svg>

    <!-- Пальмы силуэтами по краям: ствол дугой, листья — кривые от его
         вершины. Симметричная пальма выглядит пластмассовой, поэтому левая и
         правая разной высоты и наклона. -->
    <svg class="ars-palm ars-palm-left" viewBox="0 0 120 220">
      <path class="ars-trunk" d="M58 220 C 52 170, 48 120, 40 74" />
      <g class="ars-fronds">
        <path d="M40 74 C 20 58, 6 60, 0 72" />
        <path d="M40 74 C 22 46, 8 40, 0 44" />
        <path d="M40 74 C 34 44, 26 26, 16 16" />
        <path d="M40 74 C 48 44, 52 26, 50 8" />
        <path d="M40 74 C 60 50, 78 44, 92 48" />
        <path d="M40 74 C 64 66, 84 68, 96 78" />
      </g>
      <circle class="ars-date" cx="41" cy="77" r="3" />
    </svg>

    <svg class="ars-palm ars-palm-right" viewBox="0 0 120 220">
      <path class="ars-trunk" d="M62 220 C 70 172, 74 126, 82 86" />
      <g class="ars-fronds">
        <path d="M82 86 C 102 70, 116 72, 120 84" />
        <path d="M82 86 C 104 58, 116 52, 120 58" />
        <path d="M82 86 C 88 56, 96 40, 106 30" />
        <path d="M82 86 C 76 56, 70 40, 72 22" />
        <path d="M82 86 C 62 62, 44 58, 30 62" />
        <path d="M82 86 C 58 78, 40 82, 28 92" />
      </g>
      <circle class="ars-date" cx="81" cy="89" r="3" />
    </svg>
  </div>
</template>

<style scoped>
.ars-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

/* Небо: от ночной сини вверху к тёплому песку у горизонта. */
.ars-sky {
  position: absolute;
  inset: 0;
  /* Три слоя: сияние у луны, тёплый свет над горизонтом и сама ночь. Свет над
     горизонтом важнее всего — без него барханы сливаются с небом в одно
     чёрное поле. */
  background:
    radial-gradient(90% 46% at 50% 100%, rgba(214, 150, 78, 0.22) 0%, transparent 62%),
    radial-gradient(120% 60% at 82% 0%, rgba(110, 86, 156, 0.26) 0%, transparent 58%),
    linear-gradient(180deg, #16142a 0%, #1b1726 42%, #2a1f24 80%, #3a2a22 100%);
}

.ars-star {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: #f5e6c8;
  opacity: 0.75;
  animation: ar-twinkle 4.5s ease-in-out infinite;
}

@keyframes ar-twinkle {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 0.85;
  }
}

/* Кто просил не мигать — тому и не мигаем. */
@media (prefers-reduced-motion: reduce) {
  .ars-star {
    animation: none;
    opacity: 0.6;
  }
}

.ars-moon {
  position: absolute;
  /* Ниже шапки: на телефоне месяц вставал ровно за плашкой уровня. */
  top: clamp(56px, 8vh, 86px);
  right: clamp(14px, 6vw, 90px);
  width: clamp(44px, 7vw, 66px);
  height: auto;
  opacity: 0.85;
  filter: drop-shadow(0 0 18px rgba(242, 217, 160, 0.35));
}

.ars-dunes {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: clamp(150px, 26vh, 260px);
}

/* Дальний бархан светлее ближнего: воздух между ними и делает глубину.
   Раньше все три были почти чёрными, и пустыня читалась как тёмное пятно. */
.ars-dune-far {
  fill: #5c4231;
}

.ars-dune-mid {
  fill: #47332a;
}

.ars-dune-near {
  fill: #33241f;
}

.ars-palm {
  position: absolute;
  bottom: clamp(40px, 9vh, 96px);
  width: clamp(76px, 12vw, 130px);
  height: auto;
  opacity: 0.72;
}

.ars-palm-left {
  left: clamp(-10px, 1vw, 28px);
}

.ars-palm-right {
  right: clamp(-12px, 2vw, 40px);
  width: clamp(58px, 9vw, 104px);
  bottom: clamp(56px, 11vh, 120px);
}

.ars-trunk {
  fill: none;
  stroke: #56392a;
  stroke-width: 7;
  stroke-linecap: round;
}

.ars-fronds path {
  fill: none;
  stroke: #3f5a45;
  stroke-width: 5;
  stroke-linecap: round;
}

.ars-date {
  fill: #8a5c2e;
}

/* Приглушённый вариант для сессии: небо остаётся, всё остальное почти
   исчезает — на карточке с вопросом пальма не нужна. */
.ars-scene.dim .ars-palm,
.ars-scene.dim .ars-moon {
  opacity: 0.18;
}

.ars-scene.dim .ars-dunes {
  opacity: 0.55;
}

.ars-scene.dim .ars-star {
  opacity: 0.4;
  animation: none;
}
</style>
