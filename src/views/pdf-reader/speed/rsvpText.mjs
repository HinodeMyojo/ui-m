// Скорочтение: текст страницы PDF → поток слов для показа по одному.
// docs/pdf-library.md (back-m), раздел «Скорочтение».
//
// Модуль чистый — ни Vue, ни pdf.js. Его гоняет `npm run check` на голом node:
// здесь живут все решения о том, что считать словом, где кончается абзац и
// сколько держать слово на экране. Ошибиться в этом месте — значит читать
// колонтитулы, номера страниц и «програм- мирование» на скорости 500 сл/мин.

// Флаги слова — битовая маска, чтобы на книгу в сто тысяч слов не заводить
// по объекту флагов на каждое.
export const SENTENCE = 1;   // конец предложения
export const CLAUSE = 2;     // запятая, точка с запятой, тире — короткая пауза
export const PARAGRAPH = 4;  // конец абзаца или заголовка
export const HYPHEN = 8;     // слово оборвано переносом в конце страницы

const WORD_CHAR = /[\p{L}\p{N}]/u;
const LOWER_START = /^[«"“„(\[]*\p{Ll}/u;
const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;
// Перенос: дефис, мягкий перенос или типографский дефис после буквы.
const BREAK_HYPHEN = /\p{L}[-­‐]$/u;
const CLOSERS = '»"”’)]}';
const OPENERS = '«"“„‘([{';

function isWordChar(ch) {
    return WORD_CHAR.test(ch);
}

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function quantile(values, q) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

// ── Строки страницы ──────────────────────────────────────────────────────

// items — то, что отдаёт page.getTextContent(): кусочки текста с координатами.
// Порядок оставляем как в потоке PDF: сортировка по координатам перемешала бы
// колонки двухколоночной вёрстки. В PDF ось y смотрит вверх.
export function linesFromItems(items) {
    const lines = [];
    let cur = null;
    const flush = () => {
        if (cur && cur.text.trim()) lines.push(cur);
        cur = null;
    };
    for (const it of items || []) {
        if (typeof it?.str !== 'string') continue;
        const [a = 1, b = 0, c = 0, d = 1, x = 0, y = 0] = it.transform || [];
        // Повёрнутый текст — водяные знаки и надписи на полях, не книга.
        if (Math.abs(b) > Math.abs(a) * 0.2 || Math.abs(c) > Math.abs(d) * 0.2) {
            if (it.hasEOL) flush();
            continue;
        }
        const h = Math.abs(d) || it.height || 10;
        if (!it.str) {
            if (it.hasEOL) flush();
            continue;
        }
        if (cur && Math.abs(y - cur.y) > Math.min(h, cur.h) * 0.5) flush();
        if (!cur) {
            cur = { text: '', x, y, h, x2: x };
        } else {
            const gap = x - cur.x2;
            // Ушли далеко влево по той же высоте — это уже другая колонка.
            if (gap < -h * 2) {
                flush();
                cur = { text: '', x, y, h, x2: x };
            } else if (gap > h * 0.12 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) {
                cur.text += ' ';
            }
        }
        cur.text += it.str;
        cur.x2 = Math.max(cur.x2, x + (it.width || 0));
        cur.h = Math.max(cur.h, h);
        if (it.hasEOL) flush();
    }
    flush();
    return lines;
}

// ── Колонтитулы и номера страниц ─────────────────────────────────────────

const PAGE_NUMBER = /^[\s\-–—|·•.[\]()]*(?:(?:стр\.?|страница|page|p\.)\s*)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:из|of|\/)\s*\d{1,4})?[\s\-–—|·•.[\]()]*$/i;

export function isPageNumberLine(text) {
    return PAGE_NUMBER.test(text.trim());
}

// Колонтитул на соседних страницах отличается только номером страницы.
export function normalizeRunning(text) {
    return text.toLowerCase().replace(/[\d\s·•|—–\-.,:]+/g, ' ').trim();
}

// Где искать колонтитулы: две строки сверху и две снизу. На коротких страницах
// — только крайние, иначе в «колонтитулы» попадал бы сам текст.
function edgeLines(lines) {
    if (lines.length <= 2) return lines;
    if (lines.length <= 5) return [lines[0], lines[lines.length - 1]];
    return [lines[0], lines[1], lines[lines.length - 2], lines[lines.length - 1]];
}

