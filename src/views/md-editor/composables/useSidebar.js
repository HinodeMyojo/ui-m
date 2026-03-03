import { ref, computed } from 'vue';

const HIGHLIGHT_PATTERNS = /важно|note|warning|todo|внимание|запомни|ключевой|обязательно/i;

export function useSidebar(fileContent) {
    const showSidebar = ref(false);
    const showNotesPanel = ref(false);
    const sidebarWidth = ref(280);

    const tocItems = computed(() => {
        if (!fileContent.value) return [];
        const items = [];
        for (const line of fileContent.value.split('\n')) {
            const m = line.match(/^(#{1,4})\s+(.+)/);
            if (m) {
                const text = m[2].trim();
                const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                items.push({ level: m[1].length, text, id });
            }
        }
        return items;
    });

    const highlights = computed(() => {
        if (!fileContent.value) return [];
        const items = [];
        for (const line of fileContent.value.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('> ')) {
                const text = trimmed.slice(2).replace(/\*\*/g, '').trim();
                if (text) items.push({ type: 'quote', badge: '❝', text, searchText: text.slice(0, 60) });
            } else {
                for (const m of [...trimmed.matchAll(/\*\*([^*]+)\*\*/g)]) {
                    if (m[1].length > 3) items.push({ type: 'bold', badge: '★', text: m[1], searchText: m[1].slice(0, 60) });
                }
                if (HIGHLIGHT_PATTERNS.test(trimmed) && !trimmed.startsWith('#')) {
                    const clean = trimmed.replace(/\*\*/g, '').replace(/^[-*]\s/, '').slice(0, 80);
                    if (clean) items.push({ type: 'pattern', badge: '⚠', text: clean, searchText: clean.slice(0, 60) });
                }
            }
        }
        return items.slice(0, 30);
    });

    function startSidebarResize(e) {
        e.preventDefault();
        const startX = e.clientX;
        const startW = sidebarWidth.value;
        function onMove(ev) { sidebarWidth.value = Math.max(160, Math.min(600, startW + startX - ev.clientX)); }
        function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    function scrollToHeading(id) {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function scrollToHighlight(searchText) {
        const content = document.querySelector('.fullscreen-content');
        if (!content) return;
        const needle = searchText.slice(0, 20);
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.textContent.includes(needle)) {
                const el = node.parentElement;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.remove('highlight-flash');
                void el.offsetWidth;
                el.classList.add('highlight-flash');
                setTimeout(() => el.classList.remove('highlight-flash'), 1300);
                return;
            }
        }
    }

    function toggleNotesPanel() {
        showNotesPanel.value = !showNotesPanel.value;
        if (showNotesPanel.value) showSidebar.value = true;
    }

    return { showSidebar, showNotesPanel, sidebarWidth, tocItems, highlights, startSidebarResize, scrollToHeading, scrollToHighlight, toggleNotesPanel };
}
