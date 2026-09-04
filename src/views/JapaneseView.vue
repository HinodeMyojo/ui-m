<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/japanese.css";

import { fetchJpOverview, fetchJpDecks } from "@/components/japaneseApi.js";
import JpSession from "@/components/japanese/JpSession.vue";
import JpDecksTab from "@/components/japanese/JpDecksTab.vue";
import JpAnalyzeTab from "@/components/japanese/JpAnalyzeTab.vue";
import JpScanTab from "@/components/japanese/JpScanTab.vue";
import JpLevelsTab from "@/components/japanese/JpLevelsTab.vue";
import JpProgressTab from "@/components/japanese/JpProgressTab.vue";
import JpSettingsTab from "@/components/japanese/JpSettingsTab.vue";

// Раздел «Японский». Первый экран отвечает на вопрос «где я и что дальше», а
// не сразу бросает в сессию: заниматься начинают с виджета на главной или с
// кнопки здесь, а в раздел заходят посмотреть, как идут дела.
//
// Скан распознаёт прямо в браузере: облачный OCR требует ключа и денег, а на
// free-tier сервере распознаванию не на чем работать.

const router = useRouter();

// Цель из спеки: крепкий N3 — примерно столько кандзи и слов.
const N3_KANJI = 650;
const N3_WORDS = 3700;

const TABS = [
  { code: "study", title: "Учить" },
  { code: "decks", title: "Наборы" },
  { code: "analyze", title: "Разбор" },
  { code: "scan", title: "Скан" },
  { code: "progress", title: "Прогресс" },
  { code: "levels", title: "Уровни" },
  { code: "settings", title: "Настройки" },
];

const tab = ref(localStorage.getItem("japaneseTab") || "study");
// Тип запускаемой сессии: обычная смесь или арена на минуту.
const sessionKind = ref("mix");
// Знак, открытый из сетки дзёё, — разбор показывает по нему карточку.
const openedChar = ref("");
const overview = ref(null);
const decks = ref([]);
const error = ref("");
const inSession = ref(false);

function selectTab(code) {
  tab.value = code;
  localStorage.setItem("japaneseTab", code);
}

async function load() {
  error.value = "";
  try {
    const [o, d] = await Promise.all([fetchJpOverview(), fetchJpDecks()]);
    overview.value = o;
    decks.value = d || [];
  } catch (e) {
    error.value = e.message || "не удалось загрузить раздел";
  }
}

const minutes = computed(() => Math.round((overview.value?.sessionSec || 360) / 60));
const burning = computed(() => (overview.value?.dueNow || 0) + (overview.value?.newLeft || 0));
const enabled = computed(() => decks.value.filter((d) => d.enabled));

const kanjiPct = computed(() =>
  Math.min(100, Math.round(((overview.value?.kanjiLearned || 0) / N3_KANJI) * 100)),
);
const wordsPct = computed(() =>
  Math.min(100, Math.round(((overview.value?.wordsLearned || 0) / N3_WORDS) * 100)),
);

function deckPct(deck) {
  if (!deck.total) return 0;
  return Math.round((deck.learned / deck.total) * 100);
}

function start(kind) {
  sessionKind.value = kind;
  inSession.value = true;
}

function endSession() {
  inSession.value = false;
  load();
}

// Из сетки дзёё открывается карточка знака — она живёт в разборе.
function openKanji(char) {
  openedChar.value = char;
  selectTab("analyze");
}

// Распознанный со снимка текст уходит в разбор: скан только достаёт строку,
// разбирает её всегда одно и то же место.
const scannedText = ref("");

function analyzeScanned(text) {
  scannedText.value = text || "";
  selectTab("analyze");
}

onMounted(load);
</script>

