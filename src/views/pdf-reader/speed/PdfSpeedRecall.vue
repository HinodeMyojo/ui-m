<template>
    <div class="rsvp-sheet-backdrop">
        <div class="rsvp-sheet rsvp-recall" role="dialog" aria-label="Пересказ главы по памяти">
            <div class="rsvp-sheet-head">
                <div>
                    <div class="rsvp-overline">{{ review ? `Повтор №${(note?.reviews || 0) + 1}` : 'Глава прочитана' }}</div>
                    <div class="rsvp-sheet-title">{{ chapter.title }}</div>
                </div>
                <button class="rsvp-icon" aria-label="Пропустить" title="Пропустить" @click="emit('close')">✕</button>
            </div>

            <!-- Шаг 1: вспомнить, не подглядывая -->
            <template v-if="step === 1">
                <div class="rsvp-note">
                    Не листая назад: ответь на свои вопросы и запиши главное своими словами.
                    Вспоминать полезнее, чем перечитывать — так глава и остаётся в голове.
                </div>
                <ol v-if="questionsList.length" class="rsvp-recall-q">
                    <li v-for="q in questionsList" :key="q">{{ q }}</li>
                </ol>
                <textarea ref="textEl" class="rsvp-input rsvp-textarea" v-model="recall" rows="7"
                    placeholder="3–5 мыслей: что это, как устроено, чем отличается, где риск…" @keydown.stop></textarea>
                <div class="rsvp-sheet-actions">
                    <button class="rsvp-btn" @click="emit('close')">Пропустить</button>
                    <button class="rsvp-btn rsvp-btn-accent" @click="step = 2">Сверить с главой →</button>
                </div>
            </template>

            <!-- Шаг 2: свериться и оценить -->
            <template v-else>
                <div v-if="!summary" class="rsvp-note"><span class="rsvp-spin rsvp-spin-sm"></span> Собираю план главы…</div>
                <template v-else>
                    <div v-if="summary.headings.length" class="rsvp-ov-section">
                        <div class="rsvp-ov-title">Что было в главе</div>
                        <div v-for="h in summary.headings" :key="h.p + ':' + h.i" class="rsvp-ov-heading rsvp-ov-static">
                            <span class="rsvp-ov-h">{{ h.text }}</span>
                            <span v-if="h.lead" class="rsvp-ov-lead">{{ h.lead }}</span>
                        </div>
                    </div>
                    <div v-if="summary.terms.length" class="rsvp-ov-section">
                        <div class="rsvp-ov-title">Термины</div>
                        <div class="rsvp-recall-terms">
                            <span v-for="t in summary.terms" :key="t.term" :title="t.def">{{ t.term }}</span>
                        </div>
                    </div>
                </template>
                <div class="rsvp-rate-title">Насколько полно вспомнил?</div>
                <div class="rsvp-rate">
                    <button v-for="r in SCORES" :key="r.value" class="rsvp-rate-btn" :class="{ active: score === r.value }"
                        @click="score = r.value">
                        <span class="rsvp-rate-emoji">{{ r.emoji }}</span><span>{{ r.label }}</span>
                    </button>
                </div>
                <label v-if="fileId" class="rsvp-toggle">
                    <input type="checkbox" v-model="remind" />
                    <span><b>Напомнить повторить</b> Карточка ляжет во вкладку «Сегодня» на день повтора:
                        через день, потом через неделю и через месяц. Вспомнил плохо — снова через день.</span>
                </label>
                <div v-if="state" class="rsvp-note">{{ state }}</div>
                <div class="rsvp-sheet-actions">
                    <button class="rsvp-btn" @click="step = 1">← Дописать</button>
                    <button class="rsvp-btn rsvp-btn-accent" :disabled="busy || !score" @click="save">
                        {{ busy ? 'Сохраняю…' : 'Сохранить' }}
                    </button>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { saveChapterRecall, pdfLogicalToday } from '@/api/pdfFiles.js';

// Пересказ главы по памяти — docs/pdf-library.md (back-m), «Техническая книга».
// Вспомнить и потом свериться — приём с лучшей доказанной пользой для
// запоминания; перечитывание и выделение маркером в тех же разборах — внизу.

const props = defineProps({
    source: { type: Object, default: null },
    chapter: { type: Object, required: true },  // { key, title, start, end }
    note: { type: Object, default: null },
    fileId: { type: String, default: '' },
    review: Boolean,                            // открыт по карточке повтора
});
const emit = defineEmits(['close', 'saved']);

const SCORES = [
    { value: 1, emoji: '😶', label: 'пусто' },
    { value: 2, emoji: '😕', label: 'обрывки' },
    { value: 3, emoji: '🙂', label: 'суть' },
    { value: 4, emoji: '😊', label: 'почти всё' },
    { value: 5, emoji: '🤓', label: 'всё' },
];

const step = ref(1);
const recall = ref('');
const score = ref(null);
const remind = ref(true);
const busy = ref(false);
const state = ref('');
const summary = ref(null);
const textEl = ref(null);

const questionsList = computed(() => (props.note?.questions || []).filter((q) => q.trim()));

onMounted(async () => {
    await nextTick();
    textEl.value?.focus();
    if (props.source) {
        summary.value = await props.source.chapterSummary(props.chapter.start, props.chapter.end);
    } else {
        summary.value = { headings: [], terms: [] };
    }
});

async function save() {
    if (!props.fileId) {
        emit('close');
        return;
    }
    busy.value = true;
    state.value = '';
    try {
        const note = await saveChapterRecall(props.fileId, props.chapter.key, {
            title: props.chapter.title,
            startPage: props.chapter.start,
            endPage: props.chapter.end,
            date: pdfLogicalToday(),
            recall: recall.value,
            score: score.value,
            remind: remind.value,
        });
        emit('saved', note);
    } catch (e) {
        state.value = `Не сохранилось: ${e.message}`;
    } finally {
        busy.value = false;
    }
}
</script>
