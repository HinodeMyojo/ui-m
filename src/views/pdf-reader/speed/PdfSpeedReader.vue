<template>
    <Teleport to="body">
        <div class="rsvp" :class="[`rsvp-theme-${theme}`, `rsvp-root-${mode}`, { 'rsvp-playing': playing, 'rsvp-ui-hidden': uiHidden, 'rsvp-side-narrow': mode === 'side' && !sideWide }]"
            :style="cssVars" @pointermove="onPointerMove" role="dialog" aria-label="Скорочтение">

            <!-- Шапка -->
            <header class="rsvp-top">
                <button class="rsvp-icon" title="Закрыть (Esc)" aria-label="Закрыть" @click="requestClose">✕</button>
                <div class="rsvp-title">
                    <div class="rsvp-book">{{ fileName || 'Скорочтение' }}</div>
                    <div class="rsvp-chapter">
                        <template v-if="topChapter">{{ topChapter.title }} · </template>стр. {{ currentPage }} из {{ pageCount }}<template
                            v-if="chapterScan"> · {{ chapterScan }}</template>
                    </div>
                </div>
                <button v-if="tokens.length" class="rsvp-icon" title="Обзор главы (O)" aria-label="Обзор главы" @click="openOverview()">🗺</button>
                <button v-if="fileId" class="rsvp-icon" title="Статистика" aria-label="Статистика" @click="openPanel('stats')">📈</button>
                <button class="rsvp-icon" title="Настройки (S)" aria-label="Настройки" @click="openPanel('settings')">⚙</button>
            </header>

            <!-- Сцена: слово, жесты, контекст на паузе -->
            <main class="rsvp-stage" :class="[`rsvp-mode-${mode}`, { 'rsvp-side-wide': sideWide }]" ref="stageEl"
                @pointerdown="onPointerDown" @pointerup="onPointerUp" @pointercancel="gesture = null">

                <div v-if="loading" class="rsvp-status">
                    <span class="rsvp-spin"></span>
                    <div>Достаю текст книги…</div>
                </div>

                <div v-else-if="noText" class="rsvp-status">
                    <div class="rsvp-status-icon">🖼</div>
                    <div class="rsvp-status-title">На этих страницах нет текста</div>
                    <div class="rsvp-status-text">
                        Похоже, книга — скан: страницы в ней картинками, читать по слову нечего.
                        Скорочтение работает с PDF, где текст можно выделить.
                    </div>
                    <button class="rsvp-btn" @click.stop="close">Вернуться к книге</button>
                </div>

                <!-- Режим «Текстом»: колонка текста, по ней бежит подсветка -->
                <PdfSpeedPacer v-else-if="mode === 'pacer'" :pdfDoc="pdfDoc" :tokens="tokens" :version="player.version.value"
                    :index="index" :frame="frame" :playing="playing" :atEnd="!!player.source.value?.atEnd"
                    :bionic="settings.bionic" :textSize="settings.textSize" :font="fontCss"
                    @seek="(i) => { started = true; player.seek(i); }" @toggle="toggle" />

                <!-- Рисунок, таблица или листинг: чтение стоит, смотрим сам кусок страницы -->
                <div v-else-if="frame && frame.block" class="rsvp-block" @pointerdown.stop @pointerup.stop>
                    <div class="rsvp-block-label">
                        {{ frame.block.k === 'code' ? '💻 Листинг' : '🖼 Рисунок' }} · стр. {{ frame.block.p }}
                    </div>
                    <div class="rsvp-block-scroll" :class="{ 'rsvp-block-scroll-wide': blockWide }">
                        <PdfSpeedBlock :pdfDoc="pdfDoc" :page="frame.block.p" :box="blockFull ? null : frame.block.box"
                            :maxHeight="blockMaxHeight" :wide="blockWide" />
                    </div>
                    <div class="rsvp-block-actions">
                        <button class="rsvp-btn" @click="blockWide = !blockWide">{{ blockWide ? 'Уместить' : 'Крупнее' }}</button>
                        <button class="rsvp-btn" @click="blockFull = !blockFull">{{ blockFull ? 'Только рисунок' : 'Вся страница' }}</button>
                        <button class="rsvp-btn rsvp-btn-accent" @click="play">Дальше ▶</button>
                    </div>
                </div>

                <template v-else-if="layout">
                    <div class="rsvp-wordarea">
                    <div class="rsvp-focus" :class="{ 'rsvp-guides': settings.guides }">
                        <div class="rsvp-word" :style="{ fontSize: layout.size + 'px' }" aria-live="off">
                            <span class="rsvp-before" :style="{ right: layout.beforeRight + 'px' }">{{ layout.before }}</span><span
                                class="rsvp-pivot" :style="{ left: layout.pivotLeft + 'px' }">{{ layout.pivot }}</span><span
                                class="rsvp-after" :style="{ left: layout.afterLeft + 'px' }">{{ layout.after }}</span>
                        </div>
                    </div>

                    <!-- Английский термин на паузе: перевод и карточка в словарь -->
                    <div v-if="canTranslate" class="rsvp-tr" @pointerdown.stop @pointerup.stop>
                        <button v-if="!wordTr" class="rsvp-chip rsvp-chip-wrap" @click="translateCurrent">🌐 перевод</button>
                        <template v-else>
                            <span class="rsvp-tr-text">{{ wordTr }}</span>
                            <button v-if="wordTrOk" class="rsvp-chip rsvp-chip-wrap" :disabled="wordAdded" @click="addCurrentToVocab">
                                {{ wordAdded ? '✓ в словаре' : '＋ в словарь' }}</button>
                        </template>
                    </div>
                    <div v-if="waiting" class="rsvp-hint">подгружаю следующую страницу…</div>
                    <div v-else-if="finished" class="rsvp-hint rsvp-hint-strong">Книга дочитана 🎉</div>
                    <div v-else-if="!started" class="rsvp-hint">{{ startHint }}</div>

                    <!-- Контекст: где я, что было до этого. Тап по слову — продолжить с него. -->
                    <div v-if="!playing && contextWords.length" class="rsvp-context" ref="contextEl"
                        @pointerdown.stop @pointerup.stop>
                        <template v-for="w in contextWords" :key="w.i">
                            <span class="rsvp-cw" :class="{ 'rsvp-cw-cur': w.cur, 'rsvp-cw-read': w.read }"
                                @click="seekTo(w.i)">{{ w.t }}</span>{{ w.para ? '' : ' ' }}<br v-if="w.para"><span
                                v-if="w.para" class="rsvp-cw-gap"></span>
                        </template>
                    </div>
                    </div>

                    <!-- Режим «С рисунками»: ближайшая схема рядом, слова не останавливаются -->
                    <aside v-if="mode === 'side'" class="rsvp-side" @pointerdown.stop @pointerup.stop @click="openZoom">
                        <div class="rsvp-side-label">
                            <template v-if="sideFigure">
                                {{ sideFigure.token.k === 'code' ? '💻 листинг' : '🖼 рисунок' }} · стр. {{ sideFigure.token.p }}
                                · {{ sideFigure.ahead ? 'сейчас будет' : (sideFigure.i === index ? 'здесь' : 'был выше') }}
                            </template>
                            <template v-else>📄 стр. {{ currentPage }} · рисунков рядом нет</template>
                        </div>
                        <div class="rsvp-side-body">
                            <PdfSpeedBlock :pdfDoc="pdfDoc" :page="sideFigure ? sideFigure.token.p : currentPage"
                                :box="sideFigure ? sideFigure.token.box : null" :maxHeight="sideHeight" />
                        </div>
                        <div class="rsvp-side-hint">тап — крупно</div>
                    </aside>
                </template>

                <!-- Крупно: рисунок из боковой панели -->
                <div v-if="zoomBlock" class="rsvp-zoom" @pointerdown.stop @pointerup.stop>
                    <div class="rsvp-block-label">стр. {{ zoomBlock.p }}</div>
                    <div class="rsvp-block-scroll" :class="{ 'rsvp-block-scroll-wide': blockWide }">
                        <PdfSpeedBlock :pdfDoc="pdfDoc" :page="zoomBlock.p" :box="zoomBlock.box"
                            :maxHeight="blockMaxHeight" :wide="blockWide" />
                    </div>
                    <div class="rsvp-block-actions">
                        <button class="rsvp-btn" @click="blockWide = !blockWide">{{ blockWide ? 'Уместить' : 'Крупнее' }}</button>
                        <button class="rsvp-btn rsvp-btn-accent" @click="zoomBlock = null">Закрыть</button>
                    </div>
                </div>

                <transition name="rsvp-fade">
                    <div v-if="flash" class="rsvp-flash">{{ flash }}</div>
                </transition>
            </main>

            <!-- Тонкая полоса прогресса — видна и когда панели спрятаны -->
            <div class="rsvp-mini-progress"><div :style="{ width: (bookProgress * 100) + '%' }"></div></div>

            <!-- Низ: прогресс, время, кнопки, скорость -->
            <footer class="rsvp-bottom" @click.capture="releaseFocus">
                <div class="rsvp-modes" role="tablist" aria-label="Режим чтения">
                    <button v-for="m in MODES" :key="m.code" class="rsvp-mode" :class="{ active: mode === m.code }"
                        role="tab" :aria-selected="mode === m.code" :title="m.hint + ' (M)'" @click="setMode(m.code)">
                        <span class="rsvp-mode-icon">{{ m.icon }}</span>{{ m.label }}
                    </button>
                </div>
                <div class="rsvp-bars">
                    <div v-if="chapter" class="rsvp-bar rsvp-bar-chapter" title="Глава">
                        <div :style="{ width: (chapterProgress * 100) + '%' }"></div>
                    </div>
                    <div class="rsvp-bar" title="Книга">
                        <div :style="{ width: (bookProgress * 100) + '%' }"></div>
                    </div>
                </div>
                <div class="rsvp-meta">
                    <span v-if="chapter">глава: ещё {{ formatMinutes(chapterMinutesLeft) }}</span>
                    <span>книга {{ Math.round(bookProgress * 100) }}% · ещё {{ formatMinutes(bookMinutesLeft) }}</span>
                    <span v-if="trainerLabel" class="rsvp-meta-live">{{ trainerLabel }}</span>
                    <span v-if="sessionWords" class="rsvp-meta-live">
                        {{ sessionWords.toLocaleString('ru-RU') }} сл · {{ formatMinutes(sessionMinutes) }}<template
                            v-if="liveWpm"> · {{ liveWpm }} сл/мин</template>
                    </span>
                </div>

                <div class="rsvp-controls">
                    <button class="rsvp-ctl" title="Предложение назад (←)" aria-label="Предложение назад" @click="backSentence">⏮</button>
                    <button class="rsvp-ctl" title="Медленнее (↓)" aria-label="Медленнее" @click="changeWpm(-WPM_STEP)">−</button>
                    <button class="rsvp-ctl rsvp-play" :title="playing ? 'Пауза (пробел)' : 'Читать (пробел)'"
                        :aria-label="playing ? 'Пауза' : 'Читать'" :disabled="(!frame) || finished" @click="toggle">
                        <span v-if="playing">❚❚</span><span v-else class="rsvp-play-icon">▶</span>
                    </button>
                    <button class="rsvp-ctl" title="Быстрее (↑)" aria-label="Быстрее" @click="changeWpm(WPM_STEP)">+</button>
                    <button class="rsvp-ctl" title="Предложение вперёд (→)" aria-label="Предложение вперёд" @click="forwardSentence">⏭</button>
                </div>

                <div class="rsvp-speed">
                    <div class="rsvp-speed-row">
                        <span class="rsvp-wpm"><b>{{ settings.wpm }}</b> сл/мин</span>
                        <input class="rsvp-range" type="range" :min="WPM_MIN" :max="WPM_MAX" :step="WPM_STEP"
                            :value="settings.wpm" aria-label="Скорость" @input="setWpm(+$event.target.value)" />
                    </div>
                    <div class="rsvp-presets">
                        <button v-for="p in WPM_PRESETS" :key="p" class="rsvp-chip" :class="{ active: settings.wpm === p }"
                            @click="setWpm(p)">{{ p }}</button>
                    </div>
                </div>
            </footer>

            <!-- Настройки -->
            <PdfSpeedSettings v-if="panel === 'settings'" :settings="settings" @close="closePanel" />

            <!-- Статистика -->
            <PdfSpeedStats v-if="panel === 'stats'" :fileId="fileId" :currentWpm="settings.wpm"
                @apply-wpm="setWpm" @close="closePanel" />

            <!-- Обзор главы: план, рисунки, термины, вопросы, план по дням -->
            <PdfSpeedOverview v-if="panel === 'overview' && player.source.value" :pdfDoc="pdfDoc" :source="player.source.value"
                :chapter="overviewChapter" :currentPage="currentPage" :pageCount="pageCount" :wpm="settings.wpm"
                :fileId="fileId" :bookTitle="fileName" :note="overviewChapter ? notes[overviewChapter.key] : null"
                :deepl="deepl" @close="closePanel" @start="onOverviewStart" @jump="onJump" @note-saved="onNoteSaved" />

            <!-- Пересказ главы по памяти -->
            <PdfSpeedRecall v-if="panel === 'recall' && recallChapter" :source="player.source.value"
                :chapter="recallChapter" :note="notes[recallChapter.key]" :fileId="fileId" :review="recallReview"
                @close="closePanel" @saved="onRecallSaved" />

            <!-- Итог захода -->
            <div v-if="summary" class="rsvp-sheet-backdrop">
                <div class="rsvp-sheet rsvp-summary">
                    <div class="rsvp-sheet-title">{{ finished ? 'Книга дочитана 🎉' : 'Итог захода' }}</div>
                    <div class="rsvp-summary-grid">
                        <div><b>{{ summary.words.toLocaleString('ru-RU') }}</b><span>слов</span></div>
                        <div><b>{{ formatMinutes(summary.minutes) }}</b><span>чистого чтения</span></div>
                        <div><b>{{ summary.wpm || '—' }}</b><span>сл/мин по факту</span></div>
                        <div><b>{{ summary.pages }}</b><span>{{ summary.pagesLabel }}</span></div>
                    </div>
                    <div class="rsvp-rate-title">Насколько понял прочитанное?</div>
                    <div class="rsvp-rate">
                        <button v-for="r in RATINGS" :key="r.value" class="rsvp-rate-btn"
                            :class="{ active: comprehension === r.value }" @click="rate(r.value)">
                            <span class="rsvp-rate-emoji">{{ r.emoji }}</span><span>{{ r.label }}</span>
                        </button>
                    </div>
                    <div v-if="summarySuggestion" class="rsvp-suggest">
                        <span>{{ summarySuggestion.reason }}</span>
                        <button class="rsvp-btn rsvp-btn-accent" @click="setWpm(summarySuggestion.wpm); flashMessage(`${summarySuggestion.wpm} сл/мин`)">
                            {{ summarySuggestion.wpm }} сл/мин
                        </button>
                    </div>
                    <div class="rsvp-sheet-actions">
                        <button v-if="!finished" class="rsvp-btn" @click="summary = null">Читать дальше</button>
                        <button class="rsvp-btn rsvp-btn-accent" @click="close">Готово</button>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
    splitAtPivot, PARAGRAPH, suggestWpm, chaptersFromToc, chapterAt, sentenceStart, nextSentence,
    chaptersFromHeadings, reconcileChapters, nearbyBlock,
} from './rsvpText.mjs';
import { useRsvpPlayer } from './useRsvpPlayer.js';
import {
    useRsvpSettings, clampWpm, WPM_MIN, WPM_MAX, WPM_STEP, WPM_PRESETS, FONTS, PIVOT_COLORS, MODES,
} from './rsvpSettings.js';
import { saveSpeedSession, getSpeedStats, getChapterNotes, pdfLogicalToday } from '@/api/pdfFiles.js';
import { isMobile } from '@/composables/useIsMobile.js';
import PdfSpeedSettings from './PdfSpeedSettings.vue';
import PdfSpeedStats from './PdfSpeedStats.vue';
import PdfSpeedBlock from './PdfSpeedBlock.vue';
import PdfSpeedOverview from './PdfSpeedOverview.vue';
import PdfSpeedRecall from './PdfSpeedRecall.vue';
import PdfSpeedPacer from './PdfSpeedPacer.vue';
import { translateTerm, addTermToVocab } from './terms.js';
import './speed-reader.css';

