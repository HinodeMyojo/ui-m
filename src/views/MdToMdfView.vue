<template>
    <!-- Fullscreen preview -->
    <div v-if="isFullscreen" class="fullscreen" :class="{ dark: darkMode }" @keydown="onFullscreenKeydown" tabindex="0">
        <!-- Reading progress bar -->
        <div class="read-progress-bar" :style="{ width: (readProgress * 100) + '%' }"></div>

        <div class="fullscreen-toolbar">
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
            <button class="note-tooltip-close" @click="noteTooltipVisible = false">✕</button>
        </div>

        <!-- AI Key Modal -->
        <div v-if="aiKeyModalOpen" class="ai-key-modal-overlay" @click.self="aiKeyModalOpen = false">
            <div class="ai-key-modal">
                <div class="ai-key-modal-title">🤖 Claude API Key</div>
                <p class="ai-key-modal-desc">Введите ваш Anthropic API ключ. Он сохранится в localStorage только в браузере.</p>
                <input
                    v-model="aiKeyInput"
                    type="password"
                    class="ai-key-input"
                    placeholder="sk-ant-..."
                    @keydown.enter="confirmApiKey"
                    @keydown.stop />
                <div class="ai-key-modal-actions">
                    <button class="ai-key-save-btn" @click="confirmApiKey">Сохранить</button>
                    <button class="ai-key-cancel-btn" @click="aiKeyModalOpen = false">Отмена</button>
                </div>
            </div>
        </div>

        <!-- Claude AI Chat Panel -->
        <div v-if="aiPanelOpen" class="ai-panel" :class="{ dark: darkMode }"
             :style="showSidebar ? { right: sidebarWidth + 'px' } : {}"
             @click.stop>
            <div class="ai-panel-header">
                <span class="ai-panel-title">🤖 Claude AI</span>
                <div class="ai-panel-actions">
                    <!-- Mode toggle -->
                    <div class="ai-mode-toggle" title="Режим работы">
                        <button class="ai-mode-btn" :class="{ active: aiMode === 'api' }" @click="aiMode = 'api'">API</button>
                        <button class="ai-mode-btn" :class="{ active: aiMode === 'tab' }" @click="aiMode = 'tab'">claude.ai</button>
                    </div>
                    <button v-if="aiMode === 'api'" class="ai-panel-btn" @click="clearAiChat" title="Очистить чат">🗑</button>
                    <button v-if="aiMode === 'api'" class="ai-panel-btn" @click="openApiKeyModal" title="API ключ">🔑</button>
                    <button class="ai-panel-btn ai-panel-close" @click="aiPanelOpen = false">✕</button>
                </div>
            </div>

            <!-- API mode -->
            <template v-if="aiMode === 'api'">
                <div class="ai-messages" ref="aiMessagesEl">
                    <div v-if="!aiMessages.length" class="ai-empty">
                        Выделите текст и нажмите «Спросить Claude», или задайте вопрос ниже.<br><br>
                        <small>Нужен API ключ с <b>console.anthropic.com</b></small>
                    </div>
                    <div v-for="msg in aiMessages" :key="msg.id"
                         class="ai-message" :class="'ai-message-' + msg.role">
                        <div v-if="msg.role === 'context'" class="ai-context-block">
                            <span class="ai-context-label">📎 Контекст:</span>
                            <span class="ai-context-text">{{ msg.content }}</span>
                        </div>
                        <template v-else>
                            <div class="ai-message-bubble" v-html="msg.role === 'assistant' ? mdParser.parse(msg.content || '...') : escapeHtml(msg.content)"></div>
                            <div v-if="msg.role === 'assistant' && msg.streaming" class="ai-streaming-dot"></div>
                        </template>
                    </div>
                </div>
                <div class="ai-input-row">
                    <textarea
                        v-model="aiInputText"
                        class="ai-input"
                        placeholder="Задайте вопрос... (Enter — отправить)"
                        rows="2"
                        @keydown.enter.exact.prevent="sendAiMessage"
                        @keydown.stop />
                    <button class="ai-send-btn" @click="sendAiMessage" :disabled="aiStreaming">
                        {{ aiStreaming ? '⏳' : '➤' }}
                    </button>
                </div>
            </template>

            <!-- Tab mode -->
            <template v-else>
                <div class="ai-tab-body">
                    <div class="ai-tab-icon">🌐</div>
                    <div class="ai-tab-desc">
                        Откроет <b>claude.ai</b> в новой вкладке в вашем браузере.<br>
                        Используется ваша существующая сессия — логин не сбивается.
                    </div>
                    <div v-if="tabPendingContext" class="ai-tab-context-preview">
                        <div class="ai-tab-context-label">📎 Выделенный текст будет скопирован:</div>
                        <div class="ai-tab-context-text">{{ tabPendingContext.slice(0, 200) }}{{ tabPendingContext.length > 200 ? '…' : '' }}</div>
                    </div>
                    <div class="ai-tab-input-group">
                        <textarea
                            v-model="aiInputText"
                            class="ai-input ai-tab-input"
                            :placeholder="tabPendingContext ? 'Добавьте вопрос (необязательно)...' : 'Введите вопрос или выделите текст...'"
                            rows="3"
                            @keydown.stop />
                        <button class="ai-tab-open-btn" @click="openInTab">
                            Открыть claude.ai →
                        </button>
                        <div class="ai-tab-hint">Текст скопируется в буфер — вставьте его в Claude (Ctrl+V)</div>
                    </div>
                </div>
            </template>
        </div>

        <!-- SVG Tree Visualizer Modal -->
        <div v-if="treeModalOpen" class="tree-modal-overlay" @click.self="treeModalOpen = false">
            <div class="tree-modal">
                <div class="tree-modal-header">
                    <span class="tree-modal-title">🌳 Структура файлов</span>
                    <div class="tree-modal-controls">
                        <button class="tree-modal-btn" @click="resetTreeView">↺ Сброс</button>
                        <button class="tree-modal-btn tree-modal-close-btn" @click="treeModalOpen = false">✕ Закрыть</button>
                    </div>
                </div>
                <div class="tree-viewport"
                     :class="{ panning: treeIsPanning }"
                     @wheel.prevent="onTreeWheel"
                     @mousedown="onTreePanStart">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        :width="treeSvgSize.w"
                        :height="treeSvgSize.h"
                        :style="{ transform: treeTransform, transformOrigin: '0 0' }">
                        <defs>
                            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                <path d="M0,0 L0,6 L6,3 z" fill="#45475a"/>
                            </marker>
                        </defs>
                        <!-- Edges -->
                        <path
                            v-for="edge in treeRenderData.edges"
                            :key="'e'+edge.id"
                            :d="`M${edge.x1},${edge.y1} C${edge.x1+50},${edge.y1} ${edge.x2-50},${edge.y2} ${edge.x2},${edge.y2}`"
                            class="tree-edge"
                            marker-end="url(#arrowhead)" />
                        <!-- Nodes -->
                        <g
                            v-for="node in treeRenderData.nodes"
                            :key="node.id"
                            :transform="`translate(${node.x},${node.y})`"
                            class="tree-node-group"
                            @click.stop="toggleTreeNode(node)">
                            <rect
                                :width="NODE_W" :height="NODE_H" rx="7"
                                :class="['tree-node-rect',
                                    node.isFolder ? 'tree-node-folder' : 'tree-node-file',
                                    node.collapsed ? 'tree-node-collapsed' : '']" />
                            <text x="12" :y="NODE_H/2" class="tree-node-icon" dominant-baseline="central">
                                {{ node.isFolder ? (node.collapsed ? '📁' : '📂') : '📄' }}
                            </text>
                            <text x="34" :y="NODE_H/2" class="tree-node-name" dominant-baseline="central">{{ node.name }}</text>
                            <text v-if="node.children.length > 0"
                                  :x="NODE_W - 14" :y="NODE_H/2"
                                  class="tree-collapse-icon" dominant-baseline="central">
                                {{ node.collapsed ? '+' : '−' }}
                            </text>
                            <title v-if="node.comment || node.fullName !== node.name">{{ node.fullName }}{{ node.comment ? ' — ' + node.comment : '' }}</title>
                        </g>
                    </svg>
                </div>
            </div>
        </div>

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
                <textarea v-model="fileContent" name="" id="" placeholder="Вставьте сюда текст"></textarea>
            </div>
            <div class="split"></div>
            <div class="part" :class="{ dark: darkMode }">
                <div class="pdf-container" v-html="renderedHtml"></div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, shallowRef, triggerRef, watch, nextTick } from 'vue';
import { Marked } from 'marked';
import hljs from 'highlight.js';

// Stores code block texts during each parse (reset before each parse)
const codeBlocks = [];

