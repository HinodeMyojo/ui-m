<template>
    <div class="pdf-reader" :class="{ dark: darkMode, 'pdf-chrome-hidden': !chromeVisible }"
        tabindex="0" @keydown="onKeydown" ref="rootEl">

        <!-- Drop zone (before PDF loaded) -->
        <template v-if="!pdfDoc">
            <div v-if="isLoading" class="pdf-loading-overlay">
                <span class="pdf-spin"></span>
                {{ streaming ? "Открываем" : "Загружаем" }} {{ fileName }}…
                <!-- В потоковом режиме процент считается от подтянутых кусков,
                     а не от «когда откроется», и только путает. -->
                <template v-if="!streaming && loadProgress > 0">{{ Math.round(loadProgress * 100) }}%</template>
            </div>
            <PdfDropZone v-else :darkMode="darkMode" :isLoading="isLoading" :loadError="loadError"
                @file-selected="onFileSelected" />
        </template>

        <!-- Full reader (after PDF loaded) -->
        <template v-else>
            <PdfToolbar :fileName="fileName" :currentPage="currentPage" :pageCount="pageCount" :zoomLevel="zoomLevel"
                :darkMode="darkMode" :nightMode="nightMode" :nightBrightness="nightBrightness" :isFullscreen="isFullscreen" :showSidebar="showSidebar"
                :showThumbnails="showThumbnails" :searchOpen="searchOpen" :readProgress="readProgress"
                :estimatedReadingTime="estimatedReadingTime" :canPrev="canPrev" :canNext="canNext"
                :isCurrentPageBookmarked="isCurrentPageBookmarked"
                :hoverTranslate="hoverMode"
                @prev-page="prevPage" @next-page="nextPage" @jump-to-page="goToPage"
                @zoom-in="zoomTo(Math.min(4, +(zoomLevel + 0.25).toFixed(2)), viewportEl?.clientHeight / 2 ?? 0)"
                @zoom-out="zoomTo(Math.max(0.25, +(zoomLevel - 0.25).toFixed(2)), viewportEl?.clientHeight / 2 ?? 0)"
                @fit-width="onFitWidth" @fit-page="onFitPage" @toggle-dark="toggleDark" @toggle-night="toggleNight"
                @night-brightness-down="setNightBrightness(nightBrightness - 10)"
                @night-brightness-up="setNightBrightness(nightBrightness + 10)"
                @toggle-fullscreen="toggleFullscreen" @toggle-sidebar="toggleSidebar"
                @toggle-thumbnails="toggleThumbnails" @toggle-search="openSearch" @close-doc="onCloseDoc"
                @toggle-bookmark="toggleCurrentPage"
                @toggle-hover-translate="hoverMode = !hoverMode"
                @open-translate-settings="showTranslateSettings = true"
                @go-home="$router.push('/')" />

            <PdfSearchBar v-if="searchOpen" :searchQuery="searchQuery" :matchCount="searchMatches.length"
                :currentMatchIdx="searchIdx" :isSearching="isSearching"
                @update:searchQuery="q => { searchQuery = q; runSearch(); }" @next="nextMatch" @prev="prevMatch"
                @close="closeSearch" />

            <div class="pdf-reader-body">
                <PdfSidebar v-if="showSidebar" :tocItems="tocItems" :currentPage="currentPage"
                    :bookmarks="bookmarks" :annotations="annotations"
                    @go-to-page="goToPage" @close="toggleSidebar"
                    @remove-bookmark="removeBookmark"
                    @update-bookmark-label="updateLabel"
                    @remove-annotation="removeAnnotation"
                    @export-annotations="exportAnnotations"
                    @import-annotations="importAnnotations" />

                <div class="pdf-viewport" :class="{ 'pdf-night-viewport': nightMode }"
                    :style="nightMode ? { filter: `invert(1) hue-rotate(180deg) brightness(${nightBrightness / 100})` } : {}"
                    ref="viewportEl" @scroll="onScroll" @mouseup="onViewportMouseUp" @mousemove="onViewportMouseMove">
                    <div class="pdf-pages" ref="pagesEl">
                    <PdfPageCanvas v-for="n in pageCount" :key="n" :pdfDoc="pdfDoc" :pageNum="n"
                        :defaultWidth="defaultPageSize.width" :defaultHeight="defaultPageSize.height"
                        :zoomLevel="zoomLevel" :nightMode="nightMode" :searchQuery="searchQuery"
                        :searchPageMatches="matchesByPage[n] || 0"
                        :annotations="annotationsByPage[n] || EMPTY_ANNOTATIONS"
                        :active="layoutReady && activePages.has(n)"
                        :goToPage="goToPage"
                        @remove-annotation="removeAnnotation"
                        @edit-annotation-note="openNoteEdit"
                        :ref="el => setPageRef(n, el?.$el ?? el)" />
                    </div>
                </div>
            </div>

            <PdfThumbnailStrip v-if="showThumbnails" :pdfDoc="pdfDoc" :pageCount="pageCount"
                :currentPage="currentPage" :thumbRefs="thumbRefs" @go-to-page="goToPage"
                @render-thumb="n => renderThumbnail(pdfDoc.value, n)" />

            <!-- Selection toolbar -->
            <PdfSelectionToolbar
                :visible="selToolbar.visible"
                :x="selToolbar.x"
                :y="selToolbar.y"
                :existingNote="selToolbar.existingNote"
                @highlight="onHighlight"
                @copy="onCopySelection"
                @translate="onSelectionTranslate"
                @add-to-vocab="onSelectionAddToVocab"
                @save-note="onSaveNote"
                @dismiss="hideSelToolbar" />

            <!-- Translation modal -->
            <PdfTranslationModal
                :visible="transModal.visible"
                :originalText="transModal.originalText"
                :translatedText="lastTranslation?.translated ?? ''"
                :detectedLang="lastTranslation?.detectedLang ?? ''"
                :translationError="translationError"
                :isTranslating="isTranslating"
                :sourceLang="sourceLang"
                :targetLang="targetLang"
                :languages="LANGUAGES"
                :existingNote="transModal.existingNote"
                :analyzeResult="analyzeResult"
                :isAnalyzing="isAnalyzing"
                :analyzeError="analyzeError"
                :openVocabTab="transModal.openVocabTab"
                @close="transModal.visible = false; transModal.openVocabTab = false"
                @translate="onModalTranslate"
                @analyze="w => analyzeText(w)"
                @speak-original="speakText(transModal.originalText, sourceLang)"
                @speak-translation="speakText(lastTranslation?.translated ?? '', lastTranslation?.detectedLang ?? targetLang)"
                @save-note="onTranslationNote"
                @highlight="onTranslationHighlight"
                @change-langs="onChangeLangs"
                @add-to-vocab="onModalAddToVocab" />

            <!-- Translation settings -->
            <PdfTranslationSettings
                :visible="showTranslateSettings"
                :apiKey="apiKey"
                :checkApiKey="checkApiKey"
                :analyzeProvider="analyzeProvider"
                :analyzeKeys="analyzeKeys"
                @close="showTranslateSettings = false"
                @update:apiKey="v => apiKey = v"
                @update:analyzeProvider="v => analyzeProvider = v"
                @update:analyzeKeys="v => analyzeKeys = v" />

            <!-- Hover translate tooltip -->
            <div v-if="hoverTooltip.visible" class="pdf-translate-tooltip"
                :style="{ left: hoverTooltip.x + 'px', top: hoverTooltip.y + 'px' }"
                @mouseenter="clearHoverHide" @mouseleave="scheduleHoverHide">
                <div class="pdf-tt-word">{{ hoverTooltip.word }}</div>
                <div class="pdf-tt-arrow">→</div>
                <div class="pdf-tt-translation">{{ hoverTooltip.translation }}</div>
                <button class="pdf-tt-expand" @click="expandHoverToModal">↗</button>
            </div>

            <!-- Toast -->
            <div v-if="toastMsg" class="pdf-toast">{{ toastMsg }}</div>

            <!-- Reading info badge -->
            <div class="pdf-reading-info">
                <span class="pdf-ri-page">{{ currentPage }}/{{ pageCount }}</span>
                <span class="pdf-ri-sep"> · </span>{{ Math.round(readProgress * 100) }}%
                <span class="pdf-ri-extra"> · {{ estimatedReadingTime }}</span>
                <template v-if="libraryFileId">
                    <span class="pdf-ri-extra"> · 📚 сохраняю позицию</span>
                    <template v-if="sessionSeconds >= 60">
                        <span class="pdf-ri-extra"> · {{ Math.round(sessionSeconds / 60) }} мин</span>
                    </template>
                </template>
            </div>
        </template>

    </div>
