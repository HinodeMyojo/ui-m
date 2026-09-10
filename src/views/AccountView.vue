<script setup>
import { computed, onMounted, ref } from "vue";
import {
  changePassword,
  confirmEmail,
  fetchMe,
  fetchUsers,
  logout,
  setEmail,
  updateUser,
} from "../components/api";
import { saveSession } from "../components/session";

const me = ref(null);
const loading = ref(true);
const error = ref("");

// Свой профиль
const oldPassword = ref("");
const newPassword = ref("");
const passwordNotice = ref("");
const passwordError = ref("");

const email = ref("");
const emailCode = ref("");
const emailNotice = ref("");
const emailError = ref("");
const awaitingCode = ref(false);

// Панель пользователей — только у администратора.
const users = ref([]);
const usersError = ref("");
const busyUser = ref("");

const isAdmin = computed(() => me.value?.role === "admin");

const roles = [
  { value: "admin", label: "Администратор" },
  { value: "user", label: "Пользователь" },
  { value: "guest", label: "Гость (только чтение)" },
];

onMounted(async () => {
  try {
    me.value = await fetchMe();
    email.value = me.value.email || "";
    // Профиль в localStorage обновляем заодно: роль могли поменять, пока
    // человек ходил по приложению со старым токеном.
    saveSession({ accessToken: localStorage.getItem("token"), user: me.value });
    if (me.value.role === "admin") await loadUsers();
  } catch (err) {
    error.value = String(err?.message || err);
  } finally {
    loading.value = false;
  }
});

async function loadUsers() {
  try {
    users.value = await fetchUsers();
    usersError.value = "";
  } catch (err) {
    usersError.value = String(err?.message || err);
  }
}

async function submitPassword() {
  passwordError.value = "";
  passwordNotice.value = "";
  try {
    await changePassword(oldPassword.value, newPassword.value);
    // Смена пароля гасит все сессии, включая текущую, — поэтому сразу на вход.
    passwordNotice.value = "Пароль изменён. Нужно войти заново.";
    oldPassword.value = "";
    newPassword.value = "";
    setTimeout(logout, 1200);
  } catch (err) {
    passwordError.value = String(err?.message || err);
  }
}

async function submitEmail() {
  emailError.value = "";
  emailNotice.value = "";
  try {
    await setEmail(email.value.trim());
    awaitingCode.value = true;
    emailNotice.value = "Код отправлен. Введите его ниже.";
  } catch (err) {
    emailError.value = String(err?.message || err);
  }
}

async function submitEmailCode() {
  emailError.value = "";
  emailNotice.value = "";
  try {
    await confirmEmail(emailCode.value.trim());
    awaitingCode.value = false;
    emailCode.value = "";
    emailNotice.value = "Почта подтверждена — теперь по ней можно вернуть пароль.";
    me.value = await fetchMe();
  } catch (err) {
    emailError.value = String(err?.message || err);
  }
}

async function saveUser(user, changes) {
  busyUser.value = user.id;
  try {
    const updated = await updateUser(user.id, changes);
    Object.assign(user, updated);
    usersError.value = "";
  } catch (err) {
    usersError.value = String(err?.message || err);
    await loadUsers();
  } finally {
    busyUser.value = "";
  }
}

function resetUserPassword(user) {
  const password = prompt(`Новый пароль для «${user.login}» (минимум 8 символов):`);
  if (!password) return;
  saveUser(user, { newPassword: password });
}
</script>