const mdParser = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
        code({ text, lang }) {
            let highlighted;
            if (lang && hljs.getLanguage(lang)) {
                highlighted = hljs.highlight(text, { language: lang }).value;
            } else {
                highlighted = hljs.highlightAuto(text).value;
            }
            const cls = lang ? ` class="hljs language-${lang}"` : ' class="hljs"';
            const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
            const idx = codeBlocks.push(text) - 1;
            const treeBtn = /[├└│]/.test(text)
                ? `<button class="code-tree-btn" data-code-idx="${idx}">🌳 Визуализировать</button>`
                : '';
            return `<div class="code-block-wrapper"><div class="code-block-toolbar">${langLabel}${treeBtn}<button class="code-copy-btn" data-code-idx="${idx}">Копировать</button></div><pre><code${cls}>${highlighted}\n</code></pre></div>`;
        },
        heading({ text, depth }) {
            const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            return `<h${depth} id="${id}">${text}</h${depth}>`;
        },
        link({ href, title, text }) {
            const t = title ? ` title="${title}"` : '';
            return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
        },
    },
});

const STORAGE_KEY = 'md-editor-docs';

const fileContent = ref('');
const isDragging = ref(false);
const darkMode = ref(false);
const isFullscreen = ref(false);
const showSaved = ref(false);
const showSidebar = ref(false);
const savedDocs = ref(loadAllDocs());
const saveMessage = ref('');

const HIGHLIGHT_PATTERNS = /важно|note|warning|todo|внимание|запомни|ключевой|обязательно/i;

const tocItems = computed(() => {
    if (!fileContent.value) return [];
    const items = [];
    const lines = fileContent.value.split('\n');
    for (const line of lines) {
        const m = line.match(/^(#{1,4})\s+(.+)/);
        if (m) {
            const text = m[2].trim();
            const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            items.push({ level: m[1].length, text, id });
        }
    }
    return items;
});

const highlights = computed(() => {
    if (!fileContent.value) return [];
    const items = [];
    const lines = fileContent.value.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('> ')) {
            const text = trimmed.slice(2).replace(/\*\*/g, '').trim();
            if (text) items.push({ type: 'quote', badge: '❝', text, searchText: text.slice(0, 60) });
        } else {
            const boldMatches = [...trimmed.matchAll(/\*\*([^*]+)\*\*/g)];
            for (const m of boldMatches) {
                if (m[1].length > 3) items.push({ type: 'bold', badge: '★', text: m[1], searchText: m[1].slice(0, 60) });
            }
            if (HIGHLIGHT_PATTERNS.test(trimmed) && !trimmed.startsWith('#')) {
                const clean = trimmed.replace(/\*\*/g, '').replace(/^[-*]\s/, '').slice(0, 80);
                if (clean) items.push({ type: 'pattern', badge: '⚠', text: clean, searchText: clean.slice(0, 60) });
            }
        }
    }
    return items.slice(0, 30);
});

function scrollToHeading(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToHighlight(searchText) {
    const content = document.querySelector('.fullscreen-content');
    if (!content) return;
    const needle = searchText.slice(0, 20);
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (node.textContent.includes(needle)) {
            const el = node.parentElement;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.remove('highlight-flash');
            void el.offsetWidth; // force reflow
            el.classList.add('highlight-flash');
            setTimeout(() => el.classList.remove('highlight-flash'), 1300);
            return;
        }
    }
}

// ===== Sidebar resize =====
const sidebarWidth = ref(280);

function startSidebarResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth.value;
    function onMove(ev) {
        const delta = startX - ev.clientX;
        sidebarWidth.value = Math.max(160, Math.min(600, startW + delta));
    }
    function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

const hljsThemeCss = `
.hljs { background: #0d1117; color: #e6edf3; }
.hljs-keyword { color: #ff7b72; }
.hljs-string { color: #a5d6ff; }
.hljs-number { color: #79c0ff; }
.hljs-comment { color: #8b949e; font-style: italic; }
.hljs-function, .hljs-title { color: #d2a8ff; }
.hljs-built_in { color: #ffa657; }
.hljs-type { color: #ffa657; }
.hljs-attr { color: #79c0ff; }
.hljs-variable { color: #ffa657; }
.hljs-params { color: #e6edf3; }
.hljs-punctuation { color: #8b949e; }
.hljs-operator { color: #ff7b72; }
.hljs-property { color: #79c0ff; }
.hljs-literal { color: #79c0ff; }
.hljs-meta { color: #ffa657; }
`;

const lightStyles = `
    body {
        font-family: system-ui, -apple-system, sans-serif;
        padding: 40px;
        color: #000;
        background: #fff;
        line-height: 1.6;
        font-size: 14px;
    }
    h1 { font-size: 24px; margin: 0 0 12px; }
    h2 { font-size: 20px; margin: 16px 0 10px; }
    h3 { font-size: 17px; margin: 14px 0 8px; }
    h4 { font-size: 15px; margin: 12px 0 6px; }
    p { margin: 0 0 8px; }
    code {
        background: #f0f0f0; padding: 2px 6px; border-radius: 3px;
        font-size: 0.85em; font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    }
    pre { border-radius: 8px; overflow-x: auto; margin: 0 0 12px; }
    pre code {
        display: block; padding: 16px; background: #1e1e2e; color: #cdd6f4;
        font-size: 13px; line-height: 1.5; border-radius: 8px;
    }
    blockquote { border-left: 3px solid #ccc; margin: 0 0 8px; padding-left: 16px; color: #555; }
    ul { margin: 0 0 8px; padding-left: 24px; list-style-type: disc; }
    ol { margin: 0 0 8px; padding-left: 24px; list-style-type: decimal; }
    li { margin: 0 0 4px; display: list-item; }
    hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
    a { color: #2563eb; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 12px; font-size: 13px; }
    thead th { background: #1e293b; color: #fff; font-weight: 600; text-align: left; padding: 10px 12px; }
    thead th:first-child { border-radius: 6px 0 0 0; }
    thead th:last-child { border-radius: 0 6px 0 0; }
    tbody tr { border-bottom: 1px solid #e5e7eb; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody td { padding: 8px 12px; }
    tbody td strong { color: #1e40af; }
`;

const darkStyles = `
    body {
        font-family: system-ui, -apple-system, sans-serif;
        padding: 40px;
        color: #cdd6f4;
        background: #1e1e2e;
        line-height: 1.7;
        font-size: 14px;
    }
    h1 { font-size: 24px; margin: 0 0 14px; color: #cba6f7; font-weight: 700; }
    h2 { font-size: 20px; margin: 20px 0 10px; color: #89b4fa; font-weight: 600; border-bottom: 1px solid #313244; padding-bottom: 6px; }
    h3 { font-size: 17px; margin: 16px 0 8px; color: #94e2d5; font-weight: 600; }
    h4 { font-size: 15px; margin: 12px 0 6px; color: #a6e3a1; font-weight: 600; }
    p { margin: 0 0 10px; }
    strong { color: #f5c2e7; font-weight: 700; }
    em { color: #fab387; font-style: italic; }
    code {
        background: #181825; color: #f38ba8; padding: 2px 7px; border-radius: 4px;
        font-size: 0.85em; font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
        border: 1px solid #313244;
    }
    pre { border-radius: 8px; overflow-x: auto; margin: 0 0 14px; border: 1px solid #313244; }
    pre code {
        display: block; padding: 16px; background: #181825; color: #cdd6f4;
        font-size: 13px; line-height: 1.6; border-radius: 8px; border: none;
    }
    blockquote { border-left: 3px solid #cba6f7; margin: 0 0 10px; padding: 8px 16px; color: #a6adc8; background: #181825; border-radius: 0 6px 6px 0; }
    ul { margin: 0 0 10px; padding-left: 24px; list-style-type: disc; }
    ol { margin: 0 0 10px; padding-left: 24px; list-style-type: decimal; }
    li { margin: 0 0 4px; display: list-item; }
    hr { border: none; border-top: 1px solid #313244; margin: 20px 0; }
    a { color: #89b4fa; text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 13px; }
    thead th { background: #181825; color: #cba6f7; font-weight: 700; text-align: left; padding: 10px 12px; border-bottom: 2px solid #45475a; }
    thead th:first-child { border-radius: 6px 0 0 0; }
    thead th:last-child { border-radius: 0 6px 0 0; }
    tbody tr { border-bottom: 1px solid #313244; }
    tbody tr:nth-child(even) { background: #181825; }
    tbody td { padding: 8px 12px; }
    tbody td strong { color: #f5c2e7; }
`;

const renderedHtml = computed(() => {
    if (!fileContent.value) return '';
    codeBlocks.length = 0; // reset before each parse
    return mdParser.parse(fileContent.value);
});

// Wrap [N] citation refs in fullscreen HTML for click interactivity
const fullscreenHtml = computed(() => {
    if (!renderedHtml.value) return '';
    return renderedHtml.value.replace(/\[(\d+)\]/g, '<span class="citation-ref" data-ref="$1">[$1]</span>');
});

