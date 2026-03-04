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

// Returns true if the title looks like a raw internal destination, not a human-readable heading
function isRawDestTitle(title) {
    if (!title) return true;
    // Google Docs exports: "_heading=h.xxxxx", "_bookmark=id.xxx", "_cmnt=xxx", etc.
    if (/^_[a-z]+=/.test(title)) return true;
    // Pure hex / alphanumeric slugs with no spaces (e.g. "a1b2c3d4")
    if (/^[a-f0-9]{6,}$/i.test(title)) return true;
    return false;
}

async function buildItems(pdfDoc, outline, level = 0) {
    const items = [];
    for (const item of outline) {
        if (isRawDestTitle(item.title)) continue;
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
