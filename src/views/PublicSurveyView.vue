<script setup>
import "@/styles/survey.css";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import SurveyRunner from "@/components/survey/SurveyRunner.vue";
import { flatQuestions, plural } from "@/components/survey/surveyFormat.js";
import {
  fetchPublicSurvey,
  savePublicAnswers,
  setRespondentToken,
  startPublicSurvey,
  submitPublicAnswers,
} from "@/components/surveyApi.js";

// Опрос по ссылке. Вход не нужен: человека узнаёт пропуск в его браузере,
// поэтому закрытая вкладка или перезагрузка возвращают к тем же ответам.
//
// Ответы уходят на сервер на ходу, с маленькой задержкой: дотыкал до
// середины и закрыл телефон — середина не потерялась.

const route = useRoute();
const token = computed(() => String(route.params.token || ""));

const loading = ref(true);
const fatal = ref("");
const survey = ref(null); // { closed, definition, response }
const answers = ref({});
const status = ref(""); // "", draft, submitted
const screen = ref("intro"); // intro | run | thanks
const name = ref("");
const starting = ref(false);
const startError = ref("");
const saveState = ref("");
const submitting = ref(false);
const submitError = ref("");

const definition = computed(() => survey.value?.definition || { sections: [] });
const total = computed(() => flatQuestions(definition.value).length);
const sectionTitles = computed(() =>
  definition.value.sections.map((s) => s.title).filter(Boolean),
);
// Примерно по 12 секунд на вопрос — честнее, чем ничего не сказать.
const minutes = computed(() => Math.max(1, Math.round((total.value * 12) / 60)));

async function load() {
  loading.value = true;
  fatal.value = "";
  try {
    const data = await fetchPublicSurvey(token.value);
    survey.value = data;
    document.title = data.definition.title || "Опрос";
    if (data.response) {
      answers.value = data.response.answers || {};
      status.value = data.response.status;
      name.value = data.response.name || "";
      screen.value = data.response.status === "submitted" ? "thanks" : "run";
    } else {
      screen.value = "intro";
    }
  } catch (e) {
    fatal.value = e.status === 404 ? "Опрос не найден. Возможно, ссылку заменили." : e.message;
  } finally {
    loading.value = false;
  }
}

async function start() {
  starting.value = true;
  startError.value = "";
  try {
    const response = await startPublicSurvey(token.value, name.value.trim());
    answers.value = response.answers || {};
    status.value = response.status;
    screen.value = "run";
  } catch (e) {
    startError.value = e.message;
    if (e.closed) survey.value.closed = true;
  } finally {
    starting.value = false;
  }
}

// --- Сохранение на ходу ---

let saveTimer = 0;
let saveChain = Promise.resolve();

function onAnswers(next) {
  answers.value = next;
  saveState.value = "saving";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}

// flush — ответы на сервер. Запросы идут цепочкой: обогнавший старый запрос
// перезаписал бы свежие ответы устаревшими.
function flush() {
  clearTimeout(saveTimer);
  const snapshot = answers.value;
  saveChain = saveChain.then(async () => {
    try {
      await savePublicAnswers(token.value, snapshot);
      if (answers.value === snapshot) saveState.value = "saved";
    } catch (e) {
      handleLost(e);
      saveState.value = "error";
      // Сеть моргнула — повторим, когда человек снова что-то нажмёт или
      // через пару секунд, если не нажмёт.
      if (!e.restart && !e.closed) saveTimer = setTimeout(flush, 3000);
    }
  });
  return saveChain;
}

// Пропуск не подошёл (ответы удалил хозяин) или опрос закрыли.
function handleLost(e) {
  if (e.restart) {
    setRespondentToken(token.value, "");
    survey.value.response = null;
    answers.value = {};
    screen.value = "intro";
    startError.value = "Твои ответы больше не найдены — можно пройти опрос заново.";
  } else if (e.closed) {
    survey.value.closed = true;
  }
}

async function submit() {
  submitting.value = true;
  submitError.value = "";
  clearTimeout(saveTimer);
  try {
    await saveChain;
    const response = await submitPublicAnswers(token.value, answers.value);
    status.value = response.status;
    saveState.value = "";
    screen.value = "thanks";
    window.scrollTo({ top: 0 });
  } catch (e) {
    handleLost(e);
    submitError.value = e.message;
  } finally {
    submitting.value = false;
  }
}

function editAgain() {
  screen.value = "run";
}

// Уходят со страницы с несохранённым — дожимаем сразу, не дожидаясь задержки.
function onHide() {
  if (saveState.value === "saving") flush();
}

