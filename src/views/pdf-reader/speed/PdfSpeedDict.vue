<template>
    <div class="rsvp-dict" @pointerdown.stop @pointerup.stop>
        <!-- Пусто: подсказка, что делать -->
        <div v-if="!query" class="rsvp-dict-empty">
            <div class="rsvp-dict-empty-icon">📖</div>
            <div class="rsvp-dict-empty-title">Словарь</div>
            <div class="rsvp-note">
                Тапни слово в тексте или выдели фразу — здесь появятся перевод, значения,
                примеры, что это за понятие и как оно сказано в книге.
            </div>
            <div v-if="history.length" class="rsvp-dict-history">
                <span class="rsvp-note">Недавние:</span>
                <button v-for="h in history" :key="h" class="rsvp-chip rsvp-chip-wrap" @click="emit('pick', h)">{{ h }}</button>
            </div>
        </div>

        <template v-else>
            <div class="rsvp-dict-head">
                <div class="rsvp-dict-word">
                    <span class="rsvp-dict-title">{{ headTitle }}</span>
                    <span v-if="ya?.ts" class="rsvp-dict-ts">[{{ ya.ts }}]</span>
                </div>
                <div class="rsvp-dict-actions">
                    <button class="rsvp-mini" title="Произнести" @click="speak(headTitle)">🔊</button>
                    <button class="rsvp-mini" :disabled="added || !vocabTranslation" :title="added ? 'Уже в словаре' : 'В словарь с повторами'"
                        @click="toVocab">{{ added ? '✓' : '＋' }}</button>
                    <button v-if="closable" class="rsvp-mini" title="Закрыть" @click="emit('close')">✕</button>
                </div>
            </div>

            <div v-if="history.length > 1" class="rsvp-dict-history">
                <button v-for="h in history.slice(1, 8)" :key="h" class="rsvp-chip rsvp-chip-wrap" @click="emit('pick', h)">{{ h }}</button>
            </div>

            <!-- Как сказано в самой книге -->
            <section v-if="bookTerm" class="rsvp-dict-sec rsvp-dict-book">
                <div class="rsvp-dict-label">📘 В этой книге</div>
                <div><b>{{ bookTerm.term }}</b> {{ bookTerm.def }}</div>
            </section>

            <!-- Аббревиатура: расшифровку даёт Википедия и сама книга -->
            <section v-if="acronym && !bookTerm && !wp && wpState !== 'loading'" class="rsvp-dict-sec">
                <div class="rsvp-dict-label">Аббревиатура</div>
                <div class="rsvp-note">Расшифровка не нашлась — спроси ИИ ниже, он объяснит по контексту.</div>
            </section>

            <!-- Фраза: перевод целиком -->
            <section v-if="!single && !acronym" class="rsvp-dict-sec">
                <div class="rsvp-dict-label">Перевод фразы</div>
                <div v-if="phraseTr.loading" class="rsvp-note"><span class="rsvp-spin rsvp-spin-sm"></span>перевожу…</div>
                <div v-else-if="phraseTr.text" class="rsvp-dict-main">{{ phraseTr.text }}</div>
                <div v-else class="rsvp-note">{{ phraseTr.error || 'Для фраз нужен ключ DeepL — ⚙️ в панели читалки.' }}</div>
            </section>

            <!-- Яндекс: переводы по частям речи -->
            <section v-if="single" class="rsvp-dict-sec">
                <div class="rsvp-dict-label">Перевод</div>
                <div v-if="yaState === 'loading'" class="rsvp-note"><span class="rsvp-spin rsvp-spin-sm"></span>ищу в словаре…</div>
                <div v-else-if="!ya" class="rsvp-note">{{ yaState === 'error' ? 'Словарь недоступен' : 'В словаре не нашлось' }}</div>
                <div v-for="g in ya?.groups || []" :key="g.pos" class="rsvp-dict-group">
                    <div class="rsvp-dict-pos">{{ posRu(g.pos) }}</div>
                    <ol class="rsvp-dict-list">
                        <li v-for="tr in g.translations" :key="tr.text">
                            <b>{{ tr.text }}</b><template v-if="tr.syn.length">, {{ tr.syn.join(', ') }}</template>
                            <span v-if="tr.mean.length" class="rsvp-dict-mean"> ({{ tr.mean.join(', ') }})</span>
                            <div v-for="e in tr.ex" :key="e.text" class="rsvp-dict-ex">{{ e.text }} — {{ e.tr }}</div>
                        </li>
                    </ol>
                </div>
            </section>

            <!-- Викисловарь: толкование по-английски -->
            <section v-if="single && (wk.length || wkState === 'loading')" class="rsvp-dict-sec">
                <div class="rsvp-dict-label">Толкование (англ.)</div>
                <div v-if="wkState === 'loading'" class="rsvp-note"><span class="rsvp-spin rsvp-spin-sm"></span>Викисловарь…</div>
                <div v-for="g in wk" :key="g.pos" class="rsvp-dict-group">
                    <div class="rsvp-dict-pos">{{ g.pos }}</div>
                    <ol class="rsvp-dict-list">
                        <li v-for="d in g.defs" :key="d.text">
                            {{ d.text }}
                            <div v-for="e in d.examples" :key="e" class="rsvp-dict-ex">«{{ e }}»</div>
                        </li>
                    </ol>
                </div>
            </section>

            <!-- Википедия: что это за понятие -->
            <section v-if="wp || wpState === 'loading'" class="rsvp-dict-sec">
                <div class="rsvp-dict-label">Что это <span v-if="wp" class="rsvp-dict-src">· Википедия{{ wp.lang === 'en' ? ' (англ.)' : '' }}</span></div>
                <div v-if="wpState === 'loading'" class="rsvp-note"><span class="rsvp-spin rsvp-spin-sm"></span>Википедия…</div>
                <template v-else-if="wp">
                    <div class="rsvp-dict-wp-title">{{ wp.title }}</div>
                    <div class="rsvp-dict-text">{{ wp.extract }}</div>
                    <a v-if="wp.url" class="rsvp-dict-link" :href="wp.url" target="_blank" rel="noopener">Статья целиком ↗</a>
                </template>
            </section>

            <!-- Контекст из книги -->
            <section v-if="query.sentence" class="rsvp-dict-sec">
                <div class="rsvp-dict-label">В тексте · стр. {{ query.page }}</div>
                <div class="rsvp-dict-text rsvp-dict-context">
                    <template v-for="(part, k) in sentenceParts" :key="k"><mark v-if="part.hit">{{ part.text }}</mark><template
                        v-else>{{ part.text }}</template></template>
                </div>
                <div v-if="sentenceTr.text" class="rsvp-dict-text rsvp-dict-tr">{{ sentenceTr.text }}</div>
                <div v-else-if="sentenceTr.error" class="rsvp-note">{{ sentenceTr.error }}</div>
                <button v-else-if="deepl" class="rsvp-chip rsvp-chip-wrap" :disabled="sentenceTr.loading" @click="translateSentence">
                    {{ sentenceTr.loading ? 'перевожу…' : '🌐 перевести предложение' }}</button>
            </section>

            <!-- ИИ: объяснение именно в этом контексте -->
            <section class="rsvp-dict-sec">
                <div class="rsvp-dict-label">Объяснение в контексте книги</div>
                <div v-if="ai.html" class="rsvp-dict-ai" v-html="ai.html"></div>
                <div v-else-if="ai.error" class="rsvp-note">{{ ai.error }}</div>
                <button v-if="explain && !ai.html" class="rsvp-btn" :disabled="ai.loading" @click="askExplain">
                    {{ ai.loading ? 'думаю…' : `🤖 Объяснить (${aiLabel})` }}</button>
                <div v-if="!explain" class="rsvp-note">
                    Нужен ключ ИИ-провайдера: ⚙️ в панели читалки → «Анализ». Тогда здесь будет
                    объяснение термина именно в этом предложении книги.
                </div>
            </section>
        </template>
    </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { yandexEntry, wiktionary, wikipedia, isSingleWord, isAcronym, cleanWord, posRu, speak, miniMarkdown } from './lookup.js';
