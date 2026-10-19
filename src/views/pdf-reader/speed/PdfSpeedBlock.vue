<template>
    <div class="rsvp-blockview" ref="wrapEl" :class="{ 'rsvp-blockview-wide': wide }">
        <canvas ref="canvasEl" class="rsvp-blockview-canvas"></canvas>
        <div v-if="failed" class="rsvp-note">Не удалось нарисовать кусок страницы.</div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, toRaw } from 'vue';

// Кусок страницы PDF: рисунок, таблица или листинг — docs/pdf-library.md (back-m),
// «Техническая книга». Рисуем страницу с таким сдвигом, чтобы на холсте
// оказалась только нужная рамка, — без рендера всей страницы целиком.

const props = defineProps({
    pdfDoc: { type: Object, required: true },
    page: { type: Number, required: true },
    box: { type: Array, default: null },       // [x0, y0, x1, y1] в координатах PDF; null — вся страница
    maxHeight: { type: Number, default: 480 },
    wide: Boolean,                             // крупно: по ширине, высоту не ограничиваем
});

const wrapEl = ref(null);
const canvasEl = ref(null);
const failed = ref(false);
let task = null;
let resizeObserver = null;
let lastWidth = 0;

const PAD = 8;

async function draw() {
    const wrap = wrapEl.value;
    const canvas = canvasEl.value;
    if (!wrap || !canvas) return;
    const width = wrap.clientWidth;
    if (!width) return;
    lastWidth = width;
    failed.value = false;
    try {
        task?.cancel();
    } catch { /* уже кончилась */ }
    try {
        const page = await toRaw(props.pdfDoc).getPage(props.page);
        const base = page.getViewport({ scale: 1 });
        let rect;
        if (props.box) {
            const r = base.convertToViewportRectangle([
                props.box[0] - PAD, props.box[1] - PAD, props.box[2] + PAD, props.box[3] + PAD,
            ]);
            rect = [
                Math.max(0, Math.min(r[0], r[2])), Math.max(0, Math.min(r[1], r[3])),
                Math.min(base.width, Math.max(r[0], r[2])), Math.min(base.height, Math.max(r[1], r[3])),
            ];
        } else {
            rect = [0, 0, base.width, base.height];
        }
        const w = rect[2] - rect[0];
        const h = rect[3] - rect[1];
        if (w <= 0 || h <= 0) return;
        let scale = width / w;
        if (!props.wide) scale = Math.min(scale, props.maxHeight / h);
        scale = Math.min(scale, 4);
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const s = scale * dpr;
        const viewport = page.getViewport({ scale: s, offsetX: -rect[0] * s, offsetY: -rect[1] * s });
        canvas.width = Math.round(w * s);
        canvas.height = Math.round(h * s);
        canvas.style.width = `${Math.round(w * scale)}px`;
        canvas.style.height = `${Math.round(h * scale)}px`;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
    } catch (e) {
        if (e?.name !== 'RenderingCancelledException') failed.value = true;
    }
}

watch(() => [props.page, props.box, props.wide, props.maxHeight], draw);

onMounted(() => {
    draw();
    resizeObserver = new ResizeObserver(() => {
        if (wrapEl.value && Math.abs(wrapEl.value.clientWidth - lastWidth) > 4) draw();
    });
    if (wrapEl.value) resizeObserver.observe(wrapEl.value);
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    try { task?.cancel(); } catch { /* ничего */ }
});
</script>
