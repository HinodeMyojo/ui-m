<template>
    <div class="pdf-reader" :class="{ dark: darkMode }" tabindex="0" @keydown="onKeydown" ref="rootEl">

        <!-- Drop zone (before PDF loaded) -->
        <template v-if="!pdfDoc">
            <div v-if="isLoading" class="pdf-loading-overlay">
                <span class="pdf-spin"></span>
                Загружаем {{ fileName }}…
            </div>
            <PdfDropZone v-else :darkMode="darkMode" :isLoading="isLoading" :loadError="loadError"
                @file-selected="loadFromFile" />
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
                @toggle-thumbnails="toggleThumbnails" @toggle-search="openSearch" @close-doc="closeDocument"
                @toggle-bookmark="toggleCurrentPage"
                @toggle-hover-translate="hoverMode = !hoverMode"
                @open-translate-settings="showTranslateSettings = true" />

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
                    <PdfPageCanvas v-for="n in pageCount" :key="n" :pdfDoc="pdfDoc" :pageNum="n"
                        :zoomLevel="zoomLevel" :nightMode="nightMode" :searchQuery="searchQuery"
                        :searchPageMatches="searchMatches.filter(m => m.pageNum === n).length"
                        :annotations="annotationsForPage(n)"
                        :goToPage="goToPage"
                        @remove-annotation="removeAnnotation"
                        @edit-annotation-note="openNoteEdit"
                        :ref="el => { if (el) pageRefs[n] = el?.$el ?? el; }" />
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
                @close="transModal.visible = false"
                @translate="onModalTranslate"
                @analyze="w => analyzeText(w)"
                @speak-original="speakText(transModal.originalText, sourceLang)"
                @speak-translation="speakText(lastTranslation?.translated ?? '', lastTranslation?.detectedLang ?? targetLang)"
                @save-note="onTranslationNote"
                @highlight="onTranslationHighlight"
                @change-langs="onChangeLangs" />

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
                {{ Math.round(readProgress * 100) }}% · {{ estimatedReadingTime }}
            </div>
        </template>

    </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { usePdfLoader }         from './pdf-reader/composables/usePdfLoader.js';
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
const { pdfDoc, pageCount, isLoading, loadError, fileName, loadFromFile, closeDocument } = usePdfLoader();
const { darkMode, nightMode, nightBrightness, isFullscreen, showSidebar, showThumbnails, toggleDark, toggleNight, setNightBrightness, toggleFullscreen, toggleSidebar, toggleThumbnails } = usePdfTheme();
const { zoomLevel, setZoom, fitWidth, fitPage } = usePdfZoom();
const { currentPage, pageRefs, canPrev, canNext, goToPage, prevPage, nextPage, onViewportScroll } = usePdfNavigation(pageCount);
const { readProgress, estimatedReadingTime } = usePdfProgress(pageCount, currentPage);
const { tocItems } = usePdfToc(pdfDoc);
const { searchOpen, searchQuery, searchMatches, searchIdx, isSearching, openSearch, closeSearch, runSearch, nextMatch, prevMatch } = usePdfSearch(pdfDoc, pageCount, goToPage);
const { thumbRefs, renderThumbnail, resetThumbnails } = usePdfThumbnails();
const { annotations, annotationsForPage, addAnnotation, updateNote, removeAnnotation, exportAnnotations, importAnnotations } = usePdfAnnotations(fileName);
const { bookmarks, isCurrentPageBookmarked, toggleCurrentPage, removeBookmark, updateLabel } = usePdfBookmarks(fileName, currentPage);
const { apiKey, hoverMode, sourceLang, targetLang, isTranslating, translationError, lastTranslation,
        translate, checkApiKey, speakText, stopSpeech,
        analyzeText, analyzeResult, isAnalyzing, analyzeError,
        analyzeProvider, analyzeKeys,
        LANGUAGES } = usePdfTranslation(fileName);

const viewportEl = ref(null);
const rootEl = ref(null);

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
function onScroll(e) {
    if (e.ctrlKey) return;
    onViewportScroll(viewportEl.value);
    onViewportScrollForHover();
}

// ── Zoom with stable scroll position ─────────────────────────────────────
function zoomTo(newZoom, anchorScreenY) {
    const vp = viewportEl.value;
    if (!vp) { setZoom(newZoom); return; }

    const absY = vp.scrollTop + anchorScreenY;
    let anchor = null;
    for (const el of Object.values(pageRefs.value ?? pageRefs)) {
        if (!el) continue;
        const top = el.offsetTop;
        const h   = el.offsetHeight;
        if (absY >= top && absY < top + h) {
            anchor = { el, ratio: (absY - top) / h, screenY: anchorScreenY };
            break;
        }
    }

    setZoom(newZoom);

    nextTick(() => requestAnimationFrame(() => {
        if (!anchor) return;
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
    setTimeout(() => {
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

        const topY = Math.min(...clientRects.map(r => r.top));
        const midX = (clientRects[0].left + clientRects[clientRects.length - 1].right) / 2 - 110;

        selToolbar.x = midX;
        selToolbar.y = topY;
        selToolbar.existingNote = '';
        selToolbar.visible = true;
    }, 10);
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

onMounted(() => {
    window.addEventListener('keydown', onWindowKeydown);
    document.addEventListener('mousedown', onDocumentMouseDown);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowKeydown);
    document.removeEventListener('mousedown', onDocumentMouseDown);
    viewportEl.value?.removeEventListener('wheel', onViewportWheel);
    clearTimeout(toastTimer);
    clearTimeout(hoverDebounce);
    clearTimeout(hoverHideTimer);
    clearTimeout(scrollEndTimer);
    stopSpeech();
    document.body.classList.remove('pdf-dark');
});

watch(viewportEl, (el, oldEl) => {
    oldEl?.removeEventListener('wheel', onViewportWheel);
    el?.addEventListener('wheel', onViewportWheel, { passive: false });
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
