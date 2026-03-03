<template>
    <div class="pdf-dropzone" :class="{ dragging, dark: darkMode }" @dragover.prevent="dragging = true"
        @dragleave="dragging = false" @drop.prevent="onDrop">
        <div class="pdf-dropzone-inner">
            <div class="pdf-dropzone-icon">📄</div>
            <div class="pdf-dropzone-title">Открыть PDF</div>
            <div class="pdf-dropzone-sub">Перетащите файл сюда или нажмите кнопку</div>
            <button class="pdf-dropzone-btn" @click="fileInputEl.click()">Выбрать файл</button>
            <input ref="fileInputEl" type="file" accept=".pdf,application/pdf" style="display:none"
                @change="onFileChange" />
            <div v-if="loadError" class="pdf-dropzone-error">{{ loadError }}</div>
            <div v-if="isLoading" class="pdf-dropzone-loading">
                <span class="pdf-spin"></span> Загружаем PDF…
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({ darkMode: Boolean, isLoading: Boolean, loadError: String });
const emit = defineEmits(['file-selected']);

const dragging = ref(false);
const fileInputEl = ref(null);

function onDrop(e) {
    dragging.value = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) emit('file-selected', file);
}

function onFileChange(e) {
    const file = e.target.files?.[0];
    if (file) emit('file-selected', file);
    e.target.value = '';
}
</script>
