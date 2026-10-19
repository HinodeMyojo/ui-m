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
//
// fontOf(fontName) → { bold, italic, mono } — начертание кусочка. Без него
// строки получаются те же, только без разметки: заголовки угадываются по
// кеглю, а термины и код не находятся вовсе.
const PLAIN = { bold: false, italic: false, mono: false };

export function linesFromItems(items, fontOf = null) {
    const lines = [];
    let cur = null;
    const newLine = (x, y, h) => ({
        text: '', x, y, h, x2: x,
        // Сколько символов строки набрано каким начертанием, и жирный «зачин»:
        // «Correspondent banking relationships between banks allow…».
        bold: 0, italic: 0, mono: 0, chars: 0, lead: '', leadOpen: true,
    });
    const flush = () => {
        if (cur && cur.text.trim()) {
            if (cur.leadOpen) cur.lead = '';  // жирная вся строка — это заголовок, а не термин
            delete cur.leadOpen;
            lines.push(cur);
        }
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
            cur = newLine(x, y, h);
        } else {
            const gap = x - cur.x2;
            // Ушли далеко влево по той же высоте — это уже другая колонка.
            if (gap < -h * 2) {
                flush();
                cur = newLine(x, y, h);
            } else if (gap > h * 0.12 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) {
                cur.text += ' ';
            }
        }
        const style = (fontOf && fontOf(it.fontName)) || PLAIN;
        const n = it.str.replace(/\s/g, '').length;
        cur.chars += n;
        if (style.bold) cur.bold += n;
        if (style.italic) cur.italic += n;
        if (style.mono) cur.mono += n;
        if (cur.leadOpen) {
            if (style.bold) cur.lead += it.str;
            else if (n) cur.leadOpen = false;
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

export function pageStats(lines) {
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
//
// marks — необязательный массив: marks[i] = номер первого слова строки i. По
// нему разбор страницы находит, где в потоке стоят заголовки и термины.
export function tokensFromLines(lines, page, stats = pageStats(lines), marks = null) {
    const tokens = [];
    let carry = null; // слово с переносом в конце предыдущей строки

    lines.forEach((line, i) => {
        let words = glueStrays(line.text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean))
            .flatMap(splitCjk);
        if (marks) marks[i] = tokens.length;
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
        if (BREAK_HYPHEN.test(last.t) && last.t.length > 2 && !line.heading) {
            if (next) {
                carry = last;
                return;
            }
            last.f |= HYPHEN;
            return;
        }
        // Заголовок — отдельная мысль: пауза и до него, и после.
        if (next && (line.heading || next.heading || isParagraphBreak(line, next, stats))) {
            last.f |= PARAGRAPH;
        }
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

// ── Рисунки, код, заголовки, термины ─────────────────────────────────────
//
// Техническую книгу словами не прочитать: схема, таблица или листинг — это и
// есть содержание. Такие места становятся в потоке отдельными «блоками»: на
// них чтение встаёт, и показывается кусок самой страницы.

export const FIGURE = 'fig';
export const CODE = 'code';

// Мельче — значки, буллеты и логотипы, а не рисунки.
const MIN_FIGURE_W = 60;
const MIN_FIGURE_H = 40;

function mulMatrix(m, n) {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
    ];
}

// Рамки картинок страницы в координатах PDF по списку операторов pdf.js.
// Картинка рисуется в единичный квадрат, растянутый текущей матрицей, — её
// и отслеживаем через save/restore/transform и вложенные формы.
export function imageBoxesFromOps(fnArray, argsArray, OPS) {
    const boxes = [];
    if (!fnArray || !OPS) return boxes;
    const paints = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]
        .filter((v) => v !== undefined));
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        const args = argsArray[i];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() || ctm;
        else if (fn === OPS.transform) ctm = mulMatrix(ctm, args);
        else if (fn === OPS.paintFormXObjectBegin) {
            stack.push(ctm);
            if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = mulMatrix(ctm, Array.from(args[0]));
        } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
        else if (paints.has(fn)) {
            const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [
                ctm[0] * x + ctm[2] * y + ctm[4],
                ctm[1] * x + ctm[3] * y + ctm[5],
            ]);
            const xs = pts.map((p) => p[0]);
            const ys = pts.map((p) => p[1]);
            const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
            if (box[2] - box[0] >= MIN_FIGURE_W && box[3] - box[1] >= MIN_FIGURE_H) boxes.push(box);
        }
    }
    return mergeBoxes(boxes);
}

