<template>
    <div class="rsvp-pacer" :class="{ 'rsvp-pacer-reading': reading }" ref="scrollEl"
        @click="onClick" @scroll.passive="onScroll" @wheel.passive="onUserScroll" @touchmove.passive="onUserScroll">
        <div class="rsvp-pacer-col" :style="colStyle">
            <button v-if="reading && canPrev && win.from === 0" class="rsvp-btn rsvp-pacer-prev"
                @click.stop="loadPrev">↑ Предыдущие страницы</button>
            <template v-for="para in paras" :key="para.key">
                <figure v-if="para.block" class="rsvp-pacer-fig" :data-i="para.i">
                    <PdfSpeedBlock :pdfDoc="pdfDoc" :page="para.block.p" :box="para.block.box" :maxHeight="figHeight" />
                    <figcaption>{{ para.block.k === 'code' ? 'листинг' : 'рисунок' }} · стр. {{ para.block.p }}</figcaption>
                </figure>
                <p v-else class="rsvp-pacer-p"><template v-for="w in para.words" :key="w.i"><span class="rsvp-pw"
                    :data-i="w.i"><template v-if="bionic">{{ w.b.lead }}<b>{{ w.b.head }}</b>{{ w.b.tail }}</template><template
                    v-else>{{ w.t }}</template></span>{{ ' ' }}</template></p>
            </template>
            <div v-if="atEnd && win.to >= tokens.length" class="rsvp-note rsvp-pacer-end">Конец книги</div>
            <div v-else-if="reading && win.to >= tokens.length" class="rsvp-note rsvp-pacer-end">подгружаю…</div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import PdfSpeedBlock from './PdfSpeedBlock.vue';
import { PARAGRAPH, bionicSplit } from './rsvpText.mjs';

// Колонка текста книги — docs/pdf-library.md (back-m), «Режимы чтения».
//
// Два режима на одной колонке:
//  • «Текстом» — по тексту с заданной скоростью бежит подсветка фразы; глаз
//    может скользнуть назад, без этих возвратов понимание проседает
//    (Schotter et al., 2014);
//  • «Читать» — без бегунка: листаешь сам, тап по слову или выделение фразы
//    открывает словарь, место чтения считается по прокрутке.
//
// Рисуем не весь загруженный текст, а окно вокруг места чтения: тысяча
// span'ов на каждое слово сделала бы каждый кадр подсветки дорогим.

const props = defineProps({
    pdfDoc: { type: Object, required: true },
    tokens: { type: Array, required: true },
    version: { type: Number, default: 0 },
    index: { type: Number, default: 0 },
    frame: { type: Object, default: null },
    playing: Boolean,
    atEnd: Boolean,
    canPrev: Boolean,          // есть ли страницы до загруженного куска
    reading: Boolean,          // режим «Читать»: без бегунка
    markIndex: { type: Number, default: -1 },   // слово, открытое в словаре
    bionic: Boolean,
    textSize: { type: Number, default: 20 },
    font: { type: String, default: '' },
});
const emit = defineEmits(['seek', 'toggle', 'lookup', 'select', 'position', 'need-more', 'load-prev']);

const BACK = 160;     // слов до места чтения в окне
const AHEAD = 700;    // и после
const scrollEl = ref(null);
const win = ref({ from: 0, to: 0 });
const figHeight = ref(360);

const colStyle = computed(() => ({
    fontSize: `${props.textSize}px`,
    fontFamily: props.font || undefined,
}));

const paras = computed(() => {
    props.version;
    const list = props.tokens;
    const out = [];
    let cur = null;
    for (let i = win.value.from; i < win.value.to && i < list.length; i++) {
        const t = list[i];
        if (t.k) {
            cur = null;
            out.push({ key: `b${i}`, i, block: t });
            continue;
        }
        if (!cur) {
            cur = { key: `p${i}`, words: [] };
            out.push(cur);
        }
        cur.words.push({ i, t: t.t, b: props.bionic ? bionicSplit(t.t) : null });
        if (t.f & PARAGRAPH) cur = null;
    }
    return out;
});

