<template>
    <div class="pdf-annotation-layer">
        <template v-for="ann in annotations" :key="ann.id">
            <div v-for="(rect, ri) in ann.rects" :key="ann.id + '-' + ri"
                class="pdf-annotation-rect"
                :class="ann.color"
                :style="{
                    left:   (rect.x * zoomLevel) + 'px',
                    top:    (rect.y * zoomLevel) + 'px',
                    width:  (rect.w * zoomLevel) + 'px',
                    height: (rect.h * zoomLevel) + 'px',
                }"
                :title="ann.note || ann.selectedText"
                @click.stop="emit('edit-note', ann.id)"
                @contextmenu.prevent="emit('remove', ann.id)"
            ></div>
        </template>
    </div>
</template>

<script setup>
defineProps({
    annotations: { type: Array, default: () => [] },
    zoomLevel: { type: Number, default: 1 },
});
const emit = defineEmits(['remove', 'edit-note']);
</script>
