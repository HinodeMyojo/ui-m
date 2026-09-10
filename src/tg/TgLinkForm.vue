<script setup>
import { ref } from "vue";
import { link } from "./tgAuth";

// Разовая привязка. Единственный экран мини-аппа, который спрашивает пароль,
// и человек видит его один раз в жизни аккаунта — дальше вход идёт по подписи
// Telegram.
//
// Объяснение «зачем это» стоит прямо на экране: форма пароля, выскочившая
// внутри Telegram, выглядит ровно как то, чем пугают в статьях про фишинг.

const props = defineProps({
  telegramName: { type: String, default: "" },
});
const emit = defineEmits(["linked"]);

const login = ref("");
const password = ref("");
const busy = ref(false);
const error = ref("");

async function submit() {
  if (busy.value) return;
  error.value = "";

  if (!login.value.trim() || !password.value) {
    error.value = "Заполните логин и пароль";
    return;
  }

  busy.value = true;
  const result = await link(login.value, password.value);
  busy.value = false;

  if (result.state === "ok") {
    // Пароль не задерживается в памяти дольше, чем нужно: экран остаётся в
    // истории компонентов, пока приложение открыто.
    password.value = "";
    emit("linked");
    return;
  }
  error.value = result.message;
}
</script>

<template>
  <div class="tgl">
    <div class="tgl-card">
      <div class="tgl-glyph">語</div>

      <h1 class="tgl-title">
        <template v-if="props.telegramName">{{ props.telegramName }}, войдите один раз</template>
        <template v-else>Войдите один раз</template>
      </h1>

      <p class="tgl-note">
        Это нужно, чтобы связать ваш Telegram с учётной записью. Дальше
        приложение будет открываться сразу — пароль больше не спросят.
      </p>

      <form class="tgl-form" @submit.prevent="submit">
        <input
          v-model="login"
          class="tgl-input"
          type="text"
          inputmode="latin"
          autocomplete="username"
          autocapitalize="none"
          autocorrect="off"
          placeholder="Логин"
        />
        <input
          v-model="password"
          class="tgl-input"
          type="password"
          autocomplete="current-password"
          placeholder="Пароль"
        />

        <p v-if="error" class="tgl-error">{{ error }}</p>

        <button class="tgl-submit" type="submit" :disabled="busy">
          {{ busy ? "Проверяем…" : "Связать" }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.tgl {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.tgl-card {
  width: 100%;
  max-width: 340px;
  text-align: center;
}

.tgl-glyph {
  font-size: 56px;
  line-height: 1;
  margin-bottom: 12px;
}

.tgl-title {
  margin: 0 0 8px;
  font-size: 19px;
  font-weight: 600;
}

.tgl-note {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.45;
  color: #9a9aa8;
}

.tgl-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 16px обязателен: при меньшем размере Safari на iOS зумит страницу на фокусе
   поля, и мини-апп остаётся увеличенным до перезапуска. */
.tgl-input {
  padding: 12px 14px;
  border: 1px solid #33353f;
  border-radius: 10px;
  background: #1c1e26;
  color: #e8e8ef;
  font-size: 16px;
}

.tgl-input:focus {
  outline: none;
  border-color: #4a7cff;
}

.tgl-error {
  margin: 0;
  color: #ff8a8a;
  font-size: 13px;
}

.tgl-submit {
  margin-top: 4px;
  padding: 13px;
  border: 0;
  border-radius: 10px;
  background: #4a7cff;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
}

.tgl-submit:disabled {
  opacity: 0.6;
}
</style>
