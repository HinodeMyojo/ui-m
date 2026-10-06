<script setup>
import "@/styles/survey.css";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { createSurvey, fetchSurveys, surveyShareUrl } from "@/components/surveyApi.js";
import { AI_INSTRUCTION, EXAMPLE_SURVEY, plural } from "@/components/survey/surveyFormat.js";
import { copyText } from "@/components/survey/clipboard.js";

// Раздел «Опросы»: список своих опросов и создание нового. Новый опрос
// рождается из JSON — его надиктовывают ИИ по инструкции ниже — или пустым,
// и тогда собирается в конструкторе.

const router = useRouter();

const list = ref([]);
const loading = ref(true);
const error = ref("");

const creating = ref(false);
const draft = ref("");
const createError = ref("");
const busy = ref(false);
const toast = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    list.value = (await fetchSurveys()) || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  creating.value = true;
  createError.value = "";
}

async function create(definition) {
  busy.value = true;
  createError.value = "";
  try {
    const survey = await createSurvey(definition);
    router.push(`/surveys/${survey.id}`);
  } catch (e) {
    createError.value = e.message;
  } finally {
    busy.value = false;
  }
}

function createFromJson() {
  const text = draft.value.trim();
  if (!text) {
    createError.value = "Вставь JSON опроса — или начни с пустого.";
    return;
  }
  // ИИ любит заворачивать ответ в ```json … ``` — снимаем обёртку сами.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    JSON.parse(cleaned);
  } catch (e) {
    createError.value = `Это не JSON: ${e.message}`;
    return;
  }
  create(cleaned);
}

function createBlank() {
  create({ title: "Новый опрос", sections: [{ title: "", questions: [] }] });
}

function fillExample() {
  draft.value = JSON.stringify(EXAMPLE_SURVEY, null, 2);
}

async function copyInstruction() {
  flash((await copyText(AI_INSTRUCTION)) ? "Инструкция скопирована — допиши свой текст" : "Не удалось скопировать");
}

async function copyLink(s) {
  flash((await copyText(surveyShareUrl(s.shareToken))) ? "Ссылка скопирована" : "Не удалось скопировать");
}

let toastTimer = 0;
function flash(text) {
  toast.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 2200);
}

function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

onMounted(load);
</script>

