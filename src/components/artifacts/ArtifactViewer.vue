<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  fetchArtifactContent,
  fetchArtifactState,
  markArtifactOpened,
  resetArtifactState,
  saveArtifactState,
} from "@/components/artifactsApi.js";
import { buildArtifactDoc, HUB_SANDBOX } from "@/components/hub/artifactSandbox.js";

// Артефакт на весь экран. Песочница та же, что у хаба: localStorage
// артефакта подменён и о каждой записи сообщает сюда. Прогресс общий у всех
// версий, поэтому смена версии меняет только HTML.
//
// Запись идёт с ревизией, от которой начинали. Если на другом устройстве
// прогресс успел уйти вперёд, сервер отвечает 409, и выбор — чей оставить —
// за человеком: молча затереть любой из двух нельзя.

const props = defineProps({
  artifact: { type: Object, required: true },
  version: { type: Number, required: true },
});
const emit = defineEmits(["close", "version"]);

const frame = ref(null);
const doc = ref("");
const error = ref("");
const selected = ref(props.version);
const saveState = ref(""); // "" | "saving" | "saved" | "error"
const savedAt = ref(null);
const ignored = ref([]);
// conflict — ревизия на сервере новее нашей; пока человек не выбрал, не пишем.
const conflict = ref(null);

const channel = `art-${props.artifact.id}-${Math.random().toString(36).slice(2)}`;
let revision = 0;
let pending = null;
let saveTimer = null;
let inFlight = null;

async function load() {
  doc.value = "";
  error.value = "";
  conflict.value = null;
  pending = null;
  try {
    const [html, state] = await Promise.all([
      fetchArtifactContent(props.artifact.id, selected.value),
      fetchArtifactState(props.artifact.id),
    ]);
    revision = state.revision;
    savedAt.value = state.updatedAt ? new Date(state.updatedAt) : null;
    doc.value = buildArtifactDoc(html, channel, state.data || {});
    markArtifactOpened(props.artifact.id).catch(() => {});
  } catch (e) {
    error.value = e.message;
  }
}

// Сообщение принимаем только от своего iframe и своего канала.
function onMessage(event) {
  if (!frame.value || event.source !== frame.value.contentWindow) return;
  const msg = event.data;
  if (!msg || msg.hubArtifact !== channel || msg.type !== "state") return;
  if (!msg.data || typeof msg.data !== "object") return;
  pending = msg.data;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(push, 600);
}

function push() {
  if (inFlight) return inFlight;
  if (!pending || conflict.value) return Promise.resolve();
  const data = pending;
  pending = null;
  saveState.value = "saving";
  inFlight = saveArtifactState(props.artifact.id, data, revision)
    .then((res) => {
      revision = res.revision;
      savedAt.value = res.updatedAt ? new Date(res.updatedAt) : savedAt.value;
      ignored.value = res.ignored || [];
      saveState.value = "saved";
    })
    .catch((e) => {
      pending = pending || data;
      if (e.status === 409) {
        conflict.value = e.body;
        saveState.value = "";
        return;
      }
      saveState.value = "error";
      error.value = e.message;
    })
    .finally(() => {
      inFlight = null;
      if (pending && !conflict.value && saveState.value !== "error") push();
    });
  return inFlight;
}

// Просим артефакт отдать состояние сейчас, а не через паузу, и дожидаемся записи.
function flush() {
  try {
    frame.value?.contentWindow?.postMessage({ hubArtifact: channel, type: "flush" }, "*");
  } catch {
    /* фрейм уже ушёл */
  }
  return new Promise((resolve) => setTimeout(resolve, 120)).then(() => {
    clearTimeout(saveTimer);
    return push();
  });
}

async function close() {
  if (conflict.value && !confirm("Прогресс с экрана не сохранён: на другом устройстве он новее. Закрыть без сохранения?")) return;
  await flush();
  emit("close");
}

async function switchVersion() {
  await flush();
  emit("version", selected.value);
  load();
}

function keepMine() {
  revision = conflict.value.revision;
  conflict.value = null;
  push();
}

function takeTheirs() {
  load();
}

// Вкладка вернулась на экран: за это время прогресс могли записать с
// другого устройства — спросить сразу, а не после десятка ответов.
async function onVisibility() {
  if (document.hidden) {
    flush();
    return;
  }
  if (conflict.value || !doc.value) return;
  try {
    const state = await fetchArtifactState(props.artifact.id);
    if (state.revision !== revision && !inFlight) conflict.value = state;
  } catch {
    /* сеть вернётся — проверим при записи */
  }
}

