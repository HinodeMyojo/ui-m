<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { isMobile } from "@/composables/useIsMobile.js";
import "@/styles/arabic.css";

import { fetchArOverview, fetchArStudies, fetchArSettings } from "@/components/arabicApi.js";
import ArSession from "@/components/arabic/ArSession.vue";
import ArDecksTab from "@/components/arabic/ArDecksTab.vue";
import ArAnalyzeTab from "@/components/arabic/ArAnalyzeTab.vue";
import ArProgressTab from "@/components/arabic/ArProgressTab.vue";
import ArSettingsTab from "@/components/arabic/ArSettingsTab.vue";

// Раздел «Арабский». Первый экран отвечает на вопрос «где я и что дальше», а
// не бросает сразу в сессию: заниматься начинают с виджета на главной или с
// кнопки здесь, а в раздел заходят посмотреть, как идут дела.
//
// Это тот самый урок японского модуля, за который он заплатил неделей
// недовольства: пункт меню вёл прямо в сессию, и раздел казался пустым.

const TABS = [
  { code: "study", title: "Учить" },
  { code: "decks", title: "Наборы" },
  { code: "analyze", title: "Разбор" },
  { code: "progress", title: "Прогресс" },
  { code: "settings", title: "Настройки" },
];

// Цель первого года из спеки: две тысячи частотных слов — это порядка 80%
// бытового текста.
const GOAL_WORDS = 2000;

const router = useRouter();

const tab = ref(localStorage.getItem("arabicTab") || "study");
const overview = ref(null);
const studies = ref([]);
const settings = ref(null);
const studyId = ref(localStorage.getItem("arabicStudy") || "");
const error = ref("");
const inSession = ref(false);
const sessionKind = ref("mix");

function selectTab(code) {
  tab.value = code;
  localStorage.setItem("arabicTab", code);
}

async function load() {
  error.value = "";
  try {
    const [o, st, s] = await Promise.all([fetchArOverview(), fetchArStudies(), fetchArSettings()]);
    overview.value = o;
    studies.value = st || [];
    settings.value = s;
    if (!studies.value.some((x) => x.id === studyId.value)) {
      studyId.value = (studies.value.find((x) => x.enabled) || studies.value[0])?.id || "";
    }
  } catch (e) {
    error.value = e.message || "не удалось загрузить раздел";
  }
}

const study = computed(() => studies.value.find((s) => s.id === studyId.value) || null);
const minutes = computed(() =>
  Math.round((study.value?.sessionSec || overview.value?.sessionSec || 420) / 60),
);
const burning = computed(() => (overview.value?.dueNow || 0) + (overview.value?.newLeft || 0));

const lettersPct = computed(() => {
  const o = overview.value;
  if (!o?.lettersTotal) return 0;
  return Math.round((o.lettersLearned / o.lettersTotal) * 100);
});
const wordsPct = computed(() =>
  Math.min(100, Math.round(((overview.value?.wordsLearned || 0) / GOAL_WORDS) * 100)),
);

// На телефоне сессия живёт на своём экране, а не внутри раздела: там она
// занимает всю высоту, и кнопки ответа не уезжают под нижнее меню. Это то же
// правило, по которому мобильный слой в проекте — отдельная раскладка, а не
// адаптив.
function start(kind) {
  if (isMobile.value) {
    router.push({ path: "/arabic/today", query: kind === "mix" ? {} : { kind } });
    return;
  }
  sessionKind.value = kind;
  inSession.value = true;
}

function endSession() {
  inSession.value = false;
  load();
}

function selectStudy(id) {
  studyId.value = id;
  localStorage.setItem("arabicStudy", id);
}

onMounted(load);
</script>