const citationMap = computed(() => {
    const map = {};
    if (!fileContent.value) return map;
    const lines = fileContent.value.split('\n');
    let inSources = false;
    for (const line of lines) {
        if (/^##\s+(Источники|References|Sources|Bibliography)/i.test(line)) { inSources = true; continue; }
        if (inSources && /^##/.test(line)) { inSources = false; }
        if (inSources) {
            const m = line.match(/^(\d+)\.\s+(.+)/);
            if (m) map[m[1]] = m[2];
        }
    }
    return map;
});

const activeCitation = ref(null);
const citationPos = ref({ x: 0, y: 0 });

const popupStyle = computed(() => {
    const x = Math.min(citationPos.value.x, window.innerWidth - 360);
    const y = citationPos.value.y + 16;
    return { left: x + 'px', top: y + 'px' };
});

// ===== FEATURE 1: READING PROGRESS + TIME =====
const readProgress = ref(0);
const readingTime = computed(() => {
    if (!fileContent.value) return 0;
    const text = fileContent.value;

    // Блоки кода: каждые 10 строк ≈ 1 мин на осмысление + тестирование
    const codeBlockMatches = [...text.matchAll(/```[\s\S]*?```/g)];
    const codeLines = codeBlockMatches.reduce((sum, m) => sum + m[0].split('\n').length - 2, 0);
    const codeMinutes = Math.ceil(codeLines / 10);

    // Обычный текст без разметки: 200 слов/мин
    const plain = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*_~|\\[\]()>#\-+]/g, ' ')
        .replace(/https?:\/\/\S+/g, '');
    const words = plain.trim().split(/\s+/).filter(w => w.length > 1).length;
    const textMinutes = Math.ceil(words / 200);

    return textMinutes + codeMinutes;
});

function onContentScroll(e) {
    const el = e.target;
    const scrollable = el.scrollHeight - el.clientHeight;
    readProgress.value = scrollable > 0 ? el.scrollTop / scrollable : 0;
    onContentScrollFocus();
}

// ===== FEATURE 2: SEARCH =====
const searchOpen = ref(false);
const searchQuery = ref('');
const searchMatches = ref([]);
const searchIdx = ref(0);
const searchInputEl = ref(null);

function openSearch() {
    searchOpen.value = true;
    nextTick(() => searchInputEl.value?.focus());
}

function runSearch() {
    clearSearchMarks();
    const query = searchQuery.value.trim();
    if (!query) return;

    const content = document.querySelector('.fullscreen-content');
    if (!content) return;

    // Pass 1: collect {node, start, end}
    const targets = [];
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const lower = query.toLowerCase();
    let node;
    while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('.search-hl, .code-block-toolbar')) continue;
        const text = node.textContent.toLowerCase();
        let idx = 0;
        while ((idx = text.indexOf(lower, idx)) !== -1) {
            targets.push({ node, start: idx, end: idx + query.length });
            idx += query.length;
        }
    }

    // Pass 2: wrap in reverse order
    const marks = [];
    for (let i = targets.length - 1; i >= 0; i--) {
        const { node: n, start, end } = targets[i];
        try {
            const range = document.createRange();
            range.setStart(n, start);
            range.setEnd(n, end);
            const mark = document.createElement('mark');
            mark.className = 'search-hl';
            range.surroundContents(mark);
            marks.unshift(mark);
        } catch {}
    }
    searchMatches.value = marks;
    searchIdx.value = 0;
    if (marks.length) scrollToSearchMatch(0);
}

function scrollToSearchMatch(idx) {
    searchMatches.value.forEach((m, i) => m.classList.toggle('search-hl-active', i === idx));
    searchMatches.value[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function nextMatch() {
    if (!searchMatches.value.length) return;
    searchIdx.value = (searchIdx.value + 1) % searchMatches.value.length;
    scrollToSearchMatch(searchIdx.value);
}

function prevMatch() {
    if (!searchMatches.value.length) return;
    searchIdx.value = (searchIdx.value - 1 + searchMatches.value.length) % searchMatches.value.length;
    scrollToSearchMatch(searchIdx.value);
}

function clearSearchMarks() {
    document.querySelectorAll('.fullscreen-content .search-hl').forEach(m => m.replaceWith(...m.childNodes));
    document.querySelector('.fullscreen-content')?.normalize();
    searchMatches.value = [];
}

function closeSearch() {
    clearSearchMarks();
    searchOpen.value = false;
    searchQuery.value = '';
}

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

// ===== FEATURE 3: FOCUS MODE =====
const focusMode = ref(false);
let focusRafId = null;
let focusCurrentEl = null;

const FOCUS_SELECTOR = 'p, h1, h2, h3, h4, li, blockquote';

function onContentScrollFocus() {
    if (!focusMode.value) return;
    if (focusRafId) cancelAnimationFrame(focusRafId);
    focusRafId = requestAnimationFrame(updateFocusedElement);
}

function updateFocusedElement() {
    const content = document.querySelector('.fullscreen-content');
    if (!content) return;
    const els = Array.from(content.querySelectorAll(FOCUS_SELECTOR));
    const viewMid = content.getBoundingClientRect().top + content.clientHeight / 2;

    let closestIdx = 0, closestDist = Infinity;
    for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - viewMid);
        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    }

    // Activate a window of ±2 elements around the closest
    const activeSet = new Set(
        els.slice(Math.max(0, closestIdx - 2), closestIdx + 3)
    );

    for (const el of els) {
        el.classList.toggle('focus-active', activeSet.has(el));
    }
    focusCurrentEl = els[closestIdx] ?? null;
}

function toggleFocusMode() {
    focusMode.value = !focusMode.value;
    const content = document.querySelector('.fullscreen-content');
    if (!content) return;
    if (focusMode.value) {
        content.classList.add('focus-mode');
        updateFocusedElement();
    } else {
        content.classList.remove('focus-mode');
        content.querySelectorAll('.focus-active').forEach(el => el.classList.remove('focus-active'));
        focusCurrentEl = null;
    }
}

watch(isFullscreen, (val) => {
    if (!val) {
        if (focusMode.value) toggleFocusMode();
        closeSearch();
        readProgress.value = 0;
    }
});

// ===== FEATURE 4: NOTES =====
const userNotes = ref([]);
const noteTooltipVisible = ref(false);
const noteTooltipPos = ref({ x: 0, y: 0 });
const pendingSelection = ref(null);
const showNotesPanel = ref(false);

const noteTooltipStyle = computed(() => ({
    left: Math.min(noteTooltipPos.value.x, window.innerWidth - 220) + 'px',
    top: Math.max(noteTooltipPos.value.y - 52, 8) + 'px',
}));

function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < Math.min(str.length, 200); i++) h = (h * 33) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
}

const docNotesKey = computed(() => `md-notes-${simpleHash(fileContent.value)}`);

function loadNotes() {
    try { return JSON.parse(localStorage.getItem(docNotesKey.value) || '[]'); } catch { return []; }
}

function saveNotesStorage() {
    localStorage.setItem(docNotesKey.value, JSON.stringify(userNotes.value));
}

function applyNoteHighlights() {
    document.querySelectorAll('.fullscreen-content .user-note-hl').forEach(m => m.replaceWith(...m.childNodes));
    document.querySelector('.fullscreen-content')?.normalize();
    for (const note of userNotes.value) {
        const content = document.querySelector('.fullscreen-content');
        if (!content) break;
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.parentElement?.closest('.search-hl, .user-note-hl, .code-block-toolbar')) continue;
            const idx = node.textContent.indexOf(note.searchText);
            if (idx === -1) continue;
            try {
                const range = document.createRange();
                range.setStart(node, idx);
                range.setEnd(node, idx + note.searchText.length);
                const mark = document.createElement('mark');
                mark.className = 'user-note-hl';
                mark.dataset.noteId = note.id;
                range.surroundContents(mark);
            } catch {}
            break;
        }
    }
}

function onContentMouseUp(e) {
    if (e.target.closest('.code-block-toolbar, .citation-ref, .code-tree-btn')) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim().length < 3) {
        noteTooltipVisible.value = false;
        return;
    }
    const text = sel.toString().trim();
    pendingSelection.value = { text, searchText: text.slice(0, 80) };
    noteTooltipPos.value = { x: e.clientX, y: e.clientY };
    noteTooltipVisible.value = true;
}

function saveNote() {
    if (!pendingSelection.value) return;
    const note = { id: Date.now(), text: pendingSelection.value.text, searchText: pendingSelection.value.searchText };
    userNotes.value.push(note);
    saveNotesStorage();
    nextTick(applyNoteHighlights);
    noteTooltipVisible.value = false;
    pendingSelection.value = null;
    window.getSelection()?.removeAllRanges();
}

function deleteNote(id) {
    userNotes.value = userNotes.value.filter(n => n.id !== id);
    saveNotesStorage();
    nextTick(applyNoteHighlights);
}

