<template>
    <!-- Fullscreen preview -->
    <div v-if="isFullscreen" class="fullscreen" :class="{ dark: darkMode }" @keydown="onFullscreenKeydown" tabindex="0">
        <!-- Reading progress bar -->
        <div class="read-progress-bar" :style="{ width: (readProgress * 100) + '%' }"></div>

        <div class="fullscreen-toolbar">
            <button @click="router.push('/')">🏠 Главная</button>
            <button @click="isFullscreen = false">✕ Закрыть</button>
            <button @click="darkMode = !darkMode">{{ darkMode ? '☀️ Светлая' : '🌙 Тёмная' }}</button>
            <button @click="showSidebar = !showSidebar" :class="{ active: showSidebar }">📋 Структура</button>
            <button @click="openSearch" :class="{ active: searchOpen }">🔍 Поиск</button>
            <button @click="toggleFocusMode" :class="{ active: focusMode }">🎯 Фокус</button>
            <button @click="toggleNotesPanel" :class="{ active: showNotesPanel }">
                📝 Заметки{{ userNotes.length ? ' (' + userNotes.length + ')' : '' }}
            </button>
            <button @click="toggleAiPanel" :class="{ active: aiPanelOpen }">🤖 Claude</button>
            <span v-if="readingTime" class="read-time-label">~{{ readingTime }} мин</span>
        </div>

        <div class="fullscreen-body" @click="activeCitation = null; noteTooltipVisible = false; aiKeyModalOpen = false">
            <div class="fullscreen-main">
                <!-- Search bar -->
                <div v-if="searchOpen" class="search-bar">
                    <input
                        ref="searchInputEl"
                        v-model="searchQuery"
                        @input="runSearch"
                        @keydown.stop
                        placeholder="Поиск в тексте..."
                        class="search-input" />
                    <span class="search-counter" v-if="searchMatches.length">
                        {{ searchIdx + 1 }} / {{ searchMatches.length }}
                    </span>
                    <span class="search-counter" v-else-if="searchQuery">0 совпадений</span>
                    <button class="search-nav-btn" @click="prevMatch" :disabled="!searchMatches.length">▲</button>
                    <button class="search-nav-btn" @click="nextMatch" :disabled="!searchMatches.length">▼</button>
                    <button class="search-close-btn" @click="closeSearch">✕</button>
                </div>

                <div class="fullscreen-content"
                     v-html="fullscreenHtml"
                     @click.stop="onContentClick"
                     @scroll="onContentScroll"
                     @mouseup="onContentMouseUp">
                </div>
            </div>

            <div v-if="showSidebar" class="fullscreen-sidebar" :style="{ width: sidebarWidth + 'px' }">
                <div class="sidebar-resizer" @mousedown="startSidebarResize"></div>
                <div class="sidebar-section" v-if="tocItems.length">
                    <div class="sidebar-title">Структура</div>
                    <div v-for="item in tocItems" :key="item.id"
                        class="toc-item" :class="`toc-h${item.level}`"
                        @click="scrollToHeading(item.id)">
                        {{ item.text }}
                    </div>
                </div>
                <div class="sidebar-section" v-if="highlights.length">
                    <div class="sidebar-title">Важное</div>
                    <div v-for="(h, i) in highlights" :key="i" class="highlight-item" :class="`highlight-${h.type}`"
                        @click="scrollToHighlight(h.searchText)">
                        <span class="highlight-badge">{{ h.badge }}</span>
                        <span class="highlight-text">{{ h.text }}</span>
                    </div>
                </div>
                <div class="sidebar-section" v-if="showNotesPanel">
                    <div class="sidebar-title">Заметки</div>
                    <div v-if="!userNotes.length" class="sidebar-empty">Нет заметок<br><small>Выделите текст чтобы сохранить</small></div>
                    <div v-for="note in userNotes" :key="note.id" class="note-item" @click="scrollToNote(note)">
                        <span class="note-text">{{ note.text }}</span>
                        <button class="note-delete" @click.stop="deleteNote(note.id)">✕</button>
                    </div>
                </div>
                <div v-if="!tocItems.length && !highlights.length && !showNotesPanel" class="sidebar-empty">
                    Нет структуры
                </div>
            </div>
        </div>

        <!-- Note save tooltip -->
        <div v-if="noteTooltipVisible"
             class="note-tooltip"
             :style="noteTooltipStyle"
             @click.stop>
            <button class="note-tooltip-btn" @click="saveNote">📌 Сохранить заметку</button>
            <button class="note-tooltip-btn note-tooltip-ai-btn" @click="openAiWithSelection">🤖 Спросить Claude</button>
            <button class="note-tooltip-btn" @click="openVocabFromSelection">📖 В словарь</button>
            <button class="note-tooltip-close" @click="noteTooltipVisible = false">✕</button>
        </div>

        <!-- Vocab quick-add modal -->
        <div v-if="vocabModalOpen" class="modal-overlay" @click.self="vocabModalOpen = false">
            <div class="modal-card" @click.stop>
                <button class="modal-close" @click="vocabModalOpen = false">×</button>
                <h2 class="modal-title">
                    Добавить в словарь
                    <span v-if="vocabLookupLoading" style="font-size:12px;font-weight:400;color:#6b7a9a;margin-left:8px;">⏳ ищем…</span>
                </h2>
                <div class="modal-form">
                    <label>
                        <span class="label-text">Слово (EN)</span>
                        <input v-model="vocabForm.word" class="form-input" placeholder="word" />
                    </label>
                    <!-- All POS groups + translation chips -->
                    <div v-if="vocabDefs.length" class="vocab-lookup-defs">
                        <div v-for="def in vocabDefs" :key="def.pos + def.text" class="vocab-lookup-group">
                            <span class="vocab-lookup-pos">{{ def.pos }}</span>
                            <span v-if="def.ts" class="vocab-lookup-ts">[{{ def.ts }}]</span>
                            <div class="vocab-lookup-chips">
                                <button
                                    v-for="tr in def.tr"
                                    :key="tr.text"
                                    type="button"
                                    :class="['vocab-lookup-chip', vocabForm.translation === tr.text && 'active']"
                                    @click="pickVocabChip(def, tr)"
                                >{{ tr.text }}</button>
                            </div>
                        </div>
                    </div>
                    <label>
                        <span class="label-text">Перевод (RU)</span>
                        <input v-model="vocabForm.translation" class="form-input" placeholder="перевод" />
                    </label>
                    <label>
                        <span class="label-text">Часть речи</span>
                        <input v-model="vocabForm.partOfSpeech" class="form-input" placeholder="noun / verb…" />
                    </label>
                    <div v-if="vocabSaveMsg" :class="vocabSaveError ? 'vocab-msg-error' : 'vocab-msg-ok'">{{ vocabSaveMsg }}</div>
                    <div class="modal-actions">
                        <button class="btn-secondary" type="button" @click="vocabModalOpen = false">Отмена</button>
                        <button class="btn-primary" type="button" :disabled="vocabSaving || !vocabForm.word" @click="submitVocab">
                            {{ vocabSaving ? '…' : 'Добавить' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- AI Key Modal + Chat Panel -->
        <AiPanel
            :open="aiPanelOpen"
            :darkMode="darkMode"
            :sidebarOpen="showSidebar"
            :sidebarWidth="sidebarWidth"
            :aiMode="aiMode"
            :aiMessages="aiMessages"
            :aiInputText="aiInputText"
            :aiStreaming="aiStreaming"
            :aiKeyModalOpen="aiKeyModalOpen"
            :aiKeyInput="aiKeyInput"
            :tabPendingContext="tabPendingContext"
            :mdParser="mdParser"
            :escapeHtml="escapeHtml"
            @update:open="aiPanelOpen = $event"
            @update:aiMode="aiMode = $event"
            @update:aiInputText="aiInputText = $event"
            @update:aiKeyInput="aiKeyInput = $event"
            @send="sendAiMessage"
            @clear="clearAiChat"
            @open-key-modal="openApiKeyModal"
            @close-key-modal="aiKeyModalOpen = false"
            @confirm-key="confirmApiKey"
            @open-in-tab="openInTab"
        />

        <!-- SVG Tree Visualizer Modal -->
        <SvgTreeModal
            v-model="treeModalOpen"
            :treeRenderData="treeRenderData"
            :treeSvgSize="treeSvgSize"
            :treeTransform="treeTransform"
            :treeIsPanning="treeIsPanning"
            :nodeW="NODE_W"
            :nodeH="NODE_H"
            @reset="resetTreeView"
            @wheel="onTreeWheel"
            @pan-start="onTreePanStart"
            @toggle-node="toggleTreeNode"
        />

        <!-- Citation popup -->
        <div v-if="activeCitation" class="citation-popup" :style="popupStyle" @click.stop>
            <div class="citation-popup-header">
                <span class="citation-popup-num">[{{ activeCitation.num }}]</span>
                <button class="citation-popup-close" @click="activeCitation = null">✕</button>
            </div>
            <div class="citation-popup-body" v-html="mdParser.parse(activeCitation.text)"></div>
        </div>
    </div>

    <!-- Main editor -->
    <div v-else class="menu">
        <div class="header">
            <button @click="router.push('/')">🏠 Главная</button>
            <button @click="downloadPdf">📥 Скачать</button>
            <button @click="darkMode = !darkMode">{{ darkMode ? '☀️ Светлая' : '🌙 Тёмная' }}</button>
            <button @click="isFullscreen = true">🔍 Просмотр</button>
            <div class="save-group">
                <button @click="saveToStorage">💾 Сохранить</button>
                <button @click="showSaved = !showSaved" :class="{ active: showSaved }">📂 Загрузить</button>
            </div>
            <div v-if="saveMessage" class="save-toast">{{ saveMessage }}</div>
        </div>

        <!-- Saved documents dropdown -->
        <div v-if="showSaved" class="saved-panel">
            <div v-if="savedDocs.length === 0" class="saved-empty">Нет сохранённых документов</div>
            <div v-for="(doc, i) in savedDocs" :key="doc.id" class="saved-item">
                <div class="saved-info" @click="loadDoc(doc)">
                    <span class="saved-title">{{ doc.title }}</span>
                    <span class="saved-date">{{ formatDate(doc.date) }}</span>
                </div>
                <button class="saved-delete" @click="deleteDoc(i)">✕</button>
            </div>
        </div>

        <div class="inner-menu">
            <div class="part" @dragover.prevent="isDragging = true" @dragleave="isDragging = false"
                @drop.prevent="onDrop" :class="{ dragging: isDragging }">
                <textarea v-model="fileContent" placeholder="Вставьте сюда текст"></textarea>
            </div>
            <div class="split"></div>
            <div class="part" :class="{ dark: darkMode }">
                <div class="pdf-container" v-html="renderedHtml"></div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { watch, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { addVocabCard, lookupVocabWord } from '@/components/api.js';
const router = useRouter();
import { useViewState }       from './md-editor/composables/useViewState.js';
import { useMarkdownParser }  from './md-editor/composables/useMarkdownParser.js';
import { useStorage }         from './md-editor/composables/useStorage.js';
import { useSidebar }         from './md-editor/composables/useSidebar.js';
import { useReadingProgress } from './md-editor/composables/useReadingProgress.js';
import { useSearch }          from './md-editor/composables/useSearch.js';
import { useFocusMode }       from './md-editor/composables/useFocusMode.js';
import { useNotes }           from './md-editor/composables/useNotes.js';
import { useCitation }        from './md-editor/composables/useCitation.js';
import { useSvgTree, NODE_W, NODE_H } from './md-editor/composables/useSvgTree.js';
import { useClaudeAi }        from './md-editor/composables/useClaudeAi.js';
import AiPanel                from './md-editor/components/AiPanel.vue';
import SvgTreeModal           from './md-editor/components/SvgTreeModal.vue';
import './md-editor/md-editor-dynamic.css';

// ── Core state ──────────────────────────────────────────────────────────────
const { fileContent, darkMode, isFullscreen, isDragging } = useViewState();
const { mdParser, codeBlocks, renderedHtml, fullscreenHtml } = useMarkdownParser(fileContent);
const { savedDocs, showSaved, saveMessage, saveToStorage, loadDoc, deleteDoc, formatDate, onDrop, downloadPdf } = useStorage(fileContent, darkMode, renderedHtml);
const { showSidebar, showNotesPanel, sidebarWidth, tocItems, highlights, startSidebarResize, scrollToHeading, scrollToHighlight, toggleNotesPanel } = useSidebar(fileContent);
const { readProgress, readingTime, onContentScrollProgress } = useReadingProgress(fileContent);
const { searchOpen, searchQuery, searchMatches, searchIdx, searchInputEl, openSearch, closeSearch, runSearch, nextMatch, prevMatch } = useSearch();
const { focusMode, toggleFocusMode, updateFocusedElement, onContentScrollFocus } = useFocusMode();
const { userNotes, noteTooltipVisible, noteTooltipStyle, pendingSelection, saveNote, deleteNote, scrollToNote, applyNoteHighlights, onContentMouseUp } = useNotes(fileContent);
const { activeCitation, popupStyle, handleCitationClick } = useCitation(fileContent);
const { treeModalOpen, treeRenderData, treeSvgSize, treeTransform, treeIsPanning, openTreeModal, toggleTreeNode, resetTreeView, onTreeWheel, onTreePanStart } = useSvgTree();
const { aiPanelOpen, aiMode, aiMessages, aiInputText, aiStreaming, aiKeyModalOpen, aiKeyInput, tabPendingContext, toggleAiPanel, clearAiChat, openApiKeyModal, confirmApiKey, sendAiMessage, openInTab, setContextFromSelection, escapeHtml } = useClaudeAi(mdParser);

// ── Coordinator: unified scroll handler ────────────────────────────────────
function onContentScroll(e) {
    onContentScrollProgress(e);
    onContentScrollFocus();
}

// ── Coordinator: content click dispatcher ──────────────────────────────────
function onContentClick(e) {
    const treeBtn = e.target.closest('.code-tree-btn');
    if (treeBtn) {
        openTreeModal(codeBlocks[parseInt(treeBtn.dataset.codeIdx, 10)] ?? '');
        return;
    }
    const copyBtn = e.target.closest('.code-copy-btn');
    if (copyBtn) {
        const code = codeBlocks[parseInt(copyBtn.dataset.codeIdx, 10)] ?? '';
        navigator.clipboard.writeText(code).then(() => {
            const prev = copyBtn.textContent;
            copyBtn.textContent = 'Скопировано!';
            copyBtn.classList.add('copied');
            setTimeout(() => { copyBtn.textContent = prev; copyBtn.classList.remove('copied'); }, 1500);
        });
        return;
    }
    handleCitationClick(e);
}

// ── Coordinator: open AI with selected text ─────────────────────────────────
function openAiWithSelection() {
    const sel = pendingSelection.value;
    noteTooltipVisible.value = false;
    aiPanelOpen.value = true;
    if (sel?.text) setContextFromSelection(sel.text);
}

// ── Vocabulary ────────────────────────────────────────────────────────────
const vocabModalOpen = ref(false);
const vocabForm = ref({ word: '', translation: '', partOfSpeech: '' });
const vocabSaving = ref(false);
const vocabSaveMsg = ref('');
const vocabSaveError = ref(false);
const vocabLookupLoading = ref(false);
const vocabDefs = ref([]);

let vocabLookupTimer = null;

function openVocabFromSelection() {
    const sel = pendingSelection.value;
    noteTooltipVisible.value = false;
    const word = sel?.text?.trim() ?? '';
    vocabForm.value = { word, translation: '', partOfSpeech: '' };
    vocabSaveMsg.value = '';
    vocabSaveError.value = false;
    vocabDefs.value = [];
    vocabModalOpen.value = true;
    if (word.length >= 2) {
        clearTimeout(vocabLookupTimer);
        vocabLookupTimer = setTimeout(() => doVocabLookup(word), 300);
    }
}

async function doVocabLookup(word) {
    vocabLookupLoading.value = true;
    vocabDefs.value = [];
    try {
        const data = await lookupVocabWord(word);
        if (!data?.def?.length) return;
        vocabDefs.value = data.def;
        const def = data.def[0];
        const tr = def.tr?.[0];
        if (tr && !vocabForm.value.translation) vocabForm.value.translation = tr.text ?? '';
        if (def.pos && !vocabForm.value.partOfSpeech) vocabForm.value.partOfSpeech = def.pos;
    } catch { /* silent */ } finally {
        vocabLookupLoading.value = false;
    }
}

function pickVocabChip(def, tr) {
    vocabForm.value.translation = tr.text;
    if (def.pos) vocabForm.value.partOfSpeech = def.pos;
}

async function submitVocab() {
    if (!vocabForm.value.word) return;
    vocabSaving.value = true;
    vocabSaveMsg.value = '';
    vocabSaveError.value = false;
    try {
        await addVocabCard({ ...vocabForm.value });
        vocabSaveMsg.value = '✓ Добавлено в словарь!';
        setTimeout(() => { vocabModalOpen.value = false; }, 1000);
    } catch {
        vocabSaveMsg.value = 'Ошибка при добавлении';
        vocabSaveError.value = true;
    } finally {
        vocabSaving.value = false;
    }
}

// ── Keyboard shortcuts ──────────────────────────────────────────────────────
function onFullscreenKeydown(e) {
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); openSearch(); return; }
    if (e.key === 'Escape') {
        if (aiKeyModalOpen.value) { aiKeyModalOpen.value = false; return; }
        if (searchOpen.value) { closeSearch(); return; }
        if (aiPanelOpen.value) { aiPanelOpen.value = false; return; }
        isFullscreen.value = false;
    }
    if (searchOpen.value && e.key === 'Enter' && e.target !== searchInputEl.value) {
        e.shiftKey ? prevMatch() : nextMatch();
    }
}

// ── Watchers ────────────────────────────────────────────────────────────────
watch(isFullscreen, (val) => {
    if (!val) {
        if (focusMode.value) toggleFocusMode();
        closeSearch();
        readProgress.value = 0;
    }
});

watch(fullscreenHtml, () => {
    nextTick(() => {
        applyNoteHighlights();
        if (searchOpen.value && searchQuery.value) runSearch();
        if (focusMode.value) updateFocusedElement();
    });
});
</script>

<style scoped>
*,
*::before,
*::after {
    box-sizing: border-box;
}

/* Vocab lookup chips */
.vocab-lookup-defs {
    background: rgba(23,103,253,0.06);
    border: 1px solid rgba(23,103,253,0.2);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.vocab-lookup-group { display: flex; flex-direction: column; gap: 4px; }
.vocab-lookup-pos {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.8px; color: #9b7fff;
}
.vocab-lookup-ts { font-size: 10px; color: #6b7a9a; margin-left: 6px; }
.vocab-lookup-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
.vocab-lookup-chip {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 20px;
    padding: 2px 10px;
    font-size: 12px;
    color: #c8d4f0;
    cursor: pointer;
    transition: all 0.15s;
}
.vocab-lookup-chip:hover { background: rgba(23,103,253,0.2); border-color: rgba(23,103,253,0.4); color: #fff; }
.vocab-lookup-chip.active { background: rgba(23,103,253,0.3); border-color: rgba(23,103,253,0.6); color: #fff; font-weight: 600; }

.vocab-msg-ok {
    padding: 8px 12px;
    background: rgba(82, 196, 26, 0.15);
    border: 1px solid rgba(82, 196, 26, 0.35);
    border-radius: 8px;
    color: #73d13d;
    font-size: 13px;
    font-weight: 600;
}
.vocab-msg-error {
    padding: 8px 12px;
    background: rgba(255, 77, 79, 0.12);
    border: 1px solid rgba(255, 77, 79, 0.3);
    border-radius: 8px;
    color: #ff7875;
    font-size: 13px;
}
.btn-primary {
    background: linear-gradient(135deg, #1767fd, #6e4aff);
    border: none; border-radius: 10px; padding: 10px 20px;
    color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
    transition: opacity 0.2s;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px; padding: 10px 20px; color: #b7c9d1;
    font-size: 14px; cursor: pointer;
}

/* ===== FULLSCREEN PREVIEW ===== */
.fullscreen {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #fff;
    display: flex;
    flex-direction: column;
    transition: background 0.3s, color 0.3s;
}

.fullscreen-body {
    display: flex;
    flex: 1;
    overflow: hidden;
}

.fullscreen-content {
    flex: 1;
    overflow-y: auto;
}

.fullscreen-sidebar {
    flex-shrink: 0;
    overflow-y: auto;
    border-left: 1px solid #e5e7eb;
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    background: #f8fafc;
    position: relative;
}

.sidebar-resizer {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    cursor: col-resize;
    z-index: 10;
}

.sidebar-resizer:hover,
.sidebar-resizer:active {
    background: #89b4fa55;
}

.fullscreen.dark .fullscreen-sidebar {
    border-left-color: #313244;
    background: #181825;
}

.sidebar-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.sidebar-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #94a3b8;
    margin-bottom: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e2e8f0;
}

.fullscreen.dark .sidebar-title {
    color: #6c7086;
    border-bottom-color: #313244;
}

.toc-item {
    font-size: 13px;
    cursor: pointer;
    padding: 3px 6px;
    border-radius: 4px;
    color: #475569;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.15s, color 0.15s;
}

.toc-item:hover {
    background: #e2e8f0;
    color: #1e293b;
}

.fullscreen.dark .toc-item {
    color: #a6adc8;
}

.fullscreen.dark .toc-item:hover {
    background: #313244;
    color: #cdd6f4;
}

.toc-h1 { font-weight: 700; color: #1e293b; }
.toc-h2 { padding-left: 12px; }
.toc-h3 { padding-left: 22px; font-size: 12px; }
.toc-h4 { padding-left: 32px; font-size: 11px; color: #94a3b8; }

.fullscreen.dark .toc-h1 { color: #cba6f7; }
.fullscreen.dark .toc-h2 { color: #89b4fa; }
.fullscreen.dark .toc-h3 { color: #94e2d5; }
.fullscreen.dark .toc-h4 { color: #a6e3a1; }

.highlight-item {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    padding: 5px 7px;
    border-radius: 5px;
    font-size: 12px;
    line-height: 1.4;
    cursor: pointer;
    transition: opacity 0.15s;
}

.highlight-item:hover { opacity: 0.75; }

.highlight-badge {
    flex-shrink: 0;
    font-size: 11px;
    margin-top: 1px;
}

.highlight-text {
    color: #334155;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
}

.fullscreen.dark .highlight-text { color: #cdd6f4; }

.highlight-quote { background: #f0f4ff; border-left: 2px solid #89b4fa; }
.highlight-bold { background: #fdf4ff; border-left: 2px solid #cba6f7; }
.highlight-pattern { background: #fff7ed; border-left: 2px solid #fab387; }

.fullscreen.dark .highlight-quote { background: #1e2640; border-left-color: #89b4fa; }
.fullscreen.dark .highlight-bold { background: #251e30; border-left-color: #cba6f7; }
.fullscreen.dark .highlight-pattern { background: #28200f; border-left-color: #fab387; }

.sidebar-empty {
    font-size: 13px;
    color: #94a3b8;
    text-align: center;
    padding: 20px 0;
}

.fullscreen-toolbar button.active { background: #1d4ed8; }

.fullscreen.dark {
    background: #1e1e2e;
    color: #cdd6f4;
}

.fullscreen-toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: 8px;
    padding: 12px 40px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid #e5e7eb;
}

.fullscreen.dark .fullscreen-toolbar {
    background: rgba(30, 30, 46, 0.9);
    border-bottom-color: #313244;
}

.fullscreen-toolbar button {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    background: #2563eb;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
}

.fullscreen-toolbar button:hover { background: #1d4ed8; }

.fullscreen-content {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 15px;
    line-height: 1.7;
}

/* Fullscreen light content styles */
.fullscreen-content :deep(h1) { font-size: 28px; margin: 0 0 16px; color: #0f172a; font-weight: 700; }
.fullscreen-content :deep(h2) { font-size: 22px; margin: 24px 0 12px; color: #1e3a5f; font-weight: 600; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
.fullscreen-content :deep(h3) { font-size: 18px; margin: 18px 0 10px; color: #065f46; font-weight: 600; }
.fullscreen-content :deep(h4) { font-size: 16px; margin: 14px 0 8px; color: #4338ca; font-weight: 600; }
.fullscreen-content :deep(p) { margin: 0 0 10px; color: #1e293b; }
.fullscreen-content :deep(strong) { color: #9d174d; font-weight: 700; }
.fullscreen-content :deep(em) { color: #c2410c; font-style: italic; }
.fullscreen-content :deep(code) { background: #f1f5f9; color: #be185d; padding: 2px 7px; border-radius: 4px; font-size: 0.85em; font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace; border: 1px solid #e2e8f0; }
.fullscreen-content :deep(pre) { border-radius: 8px; overflow-x: auto; margin: 0 0 14px; }
.fullscreen-content :deep(.code-block-wrapper) { margin: 0 0 14px; }
.fullscreen-content :deep(.code-block-wrapper) pre { margin: 0; border-radius: 0 0 8px 8px; }
.fullscreen-content :deep(pre code) { display: block; padding: 16px; background: #0d1117; color: #e6edf3; font-size: 13px; line-height: 1.5; border-radius: 8px; }
.fullscreen-content :deep(.hljs) { background: #0d1117; color: #e6edf3; }
.fullscreen-content :deep(.hljs-keyword) { color: #ff7b72; }
.fullscreen-content :deep(.hljs-string) { color: #a5d6ff; }
.fullscreen-content :deep(.hljs-number) { color: #79c0ff; }
.fullscreen-content :deep(.hljs-comment) { color: #8b949e; font-style: italic; }
.fullscreen-content :deep(.hljs-function),
.fullscreen-content :deep(.hljs-title) { color: #d2a8ff; }
.fullscreen-content :deep(.hljs-built_in),
.fullscreen-content :deep(.hljs-type) { color: #ffa657; }
.fullscreen-content :deep(.hljs-attr),
.fullscreen-content :deep(.hljs-property) { color: #79c0ff; }
.fullscreen-content :deep(.hljs-variable) { color: #ffa657; }
.fullscreen-content :deep(.hljs-operator) { color: #ff7b72; }
.fullscreen-content :deep(table) { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 14px; }
.fullscreen-content :deep(thead th) { background: #1e293b; color: #fff; font-weight: 600; text-align: left; padding: 10px 14px; }
.fullscreen-content :deep(thead th:first-child) { border-radius: 6px 0 0 0; }
.fullscreen-content :deep(thead th:last-child) { border-radius: 0 6px 0 0; }
.fullscreen-content :deep(tbody tr) { border-bottom: 1px solid #e5e7eb; }
.fullscreen-content :deep(tbody tr:nth-child(even)) { background: #f8fafc; }
.fullscreen-content :deep(tbody td) { padding: 10px 14px; color: #1e293b; }
.fullscreen-content :deep(tbody td strong) { color: #9d174d; }
.fullscreen-content :deep(a) { color: #2563eb; text-decoration: underline; }
.fullscreen-content :deep(blockquote) { border-left: 3px solid #6366f1; margin: 0 0 10px; padding: 8px 16px; color: #475569; background: #f8fafc; border-radius: 0 6px 6px 0; }
.fullscreen-content :deep(ul) { margin: 0 0 10px; padding-left: 24px; list-style-type: disc; color: #1e293b; }
.fullscreen-content :deep(ol) { margin: 0 0 10px; padding-left: 24px; list-style-type: decimal; color: #1e293b; }
.fullscreen-content :deep(li) { margin: 0 0 4px; display: list-item; color: #1e293b; }
.fullscreen-content :deep(hr) { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }

/* Citation popup */
.citation-popup {
    position: fixed;
    z-index: 2000;
    width: 340px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    padding: 14px 16px 12px;
    font-size: 13px;
    line-height: 1.5;
    color: #1e293b;
}

.fullscreen.dark .citation-popup {
    background: #1e1e2e;
    border-color: #313244;
    color: #cdd6f4;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.citation-popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.citation-popup-num { font-weight: 700; color: #2563eb; font-size: 14px; }
.fullscreen.dark .citation-popup-num { color: #89b4fa; }

.citation-popup-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #94a3b8;
    font-size: 13px;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
}

.citation-popup-close:hover { background: #f1f5f9; color: #475569; }
.fullscreen.dark .citation-popup-close:hover { background: #313244; color: #cdd6f4; }

.citation-popup-body :deep(p) { margin: 0; }
.citation-popup-body :deep(a) { color: #2563eb; word-break: break-all; }
.fullscreen.dark .citation-popup-body :deep(a) { color: #89b4fa; }

/* Fullscreen dark content overrides */
.fullscreen.dark .fullscreen-content { color: #cdd6f4; }
.fullscreen.dark .fullscreen-content :deep(p) { color: #cdd6f4; }
.fullscreen.dark .fullscreen-content :deep(li) { color: #cdd6f4; }
.fullscreen.dark .fullscreen-content :deep(ul),
.fullscreen.dark .fullscreen-content :deep(ol) { color: #cdd6f4; }
.fullscreen.dark .fullscreen-content :deep(tbody td) { color: #cdd6f4; }
.fullscreen.dark .fullscreen-content :deep(h1) { color: #cba6f7; font-weight: 700; }
.fullscreen.dark .fullscreen-content :deep(h2) { color: #89b4fa; font-weight: 600; border-bottom: 1px solid #313244; padding-bottom: 6px; }
.fullscreen.dark .fullscreen-content :deep(h3) { color: #94e2d5; font-weight: 600; }
.fullscreen.dark .fullscreen-content :deep(h4) { color: #a6e3a1; font-weight: 600; }
.fullscreen.dark .fullscreen-content :deep(strong) { color: #f5c2e7; font-weight: 700; }
.fullscreen.dark .fullscreen-content :deep(em) { color: #fab387; }
.fullscreen.dark .fullscreen-content :deep(code) { background: #181825; color: #f38ba8; border: 1px solid #313244; }
.fullscreen.dark .fullscreen-content :deep(pre) { border: 1px solid #313244; }
.fullscreen.dark .fullscreen-content :deep(pre code) { background: #181825; color: #cdd6f4; border: none; }
.fullscreen.dark .fullscreen-content :deep(table) { border: 1px solid #313244; }
.fullscreen.dark .fullscreen-content :deep(thead th) { background: #181825; color: #cba6f7; font-weight: 700; border-bottom: 2px solid #45475a; }
.fullscreen.dark .fullscreen-content :deep(tbody tr) { border-bottom: 1px solid #313244; }
.fullscreen.dark .fullscreen-content :deep(tbody tr:nth-child(even)) { background: #181825; }
.fullscreen.dark .fullscreen-content :deep(tbody td strong) { color: #f5c2e7; }
.fullscreen.dark .fullscreen-content :deep(blockquote) { border-left-color: #cba6f7; color: #a6adc8; background: #181825; border-radius: 0 6px 6px 0; padding: 8px 16px; }
.fullscreen.dark .fullscreen-content :deep(hr) { border-top-color: #313244; }
.fullscreen.dark .fullscreen-content :deep(a) { color: #89b4fa; }

/* ===== READING PROGRESS BAR ===== */
.read-progress-bar {
    position: absolute;
    top: 0; left: 0;
    height: 3px;
    background: linear-gradient(90deg, #2563eb, #7c3aed);
    z-index: 20;
    border-radius: 0 2px 2px 0;
    transition: width 0.1s linear;
    pointer-events: none;
}

.fullscreen.dark .read-progress-bar { background: linear-gradient(90deg, #89b4fa, #cba6f7); }

.read-time-label {
    font-size: 12px;
    color: #fff;
    opacity: 0.7;
    white-space: nowrap;
    align-self: center;
    padding: 0 4px;
    margin-left: auto;
}

/* ===== FULLSCREEN MAIN WRAPPER ===== */
.fullscreen-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
}

/* ===== SEARCH BAR ===== */
.search-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.96);
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
    backdrop-filter: blur(8px);
}

.fullscreen.dark .search-bar {
    background: rgba(30, 30, 46, 0.96);
    border-bottom-color: #313244;
}

.search-input {
    flex: 1;
    max-width: 320px;
    padding: 5px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    outline: none;
    background: #fff;
    color: #1e293b;
}

.search-input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px #2563eb22; }
.fullscreen.dark .search-input { background: #181825; border-color: #45475a; color: #cdd6f4; }
.fullscreen.dark .search-input:focus { border-color: #89b4fa; box-shadow: 0 0 0 2px #89b4fa22; }

.search-counter { font-size: 12px; color: #64748b; white-space: nowrap; min-width: 70px; }
.fullscreen.dark .search-counter { color: #a6adc8; }

.search-nav-btn {
    padding: 4px 8px;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    background: none;
    color: #475569;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.12s;
}

.search-nav-btn:hover:not(:disabled) { background: #f1f5f9; }
.search-nav-btn:disabled { opacity: 0.35; cursor: default; }
.fullscreen.dark .search-nav-btn { border-color: #45475a; color: #cdd6f4; }
.fullscreen.dark .search-nav-btn:hover:not(:disabled) { background: #313244; }

.search-close-btn {
    padding: 4px 10px;
    border: none;
    border-radius: 5px;
    background: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 12px;
    margin-left: 4px;
    transition: color 0.12s;
}

.search-close-btn:hover { color: #f87171; }

/* ===== NOTE TOOLTIP ===== */
.note-tooltip {
    position: fixed;
    z-index: 2500;
    display: flex;
    gap: 4px;
    background: #1e293b;
    border-radius: 8px;
    padding: 5px 7px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    transform: translateX(-50%);
}

.note-tooltip-btn {
    padding: 4px 10px;
    border: none;
    border-radius: 5px;
    background: #2563eb;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
}

.note-tooltip-btn:hover { background: #1d4ed8; }

.note-tooltip-close {
    padding: 4px 8px;
    border: none;
    border-radius: 5px;
    background: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 12px;
    transition: color 0.12s;
}

.note-tooltip-close:hover { color: #f87171; }

/* ===== NOTES IN SIDEBAR ===== */
.note-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 5px;
    font-size: 12px;
    cursor: pointer;
    background: #fefce8;
    border-left: 2px solid #eab308;
    margin-bottom: 4px;
    transition: opacity 0.15s;
}

.note-item:hover { opacity: 0.75; }
.fullscreen.dark .note-item { background: #252010; border-left-color: #d97706; }

.note-text {
    flex: 1;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    color: #1e293b;
    line-height: 1.4;
}

.fullscreen.dark .note-text { color: #cdd6f4; }

.note-delete {
    background: none !important;
    border: none !important;
    color: #94a3b8;
    cursor: pointer;
    font-size: 11px;
    padding: 1px 4px !important;
    border-radius: 3px !important;
    flex-shrink: 0;
    line-height: 1.2;
}

.note-delete:hover { color: #f87171 !important; }

/* ===== SVG TREE MODAL ===== */
.tree-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    background: rgba(0, 0, 0, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
}

.tree-modal {
    background: #13131f;
    border: 1px solid #313244;
    border-radius: 14px;
    width: 92vw;
    height: 87vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
}

.tree-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 20px;
    border-bottom: 1px solid #313244;
    flex-shrink: 0;
}

.tree-modal-title { color: #cba6f7; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
.tree-modal-controls { display: flex; gap: 8px; }

.tree-modal-btn {
    padding: 5px 13px;
    border: 1px solid #45475a;
    border-radius: 6px;
    background: #313244;
    color: #cdd6f4;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
}

.tree-modal-btn:hover { background: #45475a; }
.tree-modal-close-btn { border-color: #f38ba855; color: #f38ba8; }
.tree-modal-close-btn:hover { background: #3b1f2b; }

.tree-viewport {
    flex: 1;
    overflow: hidden;
    cursor: grab;
    user-select: none;
    position: relative;
    background: radial-gradient(ellipse at center, #1a1a2e 0%, #11111b 100%);
}

.tree-viewport.panning { cursor: grabbing; }

/* ===== MAIN LAYOUT ===== */
textarea {
    color: black;
    font-weight: 400;
    resize: none;
    outline: none;
    overflow-y: scroll;
}

.menu {
    width: 100%;
    height: 100vh;
    display: flex;
    gap: 10px;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: black;
}

.header {
    display: flex;
    gap: 10px;
    align-items: center;
    position: relative;
}

.header button {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: #2563eb;
    color: #fff;
    cursor: pointer;
    font-size: 14px;
    white-space: nowrap;
}

.header button:hover { background: #1d4ed8; }

.save-group { display: flex; gap: 4px; }
.save-group button.active { background: #1d4ed8; }

.save-toast {
    color: #4ade80;
    font-size: 13px;
    font-weight: 600;
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
}

/* ===== SAVED PANEL ===== */
.saved-panel {
    width: 400px;
    max-height: 300px;
    overflow-y: auto;
    background: #1c1c1c;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 8px;
}

.saved-empty { color: #666; text-align: center; padding: 20px; font-size: 13px; }

.saved-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
}

.saved-item:hover { background: #2a2a2a; }

.saved-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.saved-title { color: #e6edf3; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.saved-date { color: #666; font-size: 11px; }

.saved-delete {
    background: none !important;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 14px;
    padding: 4px 8px !important;
    border-radius: 4px !important;
    flex-shrink: 0;
}

.saved-delete:hover { color: #f87171; background: #331111 !important; }

/* ===== EDITOR ===== */
.inner-menu {
    width: 90%;
    height: 90%;
    border-radius: 50px;
    background-color: rgba(85 85 85 / 0.44);
    display: flex;
    overflow: hidden;
}

.split { width: 50px; }

.pdf-container {
    height: 100%;
    overflow-y: auto;
    padding: 40px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #000;
    background: #fff;
    transition: background 0.3s, color 0.3s;
}

.pdf-container :deep(h1) { font-size: 24px; margin: 0 0 12px; }
.pdf-container :deep(h2) { font-size: 20px; margin: 16px 0 10px; }
.pdf-container :deep(h3) { font-size: 17px; margin: 14px 0 8px; }
.pdf-container :deep(h4) { font-size: 15px; margin: 12px 0 6px; }
.pdf-container :deep(p) { margin: 0 0 8px; }
.pdf-container :deep(code) { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.85em; font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace; }
.pdf-container :deep(pre) { border-radius: 8px; overflow-x: auto; margin: 0 0 12px; }
.pdf-container :deep(pre code) { display: block; padding: 16px; background: #1e1e2e; color: #cdd6f4; font-size: 13px; line-height: 1.5; border-radius: 8px; }
.pdf-container :deep(.hljs) { background: #0d1117; color: #e6edf3; }
.pdf-container :deep(.hljs-keyword) { color: #ff7b72; }
.pdf-container :deep(.hljs-string) { color: #a5d6ff; }
.pdf-container :deep(.hljs-number) { color: #79c0ff; }
.pdf-container :deep(.hljs-comment) { color: #8b949e; font-style: italic; }
.pdf-container :deep(.hljs-function),
.pdf-container :deep(.hljs-title) { color: #d2a8ff; }
.pdf-container :deep(.hljs-built_in),
.pdf-container :deep(.hljs-type) { color: #ffa657; }
.pdf-container :deep(.hljs-attr),
.pdf-container :deep(.hljs-property) { color: #79c0ff; }
.pdf-container :deep(.hljs-variable) { color: #ffa657; }
.pdf-container :deep(.hljs-params) { color: #e6edf3; }
.pdf-container :deep(.hljs-punctuation) { color: #8b949e; }
.pdf-container :deep(.hljs-operator) { color: #ff7b72; }
.pdf-container :deep(.hljs-literal) { color: #79c0ff; }
.pdf-container :deep(.hljs-meta) { color: #ffa657; }
.pdf-container :deep(table) { width: 100%; border-collapse: collapse; margin: 0 0 12px; font-size: 13px; }
.pdf-container :deep(thead th) { background: #1e293b; color: #fff; font-weight: 600; text-align: left; padding: 10px 12px; }
.pdf-container :deep(thead th:first-child) { border-radius: 6px 0 0 0; }
.pdf-container :deep(thead th:last-child) { border-radius: 0 6px 0 0; }
.pdf-container :deep(tbody tr) { border-bottom: 1px solid #e5e7eb; }
.pdf-container :deep(tbody tr:nth-child(even)) { background: #f8fafc; }
.pdf-container :deep(tbody tr:hover) { background: #f1f5f9; }
.pdf-container :deep(tbody td) { padding: 8px 12px; }
.pdf-container :deep(tbody td strong) { color: #1e40af; }
.pdf-container :deep(blockquote) { border-left: 3px solid #ccc; margin: 0 0 8px; padding-left: 16px; color: #555; }
.pdf-container :deep(ul) { margin: 0 0 8px; padding-left: 24px; list-style-type: disc; }
.pdf-container :deep(ol) { margin: 0 0 8px; padding-left: 24px; list-style-type: decimal; }
.pdf-container :deep(li) { margin: 0 0 4px; display: list-item; }
.pdf-container :deep(hr) { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
.pdf-container :deep(a) { color: #2563eb; }

/* Dark theme for editor preview */
.dark .pdf-container { color: #cdd6f4; background: #1e1e2e; }
.dark .pdf-container :deep(h1) { color: #cba6f7; font-weight: 700; }
.dark .pdf-container :deep(h2) { color: #89b4fa; font-weight: 600; border-bottom: 1px solid #313244; padding-bottom: 6px; }
.dark .pdf-container :deep(h3) { color: #94e2d5; font-weight: 600; }
.dark .pdf-container :deep(h4) { color: #a6e3a1; font-weight: 600; }
.dark .pdf-container :deep(strong) { color: #f5c2e7; font-weight: 700; }
.dark .pdf-container :deep(em) { color: #fab387; }
.dark .pdf-container :deep(code) { background: #181825; color: #f38ba8; border: 1px solid #313244; }
.dark .pdf-container :deep(pre) { border: 1px solid #313244; }
.dark .pdf-container :deep(pre code) { background: #181825; color: #cdd6f4; border: none; }
.dark .pdf-container :deep(table) { border: 1px solid #313244; }
.dark .pdf-container :deep(thead th) { background: #181825; color: #cba6f7; font-weight: 700; border-bottom: 2px solid #45475a; }
.dark .pdf-container :deep(tbody tr) { border-bottom: 1px solid #313244; }
.dark .pdf-container :deep(tbody tr:nth-child(even)) { background: #181825; }
.dark .pdf-container :deep(tbody tr:hover) { background: #24273a; }
.dark .pdf-container :deep(tbody td strong) { color: #f5c2e7; }
.dark .pdf-container :deep(blockquote) { border-left-color: #cba6f7; color: #a6adc8; background: #181825; border-radius: 0 6px 6px 0; padding: 8px 16px; }
.dark .pdf-container :deep(hr) { border-top-color: #313244; }
.dark .pdf-container :deep(a) { color: #89b4fa; }

.part {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background-color: rgb(255 255 255);
    transition: background-color 0.3s;
}

.part.dark { background-color: #1e1e2e; }

.part textarea {
    width: 100%;
    height: 100%;
    padding: 20px;
    color: black;
}
</style>
