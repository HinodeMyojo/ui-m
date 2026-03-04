<template>
    <Teleport to="body">
        <div v-if="visible" class="pdf-translate-backdrop" @click.self="emit('close')">
            <div class="pdf-translate-modal" @click.stop>

                <!-- Header -->
                <div class="pdf-tm-header">
                    <span class="pdf-tm-title">🌐 Перевод</span>

                    <!-- Language selectors -->
                    <div class="pdf-tm-langs">
                        <select class="pdf-tm-lang-select" :value="sourceLang" @change="onChangeSrc">
                            <option value="AUTO">Авто</option>
                            <option v-for="l in languages" :key="l.code" :value="l.code">{{ l.name }}</option>
                        </select>
                        <span class="pdf-tm-arrow">→</span>
                        <select class="pdf-tm-lang-select" :value="targetLang" @change="onChangeTgt">
                            <option v-for="l in languages" :key="l.code" :value="l.code">{{ l.name }}</option>
                        </select>
                    </div>

                    <button class="pdf-tm-close" @click="emit('close')" title="Закрыть (Esc)">✕</button>
                </div>

                <!-- Tab strip -->
                <div class="pdf-tm-tabs">
                    <button class="pdf-tm-tab" :class="{ active: activeTab === 'translate' }" @click="activeTab = 'translate'">Перевод</button>
                    <button class="pdf-tm-tab" :class="{ active: activeTab === 'analyze' }" @click="onTabAnalyze">Разбор</button>
                </div>

                <!-- ── TRANSLATE TAB ── -->
                <template v-if="activeTab === 'translate'">
                    <!-- Original -->
                    <div class="pdf-tm-section">
                        <div class="pdf-tm-section-header">
                            <span class="pdf-tm-label">Оригинал</span>
                            <button class="pdf-tm-speak-btn" @click="emit('speak-original')" title="Прослушать оригинал">🔊</button>
                        </div>
                        <div class="pdf-tm-text pdf-tm-original">{{ originalText }}</div>
                    </div>

                    <!-- Translation -->
                    <div class="pdf-tm-section">
                        <div class="pdf-tm-section-header">
                            <span class="pdf-tm-label">
                                Перевод
                                <span v-if="detectedLang" class="pdf-tm-detected">({{ detectedLang }})</span>
                            </span>
                            <button v-if="translatedText" class="pdf-tm-speak-btn" @click="emit('speak-translation')" title="Прослушать перевод">🔊</button>
                        </div>
                        <div class="pdf-tm-text pdf-tm-translated">
                            <span v-if="isTranslating" class="pdf-tm-spinner"><span class="pdf-spin"></span> Переводим…</span>
                            <span v-else-if="translationError" class="pdf-tm-error">⚠ {{ translationError }}</span>
                            <span v-else-if="translatedText">{{ translatedText }}</span>
                            <span v-else class="pdf-tm-placeholder">Нажмите «Перевести»</span>
                        </div>
                        <button v-if="!isTranslating" class="pdf-tm-retranslate" @click="emit('translate', originalText, sourceLang, targetLang)">
                            {{ translatedText ? '↺ Перевести снова' : '→ Перевести' }}
                        </button>
                    </div>

                    <!-- Note -->
                    <div class="pdf-tm-section">
                        <div class="pdf-tm-section-header">
                            <span class="pdf-tm-label">Заметка</span>
                        </div>
                        <textarea class="pdf-tm-note-textarea" v-model="noteText"
                            placeholder="Добавить заметку к этому тексту…" rows="3"></textarea>
                    </div>

                    <!-- Actions -->
                    <div class="pdf-tm-actions">
                        <div class="pdf-tm-highlight-group">
                            <span class="pdf-tm-label" style="font-size:11px;">Выделить:</span>
                            <button v-for="color in colors" :key="color"
                                class="pdf-sel-color-btn" :class="color"
                                :title="colorLabels[color]"
                                @click="emit('highlight', color)"></button>
                        </div>
                        <button class="pdf-tm-save-btn" @click="onSaveNote">💾 Сохранить заметку</button>
                    </div>
                </template>

                <!-- ── ANALYZE TAB ── -->
                <template v-else>
                    <div class="pdf-tm-section pdf-tm-analyze-scroll">
                        <div v-if="isAnalyzing" class="pdf-tm-analyze-state">
                            <span class="pdf-tm-spinner"><span class="pdf-spin"></span></span> Анализируем…
                        </div>
                        <div v-else-if="analyzeError" class="pdf-tm-analyze-state pdf-tm-error">
                            ⚠ {{ analyzeError }}
                        </div>
                        <div v-else-if="analyzeResult" class="pdf-tm-ai-result" v-html="analyzeHtml"></div>
                        <div v-else class="pdf-tm-analyze-state pdf-tm-placeholder">
                            Нажмите «Разобрать» для лингвистического анализа
                        </div>
                    </div>

                    <div class="pdf-tm-actions" style="justify-content:flex-end;">
                        <button class="pdf-tm-save-btn" :disabled="isAnalyzing"
                            @click="emit('analyze', originalText)">
                            {{ isAnalyzing ? '…' : '🔍 Разобрать снова' }}
                        </button>
                    </div>
                </template>

            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
    visible: Boolean,
    originalText: { type: String, default: '' },
    translatedText: { type: String, default: '' },
    detectedLang: { type: String, default: '' },
    translationError: { type: String, default: '' },
    isTranslating: Boolean,
    sourceLang: { type: String, default: 'EN' },
    targetLang: { type: String, default: 'RU' },
    languages: { type: Array, default: () => [] },
    existingNote: { type: String, default: '' },
    analyzeResult: { type: String, default: '' },
    isAnalyzing: Boolean,
    analyzeError: { type: String, default: '' },
});

