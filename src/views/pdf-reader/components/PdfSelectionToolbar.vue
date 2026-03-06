<template>
    <div v-if="visible" class="pdf-selection-toolbar" :style="{ left: safeX + 'px', top: safeY + 'px' }" @mousedown.prevent>
        <button v-for="color in colors" :key="color"
            class="pdf-sel-color-btn" :class="color" :title="colorLabels[color]"
            @click="emit('highlight', color)"></button>
        <div class="pdf-tb-divider" style="height:18px;margin:0 2px;"></div>
        <button class="pdf-tb-btn pdf-tb-sm" title="Перевести" @click="emit('translate')">🌐</button>
        <button class="pdf-tb-btn pdf-tb-sm" title="В словарь" @click="emit('add-to-vocab')">📖</button>
        <button class="pdf-tb-btn pdf-tb-sm" title="Заметка" @click="toggleNote">📝</button>
        <button class="pdf-tb-btn pdf-tb-sm" title="Копировать" @click="emit('copy')">📋</button>
        <button class="pdf-tb-btn pdf-tb-sm" title="Закрыть" @click="emit('dismiss')">✕</button>

        <!-- Inline note input -->
        <div v-if="showNote" class="pdf-note-popup" @mousedown.stop>
            <textarea class="pdf-note-textarea" v-model="noteText"
                placeholder="Заметка…" rows="3" @keydown.esc="showNote = false"></textarea>
            <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;">
                <button class="pdf-tb-btn pdf-tb-sm" @click="saveNote">Сохранить</button>
                <button class="pdf-tb-btn pdf-tb-sm" @click="showNote = false">Отмена</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
    visible: Boolean,
    x: Number,
    y: Number,
    existingNote: { type: String, default: '' },
});

const emit = defineEmits(['highlight', 'note', 'copy', 'translate', 'add-to-vocab', 'dismiss', 'save-note']);

const colors = ['yellow', 'green', 'blue', 'red'];
const colorLabels = { yellow: 'Жёлтый', green: 'Зелёный', blue: 'Синий', red: 'Красный' };

const showNote = ref(false);
const noteText = ref('');

function toggleNote() {
    noteText.value = props.existingNote;
    showNote.value = !showNote.value;
}

function saveNote() {
    emit('save-note', noteText.value);
    showNote.value = false;
}

// Keep toolbar inside viewport
const TOOLBAR_W = 220;
const TOOLBAR_H = 44;

const safeX = computed(() => {
    if (props.x === undefined) return 0;
    return Math.max(8, Math.min(props.x, window.innerWidth - TOOLBAR_W - 8));
});

const safeY = computed(() => {
    if (props.y === undefined) return 0;
    const above = props.y - TOOLBAR_H - 8;
    return above < 8 ? props.y + 8 : above;
});

// Reset note panel when toolbar hides
import { watch } from 'vue';
watch(() => props.visible, v => { if (!v) showNote.value = false; });
</script>
