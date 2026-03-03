import { ref, watch, toRaw } from 'vue';

async function resolveDestToPage(pdfDoc, dest) {
    if (!dest) return null;
    try {
        const resolved = typeof dest === 'string'
            ? await pdfDoc.getDestination(dest)
            : dest;
        if (!resolved || !resolved[0]) return null;
        const idx = await pdfDoc.getPageIndex(resolved[0]);
        return idx + 1;
    } catch {
        return null;
    }
}

async function buildItems(pdfDoc, outline, level = 0) {
    const items = [];
    for (const item of outline) {
        const pageNum = await resolveDestToPage(pdfDoc, item.dest);
        items.push({ title: item.title, pageNum, level, bold: item.bold, italic: item.italic });
        if (item.items && item.items.length) {
            const children = await buildItems(pdfDoc, item.items, level + 1);
            items.push(...children);
        }
    }
    return items;
}

export function usePdfToc(pdfDoc) {
    const tocItems = ref([]);
    const hasToc = ref(false);

    watch(pdfDoc, async (rawDoc) => {
        const doc = toRaw(rawDoc);
        if (!doc) { tocItems.value = []; hasToc.value = false; return; }
        try {
            const outline = await doc.getOutline();
            if (!outline || outline.length === 0) { hasToc.value = false; tocItems.value = []; return; }
            tocItems.value = await buildItems(doc, outline);
            hasToc.value = tocItems.value.length > 0;
        } catch {
            hasToc.value = false;
            tocItems.value = [];
        }
    });

    return { tocItems, hasToc };
}
