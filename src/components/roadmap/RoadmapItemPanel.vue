<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import MarkdownView from "@/components/workspace/MarkdownView.vue";
import { getPdfFiles, linkPdfRoadmapItem } from "@/api/pdfFiles.js";
import {
  percent,
  formatHours,
  statusMeta,
  typeMeta,
  STATUSES,
  CERT_VERDICTS,
  setItemProgress,
  updateItem,
  createTaskForItem,
  createSubItem,
  updateSubItem,
  deleteSubItem,
  fetchSessions,
  createSession,
  deleteSession,
  roadmapToday,
} from "@/components/roadmapApi.js";

// Панель деталей пункта — docs/roadmap-module.md, раздел 5.1.

const props = defineProps({
  item: { type: Object, required: true },
});
const emit = defineEmits(["changed", "edit"]);

const router = useRouter();

// Библиотека для привязки PDF — docs/pdf-library.md
const libraryFiles = ref([]);
const linkedFile = computed(() =>
  libraryFiles.value.find((f) => f.id === props.item.pdfFileId) || null,
);

async function loadLibrary() {
  try {
    libraryFiles.value = await getPdfFiles();
  } catch {
    libraryFiles.value = [];
  }
}

// Привязка живёт в поле пункта, но ставим её через библиотечную ручку: она
// снимает файл с прошлого пункта и подтягивает объём и текущую страницу.
// Отвязка идёт по уже прикреплённому файлу — селект к этому моменту пуст.
function linkPdf(fileId) {
  const targetFile = fileId || props.item.pdfFileId;
  if (!targetFile) return;
  return run(async () => {
    await linkPdfRoadmapItem(targetFile, fileId ? props.item.id : null);
    await loadLibrary();
  });
}

function openReader() {
  if (!props.item.pdfFileId) return;
  router.push({ path: "/pdfReader", query: { file: props.item.pdfFileId } });
}

onMounted(loadLibrary);

const pageDraft = ref("");
const hoursDraft = ref("");
const noteDraft = ref("");
const noteEditing = ref(false);
const subDraft = ref("");
const sessions = ref([]);
const sessionsOpen = ref(false);
const busy = ref(false);
const error = ref("");

watch(
  () => props.item.id,
  () => {
    pageDraft.value = props.item.progressCurrent || "";
    hoursDraft.value = "";
    noteDraft.value = props.item.note || "";
    noteEditing.value = false;
    sessions.value = [];
    sessionsOpen.value = false;
    error.value = "";
  },
  { immediate: true },
);

const status = computed(() => statusMeta(props.item.status));
const type = computed(() => typeMeta(props.item.type));
const certVerdict = computed(() =>
  CERT_VERDICTS.find((v) => v.code === props.item.certVerdict) || null,
);

