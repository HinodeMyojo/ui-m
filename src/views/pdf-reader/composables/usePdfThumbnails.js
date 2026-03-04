import { ref, toRaw } from 'vue';

const THUMB_SCALE = 0.15;

export function usePdfThumbnails() {
    const thumbRefs = ref({});
    const renderedThumbs = ref(new Set());

    async function renderThumbnail(pdfDoc, pageNum) {
        if (!pdfDoc || renderedThumbs.value.has(pageNum)) return;
        const canvas = thumbRefs.value[pageNum];
        if (!canvas) return;
        try {
            const page = await toRaw(pdfDoc).getPage(pageNum);
            const viewport = page.getViewport({ scale: THUMB_SCALE });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            renderedThumbs.value.add(pageNum);
        } catch { /* skip */ }
    }

    function resetThumbnails() { renderedThumbs.value = new Set(); }

    return { thumbRefs, renderedThumbs, renderThumbnail, resetThumbnails };
}
