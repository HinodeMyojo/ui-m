import { ref, computed, nextTick, watch } from 'vue';

function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < Math.min(str.length, 200); i++) h = (h * 33) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
}

export function useNotes(fileContent) {
    const userNotes = ref([]);
    const noteTooltipVisible = ref(false);
    const noteTooltipPos = ref({ x: 0, y: 0 });
    const pendingSelection = ref(null);

    const noteTooltipStyle = computed(() => ({
        left: Math.min(noteTooltipPos.value.x, window.innerWidth - 220) + 'px',
        top: Math.max(noteTooltipPos.value.y - 52, 8) + 'px',
    }));

    const docNotesKey = computed(() => `md-notes-${simpleHash(fileContent.value)}`);

    function loadNotes() {
        try { return JSON.parse(localStorage.getItem(docNotesKey.value) || '[]'); } catch { return []; }
    }

    function saveNotesStorage() {
        localStorage.setItem(docNotesKey.value, JSON.stringify(userNotes.value));
    }

    function applyNoteHighlights() {
        document.querySelectorAll('.fullscreen-content .user-note-hl').forEach(m => m.replaceWith(...m.childNodes));
        document.querySelector('.fullscreen-content')?.normalize();
        for (const note of userNotes.value) {
            const content = document.querySelector('.fullscreen-content');
            if (!content) break;
            const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (node.parentElement?.closest('.search-hl, .user-note-hl, .code-block-toolbar')) continue;
                const idx = node.textContent.indexOf(note.searchText);
                if (idx === -1) continue;
                try {
                    const range = document.createRange();
                    range.setStart(node, idx);
                    range.setEnd(node, idx + note.searchText.length);
                    const mark = document.createElement('mark');
                    mark.className = 'user-note-hl';
                    mark.dataset.noteId = note.id;
                    range.surroundContents(mark);
                } catch {}
                break;
            }
        }
    }

    function onContentMouseUp(e) {
        if (e.target.closest('.code-block-toolbar, .citation-ref, .code-tree-btn')) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.toString().trim().length < 3) {
            noteTooltipVisible.value = false;
            return;
        }
        const text = sel.toString().trim();
        pendingSelection.value = { text, searchText: text.slice(0, 80) };
        noteTooltipPos.value = { x: e.clientX, y: e.clientY };
        noteTooltipVisible.value = true;
    }

    function saveNote() {
        if (!pendingSelection.value) return;
        const note = { id: Date.now(), text: pendingSelection.value.text, searchText: pendingSelection.value.searchText };
        userNotes.value.push(note);
        saveNotesStorage();
        nextTick(applyNoteHighlights);
        noteTooltipVisible.value = false;
        pendingSelection.value = null;
        window.getSelection()?.removeAllRanges();
    }

    function deleteNote(id) {
        userNotes.value = userNotes.value.filter(n => n.id !== id);
        saveNotesStorage();
        nextTick(applyNoteHighlights);
    }

    function scrollToNote(note) {
        document.querySelector(`.fullscreen-content .user-note-hl[data-note-id="${note.id}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    watch(docNotesKey, () => {
        userNotes.value = loadNotes();
        nextTick(applyNoteHighlights);
    }, { immediate: true });

    return { userNotes, noteTooltipVisible, noteTooltipPos, noteTooltipStyle, pendingSelection, loadNotes, saveNote, deleteNote, scrollToNote, applyNoteHighlights, onContentMouseUp, docNotesKey };
}
