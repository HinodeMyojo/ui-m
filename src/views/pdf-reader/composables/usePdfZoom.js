import { ref } from 'vue';

const STEP = 0.25;
const MIN = 0.25;
const MAX = 4;

export function usePdfZoom() {
    const zoomLevel = ref(1.0);

    function zoomIn() { zoomLevel.value = Math.min(MAX, +(zoomLevel.value + STEP).toFixed(2)); }
    function zoomOut() { zoomLevel.value = Math.max(MIN, +(zoomLevel.value - STEP).toFixed(2)); }
    function setZoom(v) { zoomLevel.value = Math.max(MIN, Math.min(MAX, +v.toFixed(2))); }

    // Сколько ширины реально остаётся под страницу. Раньше здесь стояли зашитые
    // 64px — ровно поля десктопной раскладки. На телефоне поля другие, и книга
    // всё равно вылезала за экран.
    function availableWidth(viewportEl) {
        const style = getComputedStyle(viewportEl);
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        return Math.max(1, viewportEl.clientWidth - padding);
    }

    function availableHeight(viewportEl) {
        const style = getComputedStyle(viewportEl);
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        return Math.max(1, viewportEl.clientHeight - padding);
    }

    function fitWidth(viewportEl, firstPageWidth) {
        if (!viewportEl || !firstPageWidth) return;
        setZoom(availableWidth(viewportEl) / firstPageWidth);
    }

    function fitPage(viewportEl, firstPageWidth, firstPageHeight) {
        if (!viewportEl || !firstPageWidth) return;
        const scaleW = availableWidth(viewportEl) / firstPageWidth;
        const scaleH = availableHeight(viewportEl) / firstPageHeight;
        setZoom(Math.min(scaleW, scaleH));
    }

    return { zoomLevel, zoomIn, zoomOut, setZoom, fitWidth, fitPage };
}
