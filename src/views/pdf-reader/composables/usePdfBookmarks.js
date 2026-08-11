import { ref, computed, watch } from 'vue';
import { getPdfDetailsCached, setPdfBookmarks } from '@/api/pdfFiles.js';

// Закладки. У книги из библиотеки они живут на сервере (docs/pdf-library.md),
// у файла, открытого с диска, — в localStorage, как и раньше.

const SAVE_DEBOUNCE_MS = 800;

export function usePdfBookmarks(fileName, currentPage, fileId) {
    const bookmarks = ref([]);
    let saveTimer = null;

    function storageKey() {
        return `pdf-bookmarks-${fileName.value}`;
    }

    async function load() {
        if (fileId?.value) {
            try {
                const details = await getPdfDetailsCached(fileId.value);
                bookmarks.value = details?.bookmarks ?? [];
                return;
            } catch {
                bookmarks.value = [];
                return;
            }
        }
        if (!fileName.value) { bookmarks.value = []; return; }
        try {
            const raw = localStorage.getItem(storageKey());
            bookmarks.value = raw ? JSON.parse(raw) : [];
        } catch { bookmarks.value = []; }
    }

    function save() {
        if (fileId?.value) {
            // Сервер принимает массив целиком, поэтому просто откладываем отправку.
            clearTimeout(saveTimer);
            const id = fileId.value;
            const payload = bookmarks.value.map(b => ({
                id: String(b.id), pageNum: b.pageNum, label: b.label ?? '',
            }));
            saveTimer = setTimeout(() => { setPdfBookmarks(id, payload).catch(() => {}); }, SAVE_DEBOUNCE_MS);
            return;
        }
        if (!fileName.value) return;
        try {
            localStorage.setItem(storageKey(), JSON.stringify(bookmarks.value));
        } catch { /* quota exceeded */ }
    }

    watch([fileName, () => fileId?.value], load, { immediate: true });

    const isCurrentPageBookmarked = computed(
        () => bookmarks.value.some(b => b.pageNum === currentPage.value)
    );

    function addBookmark(pageNum, label) {
        if (bookmarks.value.some(b => b.pageNum === pageNum)) return;
        bookmarks.value.push({
            id: (Date.now().toString(36) + Math.random().toString(36).slice(2)),
            pageNum,
            label: label ?? `Страница ${pageNum}`,
            createdAt: Date.now(),
        });
        bookmarks.value.sort((a, b) => a.pageNum - b.pageNum);
        save();
    }

    function removeBookmark(id) {
        bookmarks.value = bookmarks.value.filter(b => b.id !== id);
        save();
    }

    function updateLabel(id, label) {
        const bm = bookmarks.value.find(b => b.id === id);
        if (bm) { bm.label = label; save(); }
    }

    function toggleCurrentPage() {
        const existing = bookmarks.value.find(b => b.pageNum === currentPage.value);
        if (existing) removeBookmark(existing.id);
        else addBookmark(currentPage.value);
    }

    return {
        bookmarks,
        isCurrentPageBookmarked,
        toggleCurrentPage,
        addBookmark,
        removeBookmark,
        updateLabel,
    };
}
