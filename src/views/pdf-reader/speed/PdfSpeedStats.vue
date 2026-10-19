<template>
    <div class="rsvp-sheet-backdrop" @click.self="emit('close')">
        <div class="rsvp-sheet rsvp-stats" role="dialog" aria-label="Статистика скорочтения">
            <div class="rsvp-sheet-head">
                <div class="rsvp-sheet-title">Скорость чтения</div>
                <button class="rsvp-icon" aria-label="Закрыть" @click="emit('close')">✕</button>
            </div>

            <div class="rsvp-seg rsvp-stats-scope">
                <button :class="{ active: scope === 'all' }" @click="scope = 'all'">Все книги</button>
                <button :class="{ active: scope === 'book' }" @click="scope = 'book'">Эта книга</button>
            </div>

            <div v-if="loading" class="rsvp-note">Загружаю…</div>
            <div v-else-if="error" class="rsvp-note">Не удалось загрузить: {{ error }}</div>
            <template v-else-if="stats">
                <div class="rsvp-summary-grid">
                    <div><b>{{ stats.today.words.toLocaleString('ru-RU') }}</b><span>слов сегодня</span></div>
                    <div><b>{{ stats.week.wpm || '—' }}</b><span>сл/мин за неделю</span></div>
                    <div><b>{{ stats.bestWpm || '—' }}</b><span>рекорд, сл/мин</span></div>
                    <div><b>{{ hours(stats.total.seconds) }}</b><span>всего, {{ stats.total.words.toLocaleString('ru-RU') }} сл</span></div>
                </div>

                <div v-if="suggestion" class="rsvp-suggest">
                    <span>{{ suggestion.reason }}</span>
                    <button class="rsvp-btn rsvp-btn-accent" @click="emit('apply-wpm', suggestion.wpm)">
                        {{ suggestion.wpm }} сл/мин
                    </button>
                </div>

                <!-- График: фактическая скорость по заходам, точка окрашена по пониманию -->
                <div v-if="chart" class="rsvp-chart">
                    <svg :viewBox="`0 0 ${CW} ${CH}`" preserveAspectRatio="none" aria-hidden="true">
                        <line v-for="g in chart.grid" :key="g.v" :x1="0" :x2="CW" :y1="g.y" :y2="g.y" class="rsvp-chart-grid" />
                        <polyline :points="chart.line" class="rsvp-chart-line" />
                    </svg>
                    <div class="rsvp-chart-dots">
                        <span v-for="(p, k) in chart.points" :key="k" class="rsvp-chart-dot" :class="`c${p.c}`"
                            :style="{ left: (p.x / CW * 100) + '%', top: (p.y / CH * 100) + '%' }"
                            :title="`${p.date}: ${p.wpm} сл/мин`"></span>
                    </div>
                    <div class="rsvp-chart-axis">
                        <span v-for="g in chart.grid" :key="g.v" :style="{ top: (g.y / CH * 100) + '%' }">{{ g.v }}</span>
                    </div>
                    <div class="rsvp-chart-legend">
                        <span><i class="rsvp-chart-dot c5"></i>понял хорошо</span>
                        <span><i class="rsvp-chart-dot c3"></i>суть</span>
                        <span><i class="rsvp-chart-dot c1"></i>мимо</span>
                        <span><i class="rsvp-chart-dot c0"></i>без оценки</span>
                    </div>
                </div>
                <div v-else class="rsvp-note">
                    График появится после пары заходов дольше минуты.
                </div>

                <div v-if="stats.sessions.length" class="rsvp-history">
                    <div v-for="s in stats.sessions.slice(0, 12)" :key="s.id" class="rsvp-history-row">
                        <span class="rsvp-history-date">{{ shortDate(s.date) }}</span>
                        <span class="rsvp-history-book">{{ scope === 'all' ? s.title : `стр. ${s.startPage}–${s.endPage}` }}</span>
                        <span class="rsvp-history-wpm">{{ s.wpm ? `${s.wpm} сл/мин` : `${s.words} сл` }}</span>
                        <span class="rsvp-history-rate">{{ rateEmoji(s.comprehension) }}</span>
                    </div>
                </div>
                <div v-else class="rsvp-note">Пока ни одного захода — самое время начать.</div>

                <div class="rsvp-note rsvp-method">
                    Как расти: держите скорость, пока понимание «хорошо» два захода подряд, потом +25–50.
                    Просело до «слабо» — шаг назад. Скорость считается по чистому времени показа,
                    без пауз, и только по заходам длиннее минуты.
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { getSpeedStats, pdfLogicalToday } from '@/api/pdfFiles.js';
import { suggestWpm } from './rsvpText.js';

const props = defineProps({
    fileId: { type: String, default: '' },
    currentWpm: { type: Number, default: 300 },
});
const emit = defineEmits(['close', 'apply-wpm']);

const CW = 300;
const CH = 110;

const scope = ref('all');
const stats = ref(null);
const loading = ref(false);
const error = ref('');

async function load() {
    loading.value = true;
    error.value = '';
    try {
        stats.value = await getSpeedStats({
            fileId: scope.value === 'book' ? props.fileId : '',
            date: pdfLogicalToday(),
        });
    } catch (e) {
        error.value = e?.message || String(e);
    } finally {
        loading.value = false;
    }
}

watch(scope, load, { immediate: true });

const suggestion = computed(() => suggestWpm(stats.value?.sessions, props.currentWpm));

const chart = computed(() => {
    const list = (stats.value?.sessions ?? []).filter((s) => s.wpm > 0).slice(0, 30).reverse();
    if (list.length < 2) return null;
    const values = list.map((s) => s.wpm);
    const lo = Math.max(0, Math.floor((Math.min(...values) - 30) / 50) * 50);
    const hi = Math.ceil((Math.max(...values) + 30) / 50) * 50;
    const pad = 8;
    const y = (v) => pad + (1 - (v - lo) / (hi - lo || 1)) * (CH - pad * 2);
    const x = (k) => pad + (k / (list.length - 1)) * (CW - pad * 2);
    const points = list.map((s, k) => ({
        x: x(k), y: y(s.wpm), wpm: s.wpm, date: s.date,
        c: s.comprehension == null ? 0 : s.comprehension >= 4 ? 5 : s.comprehension === 3 ? 3 : 1,
    }));
    const step = (hi - lo) / 2;
    const grid = [lo, lo + step, hi].map((v) => ({ v: Math.round(v), y: y(v) }));
    return { points, grid, line: points.map((p) => `${p.x},${p.y}`).join(' ') };
});

function hours(seconds) {
    if (!seconds) return '0 мин';
    const min = seconds / 60;
    if (min < 60) return `${Math.round(min)} мин`;
    return `${(min / 60).toFixed(1).replace('.', ',')} ч`;
}

function shortDate(iso) {
    const [, m, d] = (iso || '').split('-');
    return d && m ? `${d}.${m}` : iso;
}

function rateEmoji(v) {
    return ['', '😵', '😕', '🙂', '😊', '🤓'][v || 0] || '·';
}
</script>
