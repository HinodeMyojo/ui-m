<template>
    <div class="rsvp-pacer" ref="scrollEl" @click="onClick" @wheel.passive="onUserScroll" @touchmove.passive="onUserScroll">
        <div class="rsvp-pacer-col" :style="colStyle">
            <template v-for="para in paras" :key="para.key">
                <figure v-if="para.block" class="rsvp-pacer-fig" :data-i="para.i">
                    <PdfSpeedBlock :pdfDoc="pdfDoc" :page="para.block.p" :box="para.block.box" :maxHeight="figHeight" />
                    <figcaption>{{ para.block.k === 'code' ? 'листинг' : 'рисунок' }} · стр. {{ para.block.p }}</figcaption>
                </figure>
                <p v-else class="rsvp-pacer-p"><template v-for="w in para.words" :key="w.i"><span class="rsvp-pw"
                    :data-i="w.i"><template v-if="bionic">{{ w.b.lead }}<b>{{ w.b.head }}</b>{{ w.b.tail }}</template><template
                    v-else>{{ w.t }}</template></span>{{ ' ' }}</template></p>
            </template>
            <div v-if="atEnd" class="rsvp-note rsvp-pacer-end">Конец загруженного текста</div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import PdfSpeedBlock from './PdfSpeedBlock.vue';
import { PARAGRAPH, bionicSplit } from './rsvpText.mjs';

// Режим «Текстом» — docs/pdf-library.md (back-m), «Режимы чтения».
//
// Текст книги колонкой, а по нему с заданной скоростью бежит подсветка фразы.
// В отличие от слова в одной точке, тут можно скользнуть глазом назад — а без
// этих возвратов понимание заметно проседает (Schotter et al., 2014). Скорость
// всё равно задаёт бегунок: глаз тянется за ним и не залипает на строке.
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
    bionic: Boolean,
    textSize: { type: Number, default: 20 },
    font: { type: String, default: '' },
});
const emit = defineEmits(['seek', 'toggle']);

const BACK = 160;     // слов до места чтения в окне
const AHEAD = 700;    // и после
const scrollEl = ref(null);
const win = ref({ from: 0, to: 0 });
const figHeight = ref(360);

const colStyle = computed(() => ({
    fontSize: `${props.textSize}px`,
    fontFamily: props.font || undefined,
}));

function rewindow() {
    const list = props.tokens;
    const i = props.index;
    let from = Math.max(0, i - BACK);
    // Окно начинаем с начала абзаца — обрубок фразы сверху читается плохо.
    for (let k = 0; k < 300 && from > 0 && !(list[from - 1].f & PARAGRAPH); k++) from--;
    win.value = { from, to: Math.min(list.length, i + AHEAD) };
}

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

// ── Подсветка и прокрутка ─────────────────────────────────────────────────

let lit = [];
let userScrollAt = 0;

function onUserScroll() {
    userScrollAt = Date.now();
}

function highlight() {
    const root = scrollEl.value;
    if (!root) return;
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

watch(() => props.index, (i) => {
    if (i < win.value.from || i > win.value.to - 250) {
        rewindow();
        nextTick(() => { highlight(); follow(true); });
        return;
    }
    nextTick(highlight);
});

watch(() => [props.frame?.start, props.frame?.count], () => nextTick(highlight));

// Подгрузились новые страницы — окно может вырасти вперёд.
watch(() => props.version, () => {
    if (win.value.to < Math.min(props.tokens.length, props.index + AHEAD)) {
        win.value = { ...win.value, to: Math.min(props.tokens.length, props.index + AHEAD) };
        nextTick(highlight);
    }
});

watch(() => props.bionic, () => nextTick(highlight));

function onClick(e) {
    const span = e.target.closest?.('.rsvp-pw');
    if (span) {
        emit('seek', +span.dataset.i);
        return;
    }
    if (e.target.closest?.('figure')) return;
    emit('toggle');
}

onMounted(() => {
    figHeight.value = Math.max(220, Math.round((scrollEl.value?.clientHeight || 600) * 0.6));
    rewindow();
    nextTick(() => { highlight(); follow(true); });
});
</script>