</template>

<script setup>
import { ref, computed, reactive, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { usePdfLoader }         from './pdf-reader/composables/usePdfLoader.js';
import { resetRenderQueue, setRenderPaused } from './pdf-reader/composables/usePdfRenderQueue.js';
import { usePdfTheme }          from './pdf-reader/composables/usePdfTheme.js';
import { usePdfZoom }           from './pdf-reader/composables/usePdfZoom.js';
import { usePdfNavigation }     from './pdf-reader/composables/usePdfNavigation.js';
import { usePdfProgress }       from './pdf-reader/composables/usePdfProgress.js';
import { usePdfToc }            from './pdf-reader/composables/usePdfToc.js';
import { usePdfSearch }         from './pdf-reader/composables/usePdfSearch.js';
import { usePdfThumbnails }     from './pdf-reader/composables/usePdfThumbnails.js';
import { usePdfAnnotations }    from './pdf-reader/composables/usePdfAnnotations.js';
import { usePdfBookmarks }      from './pdf-reader/composables/usePdfBookmarks.js';
import { usePdfTranslation }    from './pdf-reader/composables/usePdfTranslation.js';
import { usePdfReadingSync }    from './pdf-reader/composables/usePdfReadingSync.js';
import { addVocabCard }         from '@/components/api.js';
import { getPdfDownloadUrl, getPdfDetailsCached } from '@/api/pdfFiles.js';
import { useRoute, useRouter }  from 'vue-router';
import { isMobile }             from '@/composables/useIsMobile.js';
import PdfDropZone              from './pdf-reader/components/PdfDropZone.vue';
import PdfToolbar               from './pdf-reader/components/PdfToolbar.vue';
import PdfPageCanvas            from './pdf-reader/components/PdfPageCanvas.vue';
import PdfSidebar               from './pdf-reader/components/PdfSidebar.vue';
import PdfSearchBar             from './pdf-reader/components/PdfSearchBar.vue';
import PdfThumbnailStrip        from './pdf-reader/components/PdfThumbnailStrip.vue';
import PdfSelectionToolbar      from './pdf-reader/components/PdfSelectionToolbar.vue';
import PdfTranslationModal      from './pdf-reader/components/PdfTranslationModal.vue';
import PdfTranslationSettings   from './pdf-reader/components/PdfTranslationSettings.vue';
import './pdf-reader/pdf-reader.css';

// ── Core state ────────────────────────────────────────────────────────────
const { pdfDoc, pageCount, isLoading, loadError, fileName, loadProgress, streaming, loadFromFile, loadFromUrl, closeDocument } = usePdfLoader();
const { darkMode, nightMode, nightBrightness, isFullscreen, showSidebar, showThumbnails, toggleDark, toggleNight, setNightBrightness, toggleFullscreen, toggleSidebar, toggleThumbnails } = usePdfTheme();
const { zoomLevel, setZoom, fitWidth, fitPage } = usePdfZoom();
const { currentPage, pageRefs, canPrev, canNext, goToPage, prevPage, nextPage, onViewportScroll } = usePdfNavigation(pageCount);
const { readProgress, estimatedReadingTime } = usePdfProgress(pageCount, currentPage);
const { tocItems } = usePdfToc(pdfDoc);
const { searchOpen, searchQuery, searchMatches, searchIdx, isSearching, openSearch, closeSearch, runSearch, nextMatch, prevMatch } = usePdfSearch(pdfDoc, pageCount, goToPage);
const { thumbRefs, renderThumbnail, resetThumbnails } = usePdfThumbnails();
// Книга из библиотеки: позиция, закладки и выделения живут на сервере,
// а время в читалке уходит в план обучения — docs/pdf-library.md
const route = useRoute();
const router = useRouter();
const libraryFileId = ref(typeof route.query.file === 'string' ? route.query.file : '');

const { annotations, annotationsForPage, addAnnotation, updateNote, removeAnnotation, exportAnnotations, importAnnotations } = usePdfAnnotations(fileName, libraryFileId);
const { bookmarks, isCurrentPageBookmarked, toggleCurrentPage, removeBookmark, updateLabel } = usePdfBookmarks(fileName, currentPage, libraryFileId);
const { details: libraryDetails, sessionSeconds, flush: flushReading } = usePdfReadingSync(
    libraryFileId, pdfDoc, pageCount, currentPage, goToPage,
);
const { apiKey, hoverMode, sourceLang, targetLang, isTranslating, translationError, lastTranslation,
        translate, checkApiKey, speakText, stopSpeech,
        analyzeText, analyzeResult, isAnalyzing, analyzeError,
        analyzeProvider, analyzeKeys,
        LANGUAGES } = usePdfTranslation(fileName);

const viewportEl = ref(null);
const pagesEl = ref(null);

// Режим чтения: панели прячутся, экран отдан тексту. На телефоне шапка с
// номером страницы и нижняя плашка съедали около сотни точек по вертикали из
// восьмисот — это полторы строки текста на каждом экране.
//
// Панели возвращаются по одиночному тапу и прячутся, когда начинаешь листать:
// раз человек читает, кнопки ему не нужны.
const chromeVisible = ref(true);
// Откуда отсчитываем «человек начал листать». Появление панели само меняет
// высоту области чтения, браузер поправляет прокрутку — и без порога панель
// пряталась бы ровно в тот момент, когда её позвали.
let chromeScrollAnchor = 0;
let chromeToggledAt = 0;

function toggleChrome() {
    chromeVisible.value = !chromeVisible.value;
    chromeToggledAt = Date.now();
    chromeScrollAnchor = viewportEl.value?.scrollTop ?? 0;
}

// ── Окно живых страниц ────────────────────────────────────────────────────
//
// Раньше каждая страница заводила собственный IntersectionObserver и держала
// канвас — в книге на триста страниц это триста наблюдателей, триста канвасов
// (даже пустой резервирует буфер) и триста бесконечных анимаций-мерцалок.
// Замер на эмуляции айфона: 5 секунд только на монтирование списка, 59 МБ под
// канвасами сразу и 95 МБ после пролистывания.
//
// Теперь наблюдатель один на весь документ, а страницы вне окна — пустые рамки
// нужного размера. rootMargin в 100% даёт запас по экрану сверху и снизу, чтобы
// при обычной прокрутке страница успевала нарисоваться заранее.
const activePages = ref(new Set());
const EMPTY_ANNOTATIONS = [];
// Пока не известен размер первой страницы и не выбран масштаб, не рисуем ничего.
// Иначе на телефоне первая страница рисуется дважды: сперва в натуральную
// величину, потом заново — по ширине экрана. На придушенном процессоре это
// лишняя секунда ровно там, где её больнее всего ждать.
const layoutReady = ref(false);
let pageObserver = null;

// Пересчёт текущей страницы — не чаще раза на кадр. Событие прокрутки на
// телефоне приходит по несколько раз за кадр, а обработчик только и делает,
// что читает разметку: это самый дорогой способ потерять кадр.
let scrollFrame = 0;

function requestPageRecalc() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        onViewportScroll(viewportEl.value, activePages.value);
    });
}

