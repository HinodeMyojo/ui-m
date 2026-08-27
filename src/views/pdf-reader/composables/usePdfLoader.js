import { ref, shallowRef } from 'vue';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Какую сборку pdf.js брать.
//
// Обычная сборка pdf.js 5 написана на свежем JS: 26 вызовов Promise.withResolvers
// в основном модуле и ещё 14 в воркере, без единого полифила. Этот метод Safari
// получил только в 17.4 (март 2024) — на iOS 16.0–17.3 читалка падала бы, даже
// когда с воркером всё в порядке. В пакете лежит вторая, legacy-сборка: тот же
// pdf.js, но пропущенный через core-js, — она заводится на любом айфоне, до
// которого вообще доезжает сам сайт.
//
// Проверяем не версию системы, а наличие метода: про версии UA врёт, про
// Promise — нет.
export const needsLegacyPdfjs = typeof Promise.withResolvers !== 'function';

let lib = null;
let libPromise = null;

// Обе сборки грузятся динамически, и не только ради старых Safari: pdf.js весит
// больше мегабайта, а нужен он на одном экране из двадцати. Статический импорт
// тащил его в общий бандл — на телефоне это оплаченный трафик за то, что человек,
// скорее всего, сегодня не откроет.
export function loadPdfjs() {
    if (libPromise) return libPromise;
    libPromise = (needsLegacyPdfjs
        ? import('pdfjs-dist/legacy/build/pdf.mjs')
        : import('pdfjs-dist')
    ).then((mod) => {
        // Воркер обязан быть из той же сборки, что и основной модуль: они
        // общаются по внутреннему протоколу и версии сверяют по строке.
        //
        // Адрес ставим всегда, включая Safari на iPhone и iPad. Раньше на iOS его
        // намеренно не ставили — в расчёте, что pdf.js разберёт документ в главном
        // потоке. С pdf.js 5 это ломает читалку намертво: запасной путь «без
        // воркера» импортирует тот же самый файл воркера, поэтому пустой workerSrc
        // означает не «работай без воркера», а «неоткуда взять код». getDocument()
        // кидает `No "GlobalWorkerOptions.workerSrc" specified.` синхронно, ещё до
        // сети, и на айфоне книга просто не открывалась. Модульные воркеры Safari
        // умеет с 15-й версии; если воркер всё-таки не поднимется, pdf.js сам
        // откатится на импорт в главный поток — но уже по известному адресу.
        mod.GlobalWorkerOptions.workerSrc = needsLegacyPdfjs
            ? new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href
            : new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
        lib = mod;
        return mod;
    }).catch((e) => {
        libPromise = null;   // сеть моргнула — дадим попробовать ещё раз
        throw e;
    });
    return libPromise;
}

// Синхронный доступ к уже поднятой сборке — для тех, кто рисует открытый
// документ и по определению зовётся после loadPdfjs().
export function pdfjs() {
    return lib;
}

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

    // Библиотеку и задачу поднимаем внутри try: getDocument() умеет бросить
    // синхронно (например, когда не найден воркер), и такая ошибка мимо loadError
    // уходила в никуда — на экране оставалась пустая зона загрузки, будто ничего
    // и не нажимали.
    async function run(makeTask, name) {
        isLoading.value = true;
        loadError.value = '';
        loadProgress.value = 0;
        fileName.value = name;
        try {
            const pdfjsLib = await loadPdfjs();
            const task = makeTask(pdfjsLib);
            loadingTask = task;
            task.onProgress = ({ loaded, total }) => {
                loadProgress.value = total ? Math.min(1, loaded / total) : 0;
            };
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
        await run((lib) => lib.getDocument({ data: arrayBuffer, ...COMMON_OPTIONS }), file.name);
    }

    // Книга из библиотеки читается прямо по ссылке, кусками через Range-запросы:
    // сорокамегабайтный том больше не надо целиком скачивать в память, чтобы
    // увидеть первую страницу. Всё остальное подтягивается по мере пролистывания.
    //
    // disableStream обязателен вместе с disableAutoFetch: по документации pdf.js
    // без него фоновая докачка всё равно тянет файл целиком, и толку от Range нет.
    async function loadFromUrl(url, { httpHeaders = {}, filename = '' } = {}) {
        streaming.value = true;
        await run((lib) => lib.getDocument({
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