function scrollToNote(note) {
    const mark = document.querySelector(`.fullscreen-content .user-note-hl[data-note-id="${note.id}"]`);
    mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function toggleNotesPanel() {
    showNotesPanel.value = !showNotesPanel.value;
    if (showNotesPanel.value) showSidebar.value = true;
}

// ===== CLAUDE AI INTEGRATION =====
const AI_KEY_STORAGE = 'claude-api-key';
const AI_MODE_STORAGE = 'claude-ai-mode';
const aiPanelOpen = ref(false);
const aiMode = ref(localStorage.getItem(AI_MODE_STORAGE) || 'tab'); // 'api' | 'tab'
const aiMessages = ref([]); // { id, role: 'user'|'assistant'|'context', content, streaming? }
const aiInputText = ref('');
const aiStreaming = ref(false);
const aiMessagesEl = ref(null);
const aiKeyModalOpen = ref(false);
const aiKeyInput = ref('');
const tabPendingContext = ref('');
let aiMsgId = 0;

watch(aiMode, (val) => localStorage.setItem(AI_MODE_STORAGE, val));

function getApiKey() {
    return localStorage.getItem(AI_KEY_STORAGE) || '';
}

function openApiKeyModal() {
    aiKeyInput.value = getApiKey();
    aiKeyModalOpen.value = true;
}

function confirmApiKey() {
    const key = aiKeyInput.value.trim();
    if (key) localStorage.setItem(AI_KEY_STORAGE, key);
    aiKeyModalOpen.value = false;
    aiKeyInput.value = '';
}

function toggleAiPanel() {
    aiPanelOpen.value = !aiPanelOpen.value;
}

function clearAiChat() {
    aiMessages.value = [];
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scrollAiToBottom() {
    nextTick(() => {
        if (aiMessagesEl.value) aiMessagesEl.value.scrollTop = aiMessagesEl.value.scrollHeight;
    });
}

function openAiWithSelection() {
    const sel = pendingSelection.value;
    noteTooltipVisible.value = false;
    aiPanelOpen.value = true;
    if (sel && sel.text) {
        if (aiMode.value === 'api') {
            aiMessages.value.push({ id: aiMsgId++, role: 'context', content: sel.text.slice(0, 400) });
            aiInputText.value = '';
            scrollAiToBottom();
        } else {
            tabPendingContext.value = sel.text;
            aiInputText.value = '';
        }
    }
}

function openInTab() {
    const question = aiInputText.value.trim();
    let text = '';
    if (tabPendingContext.value) {
        text += `Контекст:\n"${tabPendingContext.value}"\n\n`;
    }
    if (question) text += question;
    else if (tabPendingContext.value) text += 'Объясни этот фрагмент текста.';

    navigator.clipboard.writeText(text).catch(() => {});
    window.open('https://claude.ai/new', '_blank', 'noopener');
    tabPendingContext.value = '';
    aiInputText.value = '';
}

async function sendAiMessage() {
    const question = aiInputText.value.trim();
    if (!question || aiStreaming.value) return;

    const key = getApiKey();
    if (!key) { openApiKeyModal(); return; }

    // Find last context block to inject into prompt
    const lastCtx = [...aiMessages.value].reverse().find(m => m.role === 'context');
    let userContent = question;
    if (lastCtx) userContent = `Контекст из текста:\n"${lastCtx.content}"\n\nВопрос: ${question}`;

    aiMessages.value.push({ id: aiMsgId++, role: 'user', content: question });
    aiInputText.value = '';
    scrollAiToBottom();

    // Build messages for API (only user/assistant, no context bubbles)
    // Replace the last user message content with the context-enriched version
    const filtered = aiMessages.value.filter(m => m.role === 'user' || m.role === 'assistant');
    const apiMessages = filtered.map((m, i) =>
        (m.role === 'user' && i === filtered.length - 1)
            ? { role: 'user', content: userContent }
            : { role: m.role, content: m.content }
    );

    const assistantMsg = { id: aiMsgId++, role: 'assistant', content: '', streaming: true };
    aiMessages.value.push(assistantMsg);
    aiStreaming.value = true;
    scrollAiToBottom();

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: 'claude-opus-4-6',
                max_tokens: 2048,
                stream: true,
                system: 'Ты помощник для чтения и понимания текстов. Отвечай на русском, если вопрос на русском. Форматируй ответы с markdown когда уместно.',
                messages: apiMessages,
            }),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: { message: resp.statusText } }));
            assistantMsg.content = `Ошибка: ${err?.error?.message || resp.statusText}`;
            assistantMsg.streaming = false;
            return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop(); // keep incomplete line
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') break;
                try {
                    const evt = JSON.parse(data);
                    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                        assistantMsg.content += evt.delta.text;
                        scrollAiToBottom();
                    }
                } catch {}
            }
        }
    } catch (err) {
        assistantMsg.content = `Ошибка соединения: ${err.message}`;
    } finally {
        assistantMsg.streaming = false;
        aiStreaming.value = false;
        scrollAiToBottom();
    }
}

watch(docNotesKey, () => {
    userNotes.value = loadNotes();
    nextTick(applyNoteHighlights);
}, { immediate: true });

watch(fullscreenHtml, () => {
    nextTick(() => {
        applyNoteHighlights();
        if (searchOpen.value && searchQuery.value) runSearch();
        if (focusMode.value) updateFocusedElement();
    });
});

function onContentClick(e) {
    // Handle tree visualize button
    const treeBtn = e.target.closest('.code-tree-btn');
    if (treeBtn) {
        const idx = parseInt(treeBtn.dataset.codeIdx, 10);
        openTreeModal(codeBlocks[idx] ?? '');
        return;
    }

    // Handle copy button
    const copyBtn = e.target.closest('.code-copy-btn');
    if (copyBtn) {
        const idx = parseInt(copyBtn.dataset.codeIdx, 10);
        const code = codeBlocks[idx] ?? '';
        navigator.clipboard.writeText(code).then(() => {
            const prev = copyBtn.textContent;
            copyBtn.textContent = 'Скопировано!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.textContent = prev;
                copyBtn.classList.remove('copied');
            }, 1500);
        });
        return;
    }

    // Handle citation ref
    const ref = e.target.closest('.citation-ref');
    if (!ref) { activeCitation.value = null; return; }
    const num = ref.dataset.ref;
    if (citationMap.value[num]) {
        activeCitation.value = { num, text: citationMap.value[num] };
        citationPos.value = { x: e.clientX, y: e.clientY };
    }
}

// ===== SVG TREE VISUALIZER =====
const NODE_W = 200;
const NODE_H = 36;
const V_GAP = 16;
const INDENT = 230;

let _nodeId = 0;

function splitComment(str) {
    const idx = str.indexOf('#');
    if (idx === -1) return [str.trim(), ''];
    return [str.slice(0, idx).trim(), str.slice(idx + 1).trim()];
}

function makeNode(name, comment, parent) {
    const [n, c] = splitComment(name);
    return {
        id: _nodeId++,
        name: n.length > 24 ? n.slice(0, 22) + '…' : n,
        fullName: n,
        comment: comment || c,
        children: [],
        collapsed: false,
        isFolder: n.endsWith('/'),
        parent,
        x: 0, y: 0,
    };
}

function parseAsciiTree(text) {
    _nodeId = 0;
    const lines = text.split('\n').filter(l => l.trim());
    const root = makeNode('root', '', null);
    root.isFolder = true;
    const stack = [{ node: root, depth: -1 }];

    for (const line of lines) {
        // Match lines with tree connector: ├── or └──
        const m = line.match(/^((?:[│|]\s{0,3}|\s{4})*)([├└╠╚](?:──|--)\s*)(.+)$/u);
        if (!m) {
            // Root-level line (no connector)
            const [n, c] = splitComment(line.trim());
            root.name = n.length > 24 ? n.slice(0, 22) + '…' : n;
            root.fullName = n;
            root.comment = c;
            root.isFolder = n.endsWith('/');
            continue;
        }
        const prefix = m[1];
        const rawName = m[3].trim();
        // Depth: count 4-char groups in prefix
        const depth = prefix.length > 0 ? Math.round(prefix.length / 4) : 0;
        const node = makeNode(rawName, '', null);

        while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
        const parent = stack[stack.length - 1].node;
        node.parent = parent;
        parent.children.push(node);
        stack.push({ node, depth });
    }
    return root;
}

function layoutTree(node, depth, yStart) {
    node.x = depth * INDENT + 20;
    node.y = yStart;
    if (node.collapsed || node.children.length === 0) return yStart + NODE_H + V_GAP;
    let y = yStart + NODE_H + V_GAP;
    for (const child of node.children) y = layoutTree(child, depth + 1, y);
    return y;
}

function flattenVisible(node, result = []) {
    result.push(node);
    if (!node.collapsed) for (const c of node.children) flattenVisible(c, result);
    return result;
}

