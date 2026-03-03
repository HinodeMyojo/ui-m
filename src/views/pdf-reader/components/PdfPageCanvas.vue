<template>
    <div class="pdf-page-wrapper" :data-page="pageNum"
        :style="placeholderStyle">
        <div class="pdf-page-num-label">{{ pageNum }}</div>
        <canvas ref="canvasEl" v-show="rendered"></canvas>
        <div v-if="!rendered" class="pdf-page-placeholder"></div>
        <div ref="textLayerEl" class="textLayer"></div>
    </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount, toRaw } from 'vue';
import { TextLayer } from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';

const props = defineProps({
    pdfDoc: Object,
    pageNum: Number,
    zoomLevel: Number,
    nightMode: Boolean,
    searchQuery: String,
    searchPageMatches: Number,
});

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

        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        renderTask = null;
        rendered.value = true;

        // Text layer (for text selection)
        const tl = textLayerEl.value;
        if (tl) {
            tl.innerHTML = '';
            if (textLayerInstance) { textLayerInstance.cancel?.(); textLayerInstance = null; }
            // pdfjs-dist v5 uses --total-scale-factor CSS variable for sizing/positioning
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
