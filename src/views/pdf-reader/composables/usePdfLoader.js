import { ref, shallowRef } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

// Detect iOS Safari — it can't run ESM workers (hangs forever)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (!isIOS) {
    // Desktop/Android: use local bundled worker (fast)
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
}
// On iOS: workerSrc stays unset → pdfjs runs parser in main thread (no hanging)

export { pdfjsLib };

export function usePdfLoader() {
    const pdfDoc = shallowRef(null);
    const pageCount = ref(0);
    const isLoading = ref(false);
    const loadError = ref('');
    const fileName = ref('');

    async function loadFromFile(file) {
        if (!file || file.type !== 'application/pdf') {
            loadError.value = 'Пожалуйста, выберите PDF файл';
            return;
        }
        isLoading.value = true;
        loadError.value = '';
        fileName.value = file.name;
        try {
            const arrayBuffer = await file.arrayBuffer();
            const doc = await pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist/cmaps/',
                cMapPacked: true,
                standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist/standard_fonts/',
                // Disable worker on iOS to avoid ESM worker hang
                ...(isIOS ? { disableAutoFetch: false, isEvalSupported: false } : {}),
            }).promise;
            pdfDoc.value = doc;
            pageCount.value = doc.numPages;
        } catch (e) {
            loadError.value = 'Не удалось загрузить PDF: ' + e.message;
        } finally {
            isLoading.value = false;
        }
    }

    function closeDocument() {
        if (pdfDoc.value) {
            pdfDoc.value.destroy();
            pdfDoc.value = null;
        }
        pageCount.value = 0;
        fileName.value = '';
        loadError.value = '';
    }

    return { pdfDoc, pageCount, isLoading, loadError, fileName, loadFromFile, closeDocument };
}
