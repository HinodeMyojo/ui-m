<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  forgotPassword,
  login,
  register,
  resetPassword,
} from "../components/api";

// Одна страница на три состояния — вход, регистрация и восстановление.
// Разводить их по маршрутам не за чем: человек ходит между ними подряд, и
// перезагрузка страницы посреди этого только сбивает.
const mode = ref("login"); // login | register | reset

const userLogin = ref("");
const password = ref("");
const displayName = ref("");
const code = ref("");
const codeSent = ref(false);

const error = ref("");
const notice = ref("");
const loading = ref(false);
const showPassword = ref(false);

const router = useRouter();

const title = computed(
  () =>
    ({
      login: "Вход",
      register: "Регистрация",
      reset: "Восстановление пароля",
    })[mode.value],
);

const submitLabel = computed(
  () =>
    ({
      login: "Войти",
      register: "Зарегистрироваться",
      reset: codeSent.value ? "Сменить пароль" : "Выслать код",
    })[mode.value],
);

// Кнопка гаснет, пока не заполнено то, без чего запрос заведомо не пройдёт.
const canSubmit = computed(() => {
  if (loading.value) return false;
  if (mode.value === "reset") {
    return codeSent.value
      ? userLogin.value && code.value && password.value
      : Boolean(userLogin.value);
  }
  return Boolean(userLogin.value && password.value);
});

function switchTo(next) {
  mode.value = next;
  error.value = "";
  notice.value = "";
  codeSent.value = false;
  code.value = "";
  password.value = "";
}

async function submit() {
  error.value = "";
  notice.value = "";
  loading.value = true;
  try {
    if (mode.value === "login") {
      await login(userLogin.value.trim(), password.value);
      router.push("/");
    } else if (mode.value === "register") {
      await register(
        userLogin.value.trim(),
        password.value,
        displayName.value.trim(),
      );
      router.push("/");
    } else if (!codeSent.value) {
      await forgotPassword(userLogin.value.trim());
      codeSent.value = true;
      // Формулировка нарочно уклончивая: подтвердить, что такой логин есть,
      // значит дать способ перебирать чужие учётки.
      notice.value =
        "Если к этому логину привязана подтверждённая почта, код уже там.";
    } else {
      await resetPassword(userLogin.value.trim(), code.value.trim(), password.value);
      notice.value = "Пароль изменён. Теперь войдите с новым.";
      mode.value = "login";
      codeSent.value = false;
      code.value = "";
      password.value = "";
    }
  } catch (err) {
    error.value = typeof err === "string" ? err : err?.message || "Ошибка";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-bg">
    <form class="login-form" @submit.prevent="submit">
      <h2>{{ title }}</h2>

      <input
        v-model="userLogin"
        type="text"
        placeholder="Логин"
        autocomplete="username"
        :disabled="loading"
        class="login-input"
      />

      <input
        v-if="mode === 'register'"
        v-model="displayName"
        type="text"
        placeholder="Как вас звать (необязательно)"
        autocomplete="nickname"
        :disabled="loading"
        class="login-input"
      />

      <input
        v-if="mode === 'reset' && codeSent"
        v-model="code"
        type="text"
        inputmode="numeric"
        placeholder="Код из письма"
        autocomplete="one-time-code"
        :disabled="loading"
        class="login-input"
      />

      <div v-if="mode !== 'reset' || codeSent" class="input-eye-wrap">
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          :placeholder="mode === 'login' ? 'Пароль' : 'Новый пароль'"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          :disabled="loading"
          class="login-input"
        />
        <button
          type="button"
          class="eye-btn"
          @click="showPassword = !showPassword"
          tabindex="-1"
        >
          <svg
            v-if="showPassword"
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
          >
            <path
              d="M1 11C2.73 6.61 6.64 3.5 11 3.5C15.36 3.5 19.27 6.61 21 11C19.27 15.39 15.36 18.5 11 18.5C6.64 18.5 2.73 15.39 1 11Z"
              stroke="#7e8a99"
              stroke-width="2"
            />
            <circle cx="11" cy="11" r="3.5" stroke="#7e8a99" stroke-width="2" />
          </svg>
          <svg v-else width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M1 11C2.73 6.61 6.64 3.5 11 3.5C15.36 3.5 19.27 6.61 21 11C19.27 15.39 15.36 18.5 11 18.5C6.64 18.5 2.73 15.39 1 11Z"
              stroke="#7e8a99"
              stroke-width="2"
            />
            <path d="M4 4L18 18" stroke="#7e8a99" stroke-width="2" />
          </svg>
        </button>
      </div>

      <p v-if="mode === 'register'" class="login-hint">
        Пароль — от восьми символов. Почту можно привязать позже, в профиле:
        без неё пароль сбрасывает администратор.
      </p>

      <button type="submit" class="login-btn" :disabled="!canSubmit">
        {{ loading ? "..." : submitLabel }}
      </button>

      <div v-if="error" class="login-error">{{ error }}</div>
      <div v-if="notice" class="login-notice">{{ notice }}</div>

      <div class="login-links">
        <button v-if="mode !== 'login'" type="button" @click="switchTo('login')">
          Войти
        </button>
        <button
          v-if="mode !== 'register'"
          type="button"
          @click="switchTo('register')"
        >
          Регистрация
        </button>
        <button v-if="mode !== 'reset'" type="button" @click="switchTo('reset')">
          Забыли пароль?
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.login-bg {
  min-height: 100vh;
  background: #18191f;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-form {
  background: #23232b;
  border-radius: 18px;
  box-shadow: 0 4px 32px 0 #0008;
  padding: 38px 32px 32px 32px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.login-form h2 {
  color: #fff;
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 4px;
  letter-spacing: 0.04em;
}
.input-eye-wrap {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
}
.login-input {
  width: 100%;
  padding: 10px 38px 10px 14px;
  border-radius: 8px;
  border: 1px solid #2e2660;
  background: #18191f;
  color: #fff;
  font-size: 1.08rem;
  outline: none;
  transition: border 0.2s;
  box-sizing: border-box;
}
.login-input:focus {
  border: 1.5px solid #6e4aff;
}
.eye-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  outline: none;
  display: flex;
  align-items: center;
  opacity: 0.7;
  transition: opacity 0.18s;
}
.eye-btn:hover {
  opacity: 1;
}
.login-hint {
  color: #8b90a0;
  font-size: 0.86rem;
  line-height: 1.4;
  margin: 0;
  text-align: left;
  width: 100%;
}
.login-btn {
  width: 100%;
  padding: 10px 0;
  border-radius: 8px;
  border: none;
  background: linear-gradient(90deg, #2e2660 60%, #18191f 100%);
  color: #fff;
  font-size: 1.08rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
  transition: background 0.18s;
}
.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.login-error {
  color: #ff7875;
  font-size: 1rem;
  min-height: 22px;
  text-align: center;
}
.login-notice {
  color: #7ee0a5;
  font-size: 0.95rem;
  text-align: center;
  line-height: 1.4;
}
.login-links {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  margin-top: 2px;
}
.login-links button {
  background: none;
  border: none;
  color: #8f7dff;
  font-size: 0.92rem;
  cursor: pointer;
  padding: 0;
}
.login-links button:hover {
  color: #b3a6ff;
  text-decoration: underline;
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 768px) {
  .login-form {
    min-width: auto;
    width: 90vw;
    max-width: 380px;
    padding: 28px 20px 24px 20px;
  }

  .login-input {
    font-size: 16px; /* prevents iOS zoom */
    padding: 12px 38px 12px 14px;
  }

  .login-btn {
    padding: 12px 0;
    font-size: 1.05rem;
  }
}
</style>