<template>
  <div class="account">
    <h1>Профиль</h1>

    <p v-if="loading" class="muted">Загружаю…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <template v-else-if="me">
      <section class="card">
        <div class="who">
          <div class="who-name">{{ me.displayName || me.login }}</div>
          <div class="who-login">@{{ me.login }}</div>
          <span class="role" :class="me.role">{{
            roles.find((r) => r.value === me.role)?.label || me.role
          }}</span>
        </div>
        <button class="ghost" @click="$router.push('/admin')">Вкусняхи</button>
        <button class="ghost" @click="logout">Выйти</button>
      </section>

      <section class="card">
        <h2>Пароль</h2>
        <input
          v-model="oldPassword"
          type="password"
          autocomplete="current-password"
          placeholder="Текущий пароль"
        />
        <input
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          placeholder="Новый пароль (от 8 символов)"
        />
        <button
          class="primary"
          :disabled="!oldPassword || !newPassword"
          @click="submitPassword"
        >
          Сменить пароль
        </button>
        <p class="hint">Смена пароля завершает сессии на всех устройствах.</p>
        <p v-if="passwordError" class="error">{{ passwordError }}</p>
        <p v-if="passwordNotice" class="notice">{{ passwordNotice }}</p>
      </section>

      <section class="card">
        <h2>Почта</h2>
        <p class="hint">
          Нужна ровно для одного — вернуть доступ, если забудете пароль.
          Пока адрес не подтверждён, код на него не уходит.
        </p>
        <div class="row">
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="name@example.com"
          />
          <span v-if="me.email && me.emailVerified" class="badge ok">
            подтверждена
          </span>
          <span v-else-if="me.email" class="badge">не подтверждена</span>
        </div>
        <button class="primary" :disabled="!email" @click="submitEmail">
          {{ me.email === email && me.emailVerified ? "Выслать код заново" : "Сохранить и выслать код" }}
        </button>

        <template v-if="awaitingCode">
          <input
            v-model="emailCode"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="Код из письма"
          />
          <button class="primary" :disabled="!emailCode" @click="submitEmailCode">
            Подтвердить
          </button>
        </template>

        <p v-if="emailError" class="error">{{ emailError }}</p>
        <p v-if="emailNotice" class="notice">{{ emailNotice }}</p>
      </section>

      <section v-if="isAdmin" class="card">
        <h2>Пользователи</h2>
        <p class="hint">
          У каждого свои данные: разделы, задачи и прогресс не пересекаются.
          Гость видит только то, что открыто на чтение.
        </p>
        <p v-if="usersError" class="error">{{ usersError }}</p>

        <div class="users">
          <div v-for="user in users" :key="user.id" class="user">
            <div class="user-main">
              <div class="user-name">{{ user.displayName || user.login }}</div>
              <div class="user-login">@{{ user.login }}</div>
            </div>

            <select
              :value="user.role"
              :disabled="busyUser === user.id"
              @change="saveUser(user, { role: $event.target.value })"
            >
              <option v-for="r in roles" :key="r.value" :value="r.value">
                {{ r.label }}
              </option>
            </select>

            <label class="toggle">
              <input
                type="checkbox"
                :checked="user.isActive"
                :disabled="busyUser === user.id"
                @change="saveUser(user, { isActive: $event.target.checked })"
              />
              <span>{{ user.isActive ? "активен" : "отключён" }}</span>
            </label>

            <button
              class="ghost"
              :disabled="busyUser === user.id"
              @click="resetUserPassword(user)"
            >
              Сбросить пароль
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.account {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 64px;
  color: #e8e9ef;
}
h1 {
  font-size: 1.6rem;
  margin: 0 0 18px;
}
h2 {
  font-size: 1.1rem;
  margin: 0 0 4px;
}
.card {
  background: #23232b;
  border: 1px solid #2e2e3a;
  border-radius: 14px;
  padding: 18px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.who-name {
  font-size: 1.15rem;
  font-weight: 600;
}
.who-login,
.user-login {
  color: #8b90a0;
  font-size: 0.9rem;
}
.card:first-of-type {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.role {
  align-self: flex-start;
  margin-top: 6px;
  font-size: 0.8rem;
  padding: 2px 10px;
  border-radius: 999px;
  background: #2e2660;
  color: #b3a6ff;
}
.role.guest {
  background: #35353f;
  color: #a9adbb;
}
input,
select {
  background: #18191f;
  border: 1px solid #2e2660;
  border-radius: 8px;
  color: #fff;
  padding: 10px 12px;
  font-size: 1rem;
  outline: none;
  box-sizing: border-box;
}
input:focus,
select:focus {
  border-color: #6e4aff;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.row input {
  flex: 1 1 220px;
}
.primary {
  align-self: flex-start;
  background: linear-gradient(90deg, #2e2660 60%, #18191f 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  padding: 10px 18px;
  font-weight: 600;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ghost {
  background: none;
  border: 1px solid #3a3a48;
  border-radius: 8px;
  color: #c8cad4;
  padding: 8px 14px;
  cursor: pointer;
  white-space: nowrap;
}
.ghost:hover {
  border-color: #6e4aff;
  color: #fff;
}
.hint {
  color: #8b90a0;
  font-size: 0.88rem;
  line-height: 1.45;
  margin: 0;
}
.error {
  color: #ff7875;
  margin: 0;
}
.notice {
  color: #7ee0a5;
  margin: 0;
}
.muted {
  color: #8b90a0;
}
.badge {
  font-size: 0.78rem;
  padding: 2px 10px;
  border-radius: 999px;
  background: #35353f;
  color: #a9adbb;
}
.badge.ok {
  background: #1e3b2c;
  color: #7ee0a5;
}
.users {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.user {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px;
  border: 1px solid #2e2e3a;
  border-radius: 10px;
}
.user-main {
  flex: 1 1 160px;
  min-width: 0;
}
.user-name {
  font-weight: 600;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a9adbb;
  font-size: 0.9rem;
  white-space: nowrap;
}
.toggle input {
  padding: 0;
  width: 16px;
  height: 16px;
}

@media (max-width: 620px) {
  .card:first-of-type {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .user {
    flex-direction: column;
    align-items: stretch;
  }
  .user select,
  .user .ghost {
    width: 100%;
  }
  input,
  select {
    font-size: 16px; /* iOS не зумит поле с таким размером */
  }
}
</style>
