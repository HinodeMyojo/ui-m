<template>
    <div class="pdf-sidebar" :style="{ width: sidebarWidth + 'px' }">

        <!-- Tab strip -->
        <div class="pdf-sidebar-tabs">
            <button class="pdf-sidebar-tab" :class="{ active: activeTab === 'toc' }" @click="activeTab = 'toc'">Разделы</button>
            <button class="pdf-sidebar-tab" :class="{ active: activeTab === 'bookmarks' }" @click="activeTab = 'bookmarks'">
                Закладки<span v-if="bookmarks.length" class="pdf-sidebar-badge">{{ bookmarks.length }}</span>
            </button>
            <button class="pdf-sidebar-tab" :class="{ active: activeTab === 'annotations' }" @click="activeTab = 'annotations'">
                Заметки<span v-if="annotations.length" class="pdf-sidebar-badge">{{ annotations.length }}</span>
            </button>
            <button class="pdf-sidebar-close" @click="emit('close')" style="margin-left:auto;margin-right:4px;">✕</button>
        </div>

        <!-- TOC panel -->
        <div v-if="activeTab === 'toc'" class="pdf-sidebar-body">
            <div v-if="!tocItems.length" class="pdf-sidebar-empty">
                Содержание недоступно для этого PDF
            </div>
            <button v-for="(item, i) in tocItems" :key="i" class="pdf-toc-item"
                :class="{ active: item.pageNum === currentPage, bold: item.bold, italic: item.italic }"
                :style="{ paddingLeft: (16 + item.level * 16) + 'px' }" @click="emit('go-to-page', item.pageNum)"
                :title="item.title">
                <span class="pdf-toc-title">{{ item.title }}</span>
                <span v-if="item.pageNum" class="pdf-toc-page">{{ item.pageNum }}</span>
            </button>
        </div>

        <!-- Bookmarks panel -->
        <div v-if="activeTab === 'bookmarks'" class="pdf-sidebar-body">
            <div v-if="!bookmarks.length" class="pdf-sidebar-empty">
                Нет закладок.<br>Нажмите 🔖 на панели или клавишу B.
            </div>
            <div v-for="bm in bookmarks" :key="bm.id" class="pdf-bookmark-item"
                :class="{ active: bm.pageNum === currentPage }">
                <span class="pdf-bookmark-icon">🔖</span>
                <button class="pdf-bookmark-page-btn" @click="emit('go-to-page', bm.pageNum)">{{ bm.pageNum }}</button>
                <input class="pdf-bookmark-label" :value="bm.label"
                    @change="emit('update-bookmark-label', bm.id, $event.target.value)"
                    @click.stop @keydown.enter="$event.target.blur()" />
                <button class="pdf-sidebar-close" @click="emit('remove-bookmark', bm.id)" title="Удалить">✕</button>
            </div>
        </div>

        <!-- Annotations panel -->
        <div v-if="activeTab === 'annotations'" class="pdf-sidebar-body">
            <div style="display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--pdf-sidebar-border);">
                <button class="pdf-tb-btn pdf-tb-sm" style="font-size:11px;" @click="emit('export-annotations')" title="Экспорт">↓ JSON</button>
                <label class="pdf-tb-btn pdf-tb-sm" style="font-size:11px;cursor:pointer;" title="Импорт">
                    ↑ JSON
                    <input type="file" accept=".json" style="display:none;" @change="onImport" />
                </label>
            </div>
            <div v-if="!annotations.length" class="pdf-sidebar-empty">
                Нет выделений.<br>Выделите текст на странице.
            </div>
            <div v-for="ann in annotationsSorted" :key="ann.id" class="pdf-annotation-item"
                :class="{ active: ann.pageNum === currentPage }">
                <div class="pdf-annotation-item-header">
                    <span class="pdf-annotation-color-dot" :class="ann.color"></span>
                    <button class="pdf-annotation-jump" @click="emit('go-to-page', ann.pageNum)">стр. {{ ann.pageNum }}</button>
                    <button class="pdf-sidebar-close" @click="emit('remove-annotation', ann.id)" title="Удалить">✕</button>
                </div>
                <div class="pdf-annotation-text">{{ ann.selectedText }}</div>
                <div v-if="ann.note" class="pdf-annotation-note">📝 {{ ann.note }}</div>
            </div>
        </div>

        <div class="pdf-sidebar-resizer" @mousedown="startResize"></div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
    tocItems: Array,
    currentPage: Number,
    bookmarks: { type: Array, default: () => [] },
    annotations: { type: Array, default: () => [] },
});

const emit = defineEmits([
    'go-to-page', 'close',
    'remove-bookmark', 'update-bookmark-label',
    'remove-annotation', 'export-annotations', 'import-annotations',
]);

const activeTab = ref('toc');
const sidebarWidth = ref(280);

const annotationsSorted = computed(() =>
    [...props.annotations].sort((a, b) => a.pageNum - b.pageNum || a.createdAt - b.createdAt)
);

function onImport(e) {
    const file = e.target.files[0];
    if (file) emit('import-annotations', file);
    e.target.value = '';
}

function startResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth.value;
    function onMove(ev) { sidebarWidth.value = Math.max(200, Math.min(500, startW + ev.clientX - startX)); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}
</script>
