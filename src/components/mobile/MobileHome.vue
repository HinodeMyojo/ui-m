<script setup>
import { ref, computed, defineAsyncComponent } from "vue";
import { useRouter } from "vue-router";
import "@/styles/mobile.css";

// Мобильная главная — не сжатая месячная сетка, а лента карточек.
//
// Сетка задач по дням держится на том, что на экране видно тридцать колонок
// разом; на 390px её можно только скроллить вбок, и смысла в ней ровно ноль.
// Поэтому на телефоне главная отвечает на другой вопрос — «что со мной прямо
// сейчас»: отставание по плану, дела на сегодня, отметки дисциплины, подходы,
// открытая книга. Сетка никуда не делась, ссылка на неё внизу.
//
// Карточки — асинхронные компоненты: каждая тянет свой кусок API сама, и
// медленный раздел не задерживает остальные. Заодно они не попадают в общий
// бандл десктопа.
const MobileRoadmapCard = defineAsyncComponent(() => import("./MobileRoadmapCard.vue"));
const MobileTodayCard = defineAsyncComponent(() => import("./MobileTodayCard.vue"));
const MobileDisciplineCard = defineAsyncComponent(() => import("./MobileDisciplineCard.vue"));
const MobileSportCard = defineAsyncComponent(() => import("./MobileSportCard.vue"));
const MobileJapaneseCard = defineAsyncComponent(() => import("./MobileJapaneseCard.vue"));
const MobileReadingCard = defineAsyncComponent(() => import("./MobileReadingCard.vue"));

const router = useRouter();

// Обновление — пересборка карточек по ключу. Каждая грузится сама, поэтому
// отдельного «обнови всё» не нужно: достаточно смонтировать их заново.
const refreshKey = ref(0);

const WEEKDAYS = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const now = new Date();
const dateLabel = computed(() => `${now.getDate()} ${MONTHS[now.getMonth()]}`);
const weekdayLabel = computed(() => WEEKDAYS[now.getDay()]);
</script>

<template>
  <div class="m-screen">
    <header class="m-head">
      <div style="flex: 1; min-width: 0">
        <h1 class="m-head-title">{{ dateLabel }}</h1>
        <div class="m-head-sub">{{ weekdayLabel }}</div>
      </div>
      <button class="mh-icon" aria-label="Обновить" @click="refreshKey++">↻</button>
      <button class="mh-icon" aria-label="Добавить в «Сегодня»" @click="router.push('/today')">
        ＋
      </button>
    </header>

    <div :key="refreshKey" class="m-feed">
      <MobileRoadmapCard />
      <MobileTodayCard />
      <MobileDisciplineCard />
      <MobileJapaneseCard />
      <MobileSportCard />
      <MobileReadingCard />

      <!-- Месячная сетка задач осталась десктопной, но остаётся доступной:
           на телефоне она открывается тем же экраном с горизонтальным
           скроллом, что и раньше. -->
      <button class="mh-grid-link" @click="router.push({ path: '/', query: { desktop: '1' } })">
        🗓 Месячная сетка задач
        <span class="m-chev">›</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mh-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 11px;
  background: #22242d;
  border: 1px solid #262933;
  color: #cfd3e0;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mh-icon:active {
  background: #2b2e39;
}

.mh-grid-link {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 14px;
  background: #1b1d25;
  border: 1px solid #262933;
  color: #9aa0b0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mh-grid-link .m-chev {
  margin-left: auto;
}
</style>
