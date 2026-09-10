<script setup>
import { BOT_LINK } from "./telegram";

// Экран для случая «открыли ссылку в обычном браузере».
//
// Редирект на веб-версию здесь был бы хуже: человек попадёт на форму входа и
// решит, что мини-апп сломан. Честнее сказать, где приложение живёт.
</script>

<template>
  <div class="tgo">
    <div class="tgo-card">
      <div class="tgo-glyph">語</div>
      <h1 class="tgo-title">Откройте в Telegram</h1>
      <p class="tgo-note">
        Это мини-приложение Telegram: снаружи ему неоткуда узнать, кто вы.
      </p>
      <a class="tgo-link" :href="BOT_LINK">Открыть в Telegram</a>
      <a class="tgo-alt" href="/japanese">Или обычная веб-версия</a>
    </div>
  </div>
</template>

<style scoped>
.tgo {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.tgo-card {
  max-width: 320px;
  text-align: center;
}

.tgo-glyph {
  font-size: 56px;
  line-height: 1;
  margin-bottom: 12px;
}

.tgo-title {
  margin: 0 0 8px;
  font-size: 19px;
  font-weight: 600;
}

.tgo-note {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.45;
  color: #9a9aa8;
}

.tgo-link {
  display: block;
  padding: 13px;
  border-radius: 10px;
  background: #4a7cff;
  color: #fff;
  font-size: 16px;
  text-decoration: none;
}

.tgo-alt {
  display: inline-block;
  margin-top: 14px;
  color: #7d8496;
  font-size: 13px;
}
</style>