// Убирает номера страниц и колонтитулы. neighbors — строки соседних страниц
// (±2: на чётных и нечётных колонтитулы часто разные).
export function stripRunningLines(lines, neighbors = []) {
    if (!lines.length) return lines;
    const seen = new Set();
    for (const other of neighbors) {
        for (const line of edgeLines(other || [])) {
            const key = normalizeRunning(line.text);
            if (key.length >= 3) seen.add(key);
        }
    }
    const edges = new Set(edgeLines(lines));
    return lines.filter((line) => {
        if (!edges.has(line)) return true;
        if (isPageNumberLine(line.text)) return false;
        const key = normalizeRunning(line.text);
        return !(key.length >= 3 && seen.has(key));
    });
}

// ── Слова ────────────────────────────────────────────────────────────────

function endsSentence(text) {
    return /[.!?…]["»”’)\]]*$/.test(text);
}

function sentenceFlag(word) {
    if (/[.!?…]["»”’)\]]*$/.test(word)) return SENTENCE;
    if (/[,;:]["»”’)\]]*$/.test(word) || /[—–]$/.test(word)) return CLAUSE;
    return 0;
}

// Японский и китайский пишутся без пробелов: «слово» там — сегмент Intl.Segmenter.
function splitCjk(word) {
    if (!CJK.test(word) || word.length <= 4 || typeof Intl === 'undefined' || !Intl.Segmenter) {
        return [word];
    }
    const parts = [];
    for (const seg of new Intl.Segmenter('ja', { granularity: 'word' }).segment(word)) {
        if (!seg.segment.trim()) continue;
        if (!seg.isWordLike && parts.length) parts[parts.length - 1] += seg.segment;
        else parts.push(seg.segment);
    }
    return parts.length ? parts : [word];
}

// Отдельно стоящие «—», «»», «)» прилипают к соседу: показывать тире само по
// себе — это кадр, на котором глазу нечего делать.
function glueStrays(words) {
    const out = [];
    let pendingOpen = '';
    for (const w of words) {
        const hasWord = [...w].some(isWordChar);
        if (!hasWord) {
            if ([...w].every((ch) => OPENERS.includes(ch))) {
                pendingOpen += w;
                continue;
            }
            if (out.length) {
                const glue = /^[—–-]+$/.test(w) ? ' ' : '';
                out[out.length - 1] += glue + w;
                continue;
            }
        }
        out.push(pendingOpen + w);
        pendingOpen = '';
    }
    if (pendingOpen) {
        if (out.length) out[out.length - 1] += pendingOpen;
        else out.push(pendingOpen);
    }
    return out;
}

function pageStats(lines) {
    const gaps = [];
    for (let i = 1; i < lines.length; i++) {
        const gap = lines[i - 1].y - lines[i].y;
        if (gap > 0 && Math.abs(lines[i].h - lines[i - 1].h) < lines[i].h * 0.2) gaps.push(gap);
    }
    const long = lines.filter((l) => l.text.length > 25);
    const pool = long.length >= 3 ? long : lines;
    return {
        gap: median(gaps) || median(lines.map((l) => l.h)) * 1.2,
        left: quantile(pool.map((l) => l.x), 0.2),
        right: quantile(pool.map((l) => l.x2), 0.8),
    };
}

function isParagraphBreak(line, next, stats) {
    const gap = line.y - next.y;
    // Перескок вверх — новая колонка, а не абзац.
    if (gap < 0) return false;
    if (gap > stats.gap * 1.55) return true;
    if (Math.abs(next.h - line.h) > line.h * 0.25) return true;
    if (!endsSentence(line.text.trim())) return false;
    if (line.x2 < stats.right - line.h * 3) return true;
    return next.x > stats.left + next.h * 0.8;
}

// Строки одной страницы → слова. Каждое слово: { t: текст, p: страница, f: флаги }.
export function tokensFromLines(lines, page) {
    const stats = pageStats(lines);
    const tokens = [];
    let carry = null; // слово с переносом в конце предыдущей строки

    lines.forEach((line, i) => {
        let words = glueStrays(line.text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean))
            .flatMap(splitCjk);
        if (!words.length) return;
        if (carry) {
            const first = words.shift();
            carry.t = joinHyphen(carry.t, first);
            carry.f = sentenceFlag(carry.t);
            carry = null;
        }
        for (const w of words) tokens.push({ t: w, p: page, f: sentenceFlag(w) });
        const last = tokens[tokens.length - 1];
        if (!last) return;
        const next = lines[i + 1];
        if (BREAK_HYPHEN.test(last.t) && last.t.length > 2) {
            if (next) {
                carry = last;
                return;
            }
            last.f |= HYPHEN;
            return;
        }
        if (next && isParagraphBreak(line, next, stats)) last.f |= PARAGRAPH;
    });
    markAbbreviations(tokens);
    return tokens;
}

// «т. е.», «см. рис. 3», «и т. д. и т. п.» — точка, за которой идёт слово с
// маленькой буквы, это сокращение, а не конец мысли. Угадывать по самому слову
// нельзя: «два.», «нет.», «мы.» — обычные концы предложений.
function markAbbreviations(tokens) {
    for (let i = 0; i + 1 < tokens.length; i++) {
        const t = tokens[i];
        if ((t.f & SENTENCE) && !(t.f & PARAGRAPH) && /\.$/.test(t.t) && LOWER_START.test(tokens[i + 1].t)) {
            t.f = (t.f & ~SENTENCE) | CLAUSE;
        }
    }
}

// «програм-» + «мирование» → «программирование»; «Нью-» + «Йорк» → «Нью-Йорк».
// Мягкий перенос убираем всегда: он и существует только ради переноса.
export function joinHyphen(head, tail = '') {
    if (/­$/.test(head)) return head.slice(0, -1) + tail;
    if (LOWER_START.test(tail)) return head.slice(0, -1) + tail;
    return head + tail;
}

// Слово, оборванное в конце страницы, склеивается с первым словом следующей.
// Меняет prev на месте; возвращает true, если первое слово next съедено.
export function mergeAcrossPages(prevTokens, nextTokens) {
    const last = prevTokens[prevTokens.length - 1];
    if (!last || !(last.f & HYPHEN) || !nextTokens.length) return false;
    const first = nextTokens[0];
    last.t = joinHyphen(last.t, first.t);
    last.f = (first.f & ~HYPHEN) | sentenceFlag(last.t);
    nextTokens.shift();
    return true;
}

export function pageToTokens(items, page, neighborLines = []) {
    return tokensFromLines(stripRunningLines(linesFromItems(items), neighborLines), page);
}

// ── Точка фиксации ───────────────────────────────────────────────────────

// Буква, на которую смотрит глаз: чуть левее середины слова. Таблица — та же,
// что у Spritz: 1 буква → первая, 2–5 → вторая, 6–9 → третья, 10–13 →
// четвёртая, дальше пятая. Считаем по буквам, без кавычек и скобок вокруг.
export function pivotIndex(text) {
    const chars = Array.from(text);
    let start = chars.findIndex(isWordChar);
    if (start < 0) return Math.max(0, Math.floor((chars.length - 1) / 2));
    let end = chars.length - 1;
    while (end > start && !isWordChar(chars[end])) end--;
    const len = end - start + 1;
    let offset;
    if (text.includes(' ')) {
        // Несколько слов в кадре: глаз встаёт примерно на треть фразы.
        offset = Math.round(len * 0.3);
    } else {
        offset = len <= 1 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : 4;
    }
    let idx = Math.min(end, start + offset);
    while (idx > start && !isWordChar(chars[idx])) idx--;
    return idx;
}

export function splitAtPivot(text) {
    const chars = Array.from(text);
    const i = pivotIndex(text);
    return {
        before: chars.slice(0, i).join(''),
        pivot: chars[i] ?? '',
        after: chars.slice(i + 1).join(''),
    };
}

// ── Время на слово ───────────────────────────────────────────────────────

function letterCount(text) {
    let n = 0;
    for (const ch of text) if (isWordChar(ch)) n++;
    return n;
}

// Во сколько раз дольше обычного держать слово. Длинное слово, цифры, конец
// предложения и абзаца получают больше времени — без этого на 400 сл/мин
// предложения слипаются в одну ленту.
export function wordWeight(token, smart = true) {
    if (!smart) return 1;
    let m = 1;
    if (token.f & PARAGRAPH) m += 1.6;
    else if (token.f & SENTENCE) m += 1.0;
    else if (token.f & CLAUSE) m += 0.45;
    const letters = letterCount(token.t);
    if (letters > 7) m += Math.min(0.8, (letters - 7) * 0.08);
    if (/\d/.test(token.t)) m += 0.3;
    return m;
}

// Средний вес по тексту. Делим на него базовый интервал, и скорость на
// ползунке становится честной: 400 сл/мин — это 400 слов за минуту вместе со
// всеми паузами, а не «400, но на деле 310».
export function averageWeight(tokens, smart = true) {
    if (!smart || !tokens.length) return 1;
    const step = Math.max(1, Math.floor(tokens.length / 2000));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < tokens.length; i += step) {
        sum += wordWeight(tokens[i], smart);
        n++;
    }
    return sum / n;
}

// ── Кадры и переходы ─────────────────────────────────────────────────────

const CHUNK_CHARS = { 1: Infinity, 2: 18, 3: 24 };

// Кадр — одно или несколько слов, показанных разом. Кадр не перешагивает
// конец предложения или паузу: «точка. Новое» в одном кадре читается хуже.
export function frameAt(tokens, i, chunk = 1) {
    if (i < 0 || i >= tokens.length) return null;
    let count = 1;
    let text = tokens[i].t;
    const limit = CHUNK_CHARS[chunk] ?? Infinity;
    while (count < chunk && i + count < tokens.length) {
        const prev = tokens[i + count - 1];
        if (prev.f & (SENTENCE | PARAGRAPH | CLAUSE)) break;
        const next = tokens[i + count].t;
        if (text.length + 1 + next.length > limit) break;
        text += ' ' + next;
        count++;
    }
    return { start: i, count, text };
}

export function frameWeight(tokens, frame, smart = true) {
    let w = 0;
    for (let k = 0; k < frame.count; k++) w += wordWeight(tokens[frame.start + k], smart);
    return w;
}

// Начало предложения, в котором стоит слово i.
export function sentenceStart(tokens, i) {
    let j = Math.min(i, tokens.length) - 1;
    while (j >= 0 && !(tokens[j].f & (SENTENCE | PARAGRAPH))) j--;
    return j + 1;
}

// «Назад»: в начало текущего предложения, а если уже в начале — в предыдущее.
export function prevSentence(tokens, i) {
    const start = sentenceStart(tokens, i);
    if (i - start > 1 || start === 0) return start;
    return sentenceStart(tokens, start - 1);
}

export function nextSentence(tokens, i) {
    for (let j = i; j < tokens.length; j++) {
        if (tokens[j].f & (SENTENCE | PARAGRAPH)) return Math.min(tokens.length, j + 1);
    }
    return tokens.length;
}

// Сколько слов отмотать при продолжении после паузы: пару слов назад, чтобы
// вернуть нить, но не дальше начала предложения.
export function resumeIndex(tokens, i, back = 3) {
    return Math.max(sentenceStart(tokens, i), i - back);
}

// Найти в словах страницы место, откуда начинается выделенный текст.
export function findTextOffset(tokens, text) {
    const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const wanted = text.split(/\s+/).map(norm).filter(Boolean).slice(0, 3);
    if (!wanted.length) return -1;
    for (let i = 0; i < tokens.length; i++) {
        let ok = true;
        for (let k = 0; k < wanted.length && ok; k++) {
            const word = norm(tokens[i + k]?.t ?? '');
            // Выделение может начаться с середины слова.
            ok = k === 0 ? word.endsWith(wanted[0]) || word.startsWith(wanted[0]) : word.startsWith(wanted[k]);
        }
        if (ok) return i;
    }
    return -1;
}

// ── Подсказка скорости ───────────────────────────────────────────────────

// Лесенка: понимание держится — поднимаем, просело — откатываемся. sessions —
// с сервера, свежие сверху. Возвращает { wpm, reason } или null.
export function suggestWpm(sessions, current) {
    const rated = (sessions || []).filter((s) => s.comprehension && s.seconds >= 180 && s.wpm > 0);
    if (!rated.length) return null;
    const latest = rated[0];
    if (latest.comprehension <= 2) {
        const wpm = Math.max(150, roundTo25(Math.min(current, latest.targetWpm || current) - 50));
        return wpm < current ? { wpm, reason: 'понимание просело — откатимся' } : null;
    }
    const recent = rated.slice(0, 2);
    if (recent.length < 2) return null;
    const good = recent.every((s) => s.comprehension >= 4 && s.wpm >= current * 0.85);
    if (!good) return null;
    const step = current < 400 ? 50 : 25;
    const wpm = Math.min(1000, current + step);
    return wpm > current ? { wpm, reason: 'два захода с хорошим пониманием — можно быстрее' } : null;
}

function roundTo25(v) {
    return Math.round(v / 25) * 25;
}