// Скорочтение — docs/pdf-library.md (back-m), раздел «Скорочтение».
// Слово за словом в одной точке экрана; одна буква в слове красная — на неё
// и смотрит глаз, поэтому глазам не нужно бегать по строке.

const props = defineProps({
    pdfDoc: { type: Object, required: true },
    pageCount: { type: Number, required: true },
    startPage: { type: Number, default: 1 },
    startText: { type: String, default: '' },   // «читать отсюда» из выделения
    fileId: { type: String, default: '' },      // книга из библиотеки; пусто — файл с диска
    fileName: { type: String, default: '' },
    tocItems: { type: Array, default: () => [] },
    darkMode: Boolean,
    // Открыт карточкой повтора из «Сегодня»: сразу пересказ этой главы.
    recallKey: { type: String, default: '' },
    // Перевод фразы через DeepL читалки (text → Promise<string|null>).
    deepl: { type: Function, default: null },
});

const emit = defineEmits(['close', 'page', 'activity']);

const RATINGS = [
    { value: 1, emoji: '😵', label: 'мимо' },
    { value: 2, emoji: '😕', label: 'слабо' },
    { value: 3, emoji: '🙂', label: 'суть' },
    { value: 4, emoji: '😊', label: 'хорошо' },
    { value: 5, emoji: '🤓', label: 'всё' },
];

