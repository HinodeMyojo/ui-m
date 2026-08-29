<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import "@/styles/mobile.css";
import JpSession from "@/components/japanese/JpSession.vue";

// Экран сессии для телефона: /japanese/today. Отдельная раскладка, как у
// /sport/today и /roadmap/today, — на этот экран заходят из метро по три раза
// в день, и всё лишнее вокруг него мешает.
//
// Тип сессии берётся из строки запроса: виджет на главной ведёт сюда с
// ?kind=review, когда новых на сегодня уже нет.

const route = useRoute();
const router = useRouter();

const kind = ref(["mix", "review", "weak"].includes(route.query.kind) ? route.query.kind : "mix");

function leave() {
  // Возврат — туда, откуда пришли, но не в саму же сессию.
  if (window.history.length > 1) router.back();
  else router.push("/");
}
</script>

<template>
  <div class="jt-screen">
    <JpSession :kind="kind" @exit="leave" />
  </div>
</template>

<style scoped>
/* Экран занимает всё, что дала обёртка приложения: сессия сама разносит
   вопрос и ответы по вертикали, и делать это она может только в полной
   высоте. */
.jt-screen {
  display: flex;
  min-height: 100%;
  padding: 8px 12px 12px;
  box-sizing: border-box;
  background: var(--m-bg, #14151b);
}
</style>
