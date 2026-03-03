import { ref, computed } from 'vue';

export function useCitation(fileContent) {
    const activeCitation = ref(null);
    const citationPos = ref({ x: 0, y: 0 });

    const citationMap = computed(() => {
        const map = {};
        if (!fileContent.value) return map;
        let inSources = false;
        for (const line of fileContent.value.split('\n')) {
            if (/^##\s+(Источники|References|Sources|Bibliography)/i.test(line)) { inSources = true; continue; }
            if (inSources && /^##/.test(line)) inSources = false;
            if (inSources) {
                const m = line.match(/^(\d+)\.\s+(.+)/);
                if (m) map[m[1]] = m[2];
            }
        }
        return map;
    });

    const popupStyle = computed(() => ({
        left: Math.min(citationPos.value.x, window.innerWidth - 360) + 'px',
        top: citationPos.value.y + 16 + 'px',
    }));

    function handleCitationClick(e) {
        const ref = e.target.closest('.citation-ref');
        if (!ref) { activeCitation.value = null; return; }
        const num = ref.dataset.ref;
        if (citationMap.value[num]) {
            activeCitation.value = { num, text: citationMap.value[num] };
            citationPos.value = { x: e.clientX, y: e.clientY };
        }
    }

    return { activeCitation, citationPos, citationMap, popupStyle, handleCitationClick };
}
