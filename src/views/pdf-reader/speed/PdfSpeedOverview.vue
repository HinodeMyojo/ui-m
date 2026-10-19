<template>
    <div class="rsvp-sheet-backdrop" @click.self="emit('close')">
        <div class="rsvp-sheet rsvp-overview" role="dialog" aria-label="Обзор главы">
            <div class="rsvp-sheet-head">
                <div>
                    <div class="rsvp-overline">{{ chapter ? 'Обзор главы' : 'Обзор ближайших страниц' }}</div>
                    <div class="rsvp-sheet-title">{{ chapter?.title || `Страницы ${range.from}–${range.to}` }}</div>
                </div>
                <button class="rsvp-icon" aria-label="Закрыть" @click="emit('close')">✕</button>
            </div>

            <div class="rsvp-ov-facts">
                <span>стр. {{ range.from }}–{{ range.to }}</span>
                <span v-if="summary">{{ summary.words.toLocaleString('ru-RU') }} слов</span>
                <span v-if="summary">≈ {{ formatMinutes(summary.words / wpm) }} на {{ wpm }} сл/мин</span>
                <span v-if="summary && summary.blocks.length">{{ summary.blocks.length }} {{ plural(summary.blocks.length, 'рисунок', 'рисунка', 'рисунков') }}</span>
            </div>

            <div v-if="!summary" class="rsvp-note">
                <span class="rsvp-spin rsvp-spin-sm"></span>
                Разбираю страницы{{ progress.total ? ` ${progress.done} из ${progress.total}` : '' }}…
            </div>

            <template v-else>
                <!-- Вопросы до чтения: на что глава должна ответить -->
                <section v-if="fileId && chapter" class="rsvp-ov-section">
                    <div class="rsvp-ov-title">Мои вопросы к главе</div>
                    <div class="rsvp-note">
                        Два-три вопроса, на которые хочешь получить ответ. Читается целенаправленно,
                        и после главы будет что вспомнить.
                    </div>
                    <div v-for="(q, k) in questions" :key="k" class="rsvp-q-row">
                        <input class="rsvp-input" v-model="questions[k]" :placeholder="placeholders[k]"
                            @keydown.stop @change="saveQuestions" />
                    </div>
                    <div v-if="suggestions.length" class="rsvp-q-suggest">
                        <span class="rsvp-note">Можно взять:</span>
                        <button v-for="s in suggestions" :key="s" class="rsvp-chip rsvp-chip-wrap" @click="useSuggestion(s)">{{ s }}</button>
                    </div>
                    <div v-if="saveState" class="rsvp-note">{{ saveState }}</div>
                </section>

                <!-- Карта главы: разделы и первая фраза каждого -->
                <section v-if="summary.headings.length" class="rsvp-ov-section">
                    <div class="rsvp-ov-title">План</div>
                    <button v-for="h in summary.headings" :key="h.p + ':' + h.i" class="rsvp-ov-heading"
                        @click="emit('jump', { page: h.p, offset: h.i })">
                        <span class="rsvp-ov-h">{{ h.text }} <em>стр. {{ h.p }}</em></span>
                        <span v-if="h.lead" class="rsvp-ov-lead">{{ h.lead }}</span>
                    </button>
                </section>

                <!-- Рисунки и листинги: посмотреть заранее, что ждёт в главе -->
                <section v-if="summary.blocks.length" class="rsvp-ov-section">
                    <div class="rsvp-ov-title">Рисунки и таблицы</div>
                    <div class="rsvp-ov-figs">
                        <button v-for="b in summary.blocks.slice(0, figLimit)" :key="b.p + ':' + b.i" class="rsvp-ov-fig"
                            @click="emit('jump', { page: b.p, offset: b.i })">
                            <PdfSpeedBlock :pdfDoc="pdfDoc" :page="b.p" :box="b.box" :maxHeight="110" />
                            <span>{{ b.k === 'code' ? 'код' : 'рисунок' }} · стр. {{ b.p }}</span>
                        </button>
                    </div>
                    <button v-if="summary.blocks.length > figLimit" class="rsvp-btn rsvp-btn-ghost"
                        @click="figLimit += 12">Ещё {{ summary.blocks.length - figLimit }}</button>
                </section>

                <!-- Термины: перевод и карточка в словарь -->
                <section v-if="summary.terms.length" class="rsvp-ov-section">
                    <div class="rsvp-ov-title">Термины главы</div>
                    <div v-for="t in summary.terms" :key="t.term" class="rsvp-term">
                        <div class="rsvp-term-head">
                            <b>{{ t.term }}</b>
                            <span class="rsvp-term-actions">
                                <button class="rsvp-mini" title="Перевести" @click="translate(t)">🌐</button>
                                <button class="rsvp-mini" :disabled="added[t.term]" :title="added[t.term] ? 'Уже в словаре' : 'В словарь с повторами'"
                                    @click="toVocab(t)">{{ added[t.term] ? '✓' : '＋' }}</button>
                            </span>
                        </div>
                        <div v-if="translations[t.term]" class="rsvp-term-tr">{{ translations[t.term] }}</div>
                        <div class="rsvp-term-def">{{ t.def }}</div>
                    </div>
                </section>

                <!-- Книга целиком: успеть к сроку -->
                <section v-if="fileId" class="rsvp-ov-section">
                    <div class="rsvp-ov-title">Дочитать книгу</div>
                    <div class="rsvp-seg">
                        <button v-for="d in [1, 2, 3, 5, 7]" :key="d" :class="{ active: planDays === d }"
                            @click="planDays = d">{{ d === 1 ? 'сегодня' : `${d} дн.` }}</button>
                    </div>
                    <div v-if="plan.length" class="rsvp-plan">
                        <div class="rsvp-note">
                            Осталось ≈ {{ formatMinutes(totalMinutes) }} на {{ wpm }} сл/мин —
                            {{ planDays === 1 ? 'всё сегодня' : `≈ ${formatMinutes(totalMinutes / plan.length)} в день` }}.
                        </div>
                        <div v-for="d in plan" :key="d.date" class="rsvp-plan-row">
                            <span>{{ shortDate(d.date) }}</span>
                            <span>стр. {{ d.from }}–{{ d.to }}</span>
                            <span>{{ formatMinutes(d.minutes) }}</span>
                        </div>
                        <button class="rsvp-btn" :disabled="planBusy" @click="putPlan">
                            {{ planBusy ? 'Кладу…' : 'Положить в «Сегодня»' }}
                        </button>
                        <div v-if="planState" class="rsvp-note">{{ planState }}</div>
                    </div>
                </section>
            </template>

            <div class="rsvp-sheet-actions rsvp-sheet-sticky">
                <button class="rsvp-btn rsvp-btn-accent" @click="startReading">Читать главу ▶</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import PdfSpeedBlock from './PdfSpeedBlock.vue';
