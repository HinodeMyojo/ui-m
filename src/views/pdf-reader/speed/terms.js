import { lookupVocabWord, addVocabCard } from '@/components/api.js';

// Термины английской книги: перевод и карточка в словарь — docs/pdf-library.md
// (back-m), «Техническая книга».
//
// Одно слово — через словарь Яндекса на сервере (/vocab/lookup, en→ru): он
// даёт несколько значений, и для термина это полезнее одного «перевода».
// Фраза — через DeepL читалки, если в её настройках есть ключ; словарь
// фразы не знает.

const cache = new Map();

function isSingleWord(text) {
    return /^[A-Za-z][A-Za-z'’-]*$/.test(text.trim());
}

function fromYandex(data) {
    const defs = data?.def || [];
    const out = [];
    for (const def of defs) {
        for (const tr of def.tr || []) {
            if (tr.text && !out.includes(tr.text)) out.push(tr.text);
            if (out.length >= 4) break;
        }
        if (out.length >= 4) break;
    }
    return out.join(', ');
}

// deepl(text) → Promise<string|null> — перевод фразы, если читалке есть чем.
export async function translateTerm(text, deepl = null) {
    const term = text.replace(/[«»"“”„]/g, '').trim();
    if (!term) return { text: '', error: '' };
    if (cache.has(term)) return cache.get(term);
    let result = { text: '', error: '' };
    try {
        if (isSingleWord(term)) {
            result.text = fromYandex(await lookupVocabWord(term.toLowerCase()));
        }
        if (!result.text && deepl) {
            result.text = (await deepl(term)) || '';
        }
        if (!result.text) {
            result.error = isSingleWord(term)
                ? 'в словаре не нашлось'
                : 'для фраз нужен ключ DeepL — ⚙️ в панели читалки';
        }
    } catch (e) {
        result.error = e?.message || 'перевод недоступен';
    }
    if (result.text) cache.set(term, result);
    return result;
}

// Термин — в словарь с интервальными повторами. Определение из книги идёт
// примером: по нему термин вспоминается в контексте, а не голым словом.
export async function addTermToVocab(term, translation, definition) {
    return addVocabCard({
        word: term,
        translation: translation || definition || term,
        examples: definition || '',
    });
}
