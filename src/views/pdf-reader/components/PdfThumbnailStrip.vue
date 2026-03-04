<template>
    <div class="pdf-thumb-strip">
        <div v-for="n in pageCount" :key="n" class="pdf-thumb-item" :class="{ active: n === currentPage }"
            @click="emit('go-to-page', n)" :title="`Стр. ${n}`">
            <canvas :ref="el => { if (el) thumbRefs[n] = el; onThumbVisible(n, el); }" class="pdf-thumb-canvas"></canvas>
            <span class="pdf-thumb-num">{{ n }}</span>
        </div>
    </div>
</template>

<script setup>
import { watch } from 'vue';

const props = defineProps({ pdfDoc: Object, pageCount: Number, currentPage: Number, thumbRefs: Object });
const emit = defineEmits(['go-to-page', 'render-thumb']);

const observedPages = new Set();

function onThumbVisible(pageNum, canvas) {
    if (!canvas || observedPages.has(pageNum)) return;
    observedPages.add(pageNum);
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                emit('render-thumb', pageNum);
                observer.disconnect();
            }
        }
    }, { threshold: 0.1 });
    observer.observe(canvas);
}

watch(() => props.pdfDoc, () => { observedPages.clear(); });
</script>