<template>
  <div class="ar">
    <template v-if="inSession">
      <div class="ar-session-wrap">
        <ArSession
          :kind="sessionKind"
          :study-id="studyId"
          :vowels="settings?.vowels || 'early'"
          :show-translit="settings?.showTranslit !== false"
          @exit="endSession"
        />
      </div>
    </template>

    <template v-else>
      <header class="ar-header">
        <h1>ع Арабский</h1>
        <div class="ar-row">
          <span v-if="overview?.streak" class="ar-chip ar-chip-gold">🔥 {{ overview.streak }}</span>
          <span v-if="overview?.level" class="ar-chip">ур. {{ overview.level }}</span>
        </div>
      </header>

      <nav class="ar-tabs">
        <button
          v-for="t in TABS"
          :key="t.code"
          class="ar-tab"
          :class="{ 'is-on': tab === t.code }"
          @click="selectTab(t.code)"
        >
          {{ t.title }}
        </button>
      </nav>

      <p v-if="error" class="ar-err">{{ error }}</p>

      <template v-if="tab === 'study'">
        <section v-if="overview" class="ar-card">
          <h3 class="ar-card-title">
            {{ burning ? `Горит ${burning}` : overview.studiedToday ? "День закрыт" : "Ничего не горит" }}
          </h3>
          <div class="ar-row ar-nums">
            <div><b>{{ overview.dueNow }}</b><span>к повторению</span></div>
            <div><b>{{ overview.newLeft }}</b><span>новых сегодня</span></div>
            <div><b>{{ overview.wordsLearned }}</b><span>слов закреплено</span></div>
          </div>
          <p v-if="overview.atRiskTomorrow" class="ar-muted">
            Без занятия завтра посыплется {{ overview.atRiskTomorrow }} карточек
          </p>

          <div class="ar-row">
            <button class="ar-btn ar-btn-accent" @click="start('mix')">
              Заниматься {{ minutes }} мин
            </button>
            <button class="ar-btn" @click="start('review')">Только повторение</button>
            <button class="ar-btn" @click="start('weak')">Слабые места</button>
            <button v-if="study?.examDue" class="ar-btn ar-btn-gold" @click="start('exam')">
              Мини-экзамен
            </button>
          </div>
        </section>

        <section v-if="overview" class="ar-card">
          <h3 class="ar-card-title">Дорога</h3>
          <div class="ar-progress-line">
            <span>Алфавит</span>
            <div class="ar-bar"><span :style="{ width: lettersPct + '%' }"></span></div>
            <small>{{ overview.lettersLearned }} / {{ overview.lettersTotal }}</small>
          </div>
          <div class="ar-progress-line">
            <span>Слова</span>
            <div class="ar-bar">
              <span :style="{ width: wordsPct + '%', background: 'var(--ar-gold)' }"></span>
            </div>
            <small>{{ overview.wordsLearned }} / {{ GOAL_WORDS }}</small>
          </div>
          <p class="ar-muted">
            Две тысячи частотных слов покрывают около 80% бытового текста. Слово не выдаётся, пока
            не закрепились его буквы, — поэтому алфавит идёт первым.
          </p>
        </section>

        <section v-if="studies.length" class="ar-card">
          <h3 class="ar-card-title">Учёбы</h3>
          <div class="ar-row">
            <button
              v-for="s in studies"
              :key="s.id"
              class="ar-btn ar-btn-sm"
              :class="{ 'ar-btn-accent': s.id === studyId }"
              @click="selectStudy(s.id)"
            >
              {{ s.emoji }} {{ s.name }}
              <small v-if="s.dueNow"> · {{ s.dueNow }}</small>
            </button>
          </div>
          <p v-if="study" class="ar-muted">
            {{ study.name }}: {{ study.dueNow }} к повторению, {{ study.newLeft }} новых на сегодня,
            закреплено {{ study.learned }} из {{ study.total }}.
            <template v-if="study.examEvery">
              {{ study.examDue ? "Экзамен ждёт." : `До экзамена ${study.toExam}.` }}
            </template>
          </p>
        </section>
      </template>

      <ArDecksTab v-else-if="tab === 'decks'" @changed="load" />
      <ArAnalyzeTab v-else-if="tab === 'analyze'" />
      <ArProgressTab v-else-if="tab === 'progress'" />
      <ArSettingsTab v-else-if="tab === 'settings'" @changed="load" />
    </template>
  </div>
</template>

<style scoped>
/* Сессия занимает весь экран раздела: вопрос сверху, ответы снизу — раскладке
   нужна полная высота, иначе кнопки уезжают под сгиб. */
.ar-session-wrap {
  display: flex;
  width: 100%;
  /* Высота нужна, чтобы вопрос и ответы разъехались по вертикали, а не
     слиплись посередине. Меньше высоты экрана: сверху шапка раздела, снизу
     его отступ, и сессия должна помещаться между ними целиком. */
  min-height: 72vh;
  height: calc(100dvh - 150px);
}

.ar-nums {
  justify-content: space-between;
}

.ar-nums div {
  display: flex;
  flex-direction: column;
}

.ar-nums b {
  font-size: 22px;
}

.ar-nums span {
  font-size: 12px;
  color: var(--ar-muted);
}

.ar-progress-line {
  display: grid;
  grid-template-columns: 70px 1fr auto;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.ar-progress-line small {
  color: var(--ar-muted);
}
</style>