import { readingPlan } from './rsvpText.mjs';
import { translateTerm, addTermToVocab } from './terms.js';
import { saveChapterQuestions, planReadingToToday, pdfLogicalToday } from '@/api/pdfFiles.js';

// Обзор главы перед чтением — docs/pdf-library.md (back-m), «Техническая книга».
// Пять минут на карту главы экономят больше, чем любая скорость: понятно, что
// важно, что знакомо и что можно пролистнуть.

const props = defineProps({
    pdfDoc: { type: Object, required: true },
    source: { type: Object, required: true },
    chapter: { type: Object, default: null },     // { key, title, start, end }
    currentPage: { type: Number, default: 1 },
    pageCount: { type: Number, required: true },
    wpm: { type: Number, default: 300 },
    fileId: { type: String, default: '' },
    bookTitle: { type: String, default: '' },
    note: { type: Object, default: null },        // сохранённые вопросы главы
    deepl: { type: Function, default: null },
});
const emit = defineEmits(['close', 'start', 'jump', 'note-saved']);

// Без оглавления «глава» — ближайшие десять страниц от места чтения.
const range = computed(() => props.chapter
    ? { from: props.chapter.start, to: props.chapter.end }
    : { from: props.currentPage, to: Math.min(props.pageCount, props.currentPage + 9) });

const summary = ref(null);
const progress = reactive({ done: 0, total: 0 });
const figLimit = ref(12);

onMounted(async () => {
    summary.value = await props.source.chapterSummary(range.value.from, range.value.to, (done, total) => {
        progress.done = done;
        progress.total = total;
    });
});

