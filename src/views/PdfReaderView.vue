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
                @prev-page="prevPage" @next-page="nextPage" @jump-to-page="goToPage"
                @zoom-in="zoomTo(Math.min(4, +(zoomLevel + 0.25).toFixed(2)), viewportEl?.clientHeight / 2 ?? 0)"
                @zoom-out="zoomTo(Math.max(0.25, +(zoomLevel - 0.25).toFixed(2)), viewportEl?.clientHeight / 2 ?? 0)"
                @fit-width="onFitWidth" @fit-page="onFitPage" @toggle-dark="toggleDark" @toggle-night="toggleNight"
                @night-brightness-down="setNightBrightness(nightBrightness - 10)"
                @night-brightness-up="setNightBrightness(nightBrightness + 10)"
                @toggle-fullscreen="toggleFullscreen" @toggle-sidebar="toggleSidebar"
                @toggle-thumbnails="toggleThumbnails" @toggle-search="openSearch" @close-doc="closeDocument" />

            <PdfSearchBar v-if="searchOpen" :searchQuery="searchQuery" :matchCount="searchMatches.length"
                :currentMatchIdx="searchIdx" :isSearching="isSearching"
                @update:searchQuery="q => { searchQuery = q; runSearch(); }" @next="nextMatch" @prev="prevMatch"
                @close="closeSearch" />

            <div class="pdf-reader-body">
                <PdfSidebar v-if="showSidebar" :tocItems="tocItems" :currentPage="currentPage"
                    @go-to-page="goToPage" @close="toggleSidebar" />

                <div class="pdf-viewport" :class="{ 'pdf-night-viewport': nightMode }"
                    :style="nightMode ? { filter: `invert(1) hue-rotate(180deg) brightness(${nightBrightness / 100})` } : {}"
                    ref="viewportEl" @scroll="onScroll">
                    <PdfPageCanvas v-for="n in pageCount" :key="n" :pdfDoc="pdfDoc" :pageNum="n"
                        :zoomLevel="zoomLevel" :nightMode="nightMode" :searchQuery="searchQuery"
                        :searchPageMatches="searchMatches.filter(m => m.pageNum === n).length"
                        :ref="el => { if (el) pageRefs[n] = el?.$el ?? el; }" />
                </div>
            </div>

            <PdfThumbnailStrip v-if="showThumbnails" :pdfDoc="pdfDoc" :pageCount="pageCount"
                :currentPage="currentPage" :thumbRefs="thumbRefs" @go-to-page="goToPage"
                @render-thumb="n => renderThumbnail(pdfDoc.value, n)" />

            <!-- Reading info badge -->
            <div class="pdf-reading-info">
                {{ Math.round(readProgress * 100) }}% · {{ estimatedReadingTime }}
            </div>
        </template>

    </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { usePdfLoader }       from './pdf-reader/composables/usePdfLoader.js';
import { usePdfTheme }        from './pdf-reader/composables/usePdfTheme.js';
import { usePdfZoom }         from './pdf-reader/composables/usePdfZoom.js';
import { usePdfNavigation }   from './pdf-reader/composables/usePdfNavigation.js';
import { usePdfProgress }     from './pdf-reader/composables/usePdfProgress.js';
import { usePdfToc }          from './pdf-reader/composables/usePdfToc.js';
import { usePdfSearch }       from './pdf-reader/composables/usePdfSearch.js';
import { usePdfThumbnails }   from './pdf-reader/composables/usePdfThumbnails.js';
import PdfDropZone            from './pdf-reader/components/PdfDropZone.vue';
import PdfToolbar             from './pdf-reader/components/PdfToolbar.vue';
import PdfPageCanvas          from './pdf-reader/components/PdfPageCanvas.vue';
import PdfSidebar             from './pdf-reader/components/PdfSidebar.vue';
import PdfSearchBar           from './pdf-reader/components/PdfSearchBar.vue';
import PdfThumbnailStrip      from './pdf-reader/components/PdfThumbnailStrip.vue';
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

const viewportEl = ref(null);
const rootEl = ref(null);

// ── Scroll coordinator ────────────────────────────────────────────────────
function onScroll(e) {
    if (e.ctrlKey) return; // handled by wheel handler below
    onViewportScroll(viewportEl.value);
}

// ── Zoom with stable scroll position ─────────────────────────────────────
// The page wrappers get their size from placeholderStyle (naturalH * zoomLevel).
// We find which page is at the anchor point, store its offsetRatio within that page,
// then after Vue updates the DOM sizes we restore scrollTop so that same point
// stays under the same screen position.
// rAF is used because offsetTop is recalculated by the browser during layout,
// which happens synchronously when we read it — but we need Vue to commit its
// reactive size changes first (nextTick), then read the new offsets (rAF).

function zoomTo(newZoom, anchorScreenY) {
    const vp = viewportEl.value;
    if (!vp) { setZoom(newZoom); return; }

    // 1. Find anchor: which page + pixel offset within that page
    const absY = vp.scrollTop + anchorScreenY;
    let anchor = null;
    for (const el of Object.values(pageRefs.value ?? pageRefs)) {
        if (!el) continue;
        const top = el.offsetTop;
        const h   = el.offsetHeight;
        if (absY >= top && absY < top + h) {
            // ratio within this page (0..1)
            anchor = { el, ratio: (absY - top) / h, screenY: anchorScreenY };
            break;
        }
    }

    // 2. Change zoom — Vue will update placeholderStyle on next tick
    setZoom(newZoom);

    // 3. After Vue DOM update → rAF → browser has recalculated layout
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

// ── Keyboard shortcuts ────────────────────────────────────────────────────
function onKeydown(e) {
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); openSearch(); return; }
    if (e.key === 'Escape') { if (searchOpen.value) { closeSearch(); return; } }
    if (!pdfDoc.value) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextPage(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prevPage(); }
}

// ── Global Ctrl+zoom intercept (must be on window to beat browser) ─────────
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

onMounted(() => window.addEventListener('keydown', onWindowKeydown));
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowKeydown);
    viewportEl.value?.removeEventListener('wheel', onViewportWheel);
});

// Attach non-passive wheel listener once viewport is rendered
watch(viewportEl, (el, oldEl) => {
    oldEl?.removeEventListener('wheel', onViewportWheel);
    el?.addEventListener('wheel', onViewportWheel, { passive: false });
});

// ── After PDF loads — focus root, reset nav ───────────────────────────────
watch(pdfDoc, (doc) => {
    if (doc) {
        nextTick(() => rootEl.value?.focus());
        resetThumbnails();
    }
});
</script>
