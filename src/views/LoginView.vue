<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { login } from "../components/api";

const password = ref("");
const error = ref("");
const loading = ref(false);
const router = useRouter();
const showPassword = ref(false);

async function handleLogin() {
  try {
    loading.value = true;
    await login(password.value);
    error.value = "";
    router.push("/");
  } catch (err) {
    error.value = err;
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-bg">
    <form class="login-form" @submit.prevent="handleLogin">
      <h2>Вход</h2>

      <div class="input-eye-wrap">
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Пароль"
          autocomplete="current-password"
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
      <button type="submit" class="login-btn" :disabled="loading || !password">
        {{ loading ? "..." : "Войти" }}
      </button>
      <div v-if="error" class="login-error">{{ error }}</div>
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
  gap: 18px;
}
.login-form h2 {
  color: #fff;
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 8px;
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
  margin-bottom: 4px;
  outline: none;
  transition: border 0.2s;
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
  margin-top: 2px;
  min-height: 22px;
}
</style>
