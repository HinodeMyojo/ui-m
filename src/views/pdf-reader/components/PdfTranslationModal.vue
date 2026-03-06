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
                    <button class="pdf-tm-tab" :class="{ active: activeTab === 'vocab' }" @click="onTabVocab">📖 В словарь</button>
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

                <!-- ── VOCAB TAB ── -->
                <template v-else-if="activeTab === 'vocab'">
                    <div class="pdf-tm-section">
                        <div class="pdf-tm-section-header">
                            <span class="pdf-tm-label">Слово</span>
                            <span v-if="vocabLookupLoading" style="font-size:11px;color:#6b7a9a;">⏳ ищем…</span>
                            <span v-else-if="vocabLookupDone" style="font-size:11px;color:#73d13d;font-weight:600;">✓ найдено</span>
                        </div>
                        <input class="pdf-tm-vocab-input" v-model="vocabWord" placeholder="Слово (EN)" />
                    </div>

                    <!-- All POS groups + translation chips -->
                    <div v-if="vocabDefs.length" class="pdf-tm-section pdf-tm-vocab-defs">
                        <div v-for="def in vocabDefs" :key="def.pos + def.text" class="vocab-def-group">
                            <span class="vocab-def-pos">{{ def.pos }}</span>
                            <span v-if="def.ts" class="vocab-def-ts">[{{ def.ts }}]</span>
                            <div class="vocab-chips">
                                <button
                                    v-for="tr in def.tr"
                                    :key="tr.text"
                                    type="button"
                                    :class="['vocab-chip', vocabTranslation === tr.text && 'active']"
                                    @click="pickVocabTranslation(def, tr)"
                                >{{ tr.text }}</button>
                            </div>
                        </div>
                    </div>

                    <div class="pdf-tm-section">
                        <div class="pdf-tm-section-header"><span class="pdf-tm-label">Перевод</span></div>
                        <input class="pdf-tm-vocab-input" v-model="vocabTranslation" placeholder="Перевод (RU)" />
                    </div>
                    <div class="pdf-tm-section">
                        <div class="pdf-tm-section-header"><span class="pdf-tm-label">Транскрипция</span></div>
                        <input class="pdf-tm-vocab-input" v-model="vocabTranscription" placeholder="напр. ɪˈfem(ə)rəl" />
                    </div>
                    <div class="pdf-tm-section">
                        <div class="pdf-tm-section-header"><span class="pdf-tm-label">Часть речи</span></div>
                        <input class="pdf-tm-vocab-input" v-model="vocabPos" placeholder="noun / verb / adjective…" />
                    </div>
                    <div v-if="vocabSaved" class="pdf-tm-vocab-success">✓ Добавлено в словарь!</div>
                    <div v-if="vocabError" class="pdf-tm-vocab-error">⚠ {{ vocabError }}</div>
                    <div class="pdf-tm-actions" style="justify-content:flex-end;">
                        <button class="pdf-tm-save-btn" :disabled="vocabSaving || !vocabWord || !vocabTranslation" @click="onSaveToVocab">
                            {{ vocabSaving ? '…' : '📖 Добавить в словарь' }}
                        </button>
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
import { lookupVocabWord } from '@/components/api.js';

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
    openVocabTab: { type: Boolean, default: false },
});

const emit = defineEmits([
    'close', 'translate', 'analyze', 'speak-original', 'speak-translation',
    'save-note', 'highlight', 'change-langs', 'add-to-vocab',
]);

const colors = ['yellow', 'green', 'blue', 'red'];
const colorLabels = { yellow: 'Жёлтый', green: 'Зелёный', blue: 'Синий', red: 'Красный' };

const activeTab = ref('translate');
const noteText = ref('');

// Vocab tab state
const vocabWord = ref('');
const vocabTranslation = ref('');
const vocabTranscription = ref('');
const vocabPos = ref('');
const vocabSaving = ref(false);
const vocabSaved = ref(false);
const vocabError = ref('');
const vocabLookupLoading = ref(false);
const vocabLookupDone = ref(false);
const vocabDefs = ref([]); // full def[] from Yandex

let vocabLookupTimer = null;
watch(vocabWord, (val) => {
    clearTimeout(vocabLookupTimer);
    vocabLookupDone.value = false;
    vocabDefs.value = [];
    const trimmed = val.trim();
    if (trimmed.length < 2) return;
    vocabLookupTimer = setTimeout(() => doVocabLookup(trimmed), 600);
});

