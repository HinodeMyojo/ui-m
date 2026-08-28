import { ref, computed } from 'vue';

export function usePdfNavigation(pageCount) {
    const currentPage = ref(1);
    const jumpInput = ref('');
    const pageRefs = ref({});  // pageNum -> el

    const canPrev = computed(() => currentPage.value > 1);
    const canNext = computed(() => currentPage.value < pageCount.value);

    function goToPage(n) {
        const num = Math.max(1, Math.min(pageCount.value, +n));
        if (isNaN(num)) return;
        currentPage.value = num;
        const el = pageRefs.value[num];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function prevPage() { if (canPrev.value) goToPage(currentPage.value - 1); }
    function nextPage() { if (canNext.value) goToPage(currentPage.value + 1); }

    function commitJump() {
        if (jumpInput.value) goToPage(parseInt(jumpInput.value, 10));
        jumpInput.value = '';
    }

    // only — номера страниц, которые сейчас живут вокруг экрана. Без него на
    // каждое событие прокрутки пришлось бы опрашивать offsetTop у всех трёхсот
    // обёрток, а это принудительный пересчёт разметки по три сотни раз за кадр.
    function onViewportScroll(viewportEl, only = null) {
        if (!viewportEl) return;
        const vpTop = viewportEl.scrollTop;
        const vpMid = vpTop + viewportEl.clientHeight / 2;
        let best = 1;
        let bestDist = Infinity;
        const pairs = only && only.size
            ? Array.from(only, (num) => [num, pageRefs.value[num]])
            : Object.entries(pageRefs.value);
        for (const [num, el] of pairs) {
            if (!el) continue;
            const elTop = el.offsetTop;
            const elMid = elTop + el.offsetHeight / 2;
            const dist = Math.abs(elMid - vpMid);
            if (dist < bestDist) { bestDist = dist; best = +num; }
        }
        currentPage.value = best;
    }

    return { currentPage, jumpInput, pageRefs, canPrev, canNext, goToPage, prevPage, nextPage, commitJump, onViewportScroll };
}
