<template>
    <div class="pdf-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="pdf-sidebar-header">
            <span>Содержание</span>
            <button class="pdf-sidebar-close" @click="emit('close')">✕</button>
        </div>
        <div class="pdf-sidebar-body">
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
        <div class="pdf-sidebar-resizer" @mousedown="startResize"></div>
    </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({ tocItems: Array, currentPage: Number });
const emit = defineEmits(['go-to-page', 'close']);

const sidebarWidth = ref(260);

function startResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth.value;
    function onMove(ev) { sidebarWidth.value = Math.max(160, Math.min(500, startW + ev.clientX - startX)); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}
</script>