async function doVocabLookup(word) {
    vocabLookupLoading.value = true;
    vocabLookupDone.value = false;
    vocabDefs.value = [];
    try {
        const data = await lookupVocabWord(word);
        if (!data?.def?.length) return;
        vocabDefs.value = data.def;
        const def = data.def[0];
        const tr = def.tr?.[0];
        if (tr) {
            if (!vocabTranslation.value) vocabTranslation.value = tr.text ?? '';
            if (!vocabPos.value) vocabPos.value = def.pos ?? '';
            if (!vocabTranscription.value) vocabTranscription.value = def.ts ?? '';
            vocabLookupDone.value = true;
        }
    } catch { /* silent */ } finally {
        vocabLookupLoading.value = false;
    }
}

function pickVocabTranslation(def, tr) {
    vocabTranslation.value = tr.text;
    vocabPos.value = def.pos ?? vocabPos.value;
    if (def.ts) vocabTranscription.value = def.ts;
}

watch(() => props.existingNote, (v) => { noteText.value = v ?? ''; }, { immediate: true });
watch(() => props.visible, (v) => {
    if (v) {
        noteText.value = props.existingNote ?? '';
        activeTab.value = props.openVocabTab ? 'vocab' : 'translate';
        vocabSaved.value = false;
        vocabError.value = '';
        if (props.openVocabTab) {
            vocabWord.value = props.originalText?.trim() ?? '';
            vocabTranslation.value = props.translatedText?.trim() ?? '';
        }
    }
});

watch(() => props.openVocabTab, (v) => {
    if (v && props.visible) {
        activeTab.value = 'vocab';
        vocabWord.value = props.originalText?.trim() ?? '';
        vocabTranslation.value = props.translatedText?.trim() ?? '';
    }
});

// Pre-fill vocab fields when switching to vocab tab
function onTabVocab() {
    activeTab.value = 'vocab';
    vocabSaved.value = false;
    vocabError.value = '';
    if (!vocabWord.value) vocabWord.value = props.originalText?.trim() ?? '';
    if (!vocabTranslation.value) vocabTranslation.value = props.translatedText?.trim() ?? '';
}

async function onSaveToVocab() {
    vocabSaving.value = true;
    vocabSaved.value = false;
    vocabError.value = '';
    try {
        await emit('add-to-vocab', {
            word: vocabWord.value.trim(),
            translation: vocabTranslation.value.trim(),
            transcription: vocabTranscription.value.trim(),
            partOfSpeech: vocabPos.value.trim(),
        });
        vocabSaved.value = true;
        vocabWord.value = '';
        vocabTranslation.value = '';
        vocabTranscription.value = '';
        vocabPos.value = '';
    } catch (e) {
        vocabError.value = e?.message ?? 'Ошибка';
    } finally {
        vocabSaving.value = false;
    }
}

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

<style scoped>
.pdf-tm-vocab-input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(23, 103, 253, 0.06);
    border: 1px solid rgba(23, 103, 253, 0.2);
    border-radius: 8px;
    padding: 8px 12px;
    color: #e8eaf0;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
}
.pdf-tm-vocab-input:focus { border-color: rgba(23, 103, 253, 0.5); }
.pdf-tm-vocab-success {
    margin: 0 16px 4px;
    padding: 8px 12px;
    background: rgba(82, 196, 26, 0.15);
    border: 1px solid rgba(82, 196, 26, 0.35);
    border-radius: 8px;
    color: #73d13d;
    font-size: 13px;
    font-weight: 600;
}
.pdf-tm-vocab-error {
    margin: 0 16px 4px;
    padding: 8px 12px;
    background: rgba(255, 77, 79, 0.12);
    border: 1px solid rgba(255, 77, 79, 0.3);
    border-radius: 8px;
    color: #ff7875;
    font-size: 13px;
}

/* Vocab lookup def groups */
.pdf-tm-vocab-defs {
    background: rgba(23, 103, 253, 0.06);
    border: 1px solid rgba(23, 103, 253, 0.2) !important;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.vocab-def-group { display: flex; flex-direction: column; gap: 4px; }
.vocab-def-pos {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.8px; color: #9b7fff;
}
.vocab-def-ts { font-size: 10px; color: #6b7a9a; margin-left: 6px; }
.vocab-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
.vocab-chip {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 20px;
    padding: 2px 10px;
    font-size: 12px;
    color: #c8d4f0;
    cursor: pointer;
    transition: all 0.15s;
}
.vocab-chip:hover { background: rgba(23, 103, 253, 0.2); border-color: rgba(23, 103, 253, 0.4); color: #fff; }
.vocab-chip.active { background: rgba(23, 103, 253, 0.3); border-color: rgba(23, 103, 253, 0.6); color: #fff; font-weight: 600; }
</style>