<template>
  <div class="sv-scope svl">
    <div class="svl-head">
      <h1>📋 Опросы</h1>
      <div class="svl-head-actions">
        <button class="sv-btn is-primary" @click="openCreate">＋ Новый</button>
        <button class="sv-btn" @click="router.push('/')">← Назад</button>
      </div>
    </div>

    <div v-if="error" class="sv-error">{{ error }}</div>
    <div v-if="loading" class="svl-empty">Загружаю…</div>

    <template v-else>
      <div v-if="!list.length && !creating" class="sv-card svl-hello">
        <div class="svl-hello-emoji">🗳️</div>
        <b>Опросов пока нет</b>
        <p class="sv-muted">
          Надиктуй вопросы, отдай ИИ вместе с инструкцией — он соберёт JSON. Вставишь его сюда,
          добавишь картинки и отправишь ссылку. Отвечать можно без регистрации.
        </p>
        <button class="sv-btn is-primary" @click="openCreate">Создать первый</button>
      </div>

      <!-- Создание -->
      <section v-if="creating" class="sv-card svl-create">
        <div class="svl-create-head">
          <b>Новый опрос</b>
          <button class="sv-btn is-small is-ghost" @click="creating = false">✕</button>
        </div>
        <ol class="svl-steps">
          <li>
            Скопируй инструкцию и отдай её ИИ вместе с надиктованным текстом.
            <button class="sv-btn is-small" @click="copyInstruction">📋 Инструкция для ИИ</button>
          </li>
          <li>Вставь сюда JSON, который он вернул.</li>
        </ol>
        <textarea
          v-model="draft"
          class="sv-input svl-json"
          rows="12"
          spellcheck="false"
          placeholder='{ "title": "…", "sections": [ … ] }'
        />
        <div v-if="createError" class="sv-error">{{ createError }}</div>
        <div class="svl-create-actions">
          <button class="sv-btn is-primary" :disabled="busy" @click="createFromJson">
            {{ busy ? "Создаю…" : "Создать из JSON" }}
          </button>
          <button class="sv-btn" :disabled="busy" @click="createBlank">Пустой — соберу сам</button>
          <button class="sv-btn is-ghost" @click="fillExample">Пример</button>
        </div>
      </section>

      <!-- Список -->
      <section
        v-for="s in list"
        :key="s.id"
        class="sv-card svl-item"
        role="link"
        tabindex="0"
        @click="router.push(`/surveys/${s.id}`)"
        @keyup.enter="router.push(`/surveys/${s.id}`)"
      >
        <div class="svl-item-top">
          <span class="svl-item-title">{{ s.title }}</span>
          <span class="svl-pill" :class="{ 'is-closed': s.closed }">
            {{ s.closed ? "закрыт" : "открыт" }}
          </span>
        </div>
        <div class="svl-item-meta">
          <span>{{ plural(s.questionCount, "вопрос", "вопроса", "вопросов") }}</span>
          <span v-if="s.sectionCount > 1">{{ plural(s.sectionCount, "раздел", "раздела", "разделов") }}</span>
          <span :class="{ 'svl-hot': s.submitted }">
            {{ s.submitted ? plural(s.submitted, "ответ", "ответа", "ответов") : "ответов нет" }}
          </span>
          <span v-if="s.drafts">{{ s.drafts }} в процессе</span>
          <span v-if="s.lastAnswerAt">· {{ when(s.lastAnswerAt) }}</span>
        </div>
        <div class="svl-item-actions" @click.stop>
          <button class="sv-btn is-small" @click="copyLink(s)">🔗 Ссылка</button>
          <button class="sv-btn is-small" @click="router.push(`/surveys/${s.id}?tab=results`)">
            Ответы
          </button>
        </div>
      </section>
    </template>

    <Transition name="svl-fade">
      <div v-if="toast" class="svl-toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.svl {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 14px 14px 90px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: transparent;
}
.svl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.svl-head h1 {
  margin: 0;
  font-size: 24px;
}
.svl-head-actions {
  display: flex;
  gap: 8px;
}
.svl-empty {
  color: var(--sv-muted);
  padding: 20px 0;
  text-align: center;
}
.svl-hello {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 26px 18px;
  text-align: center;
}
.svl-hello p {
  margin: 0;
  max-width: 460px;
  line-height: 1.5;
  font-size: 14px;
}
.svl-hello-emoji {
  font-size: 40px;
}
.svl-create {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.svl-create-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.svl-steps {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  color: var(--sv-dim);
  line-height: 1.45;
}
.svl-steps .sv-btn {
  margin-top: 6px;
  display: flex;
  width: fit-content;
}
.svl-json {
  font-family: ui-monospace, "Cascadia Code", Menlo, monospace;
  font-size: 13px;
  min-height: 220px;
}
.svl-create-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.svl-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.svl-item:hover {
  border-color: #3b4050;
}
.svl-item-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.svl-item-title {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
}
.svl-pill {
  flex: none;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(95, 208, 138, 0.14);
  color: var(--sv-ok);
}
.svl-pill.is-closed {
  background: var(--sv-card-2);
  color: var(--sv-muted);
}
.svl-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 13px;
  color: var(--sv-muted);
}
.svl-hot {
  color: var(--sv-accent);
  font-weight: 600;
}
.svl-item-actions {
  display: flex;
  gap: 8px;
  cursor: default;
}
.svl-toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 40;
  padding: 10px 16px;
  border-radius: 12px;
  background: #2b2f3c;
  color: var(--sv-text);
  font-size: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  max-width: calc(100vw - 32px);
}
.svl-fade-enter-active,
.svl-fade-leave-active {
  transition: opacity 0.2s;
}
.svl-fade-enter-from,
.svl-fade-leave-to {
  opacity: 0;
}
</style>
