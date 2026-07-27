<script setup>
import { ref } from "vue";
import {
  fetchGoogleAuthUrl,
  disconnectGoogle,
  setGoogleCalendar,
  syncWorkDayToGoogle,
} from "@/components/api.js";

const props = defineProps({
  status: { type: Object, default: () => ({}) },
  date: { type: String, required: true },
});
const emit = defineEmits(["close", "changed"]);

const busy = ref(false);
const error = ref("");
const message = ref("");
const calendarId = ref(props.status.calendarId || "primary");

// Google возвращает пользователя на ту же страницу — код ловит WorkspaceView.
const redirectUri = `${window.location.origin}/today`;

async function connect() {
  busy.value = true;
  error.value = "";
  try {
    const { url } = await fetchGoogleAuthUrl(redirectUri);
    localStorage.setItem("googleRedirectUri", redirectUri);
    window.location.href = url;
  } catch (e) {
    error.value = e.message || "не удалось начать авторизацию";
    busy.value = false;
  }
}

async function disconnect() {
  if (!confirm("Отключить Google Calendar? События в календаре останутся.")) return;
  busy.value = true;
  try {
    await disconnectGoogle();
    emit("changed");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function saveCalendar() {
  busy.value = true;
  error.value = "";
  try {
    await setGoogleCalendar(calendarId.value.trim() || "primary");
    message.value = "Календарь сохранён";
    emit("changed");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function syncDay() {
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    const result = await syncWorkDayToGoogle(props.date);
    message.value = `Отправлено в календарь: ${result.synced}`;
    emit("changed");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="gp-overlay" @click.self="emit('close')">
    <div class="gp">
      <div class="gp-head">
        <h3>Google Calendar</h3>
        <button class="gp-x" @click="emit('close')">✕</button>
      </div>

      <div class="gp-body">
        <div v-if="!status.configured" class="gp-warn">
          На сервере не заданы <b>clientId</b> и <b>clientSecret</b>. Создайте OAuth-клиент
          в Google Cloud Console (тип «Web application»), добавьте redirect URI
          <code>{{ redirectUri }}</code> и пропишите ключи в конфиг backend
          (секция <code>google:</code>) или в переменные окружения
          <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>.
          Пока этого нет, работает только выгрузка <code>.ics</code> у каждой карточки.
        </div>

        <template v-else>
          <div v-if="status.connected" class="gp-status ok">
            Подключено: <b>{{ status.email || "аккаунт Google" }}</b>
          </div>
          <div v-else class="gp-status">Календарь не подключён</div>

          <button v-if="!status.connected" class="gp-btn primary" :disabled="busy" @click="connect">
            Подключить Google Calendar
          </button>

          <template v-else>
            <label class="gp-label">
              ID календаря
              <input v-model="calendarId" class="gp-input" placeholder="primary" />
              <span class="gp-hint">
                <code>primary</code> — ваш основной календарь. События карточек пишутся туда.
              </span>
            </label>
            <div class="gp-actions">
              <button class="gp-btn" :disabled="busy" @click="saveCalendar">Сохранить</button>
              <button class="gp-btn primary" :disabled="busy" @click="syncDay">
                Синхронизировать день
              </button>
              <button class="gp-btn danger" :disabled="busy" @click="disconnect">Отключить</button>
            </div>
          </template>
        </template>

        <div v-if="message" class="gp-msg">{{ message }}</div>
        <div v-if="error" class="gp-err">{{ error }}</div>

        <div class="gp-note">
          Карточка со слотом времени уезжает событием на это время; без слота, но
          с дедлайном по времени — событием, заканчивающимся к дедлайну; без того и
          другого — событием на весь день. Отменённые и архивные карточки из календаря
          убираются.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2200;
  padding: 16px;
}

.gp {
  width: min(540px, 100%);
  background: #1b1d24;
  border: 1px solid #2f3340;
  border-radius: 14px;
  overflow: hidden;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.gp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #2a2d38;
}

.gp-head h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}

.gp-x {
  background: none;
  border: none;
  color: #8f95a6;
  font-size: 18px;
  cursor: pointer;
}

.gp-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.gp-warn {
  background: #2a2416;
  border: 1px solid #6b5620;
  border-radius: 10px;
  padding: 12px;
  color: #e3d5a8;
  font-size: 12.5px;
  line-height: 1.6;
}

.gp-status {
  color: #9aa0b1;
  font-size: 13px;
}

.gp-status.ok {
  color: #63c94f;
}

.gp-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #9aa0b1;
  font-size: 12px;
}

.gp-input {
  background: #16171d;
  border: 1px solid #2f3340;
  border-radius: 8px;
  color: #e8eaf2;
  padding: 9px 10px;
  font-size: 13px;
  outline: none;
}

.gp-input:focus {
  border-color: #1767fd;
}

.gp-hint,
.gp-note {
  color: #7a7f8e;
  font-size: 11.5px;
  line-height: 1.6;
}

.gp-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.gp-btn {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 13px;
  min-height: 40px;
}

.gp-btn:hover:not(:disabled) {
  border-color: #6e4aff;
}

.gp-btn.primary {
  background: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

.gp-btn.danger {
  border-color: #6b2b2e;
  color: #e5848a;
}

.gp-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.gp-msg {
  color: #63c94f;
  font-size: 12.5px;
}

.gp-err {
  color: #e5484d;
  font-size: 12.5px;
}

code {
  background: #232631;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11.5px;
}
</style>
