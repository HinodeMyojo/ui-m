<script setup>
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { authorize } from "./tgAuth";
import { isMiniApp, setBackButton, setClosingConfirmation, startParam, supports } from "./telegram";
import { routeForStartParam } from "./router";
import TgLinkForm from "./TgLinkForm.vue";
import TgOutside from "./TgOutside.vue";

// Оболочка мини-аппа. Своя работа у неё одна: довести человека до учёбы,
// ничего не спросив. Всё остальное — уже существующие экраны японского
// раздела, они здесь не переписаны, а переиспользованы.

const route = useRoute();
const router = useRouter();

// loading — идёт вход; link — Telegram ещё не привязан; ready — внутри;
// error — не дошли до сервера; outside — открыли не из Telegram.
const state = ref(isMiniApp ? "loading" : "outside");
const message = ref("");
const telegramName = ref("");

// Клиенты старше 7.7 не умеют выключать закрытие по свайпу: обводка знака
// пальцем там будет закрывать приложение. Предупредить честнее, чем делать
// вид, что всё в порядке.
const tooOld = ref(isMiniApp && !supports("7.7"));

async function enter() {
  state.value = "loading";
  const result = await authorize();

  if (result.state === "ok") {
    state.value = "ready";
    openStartRoute();
    return;
  }
  if (result.state === "link") {
    telegramName.value = result.telegramName;
    state.value = "link";
    return;
  }
  message.value = result.message;
  state.value = "error";
}

// Ссылка из уведомления бота ведёт сразу в сессию. Переход делается только
// один раз, при входе: дальше человек ходит сам, и утаскивать его обратно на
// стартовый экран нельзя.
function openStartRoute() {
  const target = routeForStartParam(startParam());
  if (target) router.replace(target);
}

function onLinked() {
  state.value = "ready";
  openStartRoute();
}

// Системная стрелка в шапке Telegram вместо кнопки внутри страницы: своя
// «назад» в мини-аппе выглядит лишней рядом с настоящей.
watch(
  () => [route.path, state.value],
  () => {
    const deep = state.value === "ready" && route.path !== "/";
    setBackButton(deep ? () => router.push("/") : null);
    // Подтверждение выхода нужно только там, где есть что терять: посреди
    // сессии случайный свайп стирает набранный штурм.
    setClosingConfirmation(deep);
  },
  { immediate: true }
);

onMounted(() => {
  if (isMiniApp) enter();
});
</script>

<template>
  <div class="tg-shell">
    <TgOutside v-if="state === 'outside'" />

    <div v-else-if="state === 'loading'" class="tg-center">
      <!-- Не крутилка, а скелет карточки: она занимает то же место, что и
           будущий вопрос, и экран не прыгает, когда приезжают данные. -->
      <div class="tg-skeleton">
        <div class="tg-skeleton-glyph">語</div>
        <div class="tg-skeleton-line"></div>
        <div class="tg-skeleton-row">
          <span></span><span></span>
        </div>
      </div>
    </div>

    <TgLinkForm v-else-if="state === 'link'" :telegram-name="telegramName" @linked="onLinked" />

    <div v-else-if="state === 'error'" class="tg-center">
      <div class="tg-error">
        <p class="tg-error-title">Не удалось войти</p>
        <p class="tg-error-text">{{ message }}</p>
        <button class="tg-btn" @click="enter">Ещё раз</button>
      </div>
    </div>

    <template v-else>
      <p v-if="tooOld" class="tg-warn">
        Старая версия Telegram: обводка знака может закрывать приложение.
        Обновите клиент.
      </p>
      <RouterView />
    </template>
  </div>
</template>

<style>
/* Не scoped: переменные и фон нужны всему, что рисуется внутри, включая
   переиспользованные экраны раздела. */
:root {
  --tg-safe-top: 0px;
  --tg-safe-bottom: 0px;
}

html,
body {
  margin: 0;
  background: #14151b;
  color: #e8e8ef;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  /* Горизонтальную прокрутку в мини-аппе видно как дрожание всей страницы при
     любом косом свайпе. */
  overflow-x: hidden;
}

.tg-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
  /* Высоту даёт Telegram: 100dvh здесь считается по окну, а не по видимой
     части, и низ карточки уезжает под клавиатуру ввода каны. */
  min-height: var(--tg-viewport, 100dvh);
  padding-top: var(--tg-safe-top);
  padding-bottom: var(--tg-safe-bottom);
  box-sizing: border-box;
}
</style>

<style scoped>
.tg-center {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.tg-skeleton {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  opacity: 0.5;
}

.tg-skeleton-glyph {
  font-size: 64px;
  line-height: 1;
}

.tg-skeleton-line {
  width: 140px;
  height: 12px;
  border-radius: 6px;
  background: #2a2c36;
}

.tg-skeleton-row {
  display: flex;
  gap: 10px;
}

.tg-skeleton-row span {
  width: 90px;
  height: 34px;
  border-radius: 10px;
  background: #2a2c36;
}

.tg-error {
  max-width: 320px;
  text-align: center;
}

.tg-error-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
}

.tg-error-text {
  margin: 0 0 16px;
  font-size: 14px;
  color: #9a9aa8;
  overflow-wrap: anywhere;
}

.tg-btn {
  padding: 10px 20px;
  border: 0;
  border-radius: 10px;
  background: #4a7cff;
  color: #fff;
  font-size: 15px;
}

.tg-warn {
  margin: 0;
  padding: 8px 12px;
  background: #4a3a12;
  color: #ffd67e;
  font-size: 13px;
  text-align: center;
}
</style>
