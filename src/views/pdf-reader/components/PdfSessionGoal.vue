<template>
    <Teleport to="body">
        <div v-if="visible" class="pdf-translate-backdrop" @click.self="emit('close')">
            <div class="pdf-goal-panel" @click.stop>
                <div class="pdf-tm-header">
                    <span class="pdf-tm-title">🎯 Цель на эту сессию</span>
                    <button class="pdf-tm-close" @click="emit('close')">✕</button>
                </div>

                <div class="pdf-goal-body">
                    <div class="pdf-goal-row">
                        <input
                            v-model="pagesInput"
                            class="pdf-goal-input"
                            type="number"
                            min="1"
                            inputmode="numeric"
                            placeholder="стр."
                        />
                        <button
                            v-for="p in presets"
                            :key="p"
                            class="pdf-goal-preset"
                            :class="{ active: goalPages === p }"
                            @click="pagesInput = String(p)"
                        >
                            {{ p === pagesLeft ? `до конца · ${p}` : p }}
                        </button>
                    </div>

                    <template v-if="goalPages">
                        <div class="pdf-goal-line">{{ timeLine }}</div>
                        <div v-if="bookLine" class="pdf-goal-line">{{ bookLine }}</div>
                        <div v-if="planning" class="pdf-goal-line">план обучения…</div>
                        <div v-else-if="planLine" class="pdf-goal-line" :class="`is-${planLine.tone || 'plain'}`">
                            {{ planLine.text }}
                        </div>
                        <div v-if="pagesRead" class="pdf-goal-line">
                            уже прочитано за эту сессию: {{ pagesRead }} из {{ goalPages }}
                        </div>
                    </template>
                    <template v-else>
                        <div v-if="planStatus" class="pdf-goal-line">{{ planStatus }}</div>
                        <div class="pdf-goal-line">
                            Сколько страниц хочется осилить прямо сейчас. Посчитаю время и что это
                            даст плану. Цель живёт до закрытия вкладки — это намерение, а не обещание.
                        </div>
                    </template>
                </div>

                <div class="pdf-goal-foot">
                    <button v-if="goalPages" class="pdf-tb-btn pdf-tb-sm" @click="pagesInput = ''">
                        Убрать цель
                    </button>
                    <span style="flex: 1"></span>
                    <button class="pdf-tm-save-btn" @click="emit('close')">Читать</button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useSessionGoal } from '@/composables/useReadingGoal.js';
import { goalTimeLine, goalBookLine, goalPlanLine, goalPlanStatus } from '@/utils/readingGoal.js';
import { fetchRoadmaps, fetchRoadmapFull } from '@/components/roadmapApi.js';

// Цель на сессию прямо в читалке — docs/pdf-library.md.
//
// Та же цель, что ставится в карточке книги: в библиотеку заходят не всегда,
// «Продолжить чтение» и мобильная главная открывают читалку сразу.

const props = defineProps({
    visible: Boolean,
    file: { type: Object, default: null }, // карточка книги из библиотеки
    currentPage: { type: Number, default: 1 },
});
const emit = defineEmits(['close']);

const fileId = computed(() => props.file?.id || '');
const page = computed(() => props.currentPage);
const { goal, pagesRead, setPages, clear } = useSessionGoal(fileId, page);

const pagesInput = ref('');
const goalPages = computed(() => {
    const parsed = parseInt(pagesInput.value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
});

// Цель отсчитывается от страницы, на которой её поставили; уже поставленная
// свою точку отсчёта не теряет — иначе прочитанное обнулялось бы при каждом
// открытии панели.
const startPage = computed(() => goal.value?.fromPage || props.currentPage || 1);
const pagesLeft = computed(() => Math.max(0, (props.file?.pageCount || 0) - startPage.value));

const presets = computed(() => {
    const list = [10, 25, 50].filter((p) => !pagesLeft.value || p < pagesLeft.value);
    return pagesLeft.value ? [...list, pagesLeft.value] : list;
});

watch(goalPages, (pages) => {
    if (pages) setPages(pages, startPage.value);
    else clear();
});

// План тянем один раз и только когда панель открыли: ради строчки про
// отставание дёргать roadmap при каждом открытии книги незачем.
const roadmapFull = ref(null);
const planning = ref(false);
let planLoaded = false;

async function loadPlan() {
    if (planLoaded || planning.value) return;
    planning.value = true;
    try {
        const list = await fetchRoadmaps();
        const active = list.find((r) => r.isActive) || list[0];
        if (active) roadmapFull.value = await fetchRoadmapFull(active.id);
        planLoaded = true;
    } catch {
        roadmapFull.value = null;
    } finally {
        planning.value = false;
    }
}

watch(
    () => props.visible,
    (open) => {
        if (!open) return;
        pagesInput.value = goal.value?.pages ? String(goal.value.pages) : '';
        if (props.file?.roadmapItemId) loadPlan();
    },
    { immediate: true },
);

const timeLine = computed(() => goalTimeLine(props.file, [], goalPages.value));
const bookLine = computed(() => goalBookLine(props.file, goalPages.value, startPage.value));
const planStatus = computed(() => goalPlanStatus(roadmapFull.value, props.file?.roadmapItemId));
const planLine = computed(() =>
    goalPlanLine({
        full: roadmapFull.value,
        itemId: props.file?.roadmapItemId,
        pages: goalPages.value,
        fromPage: startPage.value,
        pageCount: props.file?.pageCount,
    }),
);
</script>