// ---- Reactive state ----
const treeModalOpen = ref(false);
const treeData = shallowRef(null);
const treePan = ref({ x: 0, y: 0 });
const treeScale = ref(1);
const treeIsPanning = ref(false);
const treeSvgSize = ref({ w: 800, h: 600 });

const treeTransform = computed(() =>
    `translate(${treePan.value.x}px, ${treePan.value.y}px) scale(${treeScale.value})`
);

const treeRenderData = computed(() => {
    const tree = treeData.value;
    if (!tree) return { nodes: [], edges: [] };
    const nodes = flattenVisible(tree);
    const edges = [];
    for (const node of nodes) {
        if (!node.parent) continue;
        const p = node.parent;
        edges.push({ id: node.id, x1: p.x + NODE_W, y1: p.y + NODE_H / 2, x2: node.x, y2: node.y + NODE_H / 2 });
    }
    return { nodes, edges };
});

function openTreeModal(code) {
    const tree = parseAsciiTree(code);
    layoutTree(tree, 0, 20);
    const nodes = flattenVisible(tree);
    const w = Math.max(...nodes.map(n => n.x + NODE_W)) + 60;
    const h = Math.max(...nodes.map(n => n.y + NODE_H)) + 40;
    treeData.value = tree;
    treeSvgSize.value = { w, h };
    treePan.value = { x: 0, y: 0 };
    treeScale.value = 1;
    treeModalOpen.value = true;
}

function toggleTreeNode(node) {
    if (node.children.length === 0) return;
    node.collapsed = !node.collapsed;
    layoutTree(treeData.value, 0, 20);
    const nodes = flattenVisible(treeData.value);
    treeSvgSize.value = {
        w: Math.max(...nodes.map(n => n.x + NODE_W)) + 60,
        h: Math.max(...nodes.map(n => n.y + NODE_H)) + 40,
    };
    triggerRef(treeData);
}

function resetTreeView() {
    treePan.value = { x: 0, y: 0 };
    treeScale.value = 1;
}

function onTreeWheel(e) {
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    treeScale.value = Math.max(0.15, Math.min(5, treeScale.value * factor));
}

function onTreePanStart(e) {
    if (e.button !== 0) return;
    treeIsPanning.value = true;
    const startX = e.clientX, startY = e.clientY;
    const startPanX = treePan.value.x, startPanY = treePan.value.y;
    function onMove(ev) {
        treePan.value = { x: startPanX + ev.clientX - startX, y: startPanY + ev.clientY - startY };
    }
    function onUp() {
        treeIsPanning.value = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function onDrop(event) {
    isDragging.value = false;
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        fileContent.value = e.target.result;
    };
    reader.readAsText(file);
}

// === Storage ===
function extractTitle(md) {
    const match = md.match(/^#\s+(.+)/m);
    if (match) return match[1].substring(0, 50);
    const firstLine = md.trim().split('\n')[0];
    return firstLine.substring(0, 50) || 'Без названия';
}

function loadAllDocs() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveToStorage() {
    if (!fileContent.value.trim()) return;

    const doc = {
        id: Date.now(),
        title: extractTitle(fileContent.value),
        content: fileContent.value,
        date: new Date().toISOString(),
    };

    savedDocs.value.unshift(doc);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedDocs.value));

    saveMessage.value = 'Сохранено!';
    setTimeout(() => (saveMessage.value = ''), 2000);
}

function loadDoc(doc) {
    fileContent.value = doc.content;
    showSaved.value = false;
}

function deleteDoc(index) {
    savedDocs.value.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedDocs.value));
}

function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// === Download ===
function stripCodeToolbars(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('.code-block-toolbar').forEach(el => el.remove());
    div.querySelectorAll('.code-block-wrapper').forEach(el => {
        el.replaceWith(...el.childNodes);
    });
    return div.innerHTML;
}

function downloadPdf() {
    if (!fileContent.value) return;

    const styles = darkMode.value ? darkStyles : lightStyles;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    document.body.appendChild(iframe);

    iframe.contentDocument.write(`
        <html>
        <head><style>${styles} ${hljsThemeCss}
            @media print {
                body { margin: 0; padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
        </style></head>
        <body>${stripCodeToolbars(renderedHtml.value)}</body>
        </html>
    `);
    iframe.contentDocument.close();

    iframe.onload = () => {
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
    };
}
</script>

<style scoped>
*,
*::before,
*::after {
    box-sizing: border-box;
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

.highlight-item:hover {
    opacity: 0.75;
}

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

.fullscreen.dark .highlight-text {
    color: #cdd6f4;
}

.highlight-quote {
    background: #f0f4ff;
    border-left: 2px solid #89b4fa;
}

.highlight-bold {
    background: #fdf4ff;
    border-left: 2px solid #cba6f7;
}

.highlight-pattern {
    background: #fff7ed;
    border-left: 2px solid #fab387;
}

.fullscreen.dark .highlight-quote {
    background: #1e2640;
    border-left-color: #89b4fa;
}

.fullscreen.dark .highlight-bold {
    background: #251e30;
    border-left-color: #cba6f7;
}

.fullscreen.dark .highlight-pattern {
    background: #28200f;
    border-left-color: #fab387;
}

.sidebar-empty {
    font-size: 13px;
    color: #94a3b8;
    text-align: center;
    padding: 20px 0;
}

.fullscreen-toolbar button.active {
    background: #1d4ed8;
}

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

.fullscreen-toolbar button:hover {
    background: #1d4ed8;
}

.fullscreen-content {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 15px;
    line-height: 1.7;
}

/* Fullscreen light content styles */
.fullscreen-content :deep(h1) {
    font-size: 28px;
    margin: 0 0 16px;
    color: #0f172a;
    font-weight: 700;
}

.fullscreen-content :deep(h2) {
    font-size: 22px;
    margin: 24px 0 12px;
    color: #1e3a5f;
    font-weight: 600;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px;
}

.fullscreen-content :deep(h3) {
    font-size: 18px;
    margin: 18px 0 10px;
    color: #065f46;
    font-weight: 600;
}

.fullscreen-content :deep(h4) {
    font-size: 16px;
    margin: 14px 0 8px;
    color: #4338ca;
    font-weight: 600;
}

.fullscreen-content :deep(p) {
    margin: 0 0 10px;
    color: #1e293b;
}

.fullscreen-content :deep(strong) {
    color: #9d174d;
    font-weight: 700;
}

.fullscreen-content :deep(em) {
    color: #c2410c;
    font-style: italic;
}

.fullscreen-content :deep(code) {
    background: #f1f5f9;
    color: #be185d;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    border: 1px solid #e2e8f0;
}

.fullscreen-content :deep(pre) {
    border-radius: 8px;
    overflow-x: auto;
    margin: 0 0 14px;
}

.fullscreen-content :deep(.code-block-wrapper) {
    margin: 0 0 14px;
}

.fullscreen-content :deep(.code-block-wrapper) pre {
    margin: 0;
    border-radius: 0 0 8px 8px;
}

.fullscreen-content :deep(pre code) {
    display: block;
    padding: 16px;
    background: #0d1117;
    color: #e6edf3;
    font-size: 13px;
    line-height: 1.5;
    border-radius: 8px;
}

.fullscreen-content :deep(.hljs) {
    background: #0d1117;
    color: #e6edf3;
}

.fullscreen-content :deep(.hljs-keyword) {
    color: #ff7b72;
}

.fullscreen-content :deep(.hljs-string) {
    color: #a5d6ff;
}

.fullscreen-content :deep(.hljs-number) {
    color: #79c0ff;
}

.fullscreen-content :deep(.hljs-comment) {
    color: #8b949e;
    font-style: italic;
}

.fullscreen-content :deep(.hljs-function),
.fullscreen-content :deep(.hljs-title) {
    color: #d2a8ff;
}

.fullscreen-content :deep(.hljs-built_in),
.fullscreen-content :deep(.hljs-type) {
    color: #ffa657;
}

.fullscreen-content :deep(.hljs-attr),
.fullscreen-content :deep(.hljs-property) {
    color: #79c0ff;
}

.fullscreen-content :deep(.hljs-variable) {
    color: #ffa657;
}

.fullscreen-content :deep(.hljs-operator) {
    color: #ff7b72;
}

.fullscreen-content :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 14px;
    font-size: 14px;
}

.fullscreen-content :deep(thead th) {
    background: #1e293b;
    color: #fff;
    font-weight: 600;
    text-align: left;
    padding: 10px 14px;
}

.fullscreen-content :deep(thead th:first-child) {
    border-radius: 6px 0 0 0;
}

.fullscreen-content :deep(thead th:last-child) {
    border-radius: 0 6px 0 0;
}

.fullscreen-content :deep(tbody tr) {
    border-bottom: 1px solid #e5e7eb;
}

.fullscreen-content :deep(tbody tr:nth-child(even)) {
    background: #f8fafc;
}

.fullscreen-content :deep(tbody td) {
    padding: 10px 14px;
    color: #1e293b;
}

