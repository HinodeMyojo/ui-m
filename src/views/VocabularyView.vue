<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import {
  fetchVocabCards,
  fetchDueCards,
  addVocabCard,
  reviewVocabCard,
  deleteVocabCard,
  lookupVocabWord,
} from "@/components/api.js";

const router = useRouter();

// --- state ---
const allCards = ref([]);
const dueCards = ref([]);
const loading = ref(false);

// tabs: "all" | "study"
const tab = ref("all");

// add-card form
const showAddModal = ref(false);
const addForm = ref({ word: "", translation: "", transcription: "", partOfSpeech: "", examples: "", synonyms: "" });
const addLoading = ref(false);
const lookupLoading = ref(false);
const lookupError = ref("");
const lookupDefs = ref([]); // full def[] from Yandex API

let lookupTimer = null;
watch(() => addForm.value.word, (val) => {
  clearTimeout(lookupTimer);
  lookupError.value = "";
  lookupDefs.value = [];
  const trimmed = val.trim();
  if (trimmed.length < 2) return;
  lookupTimer = setTimeout(() => doLookup(trimmed), 600);
});

async function doLookup(word) {
  lookupLoading.value = true;
  lookupError.value = "";
  lookupDefs.value = [];
  try {
    const data = await lookupVocabWord(word);
    if (!data?.def?.length) { lookupError.value = "Не найдено в словаре"; return; }
    lookupDefs.value = data.def;
    // Auto-fill from first def
    const def = data.def[0];
    const tr = def.tr?.[0];
    if (tr) {
      if (!addForm.value.transcription) addForm.value.transcription = def.ts ?? "";
      if (!addForm.value.partOfSpeech) addForm.value.partOfSpeech = def.pos ?? "";
      if (!addForm.value.translation) addForm.value.translation = tr.text ?? "";
      if (!addForm.value.synonyms && tr.syn?.length)
        addForm.value.synonyms = tr.syn.map(s => s.text).join(", ");
      if (!addForm.value.examples && tr.ex?.length)
        addForm.value.examples = JSON.stringify(
          tr.ex.slice(0, 3).map(e => ({ source: e.text, translated: e.tr?.[0]?.text ?? "" }))
        );
    }
  } catch {
    lookupError.value = "Ошибка запроса";
  } finally {
    lookupLoading.value = false;
  }
}

function pickTranslation(def, tr) {
  addForm.value.translation = tr.text;
  addForm.value.partOfSpeech = def.pos ?? addForm.value.partOfSpeech;
  if (def.ts) addForm.value.transcription = def.ts;
  if (tr.syn?.length) addForm.value.synonyms = tr.syn.map(s => s.text).join(", ");
  if (tr.ex?.length) addForm.value.examples = JSON.stringify(
    tr.ex.slice(0, 3).map(e => ({ source: e.text, translated: e.tr?.[0]?.text ?? "" }))
  );
}

// study mode
const studyIndex = ref(0);
const flipped = ref(false);
const sessionDone = ref(false);

// computed
const currentCard = computed(() => dueCards.value[studyIndex.value] ?? null);
const masteredCount = computed(() =>
  allCards.value.filter((c) => c.repetitions >= 3 && c.intervalDays >= 21).length
);

// SM-2 label helpers
const masteryLabel = (card) => {
  if (card.repetitions === 0) return { text: "Новая", cls: "tag-new" };
  if (card.intervalDays < 7) return { text: "Учится", cls: "tag-learning" };
  if (card.intervalDays < 21) return { text: "Знакома", cls: "tag-familiar" };
  return { text: "Освоена", cls: "tag-mastered" };
};

// --- data loading ---
async function loadAll() {
  loading.value = true;
  try {
    allCards.value = await fetchVocabCards();
  } finally {
    loading.value = false;
  }
}

async function loadDue() {
  loading.value = true;
  try {
    const res = await fetchDueCards();
    dueCards.value = res.cards ?? [];
    studyIndex.value = 0;
    flipped.value = false;
    sessionDone.value = dueCards.value.length === 0;
  } finally {
    loading.value = false;
  }
}

function switchTab(t) {
  tab.value = t;
  if (t === "study") loadDue();
  else loadAll();
}

// --- add card ---
async function submitAdd() {
  if (!addForm.value.word || !addForm.value.translation) return;
  addLoading.value = true;
  try {
    await addVocabCard({ ...addForm.value });
    addForm.value = { word: "", translation: "", transcription: "", partOfSpeech: "", examples: "", synonyms: "" };
    showAddModal.value = false;
    await loadAll();
  } finally {
    addLoading.value = false;
  }
}