async function reset() {
  if (!confirm("Сбросить прогресс этого артефакта? Он общий у всех версий и начнётся с чистого листа.")) return;
  try {
    await resetArtifactState(props.artifact.id);
    savedAt.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

function onKey(event) {
  if (event.key === "Escape") close();
}

onMounted(() => {
  window.addEventListener("message", onMessage);
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);
  load();
});

onBeforeUnmount(() => {
  window.removeEventListener("message", onMessage);
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("visibilitychange", onVisibility);
  clearTimeout(saveTimer);
  push();
});

function timeLabel(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div class="av">
    <div class="av-bar">
      <button class="av-btn" title="Закрыть · Esc" @click="close">✕</button>
      <div class="av-title">{{ artifact.title }}</div>
      <select
        v-if="artifact.versions.length > 1"
        v-model.number="selected"
        class="av-version"
        title="Версия: вид разный, прогресс один"
        @change="switchVersion"
      >
        <option v-for="v in [...artifact.versions].reverse()" :key="v.number" :value="v.number">
          v{{ v.number }}{{ v.number === artifact.latestVersion ? " · последняя" : "" }}
        </option>
      </select>
      <div class="av-save" :class="saveState">
        <span class="av-save-full">
          <template v-if="saveState === 'saving'">сохраняю…</template>
          <template v-else-if="saveState === 'error'">не сохранилось</template>
          <template v-else-if="savedAt">прогресс сохранён · {{ timeLabel(savedAt) }}</template>
          <template v-else>прогресс сохранится сам</template>
        </span>
        <span class="av-save-short">
          {{ saveState === "saving" ? "…" : saveState === "error" ? "⚠" : savedAt ? "✓" : "" }}
        </span>
      </div>
      <button class="av-btn" title="Начать артефакт заново" @click="reset">↺</button>
    </div>

    <div v-if="conflict" class="av-conflict">
      <span>
        На другом устройстве прогресс новее<template v-if="conflict.updatedAt">
          ({{ timeLabel(conflict.updatedAt) }})</template
        >. Какой оставить?
      </span>
      <span class="av-conflict-actions">
        <button class="av-btn av-btn-text" @click="takeTheirs">Тот, новее</button>
        <button class="av-btn av-btn-text" @click="keepMine">Этот, с экрана</button>
      </span>
    </div>
    <div v-if="ignored.length" class="av-warn">
      Артефакт пишет ключи вне своего договора: {{ ignored.join(", ") }}. Они не сохраняются.
    </div>
    <div v-if="error" class="av-error">{{ error }}</div>

    <iframe
      v-if="doc"
      ref="frame"
      class="av-frame"
      :srcdoc="doc"
      :sandbox="HUB_SANDBOX"
      referrerpolicy="no-referrer"
      allow="autoplay; microphone; clipboard-write"
    />
    <div v-else-if="!error" class="av-loading">Открываю…</div>
  </div>
</template>

<style scoped>
.av {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  background: #0b0d14;
}

.av-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  background: #11131c;
  border-bottom: 1px solid #23273a;
  flex-shrink: 0;
}

.av-btn {
  background: #1b1e2b;
  border: 1px solid #2c3146;
  color: #d7dbea;
  border-radius: 9px;
  min-width: 36px;
  height: 36px;
  font-size: 15px;
  cursor: pointer;
}

.av-btn:hover {
  border-color: #8b7cff;
}

.av-btn-text {
  padding: 0 12px;
  font-size: 13px;
}

.av-title {
  flex: 1;
  min-width: 0;
  color: #eef0f8;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.av-version {
  height: 36px;
  background: #1b1e2b;
  border: 1px solid #2c3146;
  color: #d7dbea;
  border-radius: 9px;
  padding: 0 8px;
  font-size: 13px;
}

.av-save {
  color: #7d8399;
  font-size: 12px;
  white-space: nowrap;
}

.av-save.saved {
  color: #8fd8a0;
}

.av-save.error {
  color: #ff9ba0;
}

.av-conflict,
.av-warn,
.av-error {
  padding: 8px 14px;
  font-size: 13px;
  line-height: 1.4;
}

.av-conflict {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #ffe2a8;
  background: #2a2312;
}

.av-conflict-actions {
  display: flex;
  gap: 8px;
}

.av-warn {
  color: #ffe2a8;
  background: #221d10;
}

.av-error {
  color: #ff9ba0;
  background: #2a1418;
}

.av-frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}

.av-loading {
  flex: 1;
  display: grid;
  place-items: center;
  color: #7d8399;
}

/* Телефон: подпись сохранения — значком, но не прячется: иначе не видно,
   дошёл ли прогресс. */
.av-save-short {
  display: none;
}

@media (max-width: 640px) {
  .av-save-full {
    display: none;
  }

  .av-save-short {
    display: inline;
    font-size: 14px;
  }
}
</style>
