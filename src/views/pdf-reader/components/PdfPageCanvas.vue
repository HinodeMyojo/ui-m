<template>
    <!-- Страница вне активного окна — это только пустая рамка нужного размера.
         Ни канваса, ни текстового слоя, ни мерцающей заглушки: в толстой книге
         таких страниц три сотни, и каждая стоила и памяти, и анимации. -->
    <div class="pdf-page-wrapper" ref="wrapperEl" :data-page="pageNum"
        :style="placeholderStyle">
        <template v-if="active">
            <div class="pdf-page-num-label">{{ pageNum }}</div>
            <canvas ref="canvasEl" v-show="rendered"></canvas>
            <div v-if="!rendered" class="pdf-page-placeholder"></div>
            <div ref="textLayerEl" class="textLayer"></div>
            <PdfAnnotationLayer
                v-if="annotations.length"
                :annotations="annotations"
                :zoomLevel="zoomLevel"
                @remove="emit('remove-annotation', $event)"
                @edit-note="emit('edit-annotation-note', $event)"
            />
        </template>
    </div>
</template>

<script setup>
import { ref, watch, computed, nextTick, onMounted, onBeforeUnmount, toRaw } from 'vue';
import 'pdfjs-dist/web/pdf_viewer.css';
// Берём ту же сборку pdf.js, что подняла читалка: их две (обычная и legacy для
// старых Safari), и мешать классы из разных нельзя.
import { pdfjs } from '../composables/usePdfLoader.js';
import { scheduleRender, cancelRender } from '../composables/usePdfRenderQueue.js';
import PdfAnnotationLayer from './PdfAnnotationLayer.vue';

const props = defineProps({
    pdfDoc: Object,
    pageNum: Number,
    zoomLevel: Number,
    nightMode: Boolean,
    searchQuery: String,
    searchPageMatches: Number,
    annotations: { type: Array, default: () => [] },
    goToPage: { type: Function, default: null },
    // Размер первой страницы документа: по нему строятся заглушки, пока до
    // страницы не долистали. Спрашивать настоящий размер у каждой из тысячи
    // страниц при открытии — самый дорогой способ ничего не показать.
    defaultWidth: { type: Number, default: 612 },
    defaultHeight: { type: Number, default: 792 },
    // Страница в окне вокруг экрана: рисуем и держим в памяти только такие.
    // Решает это родитель — одним наблюдателем на весь документ, а не тремя
    // сотнями отдельных.
    active: { type: Boolean, default: false },
});

const emit = defineEmits(['remove-annotation', 'edit-annotation-note', 'height-changed']);

const wrapperEl = ref(null);
const canvasEl = ref(null);
const textLayerEl = ref(null);
const rendered = ref(false);
const pageWidth = ref(props.defaultWidth);
const pageHeight = ref(props.defaultHeight);
let dimsLoaded = false;

let renderTask = null;
let textLayerInstance = null;

// ── Placeholder size so layout doesn't jump ─────────────────────────────
const placeholderStyle = computed(() => ({
    width: Math.round(pageWidth.value * props.zoomLevel) + 'px',
    height: Math.round(pageHeight.value * props.zoomLevel) + 'px',
}));

