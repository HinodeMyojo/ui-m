<script setup>
import "@/styles/survey.css";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  createMentorPair,
  deleteMentorPair,
  fetchMentorPairs,
  mentorFallbackLink,
  mentorLink,
  regenerateMentorLinks,
  updateMentorPair,
} from "@/components/mentorApi.js";
import { copyText } from "@/components/survey/clipboard.js";

// Раздел «N»: здесь только заводят пару ссылок и раздают их. Сама работа —
// рекомендации наставника и отметки ученика — идёт на странице /n/:token,
// без входа. Спека — docs/mentor-module.md (back-m).

const router = useRouter();

const pairs = ref([]);
const loading = ref(true);
const error = ref("");
const toast = ref("");

const mentorName = ref("");
const studentName = ref("");
const busy = ref(false);

// Правка имён и подтверждения — прямо в карточке, без системных диалогов.
const editing = ref(null);
const confirming = ref(null);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    pairs.value = (await fetchMentorPairs()) || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function flash(text) {
  toast.value = text;
  setTimeout(() => (toast.value = ""), 2200);
}

async function create() {
  busy.value = true;
  error.value = "";
  try {
    await createMentorPair({ mentorName: mentorName.value, studentName: studentName.value });
    mentorName.value = "";
    studentName.value = "";
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function copy(token, who, fallback = false) {
  const link = fallback ? mentorFallbackLink(token) : mentorLink(token);
  flash((await copyText(link)) ? `Ссылка ${who} скопирована` : "Не вышло скопировать");
}

function startEdit(p) {
  editing.value = { id: p.id, mentorName: p.mentorName, studentName: p.studentName };
}

async function saveEdit() {
  const e = editing.value;
  try {
    await updateMentorPair(e.id, { mentorName: e.mentorName, studentName: e.studentName });
    editing.value = null;
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function confirmAction() {
  const { id, action } = confirming.value;
  confirming.value = null;
  try {
    if (action === "delete") await deleteMentorPair(id);
    else await regenerateMentorLinks(id);
    await load();
    if (action === "links") flash("Новые ссылки готовы — старые больше не открываются");
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="sv-scope mtv">
    <div class="mtv-head">
      <h1>🌙 N</h1>
      <button class="sv-btn" @click="router.push('/')">← Назад</button>
    </div>
    <p class="sv-muted mtv-lead">
      Две ссылки: по одной наставник назначает, сколько дней не есть свинину, сколько раз в день делать намаз
      и своё. По другой ты отмечаешь, как получилось. Входить никуда не нужно, ссылку можно добавить на экран
      «Домой».
    </p>

    <div v-if="error" class="mtv-error">{{ error }}</div>

    <section class="sv-card mtv-create">
      <h2>Новая пара ссылок</h2>
      <label>
        <span>Как зовут наставника</span>
        <input v-model="mentorName" class="sv-input" maxlength="60" />
      </label>
      <label>
        <span>Как зовут тебя</span>
        <input v-model="studentName" class="sv-input" maxlength="60" />
      </label>
      <button class="sv-btn is-primary" :disabled="busy" @click="create">Создать ссылки</button>
    </section>

    <div v-if="loading" class="sv-muted">Загрузка…</div>
    <section v-for="p in pairs" :key="p.id" class="sv-card mtv-pair">
      <template v-if="editing && editing.id === p.id">
        <label>
          <span>Наставник</span>
          <input v-model="editing.mentorName" class="sv-input" maxlength="60" />
        </label>
        <label>
          <span>Ученик</span>
          <input v-model="editing.studentName" class="sv-input" maxlength="60" />
        </label>
        <div class="mtv-row">
          <button class="sv-btn is-primary is-small" @click="saveEdit">Сохранить</button>
          <button class="sv-btn is-small" @click="editing = null">Отмена</button>
        </div>
      </template>
      <template v-else>
        <div class="mtv-pair-title">
          <b>{{ p.mentorName || "Наставник" }}</b> → <b>{{ p.studentName || "ученик" }}</b>
          <span class="sv-muted">· активных рекомендаций: {{ p.activeTasks }}</span>
        </div>
        <div class="mtv-links">
          <div class="mtv-link">
            <span>Ссылка наставника — отправь ей</span>
            <div class="mtv-row">
              <button class="sv-btn is-small is-primary" @click="copy(p.mentorToken, 'наставника')">Копировать</button>
              <a class="sv-btn is-small" :href="mentorLink(p.mentorToken)" target="_blank">Открыть</a>
              <button class="sv-btn is-small is-ghost" @click="copy(p.mentorToken, 'наставника', true)">Запасная</button>
            </div>
          </div>
          <div class="mtv-link">
            <span>Твоя ссылка — для отметок</span>
            <div class="mtv-row">
              <button class="sv-btn is-small is-primary" @click="copy(p.studentToken, 'для отметок')">Копировать</button>
              <a class="sv-btn is-small" :href="mentorLink(p.studentToken)" target="_blank">Открыть</a>
              <button class="sv-btn is-small is-ghost" @click="copy(p.studentToken, 'для отметок', true)">Запасная</button>
            </div>
          </div>
        </div>
        <div v-if="confirming && confirming.id === p.id" class="mtv-confirm">
          <span v-if="confirming.action === 'delete'">Удалить пару со всеми рекомендациями и отметками?</span>
          <span v-else>Старые ссылки перестанут открываться. Обе нужно будет отправить заново.</span>
          <div class="mtv-row">
            <button class="sv-btn is-small is-danger" @click="confirmAction">Да</button>
            <button class="sv-btn is-small" @click="confirming = null">Нет</button>
          </div>
        </div>
        <div v-else class="mtv-row mtv-tools">
          <button class="sv-btn is-small is-ghost" @click="startEdit(p)">Имена</button>
          <button class="sv-btn is-small is-ghost" @click="confirming = { id: p.id, action: 'links' }">Новые ссылки</button>
          <button class="sv-btn is-small is-ghost" @click="confirming = { id: p.id, action: 'delete' }">Удалить</button>
        </div>
      </template>
    </section>

    <div v-if="toast" class="mtv-toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.mtv {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 14px 14px 90px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: transparent;
}
.mtv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mtv-head h1 {
  margin: 0;
  font-size: 24px;
}
.mtv-lead {
  margin: 0;
  line-height: 1.45;
}
.mtv-create,
.mtv-pair {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mtv-create h2 {
  margin: 0;
  font-size: 17px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  color: var(--sv-dim);
}
.mtv-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.mtv-links {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mtv-link {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--sv-dim);
}
.mtv-tools {
  border-top: 1px solid var(--sv-line);
  padding-top: 8px;
}
.mtv-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  background: var(--sv-card-2);
}
.mtv-error {
  color: var(--sv-bad);
}
.mtv-toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  background: var(--sv-card-2);
  color: var(--sv-text);
  padding: 10px 16px;
  border-radius: 12px;
  z-index: 50;
}
a.sv-btn {
  text-decoration: none;
}
</style>