async function run(action) {
  busy.value = true;
  error.value = "";
  try {
    await action();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

const hoursValue = () => {
  const raw = String(hoursDraft.value).replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

function addPages(delta) {
  return run(async () => {
    await setItemProgress(props.item.id, {
      delta,
      hours: hoursValue(),
      date: roadmapToday(),
    });
    hoursDraft.value = "";
  });
}

function setPages() {
  const parsed = parseInt(pageDraft.value, 10);
  if (!Number.isFinite(parsed)) return;
  return run(async () => {
    await setItemProgress(props.item.id, {
      current: parsed,
      hours: hoursValue(),
      date: roadmapToday(),
    });
    hoursDraft.value = "";
  });
}

function logHoursOnly() {
  const hours = hoursValue();
  if (!hours) return;
  return run(async () => {
    await createSession(props.item.id, { hours, date: roadmapToday() });
    hoursDraft.value = "";
    if (sessionsOpen.value) await loadSessions();
  });
}

function markDone() {
  return run(() => setItemProgress(props.item.id, { done: true, hours: hoursValue(), date: roadmapToday() }));
}

function setStatus(code) {
  return run(() => updateItem(props.item.id, { ...props.item, status: code }));
}

function saveNote() {
  return run(async () => {
    await updateItem(props.item.id, { ...props.item, note: noteDraft.value });
    noteEditing.value = false;
  });
}

function addSubItem() {
  const title = subDraft.value.trim();
  if (!title) return;
  return run(async () => {
    await createSubItem(props.item.id, { title, sortOrder: props.item.subItems.length });
    subDraft.value = "";
  });
}

function toggleSubItem(sub) {
  return run(() =>
    updateSubItem(sub.id, { title: sub.title, done: !sub.done, sortOrder: sub.sortOrder }),
  );
}

function removeSubItem(sub) {
  return run(() => deleteSubItem(sub.id));
}

function makeTask() {
  return run(() => createTaskForItem(props.item.id, true));
}

async function loadSessions() {
  sessions.value = await fetchSessions(props.item.id);
}

async function toggleSessions() {
  sessionsOpen.value = !sessionsOpen.value;
  if (sessionsOpen.value) await loadSessions();
}

function removeSession(session) {
  return run(async () => {
    await deleteSession(session.id);
    await loadSessions();
  });
}

const SOURCE_LABELS = { manual: "вручную", discipline: "дисциплина", pdf: "читалка" };
</script>

<template>
  <div class="rm-panel">
    <div class="rm-row">
      <span class="rm-chip">{{ type.emoji }} {{ type.label }}</span>
      <span class="rm-chip" :style="{ color: status.color, borderColor: status.color }">
        {{ status.label }}
      </span>
      <span class="rm-tier" :class="{ 'is-core': item.tier === 1 }">Э{{ item.tier }}</span>
      <div class="rm-spacer" />
      <button class="rm-btn is-small" @click="emit('edit')">✎</button>
    </div>

    <h2>{{ item.emoji }} {{ item.title }}</h2>
    <div v-if="item.author || item.edition" class="rm-sub">
      {{ [item.author, item.edition].filter(Boolean).join(" · ") }}
    </div>
    <div v-if="item.identifier" class="rm-sub">{{ item.identifier }}</div>
    <a v-if="item.url" class="rm-sub" :href="item.url" target="_blank" rel="noopener">
      {{ item.url }}
    </a>

    <div v-if="error" class="rm-error">{{ error }}</div>

    <div class="rm-panel-section">
      <h4>Прогресс — {{ percent(item.progress) }}</h4>
      <div class="rm-bar">
        <div
          class="rm-bar-fill"
          :class="{ 'is-ok': item.status === 'done' }"
          :style="{ width: percent(item.progress) }"
        />
      </div>

      <div v-if="item.progressTotal > 0" class="rm-row" style="margin-top: 10px">
        <input v-model="pageDraft" class="rm-input rm-num" type="number" :disabled="busy" />
        <span class="rm-sub">/ {{ item.progressTotal }} {{ item.progressUnit }}</span>
        <button class="rm-btn is-small" :disabled="busy" @click="setPages">Записать</button>
      </div>

      <div class="rm-row" style="margin-top: 8px">
        <input
          v-model="hoursDraft"
          class="rm-input rm-num"
          type="number"
          step="0.25"
          placeholder="часы"
          :disabled="busy"
        />
        <template v-if="item.progressTotal > 0">
          <button class="rm-btn is-small" :disabled="busy" @click="addPages(10)">+10</button>
          <button class="rm-btn is-small" :disabled="busy" @click="addPages(25)">+25</button>
        </template>
        <button v-else class="rm-btn is-small" :disabled="busy" @click="logHoursOnly">
          + сессия
        </button>
        <button class="rm-btn is-small is-primary" :disabled="busy" @click="markDone">
          Готово
        </button>
      </div>

      <div class="rm-row" style="margin-top: 8px">
        <select class="rm-select" :value="item.status" :disabled="busy" @change="setStatus($event.target.value)">
          <option v-for="s in STATUSES" :key="s.code" :value="s.code">{{ s.label }}</option>
        </select>
        <span class="rm-sub">
          {{ formatHours(item.hoursSpent) }} · {{ item.sessionCount }} сессий
          <template v-if="item.estimateHours"> · оценка {{ item.estimateHours }} ч</template>
        </span>
      </div>
      <p v-if="item.skipReason" class="rm-sub" style="margin: 8px 0 0">
        Пропущен: {{ item.skipReason }}
      </p>
    </div>

    <div v-if="item.description" class="rm-panel-section">
      <h4>Зачем это вам</h4>
      <div class="rm-desc">{{ item.description }}</div>
    </div>

    <div v-if="item.type === 'cert'" class="rm-panel-section">
      <h4>Сертификация</h4>
      <div class="rm-desc">
        <div v-if="item.certCost">Стоимость: {{ item.certCost }}</div>
        <div v-if="item.certEffort">Время: {{ item.certEffort }}</div>
        <div v-if="item.certValue">Ценность: {{ item.certValue }}</div>
        <div v-if="certVerdict" :style="{ color: certVerdict.color }">
          Вердикт: {{ certVerdict.label }}
        </div>
      </div>
    </div>

    <div class="rm-panel-section">
      <h4>Конспект</h4>
      <template v-if="noteEditing">
        <textarea v-model="noteDraft" class="rm-textarea" placeholder="markdown" />
        <div class="rm-row" style="margin-top: 8px">
          <button class="rm-btn is-small is-primary" :disabled="busy" @click="saveNote">
            Сохранить
          </button>
          <button class="rm-btn is-small" @click="noteEditing = false">Отмена</button>
        </div>
      </template>
      <template v-else>
        <MarkdownView v-if="item.note" class="rm-note-view" :text="item.note" />
        <p v-else class="rm-sub">Пусто. DDIA рекомендуется читать с конспектом.</p>
        <button class="rm-btn is-small" style="margin-top: 8px" @click="noteEditing = true">
          ✎ Редактировать
        </button>
      </template>
    </div>

    <div class="rm-panel-section">
      <h4>
        Чек-лист
        <template v-if="item.subItems.length">
          — {{ item.subItems.filter((s) => s.done).length }} / {{ item.subItems.length }}
        </template>
      </h4>
      <div
        v-for="sub in item.subItems"
        :key="sub.id"
        class="rm-sub-item"
        :class="{ 'is-done': sub.done }"
      >
        <input type="checkbox" :checked="sub.done" :disabled="busy" @change="toggleSubItem(sub)" />
        <span style="flex: 1">{{ sub.title }}</span>
        <button class="rm-btn is-small is-danger" @click="removeSubItem(sub)">✕</button>
      </div>
      <div class="rm-row" style="margin-top: 6px">
        <input
          v-model="subDraft"
          class="rm-input"
          style="flex: 1"
          placeholder="Глава или шаг"
          @keyup.enter="addSubItem"
        />
        <button class="rm-btn is-small" @click="addSubItem">＋</button>
      </div>
      <p v-if="item.subItems.length" class="rm-sub" style="margin: 6px 0 0">
        Чек-лист приоритетнее страниц: прогресс считается по нему.
      </p>
    </div>

    <div class="rm-panel-section">
      <h4>Связи</h4>
      <div class="rm-row">
        <select
          class="rm-select"
          style="flex: 1; min-width: 0"
          :value="item.pdfFileId || ''"
          :disabled="busy"
          @change="linkPdf($event.target.value)"
        >
          <option value="">PDF не прикреплён</option>
          <option v-for="f in libraryFiles" :key="f.id" :value="f.id">
            {{ f.title }}<template v-if="f.pageCount"> ({{ f.pageCount }} стр.)</template>
          </option>
        </select>
        <button v-if="item.pdfFileId" class="rm-btn is-small is-primary" @click="openReader">
          📖 Читать
        </button>
      </div>
      <p v-if="linkedFile" class="rm-sub" style="margin: 6px 0 0">
        Остановились на странице {{ linkedFile.currentPage }}<template v-if="linkedFile.pageCount"> из
        {{ linkedFile.pageCount }}</template> · {{ Math.round((linkedFile.hoursRead || 0) * 10) / 10 }} ч
        в читалке. Чтение само двигает прогресс пункта.
      </p>
      <div class="rm-row" style="margin-top: 8px">
        <template v-if="item.type === 'project'">
          <span v-if="item.taskId" class="rm-sub">
            Задача заведена · прогресс {{ percent(item.taskProgress || 0) }}
          </span>
          <button v-else class="rm-btn is-small" :disabled="busy" @click="makeTask">
            🛠️ Завести задачи
          </button>
        </template>
      </div>
      <p v-if="item.type === 'project' && item.taskId" class="rm-sub" style="margin-top: 6px">
        Прогресс тянется от подзадач и правится в модуле задач.
      </p>
    </div>

    <div class="rm-panel-section">
      <h4>
        <button class="rm-btn is-small" @click="toggleSessions">
          {{ sessionsOpen ? "▾" : "▸" }} Сессии чтения ({{ item.sessionCount }})
        </button>
      </h4>
      <template v-if="sessionsOpen">
        <div v-if="!sessions.length" class="rm-sub">Пока ни одной.</div>
        <div v-for="s in sessions" :key="s.id" class="rm-session">
          <span class="rm-session-date">{{ s.date }}</span>
          <span>{{ formatHours(s.hours) }}</span>
          <span v-if="s.pagesTo" class="rm-sub">до {{ s.pagesTo }}</span>
          <span class="rm-session-src">{{ SOURCE_LABELS[s.source] || s.source }}</span>
          <div class="rm-spacer" />
          <button class="rm-btn is-small is-danger" @click="removeSession(s)">✕</button>
        </div>
      </template>
    </div>
  </div>
</template>
