<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/japanese.css";

import { fetchJpOverview } from "@/components/japaneseApi.js";
import JpSession from "@/components/japanese/JpSession.vue";
import JpDecksTab from "@/components/japanese/JpDecksTab.vue";
import JpDictionaryTab from "@/components/japanese/JpDictionaryTab.vue";
import JpProgressTab from "@/components/japanese/JpProgressTab.vue";
import JpSettingsTab from "@/components/japanese/JpSettingsTab.vue";

// Раздел «Японский». Вкладка «Скан» появится на втором этапе — пустой заглушки
// в меню не держим.
//
// Занятие идёт тем же компонентом, что и на телефоне: раскладка сессии
// мобильная по существу (вопрос сверху, ответы снизу), и вторая её версия
// означала бы две реализации механик и расхождение между ними.

const router = useRouter();

const TABS = [
  { code: "study", title: "Учить" },
  { code: "decks", title: "Наборы" },
  { code: "dict", title: "Словарь" },
  { code: "progress", title: "Прогресс" },
  { code: "settings", title: "Настройки" },
];

const tab = ref(localStorage.getItem("japaneseTab") || "study");
const overview = ref(null);
const error = ref("");
const inSession = ref(false);

function selectTab(code) {
  tab.value = code;
  localStorage.setItem("japaneseTab", code);
}

async function loadOverview() {
  error.value = "";
  try {
    overview.value = await fetchJpOverview();
  } catch (e) {
    error.value = e.message || "не удалось загрузить сводку";
  }
}

const minutes = computed(() => Math.round((overview.value?.sessionSec || 360) / 60));
const burning = computed(() => (overview.value?.dueNow || 0) + (overview.value?.newLeft || 0));

function endSession() {
  inSession.value = false;
  loadOverview();
}

onMounted(loadOverview);
</script>

<template>
  <div class="jp">
    <div class="jp-header">
      <h1>語 Японский</h1>
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
      <div class="jp-row">
        <button class="jp-btn" @click="router.push('/japanese/today')">📱 Экран сессии</button>
        <button class="jp-btn" @click="router.push('/')">← Назад</button>
      </div>
    </div>

    <div v-if="error" class="jp-error">{{ error }}</div>

    <template v-if="tab === 'study'">
      <!-- Сессия занимает вкладку целиком: во время неё на экране не должно
           быть ничего, кроме карточки. -->
      <section v-if="inSession" class="jp-card jpv-session">
        <JpSession @exit="endSession" />
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
                {{ overview?.dueNow ?? 0 }} к повторению · {{ overview?.newLeft ?? 0 }} новых ·
                🔥 {{ overview?.streak ?? 0 }}
              </div>
            </div>
            <button class="jp-btn is-primary jpv-go" @click="inSession = true">
              Заниматься {{ minutes }} мин
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
              <div class="jp-stat-label">Долг</div>
              <div class="jp-stat-value">{{ overview?.debt ?? 0 }}</div>
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
    <JpDictionaryTab v-else-if="tab === 'dict'" />
    <JpProgressTab v-else-if="tab === 'progress'" />
    <JpSettingsTab v-else-if="tab === 'settings'" />
  </div>
</template>

<style scoped>
.jpv-start {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.jpv-start-facts {
  flex: 1;
  min-width: 200px;
}

.jpv-start-big {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
}

.jpv-go {
  min-height: 52px;
  padding: 0 26px;
  font-size: 16px;
}

/* Сессия — мобильная раскладка по существу; на широком экране её держит
   собственный max-width, здесь только высота, чтобы вопрос и ответы
   разъехались по вертикали, а не слиплись посередине. */
.jpv-session {
  display: flex;
  min-height: 70vh;
}
</style>
