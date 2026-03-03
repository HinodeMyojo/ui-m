import { ref, nextTick } from 'vue';

export function useSearch() {
    const searchOpen = ref(false);
    const searchQuery = ref('');
    const searchMatches = ref([]);
    const searchIdx = ref(0);
    const searchInputEl = ref(null);

    function openSearch() {
        searchOpen.value = true;
        nextTick(() => searchInputEl.value?.focus());
    }

    function clearSearchMarks() {
        document.querySelectorAll('.fullscreen-content .search-hl').forEach(m => m.replaceWith(...m.childNodes));
        document.querySelector('.fullscreen-content')?.normalize();
        searchMatches.value = [];
    }

    function runSearch() {
        clearSearchMarks();
        const query = searchQuery.value.trim();
        if (!query) return;
        const content = document.querySelector('.fullscreen-content');
        if (!content) return;

        const targets = [];
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        const lower = query.toLowerCase();
        let node;
        while ((node = walker.nextNode())) {
            if (node.parentElement?.closest('.search-hl, .code-block-toolbar')) continue;
            const text = node.textContent.toLowerCase();
            let idx = 0;
            while ((idx = text.indexOf(lower, idx)) !== -1) {
                targets.push({ node, start: idx, end: idx + query.length });
                idx += query.length;
            }
        }

        const marks = [];
        for (let i = targets.length - 1; i >= 0; i--) {
            const { node: n, start, end } = targets[i];
            try {
                const range = document.createRange();
                range.setStart(n, start);
                range.setEnd(n, end);
                const mark = document.createElement('mark');
                mark.className = 'search-hl';
                range.surroundContents(mark);
                marks.unshift(mark);
            } catch {}
        }
        searchMatches.value = marks;
        searchIdx.value = 0;
        if (marks.length) scrollToSearchMatch(0);
    }

    function scrollToSearchMatch(idx) {
        searchMatches.value.forEach((m, i) => m.classList.toggle('search-hl-active', i === idx));
        searchMatches.value[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function nextMatch() {
        if (!searchMatches.value.length) return;
        searchIdx.value = (searchIdx.value + 1) % searchMatches.value.length;
        scrollToSearchMatch(searchIdx.value);
    }

    function prevMatch() {
        if (!searchMatches.value.length) return;
        searchIdx.value = (searchIdx.value - 1 + searchMatches.value.length) % searchMatches.value.length;
        scrollToSearchMatch(searchIdx.value);
    }

    function closeSearch() {
        clearSearchMarks();
        searchOpen.value = false;
        searchQuery.value = '';
    }

    return { searchOpen, searchQuery, searchMatches, searchIdx, searchInputEl, openSearch, closeSearch, runSearch, nextMatch, prevMatch, clearSearchMarks };
}