const emit = defineEmits([
    'close', 'translate', 'analyze', 'speak-original', 'speak-translation',
    'save-note', 'highlight', 'change-langs',
]);

const colors = ['yellow', 'green', 'blue', 'red'];
const colorLabels = { yellow: 'Жёлтый', green: 'Зелёный', blue: 'Синий', red: 'Красный' };

const activeTab = ref('translate');
const noteText = ref('');

watch(() => props.existingNote, (v) => { noteText.value = v ?? ''; }, { immediate: true });
watch(() => props.visible, (v) => {
    if (v) {
        noteText.value = props.existingNote ?? '';
        activeTab.value = 'translate';
    }
});

function onChangeSrc(e) { emit('change-langs', e.target.value, props.targetLang); }
function onChangeTgt(e) { emit('change-langs', props.sourceLang, e.target.value); }

function onTabAnalyze() {
    activeTab.value = 'analyze';
    // Auto-trigger if no result yet or text changed
    if (!props.analyzeResult && !props.isAnalyzing && props.originalText) {
        emit('analyze', props.originalText);
    }
}

function onSaveNote() { emit('save-note', noteText.value); }

// Markdown → safe HTML for AI response
const analyzeHtml = computed(() => {
    if (!props.analyzeResult) return '';

    // Split into lines for block-level processing
    const lines = props.analyzeResult.split('\n');
    const out = [];
    let i = 0;

    function inlineEscape(s) {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function inlineFormat(s) {
        return inlineEscape(s)
            // Bold+italic ***text***
            .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
            // Bold **text**
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Italic *text*
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // Inline code `text`
            .replace(/`([^`]+)`/g, '<code class="pdf-ai-code">$1</code>');
    }

    while (i < lines.length) {
        const line = lines[i];

        // Table: collect all consecutive table lines
        if (/^\|.+\|/.test(line)) {
            const tableLines = [];
            while (i < lines.length && /^\|.+\|/.test(lines[i])) {
                tableLines.push(lines[i]);
                i++;
            }
            // Skip separator line (|---|---|)
            const rows = tableLines.filter(l => !/^\|[\s|:-]+\|$/.test(l));
            if (rows.length > 0) {
                const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
                const [header, ...body] = rows;
                const ths = cells(header).map(c => `<th>${inlineFormat(c)}</th>`).join('');
                const trs = body.map(r =>
                    `<tr>${cells(r).map(c => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`
                ).join('');
                out.push(`<table class="pdf-ai-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`);
            }
            continue;
        }
        // H3 ### heading (before ##  so longer match wins)
        else if (/^### (.+)/.test(line)) {
            out.push(`<div class="pdf-ai-h3">${inlineFormat(line.replace(/^### /, ''))}</div>`);
        }
        // H2 ## heading
        else if (/^## (.+)/.test(line)) {
            out.push(`<div class="pdf-ai-h2">${inlineFormat(line.replace(/^## /, ''))}</div>`);
        }
        // H1 # heading
        else if (/^# (.+)/.test(line)) {
            out.push(`<div class="pdf-ai-h1">${inlineFormat(line.replace(/^# /, ''))}</div>`);
        }
        // Blockquote > text
        else if (/^> (.+)/.test(line)) {
            out.push(`<blockquote class="pdf-ai-quote">${inlineFormat(line.replace(/^> /, ''))}</blockquote>`);
        }
        // Indented bullet (sub-item) — check before top-level bullet
        else if (/^\s{2,}[-•]\s+(.+)/.test(line)) {
            const m = line.match(/^\s+[-•]\s+(.+)/);
            out.push(`<div class="pdf-ai-li pdf-ai-li-sub"><span class="pdf-ai-li-bullet">◦</span><span>${inlineFormat(m[1])}</span></div>`);
        }
        // Numbered list item
        else if (/^(\d+)\.\s+(.+)/.test(line)) {
            const m = line.match(/^(\d+)\.\s+(.+)/);
            out.push(`<div class="pdf-ai-li"><span class="pdf-ai-li-num">${m[1]}.</span><span>${inlineFormat(m[2])}</span></div>`);
        }
        // Bullet list item - or •
        else if (/^[-•]\s+(.+)/.test(line)) {
            const m = line.match(/^[-•]\s+(.+)/);
            out.push(`<div class="pdf-ai-li"><span class="pdf-ai-li-bullet">•</span><span>${inlineFormat(m[1])}</span></div>`);
        }
        // Horizontal rule ---
        else if (/^---+$/.test(line.trim())) {
            out.push('<hr class="pdf-ai-hr">');
        }
        // Empty line → spacing
        else if (line.trim() === '') {
            out.push('<div class="pdf-ai-gap"></div>');
        }
        // Regular paragraph
        else {
            out.push(`<div class="pdf-ai-p">${inlineFormat(line)}</div>`);
        }

        i++;
    }

    return out.join('');
});
</script>
