<script setup>
import { computed, ref, watch } from "vue";
import {
  createHubLink,
  deleteHubFile,
  deleteHubLink,
  deleteHubNode,
  fetchHubTargets,
  formatSize,
  HUB_KIND_ICON,
  HUB_KINDS,
  HUB_STATUSES,
  percent,
  updateHubFile,
  updateHubNode,
  uploadHubFiles,
} from "@/components/hubApi.js";

// Панель узла: всё, что можно сделать с темой, учебником или главой.
// Правки уходят сами — через паузу после набора, как в карточках «Сегодня».

const props = defineProps({
  node: { type: Object, required: true },
});
const emit = defineEmits(["changed", "close", "open-file", "open-link", "deleted"]);

const title = ref("");
const emoji = ref("");
const description = ref("");
const error = ref("");
const busy = ref(false);
let saveTimer = null;

// Состояние выбора связи — здесь, до watch ниже: тот срабатывает сразу
// (immediate) и сбрасывает эти поля, а const до своей строки недоступна.
const pickerOpen = ref(false);
const linkQuery = ref("");
const targets = ref([]);
const urlDraft = ref("");
let searchTimer = null;

watch(
  () => props.node.id,
  () => {
    title.value = props.node.title;
    emoji.value = props.node.emoji;
    description.value = props.node.description;
    error.value = "";
    linkQuery.value = "";
    targets.value = [];
    pickerOpen.value = false;
  },
  { immediate: true },
);

// Сохраняем только настоящую правку: смена узла тоже переписывает поля, и
// флаг «пропусти следующее» терялся, когда поля у двух узлов совпадали.
watch([title, emoji, description], () => {
  const n = props.node;
  if (title.value === n.title && emoji.value === n.emoji && description.value === n.description) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveText, 700);
});