// ── Якорь прокрутки ───────────────────────────────────────────────────────
// Окно сдвигается — сверху и снизу меняются абзацы. Чтобы текст под глазами
// не прыгнул, запоминаем слово на линии чтения и возвращаем его на то же
// место. Слово помним объектом: после подгрузки страниц сверху номера всех
// слов сдвигаются, а объекты остаются те же.

const READ_LINE = 0.3;

function wordAtReadingLine() {
    const root = scrollEl.value;
    if (!root) return null;
    const r = root.getBoundingClientRect();
    const y = r.top + r.height * READ_LINE;
    for (const fx of [0.5, 0.3, 0.7, 0.15]) {
        const el = document.elementFromPoint(r.left + r.width * fx, y);
        const span = el?.closest?.('.rsvp-pw');
        if (span && root.contains(span)) return span;
        const p = el?.closest?.('.rsvp-pacer-p');
        if (p && root.contains(p)) {
            const spans = p.querySelectorAll('.rsvp-pw');
            for (const s of spans) if (s.getBoundingClientRect().bottom >= y) return s;
        }
    }
    return null;
}

function captureAnchor() {
    const root = scrollEl.value;
    const el = wordAtReadingLine();
    if (!root || !el) return null;
    return {
        tok: props.tokens[+el.dataset.i],
        top: el.getBoundingClientRect().top - root.getBoundingClientRect().top,
    };
}

function restoreAnchor(a) {
    const root = scrollEl.value;
    if (!root || !a?.tok) return;
    const i = props.tokens.indexOf(a.tok);
    const el = i >= 0 && root.querySelector(`[data-i="${i}"]`);
    if (!el) return;
    root.scrollTop += el.getBoundingClientRect().top - root.getBoundingClientRect().top - a.top;
}

function rewindow(center = props.index) {
    const list = props.tokens;
    let from = Math.max(0, center - BACK);
    // Окно начинаем с начала абзаца — обрубок фразы сверху читается плохо.
    for (let k = 0; k < 300 && from > 0 && !(list[from - 1].f & PARAGRAPH); k++) from--;
    win.value = { from, to: Math.min(list.length, center + AHEAD) };
}

// ── Подсветка и прокрутка (режим «Текстом») ──────────────────────────────

let lit = [];
let userScrollAt = 0;

function onUserScroll() {
    userScrollAt = Date.now();
}

function highlight() {
    const root = scrollEl.value;
    if (!root || props.reading) return;
    for (const el of lit) el.classList.remove('rsvp-pw-on');
    lit = [];
    const f = props.frame;
    if (!f) return;
    for (let k = 0; k < f.count; k++) {
        const el = root.querySelector(`[data-i="${f.start + k}"]`);
        if (el) {
            el.classList.add('rsvp-pw-on');
            lit.push(el);
        }
    }
    follow();
}

// Строка чтения держится на трети высоты. Двигаем, только когда подсветка
// ушла на другую строку, и не спорим с пальцем: человек листнул сам — пару
// секунд его не перебиваем.
function follow(force = false) {
    const root = scrollEl.value;
    const el = lit[0];
    if (!root || !el) return;
    if (!force && Date.now() - userScrollAt < 2500) return;
    const top = el.offsetTop - root.clientHeight * 0.33;
    if (force || Math.abs(root.scrollTop - top) > el.offsetHeight * 0.8) {
        root.scrollTo({ top: Math.max(0, top), behavior: force ? 'auto' : 'smooth' });
    }
}

function scrollToIndex(i) {
    const root = scrollEl.value;
    const el = root?.querySelector(`[data-i="${i}"]`);
    if (el) root.scrollTop = Math.max(0, el.offsetTop - root.clientHeight * READ_LINE);
}

// Слово, открытое в словаре, — отмечено в тексте.
let marked = null;
function mark() {
    marked?.classList.remove('rsvp-pw-look');
    marked = props.markIndex >= 0 ? scrollEl.value?.querySelector(`[data-i="${props.markIndex}"]`) : null;
    marked?.classList.add('rsvp-pw-look');
}

