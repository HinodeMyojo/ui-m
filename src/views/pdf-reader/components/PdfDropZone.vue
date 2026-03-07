<template>
    <div class="pdf-dropzone" :class="{ dragging, dark: darkMode }" @dragover.prevent="dragging = true"
        @dragleave="dragging = false" @drop.prevent="onDrop">
        <button class="pdf-dz-home" @click="router.push('/')" title="На главную">🏠</button>

        <div class="pdf-dropzone-inner">
            <div class="pdf-dropzone-icon">📄</div>
            <div class="pdf-dropzone-title">Открыть PDF</div>
            <div class="pdf-dropzone-sub">Перетащите файл сюда или нажмите кнопку</div>

            <div class="pdf-dz-actions">
                <button class="pdf-dropzone-btn" @click="fileInputEl.click()">Выбрать файл</button>
                <button class="pdf-dropzone-btn pdf-dropzone-btn-secondary" @click="showLibrary = !showLibrary">
                    {{ showLibrary ? 'Скрыть' : 'Библиотека' }}
                    <span v-if="savedFiles.length" class="pdf-dz-badge">{{ savedFiles.length }}</span>
                </button>
            </div>

            <input ref="fileInputEl" type="file" accept=".pdf,application/pdf" style="display:none"
                @change="onFileChange" />
            <div v-if="loadError" class="pdf-dropzone-error">{{ loadError }}</div>
            <div v-if="isLoading" class="pdf-dropzone-loading">
                <span class="pdf-spin"></span> Загружаем PDF…
            </div>
        </div>

        <!-- Library section -->
        <transition name="lib-fade">
            <div v-if="showLibrary" class="pdf-library">
                <div class="pdf-library-header">
                    <h3>Сохранённые PDF</h3>
                    <div v-if="libraryLoading" class="pdf-spin-small"></div>
                </div>

                <div v-if="!savedFiles.length && !libraryLoading" class="pdf-library-empty">
                    Пока нет сохранённых файлов
                </div>

                <div v-else class="pdf-library-list">
                    <div v-for="f in savedFiles" :key="f.id" class="pdf-library-item" @click="openSaved(f)">
                        <div class="pdf-lib-icon">📕</div>
                        <div class="pdf-lib-info">
                            <div class="pdf-lib-name">{{ f.filename }}</div>
                            <div class="pdf-lib-meta">
                                {{ formatSize(f.size) }} · {{ formatDate(f.createdAt) }}
                            </div>
                        </div>
                        <button class="pdf-lib-delete" @click.stop="removeSaved(f.id)" title="Удалить">✕</button>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getPdfFiles, uploadPdfFile, deletePdfFile, getPdfDownloadUrl } from '@/api/pdfFiles.js';

const router = useRouter();
const props = defineProps({ darkMode: Boolean, isLoading: Boolean, loadError: String });
const emit = defineEmits(['file-selected']);

const dragging = ref(false);
const fileInputEl = ref(null);
const showLibrary = ref(false);
const savedFiles = ref([]);
const libraryLoading = ref(false);

onMounted(loadLibrary);

async function loadLibrary() {
    libraryLoading.value = true;
    try {
        savedFiles.value = await getPdfFiles();
    } catch {
        savedFiles.value = [];
    } finally {
        libraryLoading.value = false;
    }
}

function onDrop(e) {
    dragging.value = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
}

function onFileChange(e) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
}

async function handleFile(file) {
    // Emit immediately so reader starts loading
    emit('file-selected', file);
    // Upload to server in background
    try {
        await uploadPdfFile(file);
        await loadLibrary();
    } catch {
        // silent — file is already loaded locally
    }
}

async function openSaved(f) {
    // Download from server as blob, then emit as File
    const token = localStorage.getItem("token");
    const url = getPdfDownloadUrl(f.id);
    try {
        const resp = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error("download failed");
        const blob = await resp.blob();
        const file = new File([blob], f.filename, { type: "application/pdf" });
        emit('file-selected', file);
    } catch {
        // fallback
    }
}

async function removeSaved(id) {
    try {
        await deletePdfFile(id);
        savedFiles.value = savedFiles.value.filter(f => f.id !== id);
    } catch {
        // silent
    }
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(str) {
    if (!str) return '';
    const d = new Date(str);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
</script>

<style scoped>
.pdf-dz-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
}

.pdf-dropzone-btn-secondary {
    background: transparent !important;
    border: 1.5px solid var(--pdf-accent, #4361ee) !important;
    color: var(--pdf-accent, #4361ee) !important;
    display: flex;
    align-items: center;
    gap: 6px;
}

.pdf-dz-badge {
    background: var(--pdf-accent, #4361ee);
    color: #fff;
    font-size: 11px;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
}

/* Library */
.pdf-library {
    width: 100%;
    max-width: 500px;
    margin-top: 20px;
    background: var(--pdf-bg-card, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--pdf-border, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    padding: 16px;
    max-height: 50vh;
    overflow-y: auto;
}

.pdf-library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.pdf-library-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--pdf-text, #e4e4e7);
}

.pdf-library-empty {
    text-align: center;
    color: var(--pdf-text-muted, rgba(255, 255, 255, 0.35));
    font-size: 14px;
    padding: 16px 0;
}

.pdf-library-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.pdf-library-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--pdf-bg-item, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--pdf-border, rgba(255, 255, 255, 0.07));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
}

.pdf-library-item:hover {
    background: var(--pdf-bg-item-hover, rgba(67, 97, 238, 0.12));
    border-color: var(--pdf-accent, #4361ee);
}

.pdf-lib-icon {
    font-size: 24px;
    flex-shrink: 0;
}

.pdf-lib-info {
    flex: 1;
    min-width: 0;
}

.pdf-lib-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--pdf-text, #e4e4e7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.pdf-lib-meta {
    font-size: 12px;
    color: var(--pdf-text-muted, rgba(255, 255, 255, 0.4));
    margin-top: 2px;
}

.pdf-lib-delete {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--pdf-text-muted, rgba(255, 255, 255, 0.3));
    font-size: 14px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s;
}

.pdf-library-item:hover .pdf-lib-delete {
    opacity: 1;
}

.pdf-lib-delete:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
}

.pdf-spin-small {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(67, 97, 238, 0.2);
    border-top-color: #4361ee;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.lib-fade-enter-active,
.lib-fade-leave-active {
    transition: all 0.25s;
}

.lib-fade-enter-from,
.lib-fade-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}

/* Mobile: make delete always visible */
@media (max-width: 768px) {
    .pdf-lib-delete {
        opacity: 1;
    }

    .pdf-library {
        max-width: 100%;
    }
}
</style>