async function patch(body) {
  error.value = "";
  try {
    await updateHubNode(props.node.id, body);
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

function saveText() {
  if (!title.value.trim()) {
    error.value = "без названия не сохранится";
    return;
  }
  patch({ title: title.value.trim(), emoji: emoji.value.trim(), description: description.value });
}

const kindOptions = computed(() => (props.node.kind === "plan" ? [] : HUB_KINDS));

// --- Файлы ---

const fileInput = ref(null);
const dropping = ref(false);

async function upload(files) {
  if (!files.length) return;
  busy.value = true;
  error.value = "";
  try {
    await uploadHubFiles(props.node.id, files);
    emit("changed");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
    if (fileInput.value) fileInput.value.value = "";
  }
}

function onDrop(event) {
  dropping.value = false;
  upload([...(event.dataTransfer?.files || [])]);
}

async function renameFile(file) {
  const next = prompt("Подпись файла", file.title || file.filename);
  if (next == null) return;
  try {
    await updateHubFile(file.id, { title: next });
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

async function removeFile(file) {
  if (!confirm(`Удалить «${file.title || file.filename}» вместе с сохранённым прогрессом?`)) return;
  try {
    await deleteHubFile(file.id);
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

// --- Ссылки ---


const TARGET_LABEL = {
  section: "раздел",
  pdf: "книга",
  roadmap_item: "roadmap",
  learning_skill: "навык",
  task: "задача",
};

watch(linkQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(search, 250);
});

async function search() {
  try {
    targets.value = await fetchHubTargets(linkQuery.value);
  } catch (e) {
    error.value = e.message;
  }
}

function openPicker() {
  pickerOpen.value = !pickerOpen.value;
  if (pickerOpen.value && !targets.value.length) search();
}

async function attach(target) {
  try {
    await createHubLink(props.node.id, { kind: target.kind, targetId: target.id });
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

async function attachUrl() {
  const url = urlDraft.value.trim();
  if (!url) return;
  try {
    await createHubLink(props.node.id, { kind: "url", url });
    urlDraft.value = "";
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

async function removeLink(link) {
  try {
    await deleteHubLink(link.id);
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

async function removeNode() {
  const what = props.node.kind === "plan" ? "план целиком со всем содержимым" : `«${props.node.title}» со всем, что внутри`;
  if (!confirm(`Удалить ${what}? Книги библиотеки останутся.`)) return;
  try {
    await deleteHubNode(props.node.id);
    emit("deleted", props.node);
  } catch (e) {
    error.value = e.message;
  }
}

function lastOpened(file) {
  if (!file.lastOpenedAt) return "ещё не открывался";
  const d = new Date(file.lastOpenedAt);
  return `открыт ${file.openCount} раз · ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
}
</script>

<template>
  <aside class="hnd" @dragover.prevent="dropping = true" @dragleave.self="dropping = false" @drop.prevent="onDrop">
    <div class="hnd-bar">
      <span class="hnd-kind">{{ HUB_KIND_ICON[node.kind] }} {{ HUB_KINDS.find((k) => k.key === node.kind)?.label || "План" }}</span>
      <button class="hnd-x" title="Закрыть" @click="emit('close')">✕</button>
    </div>

    <div class="hnd-body">
      <div class="hnd-row">
        <input v-model="emoji" class="hnd-input hnd-emoji" maxlength="4" :placeholder="HUB_KIND_ICON[node.kind]" />
        <input v-model="title" class="hnd-input hnd-title" placeholder="Название" />
      </div>

      <div v-if="node.leavesAll" class="hnd-progress">
        <div class="hnd-bar-track"><i :style="{ width: percent(node.progress) + '%' }" /></div>
        <span>{{ node.leavesDone }}/{{ node.leavesAll }}</span>
      </div>

      <div class="hnd-label">Статус</div>
      <div class="hnd-seg">
        <button
          v-for="s in HUB_STATUSES"
          :key="s.key"
          :class="{ on: node.status === s.key }"
          @click="patch({ status: s.key })"
        >
          {{ s.mark }} {{ s.label }}
        </button>
      </div>

      <template v-if="kindOptions.length">
        <div class="hnd-label">Что это</div>
        <div class="hnd-seg">
          <button
            v-for="k in kindOptions"
            :key="k.key"
            :class="{ on: node.kind === k.key }"
            @click="patch({ kind: k.key })"
          >
            {{ k.icon }} {{ k.label }}
          </button>
        </div>
      </template>

      <label v-if="node.kind === 'stage'" class="hnd-goal">
        <input type="checkbox" :checked="node.isGoal" @change="patch({ isGoal: $event.target.checked })" />
        🏁 Это цель плана — конечная точка пути
      </label>

      <label class="hnd-label">
        Описание, что знать, заметки
        <textarea v-model="description" class="hnd-input" rows="5" placeholder="Темы урока, что повторить, где споткнулся" />
      </label>

      <!-- Файлы: артефакты, сканы, картинки -->
      <div class="hnd-section">
        <div class="hnd-section-head">
          <span>Файлы и артефакты</span>
          <button class="hnd-mini" :disabled="busy" @click="fileInput?.click()">
            {{ busy ? "загружаю…" : "＋ файл" }}
          </button>
          <input ref="fileInput" type="file" multiple hidden @change="upload([...$event.target.files])" />
        </div>
        <div class="hnd-drop" :class="{ on: dropping }">
          Перетащи сюда HTML-артефакт, PDF или картинку. PDF ляжет в библиотеку и прицепится ссылкой.
        </div>
        <div v-for="f in node.files" :key="f.id" class="hnd-file">
          <button class="hnd-file-open" @click="emit('open-file', f)">
            <span class="hnd-file-icon">{{ f.kind === "artifact" ? "▶" : f.kind === "image" ? "🖼" : "📎" }}</span>
            <span class="hnd-file-text">
              <span class="hnd-file-title">{{ f.title || f.filename }}</span>
              <span class="hnd-file-meta">{{ formatSize(f.size) }} · {{ lastOpened(f) }}</span>
            </span>
          </button>
          <button class="hnd-icon-btn" title="Переименовать" @click="renameFile(f)">✎</button>
          <button class="hnd-icon-btn" title="Удалить" @click="removeFile(f)">🗑</button>
        </div>
      </div>

      <!-- Связи с остальным сайтом -->
      <div class="hnd-section">
        <div class="hnd-section-head">
          <span>Связано</span>
          <button class="hnd-mini" @click="openPicker">{{ pickerOpen ? "готово" : "＋ привязать" }}</button>
        </div>
        <div v-for="l in node.links" :key="l.id" class="hnd-file">
          <button class="hnd-file-open" @click="emit('open-link', l)">
            <span class="hnd-file-icon">{{ l.kind === "pdf" ? "📕" : l.kind === "url" ? "🔗" : "↗" }}</span>
            <span class="hnd-file-text">
              <span class="hnd-file-title">{{ l.title }}</span>
              <span class="hnd-file-meta">
                {{ TARGET_LABEL[l.kind] || "ссылка" }}
                <template v-if="l.kind === 'pdf' || l.kind === 'roadmap_item'"> · {{ percent(l.progress) }}%</template>
                <template v-if="l.missing"> · удалено</template>
              </span>
            </span>
          </button>
          <button class="hnd-icon-btn" title="Отвязать" @click="removeLink(l)">✕</button>
        </div>

        <div v-if="pickerOpen" class="hnd-picker">
          <input v-model="linkQuery" class="hnd-input" placeholder="Книга, раздел, навык, задача…" autofocus />
          <div class="hnd-targets">
            <button v-for="t in targets" :key="t.kind + t.id" class="hnd-target" @click="attach(t)">
              <span class="hnd-target-kind">{{ TARGET_LABEL[t.kind] }}</span>
              <span class="hnd-target-title">{{ t.title }}</span>
            </button>
            <div v-if="!targets.length" class="hnd-dim">ничего не нашлось</div>
          </div>
          <div class="hnd-row">
            <input v-model="urlDraft" class="hnd-input" placeholder="или адрес https://…" @keydown.enter.prevent="attachUrl" />
            <button class="hnd-mini" @click="attachUrl">ок</button>
          </div>
        </div>
      </div>

      <div v-if="error" class="hnd-error">{{ error }}</div>

      <button class="hnd-delete" @click="removeNode">Удалить {{ node.kind === "plan" ? "план" : "узел" }}</button>
    </div>
  </aside>
</template>

<style scoped>
.hnd {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1119;
  border-left: 1px solid #22263a;
  color: #e9ecf8;
}

.hnd-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #1e2233;
  flex-shrink: 0;
}

.hnd-kind {
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #8b91aa;
}

.hnd-x {
  background: #1a1d2c;
  border: 1px solid #2c3146;
  color: #cfd3e6;
  border-radius: 9px;
  width: 34px;
  height: 34px;
  cursor: pointer;
}

.hnd-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 40px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hnd-row {
  display: flex;
  gap: 8px;
}

.hnd-input {
  width: 100%;
  box-sizing: border-box;
  background: #0a0c14;
  border: 1px solid #262b40;
  border-radius: 10px;
  color: #eef0f8;
  font-size: 14.5px;
  padding: 9px 11px;
  outline: none;
  font-family: inherit;
}

.hnd-input:focus {
  border-color: #8b7cff;
}

.hnd-emoji {
  width: 54px;
  flex-shrink: 0;
  text-align: center;
  font-size: 19px;
  padding: 6px;
}

.hnd-title {
  font-size: 16px;
  font-weight: 600;
}

.hnd-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: #8b91aa;
}

.hnd-bar-track {
  flex: 1;
  height: 6px;
  border-radius: 4px;
  background: #1b1e2c;
  overflow: hidden;
}

.hnd-bar-track i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #6d5bff, #34d399);
}

.hnd-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #8b91aa;
}

.hnd-seg {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hnd-seg button {
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid #262b40;
  background: #141726;
  color: #cfd3e6;
  font-size: 13px;
  cursor: pointer;
}

.hnd-seg button.on {
  border-color: #8b7cff;
  background: #1e1d3d;
  color: #fff;
}

.hnd-goal {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: #ffd68a;
  cursor: pointer;
}

.hnd-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  background: #121522;
  border: 1px solid #1f2335;
}

.hnd-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #b7bdd6;
}

.hnd-mini {
  padding: 6px 11px;
  border-radius: 9px;
  border: 1px solid #2c3146;
  background: #1a1d2c;
  color: #dfe3f4;
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
}

.hnd-mini:disabled {
  opacity: 0.6;
}

.hnd-drop {
  border: 1px dashed #2f3550;
  border-radius: 10px;
  padding: 10px;
  font-size: 12px;
  color: #6f7590;
  text-align: center;
}

.hnd-drop.on {
  border-color: #38bdf8;
  color: #9fdcf7;
  background: rgba(56, 189, 248, 0.06);
}

.hnd-file {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hnd-file-open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #23283c;
  background: #0d0f19;
  color: #e9ecf8;
  cursor: pointer;
}

.hnd-file-open:hover {
  border-color: #8b7cff;
}

.hnd-file-icon {
  font-size: 15px;
  flex-shrink: 0;
}

.hnd-file-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.hnd-file-title {
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hnd-file-meta {
  font-size: 11.5px;
  color: #6f7590;
}

.hnd-icon-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: #6f7590;
  cursor: pointer;
}

.hnd-icon-btn:hover {
  color: #e9ecf8;
  background: #1a1d2c;
}

.hnd-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hnd-targets {
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hnd-target {
  display: flex;
  align-items: baseline;
  gap: 8px;
  text-align: left;
  padding: 7px 9px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: #0d0f19;
  color: #e9ecf8;
  cursor: pointer;
}

.hnd-target:hover {
  border-color: #8b7cff;
}

.hnd-target-kind {
  flex-shrink: 0;
  font-size: 11px;
  color: #8b91aa;
  min-width: 62px;
}

.hnd-target-title {
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hnd-dim {
  font-size: 12px;
  color: #6f7590;
  padding: 4px;
}

.hnd-error {
  color: #ffb3b8;
  background: #2a1418;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
}

@media (max-width: 900px) {
  .hnd {
    border-left: 0;
  }

  .hnd-bar {
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
  }

  .hnd-body {
    padding-bottom: calc(40px + env(safe-area-inset-bottom, 0px));
  }

  /* меньше 16px — iOS приближает страницу при фокусе на поле */
  .hnd-input {
    font-size: 16px;
  }

  .hnd-icon-btn {
    width: 40px;
    height: 40px;
  }
}

.hnd-delete {
  align-self: flex-start;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #4a2530;
  background: transparent;
  color: #ff9ba0;
  font-size: 13px;
  cursor: pointer;
}
</style>