const settings = useRsvpSettings();
const player = useRsvpPlayer(settings);
const {
    tokens, index, frame, currentPage, playing, waiting, finished, loading, noText, session,
} = player;

// ── Тема и шрифт ──────────────────────────────────────────────────────────

const theme = computed(() => {
    if (settings.theme !== 'auto') return settings.theme;
    return props.darkMode ? 'dark' : 'light';
});
const fontCss = computed(() => (FONTS.find((f) => f.code === settings.font) ?? FONTS[0]).css);
const pivotCss = computed(() => (PIVOT_COLORS.find((c) => c.code === settings.pivotColor) ?? PIVOT_COLORS[0]).css);

// Точка фокуса чуть левее середины: слово растёт от неё в основном вправо.
const FOCUS_RATIO = 0.4;
const stageEl = ref(null);
const stageWidth = ref(0);
// Режим «С рисунками» на широком экране отдаёт рисунку 44% справа — слово
// живёт в оставшейся части, и точка фокуса считается от неё.
const mode = computed(() => settings.mode || 'rsvp');
const sideWide = computed(() => mode.value === 'side' && stageWidth.value >= 760);
const wordWidth = computed(() => (sideWide.value ? Math.round(stageWidth.value * 0.56) : stageWidth.value));
const focusX = computed(() => Math.round(wordWidth.value * FOCUS_RATIO));