// --- study ---
function flipCard() {
  flipped.value = !flipped.value;
}

async function grade(quality) {
  const card = currentCard.value;
  if (!card) return;
  await reviewVocabCard(card.id, quality);
  if (studyIndex.value + 1 >= dueCards.value.length) {
    sessionDone.value = true;
    await loadAll();
  } else {
    studyIndex.value++;
    flipped.value = false;
  }
}

async function removeCard(id) {
  await deleteVocabCard(id);
  allCards.value = allCards.value.filter((c) => c.id !== id);
}

function parseExamples(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function parseSynonyms(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return raw.split(",").map((s) => s.trim()).filter(Boolean); }
}

onMounted(loadAll);
</script>

<template>
  <div class="vocab-page">
    <!-- Header -->
    <div class="vocab-header">
      <div class="header-left">
        <button class="back-btn" @click="router.push('/')">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 10H5M5 10l4-4M5 10l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          На главную
        </button>
        <div>
          <h1 class="page-title">Словарь</h1>
          <p class="page-subtitle">EN → RU · Интервальное повторение (SM-2)</p>
        </div>
      </div>
      <div class="header-stats">
        <div class="stat-chip">
          <span class="stat-num">{{ allCards.length }}</span>
          <span class="stat-label">всего</span>
        </div>
        <div class="stat-chip">
          <span class="stat-num">{{ dueCards.length || '—' }}</span>
          <span class="stat-label">на сегодня</span>
        </div>
        <div class="stat-chip">
          <span class="stat-num">{{ masteredCount }}</span>
          <span class="stat-label">освоено</span>
        </div>
        <button class="btn-primary" @click="showAddModal = true">+ Добавить</button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button :class="['tab-btn', tab === 'all' && 'active']" @click="switchTab('all')">Все карточки</button>
      <button :class="['tab-btn', tab === 'study' && 'active']" @click="switchTab('study')">
        Учить
        <span v-if="dueCards.length" class="due-badge">{{ dueCards.length }}</span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading">Загрузка...</div>

    <!-- ALL CARDS TAB -->
    <div v-else-if="tab === 'all'" class="cards-grid">
      <div v-if="allCards.length === 0" class="empty-state">
        Нет карточек. Добавьте первое слово!
      </div>
      <div v-for="card in allCards" :key="card.id" class="card-item">
        <div class="card-top">
          <div>
            <div class="card-word">{{ card.word }}</div>
            <div class="card-transcription" v-if="card.transcription">[{{ card.transcription }}]</div>
          </div>
          <div class="card-top-right">
            <span :class="['mastery-tag', masteryLabel(card).cls]">{{ masteryLabel(card).text }}</span>
            <button class="delete-btn" @click="removeCard(card.id)" title="Удалить">✕</button>
          </div>
        </div>
        <div class="card-translation">{{ card.translation }}</div>
        <div class="card-meta" v-if="card.partOfSpeech">
          <span class="pos-tag">{{ card.partOfSpeech }}</span>
          <span v-if="card.gender" class="gender-tag">{{ card.gender }}</span>
        </div>
        <div class="card-synonyms" v-if="parseSynonyms(card.synonyms).length">
          <span class="meta-label">Синонимы:</span>
          {{ parseSynonyms(card.synonyms).join(", ") }}
        </div>
        <div class="card-examples" v-if="parseExamples(card.examples).length">
          <div v-for="(ex, i) in parseExamples(card.examples)" :key="i" class="example-row">
            <span class="example-en">{{ ex.source }}</span>
            <span class="example-ru">{{ ex.translated }}</span>
          </div>
        </div>
        <div class="card-footer">
          <span>Повторений: {{ card.repetitions }}</span>
          <span>Интервал: {{ card.intervalDays }}д</span>
          <span v-if="card.nextReview">Следующий: {{ card.nextReview }}</span>
        </div>
      </div>
    </div>

    <!-- STUDY TAB -->
    <div v-else-if="tab === 'study'" class="study-area">
      <!-- Session done -->
      <div v-if="sessionDone" class="done-state">
        <div class="done-icon">🎉</div>
        <div class="done-title">Сессия завершена!</div>
        <div class="done-sub">Все карточки на сегодня повторены.</div>
        <button class="btn-primary" @click="switchTab('all')">К списку</button>
      </div>

      <!-- Flashcard -->
      <div v-else-if="currentCard" class="flashcard-wrap">
        <div class="progress-bar-wrap">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" :style="{ width: ((studyIndex / dueCards.length) * 100) + '%' }"></div>
          </div>
          <span class="progress-text">{{ studyIndex + 1 }} / {{ dueCards.length }}</span>
        </div>

        <div :class="['flashcard', flipped && 'flipped']" @click="flipCard">
          <div class="fc-inner">
            <!-- Front -->
            <div class="fc-face fc-front">
              <div class="fc-pos" v-if="currentCard.partOfSpeech">{{ currentCard.partOfSpeech }}</div>
              <div class="fc-word">{{ currentCard.word }}</div>
              <div class="fc-transcription" v-if="currentCard.transcription">[{{ currentCard.transcription }}]</div>
              <div class="fc-hint">нажмите, чтобы перевернуть</div>
            </div>
            <!-- Back -->
            <div class="fc-face fc-back">
              <div class="fc-translation">{{ currentCard.translation }}</div>
              <div class="fc-synonyms" v-if="parseSynonyms(currentCard.synonyms).length">
                {{ parseSynonyms(currentCard.synonyms).join(" · ") }}
              </div>
              <div class="fc-examples" v-if="parseExamples(currentCard.examples).length">
                <div v-for="(ex, i) in parseExamples(currentCard.examples).slice(0,2)" :key="i" class="fc-example">
                  <em>{{ ex.source }}</em> — {{ ex.translated }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Grade buttons (visible after flip) -->
        <div v-if="flipped" class="grade-btns">
          <button class="grade-btn grade-again" @click.stop="grade(0)">Снова<br><small>завтра</small></button>
          <button class="grade-btn grade-hard" @click.stop="grade(2)">Сложно<br><small>скоро</small></button>
          <button class="grade-btn grade-good" @click.stop="grade(4)">Хорошо<br><small>позже</small></button>
          <button class="grade-btn grade-easy" @click.stop="grade(5)">Легко<br><small>надолго</small></button>
        </div>
        <div v-else class="grade-hint">Оцените после того, как увидите перевод</div>
      </div>
    </div>

    <!-- ADD MODAL -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal-card">
        <button class="modal-close" @click="showAddModal = false">×</button>
        <h2 class="modal-title">Новая карточка</h2>
        <form class="modal-form" @submit.prevent="submitAdd">
          <label>
            <span class="label-text">
              Слово (EN) *
              <span v-if="lookupLoading" class="lookup-spinner">⏳</span>
              <span v-else-if="lookupError" class="lookup-error">{{ lookupError }}</span>
              <span v-else-if="addForm.translation" class="lookup-ok">✓ найдено</span>
            </span>
            <input v-model="addForm.word" class="form-input" placeholder="ephemeral" required autofocus />
          </label>
          <!-- Lookup results: all POS groups + translations -->
          <div v-if="lookupDefs.length" class="lookup-defs">
            <div v-for="def in lookupDefs" :key="def.pos + def.text" class="lookup-def-group">
              <span class="lookup-pos">{{ def.pos }}</span>
              <span v-if="def.ts" class="lookup-ts">[{{ def.ts }}]</span>
              <div class="lookup-chips">
                <button
                  v-for="tr in def.tr"
                  :key="tr.text"
                  type="button"
                  :class="['lookup-chip', addForm.translation === tr.text && 'active']"
                  @click="pickTranslation(def, tr)"
                >{{ tr.text }}</button>
              </div>
            </div>
          </div>
          <label>
            <span class="label-text">Перевод (RU) *</span>
            <input v-model="addForm.translation" class="form-input" placeholder="эфемерный" required />
          </label>
          <label>
            <span class="label-text">Транскрипция</span>
            <input v-model="addForm.transcription" class="form-input" placeholder="ɪˈfem(ə)rəl" />
          </label>
          <label>
            <span class="label-text">Часть речи</span>
            <input v-model="addForm.partOfSpeech" class="form-input" placeholder="adjective" />
          </label>
          <label>
            <span class="label-text">Синонимы (через запятую)</span>
            <input v-model="addForm.synonyms" class="form-input" placeholder="transient, fleeting" />
          </label>
          <label>
            <span class="label-text">Примеры (JSON)</span>
            <textarea v-model="addForm.examples" class="form-textarea" rows="2"
              placeholder='[{"source":"It was ephemeral","translated":"Это было эфемерным"}]'></textarea>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showAddModal = false">Отмена</button>
            <button type="submit" class="btn-primary" :disabled="addLoading">
              {{ addLoading ? "Сохраняю..." : "Добавить" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vocab-page {
  min-height: 100vh;
  background: #18191f;
  color: #e8eaf0;
  padding: 24px;
  font-family: Inter, "Noto Sans", sans-serif;
  max-width: 1100px;
  margin: 0 auto;
}

/* Header */
.vocab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 28px;
}
.header-left { display: flex; align-items: center; gap: 20px; }
.back-btn {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 8px 14px; color: #b7c9d1; font-size: 13px;
  cursor: pointer; transition: all 0.2s;
}
.back-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.page-title { font-size: 26px; font-weight: 700; color: #fff; margin: 0; }
.page-subtitle { font-size: 13px; color: #6b7a9a; margin: 2px 0 0; }
.header-stats { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.stat-chip {
  display: flex; flex-direction: column; align-items: center;
  background: rgba(23,103,253,0.08); border: 1px solid rgba(23,103,253,0.2);
  border-radius: 10px; padding: 8px 16px;
}
.stat-num { font-size: 22px; font-weight: 700; color: #1767fd; line-height: 1; }
.stat-label { font-size: 11px; color: #6b7a9a; margin-top: 2px; }
.btn-primary {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none; border-radius: 10px; padding: 10px 20px;
  color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: opacity 0.2s;
}
.btn-primary:hover { opacity: 0.88; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px; padding: 10px 20px; color: #b7c9d1;
  font-size: 14px; cursor: pointer; transition: all 0.2s;
}
.btn-secondary:hover { background: rgba(255,255,255,0.1); }

/* Tabs */
.tabs { display: flex; gap: 8px; margin-bottom: 24px; }
.tab-btn {
  position: relative;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 9px 20px; color: #7a8aaa; font-size: 14px;
  font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.tab-btn.active { background: rgba(23,103,253,0.15); border-color: rgba(23,103,253,0.4); color: #fff; }
.due-badge {
  position: absolute; top: -6px; right: -6px;
  background: #ff4d4f; color: #fff; font-size: 11px; font-weight: 700;
  border-radius: 99px; padding: 2px 6px; line-height: 1.2;
}

/* Loading / empty */
.loading, .empty-state {
  text-align: center; color: #6b7a9a; padding: 60px 0; font-size: 15px;
}

/* Cards grid */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.card-item {
  background: linear-gradient(135deg, rgba(18,19,31,0.98), rgba(23,25,40,0.98));
  border: 1px solid rgba(23,103,253,0.18); border-radius: 14px; padding: 18px;
  display: flex; flex-direction: column; gap: 8px;
  transition: border-color 0.2s;
}
.card-item:hover { border-color: rgba(23,103,253,0.4); }
.card-top { display: flex; justify-content: space-between; align-items: flex-start; }
.card-top-right { display: flex; align-items: center; gap: 8px; }
.card-word { font-size: 20px; font-weight: 700; color: #fff; }
.card-transcription { font-size: 13px; color: #6b7a9a; margin-top: 2px; }
.card-translation { font-size: 16px; font-weight: 600; color: #a8d8ff; }
.card-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.pos-tag, .gender-tag {
  font-size: 11px; border-radius: 6px; padding: 2px 8px; font-weight: 600;
}
.pos-tag { background: rgba(110,74,255,0.15); color: #9b7fff; border: 1px solid rgba(110,74,255,0.3); }
.gender-tag { background: rgba(255,173,76,0.12); color: #ffad4c; border: 1px solid rgba(255,173,76,0.3); }
.mastery-tag {
  font-size: 11px; border-radius: 6px; padding: 2px 8px; font-weight: 700;
}
.tag-new { background: rgba(120,120,140,0.2); color: #9099aa; }
.tag-learning { background: rgba(255,77,79,0.15); color: #ff7875; }
.tag-familiar { background: rgba(255,197,61,0.15); color: #ffc53d; }
.tag-mastered { background: rgba(82,196,26,0.15); color: #73d13d; }
.card-synonyms { font-size: 12px; color: #7a8aaa; }
.meta-label { font-weight: 600; color: #5a6a8a; margin-right: 4px; }
.card-examples { border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; }
.example-row { font-size: 12px; color: #8899bb; margin-bottom: 4px; }
.example-en { font-style: italic; }
.example-ru { color: #6b7a9a; margin-left: 6px; }
.card-footer {
  display: flex; gap: 12px; font-size: 11px; color: #4a5a7a;
  border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px; margin-top: 4px;
}
.delete-btn {
  background: none; border: none; color: #4a5a7a; font-size: 16px;
  cursor: pointer; line-height: 1; padding: 2px 4px; transition: color 0.2s;
}
.delete-btn:hover { color: #ff4d4f; }

/* Study area */
.study-area {
  display: flex; flex-direction: column; align-items: center; gap: 24px;
  padding: 16px 0;
}
.done-state {
  text-align: center; padding: 60px 20px; display: flex; flex-direction: column;
  align-items: center; gap: 12px;
}
.done-icon { font-size: 56px; }
.done-title { font-size: 26px; font-weight: 700; color: #fff; }
.done-sub { font-size: 15px; color: #6b7a9a; }

.flashcard-wrap {
  width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 20px;
}
.progress-bar-wrap { display: flex; align-items: center; gap: 12px; }
.progress-bar-track {
  flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden;
}
.progress-bar-fill {
  height: 100%; background: linear-gradient(90deg, #1767fd, #6e4aff);
  border-radius: 99px; transition: width 0.4s ease;
}
.progress-text { font-size: 13px; color: #6b7a9a; white-space: nowrap; }

.flashcard {
  perspective: 1000px; width: 100%; aspect-ratio: 3/2; cursor: pointer;
}
.fc-inner {
  position: relative; width: 100%; height: 100%;
  transition: transform 0.55s ease; transform-style: preserve-3d;
}
.flashcard.flipped .fc-inner { transform: rotateY(180deg); }
.fc-face {
  position: absolute; inset: 0; backface-visibility: hidden;
  border-radius: 18px; padding: 28px 32px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: linear-gradient(135deg, rgba(18,19,31,0.99), rgba(23,25,40,0.99));
  border: 1px solid rgba(23,103,253,0.25);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.fc-back { transform: rotateY(180deg); }
.fc-pos { font-size: 12px; color: #9b7fff; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.fc-word { font-size: 36px; font-weight: 800; color: #fff; text-align: center; }
.fc-transcription { font-size: 16px; color: #6b7a9a; margin-top: 6px; }
.fc-hint { font-size: 12px; color: #3a4a6a; margin-top: 16px; }
.fc-translation { font-size: 28px; font-weight: 700; color: #a8d8ff; text-align: center; }
.fc-synonyms { font-size: 14px; color: #6b7a9a; margin-top: 8px; text-align: center; }
.fc-examples { margin-top: 12px; width: 100%; }
.fc-example { font-size: 13px; color: #7a8aaa; text-align: center; line-height: 1.5; }

.grade-btns {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
}
.grade-btn {
  border: none; border-radius: 12px; padding: 12px 6px;
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: all 0.18s; line-height: 1.4; text-align: center;
  min-height: 56px;
}
.grade-btn small { font-weight: 400; font-size: 11px; opacity: 0.8; display: block; }
.grade-again { background: rgba(255,77,79,0.18); color: #ff7875; border: 1px solid rgba(255,77,79,0.35); }
.grade-again:hover { background: rgba(255,77,79,0.3); }
.grade-hard { background: rgba(255,173,76,0.15); color: #ffad4c; border: 1px solid rgba(255,173,76,0.35); }
.grade-hard:hover { background: rgba(255,173,76,0.27); }
.grade-good { background: rgba(23,103,253,0.15); color: #69c0ff; border: 1px solid rgba(23,103,253,0.35); }
.grade-good:hover { background: rgba(23,103,253,0.27); }
.grade-easy { background: rgba(82,196,26,0.15); color: #73d13d; border: 1px solid rgba(82,196,26,0.35); }
.grade-easy:hover { background: rgba(82,196,26,0.27); }
.grade-hint { text-align: center; font-size: 13px; color: #3a4a6a; padding: 10px; }
.lookup-spinner { font-size: 11px; margin-left: 6px; }
.lookup-ok { font-size: 11px; margin-left: 6px; color: #73d13d; font-weight: 600; }
.lookup-error { font-size: 11px; margin-left: 6px; color: #ff7875; }

/* Lookup defs */
.lookup-defs {
  background: rgba(23,103,253,0.06);
  border: 1px solid rgba(23,103,253,0.2);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lookup-def-group { display: flex; flex-direction: column; gap: 4px; }
.lookup-pos {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.8px; color: #9b7fff;
}
.lookup-ts { font-size: 11px; color: #6b7a9a; margin-left: 6px; }
.lookup-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.lookup-chip {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 13px;
  color: #c8d4f0;
  cursor: pointer;
  transition: all 0.15s;
}
.lookup-chip:hover { background: rgba(23,103,253,0.2); border-color: rgba(23,103,253,0.4); color: #fff; }
.lookup-chip.active { background: rgba(23,103,253,0.3); border-color: rgba(23,103,253,0.6); color: #fff; font-weight: 600; }

</style>
