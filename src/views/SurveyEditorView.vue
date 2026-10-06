<script setup>
import "@/styles/survey.css";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import SurveyQuestionEditor from "@/components/survey/SurveyQuestionEditor.vue";
import SurveyResults from "@/components/survey/SurveyResults.vue";
import SurveyRunner from "@/components/survey/SurveyRunner.vue";
import { AI_INSTRUCTION, blankQuestion, blankSection, flatQuestions, plural } from "@/components/survey/surveyFormat.js";
import { copyText } from "@/components/survey/clipboard.js";
import {
  deleteSurvey,
  deleteSurveyResponse,
  fetchSurvey,
  fetchSurveyResponses,
  regenerateSurveyLink,
  setSurveyClosed,
  surveyShareUrl,
  updateSurvey,
} from "@/components/surveyApi.js";

// Опрос изнутри: конструктор, тот же опрос JSON'ом, ответы и ссылка.
//
// Конструктор и JSON правят один черновик. Сохраняется он целиком, одной
// кнопкой: по пути опрос бывает недописан (вопрос без текста), и
// автосохранение спотыкалось бы о проверку сервера на каждой букве.

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));

const survey = ref(null);
const draft = ref(null);
const savedSnapshot = ref("");
const loading = ref(true);
const fatal = ref("");
const saving = ref(false);
const saveError = ref("");
const tab = ref(["questions", "results", "json", "more"].includes(route.query.tab) ? route.query.tab : "questions");

const responses = ref([]);
const responsesLoading = ref(false);

const jsonText = ref("");
const jsonError = ref("");
const previewOpen = ref(false);
const previewAnswers = ref({});
const confirmToken = ref(false);
const confirmDelete = ref(false);
const toast = ref("");

const dirty = computed(() => !!draft.value && snapshot(draft.value) !== savedSnapshot.value);
const shareUrl = computed(() => (survey.value ? surveyShareUrl(survey.value.shareToken) : ""));
const questionCount = computed(() => (draft.value ? flatQuestions(draft.value).length : 0));
const submittedCount = computed(() => responses.value.filter((r) => r.status === "submitted").length);
const canShare = typeof navigator !== "undefined" && !!navigator.share;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function snapshot(def) {
  return JSON.stringify(def);
}

function adopt(data) {
  survey.value = data;
  draft.value = clone(data.definition);
  if (!draft.value.sections.length) draft.value.sections.push({ title: "", questions: [] });
  savedSnapshot.value = snapshot(draft.value);
}

async function load() {
  loading.value = true;
  fatal.value = "";
  try {
    adopt(await fetchSurvey(id.value));
    loadResponses();
  } catch (e) {
    fatal.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function loadResponses() {
  responsesLoading.value = true;
  try {
    responses.value = (await fetchSurveyResponses(id.value)) || [];
  } catch (e) {
    flash(e.message);
  } finally {
    responsesLoading.value = false;
  }
}

// --- Сохранение ---

// cleaned — черновик без пустых хвостов: незаполненный вариант или вопрос
// без единой буквы — это не ошибка автора, а недобавленная строчка.
function cleaned(def) {
  const copy = clone(def);
  for (const section of copy.sections) {
    section.questions = section.questions.filter((q) => {
      if (q.options) q.options = q.options.filter((o) => (o.text || "").trim() || o.image);
      return (q.text || "").trim() || q.image || (q.options && q.options.length);
    });
  }
  return copy;
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    adopt(await updateSurvey(id.value, cleaned(draft.value)));
    flash("Сохранено");
  } catch (e) {
    saveError.value = e.message;
  } finally {
    saving.value = false;
  }
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (tab.value === "json") applyJson();
    else if (dirty.value) save();
  }
}

function onBeforeUnload(e) {
  if (dirty.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm("Есть несохранённые изменения. Уйти без сохранения?")) return false;
  return true;
});

// --- Конструктор ---

const numbering = computed(() => {
  const map = new Map();
  let n = 0;
  for (const s of draft.value?.sections || []) for (const q of s.questions) map.set(q, ++n);
  return map;
});

function addQuestion(section) {
  section.questions.push(blankQuestion());
}

function addSection() {
  draft.value.sections.push(blankSection());
}

function moveSection(si, delta) {
  const list = draft.value.sections;
  const to = si + delta;
  if (to < 0 || to >= list.length) return;
  [list[si], list[to]] = [list[to], list[si]];
}