const cssVars = computed(() => ({
    '--rsvp-font': fontCss.value,
    '--rsvp-pivot': pivotCss.value,
    '--rsvp-focus-x': focusX.value + 'px',
    '--rsvp-size': settings.fontSize + 'px',
}));

// ── Раскладка слова ───────────────────────────────────────────────────────
//
// Три куска абсолютно: до красной буквы — прижат правым краем к ней, сама
// буква — ровно в точке фокуса, хвост — от неё вправо. Ширины меряем канвасом
// тем же шрифтом. Длинное слово, которое не влезает, уменьшаем, а не режем:
// «достопримечательность» на телефоне иначе уехала бы за край.

const measureCtx = document.createElement('canvas').getContext('2d');

function measure(text, size) {
    if (!text) return 0;
    measureCtx.font = `500 ${size}px ${fontCss.value}`;
    return measureCtx.measureText(text).width;
}

const layout = computed(() => {
    const f = frame.value;
    if (!f || f.block || !stageWidth.value) return null;
    const { before, pivot, after } = splitAtPivot(f.text);
    const W = wordWidth.value;
    const fx = focusX.value;
    const pad = 14;
    let size = settings.fontSize;
    const bw = measure(before, size);
    const pw = measure(pivot, size);
    const aw = measure(after, size);
    const scale = Math.min(1, (fx - pad) / (bw + pw / 2 || 1), (W - fx - pad) / (aw + pw / 2 || 1));
    size = Math.max(12, Math.floor(size * scale));
    const pivotW = pw * (size / settings.fontSize);
    return {
        before, pivot, after, size,
        pivotLeft: fx - pivotW / 2,
        beforeRight: W - (fx - pivotW / 2),
        afterLeft: fx + pivotW / 2,
    };
});

let resizeObserver = null;

// ── Глава и прогресс ──────────────────────────────────────────────────────

// Глава — из сверенного списка (оглавление бывает сдвинуто, см. detectChapters);
// end здесь не включительно: страница, с которой начинается следующая.
const chapterBounds = computed(() => {
    const c = topChapter.value;
    return c ? { title: c.title, start: c.start, end: c.end + 1 } : null;
});
const chapter = computed(() => chapterBounds.value);

const pageFraction = computed(() => {
    tokens.value;
    const src = player.source.value;
    if (!src || !tokens.value.length) return 0;
    const off = src.offsetInPage(index.value);
    const left = src.wordsLeftOnPage(index.value);
    return off + left ? off / (off + left) : 0;
});

const bookProgress = computed(() => {
    if (props.pageCount <= 1) return 0;
    return Math.min(1, (currentPage.value - 1 + pageFraction.value) / props.pageCount);
});

const chapterProgress = computed(() => {
    const c = chapterBounds.value;
    if (!c) return 0;
    const span = Math.max(1, c.end - c.start);
    return Math.min(1, (currentPage.value - c.start + pageFraction.value) / span);
});

function wordsLeftUntil(endPage) {
    const src = player.source.value;
    if (!src) return 0;
    const onPage = src.wordsLeftOnPage(index.value);
    return onPage + Math.max(0, endPage - currentPage.value - 1) * src.wordsPerPage;
}

const chapterMinutesLeft = computed(() =>
    chapterBounds.value ? wordsLeftUntil(chapterBounds.value.end) / settings.wpm : 0);
const bookMinutesLeft = computed(() => wordsLeftUntil(props.pageCount + 1) / settings.wpm);