import { addTermToVocab } from './terms.js';

// Словарь режима «Читать» — docs/pdf-library.md (back-m), «Словарь при чтении».

const props = defineProps({
    query: { type: Object, default: null },      // { text, sentence, page }
    bookTitle: { type: String, default: '' },
    bookTerm: { type: Object, default: null },   // { term, def } из врезок книги
    deepl: { type: Function, default: null },
    explain: { type: Function, default: null },  // (term, sentence) → Promise<markdown>
    aiLabel: { type: String, default: 'ИИ' },
    history: { type: Array, default: () => [] },
    closable: Boolean,
});
const emit = defineEmits(['close', 'pick']);

const acronym = computed(() => !!props.query && isAcronym(props.query.text));
// Обычное слово — к словарям; аббревиатура и фраза — к Википедии и ИИ.
const single = computed(() => !!props.query && isSingleWord(props.query.text) && !acronym.value);
const ya = ref(null);
const yaState = ref('');
const wk = ref([]);
const wkState = ref('');
const wp = ref(null);
const wpState = ref('');
const phraseTr = reactive({ loading: false, text: '', error: '' });
const sentenceTr = reactive({ loading: false, text: '', error: '' });
const ai = reactive({ loading: false, html: '', error: '' });
const added = ref(false);

const headTitle = computed(() => {
    if (!props.query) return '';
    if (acronym.value) return cleanWord(props.query.text);
    return single.value ? (ya.value?.lemma || cleanWord(props.query.text)) : props.query.text.trim();
});

