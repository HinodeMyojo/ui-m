<script setup>
// Подпись от руки: рисуешь пальцем или мышью, редактор вставляет её на
// страницу картинкой с прозрачным фоном. Поля вокруг росчерка обрезаются —
// иначе невидимая рамка мешала бы ставить подпись точно на линию.

import { onMounted, ref } from "vue";

const emit = defineEmits(["done", "close"]);

const pad = ref(null);
const color = ref("#1a237e");
const empty = ref(true);
const COLORS = ["#1a237e", "#000000", "#0b57d0", "#c62828"];

let ctx = null;
let drawing = false;
let last = null;
const strokes = [];

function resize() {
  const el = pad.value;
  const dpr = window.devicePixelRatio || 1;
  const rect = el.getBoundingClientRect();
  el.width = Math.round(rect.width * dpr);
  el.height = Math.round(rect.height * dpr);
  ctx = el.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  redraw();
}

function redraw() {
  const el = pad.value;
  ctx.clearRect(0, 0, el.width, el.height);
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.1, s.points[0][1]);
    ctx.stroke();
  }
}

function point(e) {
  const r = pad.value.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function down(e) {
  pad.value.setPointerCapture(e.pointerId);
  drawing = true;
  last = point(e);
  strokes.push({ color: color.value, points: [last] });
  empty.value = false;
  redraw();
}

function move(e) {
  if (!drawing) return;
  const p = point(e);
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) return;
  strokes[strokes.length - 1].points.push(p);
  last = p;
  redraw();
}

function up() {
  drawing = false;
}

function clear() {
  strokes.length = 0;
  empty.value = true;
  redraw();
}

function setColor(c) {
  color.value = c;
  strokes.forEach((s) => (s.color = c));
  redraw();
}

function done() {
  const el = pad.value;
  const data = ctx.getImageData(0, 0, el.width, el.height).data;
  let minX = el.width;
  let minY = el.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < el.height; y++) {
    for (let x = 0; x < el.width; x++) {
      if (data[(y * el.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return;
  const pad2 = 6;
  minX = Math.max(0, minX - pad2);
  minY = Math.max(0, minY - pad2);
  maxX = Math.min(el.width - 1, maxX + pad2);
  maxY = Math.min(el.height - 1, maxY + pad2);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d").drawImage(el, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  emit("done", out.toDataURL("image/png"));
}

onMounted(resize);
</script>

<template>
  <div class="sig-backdrop" @click.self="emit('close')">
    <div class="sig">
      <div class="sig-head">
        <b>Подпись</b>
        <button class="sig-x" aria-label="Закрыть" @click="emit('close')">✕</button>
      </div>
      <canvas
        ref="pad"
        class="sig-pad"
        @pointerdown.prevent="down"
        @pointermove.prevent="move"
        @pointerup="up"
        @pointercancel="up"
      />
      <div class="sig-hint">Распишись в рамке — поля вокруг обрежутся сами.</div>
      <div class="sig-row">
        <button
          v-for="c in COLORS"
          :key="c"
          class="sig-color"
          :class="{ on: c === color }"
          :style="{ background: c }"
          :aria-label="`Цвет ${c}`"
          @click="setColor(c)"
        />
        <div class="sig-spacer" />
        <button class="sig-btn" :disabled="empty" @click="clear">Стереть</button>
        <button class="sig-btn primary" :disabled="empty" @click="done">Вставить</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sig-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(15, 18, 30, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.sig {
  width: min(560px, 100%);
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.sig-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.sig-x {
  border: none;
  background: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
}
.sig-pad {
  display: block;
  width: 100%;
  height: 200px;
  border: 1.5px dashed #b8bfd6;
  border-radius: 10px;
  touch-action: none;
  background: repeating-linear-gradient(0deg, transparent 0 149px, #e3e7f3 149px 150px);
  cursor: crosshair;
}
.sig-hint {
  font-size: 12px;
  color: #777;
  margin: 6px 2px 10px;
}
.sig-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sig-color {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1.5px #ccd;
  cursor: pointer;
}
.sig-color.on {
  box-shadow: 0 0 0 2.5px #4361ee;
}
.sig-spacer {
  flex: 1;
}
.sig-btn {
  border: 1px solid #d5d9e6;
  background: #fff;
  border-radius: 9px;
  padding: 9px 14px;
  font-size: 14px;
  cursor: pointer;
}
.sig-btn.primary {
  background: #4361ee;
  border-color: #4361ee;
  color: #fff;
}
.sig-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