function onPageIntersect(entries) {
    for (const entry of entries) {
        const n = +entry.target.dataset.page;
        if (!n) continue;
        if (entry.isIntersecting) activePages.value.add(n);
        else activePages.value.delete(n);
    }
    // Текущую страницу ищем только среди живых, а список живых обновляет
    // наблюдатель — уже после того, как прокрутка утихла. Без пересчёта здесь
    // номер в шапке застревает на той странице, откуда прыгнули.
    requestPageRecalc();
}

function setPageRef(n, el) {
    const previous = pageRefs.value[n];
    if (previous && previous !== el) pageObserver?.unobserve(previous);
    if (el) {
        pageRefs.value[n] = el;
        pageObserver?.observe(el);
    } else {
        delete pageRefs.value[n];
        activePages.value.delete(n);
    }
}

// Совпадения поиска и выделения — картой по номеру страницы. Фильтр в шаблоне
// вызывался на каждую из трёхсот страниц при каждой перерисовке.
const matchesByPage = computed(() => {
    const map = {};
    for (const m of searchMatches.value) map[m.pageNum] = (map[m.pageNum] || 0) + 1;
    return map;
});

const annotationsByPage = computed(() => {
    const map = {};
    for (const a of annotations.value) (map[a.pageNum] ||= []).push(a);
    return map;
});
const rootEl = ref(null);