// Схема, нарезанная на полосы (так бывает после конвертеров), — один рисунок.
function mergeBoxes(boxes) {
    const out = [];
    for (const b of [...boxes].sort((a, c) => c[3] - a[3])) {
        const prev = out[out.length - 1];
        const overlapX = prev && Math.min(prev[2], b[2]) - Math.max(prev[0], b[0]) > 0;
        if (prev && overlapX && b[3] >= prev[1] - 6) {
            prev[0] = Math.min(prev[0], b[0]);
            prev[1] = Math.min(prev[1], b[1]);
            prev[2] = Math.max(prev[2], b[2]);
            prev[3] = Math.max(prev[3], b[3]);
        } else {
            out.push([...b]);
        }
    }
    return out;
}

function insideBox(line, box) {
    return line.y >= box[1] - 2 && line.y <= box[3] + 2 && line.x < box[2] && line.x2 > box[0];
}

// Кавычки в термине бывают непарные («“On-us” transactions» режется по
// начертанию посередине) — в названии термина они только мешают.
function cleanTerm(text) {
    return text.replace(/[«»"“”„]/g, '').replace(/^[\s'(]+|[\s'):—–-]+$/g, '').replace(/\s+/g, ' ').trim();
}

function looksLikeHeading(line, bodyH) {
    const t = line.text.trim();
    if (t.length < 2 || t.length > 90) return false;
    if (/[.,;!?]$/.test(t) && !/^\d+(\.\d+)*\.?$/.test(t)) return false;
    const bigger = line.h > bodyH * 1.15;
    const allBold = line.chars > 0 && line.bold / line.chars > 0.9;
    return bigger || allBold;
}

// Страница целиком: слова вперемешку с блоками, плюс то, что нужно обзору
// главы, — заголовки, термины, рисунки и листинги со своими местами в потоке.
//
// lines — строки с разметкой начертаний (linesFromItems с fontOf), images —
// рамки из imageBoxesFromOps, neighbors — строки соседних страниц.
export function analyzePage({ lines, images = [], page, neighbors = [] }) {
    const kept = stripRunningLines(lines, neighbors);
    const body = kept.filter((l) => l.chars > 20);
    const bodyH = median((body.length ? body : kept).map((l) => l.h)) || 10;

    // Подписи и цифры внутри рамки рисунка — часть рисунка, читать их по слову
    // («0», «2012», «Count») бессмысленно.
    const textLines = kept.filter((l) => !images.some((b) => insideBox(l, b)));
    for (const l of textLines) {
        l.heading = looksLikeHeading(l, bodyH);
        l.code = l.chars > 0 && l.mono / l.chars > 0.8;
    }
    const stats = pageStats(textLines);

    // Порядок: строки сверху вниз, как в потоке; рисунок встаёт перед первой
    // строкой, которая ниже его нижнего края.
    const figures = [...images].sort((a, b) => b[3] - a[3]);
    const seq = [];
    let f = 0;
    let codeRun = null;
    const flushCode = () => {
        if (!codeRun) return;
        seq.push({ block: CODE, box: codeRun });
        codeRun = null;
    };
    for (const line of textLines) {
        while (f < figures.length && figures[f][1] >= line.y - 2) {
            flushCode();
            seq.push({ block: FIGURE, box: figures[f++] });
        }
        if (line.code) {
            const box = [line.x, line.y - line.h * 0.3, line.x2, line.y + line.h];
            codeRun = codeRun
                ? [Math.min(codeRun[0], box[0]), Math.min(codeRun[1], box[1]), Math.max(codeRun[2], box[2]), Math.max(codeRun[3], box[3])]
                : box;
            continue;
        }
        flushCode();
        seq.push({ line });
    }
    flushCode();
    while (f < figures.length) seq.push({ block: FIGURE, box: figures[f++] });

    const tokens = [];
    const headings = [];
    const terms = [];
    const blocks = [];
    let run = [];
    const flushRun = () => {
        if (!run.length) return;
        const marks = [];
        const part = tokensFromLines(run, page, stats, marks);
        const base = tokens.length;
        if (tokens.length && mergeAcrossPages(tokens, part)) marks.forEach((m, k) => { marks[k] = Math.max(0, m - 1); });
        run.forEach((line, k) => {
            const at = base + marks[k];
            if (line.heading) headings.push({ text: line.text.replace(/\s+/g, ' ').trim(), i: at, p: page });
            const lead = cleanTerm(line.lead || '');
            if (lead.length >= 3 && lead.length <= 60 && !line.heading) {
                terms.push({ term: lead, i: at, p: page, leadWords: lead.split(' ').length });
            }
        });
        tokens.push(...part);
        run = [];
    };
    for (const item of seq) {
        if (item.line) {
            run.push(item.line);
            continue;
        }
        flushRun();
        const last = tokens[tokens.length - 1];
        if (last) last.f |= PARAGRAPH;
        blocks.push({ k: item.block, box: item.box, i: tokens.length, p: page });
        tokens.push({ t: item.block === FIGURE ? 'рисунок' : 'код', p: page, f: PARAGRAPH, k: item.block, box: item.box });
    }
    flushRun();

    // Определение термина — остаток его предложения после жирного зачина.
    for (const term of terms) {
        const from = term.i + term.leadWords;
        const words = [];
        for (let j = from; j < tokens.length && words.length < 45; j++) {
            if (tokens[j].k) break;
            words.push(tokens[j].t);
            if (tokens[j].f & (SENTENCE | PARAGRAPH)) break;
        }
        term.def = words.join(' ');
        delete term.leadWords;
    }

    const words = tokens.reduce((n, t) => n + (t.k ? 0 : 1), 0);
    return { tokens, headings, terms, blocks, words };
}

export function isBlock(token) {
    return !!token?.k;
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
    // Аббревиатура (ACH, ODFI, ФНС) — это термин, его надо успеть развернуть.
    if (/^[^\p{L}]*\p{Lu}{2,}s?[^\p{L}]*$/u.test(token.t)) m += 0.35;
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
    // Рисунок или листинг — отдельный кадр: на нём чтение встаёт.
    if (tokens[i].k) return { start: i, count: 1, text: '', block: tokens[i] };
    let count = 1;
    let text = tokens[i].t;
    const limit = CHUNK_CHARS[chunk] ?? Infinity;
    while (count < chunk && i + count < tokens.length) {
        const prev = tokens[i + count - 1];
        if (prev.f & (SENTENCE | PARAGRAPH | CLAUSE)) break;
        if (tokens[i + count].k) break;
        const next = tokens[i + count].t;
        if (text.length + 1 + next.length > limit) break;
        text += ' ' + next;
        count++;
    }
    return { start: i, count, text };
}

export function frameWeight(tokens, frame, smart = true) {
    if (frame.block) return 0;
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

// ── Главы и план по дням ─────────────────────────────────────────────────

// Главы — верхний уровень оглавления: на подразделах обзор и пересказ
// всплывали бы каждые три страницы. Ключ главы — страница начала: так же её
// помнит сервер (pdf_chapter_notes.chapter_key).
export function chaptersFromToc(tocItems, pageCount) {
    const items = (tocItems || []).filter((t) => t.pageNum > 0);
    if (!items.length) return [];
    const top = Math.min(...items.map((t) => t.level || 0));
    const heads = items.filter((t) => (t.level || 0) === top).sort((a, b) => a.pageNum - b.pageNum);
    const out = [];
    heads.forEach((t, k) => {
        const next = heads.slice(k + 1).find((h) => h.pageNum > t.pageNum);
        const end = next ? next.pageNum - 1 : pageCount;
        const prev = out[out.length - 1];
        // Несколько пунктов на одной странице («About», «Thanks!») — одна глава.
        if (prev && prev.start === t.pageNum) {
            prev.title = t.title;
            prev.end = Math.max(prev.end, end);
            return;
        }
        out.push({ key: `p${t.pageNum}`, title: t.title.trim(), start: t.pageNum, end: Math.max(t.pageNum, end) });
    });
    return out;
}

export function chapterAt(chapters, page) {
    let found = null;
    for (const c of chapters) if (c.start <= page) found = c;
    return found;
}

function addDays(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + days));
    return date.toISOString().slice(0, 10);
}

// Остаток книги ровными кусками по дням: сколько страниц и минут в день.
// Куски режутся по страницам — карточке «Сегодня» нужно «стр. 13–58», а не
// «слова 4 120–19 800».
export function readingPlan({ fromPage, pageCount, wordsPerPage, wpm, days, today }) {
    const pages = Math.max(0, pageCount - fromPage + 1);
    if (!pages || days < 1) return [];
    const perDay = Math.ceil(pages / days);
    const plan = [];
    for (let k = 0; k < days; k++) {
        const from = fromPage + k * perDay;
        if (from > pageCount) break;
        const to = Math.min(pageCount, from + perDay - 1);
        const words = (to - from + 1) * wordsPerPage;
        plan.push({ date: addDays(today, k), from, to, minutes: Math.max(5, Math.round(words / Math.max(50, wpm))) });
    }
    return plan;
}

// ── Главы по самому тексту ───────────────────────────────────────────────
//
// Оглавлению PDF верить нельзя: у книг, собранных calibre, ссылки бывают
// сдвинуты на главу («ACH» ведёт на начало «Checking»). Настоящие заголовки
// глав видно по тексту — самый крупный кегль у верхнего края, повторяющийся
// на нескольких страницах.

// pages: [{ page, height, lines: [{ text, h, y }] }], y от низа страницы.
export function chaptersFromHeadings(pages, pageCount) {
    const all = pages.flatMap((p) => p.lines.map((l) => l.h));
    const body = median(all) || 10;
    const cands = [];
    for (const p of pages) {
        const top = p.lines.filter((l) => l.y > p.height * 0.6 && l.text.trim().length >= 3 && l.text.length <= 120);
        if (!top.length) continue;
        const h = Math.max(...top.map((l) => l.h));
        if (h < body * 1.4) continue;
        const text = top.filter((l) => Math.abs(l.h - h) <= 1).map((l) => l.text.trim()).join(' ').replace(/\s+/g, ' ');
        cands.push({ page: p.page, h: Math.round(h), text });
    }
    // Кегль глав — самый крупный из тех, что встречаются хотя бы на трёх
    // страницах: титул книги крупнее, но он один.
    const counts = new Map();
    for (const c of cands) counts.set(c.h, (counts.get(c.h) || 0) + 1);
    const sizes = [...counts.entries()].filter(([, n]) => n >= 3).map(([h]) => h);
    if (!sizes.length) return [];
    const H = Math.max(...sizes);
    const heads = cands.filter((c) => Math.abs(c.h - H) <= 1).sort((a, b) => a.page - b.page);
    if (heads.length < 2) return [];
    return heads.map((c, k) => ({
        key: `p${c.page}`,
        title: c.text.slice(0, 120),
        start: c.page,
        end: k + 1 < heads.length ? heads[k + 1].page - 1 : pageCount,
    }));
}

function normTitle(s) {
    return s.toLowerCase().replace(/^\s*(chapter|глава|часть|part)\s+[\divxlc]+\.?\s*/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Оглавление против текста. Совпало большинство начал — оглавлению верим.
// Нет — главы берём из текста, а названия, если узнаются, — из оглавления
// («Chapter 4 Core Systems: ACH» понятнее, чем просто «Core Systems: ACH»).
export function reconcileChapters(fromToc, fromText) {
    if (!fromText.length) return fromToc;
    if (!fromToc.length) return fromText;
    // Совпадение — та же страница и то же название: при сдвиге на главу
    // страницы ещё совпадают, а названия уже чужие.
    const same = (a, b) => {
        const x = normTitle(a);
        const y = normTitle(b);
        return !!x && !!y && (x === y || x.endsWith(y) || y.endsWith(x));
    };
    const hits = fromToc.filter((c) => fromText.some((t) => t.start === c.start && same(t.title, c.title))).length;
    if (hits / fromToc.length >= 0.6) return fromToc;
    return fromText.map((c) => {
        const n = normTitle(c.title);
        const toc = n && fromToc.find((t) => same(t.title, c.title));
        return toc ? { ...c, title: toc.title.trim() } : c;
    });
}

// ── Жирное начало слова ──────────────────────────────────────────────────
//
// «Бионическое» чтение: первая половина слова жирная, глаз цепляется за неё
// и достраивает остальное. Исследования прироста скорости почти не находят —
// это вопрос удобства, поэтому только опция режима «Текстом».
export function bionicSplit(text) {
    const chars = Array.from(text);
    const start = chars.findIndex(isWordChar);
    if (start < 0) return { lead: text, head: '', tail: '' };
    let end = start;
    while (end < chars.length && isWordChar(chars[end])) end++;
    const len = end - start;
    const n = len <= 3 ? 1 : Math.ceil(len * 0.45);
    return {
        lead: chars.slice(0, start).join(''),
        head: chars.slice(start, start + n).join(''),
        tail: chars.slice(start + n).join(''),
    };
}

// Рисунок рядом с местом чтения: ближайший впереди (текст обычно говорит
// «illustrated below:» перед схемой), иначе — последний пройденный.
export function nearbyBlock(tokens, i, ahead = 150, behind = 600) {
    for (let j = i; j < Math.min(tokens.length, i + ahead); j++) {
        if (tokens[j].k) return { token: tokens[j], i: j, ahead: j > i };
    }
    for (let j = i - 1; j >= Math.max(0, i - behind); j--) {
        if (tokens[j].k) return { token: tokens[j], i: j, ahead: false };
    }
    return null;
}