const vocabTranslation = computed(() => {
    if (single.value) return ya.value?.groups?.[0]?.translations?.[0]?.text || '';
    return phraseTr.text;
});

// Предложение с подсвеченным словом.
const sentenceParts = computed(() => {
    const s = props.query?.sentence || '';
    const w = cleanWord(props.query?.text || '');
    if (!w) return [{ text: s }];
    const at = s.toLowerCase().indexOf(w.toLowerCase());
    if (at < 0) return [{ text: s }];
    return [
        { text: s.slice(0, at) },
        { text: s.slice(at, at + w.length), hit: true },
        { text: s.slice(at + w.length) },
    ];
});

let token = 0;

async function load(q) {
    const my = ++token;
    ya.value = null; wk.value = []; wp.value = null;
    yaState.value = wkState.value = wpState.value = '';
    Object.assign(phraseTr, { loading: false, text: '', error: '' });
    Object.assign(sentenceTr, { loading: false, text: '', error: '' });
    Object.assign(ai, { loading: false, html: '', error: '' });
    added.value = false;
    if (!q) return;
    const text = q.text.trim();

    if (isSingleWord(text) && !isAcronym(text)) {
        yaState.value = 'loading';
        wkState.value = 'loading';
        yandexEntry(text).then((r) => { if (my === token) { ya.value = r; yaState.value = 'done'; } })
            .catch(() => { if (my === token) yaState.value = 'error'; });
        wiktionary(text)
            .then(async (r) => {
                // «payments» в Викисловаре — только «форма множественного
                // числа»; толкование — у начальной формы из Яндекса.
                if (my !== token) return;
                const lemma = (await yandexEntry(text).catch(() => null))?.lemma;
                if (lemma && lemma.toLowerCase() !== cleanWord(text).toLowerCase()) {
                    const base = await wiktionary(lemma).catch(() => []);
                    if (base.length) r = base;
                }
                if (my === token) { wk.value = r; wkState.value = 'done'; }
            })
            .catch(() => { if (my === token) wkState.value = 'error'; });
    } else if (props.deepl && !isAcronym(text)) {
        phraseTr.loading = true;
        props.deepl(text)
            .then((r) => { if (my === token) phraseTr.text = r || ''; })
            .catch((e) => { if (my === token) phraseTr.error = e.message; })
            .finally(() => { if (my === token) phraseTr.loading = false; });
    }

    // Википедия нужна понятиям: фразам, аббревиатурам и именам (ACH, Fedwire,
    // NACHA). На обычном слове она шумит — «value» находит «Карту предоплаты»,
    // — поэтому для него идём туда, только если словарь слова не знает.
    const concept = !isSingleWord(text) || /^[A-Z]/.test(cleanWord(text));
    const askWiki = () => {
        if (my !== token || cleanWord(text).length < 3) return;
        wpState.value = 'loading';
        wikipedia(text, props.bookTitle)
            .then((r) => { if (my === token) { wp.value = r; wpState.value = 'done'; } })
            .catch(() => { if (my === token) wpState.value = 'error'; });
    };
    if (concept) askWiki();
    else yandexEntry(text).then((r) => { if (!r) askWiki(); }).catch(askWiki);
}

watch(() => props.query, load, { immediate: true });

async function translateSentence() {
    if (!props.deepl || !props.query?.sentence) return;
    sentenceTr.loading = true;
    try {
        sentenceTr.text = (await props.deepl(props.query.sentence)) || '';
        if (!sentenceTr.text) sentenceTr.error = 'Перевод не получен';
    } catch (e) {
        sentenceTr.error = e.message;
    } finally {
        sentenceTr.loading = false;
    }
}

async function askExplain() {
    if (!props.explain || !props.query) return;
    ai.loading = true;
    ai.error = '';
    try {
        ai.html = miniMarkdown(await props.explain(headTitle.value, props.query.sentence || ''));
    } catch (e) {
        ai.error = e.message;
    } finally {
        ai.loading = false;
    }
}

async function toVocab() {
    try {
        await addTermToVocab(headTitle.value, vocabTranslation.value, props.query?.sentence || '');
        added.value = true;
    } catch (e) {
        ai.error = `не добавилось в словарь: ${e.message}`;
    }
}
</script>
