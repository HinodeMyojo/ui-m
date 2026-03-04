<template>
    <div class="pdf-page-wrapper" :data-page="pageNum"
        :style="placeholderStyle">
        <div class="pdf-page-num-label">{{ pageNum }}</div>
        <canvas ref="canvasEl" v-show="rendered"></canvas>
        <div v-if="!rendered" class="pdf-page-placeholder"></div>
        <div ref="textLayerEl" class="textLayer"></div>
        <PdfAnnotationLayer
            :annotations="annotations"
            :zoomLevel="zoomLevel"
            @remove="emit('remove-annotation', $event)"
            @edit-note="emit('edit-annotation-note', $event)"
        />
    </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount, toRaw } from 'vue';
import { TextLayer, AnnotationMode } from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
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
});

const emit = defineEmits(['remove-annotation', 'edit-annotation-note']);

const canvasEl = ref(null);
const textLayerEl = ref(null);
const rendered = ref(false);
const pageWidth = ref(612);   // default A4 points
const pageHeight = ref(792);

let renderTask = null;
let textLayerInstance = null;
let observer = null;
let isVisible = false;
let needsRender = false;

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
async function render() {
    if (!props.pdfDoc || !canvasEl.value) return;
    needsRender = false;
    const doc = toRaw(props.pdfDoc);
    try {
        const page = await doc.getPage(props.pageNum);
        const viewport = page.getViewport({ scale: props.zoomLevel });

        // Store natural page size (at scale=1)
        if (pageWidth.value === 612) {
            const vp1 = page.getViewport({ scale: 1 });
            pageWidth.value = vp1.width;
            pageHeight.value = vp1.height;
        }

        if (renderTask) { renderTask.cancel(); renderTask = null; }

        const canvas = canvasEl.value;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        // Fill white background so transparent images render correctly (SMask / ImageMask)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

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

// ── Render only when visible ─────────────────────────────────────────────
function scheduleRenderIfVisible() {
    if (isVisible) render();
    else needsRender = true;
}

// ── Natural page dimensions (get without rendering) ──────────────────────
async function loadPageDimensions() {
    if (!props.pdfDoc) return;
    try {
        const page = await toRaw(props.pdfDoc).getPage(props.pageNum);
        const vp = page.getViewport({ scale: 1 });
        pageWidth.value = vp.width;
        pageHeight.value = vp.height;
    } catch { /* ignore */ }
}

onMounted(async () => {
    await loadPageDimensions();

    const el = canvasEl.value?.closest('.pdf-page-wrapper');
    if (!el) return;

    observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            isVisible = entry.isIntersecting;
            if (isVisible && (needsRender || !rendered.value)) {
                render();
            }
        }
    }, { threshold: 0.01 });

    observer.observe(el);
});

// Re-render on zoom change (only if visible)
watch(() => props.zoomLevel, () => {
    rendered.value = false;
    scheduleRenderIfVisible();
});

// Re-render if pdfDoc changes
watch(() => props.pdfDoc, async (doc) => {
    rendered.value = false;
    if (doc) {
        await loadPageDimensions();
        scheduleRenderIfVisible();
    }
});

onBeforeUnmount(() => {
    if (renderTask) renderTask.cancel();
    if (observer) observer.disconnect();
    if (textLayerInstance) textLayerInstance.cancel?.();
});
</script>