watch(() => props.index, (i) => {
    if (props.reading) {
        // Номер сдвинула прокрутка — окно двигаем так, чтобы текст не прыгнул.
        if (i < win.value.from + 60 || i > win.value.to - 250) {
            const a = captureAnchor();
            rewindow(i);
            nextTick(() => { restoreAnchor(a); mark(); });
        }
        return;
    }
    if (i < win.value.from || i > win.value.to - 250) {
        rewindow();
        nextTick(() => { highlight(); follow(true); });
        return;
    }
    nextTick(highlight);
});

watch(() => [props.frame?.start, props.frame?.count], () => nextTick(highlight));
watch(() => props.markIndex, () => nextTick(mark));

// Подгрузились новые страницы — окно может вырасти вперёд; подгрузились
// сверху — возвращаем текст под глаза.
let pendingAnchor = null;
watch(() => props.version, () => {
    if (pendingAnchor) {
        const a = pendingAnchor;
        pendingAnchor = null;
        const i = props.tokens.indexOf(a.tok);
        rewindow(i >= 0 ? i : props.index);
        nextTick(() => { restoreAnchor(a); mark(); });
        return;
    }
    if (win.value.to < Math.min(props.tokens.length, props.index + AHEAD)) {
        win.value = { ...win.value, to: Math.min(props.tokens.length, props.index + AHEAD) };
        nextTick(() => { highlight(); mark(); });
    }
});

watch(() => props.bionic, () => nextTick(() => { highlight(); mark(); }));

watch(() => props.reading, (now) => {
    for (const el of lit) el.classList.remove('rsvp-pw-on');
    lit = [];
    nextTick(() => {
        if (now) scrollToIndex(props.index);
        else { highlight(); follow(true); }
    });
});

// ── Прокрутка в режиме «Читать» ──────────────────────────────────────────

let scrollFrame = 0;

function onScroll() {
    if (!props.reading || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        const el = wordAtReadingLine();
        if (el) emit('position', +el.dataset.i);
        const root = scrollEl.value;
        if (root && root.scrollTop + root.clientHeight > root.scrollHeight - root.clientHeight * 0.8
            && win.value.to >= props.tokens.length && !props.atEnd) {
            emit('need-more');
        }
    });
}

function loadPrev() {
    pendingAnchor = captureAnchor();
    emit('load-prev');
}

// ── Тапы и выделение ──────────────────────────────────────────────────────

function selectedText() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || '';
    if (!text || !scrollEl.value?.contains(sel.anchorNode)) return null;
    const span = sel.anchorNode?.parentElement?.closest?.('.rsvp-pw');
    return { text, i: span ? +span.dataset.i : -1 };
}

function onClick(e) {
    // Выделил фразу мышью — это вопрос к словарю, а не клик.
    const sel = selectedText();
    if (sel && sel.text.includes(' ')) {
        emit('select', sel);
        return;
    }
    const span = e.target.closest?.('.rsvp-pw');
    if (span) {
        if (props.reading) emit('lookup', { i: +span.dataset.i });
        else emit('seek', +span.dataset.i);
        return;
    }
    if (e.target.closest?.('figure, button')) return;
    if (!props.reading) emit('toggle');
}

// На телефоне фразу выделяют долгим нажатием и тянут за маркеры — об этом
// говорит только selectionchange. Ждём, когда утихнет.
let selTimer = null;
function onSelectionChange() {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
        const sel = selectedText();
        if (sel && sel.text.length > 1) emit('select', sel);
    }, 650);
}

onMounted(() => {
    figHeight.value = Math.max(220, Math.round((scrollEl.value?.clientHeight || 600) * 0.6));
    rewindow();
    nextTick(() => {
        if (props.reading) { scrollToIndex(props.index); mark(); }
        else { highlight(); follow(true); }
    });
    document.addEventListener('selectionchange', onSelectionChange);
});

onBeforeUnmount(() => {
    document.removeEventListener('selectionchange', onSelectionChange);
    clearTimeout(selTimer);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
});

defineExpose({ scrollToIndex });
</script>