// Размер первой страницы: по нему рисуются заглушки всех остальных, пока до них
// не долистали. Один getPage вместо тысячи при открытии книги.
const defaultPageSize = ref({ width: 612, height: 792 });

watch(pdfDoc, async (doc) => {
    resetRenderQueue();
    if (!doc) {
        layoutReady.value = false;
        return;
    }
    try {
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        defaultPageSize.value = { width: viewport.width, height: viewport.height };
        // На телефоне книга открывается по ширине экрана. Масштаб 1 означает
        // страницу в её натуральные 612 точек при экране в 390: каждую строку
        // приходилось возить пальцем вбок, и читать было нечем.
        if (isMobile.value) {
            await nextTick();
            fitWidth(viewportEl.value, viewport.width);
        }
    } catch { /* останемся с A4 */ } finally {
        layoutReady.value = true;
        // Книга открылась — панели видно, и возврат на сохранённую страницу их
        // не прячет: это не человек листает, это читалка восстанавливает место.
        chromeVisible.value = true;
        chromeToggledAt = Date.now();
        chromeScrollAnchor = viewportEl.value?.scrollTop ?? 0;
    }
});

// ── Translation UI state ──────────────────────────────────────────────────
const showTranslateSettings = ref(false);
const transModal = reactive({ visible: false, originalText: '', existingNote: '', pendingSelection: null });

const hoverTooltip = reactive({ visible: false, x: 0, y: 0, word: '', translation: '' });
let hoverDebounce = null;
let hoverHideTimer = null;
let lastHoverWord = '';

async function onSelectionTranslate() {
    if (!pendingSelection) return;
    // Capture before hideSelToolbar() clears pendingSelection
    const sel = { ...pendingSelection };
    transModal.originalText = sel.selectedText;
    transModal.existingNote = '';
    transModal.pendingSelection = sel;
    transModal.visible = true;
    hideSelToolbar();
    await translate(sel.selectedText, sourceLang.value, targetLang.value);
}

async function onModalTranslate(text, src, tgt) {
    await translate(text, src, tgt);
}

function onChangeLangs(src, tgt) {
    sourceLang.value = src;
    targetLang.value = tgt;
    if (transModal.originalText) {
        translate(transModal.originalText, src, tgt);
    }
}

function onTranslationNote(note) {
    if (transModal.pendingSelection) {
        const sel = transModal.pendingSelection;
        addAnnotation(sel.pageNum, sel.rects, 'yellow', sel.selectedText);
        const last = annotations.value[annotations.value.length - 1];
        if (last && note) updateNote(last.id, note);
    }
}

function onTranslationHighlight(color) {
    if (transModal.pendingSelection) {
        const sel = transModal.pendingSelection;
        addAnnotation(sel.pageNum, sel.rects, color, sel.selectedText);
    }
}

// ── Hover translate ───────────────────────────────────────────────────────
let isScrolling = false;
let scrollEndTimer = null;
let lastScrollTime = 0;

function onViewportMouseMove(e) {
    if (!hoverMode.value || !pdfDoc.value) return;
    // Block hover for 600ms after last scroll event regardless of isScrolling flag
    if (isScrolling || Date.now() - lastScrollTime < 600) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) < 2) return;
    clearTimeout(hoverDebounce);
    hoverDebounce = setTimeout(() => doHoverTranslate(e.clientX, e.clientY), 800);
}

function onViewportScrollForHover() {
    lastScrollTime = Date.now();
    isScrolling = true;
    clearTimeout(hoverDebounce);
    hoverTooltip.visible = false;
    clearTimeout(scrollEndTimer);
    // 800ms after last scroll event — covers inertial/momentum scrolling
    scrollEndTimer = setTimeout(() => { isScrolling = false; }, 800);
}

