import { toRaw } from 'vue';
import { linesFromItems, stripRunningLines, tokensFromLines, mergeAcrossPages, averageWeight } from './rsvpText.js';

// Поток слов книги для скорочтения — docs/pdf-library.md (back-m).
//
// Текст достаём лениво, по страницам вокруг места чтения: читалка открывает
// книги Range-запросами, и вытягивать весь текст сразу значило бы скачать
// весь файл ради первой страницы. Держим непрерывный кусок [firstPage..lastPage]
// и наращиваем его в обе стороны по мере чтения.

// Подряд столько пустых страниц от точки старта — книга без текстового слоя.
const SCAN_PROBE = 6;
// Сколько слов держать впереди, чтобы подгрузка не успела стать заметной.
export const LOOKAHEAD_WORDS = 400;

export function createRsvpSource(pdfDoc, pageCount) {
    const rawCache = new Map();     // страница → Promise<строки>
    let tokens = [];
    let firstPage = 0;
    let lastPage = 0;
    let textPages = 0;              // загруженные страницы, где нашёлся текст
    let weight = 1;
    let busy = Promise.resolve();

    function doc() {
        return toRaw(pdfDoc);
    }

    function rawLines(n) {
        if (n < 1 || n > pageCount) return Promise.resolve([]);
        if (!rawCache.has(n)) {
            rawCache.set(n, (async () => {
                try {
                    const page = await doc().getPage(n);
                    const content = await page.getTextContent();
                    return linesFromItems(content.items);
                } catch {
                    return [];
                }
            })());
        }
        return rawCache.get(n);
    }

    async function pageTokens(n) {
        const [lines, ...neighbors] = await Promise.all(
            [n, n - 2, n - 1, n + 1, n + 2].map(rawLines),
        );
        return tokensFromLines(stripRunningLines(lines, neighbors), n);
    }

    // Все загрузки по очереди: два параллельных «догрузить вперёд» склеили бы
    // одну страницу дважды.
    function serial(fn) {
        const run = busy.then(fn, fn);
        busy = run.catch(() => {});
        return run;
    }

    function recalc() {
        weight = averageWeight(tokens);
    }

    // Начать с этой страницы. Пустые страницы (картинки, сканы) пропускаем.
    function start(page) {
        return serial(async () => {
            tokens = [];
            textPages = 0;
            let n = Math.max(1, Math.min(pageCount, page));
            let empty = 0;
            firstPage = n;
            lastPage = n - 1;
            while (n <= pageCount) {
                const list = await pageTokens(n);
                lastPage = n;
                if (list.length) {
                    tokens = list;
                    textPages = 1;
                    firstPage = n;
                    break;
                }
                empty++;
                if (empty >= SCAN_PROBE) break;
                n++;
            }
            recalc();
            return { ok: tokens.length > 0, page: firstPage, skipped: firstPage - page };
        });
    }

    // Догрузить вперёд, пока впереди меньше `want` слов. Возвращает false, если
    // книга кончилась.
    function ensureAhead(fromIndex, want = LOOKAHEAD_WORDS) {
        return serial(async () => {
            while (tokens.length - fromIndex < want && lastPage < pageCount) {
                const n = lastPage + 1;
                const list = await pageTokens(n);
                lastPage = n;
                if (!list.length) continue;
                mergeAcrossPages(tokens, list);
                tokens.push(...list);
                textPages++;
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
                const list = await pageTokens(n);
                firstPage = n;
                if (!list.length) continue;
                // Первое слово старой первой страницы может уйти в конец новой
                // (перенос через страницу) — тогда сдвиг на одно меньше.
                const tail = tokens.slice();
                const merged = mergeAcrossPages(list, tail);
                tokens = list.concat(tail);
                textPages++;
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
        if (startIdx < 0) return 0;
        let end = startIdx;
        while (end < tokens.length && tokens[end].p === page) end++;
        return Math.min(startIdx + Math.max(0, offset), Math.max(startIdx, end - 1));
    }

    // Слова оставшиеся на странице слова i.
    function wordsLeftOnPage(i) {
        const t = tokens[i];
        if (!t) return 0;
        let j = i;
        while (j < tokens.length && tokens[j].p === t.p) j++;
        return j - i;
    }

    return {
        start,
        ensureAhead,
        prependPage,
        offsetInPage,
        indexOfPageOffset,
        wordsLeftOnPage,
        get tokens() { return tokens; },
        get weight() { return weight; },
        get firstPage() { return firstPage; },
        get lastPage() { return lastPage; },
        get atEnd() { return lastPage >= pageCount; },
        get wordsPerPage() { return textPages ? tokens.length / textPages : 280; },
        pageCount,
    };
}