function removeSection(si) {
  const list = draft.value.sections;
  if (list.length === 1) {
    list[0] = { title: "", questions: [] };
    return;
  }
  // Вопросы удаляемого раздела не теряем: переезжают к соседу.
  const orphans = list[si].questions;
  list.splice(si, 1);
  const neighbour = list[Math.max(0, si - 1)];
  neighbour.questions.push(...orphans);
}

// Вопрос двигается и через границу раздела: первый «вверх» уходит в конец
// предыдущего раздела, последний «вниз» — в начало следующего.
function moveQuestion(si, qi, delta) {
  const sections = draft.value.sections;
  const list = sections[si].questions;
  const to = qi + delta;
  if (to >= 0 && to < list.length) {
    [list[qi], list[to]] = [list[to], list[qi]];
    return;
  }
  const target = sections[si + delta];
  if (!target) return;
  const [q] = list.splice(qi, 1);
  if (delta < 0) target.questions.push(q);
  else target.questions.unshift(q);
}

function duplicateQuestion(section, qi) {
  const copy = clone(section.questions[qi]);
  delete copy.id;
  for (const o of copy.options || []) delete o.id;
  section.questions.splice(qi + 1, 0, copy);
}

function removeQuestion(section, qi) {
  section.questions.splice(qi, 1);
}

function isFirstQuestion(si, qi) {
  return si === 0 && qi === 0;
}
function isLastQuestion(si, qi) {
  const sections = draft.value.sections;
  return si === sections.length - 1 && qi === sections[si].questions.length - 1;
}

// --- JSON ---

function openJson() {
  jsonText.value = JSON.stringify(draft.value, null, 2);
  jsonError.value = "";
}

async function applyJson() {
  jsonError.value = "";
  const text = jsonText.value.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    JSON.parse(text);
  } catch (e) {
    jsonError.value = `Это не JSON: ${e.message}`;
    return;
  }
  saving.value = true;
  try {
    adopt(await updateSurvey(id.value, text));
    openJson();
    flash("JSON применён и сохранён");
  } catch (e) {
    jsonError.value = e.message;
  } finally {
    saving.value = false;
  }
}

watch(tab, (value) => {
  if (value === "json") openJson();
  if (value === "results") loadResponses();
  const query = { ...route.query, tab: value === "questions" ? undefined : value };
  router.replace({ query });
});

// --- Предпросмотр ---

// В черновике у новых вопросов ещё нет id — прохождение держит ответы по
// ним, поэтому раздаём временные.
const previewDefinition = computed(() => {
  if (!draft.value) return null;
  const def = cleaned(draft.value);
  let n = 0;
  for (const s of def.sections) {
    for (const q of s.questions) {
      q.id = q.id || `tmp-q${++n}`;
      (q.options || []).forEach((o, i) => (o.id = o.id || `tmp-o${i}`));
    }
  }
  return def;
});

function openPreview() {
  previewAnswers.value = {};
  previewOpen.value = true;
}

// --- Ссылка и прочее ---

async function copyLink() {
  flash((await copyText(shareUrl.value)) ? "Ссылка скопирована" : "Не удалось скопировать");
}

async function shareLink() {
  try {
    await navigator.share({ title: survey.value.title, url: shareUrl.value });
  } catch {
    // отменили — ничего страшного
  }
}

async function copyInstruction() {
  flash((await copyText(AI_INSTRUCTION)) ? "Инструкция скопирована" : "Не удалось скопировать");
}

async function copyJson() {
  flash((await copyText(jsonText.value)) ? "JSON скопирован" : "Не удалось скопировать");
}

async function toggleClosed() {
  try {
    const data = await setSurveyClosed(id.value, !survey.value.closed);
    survey.value = { ...survey.value, closed: data.closed };
    flash(data.closed ? "Опрос закрыт" : "Опрос снова принимает ответы");
  } catch (e) {
    flash(e.message);
  }
}

async function newLink() {
  confirmToken.value = false;
  try {
    const data = await regenerateSurveyLink(id.value);
    survey.value = { ...survey.value, shareToken: data.shareToken };
    flash("Новая ссылка готова, старая больше не открывается");
  } catch (e) {
    flash(e.message);
  }
}

async function removeSurvey() {
  try {
    await deleteSurvey(id.value);
    savedSnapshot.value = draft.value ? snapshot(draft.value) : "";
    router.push("/surveys");
  } catch (e) {
    flash(e.message);
  }
}