async function doHoverTranslate(clientX, clientY) {
    // Get word under cursor
    let range;
    if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(clientX, clientY);
    } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(clientX, clientY);
        if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.setEnd(pos.offsetNode, pos.offset);
        }
    }
    if (!range) return;

    // Expand to word
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try {
        sel.modify('move', 'backward', 'word');
        sel.modify('extend', 'forward', 'word');
    } catch {
        // Firefox fallback
        const node = range.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) return;
        const text = node.textContent;
        let start = range.startOffset;
        let end = range.startOffset;
        while (start > 0 && /\w/.test(text[start - 1])) start--;
        while (end < text.length && /\w/.test(text[end])) end++;
        sel.removeAllRanges();
        const wr = document.createRange();
        wr.setStart(node, start);
        wr.setEnd(node, end);
        sel.addRange(wr);
    }

    const word = sel.toString().trim();
    sel.removeAllRanges();

    if (!word || word === lastHoverWord || word.length < 3 || word.length > 60) return;
    if (!/[a-zA-Zа-яёА-ЯЁ]/.test(word)) return; // skip numbers/punctuation
    lastHoverWord = word;

    const result = await translate(word, sourceLang.value, targetLang.value);
    if (!result) return;

    hoverTooltip.word = word;
    hoverTooltip.translation = result.translated;
    hoverTooltip.x = clientX + 12;
    hoverTooltip.y = clientY - 10;
    hoverTooltip.visible = true;
    scheduleHoverHide();
}

function scheduleHoverHide() {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = setTimeout(() => {
        hoverTooltip.visible = false;
        lastHoverWord = '';
    }, 3000);
}

function clearHoverHide() {
    clearTimeout(hoverHideTimer);
}

async function expandHoverToModal() {
    clearHoverHide();
    hoverTooltip.visible = false;
    transModal.originalText = hoverTooltip.word;
    transModal.existingNote = '';
    transModal.pendingSelection = null;
    transModal.visible = true;
    await translate(hoverTooltip.word, sourceLang.value, targetLang.value);
}

// ── Scroll coordinator ────────────────────────────────────────────────────
let renderResumeTimer = null;

function onScroll(e) {
    if (e.ctrlKey) return;
    requestPageRecalc();
    onViewportScrollForHover();
    // Листаешь — значит читаешь, кнопки не нужны. Порог в сорок точек и паузу
    // после ручного показа отсчитываем, чтобы панель не пряталась от дрожания
    // прокрутки и не мигала.
    if (chromeVisible.value && isMobile.value && Date.now() - chromeToggledAt > 600) {
        const top = viewportEl.value?.scrollTop ?? 0;
        if (Math.abs(top - chromeScrollAnchor) > 40) chromeVisible.value = false;
    }

    // Пока лист летит, отрисовку придерживаем — иначе она отъедает те самые
    // кадры, из-за которых прокрутка и дёргается.
    setRenderPaused(true);
    clearTimeout(renderResumeTimer);
    renderResumeTimer = setTimeout(() => setRenderPaused(false), 180);
}

// ── Zoom with stable scroll position ─────────────────────────────────────
function zoomTo(newZoom, anchorScreenY) {
    const vp = viewportEl.value;
    if (!vp) { setZoom(newZoom); return; }

    // Find page element under anchor point
    const absY = vp.scrollTop + anchorScreenY;
    let anchor = null;
    for (const el of Object.values(pageRefs.value ?? {})) {
        if (!el) continue;
        const top = el.offsetTop;
        const h   = el.offsetHeight;
        if (absY >= top && absY < top + h) {
            anchor = { el, ratio: (absY - top) / h, screenY: anchorScreenY };
            break;
        }
    }

    const oldZoom = zoomLevel.value;
    setZoom(newZoom);

    nextTick(() => requestAnimationFrame(() => {
        if (!anchor) {
            // Fallback: scale scrollTop proportionally
            vp.scrollTop = vp.scrollTop * (newZoom / oldZoom);
            return;
        }
        const newTop = anchor.el.offsetTop;
        const newH   = anchor.el.offsetHeight;
        vp.scrollTop = newTop + anchor.ratio * newH - anchor.screenY;
    }));
}

function onViewportWheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1 : -1;
    const step = Math.abs(e.deltaY) > 100 ? 0.25 : 0.1;
    const next = Math.round((zoomLevel.value + factor * step) * 100) / 100;
    zoomTo(next, e.offsetY);
}

// ── Жесты на телефоне ─────────────────────────────────────────────────────
//
// Своего щипка у читалки не было, поэтому пальцами масштабировался весь
// документ браузера: шапка и низ уезжали за пределы видимой области, а вернуть
// «одну страницу по ширине» было уже нечем. Теперь щипок меняет масштаб книги,
// а зум самого браузера внутри читалки запрещён.
//
// Во время жеста страницы не перерисовываем — тянем CSS-трансформ, это работа
// для видеокарты. Настоящий масштаб выставляем один раз, когда пальцы убрали.

// Масштаб, при котором страница ровно по ширине экрана.
function fitZoomValue() {
    const vp = viewportEl.value;
    const width = defaultPageSize.value.width;
    if (!vp || !width) return 1;
    const style = getComputedStyle(vp);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    return Math.max(0.25, Math.min(4, (vp.clientWidth - padding) / width));
}

let pinch = null;

function touchSpread(touches) {
    return Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
    );
}

// Одиночное касание отличаем от прокрутки и от выделения: палец не должен
// сдвинуться больше чем на десяток точек, и всё должно уложиться в полсекунды.
let tapStart = null;
let chromeTapTimer = null;

function onTouchStart(e) {
    if (e.touches.length === 1 && !pinch) {
        tapStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
    } else {
        tapStart = null;
    }
    if (e.touches.length !== 2) return;
    const vp = viewportEl.value;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const style = getComputedStyle(vp);
    const padLeft = parseFloat(style.paddingLeft);
    const padTop = parseFloat(style.paddingTop);
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
    pinch = {
        spread: touchSpread(e.touches),
        zoom: zoomLevel.value,
        scale: 1,
        midX,
        midY,
        // Точка книги под пальцами — её и держим на месте.
        contentX: vp.scrollLeft + midX,
        contentY: vp.scrollTop + midY,
        originX: vp.scrollLeft + midX - padLeft,
        originY: vp.scrollTop + midY - padTop,
    };
    setRenderPaused(true);
}