<template>
  <div class="jp">
    <div class="jp-header">
      <h1>語 Японский</h1>
      <div class="jp-head-right">
        <span v-if="overview" class="jp-streak">🔥 {{ overview.streak }}</span>
        <button class="jp-btn" @click="router.push('/')">← Назад</button>
      </div>
    </div>

    <!-- Полоса разделов листается вбок: пять вкладок в 390px не помещаются, а
         перенос во вторую строку выглядит как сломанная вёрстка. -->
    <div class="jp-tabs">
      <button
        v-for="t in TABS"
        :key="t.code"
        class="jp-tab"
        :class="{ 'is-active': tab === t.code }"
        @click="selectTab(t.code)"
      >
        {{ t.title }}
      </button>
    </div>

    <div v-if="error" class="jp-error">{{ error }}</div>

    <template v-if="tab === 'study'">
      <!-- Сессия занимает вкладку целиком: во время неё на экране не должно
           быть ничего, кроме карточки. -->
      <section v-if="inSession" class="jp-card jpv-session">
        <JpSession :kind="sessionKind" @exit="endSession" />
      </section>

      <template v-else>
        <section class="jp-card">
          <div class="jpv-start">
            <div class="jpv-start-facts">
              <div class="jpv-start-big">
                <template v-if="burning">Горит {{ burning }}</template>
                <template v-else-if="overview?.studiedToday">День закрыт</template>
                <template v-else>Ничего не горит</template>
              </div>
              <div class="jp-muted">
                {{ overview?.dueNow ?? 0 }} к повторению · {{ overview?.newLeft ?? 0 }} новых
              </div>
            </div>
            <div class="jpv-start-actions">
              <button class="jp-btn is-primary jpv-go" @click="start('mix')">
                Заниматься {{ minutes }} мин
              </button>
              <!-- Норма — это план на день, а не запрет. Кто хочет заниматься
                   больше, не должен упираться в «на сегодня всё». -->
              <button class="jp-btn jpv-more" @click="start('ahead')">Сверх нормы</button>
            </div>
          </div>
        </section>

        <!-- Первое, что должно быть видно в разделе: куда я иду и далеко ли. -->
        <section class="jp-card">
          <h3>До крепкого N3</h3>
          <div class="jpv-goal-row">
            <span>Кандзи</span>
            <b>{{ overview?.kanjiLearned ?? 0 }} из {{ N3_KANJI }}</b>
            <span class="jp-muted">{{ kanjiPct }}%</span>
          </div>
          <div class="jp-bar"><span :style="{ width: kanjiPct + '%' }" /></div>
          <div class="jpv-goal-row">
            <span>Слова</span>
            <b>{{ overview?.wordsLearned ?? 0 }} из {{ N3_WORDS }}</b>
            <span class="jp-muted">{{ wordsPct }}%</span>
          </div>
          <div class="jp-bar"><span :style="{ width: wordsPct + '%' }" /></div>
          <p class="jp-muted" style="margin: 10px 0 0">
            «Закреплено» — это интервал повторения дорос до трёх недель. До этого единица
            считается начатой, а не выученной.
          </p>
        </section>

        <section class="jp-card">
          <h3>Что учится сейчас</h3>
          <div v-if="!enabled.length" class="jp-error">
            Ни один набор не включён — новых единиц не будет. Включи набор на вкладке «Наборы».
          </div>
          <div v-else class="jpv-decks">
            <div v-for="d in enabled" :key="d.id" class="jpv-deck">
              <div class="jpv-deck-head">
                <b>{{ d.name }}</b>
                <span class="jp-muted">
                  {{ d.learned }}/{{ d.total }} · {{ deckPct(d) }}% · {{ d.sharePct }}% потока
                </span>
              </div>
              <div class="jp-bar">
                <span :style="{ width: deckPct(d) + '%', background: d.color || '#6e4aff' }" />
              </div>
            </div>
          </div>
          <button class="jp-btn" style="margin-top: 10px" @click="selectTab('decks')">
            Настроить наборы
          </button>
        </section>

        <section class="jp-card">
          <div class="jpv-start">
            <div class="jpv-start-facts">
              <div class="jpv-arena-title">⚡ Арена</div>
              <div class="jp-muted">
                Минута на скорость по уже закреплённому. Интервалы не двигает и стрик не
                закрывает — только рекорд.
              </div>
            </div>
            <button
              class="jp-btn jpv-go"
              :disabled="!overview?.kanjiLearned && !overview?.wordsLearned"
              @click="start('arena')"
            >
              Минута
            </button>
          </div>
        </section>

        <section class="jp-card">
          <h3>Сегодня</h3>
          <div class="jp-stats">
            <div class="jp-stat">
              <div class="jp-stat-label">К повторению сейчас</div>
              <div class="jp-stat-value">{{ overview?.dueNow ?? 0 }}</div>
            </div>
            <div class="jp-stat">
              <div class="jp-stat-label">Всего за сегодня</div>
              <div class="jp-stat-value">{{ overview?.dueToday ?? 0 }}</div>
            </div>
            <div class="jp-stat">
              <div class="jp-stat-label">Новых даст система</div>
              <div class="jp-stat-value">{{ overview?.newToday ?? 0 }}</div>
            </div>
            <div class="jp-stat">
              <div class="jp-stat-label">Из них осталось</div>
              <div class="jp-stat-value">{{ overview?.newLeft ?? 0 }}</div>
            </div>
            <div class="jp-stat">
              <div class="jp-stat-label">Посыплется завтра</div>
              <div class="jp-stat-value">{{ overview?.atRiskTomorrow ?? 0 }}</div>
            </div>
          </div>
        </section>
      </template>
    </template>

    <JpDecksTab v-else-if="tab === 'decks'" />
    <JpAnalyzeTab
      v-else-if="tab === 'analyze'"
      :initial-char="openedChar"
      :initial-text="scannedText"
    />
    <JpScanTab v-else-if="tab === 'scan'" @analyze="analyzeScanned" />
    <JpProgressTab v-else-if="tab === 'progress'" @open="openKanji" />
    <JpLevelsTab v-else-if="tab === 'levels'" />
    <JpSettingsTab v-else-if="tab === 'settings'" />
  </div>
</template>

<style scoped>
.jp-head-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.jp-streak {
  font-size: 15px;
  font-weight: 700;
}

.jpv-start {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.jpv-start-facts {
  flex: 1;
  min-width: 180px;
}

.jpv-arena-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 4px;
}

.jpv-start-big {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
}

.jpv-start-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}

.jpv-more {
  font-size: 13px;
}

.jpv-go {
  min-height: 52px;
  padding: 0 26px;
  font-size: 16px;
  flex: 1;
  min-width: 180px;
  justify-content: center;
}

.jpv-goal-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
  margin: 8px 0 5px;
}

.jpv-goal-row b {
  margin-left: auto;
}

.jpv-decks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jpv-deck-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 5px;
  font-size: 13px;
}

.jpv-deck-head .jp-muted {
  margin-left: auto;
}

/* Сессия — мобильная раскладка по существу; на широком экране её держит
   собственный max-width, здесь только высота, чтобы вопрос и ответы
   разъехались по вертикали, а не слиплись посередине. */
.jpv-session {
  display: flex;
  min-height: 70vh;
}
</style>