function formatMinutes(min) {
    if (!min || min < 1) return '<1 мин';
    if (min < 60) return `${Math.round(min)} мин`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h} ч ${m} мин` : `${h} ч`;
}

function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
}

function shortDate(iso) {
    const [, m, d] = iso.split('-');
    return `${d}.${m}`;
}

// ── Вопросы ───────────────────────────────────────────────────────────────

const questions = ref(['', '', '']);
const placeholders = ['Что я хочу понять из этой главы?', 'Чем это отличается от того, что я знаю?', 'Где мне это пригодится?'];
const saveState = ref('');

watch(() => props.note, (note) => {
    const saved = note?.questions || [];
    questions.value = [0, 1, 2].map((k) => saved[k] || '');
}, { immediate: true });

// Подсказки из заголовков: «как устроено X?» — готовый вопрос к разделу.
const suggestions = computed(() => {
    if (!summary.value) return [];
    const have = new Set(questions.value.map((q) => q.trim().toLowerCase()));
    return summary.value.headings
        .filter((h) => h.text.length > 3 && h.text !== h.text.toUpperCase())
        .slice(0, 4)
        .map((h) => `Как устроено «${h.text}»?`)
        .filter((s) => !have.has(s.toLowerCase()));
});

function useSuggestion(text) {
    const k = questions.value.findIndex((q) => !q.trim());
    if (k < 0) return;
    questions.value[k] = text;
    saveQuestions();
}

async function saveQuestions() {
    if (!props.fileId || !props.chapter) return;
    try {
        const note = await saveChapterQuestions(props.fileId, props.chapter.key, {
            title: props.chapter.title,
            startPage: props.chapter.start,
            endPage: props.chapter.end,
            questions: questions.value,
        });
        saveState.value = 'Вопросы сохранены — после главы спрошу.';
        emit('note-saved', note);
    } catch (e) {
        saveState.value = `Не сохранилось: ${e.message}`;
    }
}

function startReading() {
    if (questions.value.some((q) => q.trim()) && !saveState.value.startsWith('Вопросы')) saveQuestions();
    emit('start');
}

// ── Термины ───────────────────────────────────────────────────────────────

const translations = reactive({});
const added = reactive({});

async function translate(t) {
    translations[t.term] = '…';
    const r = await translateTerm(t.term, props.deepl);
    translations[t.term] = r.text || r.error;
    return r.text;
}

async function toVocab(t) {
    const tr = translations[t.term] && translations[t.term] !== '…' ? translations[t.term] : await translate(t);
    try {
        await addTermToVocab(t.term, tr, t.def);
        added[t.term] = true;
    } catch (e) {
        translations[t.term] = `не добавилось: ${e.message}`;
    }
}

// ── План по дням ──────────────────────────────────────────────────────────

const planDays = ref(3);
const planBusy = ref(false);
const planState = ref('');

const plan = computed(() => readingPlan({
    fromPage: props.currentPage,
    pageCount: props.pageCount,
    wordsPerPage: props.source.wordsPerPage,
    wpm: props.wpm,
    days: planDays.value,
    today: pdfLogicalToday(),
}));
const totalMinutes = computed(() => plan.value.reduce((n, d) => n + d.minutes, 0));

async function putPlan() {
    planBusy.value = true;
    planState.value = '';
    try {
        const book = props.bookTitle || 'книга';
        const res = await planReadingToToday(props.fileId, plan.value.map((d) => ({
            date: d.date,
            title: `⚡ ${book}: стр. ${d.from}–${d.to}`,
            body: `Скорочтение ≈ ${formatMinutes(d.minutes)} на ${props.wpm} сл/мин. `
                + 'Перед главой — обзор и 2–3 вопроса, после — пересказ по памяти.',
            minutes: d.minutes,
        })));
        planState.value = res.skipped
            ? `Готово: ${res.created} в «Сегодня», ${res.skipped} уже были.`
            : `Готово: ${res.created} ${plural(res.created, 'день', 'дня', 'дней')} в «Сегодня».`;
    } catch (e) {
        planState.value = `Не получилось: ${e.message}`;
    } finally {
        planBusy.value = false;
    }
}
</script>
