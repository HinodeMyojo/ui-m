<script setup>
// Как выглядит движение.
//
// Одна ссылка — это картинка или гифка, показываем как есть. Несколько —
// кадры одного движения: открытые базы почти всегда дают не анимацию, а два
// снимка (начало и конец), и склеить их в движение проще всего здесь же,
// перещёлкиванием. Получается то же, что гифка, только без гифки.
//
// Файлы живут на чужом CDN — у нас 0.2 ядра, раздавать картинки нечем.
// Поэтому любая ссылка может однажды отвалиться: битый кадр прячем, а если
// не осталось ни одного — компонент молча исчезает, а не светит рамкой.

import { ref, computed, watch, onBeforeUnmount } from "vue";

const props = defineProps({
  urls: { type: Array, default: () => [] },
  // Пауза между кадрами. 700 мс — темп спокойного повтора: быстрее рябит,
  // медленнее уже не читается как движение.
  interval: { type: Number, default: 700 },
  size: { type: String, default: "" },
  // Мелкое превью в списке не должно дёргаться на каждой карточке разом.
  animate: { type: Boolean, default: true },
});

const broken = ref(new Set());
const frame = ref(0);
let timer = null;

const alive = computed(() => props.urls.filter((u) => u && !broken.value.has(u)));

const current = computed(() => alive.value[frame.value % (alive.value.length || 1)] || "");

function markBroken(url) {
  const next = new Set(broken.value);
  next.add(url);
  broken.value = next;
}

function restart() {
  clearInterval(timer);
  timer = null;
  frame.value = 0;
  if (props.animate && alive.value.length > 1) {
    timer = setInterval(() => {
      frame.value = (frame.value + 1) % alive.value.length;
    }, props.interval);
  }
}

watch(() => [props.urls, props.animate, alive.value.length], restart, { immediate: true });
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div v-if="alive.length" class="spd" :style="size ? { width: size, height: size } : null">
    <img :src="current" alt="" loading="lazy" @error="markBroken(current)" />
    <span v-if="alive.length > 1 && animate" class="spd-badge" title="Кадры движения">▶</span>
  </div>
</template>

<style scoped>
.spd {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #101218;
  flex-shrink: 0;
}

.spd img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.spd-badge {
  position: absolute;
  right: 3px;
  bottom: 3px;
  font-size: 8px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.75);
}
</style>
