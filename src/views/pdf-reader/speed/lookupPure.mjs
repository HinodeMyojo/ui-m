// Чистые помощники словаря — без сети и Vue, их проверяет `npm run check`.
// docs/pdf-library.md (back-m), «Словарь при чтении».

// Слово для словаря: без кавычек, скобок и притяжательного «’s».
export function cleanWord(text) {
    return text.replace(/[«»"“”„()[\]{}.,;:!?…]/g, '').replace(/['’]s$/i, '').trim();
}

// Аббревиатура (ACH, ODFI, NACHA) — в обычных словарях её нет, а в нижнем
// регистре она превращается в чужое слово: «ach» у Яндекса — междометие «ах».
export function isAcronym(text) {
    return /^[A-Z][A-Z0-9&]{1,7}s?$/.test(cleanWord(text));
}

export function isSingleWord(text) {
    return /^[A-Za-z][A-Za-z'’-]*$/.test(cleanWord(text));
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'guide', 'book', 'edition', 'in', 'of', 'to', 'a', 'an']);

// Тема книги из названия: «Payment Systems in U.S.» → «Payment Systems».
export function topicOf(bookTitle) {
    return (bookTitle || '').replace(/\.pdf$/i, '').split(/[^A-Za-z]+/)
        .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase())).slice(0, 3).join(' ');
}

// Какую статью из поиска взять.
//  • Аббревиатура — статья, у которой первые буквы слов складываются в неё
//    («Automated clearing house» для ACH), иначе — где она стоит целым словом.
//    Подстрока не годится: «ach» сидит внутри «NACHA».
//  • Остальное — где термин стоит целым словом; из таких самая общая, то есть
//    с самым коротким названием: «Settlement (finance)», а не «Payment and
//    settlement systems in India».
export function pickArticle(titles, term) {
    if (!titles.length) return '';
    const t = cleanWord(term);
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const whole = new RegExp(`(^|[^\\p{L}])${esc}([^\\p{L}]|$)`, 'iu');
    if (isAcronym(t)) {
        const ac = t.replace(/s$/, '').toUpperCase();
        const initials = (title) => title.replace(/\(.*?\)/g, '').split(/[\s-]+/)
            .filter((w) => w && !STOP.has(w.toLowerCase())).map((w) => w[0].toUpperCase()).join('');
        const byInitials = titles.find((x) => initials(x) === ac);
        if (byInitials) return byInitials;
    }
    const named = titles.filter((x) => whole.test(x)).sort((a, b) => a.length - b.length);
    return named[0] || titles[0];
}