function onTouchMove(e) {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const raw = touchSpread(e.touches) / pinch.spread;
    pinch.scale = Math.max(0.25 / pinch.zoom, Math.min(4 / pinch.zoom, raw));
    const el = pagesEl.value;
    if (el) {
        el.style.transformOrigin = pinch.originX + 'px ' + pinch.originY + 'px';
        el.style.transform = 'scale(' + pinch.scale + ')';
    }
}

function onTouchEnd(e) {
    if (pinch) {
        if (e.touches.length > 0) return;   // палец ещё на экране — жест не закончен
        const done = pinch;
        pinch = null;
        const el = pagesEl.value;
        if (el) { el.style.transform = ''; el.style.transformOrigin = ''; }
        applyZoomKeepingPoint(done.zoom * done.scale, done);
        tapStart = null;
        return;
    }
    if (!isTap(e)) { tapStart = null; return; }
    tapStart = null;
    onDoubleTap(e);
}

function isTap(e) {
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch || !tapStart || e.touches.length) return false;
    if (Date.now() - tapStart.at > 500) return false;
    return Math.abs(touch.clientX - tapStart.x) < 12 && Math.abs(touch.clientY - tapStart.y) < 12;
}

// Тап по тексту книги: панели то появляются, то уходят. Ждём триста
// миллисекунд — вдруг это первый тап из двойного, который меняет масштаб.
function scheduleChromeToggle(target) {
    clearTimeout(chromeTapTimer);
    // Тапом по ссылке в книге переходят, а не прячут панели. Выделенный текст
    // тап снимает — панели тут тоже ни при чём.
    if (target?.closest?.('.pdf-link-annotation')) return;
    if (selToolbar.visible) { hideSelToolbar(); return; }
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    chromeTapTimer = setTimeout(toggleChrome, 300);
}

// Ставит масштаб и возвращает под палец ту же точку книги.
function applyZoomKeepingPoint(target, point) {
    const before = zoomLevel.value;
    setZoom(target);
    nextTick(() => requestAnimationFrame(() => {
        const vp = viewportEl.value;
        if (vp) {
            const k = zoomLevel.value / before;
            vp.scrollLeft = point.contentX * k - point.midX;
            vp.scrollTop = point.contentY * k - point.midY;
        }
        setRenderPaused(false);
        requestPageRecalc();
    }));
}

// Двойное касание: туда-обратно между «страница по ширине» и двукратным
// увеличением. Один жест, чтобы всегда вернуться к целой странице.
let lastTapAt = 0;
let lastTapX = 0;
let lastTapY = 0;

function onDoubleTap(e) {
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch || e.touches.length) return;
    const now = Date.now();
    const near = Math.abs(touch.clientX - lastTapX) < 30 && Math.abs(touch.clientY - lastTapY) < 30;
    if (now - lastTapAt < 300 && near) {
        lastTapAt = 0;
        clearTimeout(chromeTapTimer);   // это двойной тап, панели не трогаем
        const vp = viewportEl.value;
        if (!vp) return;
        const rect = vp.getBoundingClientRect();
        const midX = touch.clientX - rect.left;
        const midY = touch.clientY - rect.top;
        const fit = fitZoomValue();
        const atFit = Math.abs(zoomLevel.value - fit) < fit * 0.05;
        setRenderPaused(true);
        applyZoomKeepingPoint(atFit ? Math.min(4, fit * 2) : fit, {
            midX, midY,
            contentX: vp.scrollLeft + midX,
            contentY: vp.scrollTop + midY,
        });
        return;
    }
    lastTapAt = now;
    lastTapX = touch.clientX;
    lastTapY = touch.clientY;
    scheduleChromeToggle(e.target);
}

// Safari на iOS зумит страницу собственными жестами и user-scalable не
// слушает — гасим их явно, иначе читалка уезжает вся целиком.
function preventBrowserZoom(e) {
    e.preventDefault();
}

// ── Zoom fit helpers ──────────────────────────────────────────────────────
async function getFirstPageDimensions() {
    if (!pdfDoc.value) return null;
    const page = await pdfDoc.value.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    return { width: vp.width, height: vp.height };
}

async function onFitWidth() {
    const dims = await getFirstPageDimensions();
    if (dims) fitWidth(viewportEl.value, dims.width);
}

async function onFitPage() {
    const dims = await getFirstPageDimensions();
    if (dims) fitPage(viewportEl.value, dims.width, dims.height);
}

// ── Selection toolbar state ───────────────────────────────────────────────
const selToolbar = reactive({ visible: false, x: 0, y: 0, existingNote: '' });
let pendingSelection = null;
let noteEditId = null;

function hideSelToolbar() {
    selToolbar.visible = false;
    pendingSelection = null;
    noteEditId = null;
}

function onViewportMouseUp() {
    setTimeout(updateSelectionToolbar, 10);
}

// На тач-экране mouseup не приходит вовсе — выделение там делают долгим
// нажатием и тянут за маркеры, а браузер сообщает об этом только событием
// selectionchange. Из-за этого «выделить и записать заметку» с телефона не
// работало в принципе.
let selectionTimer = null;