.fullscreen-content :deep(tbody td strong) {
    color: #9d174d;
}

.fullscreen-content :deep(a) {
    color: #2563eb;
    text-decoration: underline;
}

.fullscreen-content :deep(blockquote) {
    border-left: 3px solid #6366f1;
    margin: 0 0 10px;
    padding: 8px 16px;
    color: #475569;
    background: #f8fafc;
    border-radius: 0 6px 6px 0;
}

.fullscreen-content :deep(ul) {
    margin: 0 0 10px;
    padding-left: 24px;
    list-style-type: disc;
    color: #1e293b;
}

.fullscreen-content :deep(ol) {
    margin: 0 0 10px;
    padding-left: 24px;
    list-style-type: decimal;
    color: #1e293b;
}

.fullscreen-content :deep(li) {
    margin: 0 0 4px;
    display: list-item;
    color: #1e293b;
}

.fullscreen-content :deep(hr) {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 20px 0;
}

/* placeholder — flash animation moved to non-scoped style block below */

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

.citation-popup-num {
    font-weight: 700;
    color: #2563eb;
    font-size: 14px;
}

.fullscreen.dark .citation-popup-num {
    color: #89b4fa;
}

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

.citation-popup-close:hover {
    background: #f1f5f9;
    color: #475569;
}

.fullscreen.dark .citation-popup-close:hover {
    background: #313244;
    color: #cdd6f4;
}

.citation-popup-body :deep(p) {
    margin: 0;
}

.citation-popup-body :deep(a) {
    color: #2563eb;
    word-break: break-all;
}

.fullscreen.dark .citation-popup-body :deep(a) {
    color: #89b4fa;
}

/* Fullscreen dark content overrides */
.fullscreen.dark .fullscreen-content {
    color: #cdd6f4;
}

.fullscreen.dark .fullscreen-content :deep(p) {
    color: #cdd6f4;
}

.fullscreen.dark .fullscreen-content :deep(li) {
    color: #cdd6f4;
}

.fullscreen.dark .fullscreen-content :deep(ul),
.fullscreen.dark .fullscreen-content :deep(ol) {
    color: #cdd6f4;
}

.fullscreen.dark .fullscreen-content :deep(tbody td) {
    color: #cdd6f4;
}

.fullscreen.dark .fullscreen-content :deep(h1) {
    color: #cba6f7;
    font-weight: 700;
}

.fullscreen.dark .fullscreen-content :deep(h2) {
    color: #89b4fa;
    font-weight: 600;
    border-bottom: 1px solid #313244;
    padding-bottom: 6px;
}

.fullscreen.dark .fullscreen-content :deep(h3) {
    color: #94e2d5;
    font-weight: 600;
}

.fullscreen.dark .fullscreen-content :deep(h4) {
    color: #a6e3a1;
    font-weight: 600;
}

.fullscreen.dark .fullscreen-content :deep(strong) {
    color: #f5c2e7;
    font-weight: 700;
}

.fullscreen.dark .fullscreen-content :deep(em) {
    color: #fab387;
}

.fullscreen.dark .fullscreen-content :deep(code) {
    background: #181825;
    color: #f38ba8;
    border: 1px solid #313244;
}

.fullscreen.dark .fullscreen-content :deep(pre) {
    border: 1px solid #313244;
}

.fullscreen.dark .fullscreen-content :deep(pre code) {
    background: #181825;
    color: #cdd6f4;
    border: none;
}

.fullscreen.dark .fullscreen-content :deep(table) {
    border: 1px solid #313244;
}

.fullscreen.dark .fullscreen-content :deep(thead th) {
    background: #181825;
    color: #cba6f7;
    font-weight: 700;
    border-bottom: 2px solid #45475a;
}

.fullscreen.dark .fullscreen-content :deep(tbody tr) {
    border-bottom: 1px solid #313244;
}

.fullscreen.dark .fullscreen-content :deep(tbody tr:nth-child(even)) {
    background: #181825;
}

.fullscreen.dark .fullscreen-content :deep(tbody td strong) {
    color: #f5c2e7;
}

.fullscreen.dark .fullscreen-content :deep(blockquote) {
    border-left-color: #cba6f7;
    color: #a6adc8;
    background: #181825;
    border-radius: 0 6px 6px 0;
    padding: 8px 16px;
}

.fullscreen.dark .fullscreen-content :deep(hr) {
    border-top-color: #313244;
}

.fullscreen.dark .fullscreen-content :deep(a) {
    color: #89b4fa;
}

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

.fullscreen.dark .read-progress-bar {
    background: linear-gradient(90deg, #89b4fa, #cba6f7);
}

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

.search-input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px #2563eb22;
}

.fullscreen.dark .search-input {
    background: #181825;
    border-color: #45475a;
    color: #cdd6f4;
}

.fullscreen.dark .search-input:focus {
    border-color: #89b4fa;
    box-shadow: 0 0 0 2px #89b4fa22;
}

.search-counter {
    font-size: 12px;
    color: #64748b;
    white-space: nowrap;
    min-width: 70px;
}

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

.fullscreen.dark .search-nav-btn {
    border-color: #45475a;
    color: #cdd6f4;
}

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

.fullscreen.dark .note-item {
    background: #252010;
    border-left-color: #d97706;
}

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

.tree-modal-title {
    color: #cba6f7;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.tree-modal-controls {
    display: flex;
    gap: 8px;
}

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

.tree-modal-btn:hover {
    background: #45475a;
}

.tree-modal-close-btn {
    border-color: #f38ba855;
    color: #f38ba8;
}

.tree-modal-close-btn:hover {
    background: #3b1f2b;
}

