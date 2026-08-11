import { ref, watch, onBeforeUnmount } from 'vue';
import {
    getPdfDetailsCached,
    setPdfProgress,
    setPdfCover,
    sendPdfProgressBeacon,
    pdfLogicalToday,
} from '@/api/pdfFiles.js';

// Синхронизация чтения с библиотекой — docs/pdf-library.md.
//
// Для книги из библиотеки читалка помнит, где вы остановились, и копит время
// чтения. Файл, открытый с диска, ничего этого не знает: у него нет id.

const FLUSH_INTERVAL_MS = 30000;   // как часто отправляем позицию
const TICK_MS = 5000;              // шаг счётчика времени
const IDLE_LIMIT_MS = 90000;       // не шевелились полторы минуты — время не идёт
const COVER_WIDTH = 320;

export function usePdfReadingSync(fileId, pdfDoc, pageCount, currentPage, goToPage) {
    const details = ref(null);
    const restoring = ref(false);
    const secondsPending = ref(0);
    const sessionSeconds = ref(0);

    let lastActivity = Date.now();
    let lastSentPage = 0;
    let tickTimer = null;
    let flushTimer = null;

    function markActivity() {
        lastActivity = Date.now();
    }

    // Загружаем карточку и возвращаемся на страницу, где остановились.
    async function loadDetails() {
        details.value = null;
        if (!fileId.value) return null;
        try {
            const data = await getPdfDetailsCached(fileId.value);
            details.value = data;
            return data;
        } catch {
            return null;
        }
    }

    async function restorePosition() {
        const data = details.value;
        if (!data || !data.currentPage || data.currentPage <= 1) return;
        restoring.value = true;
        // Страницы появляются не мгновенно — даём разметке встать.
        await new Promise((resolve) => setTimeout(resolve, 150));
        goToPage(Math.min(data.currentPage, pageCount.value || data.currentPage));
        lastSentPage = data.currentPage;
        restoring.value = false;
    }

    async function flush({ finished = false, beacon = false } = {}) {
        if (!fileId.value) return;
        const page = currentPage.value;
        const seconds = secondsPending.value;
        if (!finished && seconds === 0 && page === lastSentPage) return;

        const payload = {
            currentPage: page,
            pageCount: pageCount.value,
            seconds,
            date: pdfLogicalToday(),
            finished,
        };
        secondsPending.value = 0;
        lastSentPage = page;

        if (beacon) {
            sendPdfProgressBeacon(fileId.value, payload);
            return;
        }
        try {
            await setPdfProgress(fileId.value, payload);
        } catch {
            // Не смогли отправить — вернём секунды, уйдут со следующей попыткой.
            secondsPending.value += seconds;
        }
    }

    // Обложка — первая страница, отрендеренная тут же: на сервере pdf-движка нет.
    async function ensureCover() {
        if (!fileId.value || !pdfDoc.value || details.value?.hasCover) return;
        try {
            const page = await pdfDoc.value.getPage(1);
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            await setPdfCover(fileId.value, canvas.toDataURL('image/jpeg', 0.7));
            if (details.value) details.value.hasCover = true;
        } catch {
            // Обложка — украшение, без неё библиотека переживёт.
        }
    }

    function start() {
        stop();
        tickTimer = setInterval(() => {
            if (document.hidden) return;
            if (Date.now() - lastActivity > IDLE_LIMIT_MS) return;
            secondsPending.value += TICK_MS / 1000;
            sessionSeconds.value += TICK_MS / 1000;
        }, TICK_MS);
        flushTimer = setInterval(() => flush(), FLUSH_INTERVAL_MS);
    }

    function stop() {
        clearInterval(tickTimer);
        clearInterval(flushTimer);
        tickTimer = null;
        flushTimer = null;
    }

    function onBeforeUnload() {
        flush({ beacon: true });
    }

    watch(fileId, async (id) => {
        stop();
        secondsPending.value = 0;
        sessionSeconds.value = 0;
        lastSentPage = 0;
        if (!id) return;
        await loadDetails();
        markActivity();
        start();
    }, { immediate: true });

    // Документ открылся — восстанавливаем позицию и досылаем обложку.
    watch(pdfDoc, async (doc) => {
        if (!doc || !fileId.value) return;
        if (!details.value) await loadDetails();
        await restorePosition();
        await ensureCover();
    });

    // Пролистнул страницу — это активность, и заодно повод сохраниться пораньше.
    watch(currentPage, () => {
        markActivity();
        if (!restoring.value && fileId.value && pageCount.value &&
            currentPage.value >= pageCount.value) {
            flush({ finished: true });
        }
    });

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('mousemove', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity);
    window.addEventListener('wheel', markActivity, { passive: true });
    window.addEventListener('touchstart', markActivity, { passive: true });

    onBeforeUnmount(() => {
        stop();
        flush({ beacon: true });
        window.removeEventListener('beforeunload', onBeforeUnload);
        window.removeEventListener('mousemove', markActivity);
        window.removeEventListener('keydown', markActivity);
        window.removeEventListener('wheel', markActivity);
        window.removeEventListener('touchstart', markActivity);
    });

    return { details, sessionSeconds, flush, markFinished: () => flush({ finished: true }) };
}