function formatMinutes(min) {
    if (!min || min < 1) return '<1 мин';
    if (min < 60) return `${Math.round(min)} мин`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h} ч ${m} мин` : `${h} ч`;
}

// ── Итог захода: живые цифры ──────────────────────────────────────────────

const tick = ref(0);                 // перерисовка живых цифр раз в секунду
let tickTimer = null;
const sessionWords = computed(() => session.words);
const sessionMinutes = computed(() => { tick.value; return player.activeMsNow() / 60000; });
const liveWpm = computed(() => {
    tick.value;
    const ms = player.activeMsNow();
    return ms >= 20000 ? Math.round(session.words / (ms / 60000)) : 0;
});

// ── Контекст на паузе ─────────────────────────────────────────────────────

const contextEl = ref(null);
const contextWords = computed(() => {
    const list = tokens.value;
    if (!list.length) return [];
    const i = index.value;
    const count = frame.value?.count || 1;
    // Начинаем за пару предложений до текущего слова, но не раньше начала абзаца.
    let from = Math.max(0, i - 45);
    for (let j = i - 1; j > from; j--) {
        if (list[j].f & PARAGRAPH) { from = j + 1; break; }
    }
    const to = Math.min(list.length, i + 70);
    const out = [];
    for (let j = from; j < to; j++) {
        out.push({ i: j, t: list[j].t, cur: j >= i && j < i + count, read: j < i, para: !!(list[j].f & PARAGRAPH) });
    }
    return out;
});

// Текущее слово в контексте должно быть видно, даже если абзац длинный.
watch(() => [playing.value, index.value], async () => {
    if (playing.value) return;
    await nextTick();
    const el = contextEl.value?.querySelector('.rsvp-cw-cur');
    el?.scrollIntoView?.({ block: 'center' });
});

// ── Управление ────────────────────────────────────────────────────────────

const started = ref(false);
const startHint = computed(() => isMobile.value
    // Стрелки словами: на iOS «↑» рисуется цветным эмодзи.
    ? (settings.hold ? 'Держите палец на экране — читаем · отпустили — пауза' : 'Тап — старт · свайп вбок — по предложениям · вверх-вниз — скорость')
    : 'Пробел — старт · ← → по предложениям · ↑ ↓ скорость');

function toggle() {
    if (playing.value) player.pause();
    else play();
}

function play() {
    started.value = true;
    player.play();
}

function backSentence() { player.backSentence(); }
function forwardSentence() { player.forwardSentence(); }
function seekTo(i) { player.seek(i); }

const flash = ref('');
let flashTimer = null;

function flashMessage(text, ms = 900) {
    flash.value = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flash.value = ''; }, ms);
}

function setWpm(v) {
    settings.wpm = clampWpm(v);
}

function changeWpm(delta) {
    setWpm(settings.wpm + delta);
    flashMessage(`${settings.wpm} сл/мин`);
    if (navigator.vibrate) navigator.vibrate(8);
}

// Скорость или паузы поменялись на ходу — следующий кадр уже по-новому.
watch(() => [settings.chunk, settings.smartPauses, settings.mode, settings.pacerUnit], () => player.restartTimer());

// ── Режимы ────────────────────────────────────────────────────────────────

function setMode(code) {
    if (settings.mode === code) return;
    settings.mode = code;
    zoomBlock.value = null;
    const m = MODES.find((x) => x.code === code);
    flashMessage(`${m.icon} ${m.label} — ${m.hint}`, 1600);
}

function cycleMode() {
    const k = MODES.findIndex((m) => m.code === mode.value);
    setMode(MODES[(k + 1) % MODES.length].code);
}

// Рисунок для боковой панели: ближайший впереди или последний пройденный.
const sideFigure = computed(() => (mode.value === 'side' ? nearbyBlock(tokens.value, index.value) : null));
const sideHeight = computed(() => Math.max(140, (sideWide.value ? stageHeight.value : stageHeight.value * 0.58) - 56));
const zoomBlock = ref(null);

function openZoom() {
    // Рисунка рядом нет — крупно показываем всю текущую страницу.
    const b = sideFigure.value?.token || { p: currentPage.value, box: null };
    player.pause();
    blockWide.value = false;
    zoomBlock.value = b;
}

// ── Тренировка скорости ───────────────────────────────────────────────────
// Ступеньки: каждые 2 минуты чистого чтения +25 сл/мин. Спринты: из каждых
// двух минут первые 30 секунд — на 40% быстрее; после спринта обычный темп
// кажется медленным, и глаз перестаёт цепляться за каждое слово.

const LADDER_MS = 120000;
const SPRINT_CYCLE_MS = 120000;
const SPRINT_MS = 30000;
let ladderFrom = 0;

const trainerLabel = computed(() => {
    tick.value;
    if (settings.trainer === 'ladder') return '🪜 ступеньки';
    if (settings.trainer === 'sprint') return player.boost.value > 1 ? '🏃 спринт ×1,4' : '🏃 спринты';
    return '';
});

watch(tick, () => {
    const ms = player.activeMsNow();
    if (settings.trainer === 'ladder') {
        if (!ladderFrom) ladderFrom = ms || 1;
        if (playing.value && ms - ladderFrom >= LADDER_MS) {
            ladderFrom = ms;
            setWpm(settings.wpm + WPM_STEP);
            flashMessage(`🪜 ступенька: ${settings.wpm} сл/мин`, 1600);
        }
    } else {
        ladderFrom = 0;
    }
    const sprinting = settings.trainer === 'sprint' && playing.value && (ms % SPRINT_CYCLE_MS) < SPRINT_MS;
    const want = sprinting ? 1.4 : 1;
    if (player.boost.value !== want) {
        player.boost.value = want;
        if (settings.trainer === 'sprint' && playing.value) {
            flashMessage(sprinting ? '🏃 спринт: ×1,4 на 30 секунд' : 'обычный темп', 1400);
        }
    }
});

// ── Панели и автоскрытие ──────────────────────────────────────────────────

const panel = ref('');
const pointerRecent = ref(true);
let pointerTimer = null;

const uiHidden = computed(() => playing.value && !pointerRecent.value && !panel.value);

function onPointerMove(e) {
    // Панели возвращает только мышь: палец на телефоне — это жест по сцене.
    if (e.pointerType !== 'mouse') return;
    pointerRecent.value = true;
    clearTimeout(pointerTimer);
    pointerTimer = setTimeout(() => { pointerRecent.value = false; }, 1600);
}

watch(playing, (now) => {
    if (now) {
        clearTimeout(pointerTimer);
        pointerTimer = setTimeout(() => { pointerRecent.value = false; }, 900);
    } else {
        pointerRecent.value = true;
    }
});

// Кнопка после клика не должна держать фокус: иначе пробел «нажмёт» её ещё
// раз, вдобавок к паузе.
function releaseFocus(e) {
    const btn = e.target?.closest?.('button');
    if (btn) setTimeout(() => btn.blur(), 0);
}

function openPanel(name) {
    player.pause();
    panel.value = name;
}

function closePanel() {
    panel.value = '';
    nextInQueue();
}

// ── Техническая книга: главы, обзор, пересказ ─────────────────────────────
// docs/pdf-library.md (back-m), «Техническая книга». Вошёл в новую главу —
// сначала пересказ прошлой по памяти, потом карта новой. Обе вещи
// выключаются в настройках.

// Главы: оглавление, сверенное с текстом. Пока сверка идёт — оглавление как есть.
const chapterList = ref(null);
const chapters = computed(() => chapterList.value || chaptersFromToc(props.tocItems, props.pageCount));
const chapterScan = ref('');        // «сверяю главы 40/149» — пока идёт полный проход

function chaptersKey() {
    return `rsvp-chapters:${props.fileId || props.fileName}:${props.pageCount}`;
}

function normTitle(s) {
    return (s || '').toLowerCase().replace(/^\s*(chapter|глава|часть|part)\s+[\divxlc]+\.?\s*/i, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Сначала дёшево: совпадают ли заголовки на страницах, куда ведёт оглавление.
// Совпали — верим. Нет (или оглавления нет вовсе) — проходим книгу целиком и
// находим главы по крупным заголовкам. Итог помним для книги.
async function detectChapters() {
    try {
        const cached = JSON.parse(localStorage.getItem(chaptersKey()) || 'null');
        if (Array.isArray(cached)) {
            chapterList.value = cached;
            return false;
        }
    } catch { /* сломанный кэш — посчитаем заново */ }
    const src = player.source.value;
    if (!src) return false;
    const toc = chaptersFromToc(props.tocItems, props.pageCount);
    if (toc.length) {
        const sample = toc.filter((c) => c.title.length > 3).slice(1, 6);
        let hits = 0;
        for (const c of sample) {
            const head = normTitle(await src.topHeadline(c.start));
            const want = normTitle(c.title);
            if (head && want && (head.includes(want) || want.includes(head))) hits++;
        }
        if (sample.length && hits / sample.length >= 0.6) {
            remember(toc);
            return false;
        }
    }
    return true;   // нужен полный проход
}

async function scanChapters() {
    const src = player.source.value;
    if (!src) return;
    chapterScan.value = 'сверяю главы…';
    const pages = await src.scanHeadlines((done, total) => { chapterScan.value = `сверяю главы ${done}/${total}`; });
    const toc = chaptersFromToc(props.tocItems, props.pageCount);
    const list = reconcileChapters(toc, chaptersFromHeadings(pages, props.pageCount));
    chapterScan.value = '';
    remember(list);
}

function remember(list) {
    chapterList.value = list;
    try { localStorage.setItem(chaptersKey(), JSON.stringify(list)); } catch { /* без кэша — сверим в следующий раз */ }
}
const topChapter = computed(() => chapterAt(chapters.value, currentPage.value));
const notes = ref({});              // ключ главы → вопросы, пересказ, повторы
const overviewChapter = ref(null);
const recallChapter = ref(null);
const recallReview = ref(false);
const panelQueue = [];
// Сколько слов прочитано в каждой главе за этот заход: пересказ спрашиваем,
// только если главу действительно читали, а не проскочили переходом.
const chapterWords = {};
let lastWordCount = 0;

watch(() => session.words, (n) => {
    const key = topChapter.value?.key;
    if (key && n > lastWordCount) chapterWords[key] = (chapterWords[key] || 0) + (n - lastWordCount);
    lastWordCount = n;
});

function openOverview(ch = topChapter.value) {
    player.pause();
    overviewChapter.value = ch || null;
    panel.value = 'overview';
}

function openRecall(ch, review = false) {
    player.pause();
    recallChapter.value = ch;
    recallReview.value = review;
    panel.value = 'recall';
}

function nextInQueue() {
    const item = panelQueue.shift();
    if (!item) {
        if (finished.value && props.fileId && session.words && !summary.value) summary.value = buildSummary();
        return;
    }
    if (item.type === 'recall') openRecall(item.chapter);
    else openOverview(item.chapter);
}

function recallDue(ch) {
    if (!ch || !props.fileId || !settings.chapterRecall) return false;
    return (chapterWords[ch.key] || 0) >= 400 || (notes.value[ch.key]?.questions || []).length > 0;
}

watch(() => topChapter.value?.key, (key, old) => {
    // Только когда главу сменило само чтение, а не переход из обзора.
    if (!key || !old || key === old || !playing.value || chapterScan.value) return;
    const prev = chapters.value.find((c) => c.key === old);
    player.pause();
    if (recallDue(prev)) panelQueue.push({ type: 'recall', chapter: prev });
    if (settings.chapterOverview) panelQueue.push({ type: 'overview', chapter: topChapter.value });
    nextInQueue();
});

function onOverviewStart() {
    const ch = overviewChapter.value;
    panel.value = '';
    started.value = true;
    if (ch && (currentPage.value < ch.start || currentPage.value > ch.end)) {
        player.seekPageOffset(ch.start, 0);
        return;
    }
    play();
}

async function onJump({ page, offset }) {
    panel.value = '';
    panelQueue.length = 0;
    started.value = true;
    await player.seekPageOffset(page, offset);
}

function onNoteSaved(note) {
    notes.value = { ...notes.value, [note.key]: note };
}

function onRecallSaved(note) {
    onNoteSaved(note);
    flashMessage(note.nextReviewAt
        ? `повтор ${note.nextReviewAt.slice(8, 10)}.${note.nextReviewAt.slice(5, 7)} — карточка в «Сегодня»`
        : 'глава закреплена 💪', 2600);
    closePanel();
}

async function loadNotes() {
    if (!props.fileId) return;
    try {
        const list = await getChapterNotes(props.fileId);
        notes.value = Object.fromEntries((list || []).map((n) => [n.key, n]));
    } catch { /* без заметок обзор и пересказ всё равно работают */ }
}

// ── Рисунок на экране ─────────────────────────────────────────────────────

const blockWide = ref(false);
const blockFull = ref(false);
const stageHeight = ref(0);
const blockMaxHeight = computed(() => Math.max(160, stageHeight.value - 130));

watch(() => frame.value?.block, () => {
    blockWide.value = false;
    blockFull.value = false;
});

// ── Перевод слова на паузе ────────────────────────────────────────────────

const wordTr = ref('');
const wordTrOk = ref(false);
const wordAdded = ref(false);
const canTranslate = computed(() => !playing.value && started.value && !frame.value?.block
    && /[A-Za-z]{2,}/.test(frame.value?.text || ''));

watch(index, () => {
    wordTr.value = '';
    wordTrOk.value = false;
    wordAdded.value = false;
});

function currentEnglish() {
    return (frame.value?.text || '').replace(/[^A-Za-z'’\s-]/g, '').trim();
}

async function translateCurrent() {
    wordTr.value = '…';
    const r = await translateTerm(currentEnglish(), props.deepl);
    wordTrOk.value = !!r.text;
    wordTr.value = r.text || r.error;
}

async function addCurrentToVocab() {
    const list = tokens.value;
    const from = sentenceStart(list, index.value);
    const to = nextSentence(list, index.value);
    const sentence = list.slice(from, to).filter((t) => !t.k).map((t) => t.t).join(' ');
    try {
        await addTermToVocab(currentEnglish(), wordTr.value, sentence);
        wordAdded.value = true;
    } catch (e) {
        wordTr.value = `не добавилось: ${e.message}`;
    }
}

// ── Жесты ─────────────────────────────────────────────────────────────────
//
// Тап — пауза/старт, свайп вбок — по предложениям (вправо — назад, как
// листают страницу), свайп вверх/вниз — скорость. В режиме «удержание»
// читаем, пока палец на экране.

const gesture = ref(null);

function onPointerDown(e) {
    // В режиме «Текстом» сцену листают пальцем, тапы ловит сама колонка.
    if (mode.value === 'pacer') return;
    if (e.button > 0 || !e.isPrimary || !layout.value) return;
    gesture.value = { x: e.clientX, y: e.clientY, t: Date.now() };
    if (settings.hold && !finished.value) play();
}

function onPointerUp(e) {
    const g = gesture.value;
    gesture.value = null;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const horizontal = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3;
    const vertical = Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.3;
    if (settings.hold) player.pause();
    if (horizontal) {
        if (dx > 0) backSentence();
        else forwardSentence();
        if (navigator.vibrate) navigator.vibrate(8);
        return;
    }
    if (vertical) {
        changeWpm(dy < 0 ? WPM_STEP : -WPM_STEP);
        return;
    }
    if (settings.hold) return;
    if (Math.hypot(dx, dy) < 12 && Date.now() - g.t < 600) toggle();
}

// ── Клавиатура ────────────────────────────────────────────────────────────

function onKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName;
    const typing = tag === 'INPUT' && e.target.type !== 'range' || tag === 'TEXTAREA';
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (panel.value) closePanel();
        else if (summary.value) close();
        else requestClose();
        return;
    }
    if (typing || panel.value || summary.value) return;
    const handled = (() => {
        switch (e.key) {
            case ' ':
            case 'k':
            case 'K':
                toggle(); return true;
            case 'ArrowLeft':
                if (e.shiftKey) player.backWord(); else backSentence();
                return true;
            case 'ArrowRight':
                if (e.shiftKey) player.forwardWord(); else forwardSentence();
                return true;
            case 'ArrowUp': changeWpm(WPM_STEP); return true;
            case 'ArrowDown': changeWpm(-WPM_STEP); return true;
            case '1': case '2': case '3':
                settings.chunk = +e.key;
                flashMessage(`${e.key} ${e.key === '1' ? 'слово' : 'слова'} в кадре`);
                return true;
            case 'm': case 'M': case 'ь': case 'Ь':
                cycleMode(); return true;
            case 'o': case 'O': case 'щ': case 'Щ':
                openOverview(); return true;
            case 's': case 'S': case 'ы': case 'Ы':
                openPanel('settings'); return true;
            default: return false;
        }
    })();
    if (handled) {
        e.preventDefault();
        e.stopPropagation();
    }
}

// ── Экран не гаснет, пока читаем ──────────────────────────────────────────
// На телефоне никто не трогает экран минутами — без блокировки он погаснет
// посреди предложения.

let wakeLock = null;

async function acquireWakeLock() {
    try {
        if (!wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener?.('release', () => { wakeLock = null; });
        }
    } catch { /* не дали — ничего страшного */ }
}

function releaseWakeLock() {
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
}

watch(playing, (now) => {
    if (now) acquireWakeLock();
    else releaseWakeLock();
});

function onVisibility() {
    if (document.hidden) {
        player.pause();
        flushSession({ keepalive: true });
    }
}

// ── Место и итог: сохранение ──────────────────────────────────────────────

const posKey = computed(() => `rsvp-pos:${props.fileId || props.fileName}`);

function saveLocalPos() {
    if (!tokens.value.length) return;
    try {
        localStorage.setItem(posKey.value, JSON.stringify({
            page: currentPage.value, offset: player.offsetInPage(), at: Date.now(),
        }));
    } catch { /* без места — начнём со страницы */ }
}

function readLocalPos() {
    try {
        return JSON.parse(localStorage.getItem(posKey.value) || 'null');
    } catch {
        return null;
    }
}

const sessionId = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const comprehension = ref(null);
let lastSent = '';
let flushTimer = null;

function sessionBody() {
    return {
        date: pdfLogicalToday(),
        words: session.words,
        seconds: Math.round(player.activeMsNow() / 1000),
        targetWpm: settings.wpm,
        chunk: settings.chunk,
        startPage: session.startPage,
        endPage: currentPage.value,
        endOffset: player.offsetInPage(),
        comprehension: comprehension.value,
    };
}

async function flushSession({ keepalive = false } = {}) {
    if (!props.fileId) return;
    const body = sessionBody();
    if (!body.words && body.comprehension == null) return;
    const key = JSON.stringify([body.words, body.seconds, body.endPage, body.endOffset, body.comprehension, body.targetWpm]);
    if (key === lastSent) return;
    lastSent = key;
    try {
        await saveSpeedSession(props.fileId, sessionId, body, { keepalive });
    } catch {
        lastSent = '';
    }
}

// ── Закрытие и итог ───────────────────────────────────────────────────────

const summary = ref(null);
const recentSessions = ref([]);

function buildSummary() {
    const ms = player.activeMsNow();
    const pages = Math.max(1, currentPage.value - session.startPage + 1);
    return {
        words: session.words,
        minutes: ms / 60000,
        wpm: ms >= 60000 ? Math.round(session.words / (ms / 60000)) : 0,
        pages: session.startPage === currentPage.value ? `${currentPage.value}` : `${session.startPage}–${currentPage.value}`,
        pagesLabel: pages === 1 ? 'страница' : 'страницы',
    };
}

const summarySuggestion = computed(() => {
    if (!summary.value || comprehension.value == null) return null;
    const mine = {
        comprehension: comprehension.value,
        seconds: summary.value.minutes * 60,
        wpm: summary.value.wpm,
        targetWpm: settings.wpm,
    };
    return suggestWpm([mine, ...recentSessions.value], settings.wpm);
});

function rate(value) {
    comprehension.value = value;
    flushSession();
}

function requestClose() {
    player.pause();
    // Итог показываем, только если было что читать: минута — и книга из
    // библиотеки, иначе оценку некуда сохранить.
    if (props.fileId && player.activeMsNow() >= 60000) {
        summary.value = buildSummary();
        return;
    }
    close();
}

let closed = false;

function close() {
    if (closed) return;
    closed = true;
    player.pause();
    saveLocalPos();
    flushSession({ keepalive: true });
    emit('close', { page: currentPage.value });
}

watch(finished, (done) => {
    if (!done || !props.fileId || !session.words) return;
    // Дочитал книгу — сначала пересказ последней главы, потом итог захода.
    const last = topChapter.value;
    if (recallDue(last)) {
        panelQueue.push({ type: 'recall', chapter: last });
        nextInQueue();
        return;
    }
    summary.value = buildSummary();
});

// ── Связь с читалкой ──────────────────────────────────────────────────────

watch(currentPage, (page) => {
    emit('page', page);
    saveLocalPos();
});

let lastActivity = 0;
watch(index, () => {
    const now = Date.now();
    if (now - lastActivity > 4000) {
        lastActivity = now;
        emit('activity');
    }
});

watch(playing, (now) => {
    if (!now) saveLocalPos();
});

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

onMounted(async () => {
    window.addEventListener('keydown', onKeydown, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    resizeObserver = new ResizeObserver(([entry]) => {
        stageWidth.value = entry.contentRect.width;
        stageHeight.value = entry.contentRect.height;
    });
    if (stageEl.value) {
        resizeObserver.observe(stageEl.value);
        stageWidth.value = stageEl.value.clientWidth;
        stageHeight.value = stageEl.value.clientHeight;
    }
    loadNotes();
    tickTimer = setInterval(() => { tick.value++; }, 1000);
    flushTimer = setInterval(() => flushSession(), 30000);

    // Сервер помнит скорость и место с другого устройства. Ждём его недолго:
    // без сети читать всё равно можно.
    let stats = null;
    if (props.fileId) {
        stats = await withTimeout(
            getSpeedStats({ fileId: props.fileId, date: pdfLogicalToday() }).catch(() => null), 1500);
        recentSessions.value = stats?.sessions ?? [];
    }
    if (!settings.wpm) settings.wpm = stats?.lastTargetWpm || 300;

    let offset = 0;
    if (!props.startText) {
        const local = readLocalPos();
        if (local && local.page === props.startPage) offset = local.offset;
        else if (stats?.resume?.page === props.startPage) offset = stats.resume.offset;
    }
    const result = await player.open(props.pdfDoc, props.pageCount, {
        page: props.startPage, offset, text: props.startText,
    });
    if (result?.ok && result.skipped > 0) {
        flashMessage(`стр. ${props.startPage}–${result.page - 1} без текста — начинаю со стр. ${result.page}`, 2600);
    }
    if (!result?.ok) return;

    // Главы сверяем до всего остального: и обзор, и пересказ должны знать
    // настоящие границы глав, а не сдвинутые оглавлением.
    const needScan = await detectChapters();

    // Пришли по карточке повтора — сразу пересказ этой главы.
    if (props.recallKey) {
        if (needScan) await scanChapters();
        const ch = chapters.value.find((c) => c.key === props.recallKey)
            || { key: props.recallKey, title: notes.value[props.recallKey]?.title || 'глава', start: props.startPage, end: props.startPage };
        openRecall(ch, true);
        return;
    }
    // Обзор — только по сверенным главам: по сдвинутому оглавлению он
    // показал бы не ту главу.
    if (needScan) await scanChapters();
    maybeStartOverview();
});

// Начинаем главу с начала — сперва её карта.
let startOverviewShown = false;
function maybeStartOverview() {
    if (startOverviewShown || started.value || panel.value || summary.value) return;
    const ch = topChapter.value;
    if (settings.chapterOverview && ch && currentPage.value === ch.start && player.offsetInPage() < 80) {
        startOverviewShown = true;
        openOverview(ch);
    }
}

function onPageHide() {
    saveLocalPos();
    flushSession({ keepalive: true });
}

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    resizeObserver?.disconnect();
    clearInterval(tickTimer);
    clearInterval(flushTimer);
    clearTimeout(flashTimer);
    clearTimeout(pointerTimer);
    releaseWakeLock();
    if (!closed) {
        saveLocalPos();
        flushSession({ keepalive: true });
    }
});
</script>
