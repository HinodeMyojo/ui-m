import { ref, computed, watch } from 'vue';

export function usePdfBookmarks(fileName, currentPage) {
    const bookmarks = ref([]);

    function storageKey() {
        return `pdf-bookmarks-${fileName.value}`;
    }

    function load() {
        if (!fileName.value) { bookmarks.value = []; return; }
        try {
            const raw = localStorage.getItem(storageKey());
            bookmarks.value = raw ? JSON.parse(raw) : [];
        } catch { bookmarks.value = []; }
    }

    function save() {
        if (!fileName.value) return;
        try {
            localStorage.setItem(storageKey(), JSON.stringify(bookmarks.value));
        } catch { /* quota exceeded */ }
    }

    watch(fileName, load, { immediate: true });

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
