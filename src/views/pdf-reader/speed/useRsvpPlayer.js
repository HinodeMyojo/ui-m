import { ref, shallowRef, computed, reactive, onBeforeUnmount } from 'vue';
import {
    frameAt, frameWeight, prevSentence, nextSentence, resumeIndex, sentenceStart, findTextOffset,
} from './rsvpText.mjs';
import { createRsvpSource, LOOKAHEAD_WORDS } from './rsvpSource.js';

// Движок показа — docs/pdf-library.md (back-m), раздел «Скорочтение».
//
// Таймер ведём по абсолютному сроку (nextDue), а не цепочкой «подождать N мс»:
// setTimeout всегда опаздывает на пару миллисекунд, и на 600 сл/мин цепочка
// за минуту теряла бы десяток слов — ползунок врал бы о скорости.

const PAUSE_REWIND_MS = 1500;   // пауза дольше — при продолжении отмотаем пару слов
const RAMP_FRAMES = 12;         // за столько кадров разгоняемся до заданной скорости

export function useRsvpPlayer(settings) {
    const source = shallowRef(null);
    const version = ref(0);          // меняется, когда подгрузились слова
    const index = ref(0);
    const playing = ref(false);
    const waiting = ref(false);      // догружаем текст, показывать нечего
    const finished = ref(false);
    const loading = ref(false);
    const noText = ref(false);
    const skippedPages = ref(0);
    // Сколько раз встали на рисунке или коде — по нему экран понимает, что
    // остановка не ручная, и не мешает её разглядывать.
    const blockStops = ref(0);

    // Итог захода. Слово засчитывается один раз: перечитанное после отмотки
    // съедает время, но не добавляет слов — так скорость остаётся честной.
    const session = reactive({ words: 0, activeMs: 0, startPage: 0 });
    let countedUpTo = 0;

    let timer = 0;
    let nextDue = 0;
    let playStartedAt = 0;
    let pausedAt = 0;
    let shownSincePlay = 0;

    const tokens = computed(() => {
        version.value;
        return source.value?.tokens ?? [];
    });

    // Режим «Текстом» подсвечивает фразу целиком (или слово), остальные —
    // сколько слов в кадре выставлено в настройках.
    const effectiveChunk = computed(() => (settings.mode === 'pacer'
        ? (settings.pacerUnit === 'word' ? 1 : 3)
        : settings.chunk));
    const frame = computed(() => frameAt(tokens.value, index.value, effectiveChunk.value));
    // Множитель скорости тренировки («спринт»): ползунок не трогает.
    const boost = ref(1);
    const currentToken = computed(() => tokens.value[index.value] ?? null);
    const currentPage = computed(() => currentToken.value?.p ?? source.value?.firstPage ?? 1);

    function bump() {
        version.value++;
    }

    function activeMsNow() {
        return session.activeMs + (playing.value ? performance.now() - playStartedAt : 0);
    }

    // ── Загрузка ─────────────────────────────────────────────────────────

    async function open(pdfDoc, pageCount, { page, offset = 0, text = '' }) {
        stop();
        loading.value = true;
        noText.value = false;
        finished.value = false;
        const src = createRsvpSource(pdfDoc, pageCount);
        source.value = src;
        const result = await src.start(page);
        loading.value = false;
        if (!result.ok) {
            noText.value = true;
            bump();
            return result;
        }
        skippedPages.value = result.skipped;
        let i = 0;
        if (text) {
            const found = findTextOffset(src.tokens, text);
            if (found >= 0) i = found;
        } else if (offset > 0 && result.page === page) {
            i = Math.min(offset, src.tokens.length - 1);
        }
        // Начинаем с начала предложения: с середины фразы смысл не собрать.
        index.value = sentenceStart(src.tokens, i);
        countedUpTo = index.value;
        session.words = 0;
        session.activeMs = 0;
        session.startPage = src.tokens[index.value]?.p ?? page;
        bump();
        await src.ensureAhead(index.value);
        bump();
        return result;
    }

    // ── Воспроизведение ──────────────────────────────────────────────────

    function baseMs() {
        const weight = settings.smartPauses ? (source.value?.weight || 1) : 1;
        return 60000 / Math.max(50, settings.wpm * boost.value) / weight;
    }

    function rampFactor() {
        if (!settings.ramp) return 1;
        const k = Math.min(1, shownSincePlay / RAMP_FRAMES);
        return 1 / (0.6 + 0.4 * k);
    }

    function schedule() {
        const f = frame.value;
        if (!f) return;
        const now = performance.now();
        // Вкладку уводили в фон — таймеры там засыпают. Не отыгрываем
        // пропущенное пачкой, а продолжаем с этого момента.
        if (nextDue < now - 250) nextDue = now;
        nextDue += baseMs() * frameWeight(tokens.value, f, settings.smartPauses) * rampFactor();
        timer = setTimeout(advance, Math.max(0, nextDue - now));
    }

    async function advance() {
        timer = 0;
        if (!playing.value) return;
        const src = source.value;
        const f = frame.value;
        if (!src || !f) return;
        const nextIdx = f.start + f.count;
        if (nextIdx > countedUpTo) {
            // Рисунок и листинг — не слова: в скорость их не считаем.
            for (let j = Math.max(f.start, countedUpTo); j < nextIdx; j++) {
                if (!src.tokens[j]?.k) session.words++;
            }
            countedUpTo = nextIdx;
        }
        shownSincePlay++;

        if (!src.atEnd && src.tokens.length - nextIdx < LOOKAHEAD_WORDS / 2) {
            src.ensureAhead(nextIdx).then(bump);
        }
        if (nextIdx >= src.tokens.length) {
            if (src.atEnd) {
                finished.value = true;
                pause();
                return;
            }
            // Подгрузка не успела — ждём, и это время чтением не считаем.
            waiting.value = true;
            const waitStart = performance.now();
            await src.ensureAhead(nextIdx, 50);
            bump();
            waiting.value = false;
            playStartedAt += performance.now() - waitStart;
            if (!playing.value) return;
            if (nextIdx >= src.tokens.length) {
                finished.value = true;
                pause();
                return;
            }
            nextDue = performance.now();
        }
        index.value = nextIdx;
        if (frame.value?.block) {
            // Встаём только в режиме «Слово»: в остальных рисунок и так перед
            // глазами — сбоку или прямо в тексте.
            if (settings.stopAtBlocks && (settings.mode || 'rsvp') === 'rsvp') {
                // Схема или код — это содержание: встаём и показываем их.
                pause();
                blockStops.value++;
                return;
            }
            skipBlocks();
        }
        schedule();
    }

    function skipBlocks() {
        const list = tokens.value;
        let i = index.value;
        while (i < list.length - 1 && list[i]?.k) i++;
        index.value = i;
    }

    function play() {
        if (playing.value || !frame.value || loading.value) return;
        if (finished.value) return;
        const now = performance.now();
        if (settings.rewind && pausedAt && now - pausedAt > PAUSE_REWIND_MS) {
            index.value = resumeIndex(tokens.value, index.value);
        }
        // Стоим на рисунке — «дальше» значит читать текст после него.
        if (frame.value?.block) skipBlocks();
        if (frame.value?.block) {
            // Рисунок последний в загруженном куске — подтянем текст за ним.
            const src = source.value;
            if (src && !src.atEnd) {
                src.ensureAhead(index.value).then(() => {
                    bump();
                    skipBlocks();
                    if (!frame.value?.block) play();
                });
            }
            return;
        }
        if (!frame.value) return;
        playing.value = true;
        playStartedAt = now;
        shownSincePlay = 0;
        nextDue = now;
        schedule();
    }

    function pause() {
        if (timer) clearTimeout(timer);
        timer = 0;
        if (playing.value) session.activeMs += performance.now() - playStartedAt;
        playing.value = false;
        pausedAt = performance.now();
    }

    function stop() {
        pause();
        pausedAt = 0;
    }

    function toggle() {
        if (playing.value) pause();
        else play();
    }

    // ── Переходы ─────────────────────────────────────────────────────────

    function restartTimer() {
        if (!playing.value) return;
        if (timer) clearTimeout(timer);
        shownSincePlay = Math.min(shownSincePlay, RAMP_FRAMES / 2);
        nextDue = performance.now();
        schedule();
    }

    async function seek(i) {
        const src = source.value;
        if (!src) return;
        finished.value = false;
        index.value = Math.max(0, Math.min(src.tokens.length - 1, i));
        // Ручной переход — это не пауза, отматывать после него нечего.
        pausedAt = 0;
        restartTimer();
        if (!src.atEnd && src.tokens.length - index.value < LOOKAHEAD_WORDS) {
            await src.ensureAhead(index.value);
            bump();
        }
    }

    // В начале загруженного куска подтягиваем предыдущую страницу.
    async function ensureBehind() {
        const src = source.value;
        if (!src || src.firstPage <= 1) return;
        const shift = await src.prependPage();
        if (shift) {
            index.value += shift;
            countedUpTo += shift;
            bump();
        }
    }

    async function backSentence() {
        if (!source.value) return;
        if (sentenceStart(tokens.value, index.value) === 0) await ensureBehind();
        let target = prevSentence(tokens.value, index.value);
        if (target === 0 && index.value <= 1) {
            await ensureBehind();
            target = prevSentence(tokens.value, index.value);
        }
        await seek(target);
    }

    async function forwardSentence() {
        if (!source.value) return;
        let target = nextSentence(tokens.value, index.value);
        if (target >= tokens.value.length && !source.value.atEnd) {
            await source.value.ensureAhead(index.value);
            bump();
            target = nextSentence(tokens.value, index.value);
        }
        await seek(target);
    }

    async function backWord() {
        if (index.value === 0) await ensureBehind();
        await seek(index.value - 1);
    }

    async function forwardWord() {
        await seek(index.value + (frame.value?.count || 1));
    }

    async function seekPage(page) {
        const src = source.value;
        if (!src) return;
        const i = src.tokens.findIndex((t) => t.p >= page);
        if (i >= 0) {
            await seek(i);
            return;
        }
        // Страница вне загруженного куска — открываем книгу заново с неё,
        // итог захода при этом не теряем.
        const keep = { words: session.words, activeMs: activeMsNow(), startPage: session.startPage };
        const wasPlaying = playing.value;
        pause();
        await src.start(page);
        index.value = 0;
        countedUpTo = 0;
        Object.assign(session, keep);
        bump();
        await src.ensureAhead(0);
        bump();
        if (wasPlaying) play();
    }

    // Переход к месту страницы — из обзора главы, к заголовку или рисунку.
    async function seekPageOffset(page, offset = 0) {
        const src = source.value;
        if (!src) return;
        let i = src.indexOfPageOffset(page, offset);
        if (i < 0) {
            await seekPage(page);
            i = src.indexOfPageOffset(page, offset);
        }
        if (i >= 0) await seek(i);
    }

    // Режим «Читать»: место задаёт прокрутка, таймеров и счёта слов нет.
    function moveTo(i) {
        const src = source.value;
        if (!src || !src.tokens.length) return;
        index.value = Math.max(0, Math.min(src.tokens.length - 1, i));
        if (!src.atEnd && src.tokens.length - index.value < LOOKAHEAD_WORDS) {
            src.ensureAhead(index.value).then(bump);
        }
    }

    async function loadMore() {
        const src = source.value;
        if (!src || src.atEnd) return;
        await src.ensureAhead(index.value, LOOKAHEAD_WORDS * 2);
        bump();
    }

    const canPrev = computed(() => {
        version.value;
        return (source.value?.firstPage ?? 1) > 1;
    });

    function offsetInPage() {
        return source.value?.offsetInPage(index.value) ?? 0;
    }

    onBeforeUnmount(stop);

    return {
        source, tokens, version, index, frame, currentToken, currentPage,
        playing, waiting, finished, loading, noText, skippedPages, session, blockStops, boost,
        open, play, pause, toggle, stop, seek, seekPage, seekPageOffset, moveTo, loadMore, ensureBehind, canPrev,
        backSentence, forwardSentence, backWord, forwardWord, restartTimer,
        activeMsNow, offsetInPage,
    };
}
