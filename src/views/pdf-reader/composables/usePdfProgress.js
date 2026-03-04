import { computed } from 'vue';

export function usePdfProgress(pageCount, currentPage) {
    const readProgress = computed(() =>
        pageCount.value > 1 ? (currentPage.value - 1) / (pageCount.value - 1) : 0
    );

    const estimatedReadingTime = computed(() => {
        const mins = Math.ceil(pageCount.value * 1.5);
        if (mins < 60) return `~${mins} мин`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `~${h} ч ${m} мин`;
    });

    return { readProgress, estimatedReadingTime };
}