.tree-viewport {
    flex: 1;
    overflow: hidden;
    cursor: grab;
    user-select: none;
    position: relative;
    background: radial-gradient(ellipse at center, #1a1a2e 0%, #11111b 100%);
}

.tree-viewport.panning {
    cursor: grabbing;
}

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

.header button:hover {
    background: #1d4ed8;
}

.save-group {
    display: flex;
    gap: 4px;
}

.save-group button.active {
    background: #1d4ed8;
}

.save-toast {
    color: #4ade80;
    font-size: 13px;
    font-weight: 600;
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(-4px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
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

.saved-empty {
    color: #666;
    text-align: center;
    padding: 20px;
    font-size: 13px;
}

.saved-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
}

.saved-item:hover {
    background: #2a2a2a;
}

.saved-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.saved-title {
    color: #e6edf3;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.saved-date {
    color: #666;
    font-size: 11px;
}

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

.saved-delete:hover {
    color: #f87171;
    background: #331111 !important;
}

/* ===== EDITOR ===== */
.inner-menu {
    width: 90%;
    height: 90%;
    border-radius: 50px;
    background-color: rgba(85 85 85 / 0.44);
    display: flex;
    overflow: hidden;
}

.split {
    width: 50px;
}

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

.pdf-container :deep(h1) {
    font-size: 24px;
    margin: 0 0 12px;
}

.pdf-container :deep(h2) {
    font-size: 20px;
    margin: 16px 0 10px;
}

.pdf-container :deep(h3) {
    font-size: 17px;
    margin: 14px 0 8px;
}

.pdf-container :deep(h4) {
    font-size: 15px;
    margin: 12px 0 6px;
}

.pdf-container :deep(p) {
    margin: 0 0 8px;
}

.pdf-container :deep(code) {
    background: #f0f0f0;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.85em;
    font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
}

.pdf-container :deep(pre) {
    border-radius: 8px;
    overflow-x: auto;
    margin: 0 0 12px;
}

.pdf-container :deep(pre code) {
    display: block;
    padding: 16px;
    background: #1e1e2e;
    color: #cdd6f4;
    font-size: 13px;
    line-height: 1.5;
    border-radius: 8px;
}

.pdf-container :deep(.hljs) {
    background: #0d1117;
    color: #e6edf3;
}

.pdf-container :deep(.hljs-keyword) {
    color: #ff7b72;
}

.pdf-container :deep(.hljs-string) {
    color: #a5d6ff;
}

.pdf-container :deep(.hljs-number) {
    color: #79c0ff;
}

.pdf-container :deep(.hljs-comment) {
    color: #8b949e;
    font-style: italic;
}

.pdf-container :deep(.hljs-function),
.pdf-container :deep(.hljs-title) {
    color: #d2a8ff;
}

.pdf-container :deep(.hljs-built_in),
.pdf-container :deep(.hljs-type) {
    color: #ffa657;
}

.pdf-container :deep(.hljs-attr),
.pdf-container :deep(.hljs-property) {
    color: #79c0ff;
}

.pdf-container :deep(.hljs-variable) {
    color: #ffa657;
}

.pdf-container :deep(.hljs-params) {
    color: #e6edf3;
}

.pdf-container :deep(.hljs-punctuation) {
    color: #8b949e;
}

.pdf-container :deep(.hljs-operator) {
    color: #ff7b72;
}

.pdf-container :deep(.hljs-literal) {
    color: #79c0ff;
}

.pdf-container :deep(.hljs-meta) {
    color: #ffa657;
}

.pdf-container :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 12px;
    font-size: 13px;
}

.pdf-container :deep(thead th) {
    background: #1e293b;
    color: #fff;
    font-weight: 600;
    text-align: left;
    padding: 10px 12px;
}

.pdf-container :deep(thead th:first-child) {
    border-radius: 6px 0 0 0;
}

.pdf-container :deep(thead th:last-child) {
    border-radius: 0 6px 0 0;
}

.pdf-container :deep(tbody tr) {
    border-bottom: 1px solid #e5e7eb;
}

.pdf-container :deep(tbody tr:nth-child(even)) {
    background: #f8fafc;
}

.pdf-container :deep(tbody tr:hover) {
    background: #f1f5f9;
}

.pdf-container :deep(tbody td) {
    padding: 8px 12px;
}

.pdf-container :deep(tbody td strong) {
    color: #1e40af;
}

.pdf-container :deep(blockquote) {
    border-left: 3px solid #ccc;
    margin: 0 0 8px;
    padding-left: 16px;
    color: #555;
}

.pdf-container :deep(ul) {
    margin: 0 0 8px;
    padding-left: 24px;
    list-style-type: disc;
}

.pdf-container :deep(ol) {
    margin: 0 0 8px;
    padding-left: 24px;
    list-style-type: decimal;
}

.pdf-container :deep(li) {
    margin: 0 0 4px;
    display: list-item;
}

.pdf-container :deep(hr) {
    border: none;
    border-top: 1px solid #ccc;
    margin: 16px 0;
}

.pdf-container :deep(a) {
    color: #2563eb;
}

/* Dark theme for editor preview */
.dark .pdf-container {
    color: #cdd6f4;
    background: #1e1e2e;
}

.dark .pdf-container :deep(h1) {
    color: #cba6f7;
    font-weight: 700;
}

.dark .pdf-container :deep(h2) {
    color: #89b4fa;
    font-weight: 600;
    border-bottom: 1px solid #313244;
    padding-bottom: 6px;
}

.dark .pdf-container :deep(h3) {
    color: #94e2d5;
    font-weight: 600;
}

.dark .pdf-container :deep(h4) {
    color: #a6e3a1;
    font-weight: 600;
}

.dark .pdf-container :deep(strong) {
    color: #f5c2e7;
    font-weight: 700;
}

.dark .pdf-container :deep(em) {
    color: #fab387;
}

.dark .pdf-container :deep(code) {
    background: #181825;
    color: #f38ba8;
    border: 1px solid #313244;
}

.dark .pdf-container :deep(pre) {
    border: 1px solid #313244;
}

.dark .pdf-container :deep(pre code) {
    background: #181825;
    color: #cdd6f4;
    border: none;
}

.dark .pdf-container :deep(table) {
    border: 1px solid #313244;
}

.dark .pdf-container :deep(thead th) {
    background: #181825;
    color: #cba6f7;
    font-weight: 700;
    border-bottom: 2px solid #45475a;
}

.dark .pdf-container :deep(tbody tr) {
    border-bottom: 1px solid #313244;
}

.dark .pdf-container :deep(tbody tr:nth-child(even)) {
    background: #181825;
}

.dark .pdf-container :deep(tbody tr:hover) {
    background: #24273a;
}

.dark .pdf-container :deep(tbody td strong) {
    color: #f5c2e7;
}

.dark .pdf-container :deep(blockquote) {
    border-left-color: #cba6f7;
    color: #a6adc8;
    background: #181825;
    border-radius: 0 6px 6px 0;
    padding: 8px 16px;
}

.dark .pdf-container :deep(hr) {
    border-top-color: #313244;
}

.dark .pdf-container :deep(a) {
    color: #89b4fa;
}

.part {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background-color: rgb(255 255 255);
    transition: background-color 0.3s;
}

.part.dark {
    background-color: #1e1e2e;
}

.part textarea {
    width: 100%;
    height: 100%;
    padding: 20px;
    color: black;
}
</style>

<style>
/* Code block copy button */
.code-block-wrapper {
    position: relative;
    margin: 0 0 14px;
}

.code-block-wrapper pre {
    margin: 0;
}

.code-block-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #161b22;
    padding: 6px 14px;
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid #30363d;
}

.code-lang {
    font-size: 11px;
    font-weight: 600;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: 'Fira Code', 'JetBrains Mono', monospace;
}

.code-copy-btn {
    background: none;
    border: 1px solid #30363d;
    color: #8b949e;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: system-ui, sans-serif;
    margin-left: auto;
}

.code-copy-btn:hover {
    background: #21262d;
    color: #e6edf3;
    border-color: #8b949e;
}

.code-copy-btn.copied {
    color: #3fb950;
    border-color: #3fb950;
}

.code-block-wrapper pre code {
    border-radius: 0 0 8px 8px !important;
}

/* Citation ref styling inside v-html */
.citation-ref {
    display: inline-block;
    color: #2563eb;
    font-size: 0.8em;
    font-weight: 600;
    cursor: pointer;
    vertical-align: super;
    padding: 0 2px;
    border-radius: 3px;
    transition: background 0.15s;
    user-select: none;
}

.citation-ref:hover {
    background: #dbeafe;
    color: #1d4ed8;
}

.fullscreen.dark .citation-ref {
    color: #89b4fa;
}

.fullscreen.dark .citation-ref:hover {
    background: #1e2640;
    color: #bfdbfe;
}

/* Non-scoped: flash highlight for dynamically added class inside v-html */
@keyframes highlight-flash {
    0%   { background-color: #fef08a; }
    100% { background-color: transparent; }
}

.highlight-flash {
    animation: highlight-flash 1.2s ease-out;
    border-radius: 3px;
}

/* ===== Search highlights ===== */
.search-hl {
    background: #fef08a;
    color: #0f172a;
    border-radius: 2px;
}

.search-hl-active {
    background: #f59e0b;
    color: #0f172a;
    outline: 2px solid #f59e0b;
    border-radius: 2px;
}

/* ===== Focus mode ===== */
.fullscreen-content.focus-mode p,
.fullscreen-content.focus-mode h1,
.fullscreen-content.focus-mode h2,
.fullscreen-content.focus-mode h3,
.fullscreen-content.focus-mode h4,
.fullscreen-content.focus-mode li,
.fullscreen-content.focus-mode blockquote {
    opacity: 0.12;
    transition: opacity 0.6s ease;
}

.fullscreen-content.focus-mode .focus-active {
    opacity: 1 !important;
    transition: opacity 0.6s ease;
}

/* ===== User note highlights ===== */
.user-note-hl {
    background: #fde68a;
    color: inherit;
    border-radius: 2px;
    cursor: pointer;
    border-bottom: 2px solid #d97706;
}

.fullscreen.dark .user-note-hl {
    background: #3d2a00;
    color: #fef3c7;
    border-bottom-color: #f59e0b;
}

/* ===== Claude AI Panel ===== */
.note-tooltip-ai-btn {
    background: #6d28d9 !important;
}

.note-tooltip-ai-btn:hover {
    background: #5b21b6 !important;
}

.ai-panel {
    position: fixed;
    right: 0;
    bottom: 0;
    top: 52px; /* below toolbar */
    width: 380px;
    z-index: 2000;
    background: #fff;
    border-left: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px rgba(0,0,0,0.12);
    font-size: 13px;
}

.ai-panel.dark {
    background: #181825;
    border-left-color: #313244;
    color: #cdd6f4;
}

.ai-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
}

.ai-panel.dark .ai-panel-header {
    border-bottom-color: #313244;
}

.ai-panel-title {
    font-weight: 700;
    font-size: 13px;
    color: #6d28d9;
}

.ai-panel.dark .ai-panel-title {
    color: #cba6f7;
}

.ai-panel-actions {
    display: flex;
    gap: 4px;
    align-items: center;
}

/* Mode toggle */
.ai-mode-toggle {
    display: flex;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    margin-right: 4px;
}

.ai-panel.dark .ai-mode-toggle {
    border-color: #45475a;
}

.ai-mode-btn {
    padding: 3px 9px;
    border: none;
    background: none;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    color: #94a3b8;
    transition: background 0.12s, color 0.12s;
    font-family: inherit;
}

.ai-mode-btn.active {
    background: #7c3aed;
    color: #fff;
}

.ai-mode-btn:not(.active):hover {
    background: #f1f5f9;
    color: #475569;
}

.ai-panel.dark .ai-mode-btn:not(.active):hover {
    background: #313244;
    color: #cdd6f4;
}

.ai-panel-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 3px 7px;
    border-radius: 4px;
    font-size: 13px;
    color: #64748b;
    transition: background 0.12s;
}

.ai-panel-btn:hover {
    background: #f1f5f9;
    color: #1e293b;
}