onMounted(() => {
  load();
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onHide);
});
onBeforeUnmount(() => {
  window.removeEventListener("pagehide", onHide);
  document.removeEventListener("visibilitychange", onHide);
  clearTimeout(saveTimer);
});
</script>

<template>
  <div class="sv-scope psv">
    <div v-if="loading" class="psv-center">
      <div class="psv-spinner" />
    </div>

    <div v-else-if="fatal" class="psv-center">
      <div class="psv-emoji">🔍</div>
      <p class="psv-lead">{{ fatal }}</p>
    </div>

    <!-- Опрос закрыт, а человек его не проходил -->
    <div v-else-if="survey.closed && screen !== 'thanks'" class="psv-center">
      <div class="psv-emoji">🔒</div>
      <h1 class="psv-title">{{ definition.title }}</h1>
      <p class="psv-lead">Опрос закрыт — ответы больше не принимаются.</p>
    </div>

    <!-- Вступление -->
    <div v-else-if="screen === 'intro'" class="psv-intro">
      <div class="psv-emoji">💬</div>
      <h1 class="psv-title">{{ definition.title }}</h1>
      <p v-if="definition.description" class="psv-lead">{{ definition.description }}</p>
      <div class="psv-facts">
        <span>{{ plural(total, "вопрос", "вопроса", "вопросов") }}</span>
        <span>≈ {{ minutes }} мин</span>
        <span v-if="sectionTitles.length > 1">{{ plural(sectionTitles.length, "тема", "темы", "тем") }}</span>
      </div>
      <div v-if="sectionTitles.length > 1" class="psv-topics">
        <span v-for="t in sectionTitles" :key="t" class="psv-topic">{{ t }}</span>
      </div>
      <label class="psv-name">
        <span class="sv-label">Как тебя зовут? Можно не писать</span>
        <input v-model="name" class="sv-input" maxlength="120" placeholder="Имя" @keyup.enter="start" />
      </label>
      <div v-if="startError" class="sv-error">{{ startError }}</div>
      <button class="sv-btn is-primary is-big" :disabled="starting || !total" @click="start">
        {{ starting ? "Секунду…" : "Начать" }}
      </button>
      <p class="psv-note">Ответы сохраняются по ходу — можно закрыть и вернуться позже по этой же ссылке.</p>
    </div>

    <!-- Прохождение -->
    <SurveyRunner
      v-else-if="screen === 'run'"
      :definition="definition"
      :model-value="answers"
      :save-state="saveState"
      :submitting="submitting"
      :submit-error="submitError"
      :submitted="status === 'submitted'"
      @update:model-value="onAnswers"
      @submit="submit"
    />

    <!-- Спасибо -->
    <div v-else class="psv-center">
      <div class="psv-emoji psv-pop">💌</div>
      <h1 class="psv-title">{{ definition.thanks || "Спасибо! Ответы отправлены" }}</h1>
      <p class="psv-lead">Отвечено {{ Object.keys(answers).length }} из {{ total }}.</p>
      <button v-if="!survey.closed" class="sv-btn" @click="editAgain">Изменить ответы</button>
    </div>
  </div>
</template>

<style scoped>
.psv {
  width: 100%;
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  background:
    radial-gradient(1200px 500px at 50% -200px, rgba(242, 112, 140, 0.16), transparent 70%),
    var(--sv-bg);
}
.psv-center,
.psv-intro {
  width: 100%;
  max-width: 520px;
  min-height: 100dvh;
  padding: calc(32px + env(safe-area-inset-top, 0px)) 20px calc(32px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  text-align: center;
}
.psv-intro {
  text-align: left;
}
.psv-emoji {
  font-size: 52px;
  line-height: 1;
}
.psv-intro .psv-emoji {
  font-size: 44px;
}
.psv-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 700;
}
.psv-lead {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  color: var(--sv-dim);
  white-space: pre-wrap;
}
.psv-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 14px;
  color: var(--sv-muted);
}
.psv-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.psv-topic {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--sv-accent-soft);
  color: var(--sv-text);
  font-size: 13px;
}
.psv-name {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.psv-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--sv-muted);
}
.psv-center .sv-btn {
  align-self: center;
}
.psv-pop {
  animation: psv-pop 0.5s cubic-bezier(0.3, 1.6, 0.5, 1);
}
@keyframes psv-pop {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
}
.psv-spinner {
  align-self: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--sv-line);
  border-top-color: var(--sv-accent);
  animation: psv-spin 0.8s linear infinite;
}
@keyframes psv-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