function onSelectionChange() {
    if (!pdfDoc.value) return;
    clearTimeout(selectionTimer);
    // Пока тянут за маркеры, событие сыплется десятками — ждём, когда утихнет.
    selectionTimer = setTimeout(updateSelectionToolbar, 350);
}

function updateSelectionToolbar() {
    {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { hideSelToolbar(); return; }
        const selectedText = sel.toString().trim();
        if (!selectedText) { hideSelToolbar(); return; }

        // Find which page wrapper this selection is on
        let node = sel.anchorNode;
        let wrapper = null;
        while (node) {
            if (node.classList?.contains('pdf-page-wrapper')) { wrapper = node; break; }
            node = node.parentElement;
        }
        if (!wrapper) { hideSelToolbar(); return; }

        const pageNum = parseInt(wrapper.dataset.page);
        const pageRect = wrapper.getBoundingClientRect();
        const range = sel.getRangeAt(0);
        const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
        if (!clientRects.length) { hideSelToolbar(); return; }

        const zoom = zoomLevel.value;
        const rects = clientRects.map(r => ({
            x: (r.left - pageRect.left) / zoom,
            y: (r.top  - pageRect.top)  / zoom,
            w: r.width  / zoom,
            h: r.height / zoom,
        }));

        pendingSelection = { selectedText, rects, pageNum };

        const topY = Math.min(...clientRects.map((r) => r.top));
        const midX = (clientRects[0].left + clientRects[clientRects.length - 1].right) / 2 - 115;

        // Панель не должна вылезать за экран: на телефоне ширины ровно столько,
        // чтобы промахнуться мимо края. И если сверху места нет — показываем
        // под выделением, а не под шапкой браузера.
        const TOOLBAR_W = 230;
        const TOOLBAR_H = 52;
        const bottomY = Math.max(...clientRects.map((r) => r.bottom));
        selToolbar.x = Math.max(8, Math.min(window.innerWidth - TOOLBAR_W - 8, midX));
        const wantY = topY > TOOLBAR_H + 8 ? topY : bottomY + 12;
        // Выделение могло уехать за экран (например, после смены масштаба) —
        // панель всё равно должна остаться там, где до неё дотянется палец.
        selToolbar.y = Math.max(8, Math.min(window.innerHeight - TOOLBAR_H - 8, wantY));
        selToolbar.existingNote = '';
        selToolbar.visible = true;
    }
}

function onHighlight(color) {
    if (!pendingSelection) return;
    addAnnotation(pendingSelection.pageNum, pendingSelection.rects, color, pendingSelection.selectedText);
    window.getSelection()?.removeAllRanges();
    hideSelToolbar();
}

function onCopySelection() {
    if (!pendingSelection) return;
    navigator.clipboard?.writeText(pendingSelection.selectedText).catch(() => {});
    showToast('Скопировано!');
    window.getSelection()?.removeAllRanges();
    hideSelToolbar();
}

function onSaveNote(note) {
    if (noteEditId) {
        updateNote(noteEditId, note);
        noteEditId = null;
    } else if (pendingSelection) {
        addAnnotation(pendingSelection.pageNum, pendingSelection.rects, 'yellow', pendingSelection.selectedText);
        const last = annotations.value[annotations.value.length - 1];
        if (last && note) updateNote(last.id, note);
    }
    window.getSelection()?.removeAllRanges();
    hideSelToolbar();
}

function openNoteEdit(id) {
    const ann = annotations.value.find(a => a.id === id);
    if (!ann) return;
    noteEditId = id;
    selToolbar.existingNote = ann.note;
    selToolbar.x = window.innerWidth / 2 - 110;
    selToolbar.y = window.innerHeight / 2;
    selToolbar.visible = true;
}

// ── Toast ─────────────────────────────────────────────────────────────────
const toastMsg = ref('');
let toastTimer = null;
function showToast(msg) {
    toastMsg.value = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastMsg.value = ''; }, 1800);
}

// ── Vocabulary ────────────────────────────────────────────────────────────
async function onSelectionAddToVocab() {
    if (!pendingSelection) return;
    const word = pendingSelection.selectedText?.trim() ?? '';
    hideSelToolbar();
    // Open translate modal on vocab tab with word pre-filled
    transModal.originalText = word;
    transModal.existingNote = '';
    transModal.pendingSelection = { ...pendingSelection };
    transModal.visible = true;
    // Kick off translation to pre-fill vocab translation field
    await translate(word, sourceLang.value, targetLang.value);
    // Signal modal to switch to vocab tab — done via a small reactive flag
    transModal.openVocabTab = true;
}

async function onModalAddToVocab(card) {
    try {
        await addVocabCard(card);
        showToast('📖 Добавлено в словарь!');
    } catch {
        showToast('Ошибка при добавлении в словарь');
    }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
function onKeydown(e) {
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); openSearch(); return; }
    if (e.key === 'Escape') {
        if (transModal.visible) { transModal.visible = false; stopSpeech(); return; }
        if (showTranslateSettings.value) { showTranslateSettings.value = false; return; }
        if (selToolbar.visible) { hideSelToolbar(); return; }
        if (searchOpen.value) { closeSearch(); return; }
    }
    if (!pdfDoc.value) return;
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleCurrentPage(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextPage(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prevPage(); }
}

