import { ref, watch } from 'vue';

export const LANGUAGES = [
    { code: 'EN', name: 'English' },
    { code: 'RU', name: 'Русский' },
    { code: 'DE', name: 'Deutsch' },
    { code: 'FR', name: 'Français' },
    { code: 'ES', name: 'Español' },
    { code: 'IT', name: 'Italiano' },
    { code: 'PT', name: 'Português' },
    { code: 'PL', name: 'Polski' },
    { code: 'NL', name: 'Nederlands' },
    { code: 'ZH', name: '中文' },
    { code: 'JA', name: '日本語' },
    { code: 'KO', name: '한국어' },
    { code: 'AR', name: 'العربية' },
    { code: 'TR', name: 'Türkçe' },
    { code: 'UK', name: 'Українська' },
];

// BCP-47 map for TTS
const LANG_BCP47 = {
    EN: 'en-US', RU: 'ru-RU', DE: 'de-DE', FR: 'fr-FR', ES: 'es-ES',
    IT: 'it-IT', PT: 'pt-PT', PL: 'pl-PL', NL: 'nl-NL', ZH: 'zh-CN',
    JA: 'ja-JP', KO: 'ko-KR', AR: 'ar-SA', TR: 'tr-TR', UK: 'uk-UA',
};

export function usePdfTranslation(fileName) {
    // ── API key (global, persisted) ───────────────────────────────────────
    const apiKey = ref(localStorage.getItem('deepl-api-key') ?? '');
    watch(apiKey, (v) => localStorage.setItem('deepl-api-key', v));

    // ── Hover mode (global) ───────────────────────────────────────────────
    const hoverMode = ref(localStorage.getItem('pdf-translate-hover') === '1');
    watch(hoverMode, (v) => localStorage.setItem('pdf-translate-hover', v ? '1' : '0'));

    // ── Per-book language settings ────────────────────────────────────────
    const sourceLang = ref('EN');
    const targetLang = ref('RU');

    function langStorageKey() { return `pdf-lang-${fileName.value}`; }

    function loadLanguageSettings() {
        if (!fileName.value) return;
        try {
            const raw = localStorage.getItem(langStorageKey());
            if (raw) {
                const { src, tgt } = JSON.parse(raw);
                if (src) sourceLang.value = src;
                if (tgt) targetLang.value = tgt;
            }
        } catch { /* ignore */ }
    }

    function saveLanguageSettings() {
        if (!fileName.value) return;
        localStorage.setItem(langStorageKey(), JSON.stringify({ src: sourceLang.value, tgt: targetLang.value }));
    }

    watch(fileName, loadLanguageSettings, { immediate: true });
    watch([sourceLang, targetLang], saveLanguageSettings);

    // ── Translation state ─────────────────────────────────────────────────
    const isTranslating = ref(false);
    const translationError = ref('');
    const lastTranslation = ref(null);
    // { original, translated, detectedLang }

    // In-memory cache: key = `${text}|||${src}|||${tgt}`
    const cache = new Map();

    async function translate(text, src, tgt) {
        if (!text?.trim()) return null;
        if (!apiKey.value) {
            translationError.value = 'API ключ DeepL не задан. Откройте настройки (⚙️).';
            return null;
        }

        const cacheKey = `${text}|||${src}|||${tgt}`;
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            lastTranslation.value = cached;
            return cached;
        }

        isTranslating.value = true;
        translationError.value = '';

        try {
            // Try Free API endpoint first; fall back to Pro if 403
            // Requests go through Vite dev proxy (/deepl-free → api-free.deepl.com)
            const endpoints = [
                '/deepl-free/v2/translate',
                '/deepl-pro/v2/translate',
            ];

            let result = null;
            for (const endpoint of endpoints) {
                const body = { text: [text], target_lang: tgt };
                if (src && src !== 'AUTO') body.source_lang = src;

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `DeepL-Auth-Key ${apiKey.value}`,
                    },
                    body: JSON.stringify(body),
                });

                if (res.status === 403) continue; // try next endpoint
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message ?? `HTTP ${res.status}`);
                }

                const data = await res.json();
                const t = data.translations?.[0];
                if (t) {
                    result = {
                        original: text,
                        translated: t.text,
                        detectedLang: t.detected_source_language,
                    };
                    break;
                }
            }

            if (!result) throw new Error('Перевод не получен');

            cache.set(cacheKey, result);
            lastTranslation.value = result;
            return result;
        } catch (e) {
            translationError.value = e.message ?? 'Ошибка перевода';
            return null;
        } finally {
            isTranslating.value = false;
        }
    }

    async function checkApiKey() {
        if (!apiKey.value) return { ok: false, error: 'Ключ не задан' };
        try {
            for (const endpoint of [
                '/deepl-free/v2/usage',
                '/deepl-pro/v2/usage',
            ]) {
                const res = await fetch(endpoint, {
                    headers: { Authorization: `DeepL-Auth-Key ${apiKey.value}` },
                });
                if (res.status === 403) continue;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                return { ok: true, used: data.character_count, limit: data.character_limit };
            }
            return { ok: false, error: 'Неверный ключ' };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // ── AI Word/Sentence Analysis ─────────────────────────────────────────
    // analyzeProvider: 'gemini' | 'claude' | 'openai' | 'gigachat'
    // analyzeResult: string (markdown text from AI)

    const analyzeProvider = ref(localStorage.getItem('pdf-analyze-provider') ?? 'gigachat');
    watch(analyzeProvider, v => localStorage.setItem('pdf-analyze-provider', v));

    const analyzeKeys = ref(JSON.parse(localStorage.getItem('pdf-analyze-keys') ?? '{}'));
    // { gemini: '...', claude: '...', openai: '...', gigachat: '...' }
    watch(analyzeKeys, v => localStorage.setItem('pdf-analyze-keys', JSON.stringify(v)), { deep: true });

    // GigaChat OAuth token cache
    let gcTokenCache = { token: '', expiresAt: 0 };

    async function getGigaChatToken(authKey) {
        if (gcTokenCache.token && Date.now() < gcTokenCache.expiresAt - 60_000) {
            return gcTokenCache.token;
        }
        const res = await fetch('/gigachat-auth/api/v2/oauth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'Authorization': `Basic ${authKey}`,
                'RqUID': crypto.randomUUID(),
            },
            body: 'scope=GIGACHAT_API_PERS',
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d?.message ?? `GigaChat auth HTTP ${res.status}`);
        }
        const data = await res.json();
        gcTokenCache = { token: data.access_token, expiresAt: data.expires_at ?? (Date.now() + 25 * 60_000) };
        return gcTokenCache.token;
    }

    const analyzeResult = ref('');
    const isAnalyzing = ref(false);
    const analyzeError = ref('');
    const analyzeCache = new Map();

    function buildAnalyzePrompt(text, provider) {
        const isWord = text.trim().split(/\s+/).length === 1;
        const isGigaChat = provider === 'gigachat';

        // GigaChat-specific formatting note — it handles markdown tables and headers natively well
        const fmtNote = isGigaChat
            ? 'Используй markdown: ## заголовки, - списки, **жирный**, таблицы где уместно. Структурируй ответ чётко по разделам.'
            : 'Используй ## заголовки и - списки. Не используй таблицы.';

        if (isWord) {
            return `Ты — языковой тьютор для студента уровня B1. Разбери слово для изучения языка.

Слово: **${text}**

Автоматически определи язык. Ответ дай на русском (объяснения), но примеры — на языке слова.

## 1. Основное
- Язык · Часть речи · Начальная форма
- Транскрипция МФА (если английский/немецкий/французский)
- Буквально: что означает корень слова

## 2. Грамматика
Только то, что применимо к данной форме: род, число, падеж/склонение, время, вид, лицо, залог.

## 3. Состав слова
Разбей на морфемы со значением каждой. Если слово простое — скажи об этом.
Формат: приставка + корень + суффикс + окончание = основа

## 4. Семья слова
5–7 однокоренных слов, сгруппированных по частям речи (существительные / глаголы / прилагательные).
Для каждого — перевод и пример использования в 3–5 словах.

## 5. Синонимы · Антонимы
Синонимы (4–5) и антонимы (2–3) с кратким пояснением разницы в употреблении.

## 6. Речевые паттерны
Покажи 4 устойчивых выражения или коллокации с этим словом — те, что реально используются в речи.
Формат: **выражение** — перевод — контекст употребления

## 7. Примеры (B1 уровень)
3 предложения от простого к сложному. После каждого — краткий грамматический комментарий в скобках.

${fmtNote}`;
        } else {
            return `Ты — языковой тьютор для студента уровня B1. Разбери предложение или фразу для изучения языка.

Текст: **«${text}»**

Автоматически определи язык. Ответ дай на русском.

## 1. Тип и характер предложения
- Язык · Тип (простое / сложное)
- Цель высказывания · Эмоциональная окраска

## 2. Разбор по членам
Разбери каждое слово: укажи часть речи, роль в предложении, грамматическую форму.
${isGigaChat ? 'Используй таблицу: | Слово | Часть речи | Роль | Форма |' : 'Формат: **слово** → часть речи, роль, форма'}

## 3. Глагол и время
- Глагол(ы): форма, время, вид, залог
- Почему используется именно эта форма? Объясни правило.
- Как изменится смысл при смене времени? Приведи 2 примера трансформации.

## 4. Структура (для B1)
- Что делает это предложение сложным / интересным грамматически?
- Похожие конструкции, которые стоит запомнить (2–3 шаблона)

## 5. Лексика
- Стиль (нейтральный / книжный / разговорный / профессиональный)
- 2–3 слова из предложения, которые стоит изучить отдельно — с пояснением почему

## 6. Как сказать иначе
2 перефразировки: одна проще, одна сложнее уровнем. С пояснением что изменилось.

${fmtNote}`;
        }
    }

    async function analyzeText(text) {
        if (!text?.trim()) return;
        const key = `${analyzeProvider.value}:${text.trim()}`;
        if (analyzeCache.has(key)) {
            analyzeResult.value = analyzeCache.get(key);
            analyzeError.value = '';
            return;
        }

        const provider = analyzeProvider.value;
        const apiKey = analyzeKeys.value[provider];
        if (!apiKey) {
            analyzeError.value = `API ключ для ${providerLabel(provider)} не задан. Откройте настройки (⚙️).`;
            return;
        }

        isAnalyzing.value = true;
        analyzeError.value = '';
        analyzeResult.value = '';
        const prompt = buildAnalyzePrompt(text, provider);

        try {
            let resultText = '';

            if (provider === 'gemini') {
                const res = await fetch(
                    `/gemini-api/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                    }
                );
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d?.error?.message ?? `HTTP ${res.status}`);
                }
                const data = await res.json();
                resultText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

            } else if (provider === 'claude') {
                const res = await fetch('/claude-api/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: 'claude-haiku-4-5',
                        max_tokens: 1024,
                        messages: [{ role: 'user', content: prompt }],
                    }),
                });
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d?.error?.message ?? `HTTP ${res.status}`);
                }
                const data = await res.json();
                resultText = data.content?.[0]?.text ?? '';

            } else if (provider === 'openai') {
                const res = await fetch('/openai-api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        max_tokens: 1024,
                        messages: [{ role: 'user', content: prompt }],
                    }),
                });
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d?.error?.message ?? `HTTP ${res.status}`);
                }
                const data = await res.json();
                resultText = data.choices?.[0]?.message?.content ?? '';

            } else if (provider === 'gigachat') {
                const token = await getGigaChatToken(apiKey);
                const res = await fetch('/gigachat-api/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        model: 'GigaChat',
                        max_tokens: 1024,
                        messages: [{ role: 'user', content: prompt }],
                    }),
                });
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d?.message ?? `GigaChat HTTP ${res.status}`);
                }
                const data = await res.json();
                resultText = data.choices?.[0]?.message?.content ?? '';
            }

            if (!resultText) throw new Error('Пустой ответ от AI');
            analyzeCache.set(key, resultText);
            analyzeResult.value = resultText;
        } catch (e) {
            analyzeError.value = e.message ?? 'Ошибка анализа';
        } finally {
            isAnalyzing.value = false;
        }
    }

    function providerLabel(p) {
        return { gemini: 'Gemini', claude: 'Claude', openai: 'OpenAI', gigachat: 'GigaChat' }[p] ?? p;
    }

    // ── TTS ───────────────────────────────────────────────────────────────
    function speakText(text, lang) {
        if (!window.speechSynthesis || !text) return;
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = LANG_BCP47[lang] ?? (lang.toLowerCase() + '-' + lang.toUpperCase());
        window.speechSynthesis.speak(utt);
    }

    function stopSpeech() {
        window.speechSynthesis?.cancel();
    }

    return {
        apiKey,
        hoverMode,
        sourceLang,
        targetLang,
        isTranslating,
        translationError,
        lastTranslation,
        translate,
        checkApiKey,
        speakText,
        stopSpeech,
        loadLanguageSettings,
        saveLanguageSettings,
        analyzeText,
        analyzeResult,
        isAnalyzing,
        analyzeError,
        analyzeProvider,
        analyzeKeys,
        LANGUAGES,
    };
}
