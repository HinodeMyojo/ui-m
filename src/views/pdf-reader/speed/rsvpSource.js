import { toRaw } from 'vue';
import {
    linesFromItems, imageBoxesFromOps, analyzePage, mergeAcrossPages, averageWeight,
    SENTENCE, PARAGRAPH,
} from './rsvpText.mjs';
import { pdfjs } from '../composables/usePdfLoader.js';

// Поток слов книги для скорочтения — docs/pdf-library.md (back-m).
//
// Текст достаём лениво, по страницам вокруг места чтения: читалка открывает
// книги Range-запросами, и вытягивать весь текст сразу значило бы скачать
// весь файл ради первой страницы. Держим непрерывный кусок [firstPage..lastPage]
// и наращиваем его в обе стороны по мере чтения.
//
// Каждая страница разбирается целиком: кроме слов — рисунки и листинги (они
// встают в поток блоками), заголовки и термины для обзора главы.

// Подряд столько пустых страниц от точки старта — книга без текстового слоя.
const SCAN_PROBE = 6;
// Сколько слов держать впереди, чтобы подгрузка не успела стать заметной.
export const LOOKAHEAD_WORDS = 400;

const BOLD = /Bold|Black|Heavy|Semibold|Demi/i;
const ITALIC = /Italic|Oblique/i;
const MONO = /Mono|Courier|Consol|Menlo|Code|Fixed|Typewriter/i;

