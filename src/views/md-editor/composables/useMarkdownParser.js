import { computed } from 'vue';
import { Marked } from 'marked';
import hljs from 'highlight.js';

export function useMarkdownParser(fileContent) {
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

    const renderedHtml = computed(() => {
        if (!fileContent.value) return '';
        codeBlocks.length = 0;
        return mdParser.parse(fileContent.value);
    });

    const fullscreenHtml = computed(() => {
        if (!renderedHtml.value) return '';
        return renderedHtml.value.replace(/\[(\d+)\]/g, '<span class="citation-ref" data-ref="$1">[$1]</span>');
    });

    return { mdParser, codeBlocks, renderedHtml, fullscreenHtml };
}
