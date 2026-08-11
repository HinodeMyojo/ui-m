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

const COMMON_OPTIONS = {
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist/standard_fonts/',
    ...(isIOS ? { isEvalSupported: false } : {}),
};

export function usePdfLoader() {
    const pdfDoc = shallowRef(null);
    const pageCount = ref(0);
    const isLoading = ref(false);
    const loadError = ref('');
    const fileName = ref('');
    // Доля загруженного, 0..1. Для потокового чтения это «сколько байт уже
    // подтянули», а не «когда откроется»: первая страница появляется сильно раньше.
    const loadProgress = ref(0);
    const streaming = ref(false);

    let loadingTask = null;

    async function run(task, name) {
        isLoading.value = true;
        loadError.value = '';
        loadProgress.value = 0;
        fileName.value = name;
        loadingTask = task;
        task.onProgress = ({ loaded, total }) => {
            loadProgress.value = total ? Math.min(1, loaded / total) : 0;
        };
        try {
            const doc = await task.promise;
            pdfDoc.value = doc;
            pageCount.value = doc.numPages;
        } catch (e) {
            loadError.value = 'Не удалось загрузить PDF: ' + e.message;
        } finally {
            isLoading.value = false;
            loadingTask = null;
        }
    }

    async function loadFromFile(file) {
        if (!file || file.type !== 'application/pdf') {
            loadError.value = 'Пожалуйста, выберите PDF файл';
            return;
        }
        streaming.value = false;
        const arrayBuffer = await file.arrayBuffer();
        await run(pdfjsLib.getDocument({ data: arrayBuffer, ...COMMON_OPTIONS }), file.name);
    }

    // Книга из библиотеки читается прямо по ссылке, кусками через Range-запросы:
    // сорокамегабайтный том больше не надо целиком скачивать в память, чтобы
    // увидеть первую страницу. Всё остальное подтягивается по мере пролистывания.
    //
    // disableStream обязателен вместе с disableAutoFetch: по документации pdf.js
    // без него фоновая докачка всё равно тянет файл целиком, и толку от Range нет.
    async function loadFromUrl(url, { httpHeaders = {}, filename = '' } = {}) {
        streaming.value = true;
        await run(pdfjsLib.getDocument({
            url,
            httpHeaders,
            withCredentials: false,
            rangeChunkSize: 262144,  // 256 КБ за запрос
            disableRange: false,
            disableStream: true,
            disableAutoFetch: true,
            ...COMMON_OPTIONS,
        }), filename);
    }

    function closeDocument() {
        try {
            loadingTask?.destroy();
        } catch { /* задача уже завершилась */ }
        loadingTask = null;
        if (pdfDoc.value) {
            pdfDoc.value.destroy();
            pdfDoc.value = null;
        }
        pageCount.value = 0;
        fileName.value = '';
        loadError.value = '';
        loadProgress.value = 0;
        streaming.value = false;
    }

    return {
        pdfDoc, pageCount, isLoading, loadError, fileName, loadProgress, streaming,
        loadFromFile, loadFromUrl, closeDocument,
    };
}
