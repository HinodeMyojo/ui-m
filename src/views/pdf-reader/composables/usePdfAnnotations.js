import { ref, watch } from 'vue';

export function usePdfAnnotations(fileName) {
    const annotations = ref([]);

    function storageKey() {
        return `pdf-annotations-${fileName.value}`;
    }

    function load() {
        if (!fileName.value) { annotations.value = []; return; }
        try {
            const raw = localStorage.getItem(storageKey());
            annotations.value = raw ? JSON.parse(raw) : [];
        } catch { annotations.value = []; }
    }

    function save() {
        if (!fileName.value) return;
        try {
            localStorage.setItem(storageKey(), JSON.stringify(annotations.value));
        } catch { /* quota exceeded — ignore */ }
    }

    watch(fileName, load, { immediate: true });

    function annotationsForPage(pageNum) {
        return annotations.value.filter(a => a.pageNum === pageNum);
    }

    function addAnnotation(pageNum, rects, color, selectedText) {
        annotations.value.push({
            id: (Date.now().toString(36) + Math.random().toString(36).slice(2)),
            pageNum,
            rects,
            color,
            selectedText,
            note: '',
            createdAt: Date.now(),
        });
        save();
    }

    function updateNote(id, note) {
        const ann = annotations.value.find(a => a.id === id);
        if (ann) { ann.note = note; save(); }
    }

    function removeAnnotation(id) {
        annotations.value = annotations.value.filter(a => a.id !== id);
        save();
    }

    function exportAnnotations() {
        const blob = new Blob([JSON.stringify(annotations.value, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName.value}-annotations.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function importAnnotations(file) {
        try {
            const text = await file.text();
            const imported = JSON.parse(text);
            if (!Array.isArray(imported)) return;
            const existingIds = new Set(annotations.value.map(a => a.id));
            for (const ann of imported) {
                if (!existingIds.has(ann.id)) {
                    annotations.value.push(ann);
                    existingIds.add(ann.id);
                }
            }
            save();
        } catch { /* invalid file */ }
    }

    return {
        annotations,
        annotationsForPage,
        addAnnotation,
        updateNote,
        removeAnnotation,
        exportAnnotations,
        importAnnotations,
    };
}