export function createRsvpSource(pdfDoc, pageCount) {
    const rawCache = new Map();     // страница → Promise<{ lines, images }>
    const pageCache = new Map();    // страница → Promise<разбор страницы>
    let tokens = [];
    let firstPage = 0;
    let lastPage = 0;
    let textPages = 0;              // загруженные страницы, где нашёлся текст
    let words = 0;                  // слов в загруженном куске (без блоков)
    let weight = 1;
    let busy = Promise.resolve();

    function doc() {
        return toRaw(pdfDoc);
    }

    // Строки с начертаниями и рамки картинок. Список операторов нужен ради
    // обоих: в нём картинки, и после него pdf.js знает настоящие имена шрифтов
    // («…-BoldItalic»), по которым находятся заголовки, термины и код.
    function rawPage(n) {
        if (n < 1 || n > pageCount) return Promise.resolve({ lines: [], images: [] });
        if (!rawCache.has(n)) {
            rawCache.set(n, (async () => {
                try {
                    const page = await doc().getPage(n);
                    let images = [];
                    try {
                        const ops = await page.getOperatorList();
                        images = imageBoxesFromOps(ops.fnArray, ops.argsArray, pdfjs()?.OPS);
                    } catch { /* без картинок — просто текст */ }
                    const content = await page.getTextContent();
                    const fontOf = (name) => {
                        let font = null;
                        try { font = page.commonObjs.get(name); } catch { /* шрифт не подгружен */ }
                        const fname = font?.name || '';
                        return {
                            bold: BOLD.test(fname) || !!font?.bold,
                            italic: ITALIC.test(fname) || !!font?.italic,
                            mono: MONO.test(fname) || content.styles?.[name]?.fontFamily === 'monospace',
                        };
                    };
                    return { lines: linesFromItems(content.items, fontOf), images };
                } catch {
                    return { lines: [], images: [] };
                }
            })());
        }
        return rawCache.get(n);
    }

    // Разбор страницы: слова, блоки, заголовки, термины.
    function analysis(n) {
        if (!pageCache.has(n)) {
            pageCache.set(n, (async () => {
                const [cur, ...neighbors] = await Promise.all([n, n - 2, n - 1, n + 1, n + 2].map(rawPage));
                // Строки размечаются разбором (heading, code), поэтому даём копии.
                return analyzePage({
                    lines: cur.lines.map((l) => ({ ...l })),
                    images: cur.images,
                    page: n,
                    neighbors: neighbors.map((x) => x.lines),
                });
            })());
        }
        return pageCache.get(n);
    }

    // Слова страницы для потока — копией: склейка переносов меняет слова.
    async function pageTokens(n) {
        const a = await analysis(n);
        return { list: a.tokens.map((t) => ({ ...t })), words: a.words };
    }

    // Все загрузки по очереди: два параллельных «догрузить вперёд» склеили бы
    // одну страницу дважды.
    function serial(fn) {
        const run = busy.then(fn, fn);
        busy = run.catch(() => {});
        return run;
    }

    function recalc() {
        weight = averageWeight(tokens.filter((t) => !t.k));
    }

    // Начать с этой страницы. Страницы без слов (обложки, сканы) пропускаем.
    function start(page) {
        return serial(async () => {
            tokens = [];
            textPages = 0;
            words = 0;
            let n = Math.max(1, Math.min(pageCount, page));
            let empty = 0;
            firstPage = n;
            lastPage = n - 1;
            while (n <= pageCount) {
                const { list, words: w } = await pageTokens(n);
                lastPage = n;
                if (w > 0) {
                    tokens = list;
                    textPages = 1;
                    words = w;
                    firstPage = n;
                    break;
                }
                empty++;
                if (empty >= SCAN_PROBE) break;
                n++;
            }
            recalc();
            return { ok: words > 0, page: firstPage, skipped: firstPage - page };
        });
    }

    // Догрузить вперёд, пока впереди меньше `want` слов. Возвращает false, если
    // книга кончилась.
    function ensureAhead(fromIndex, want = LOOKAHEAD_WORDS) {
        return serial(async () => {
            while (tokens.length - fromIndex < want && lastPage < pageCount) {
                const n = lastPage + 1;
                const { list, words: w } = await pageTokens(n);
                lastPage = n;
                if (!list.length) continue;
                mergeAcrossPages(tokens, list);
                tokens.push(...list);
                if (w) textPages++;
                words += w;
            }
            recalc();
            return lastPage < pageCount || fromIndex < tokens.length;
        });
    }

    // Догрузить назад одну страницу с текстом. Возвращает, на сколько сдвинулись
    // индексы (0 — назад некуда).
    function prependPage() {
        return serial(async () => {
            while (firstPage > 1) {
                const n = firstPage - 1;
                const { list, words: w } = await pageTokens(n);
                firstPage = n;
                if (!list.length) continue;
                // Первое слово старой первой страницы может уйти в конец новой
                // (перенос через страницу) — тогда сдвиг на одно меньше.
                const tail = tokens.slice();
                const merged = mergeAcrossPages(list, tail);
                tokens = list.concat(tail);
                if (w) textPages++;
                words += w;
                recalc();
                return list.length - (merged ? 1 : 0);
            }
            return 0;
        });
    }

    // Номер слова на его странице — по нему продолжают с того же места.
    function offsetInPage(i) {
        const t = tokens[i];
        if (!t) return 0;
        let j = i;
        while (j > 0 && tokens[j - 1].p === t.p) j--;
        return i - j;
    }

    function indexOfPageOffset(page, offset) {
        const startIdx = tokens.findIndex((t) => t.p === page);
        if (startIdx < 0) return -1;
        let end = startIdx;
        while (end < tokens.length && tokens[end].p === page) end++;
        return Math.min(startIdx + Math.max(0, offset), Math.max(startIdx, end - 1));
    }

    // Слова, оставшиеся на странице слова i.
    function wordsLeftOnPage(i) {
        const t = tokens[i];
        if (!t) return 0;
        let n = 0;
        for (let j = i; j < tokens.length && tokens[j].p === t.p; j++) if (!tokens[j].k) n++;
        return n;
    }

    // ── Обзор главы ──────────────────────────────────────────────────────
    //
    // Карта главы перед чтением: заголовки с первой фразой раздела, рисунки,
    // термины, объём. Страницы разбираются по одной, onProgress(сделано, всего)
    // — чтобы на толстой главе было видно, что работа идёт.
    async function chapterSummary(fromPage, toPage, onProgress = null) {
        const from = Math.max(1, fromPage);
        const to = Math.min(pageCount, Math.max(from, toPage));
        const result = { from, to, words: 0, headings: [], terms: [], blocks: [] };
        const seenHeadings = new Set();
        const seenTerms = new Set();
        for (let n = from; n <= to; n++) {
            const a = await analysis(n);
            result.words += a.words;
            for (const h of a.headings) {
                // Подписи врезок («PAYMENTS SYSTEMS») повторяются — в план один раз.
                const key = h.text.toLowerCase();
                if (seenHeadings.has(key)) continue;
                seenHeadings.add(key);
                result.headings.push({ ...h, lead: firstSentence(a.tokens, h.i) });
            }
            for (const t of a.terms) {
                const key = t.term.toLowerCase();
                if (seenTerms.has(key)) continue;
                seenTerms.add(key);
                result.terms.push(t);
            }
            result.blocks.push(...a.blocks);
            onProgress?.(n - from + 1, to - from + 1);
        }
        return result;
    }

    // ── Главы по тексту ──────────────────────────────────────────────────
    //
    // Для сверки оглавления нужны только крупные строки у верха страницы, и
    // хватает текста — без списка операторов это в разы быстрее.
    const headlineCache = new Map();

    function headlines(n) {
        if (!headlineCache.has(n)) {
            headlineCache.set(n, (async () => {
                try {
                    const page = await doc().getPage(n);
                    const [, y0, , y1] = page.view;
                    const content = await page.getTextContent();
                    const lines = linesFromItems(content.items)
                        .map((l) => ({ text: l.text, h: l.h, y: l.y - y0 }));
                    return { page: n, height: y1 - y0, lines };
                } catch {
                    return { page: n, height: 1, lines: [] };
                }
            })());
        }
        return headlineCache.get(n);
    }

    // Самая крупная строка у верха страницы — заголовок, если он там есть.
    async function topHeadline(n) {
        const p = await headlines(n);
        const top = p.lines.filter((l) => l.y > p.height * 0.6);
        if (!top.length) return '';
        const h = Math.max(...top.map((l) => l.h));
        return top.filter((l) => Math.abs(l.h - h) <= 1).map((l) => l.text.trim()).join(' ');
    }

    async function scanHeadlines(onProgress = null) {
        const pages = [];
        for (let n = 1; n <= pageCount; n++) {
            pages.push(await headlines(n));
            if (n % 10 === 0 || n === pageCount) onProgress?.(n, pageCount);
        }
        return pages;
    }

    return {
        start,
        ensureAhead,
        topHeadline,
        scanHeadlines,
        prependPage,
        offsetInPage,
        indexOfPageOffset,
        wordsLeftOnPage,
        chapterSummary,
        get tokens() { return tokens; },
        get weight() { return weight; },
        get firstPage() { return firstPage; },
        get lastPage() { return lastPage; },
        get atEnd() { return lastPage >= pageCount; },
        get wordsPerPage() { return textPages ? words / textPages : 280; },
        pageCount,
    };
}

// Первая фраза после заголовка — по ней в обзоре видно, о чём раздел.
function firstSentence(list, headingIndex) {
    let j = headingIndex;
    while (j < list.length && !(list[j].f & PARAGRAPH) && !list[j].k) j++;
    j++;
    const out = [];
    for (; j < list.length && out.length < 40; j++) {
        if (list[j].k) break;
        out.push(list[j].t);
        if (list[j].f & (SENTENCE | PARAGRAPH)) break;
    }
    return out.join(' ');
}