async function removeResponse(r) {
  try {
    await deleteSurveyResponse(id.value, r.id);
    responses.value = responses.value.filter((x) => x.id !== r.id);
  } catch (e) {
    flash(e.message);
  }
}

let toastTimer = 0;
function flash(text) {
  toast.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 2400);
}

onMounted(() => {
  load();
  window.addEventListener("keydown", onKey);
  window.addEventListener("beforeunload", onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("beforeunload", onBeforeUnload);
});
</script>

<template>
  <div class="sv-scope sve">
    <div class="sve-head">
      <button class="sv-btn is-small" @click="router.push('/surveys')">← Опросы</button>
      <span v-if="survey" class="sve-pill" :class="{ 'is-closed': survey.closed }">
        {{ survey.closed ? "закрыт" : "принимает ответы" }}
      </span>
    </div>

    <div v-if="loading" class="sve-empty">Загружаю…</div>
    <div v-else-if="fatal" class="sv-error">{{ fatal }}</div>

    <template v-else-if="survey">
      <h1 class="sve-title">{{ draft.title || "Без названия" }}</h1>

      <!-- Ссылка — главное действие после сборки, поэтому всегда наверху. -->
      <section class="sv-card sve-share">
        <div class="sve-share-row">
          <input class="sv-input sve-link" :value="shareUrl" readonly @focus="$event.target.select()" />
        </div>
        <div class="sve-share-row">
          <button class="sv-btn is-primary" @click="copyLink">🔗 Копировать ссылку</button>
          <button v-if="canShare" class="sv-btn" @click="shareLink">Отправить…</button>
          <a class="sv-btn" :href="shareUrl" target="_blank" rel="noopener">Открыть</a>
          <button class="sv-btn" :disabled="!questionCount" @click="openPreview">👁 Предпросмотр</button>
        </div>
      </section>

      <nav class="sve-tabs">
        <button :class="{ 'is-on': tab === 'questions' }" @click="tab = 'questions'">
          Вопросы <span>{{ questionCount }}</span>
        </button>
        <button :class="{ 'is-on': tab === 'results' }" @click="tab = 'results'">
          Ответы <span :class="{ 'is-hot': submittedCount }">{{ submittedCount }}</span>
        </button>
        <button :class="{ 'is-on': tab === 'json' }" @click="tab = 'json'">JSON</button>
        <button :class="{ 'is-on': tab === 'more' }" @click="tab = 'more'">Ещё</button>
      </nav>

      <!-- Конструктор -->
      <template v-if="tab === 'questions'">
        <section class="sv-card sve-meta">
          <label class="sve-field">
            <span class="sv-label">Название</span>
            <input v-model="draft.title" class="sv-input sve-title-input" placeholder="Как называется опрос" />
          </label>
          <label class="sve-field">
            <span class="sv-label">Вступление</span>
            <textarea v-model="draft.description" class="sv-input" rows="2" placeholder="Пара слов перед началом (необязательно)" />
          </label>
          <label class="sve-field">
            <span class="sv-label">После отправки</span>
            <input v-model="draft.thanks" class="sv-input" placeholder="Спасибо! Ответы отправлены" />
          </label>
        </section>

        <section v-for="(section, si) in draft.sections" :key="si" class="sve-section">
          <div class="sve-section-head">
            <input
              v-model="section.title"
              class="sv-input sve-section-title"
              :placeholder="draft.sections.length > 1 ? `Раздел ${si + 1}` : 'Категория (можно без неё)'"
            />
            <div class="sve-section-tools">
              <button class="sv-btn is-small is-icon" title="Раздел выше" :disabled="si === 0" @click="moveSection(si, -1)">↑</button>
              <button
                class="sv-btn is-small is-icon"
                title="Раздел ниже"
                :disabled="si === draft.sections.length - 1"
                @click="moveSection(si, 1)"
              >
                ↓
              </button>
              <button
                v-if="draft.sections.length > 1"
                class="sv-btn is-small is-icon is-danger"
                title="Убрать раздел (вопросы перейдут к соседнему)"
                @click="removeSection(si)"
              >
                ✕
              </button>
            </div>
          </div>
          <textarea
            v-if="section.title || section.description"
            v-model="section.description"
            class="sv-input sve-section-desc"
            rows="1"
            placeholder="Пояснение к разделу — покажется перед первым его вопросом"
          />

          <SurveyQuestionEditor
            v-for="(q, qi) in section.questions"
            :key="q.id || `${si}-${qi}`"
            :question="q"
            :survey-id="id"
            :number="numbering.get(q) || qi + 1"
            :first="isFirstQuestion(si, qi)"
            :last="isLastQuestion(si, qi)"
            @up="moveQuestion(si, qi, -1)"
            @down="moveQuestion(si, qi, 1)"
            @duplicate="duplicateQuestion(section, qi)"
            @remove="removeQuestion(section, qi)"
            @error="flash"
          />
          <button class="sv-btn sve-add" @click="addQuestion(section)">＋ Вопрос</button>
        </section>

        <button class="sv-btn is-ghost sve-add-section" @click="addSection">＋ Раздел (категория)</button>
      </template>

      <!-- Ответы -->
      <SurveyResults
        v-else-if="tab === 'results'"
        :definition="survey.definition"
        :responses="responses"
        :loading="responsesLoading"
        @refresh="loadResponses"
        @delete="removeResponse"
      />

      <!-- JSON -->
      <template v-else-if="tab === 'json'">
        <section class="sv-card sve-json-card">
          <p class="sve-json-note">
            Тот же опрос текстом. Можно поправить руками или заменить целиком тем, что собрал ИИ.
            <b>id не трогай</b> — по ним держатся уже собранные ответы; у новых вопросов id не нужен.
          </p>
          <textarea v-model="jsonText" class="sv-input sve-json" spellcheck="false" rows="20" />
          <div v-if="jsonError" class="sv-error">{{ jsonError }}</div>
          <div class="sve-json-actions">
            <button class="sv-btn is-primary" :disabled="saving" @click="applyJson">
              {{ saving ? "Сохраняю…" : "Применить и сохранить" }}
            </button>
            <button class="sv-btn" @click="openJson">Сбросить</button>
            <button class="sv-btn" @click="copyJson">Копировать</button>
            <button class="sv-btn is-ghost" @click="copyInstruction">📋 Инструкция для ИИ</button>
          </div>
          <p v-if="dirty" class="sv-muted sve-json-note">
            В конструкторе есть несохранённые правки — они уже здесь.
          </p>
        </section>
      </template>

      <!-- Ещё -->
      <template v-else>
        <section class="sv-card sve-more">
          <div class="sve-more-row">
            <div>
              <b>{{ survey.closed ? "Опрос закрыт" : "Опрос принимает ответы" }}</b>
              <p class="sv-muted">
                {{ survey.closed
                  ? "По ссылке видно, что опрос закрыт. Собранные ответы на месте."
                  : "Закрой, когда ответы больше не нужны: собранные останутся." }}
              </p>
            </div>
            <button class="sv-btn" @click="toggleClosed">{{ survey.closed ? "Открыть" : "Закрыть" }}</button>
          </div>
          <div class="sve-more-row">
            <div>
              <b>Новая ссылка</b>
              <p class="sv-muted">Старая перестанет открываться. Ответы останутся.</p>
            </div>
            <button v-if="!confirmToken" class="sv-btn" @click="confirmToken = true">Заменить</button>
            <span v-else class="sve-confirm">
              <button class="sv-btn is-danger" @click="newLink">Да, заменить</button>
              <button class="sv-btn" @click="confirmToken = false">Нет</button>
            </span>
          </div>
          <div class="sve-more-row">
            <div>
              <b>Удалить опрос</b>
              <p class="sv-muted">
                Вместе с ответами: {{ plural(responses.length, "человек", "человека", "человек") }}.
              </p>
            </div>
            <button v-if="!confirmDelete" class="sv-btn is-danger" @click="confirmDelete = true">Удалить</button>
            <span v-else class="sve-confirm">
              <button class="sv-btn is-danger" @click="removeSurvey">Да, удалить</button>
              <button class="sv-btn" @click="confirmDelete = false">Нет</button>
            </span>
          </div>
        </section>
      </template>

      <!-- Несохранённое — полоса снизу, над меню телефона. -->
      <div v-if="(dirty || saveError) && tab === 'questions'" class="sve-savebar">
        <div v-if="saveError" class="sv-error sve-save-error">{{ saveError }}</div>
        <div class="sve-savebar-row">
          <span class="sv-muted">Есть несохранённые изменения</span>
          <button class="sv-btn is-primary" :disabled="saving" @click="save">
            {{ saving ? "Сохраняю…" : "Сохранить" }}
          </button>
        </div>
      </div>
    </template>

    <!-- Предпросмотр: тот же экран, что увидит человек по ссылке. -->
    <div v-if="previewOpen" class="sv-scope sve-preview">
      <SurveyRunner
        v-model="previewAnswers"
        :definition="previewDefinition"
        :start="0"
        preview
        @close="previewOpen = false"
        @submit="previewOpen = false; flash('Это был предпросмотр — ответы никуда не ушли')"
      />
    </div>

    <Transition name="sve-fade">
      <div v-if="toast" class="sve-toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.sve {
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 14px 14px 120px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: transparent;
}
.sve-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sve-pill {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(95, 208, 138, 0.14);
  color: var(--sv-ok);
}
.sve-pill.is-closed {
  background: var(--sv-card-2);
  color: var(--sv-muted);
}
.sve-empty {
  color: var(--sv-muted);
  text-align: center;
  padding: 24px 0;
}
.sve-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
  word-break: break-word;
}
.sve-share {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sve-share-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sve-link {
  font-size: 14px;
  color: var(--sv-dim);
  min-height: 38px;
  padding: 8px 12px;
}
.sve-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: var(--sv-card);
  border: 1px solid var(--sv-line);
  overflow-x: auto;
  scrollbar-width: none;
}
.sve-tabs button {
  flex: 1;
  min-height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--sv-dim);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.sve-tabs button.is-on {
  background: var(--sv-card-2);
  color: var(--sv-text);
}
.sve-tabs span {
  margin-left: 4px;
  font-size: 12px;
  color: var(--sv-muted);
}
.sve-tabs span.is-hot {
  color: var(--sv-accent);
  font-weight: 700;
}
.sve-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sve-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sve-title-input {
  font-size: 18px;
  font-weight: 600;
}
.sve-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  border: 1px dashed var(--sv-line);
}
.sve-section-head {
  display: flex;
  gap: 8px;
  align-items: center;
}
.sve-section-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--sv-accent);
  background: transparent;
}
.sve-section-tools {
  display: flex;
  gap: 4px;
}
.sve-section-desc {
  font-size: 14px;
}
.sve-add {
  align-self: flex-start;
}
.sve-add-section {
  align-self: center;
}
.sve-json-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sve-json-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sv-dim);
}
.sve-json {
  font-family: ui-monospace, "Cascadia Code", Menlo, monospace;
  font-size: 13px;
  min-height: 360px;
  field-sizing: fixed;
  white-space: pre;
  overflow: auto;
}
.sve-json-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sve-more {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sve-more-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sv-line);
}
.sve-more-row:last-child {
  border-bottom: 0;
}
.sve-more-row p {
  margin: 3px 0 0;
  font-size: 13px;
  line-height: 1.4;
}
.sve-confirm {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Полоса сохранения висит внизу экрана, над нижним меню телефона: его
   высоту объявляет обёртка приложения (--tabbar-h), без меню там ноль.
   fixed, а не sticky: у body overflow-x: hidden, и sticky не прилипает. */
.sve-savebar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  width: min(792px, calc(100vw - 28px));
  bottom: calc(10px + var(--tabbar-h, 0px));
  z-index: 65;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid var(--sv-accent);
  background: rgba(28, 30, 39, 0.96);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}
.sve-savebar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sve-savebar-row .sv-muted {
  font-size: 14px;
}
.sve-save-error {
  max-height: 30vh;
  overflow-y: auto;
}

.sve-preview {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  background: var(--sv-bg);
}

.sve-toast {
  position: fixed;
  left: 50%;
  bottom: calc(84px + var(--tabbar-h, 0px));
  transform: translateX(-50%);
  z-index: 120;
  padding: 10px 16px;
  border-radius: 12px;
  background: #2b2f3c;
  color: var(--sv-text);
  font-size: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  max-width: calc(100vw - 32px);
}
.sve-fade-enter-active,
.sve-fade-leave-active {
  transition: opacity 0.2s;
}
.sve-fade-enter-from,
.sve-fade-leave-to {
  opacity: 0;
}

@media (max-width: 520px) {
  .sve-share-row .sv-btn {
    flex: 1 1 auto;
  }
  .sve-more-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
