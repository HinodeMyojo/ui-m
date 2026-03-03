<template>
    <!-- Fullscreen preview -->
    <div v-if="isFullscreen" class="fullscreen" :class="{ dark: darkMode }" @keydown.esc="isFullscreen = false">
        <div class="fullscreen-toolbar">
            <button @click="isFullscreen = false">✕ Закрыть</button>
            <button @click="darkMode = !darkMode">{{ darkMode ? '☀️ Светлая' : '🌙 Тёмная' }}</button>
            <button @click="showSidebar = !showSidebar" :class="{ active: showSidebar }">📋 Структура</button>
        </div>
        <div class="fullscreen-body" @click="activeCitation = null">
            <div class="fullscreen-content" v-html="fullscreenHtml" @click.stop="onContentClick"></div>
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
                <div v-if="!tocItems.length && !highlights.length" class="sidebar-empty">
                    Нет структуры
                </div>
            </div>
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
import { ref, computed, shallowRef, triggerRef } from 'vue';
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