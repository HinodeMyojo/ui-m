import { ref } from 'vue';

const STORAGE_KEY = 'md-editor-docs';

const lightStyles = `
    body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #000; background: #fff; line-height: 1.6; font-size: 14px; }
    h1 { font-size: 24px; margin: 0 0 12px; }
    h2 { font-size: 20px; margin: 16px 0 10px; }
    h3 { font-size: 17px; margin: 14px 0 8px; }
    h4 { font-size: 15px; margin: 12px 0 6px; }
    p { margin: 0 0 8px; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.85em; font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace; }
    pre { border-radius: 8px; overflow-x: auto; margin: 0 0 12px; }
    pre code { display: block; padding: 16px; background: #1e1e2e; color: #cdd6f4; font-size: 13px; line-height: 1.5; border-radius: 8px; }
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
    body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #cdd6f4; background: #1e1e2e; line-height: 1.7; font-size: 14px; }
    h1 { font-size: 24px; margin: 0 0 14px; color: #cba6f7; font-weight: 700; }
    h2 { font-size: 20px; margin: 20px 0 10px; color: #89b4fa; font-weight: 600; border-bottom: 1px solid #313244; padding-bottom: 6px; }
    h3 { font-size: 17px; margin: 16px 0 8px; color: #94e2d5; font-weight: 600; }
    h4 { font-size: 15px; margin: 12px 0 6px; color: #a6e3a1; font-weight: 600; }
    p { margin: 0 0 10px; }
    strong { color: #f5c2e7; font-weight: 700; }
    em { color: #fab387; font-style: italic; }
    code { background: #181825; color: #f38ba8; padding: 2px 7px; border-radius: 4px; font-size: 0.85em; font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace; border: 1px solid #313244; }
    pre { border-radius: 8px; overflow-x: auto; margin: 0 0 14px; border: 1px solid #313244; }
    pre code { display: block; padding: 16px; background: #181825; color: #cdd6f4; font-size: 13px; line-height: 1.6; border-radius: 8px; border: none; }
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

function loadAllDocs() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function extractTitle(md) {
    const match = md.match(/^#\s+(.+)/m);
    if (match) return match[1].substring(0, 50);
    return md.trim().split('\n')[0].substring(0, 50) || 'Без названия';
}

function stripCodeToolbars(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('.code-block-toolbar').forEach(el => el.remove());
    div.querySelectorAll('.code-block-wrapper').forEach(el => el.replaceWith(...el.childNodes));
    return div.innerHTML;
}

export function useStorage(fileContent, darkMode, renderedHtml) {
    const savedDocs = ref(loadAllDocs());
    const showSaved = ref(false);
    const saveMessage = ref('');

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
        return new Date(iso).toLocaleDateString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    function onDrop(event) {
        const file = event.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => { fileContent.value = e.target.result; };
        reader.readAsText(file);
    }

    function downloadPdf() {
        if (!fileContent.value) return;
        const styles = darkMode.value ? darkStyles : lightStyles;
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        document.body.appendChild(iframe);
        iframe.contentDocument.write(`
            <html><head><style>${styles} ${hljsThemeCss}
                @media print { body { margin: 0; padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            </style></head><body>${stripCodeToolbars(renderedHtml.value)}</body></html>
        `);
        iframe.contentDocument.close();
        iframe.onload = () => {
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
        };
    }

    return { savedDocs, showSaved, saveMessage, saveToStorage, loadDoc, deleteDoc, formatDate, onDrop, downloadPdf };
}