// ── Global Ctrl+zoom intercept ────────────────────────────────────────────
function onWindowKeydown(e) {
    if (!pdfDoc.value) return;
    const vp = viewportEl.value;
    const screenY = vp ? vp.clientHeight / 2 : 0;
    if (e.ctrlKey && (e.key === '+' || e.key === '=' || e.key === 'Add')) {
        e.preventDefault();
        zoomTo(Math.min(4, +(zoomLevel.value + 0.25).toFixed(2)), screenY);
    } else if (e.ctrlKey && (e.key === '-' || e.key === 'Subtract')) {
        e.preventDefault();
        zoomTo(Math.max(0.25, +(zoomLevel.value - 0.25).toFixed(2)), screenY);
    } else if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        zoomTo(1, screenY);
    }
}

function onDocumentMouseDown(e) {
    if (!selToolbar.visible) return;
    if (e.target.closest?.('.pdf-selection-toolbar')) return;
    hideSelToolbar();
}

// Читалку открывают и ссылкой из библиотеки или плана: /pdfReader?file=<id>
async function openFromLibrary(id) {
    if (!id) return;
    libraryFileId.value = id;
    try {
        const details = await getPdfDetailsCached(id);
        if (details?.fileMissing) {
            // Карточка жива, файла нет: гнать пользователя в непонятную ошибку
            // pdf.js не за чем — сразу говорим, что делать.
            loadError.value = 'Файл этой книги пропал с диска. Откройте её в библиотеке '
                + 'и загрузите файл заново — прогресс и закладки сохранятся.';
            libraryFileId.value = '';
            return;
        }
        const token = localStorage.getItem('token');
        await loadFromUrl(getPdfDownloadUrl(id), {
            httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
            filename: details?.title || details?.filename || '',
        });
    } catch (e) {
        // Молча проглоченная ошибка выглядела как «книга просто не открывается»:
        // ни спиннера, ни текста, снова экран выбора файла.
        if (!loadError.value) {
            loadError.value = 'Не удалось открыть книгу: ' + (e?.message || e);
        }
        libraryFileId.value = '';
    }
}

// Файл из библиотеки открыт — помним id, чтобы позиция и закладки ушли на сервер.
function onFileSelected(file, id) {
    // Файл только что загрузили на сервер, а он уже открыт локально —
    // перечитывать его по сети незачем, просто запоминаем id.
    if (id && pdfDoc.value && fileName.value === file.name) {
        libraryFileId.value = id;
        router.replace({ path: '/pdfReader', query: { file: id } });
        return;
    }
    libraryFileId.value = id || '';
    if (id) router.replace({ path: '/pdfReader', query: { file: id } });
    loadFromFile(file);
}

function onCloseDoc() {
    flushReading();
    libraryFileId.value = '';
    if (route.query.file) router.replace({ path: '/pdfReader' });
    closeDocument();
}

onMounted(() => {
    window.addEventListener('keydown', onWindowKeydown);
    document.addEventListener('mousedown', onDocumentMouseDown);
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
        rootEl.value?.addEventListener(name, preventBrowserZoom, { passive: false });
    }
    document.addEventListener('selectionchange', onSelectionChange);
    if (libraryFileId.value) openFromLibrary(libraryFileId.value);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowKeydown);
    document.removeEventListener('mousedown', onDocumentMouseDown);
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
        rootEl.value?.removeEventListener(name, preventBrowserZoom);
    }
    document.removeEventListener('selectionchange', onSelectionChange);
    clearTimeout(selectionTimer);
    clearTimeout(chromeTapTimer);
    viewportEl.value?.removeEventListener('wheel', onViewportWheel);
    clearTimeout(toastTimer);
    clearTimeout(hoverDebounce);
    clearTimeout(hoverHideTimer);
    clearTimeout(scrollEndTimer);
    clearTimeout(renderResumeTimer);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    resetRenderQueue();
    stopSpeech();
    document.body.classList.remove('pdf-dark');
});

watch(viewportEl, (el, oldEl) => {
    oldEl?.removeEventListener('wheel', onViewportWheel);
    el?.addEventListener('wheel', onViewportWheel, { passive: false });

    oldEl?.removeEventListener('touchstart', onTouchStart);
    oldEl?.removeEventListener('touchmove', onTouchMove);
    oldEl?.removeEventListener('touchend', onTouchEnd);
    if (el) {
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        // Не passive: во время щипка прокрутку надо придержать.
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
    }

    pageObserver?.disconnect();
    pageObserver = null;
    activePages.value.clear();
    if (!el) {
        pageRefs.value = {};
        return;
    }
    pageObserver = new IntersectionObserver(onPageIntersect, {
        root: el,
        rootMargin: '100% 0px',
        threshold: 0,
    });
    // Ссылки на обёртки могли проставиться и до, и после появления области
    // прокрутки — подписываемся на то, что уже есть, остальное подхватит
    // setPageRef.
    nextTick(() => {
        for (const wrapper of Object.values(pageRefs.value)) {
            if (wrapper) pageObserver?.observe(wrapper);
        }
    });
});

watch(pdfDoc, (doc) => {
    if (doc) {
        nextTick(() => rootEl.value?.focus());
        resetThumbnails();
    }
});

// Sync dark mode class to body so Teleport modals inherit CSS variables
watch(darkMode, (v) => {
    document.body.classList.toggle('pdf-dark', v);
}, { immediate: true });
</script>
