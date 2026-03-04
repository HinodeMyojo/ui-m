import { ref, watch, toRaw } from 'vue';

export function usePdfSearch(pdfDoc, pageCount, goToPage) {
    const searchOpen = ref(false);
    const searchQuery = ref('');
    const searchMatches = ref([]);  // [{ pageNum, text, idx }]
    const searchIdx = ref(-1);
    const searchInputEl = ref(null);
    const isSearching = ref(false);

    function openSearch() {
        searchOpen.value = true;
        setTimeout(() => searchInputEl.value?.focus(), 50);
    }

    function closeSearch() {
        searchOpen.value = false;
        searchQuery.value = '';
        searchMatches.value = [];
        searchIdx.value = -1;
    }

    async function runSearch() {
        const q = searchQuery.value.trim().toLowerCase();
        searchMatches.value = [];
        searchIdx.value = -1;
        if (!q || !pdfDoc.value) return;
        isSearching.value = true;
        const doc = toRaw(pdfDoc.value);
        const results = [];
        for (let i = 1; i <= pageCount.value; i++) {
            try {
                const page = await doc.getPage(i);
                const content = await page.getTextContent();
                const text = content.items.map(it => it.str).join(' ').toLowerCase();
                let pos = 0;
                while ((pos = text.indexOf(q, pos)) !== -1) {
                    results.push({ pageNum: i, pos });
                    pos += q.length;
                }
            } catch { /* skip */ }
        }
        searchMatches.value = results;
        if (results.length > 0) { searchIdx.value = 0; goToPage(results[0].pageNum); }
        isSearching.value = false;
    }

    function nextMatch() {
        if (!searchMatches.value.length) return;
        searchIdx.value = (searchIdx.value + 1) % searchMatches.value.length;
        goToPage(searchMatches.value[searchIdx.value].pageNum);
    }

    function prevMatch() {
        if (!searchMatches.value.length) return;
        searchIdx.value = (searchIdx.value - 1 + searchMatches.value.length) % searchMatches.value.length;
        goToPage(searchMatches.value[searchIdx.value].pageNum);
    }

    watch(pdfDoc, () => { searchMatches.value = []; searchIdx.value = -1; });

    return { searchOpen, searchQuery, searchMatches, searchIdx, searchInputEl, isSearching, openSearch, closeSearch, runSearch, nextMatch, prevMatch };
}
