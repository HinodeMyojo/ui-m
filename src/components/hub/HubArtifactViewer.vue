<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  fetchHubFileText,
  fetchHubState,
  markHubFileOpened,
  resetHubState,
  saveHubState,
} from "@/components/hubApi.js";
import { buildArtifactDoc, HUB_SANDBOX } from "./artifactSandbox.js";

// Артефакт на весь экран. Прогресс, который он пишет в свой localStorage,
// уезжает на сервер — см. artifactSandbox.js.

const props = defineProps({
  file: { type: Object, required: true },
});
const emit = defineEmits(["close"]);

const frame = ref(null);
const doc = ref("");
const error = ref("");
const saveState = ref(""); // "" | "saving" | "saved" | "error"
const savedAt = ref(null);

const channel = `hub-${props.file.id}-${Math.random().toString(36).slice(2)}`;
let pending = null;
let saveTimer = null;
let inFlight = false;

async function load() {
  try {
    const [html, state] = await Promise.all([
      fetchHubFileText(props.file.id),
      fetchHubState(props.file.id),
    ]);
    doc.value = buildArtifactDoc(html, channel, state?.data || {});
    savedAt.value = state?.updatedAt ? new Date(state.updatedAt) : null;
    markHubFileOpened(props.file.id).catch(() => {});
  } catch (e) {
    error.value = e.message;
  }
}

// Сообщение принимаем только от своего iframe и своего канала: артефакт
// чужой, верить ему на слово про чужие файлы нельзя.
function onMessage(event) {
  if (!frame.value || event.source !== frame.value.contentWindow) return;
  const msg = event.data;
  if (!msg || msg.hubArtifact !== channel || msg.type !== "state") return;
  if (!msg.data || typeof msg.data !== "object") return;
  pending = msg.data;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(push, 600);
}

async function push() {
  if (!pending || inFlight) return;
  const data = pending;
  pending = null;
  inFlight = true;
  saveState.value = "saving";
  try {
    await saveHubState(props.file.id, data);
    saveState.value = "saved";
    savedAt.value = new Date();
  } catch (e) {
    saveState.value = "error";
    error.value = e.message;
    pending = pending || data; // не потерять: уйдёт со следующей записью
  } finally {
    inFlight = false;
    if (pending) push();
  }
}

// Закрывают окно — просим артефакт отдать состояние сейчас, а не через паузу.
function close() {
  try {
    frame.value?.contentWindow?.postMessage({ hubArtifact: channel, type: "flush" }, "*");
  } catch {
    /* фрейм уже ушёл */
  }
  setTimeout(() => {
    clearTimeout(saveTimer);
    push();
    emit("close");
  }, 120);
}

async function reset() {
  if (!confirm("Сбросить прогресс этого артефакта? Он начнётся с чистого листа.")) return;
  try {
    await resetHubState(props.file.id);
    savedAt.value = null;
    pending = null;
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
  load();
});

onBeforeUnmount(() => {
  window.removeEventListener("message", onMessage);
  window.removeEventListener("keydown", onKey);
  clearTimeout(saveTimer);
  push();
});

function timeLabel(d) {
  if (!d) return "";
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div class="hav">
    <div class="hav-bar">
      <button class="hav-btn" title="Закрыть · Esc" @click="close">✕</button>
      <div class="hav-title">{{ file.title || file.filename }}</div>
      <div class="hav-save" :class="saveState">
        <template v-if="saveState === 'saving'">сохраняю…</template>
        <template v-else-if="saveState === 'error'">не сохранилось</template>
        <template v-else-if="savedAt">прогресс сохранён · {{ timeLabel(savedAt) }}</template>
        <template v-else>прогресс сохранится сам</template>
      </div>
      <button class="hav-btn hav-reset" title="Начать артефакт заново" @click="reset">↺</button>
    </div>
    <div v-if="error" class="hav-error">{{ error }}</div>
    <iframe
      v-if="doc"
      ref="frame"
      class="hav-frame"
      :srcdoc="doc"
      :sandbox="HUB_SANDBOX"
      referrerpolicy="no-referrer"
      allow="autoplay; microphone; clipboard-write"
    />
    <div v-else-if="!error" class="hav-loading">Открываю…</div>
  </div>
</template>

<style scoped>
.hav {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  background: #0b0d14;
}

.hav-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  background: #11131c;
  border-bottom: 1px solid #23273a;
  flex-shrink: 0;
}

.hav-btn {
  background: #1b1e2b;
  border: 1px solid #2c3146;
  color: #d7dbea;
  border-radius: 9px;
  min-width: 36px;
  height: 36px;
  font-size: 15px;
  cursor: pointer;
}

.hav-btn:hover {
  border-color: #8b7cff;
}

.hav-title {
  flex: 1;
  min-width: 0;
  color: #eef0f8;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hav-save {
  color: #7d8399;
  font-size: 12px;
  white-space: nowrap;
}

.hav-save.saved {
  color: #8fd8a0;
}

.hav-save.error {
  color: #ff9ba0;
}

.hav-error {
  color: #ff9ba0;
  background: #2a1418;
  padding: 8px 14px;
  font-size: 13px;
}

.hav-frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}

.hav-loading {
  flex: 1;
  display: grid;
  place-items: center;
  color: #7d8399;
}

@media (max-width: 640px) {
  .hav-save {
    display: none;
  }
}
</style>
