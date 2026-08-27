<script setup>
import { computed, defineAsyncComponent } from "vue";
import { useRoute } from "vue-router";
import { isMobile } from "@/composables/useIsMobile.js";

// Главная у телефона и у десктопа — разные экраны, а не один в двух ширинах.
// Месячная сетка задач читается только целиком, поэтому на 390px вместо неё
// идёт лента карточек: см. components/mobile/MobileHome.vue.
//
// Обе половины подгружаются отдельно: с телефона нет смысла качать сетку со
// всеми её модалками и конфетти, с десктопа — мобильный слой.
const Main = defineAsyncComponent(() => import("../components/Main.vue"));
const MobileHome = defineAsyncComponent(() => import("@/components/mobile/MobileHome.vue"));

const route = useRoute();

// ?desktop=1 — выход в месячную сетку с телефона: раскладка десктопная, со
// скроллом вбок, но ничего не потеряно.
const showMobile = computed(() => isMobile.value && route.query.desktop !== "1");
</script>

<template>
  <MobileHome v-if="showMobile" />
  <main v-else>
    <Main />
  </main>
</template>

<style scoped>
main {
  width: 80%;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Сетку открыли с телефона по ?desktop=1 — 80% ширины здесь только съедают
   и без того узкий экран. */
@media (max-width: 768px) {
  main {
    width: 100%;
    align-items: flex-start;
  }
}
</style>
