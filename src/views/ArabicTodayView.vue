<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import "@/styles/mobile.css";
import "@/styles/arabic.css";
import ArSession from "@/components/arabic/ArSession.vue";
import ArScenery from "@/components/arabic/ArScenery.vue";
import { fetchArSettings } from "@/components/arabicApi.js";

// Экран сессии для телефона: /arabic/today. Отдельная раскладка, как у
// /japanese/today и /sport/today, — сюда заходят из метро по три раза в день, и
// всё лишнее вокруг мешает.

const route = useRoute();
const router = useRouter();

// Список разрешённых типов — защита от произвольной строки в адресе.
const SESSION_KINDS = ["mix", "review", "weak", "ahead", "exam", "arena"];

const kind = ref(SESSION_KINDS.includes(route.query.kind) ? route.query.kind : "mix");
// Правило показа огласовок приезжает из настроек: без него экран рисует их
// всегда, и зрелые слова снова выглядят как учебник для первого класса.
const settings = ref(null);

function leave() {
  if (window.history.length > 1) router.back();
  else router.push("/");
}

onMounted(async () => {
  try {
    settings.value = await fetchArSettings();
  } catch {
    settings.value = null;
  }
});
</script>

<template>
  <div class="at-screen ar">
    <!-- Пустыня остаётся и в сессии, но приглушённой: во время ответа задник
         не должен тянуть взгляд. -->
    <ArScenery dim />

    <ArSession
      :kind="kind"
      :vowels="settings?.vowels || 'early'"
      :show-translit="settings?.showTranslit !== false"
      @exit="leave"
    />
  </div>
</template>

<style scoped>
/* Экран занимает всё, что дала обёртка приложения: сессия сама разносит вопрос
   и ответы по вертикали, и делать это она может только в полной высоте.

   width: 100% обязателен — обёртка .app-body центрирует по содержимому, и без
   явной ширины кнопки ответа съезжают в колонку шириной в пол-телефона. */
.at-screen {
  display: flex;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  /* Внутри мини-аппа 100dvh считается по окну, а не по видимой части: верх
     карточки оказывается срезан. Настоящую высоту присылает Telegram. */
  height: var(--tg-viewport, 100dvh);
  position: relative;
  padding: 8px 12px 12px;
  box-sizing: border-box;
  background: #16131d;
}

/* Сессия лежит поверх задника. */
.at-screen > :not(.ars-scene) {
  position: relative;
  z-index: 1;
  width: 100%;
}
</style>
