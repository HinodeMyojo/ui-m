import { lookupVocabWord } from '@/components/api.js';
import { cleanWord, isAcronym, isSingleWord, topicOf, pickArticle } from './lookupPure.mjs';

export { cleanWord, isAcronym, isSingleWord, topicOf, pickArticle };

// Словарь режима «Читать» — docs/pdf-library.md (back-m), «Словарь при чтении».
//
// Полная справка о слове из того, что доступно без своих ключей:
//  • словарь Яндекса (через сервер, /vocab/lookup) — переводы по частям речи,
//    транскрипция, значения, примеры;
//  • Викисловарь — английские толкования с примерами;
//  • Википедия — что это за понятие (русская статья, если есть, иначе
//    английская), ищется с темой книги, чтобы «clearing» нашёлся как
//    банковский клиринг, а не расчистка леса.
// Каждый источник грузится отдельно: медленный не держит остальные.

const cache = new Map();

function cached(key, fn) {
    if (!cache.has(key)) {
        const p = fn().catch((e) => {
            cache.delete(key);
            throw e;
        });
        cache.set(key, p);
    }
    return cache.get(key);
}

const POS_RU = {
    noun: 'сущ.', verb: 'глаг.', adjective: 'прил.', adverb: 'нареч.', pronoun: 'мест.',
    preposition: 'предл.', conjunction: 'союз', interjection: 'межд.', participle: 'прич.',
    'proper noun': 'имя собств.', numeral: 'числ.', abbreviation: 'сокр.', particle: 'частица',
};

export function posRu(pos) {
    return POS_RU[(pos || '').toLowerCase()] || pos || '';
}

// ── Яндекс ────────────────────────────────────────────────────────────────

export function yandexEntry(word) {
    const w = cleanWord(word).toLowerCase();
    return cached(`ya:${w}`, async () => {
        const data = await lookupVocabWord(w);
        const defs = data?.def || [];
        if (!defs.length) return null;
        return {
            lemma: defs[0].text,
            ts: defs.find((d) => d.ts)?.ts || '',
            groups: defs.map((d) => ({
                pos: d.pos,
                translations: (d.tr || []).slice(0, 6).map((tr) => ({
                    text: tr.text,
                    syn: (tr.syn || []).map((s) => s.text).slice(0, 5),
                    mean: (tr.mean || []).map((m) => m.text).slice(0, 4),
                    ex: (tr.ex || []).slice(0, 2).map((e) => ({ text: e.text, tr: e.tr?.[0]?.text || '' })),
                })),
            })),
        };
    });
}

// ── Викисловарь ───────────────────────────────────────────────────────────

function htmlText(html) {
    // Только текст: разметку Викисловаря в страницу не пускаем.
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export function wiktionary(word) {
    const w = cleanWord(word).toLowerCase();
    return cached(`wk:${w}`, async () => {
        const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w)}`);
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`Викисловарь: ${res.status}`);
        const data = await res.json();
        return (data.en || []).slice(0, 4).map((g) => ({
            pos: g.partOfSpeech,
            defs: (g.definitions || [])
                .map((d) => ({
                    text: htmlText(d.definition),
                    // «Can we add an example for this sense?» — заглушка Викисловаря.
                    examples: (d.parsedExamples || d.examples || [])
                        .map((e) => htmlText(e.example || e))
                        .filter((e) => e && !/add an example/i.test(e))
                        .slice(0, 1),
                }))
                .filter((d) => d.text)
                .slice(0, 4),
        })).filter((g) => g.defs.length);
    });
}

// ── Википедия ─────────────────────────────────────────────────────────────

async function wikiJson(host, params) {
    const qs = new URLSearchParams({ format: 'json', origin: '*', ...params });
    const res = await fetch(`https://${host}/w/api.php?${qs}`);
    if (!res.ok) throw new Error(`Википедия: ${res.status}`);
    return res.json();
}

async function wikiSummary(host, title) {
    const res = await fetch(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
    if (!res.ok) return null;
    const s = await res.json();
    if (s.type === 'disambiguation' || !s.extract) return null;
    return { title: s.title, extract: s.extract, url: s.content_urls?.desktop?.page || '' };
}

export function wikipedia(term, bookTitle) {
    const t = cleanWord(term);
    const topic = topicOf(bookTitle);
    return cached(`wp:${t}|${topic}`, async () => {
        const search = await wikiJson('en.wikipedia.org', {
            action: 'query', list: 'search', srsearch: topic ? `${t} ${topic}` : t, srlimit: '5',
        });
        const hits = search?.query?.search || [];
        if (!hits.length) return null;
        const hitTitle = pickArticle(hits.map((h) => h.title), t);
        const hit = { title: hitTitle };
        // Русская версия той же статьи, если есть.
        const links = await wikiJson('en.wikipedia.org', {
            action: 'query', prop: 'langlinks', lllang: 'ru', titles: hit.title,
        }).catch(() => null);
        const page = Object.values(links?.query?.pages || {})[0];
        const ruTitle = page?.langlinks?.[0]?.['*'];
        const ru = ruTitle ? await wikiSummary('ru.wikipedia.org', ruTitle).catch(() => null) : null;
        const en = ru ? null : await wikiSummary('en.wikipedia.org', hit.title).catch(() => null);
        const best = ru || en;
        return best ? { ...best, lang: ru ? 'ru' : 'en' } : null;
    });
}

// ── Произношение ──────────────────────────────────────────────────────────

export function speak(text) {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-US';
    utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
}

// Ответ ИИ — markdown. Разметку из ответа не доверяем: сначала экранируем,
// потом превращаем звёздочки и решётки в теги сами.
export function miniMarkdown(text) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
    const out = [];
    let list = false;
    for (const raw of (text || '').split('\n')) {
        const line = raw.trim();
        const item = line.match(/^[-*•]\s+(.*)$/);
        if (item) {
            if (!list) { out.push('<ul>'); list = true; }
            out.push(`<li>${inline(item[1])}</li>`);
            continue;
        }
        if (list) { out.push('</ul>'); list = false; }
        const h = line.match(/^#{1,4}\s+(.*)$/);
        if (h) out.push(`<h4>${inline(h[1])}</h4>`);
        else if (line) out.push(`<p>${inline(line)}</p>`);
    }
    if (list) out.push('</ul>');
    return out.join('');
}
