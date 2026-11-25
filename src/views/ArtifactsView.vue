<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ARTIFACT_STANDARD_URL,
  contractId,
  deleteArtifact,
  fetchArtifact,
  fetchArtifacts,
  fetchArtifactStandard,
  uploadArtifact,
} from "@/components/artifactsApi.js";
import { copyText } from "@/components/survey/clipboard.js";
import MarkdownView from "@/components/workspace/MarkdownView.vue";
import ArtifactViewer from "@/components/artifacts/ArtifactViewer.vue";

// Раздел «Артефакты»: HTML от любого ИИ по стандарту сайта. Артефакт
// открывается как есть, его прогресс живёт в базе сайта и общий у всех
// версий. Стандарт — back-m application/services/artifact_standard.md.

const AUTHORS = ["claude", "chatgpt", "gemini", "deepseek"];

const route = useRoute();
const router = useRouter();

const list = ref([]);
const loading = ref(true);
const error = ref("");
const toast = ref("");

const standardOpen = ref(false);
const standard = ref("");

const uploadOpen = ref(false);
const upload = ref({ file: null, id: null, author: "", note: "" });
const uploadError = ref("");
const busy = ref(false);

const opened = ref(null);

const target = computed(() => list.value.find((a) => a.slug === upload.value.id) || null);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    list.value = (await fetchArtifacts()) || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function toggleStandard() {
  standardOpen.value = !standardOpen.value;
  if (!standardOpen.value || standard.value) return;
  try {
    standard.value = await fetchArtifactStandard();
  } catch (e) {
    error.value = e.message;
  }
}

async function copyStandard() {
  const text = standard.value || (await fetchArtifactStandard());
  flash((await copyText(text)) ? "Стандарт скопирован — отдай его ИИ вместе с задачей" : "Не удалось скопировать");
}

async function copyStandardLink() {
  flash((await copyText(ARTIFACT_STANDARD_URL)) ? "Ссылка на стандарт скопирована" : "Не удалось скопировать");
}

function openUpload() {
  uploadOpen.value = true;
  uploadError.value = "";
  upload.value = { file: null, id: null, author: "", note: "" };
}

async function pickFile(event) {
  const file = event.target.files?.[0];
  uploadError.value = "";
  upload.value.file = file || null;
  upload.value.id = file ? contractId(await file.text()) : null;
  if (file && !upload.value.id) {
    uploadError.value =
      "В файле нет договора artifact-contract — он сделан не по стандарту. Отдай ИИ стандарт и попроси переделать.";
  }
}