// ── Link annotations ─────────────────────────────────────────────────────
async function renderLinkAnnotations(page, viewport, wrapperEl) {
    wrapperEl.querySelectorAll('.pdf-link-annotation').forEach(el => el.remove());
    if (!props.goToPage || !props.pdfDoc) return;
    try {
        const anns = await page.getAnnotations();
        const doc = toRaw(props.pdfDoc);
        for (const ann of anns) {
            if (ann.subtype !== 'Link' || !ann.dest || ann.url) continue;
            let targetPage = null;
            try {
                const resolved = typeof ann.dest === 'string'
                    ? await doc.getDestination(ann.dest)
                    : ann.dest;
                if (resolved && resolved[0]) {
                    const idx = await doc.getPageIndex(resolved[0]);
                    targetPage = idx + 1;
                }
            } catch { continue; }
            if (!targetPage) continue;

            const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(ann.rect);
            const left = Math.min(vx1, vx2);
            const top  = Math.min(vy1, vy2);
            const w    = Math.abs(vx2 - vx1);
            const h    = Math.abs(vy2 - vy1);

            const div = document.createElement('div');
            div.className = 'pdf-link-annotation';
            div.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px;`;
            div.title = `Перейти на страницу ${targetPage}`;
            div.addEventListener('click', (e) => { e.stopPropagation(); props.goToPage(targetPage); });
            wrapperEl.appendChild(div);
        }
    } catch { /* ignore */ }
}

// ── Actual render ────────────────────────────────────────────────────────
// Насколько эта страница далеко от центра экрана — по этому числу очередь
// выбирает, что рисовать следующим.
function distanceFromScreenCentre() {
    const el = wrapperEl.value;
    if (!el) return Number.MAX_SAFE_INTEGER;
    const box = el.getBoundingClientRect();
    return Math.abs(box.top + box.height / 2 - window.innerHeight / 2);
}

// Рисуем не сразу, а через общую очередь: страниц в окне несколько, поток один.
function render() {
    if (!props.pdfDoc || !props.active) return;
    scheduleRender(props.pageNum, distanceFromScreenCentre, renderNow);
}

async function renderNow() {
    if (!props.pdfDoc || !props.active) return;
    // Канвас появляется вместе с активностью — ждём, пока Vue его вставит.
    if (!canvasEl.value) {
        await nextTick();
        if (!canvasEl.value || !props.active) return;
    }
    const doc = toRaw(props.pdfDoc);
    try {
        const page = await doc.getPage(props.pageNum);
        const viewport = page.getViewport({ scale: props.zoomLevel });

        // Store natural page size (at scale=1)
        if (!dimsLoaded) {
            const vp1 = page.getViewport({ scale: 1 });
            pageWidth.value = vp1.width;
            pageHeight.value = vp1.height;
            dimsLoaded = true;
        }

        if (renderTask) { renderTask.cancel(); renderTask = null; }

        const canvas = canvasEl.value;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width  = Math.round(viewport.width  * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width  = viewport.width  + 'px';
        canvas.style.height = viewport.height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        // Fill white background so transparent images render correctly (SMask / ImageMask)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        const { AnnotationMode } = pdfjs();
        renderTask = page.render({ canvasContext: ctx, viewport, annotationMode: AnnotationMode.ENABLE_FORMS });
        await renderTask.promise;
        renderTask = null;
        rendered.value = true;

        // Text layer (for text selection)
        const tl = textLayerEl.value;
        if (tl) {
            tl.innerHTML = '';
            if (textLayerInstance) { textLayerInstance.cancel?.(); textLayerInstance = null; }
            tl.style.setProperty('--total-scale-factor', props.zoomLevel);
            try {
                const textContent = await page.getTextContent();
                const { TextLayer } = pdfjs();
                textLayerInstance = new TextLayer({
                    textContentSource: textContent,
                    container: tl,
                    viewport,
                });
                await textLayerInstance.render();
            } catch (err) { console.warn('TextLayer error:', err); }
        }

        // Link annotations
        const wrapper = canvasEl.value?.closest('.pdf-page-wrapper');
        if (wrapper) await renderLinkAnnotations(page, viewport, wrapper);
    } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.warn('Page', props.pageNum, 'render error:', e);
    }
}

// ── Освобождение ─────────────────────────────────────────────────────────
// Страница ушла из окна: отменяем начатое и отпускаем всё тяжёлое. Канвас
// уносит v-if в шаблоне — вместе с ним браузер отдаёт и его буфер, а это
// три мегабайта на страницу.
function release() {
    cancelRender(props.pageNum);
    if (renderTask) { renderTask.cancel(); renderTask = null; }
    if (textLayerInstance) { textLayerInstance.cancel?.(); textLayerInstance = null; }
    rendered.value = false;
}

// ── Natural page dimensions (get without rendering) ──────────────────────
async function loadPageDimensions() {
    if (!props.pdfDoc || dimsLoaded) return;
    try {
        const page = await toRaw(props.pdfDoc).getPage(props.pageNum);
        const vp = page.getViewport({ scale: 1 });
        pageWidth.value = vp.width;
        pageHeight.value = vp.height;
        dimsLoaded = true;
        emit('height-changed', Math.round(vp.height * props.zoomLevel));
    } catch { /* ignore */ }
}

// Вошли в окно — рисуем, вышли — отпускаем.
watch(() => props.active, (on) => {
    if (on) render();
    else release();
});

onMounted(() => {
    if (props.active) render();
});

// Заглушка подстраивается под первую страницу документа, пока не узнали свою.
watch(() => [props.defaultWidth, props.defaultHeight], ([w, h]) => {
    if (dimsLoaded) return;
    pageWidth.value = w;
    pageHeight.value = h;
});

// Масштаб поменялся — перерисовываем, но только то, что на виду.
watch(() => props.zoomLevel, () => {
    rendered.value = false;
    if (props.active) render();
});

// Сменился документ
watch(() => props.pdfDoc, async (doc) => {
    rendered.value = false;
    dimsLoaded = false;
    if (doc && props.active) {
        await loadPageDimensions();
        render();
    }
});

onBeforeUnmount(release);
</script>