.ai-panel.dark .ai-panel-btn {
    color: #a6adc8;
}

.ai-panel.dark .ai-panel-btn:hover {
    background: #313244;
    color: #cdd6f4;
}

.ai-panel-close {
    color: #94a3b8;
}

.ai-panel-close:hover {
    color: #f87171 !important;
}

.ai-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.ai-empty {
    color: #94a3b8;
    text-align: center;
    padding: 24px 12px;
    font-size: 12px;
    line-height: 1.5;
}

.ai-message-user .ai-message-bubble {
    background: #eff6ff;
    color: #1e3a5f;
    border-radius: 12px 12px 4px 12px;
    padding: 8px 12px;
    align-self: flex-end;
    max-width: 90%;
    margin-left: auto;
    word-break: break-word;
}

.ai-panel.dark .ai-message-user .ai-message-bubble {
    background: #1e2640;
    color: #bfdbfe;
}

.ai-message-assistant .ai-message-bubble {
    background: #f8fafc;
    color: #1e293b;
    border-radius: 12px 12px 12px 4px;
    padding: 8px 12px;
    max-width: 98%;
    word-break: break-word;
    border: 1px solid #e2e8f0;
}

.ai-panel.dark .ai-message-assistant .ai-message-bubble {
    background: #1e1e2e;
    color: #cdd6f4;
    border-color: #313244;
}

.ai-message-assistant .ai-message-bubble p { margin: 0 0 6px; }
.ai-message-assistant .ai-message-bubble p:last-child { margin: 0; }
.ai-message-assistant .ai-message-bubble ul,
.ai-message-assistant .ai-message-bubble ol { margin: 0 0 6px; padding-left: 20px; }
.ai-message-assistant .ai-message-bubble li { margin: 0 0 2px; display: list-item; }
.ai-message-assistant .ai-message-bubble code {
    background: #0d1117; color: #e6edf3; padding: 1px 5px; border-radius: 3px; font-size: 0.85em;
}
.ai-message-assistant .ai-message-bubble pre {
    background: #0d1117; color: #e6edf3; padding: 10px 12px; border-radius: 6px; overflow-x: auto; margin: 6px 0;
}
.ai-message-assistant .ai-message-bubble pre code { background: none; padding: 0; }
.ai-message-assistant .ai-message-bubble strong { color: #9d174d; font-weight: 700; }
.ai-panel.dark .ai-message-assistant .ai-message-bubble strong { color: #f5c2e7; }
.ai-message-assistant .ai-message-bubble h1,
.ai-message-assistant .ai-message-bubble h2,
.ai-message-assistant .ai-message-bubble h3 { margin: 8px 0 4px; font-size: 1em; font-weight: 700; }

.ai-streaming-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #6d28d9;
    margin: 4px 0 0 4px;
    animation: ai-blink 0.8s infinite;
}

.ai-panel.dark .ai-streaming-dot { background: #cba6f7; }

@keyframes ai-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
}

/* ===== Tab mode ===== */
.ai-tab-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 20px;
    gap: 16px;
    overflow-y: auto;
}

.ai-tab-icon { font-size: 40px; line-height: 1; }

.ai-tab-desc {
    font-size: 13px;
    color: #475569;
    text-align: center;
    line-height: 1.6;
}
.ai-panel.dark .ai-tab-desc { color: #a6adc8; }
.ai-tab-desc b { color: #1e293b; }
.ai-panel.dark .ai-tab-desc b { color: #cdd6f4; }

.ai-tab-context-preview {
    width: 100%;
    background: #faf5ff;
    border: 1px solid #e9d5ff;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
}
.ai-panel.dark .ai-tab-context-preview {
    background: #1e1030;
    border-color: #6d28d9;
}

.ai-tab-context-label {
    font-weight: 700;
    color: #7c3aed;
    margin-bottom: 4px;
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.ai-panel.dark .ai-tab-context-label { color: #cba6f7; }

.ai-tab-context-text {
    color: #374151;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.ai-panel.dark .ai-tab-context-text { color: #e9d5ff; }

.ai-tab-input-group {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.ai-tab-input { width: 100% !important; }

.ai-tab-open-btn {
    padding: 10px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, #7c3aed, #2563eb);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.12s;
    text-align: center;
}
.ai-tab-open-btn:hover { opacity: 0.88; }

.ai-tab-hint {
    font-size: 11px;
    color: #94a3b8;
    text-align: center;
}
.ai-panel.dark .ai-tab-hint { color: #585b70; }

.ai-context-block {
    background: #faf5ff;
    border-left: 3px solid #a855f7;
    padding: 6px 10px;
    border-radius: 0 6px 6px 0;
    font-size: 12px;
    color: #581c87;
}

.ai-panel.dark .ai-context-block {
    background: #1e1030;
    border-left-color: #cba6f7;
    color: #e9d5ff;
}

.ai-context-label {
    font-weight: 700;
    margin-right: 4px;
}

.ai-context-text {
    opacity: 0.8;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.ai-input-row {
    display: flex;
    gap: 6px;
    padding: 10px 12px;
    border-top: 1px solid #e2e8f0;
    flex-shrink: 0;
    align-items: flex-end;
}

.ai-panel.dark .ai-input-row {
    border-top-color: #313244;
}

.ai-input {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 13px;
    font-family: inherit;
    resize: none;
    outline: none;
    background: #fff;
    color: #1e293b;
    line-height: 1.4;
}

.ai-input:focus {
    border-color: #7c3aed;
    box-shadow: 0 0 0 2px #7c3aed22;
}

.ai-panel.dark .ai-input {
    background: #1e1e2e;
    border-color: #45475a;
    color: #cdd6f4;
}

.ai-panel.dark .ai-input:focus {
    border-color: #cba6f7;
    box-shadow: 0 0 0 2px #cba6f722;
}

.ai-send-btn {
    padding: 8px 12px;
    border: none;
    border-radius: 8px;
    background: #7c3aed;
    color: #fff;
    font-size: 15px;
    cursor: pointer;
    transition: background 0.12s;
    flex-shrink: 0;
    align-self: flex-end;
    height: 36px;
}

.ai-send-btn:hover:not(:disabled) { background: #6d28d9; }
.ai-send-btn:disabled { opacity: 0.5; cursor: default; }

/* ===== API Key Modal ===== */
.ai-key-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 5000;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
}

.ai-key-modal {
    background: #fff;
    border-radius: 14px;
    padding: 28px 28px 22px;
    width: 400px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.3);
}

.ai-key-modal-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 10px;
    color: #1e293b;
}

.ai-key-modal-desc {
    font-size: 13px;
    color: #64748b;
    margin-bottom: 16px;
    line-height: 1.5;
}

.ai-key-input {
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: 'Fira Code', monospace;
    outline: none;
    margin-bottom: 16px;
    color: #1e293b;
    background: #f8fafc;
}

.ai-key-input:focus {
    border-color: #7c3aed;
    box-shadow: 0 0 0 2px #7c3aed22;
    background: #fff;
}

.ai-key-modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

.ai-key-save-btn {
    padding: 8px 20px;
    border: none;
    border-radius: 8px;
    background: #7c3aed;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.12s;
}

.ai-key-save-btn:hover { background: #6d28d9; }

.ai-key-cancel-btn {
    padding: 8px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: none;
    color: #64748b;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.12s;
}

.ai-key-cancel-btn:hover { background: #f1f5f9; }

/* ===== Code tree visualize button ===== */
.code-tree-btn {
    display: none;
    background: none;
    border: 1px solid #30363d;
    color: #a6e3a1;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: system-ui, sans-serif;
}

.code-tree-btn:hover {
    background: #1a2e1a;
    color: #cdd6f4;
    border-color: #a6e3a1;
}

/* Only show inside fullscreen */
.fullscreen .code-tree-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

/* ===== SVG Tree nodes ===== */
.tree-edge {
    fill: none;
    stroke: #45475a;
    stroke-width: 1.5;
}

.tree-node-group {
    cursor: pointer;
}

.tree-node-rect {
    transition: filter 0.12s;
}

.tree-node-group:hover .tree-node-rect {
    filter: brightness(1.3);
}

.tree-node-folder {
    fill: #1a2744;
    stroke: #89b4fa;
    stroke-width: 1.5;
}

.tree-node-file {
    fill: #1a2620;
    stroke: #a6e3a1;
    stroke-width: 1;
}

.tree-node-collapsed {
    fill: #2e1a32;
    stroke: #cba6f7;
    stroke-width: 1.5;
}

.tree-node-name {
    fill: #cdd6f4;
    font-size: 12px;
    font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    pointer-events: none;
}

.tree-node-icon {
    font-size: 13px;
    pointer-events: none;
}

.tree-collapse-icon {
    fill: #585b70;
    font-size: 14px;
    font-weight: 700;
    font-family: system-ui, sans-serif;
    pointer-events: none;
}
</style>