async function send() {
  const { file, author, note } = upload.value;
  if (!file || !upload.value.id) return;
  busy.value = true;
  uploadError.value = "";
  try {
    const res = await uploadArtifact({ file, author, note, artifactId: target.value?.id });
    uploadOpen.value = false;
    flash(
      res.repeated
        ? `Этот файл уже загружен — v${res.version.number}`
        : res.version.number === 0
          ? `«${res.artifact.title}» зарегистрирован, хранение заморожено`
          : `Загружена версия v${res.version.number}`,
    );
    await load();
  } catch (e) {
    uploadError.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function remove(a) {
  const text = `Удалить «${a.title}» со всеми версиями и прогрессом? Вернуть будет нельзя.`;
  if (!confirm(text)) return;
  try {
    await deleteArtifact(a.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

// Артефакт открыт, если в адресе его id: так его можно открыть ссылкой и
// закрыть кнопкой «назад» на телефоне.
async function syncOpened() {
  const id = route.params.id;
  if (!id) {
    opened.value = null;
    return;
  }
  if (opened.value?.id === id) return;
  try {
    opened.value = await fetchArtifact(id);
  } catch (e) {
    error.value = e.message;
    router.replace("/artifacts");
  }
}

const openedVersion = computed(() => {
  const v = Number(route.query.v);
  const known = opened.value?.versions.some((x) => x.number === v);
  return known ? v : opened.value?.latestVersion;
});

function closeViewer() {
  router.push("/artifacts");
  load();
}

function onVersion(number) {
  router.replace({ query: { v: number } });
}

let toastTimer = 0;
function flash(text) {
  toast.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 2600);
}

function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

watch(() => route.params.id, syncOpened);
onMounted(() => {
  load();
  syncOpened();
});
</script>

<template>
  <div class="arl">
    <div class="arl-head">
      <h1>🧩 Артефакты</h1>
      <div class="arl-head-actions">
        <button class="arl-btn is-primary" @click="openUpload">＋ Загрузить</button>
        <button class="arl-btn" :class="{ 'is-on': standardOpen }" @click="toggleStandard">📜 Стандарт</button>
      </div>
    </div>

    <div v-if="error" class="arl-error">{{ error }}</div>

    <section v-if="standardOpen" class="arl-card arl-standard">
      <div class="arl-row">
        <b>Стандарт для ИИ</b>
        <span class="arl-actions">
          <button class="arl-btn is-small" @click="copyStandard">📋 Скопировать</button>
          <button class="arl-btn is-small" @click="copyStandardLink">🔗 Ссылка</button>
        </span>
      </div>
      <p class="arl-muted">
        Claude с коннектором сайта читает его сам. ChatGPT и другим — скопируй и отдай вместе с задачей.
      </p>
      <MarkdownView v-if="standard" :text="standard" class="arl-md" />
      <div v-else class="arl-muted">Загружаю…</div>
    </section>

    <section v-if="uploadOpen" class="arl-card arl-upload">
      <div class="arl-row">
        <b>Загрузить артефакт</b>
        <button class="arl-btn is-small is-ghost" @click="uploadOpen = false">✕</button>
      </div>
      <input type="file" accept=".html,.htm,text/html" class="arl-file" @change="pickFile" />
      <div v-if="upload.id" class="arl-target">
        <template v-if="target">
          Новая версия «{{ target.title }}» — сейчас v0–v{{ target.latestVersion }}. Прогресс останется общим.
        </template>
        <template v-else>Новый артефакт <code>{{ upload.id }}</code>: после загрузки формат хранения заморожен.</template>
      </div>
      <label class="arl-field">
        <span>Кто сделал</span>
        <input v-model="upload.author" class="arl-input" list="arl-authors" placeholder="claude, chatgpt…" />
        <datalist id="arl-authors">
          <option v-for="a in AUTHORS" :key="a" :value="a" />
        </datalist>
      </label>
      <label class="arl-field">
        <span>{{ target ? "Что изменилось" : "Пометка" }}</span>
        <input
          v-model="upload.note"
          class="arl-input"
          :placeholder="target ? 'вёрстка под телефон' : 'необязательно'"
        />
      </label>
      <div v-if="uploadError" class="arl-error">{{ uploadError }}</div>
      <div class="arl-actions">
        <button
          class="arl-btn is-primary"
          :disabled="busy || !upload.id || (target && !upload.note.trim())"
          @click="send"
        >
          {{ busy ? "Загружаю…" : target ? "Загрузить версию" : "Зарегистрировать" }}
        </button>
      </div>
    </section>

    <div v-if="loading" class="arl-empty">Загружаю…</div>
    <template v-else>
      <div v-if="!list.length && !uploadOpen" class="arl-card arl-hello">
        <div class="arl-hello-emoji">🧩</div>
        <b>Артефактов пока нет</b>
        <p class="arl-muted">
          Попроси ИИ сделать тренажёр по стандарту сайта. Claude с коннектором загрузит его сам, остальное —
          кнопкой «Загрузить». Прогресс будет храниться здесь, на любом устройстве.
        </p>
        <button class="arl-btn" @click="toggleStandard">📜 Открыть стандарт</button>
      </div>

      <section
        v-for="a in list"
        :key="a.id"
        class="arl-card arl-item"
        role="link"
        tabindex="0"
        @click="router.push(`/artifacts/${a.id}`)"
        @keyup.enter="router.push(`/artifacts/${a.id}`)"
      >
        <div class="arl-row">
          <span class="arl-title">{{ a.title }}</span>
          <span class="arl-pill">v{{ a.latestVersion }}</span>
        </div>
        <div class="arl-meta">
          <code>{{ a.slug }}</code>
          <span v-if="a.author">{{ a.author }}</span>
          <span :class="{ 'arl-hot': a.progressAt }">
            {{ a.progressAt ? `прогресс ${when(a.progressAt)}` : "прогресса нет" }}
          </span>
          <span v-if="a.openCount">открыт {{ a.openCount }} раз</span>
        </div>
        <div class="arl-actions" @click.stop>
          <button class="arl-btn is-small is-ghost" title="Удалить" @click="remove(a)">🗑</button>
        </div>
      </section>
    </template>

    <ArtifactViewer
      v-if="opened && openedVersion !== undefined"
      :key="opened.id"
      :artifact="opened"
      :version="openedVersion"
      @close="closeViewer"
      @version="onVersion"
    />

    <Transition name="arl-fade">
      <div v-if="toast" class="arl-toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.arl {
  --arl-card: #1c1e27;
  --arl-card-2: #242733;
  --arl-line: #2c303c;
  --arl-text: #eef0f6;
  --arl-muted: #8a8fa3;
  --arl-accent: #8b7cff;

  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 14px 14px 90px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--arl-text);
  box-sizing: border-box;
}

.arl-head,
.arl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.arl-head h1 {
  margin: 0;
  font-size: 24px;
}

.arl-head-actions,
.arl-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.arl-card {
  border-radius: 16px;
  border: 1px solid var(--arl-line);
  background: var(--arl-card);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.arl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--arl-line);
  background: var(--arl-card-2);
  color: var(--arl-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.arl-btn:hover:not(:disabled),
.arl-btn.is-on {
  border-color: var(--arl-accent);
}

.arl-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.arl-btn.is-primary {
  background: var(--arl-accent);
  border-color: var(--arl-accent);
  color: #fff;
}

.arl-btn.is-small {
  min-height: 32px;
  padding: 0 10px;
  font-size: 13px;
}

.arl-btn.is-ghost {
  background: transparent;
}

.arl-muted,
.arl-empty {
  color: var(--arl-muted);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}

.arl-empty {
  text-align: center;
  padding: 20px 0;
}

.arl-error {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(239, 91, 91, 0.45);
  background: rgba(239, 91, 91, 0.1);
  color: #ffb4b4;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.arl-md {
  max-height: 60vh;
  overflow: auto;
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.arl-md :deep(pre) {
  white-space: pre-wrap;
}

.arl-file {
  color: var(--arl-muted);
  max-width: 100%;
}

.arl-target {
  font-size: 14px;
  line-height: 1.45;
  color: #cfd3ff;
}

.arl-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--arl-muted);
}

.arl-input {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--arl-line);
  background: var(--arl-card-2);
  color: var(--arl-text);
  font: inherit;
  font-size: 14px;
}

.arl-hello {
  align-items: center;
  text-align: center;
  padding: 26px 18px;
}

.arl-hello p {
  max-width: 460px;
}

.arl-hello-emoji {
  font-size: 40px;
}

.arl-item {
  cursor: pointer;
}

.arl-item:hover {
  border-color: #3a3f55;
}

.arl-title {
  font-weight: 600;
  font-size: 16px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.arl-pill {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(139, 124, 255, 0.16);
  color: #cfc8ff;
}

.arl-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 13px;
  color: var(--arl-muted);
}

.arl-meta code,
.arl-target code {
  font-size: 12px;
  color: #b7bbca;
}

.arl-hot {
  color: #8fd8a0;
}

.arl-toast {
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  max-width: calc(100vw - 32px);
  padding: 10px 16px;
  border-radius: 12px;
  background: #2a2d3a;
  color: #fff;
  font-size: 14px;
  z-index: 3100;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
}

.arl-fade-enter-active,
.arl-fade-leave-active {
  transition: opacity 0.2s;
}

.arl-fade-enter-from,
.arl-fade-leave-to {
  opacity: 0;
}
</style>
