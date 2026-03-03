import { ref } from 'vue';

const STEP = 0.25;
const MIN = 0.25;
const MAX = 4;

export function usePdfZoom() {
    const zoomLevel = ref(1.0);

    function zoomIn() { zoomLevel.value = Math.min(MAX, +(zoomLevel.value + STEP).toFixed(2)); }
    function zoomOut() { zoomLevel.value = Math.max(MIN, +(zoomLevel.value - STEP).toFixed(2)); }
    function setZoom(v) { zoomLevel.value = Math.max(MIN, Math.min(MAX, +v.toFixed(2))); }

    function fitWidth(viewportEl, firstPageWidth) {
        if (!viewportEl || !firstPageWidth) return;
        const available = viewportEl.clientWidth - 64;
        setZoom(available / firstPageWidth);
    }

    function fitPage(viewportEl, firstPageWidth, firstPageHeight) {
        if (!viewportEl || !firstPageWidth) return;
        const scaleW = (viewportEl.clientWidth - 64) / firstPageWidth;
        const scaleH = (viewportEl.clientHeight - 32) / firstPageHeight;
        setZoom(Math.min(scaleW, scaleH));
    }

    return { zoomLevel, zoomIn, zoomOut, setZoom, fitWidth, fitPage };
}
