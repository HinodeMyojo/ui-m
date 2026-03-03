import { ref, computed } from 'vue';

export function useReadingProgress(fileContent) {
    const readProgress = ref(0);

    const readingTime = computed(() => {
        if (!fileContent.value) return 0;
        const text = fileContent.value;
        const codeBlockMatches = [...text.matchAll(/```[\s\S]*?```/g)];
        const codeLines = codeBlockMatches.reduce((sum, m) => sum + m[0].split('\n').length - 2, 0);
        const codeMinutes = Math.ceil(codeLines / 10);
        const plain = text
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]+`/g, '')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/[*_~|\\[\]()>#\-+]/g, ' ')
            .replace(/https?:\/\/\S+/g, '');
        const words = plain.trim().split(/\s+/).filter(w => w.length > 1).length;
        return Math.ceil(words / 200) + codeMinutes;
    });

    function onContentScrollProgress(e) {
        const el = e.target;
        const scrollable = el.scrollHeight - el.clientHeight;
        readProgress.value = scrollable > 0 ? el.scrollTop / scrollable : 0;
    }

    return { readProgress, readingTime, onContentScrollProgress };
}
