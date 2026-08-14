<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import "@/styles/resume.css";

import {
  fetchResumeFull,
  updateResume,
  createSection,
  updateSection,
  deleteSection,
  createEntry,
  createBullet,
  updateBullet,
  updateEntry,
  reorderResume,
  fetchLint,
  downloadExport,
  fetchSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  SECTION_KINDS,
  resumeToday,
} from "@/components/resumeApi.js";
import ResumeSheet from "@/components/resume/ResumeSheet.vue";
import ResumeInspector from "@/components/resume/ResumeInspector.vue";
import ResumeGuidePanel from "@/components/resume/ResumeGuidePanel.vue";

// Редактор резюме — docs/resume-module.md, раздел 4.
// Центр экрана — лист А4 «как напечатается»: превью обязано совпадать с PDF.

const route = useRoute();
const router = useRouter();

const id = computed(() => route.params.id);
const full = ref(null);
const mode = ref("working"); // working | clean
const tab = ref("links"); // links | lint | guide | snapshots
const selected = ref(null);
const selectedKind = ref("bullet");
const lint = ref([]);
const snapshots = ref([]);
const error = ref("");
const busy = ref(false);
const headerOpen = ref(false);

const sections = computed(() => full.value?.sections || []);
const resume = computed(() => full.value?.resume || {});

const lintCounts = computed(() => ({
  error: lint.value.filter((f) => f.severity === "error").length,
  warn: lint.value.filter((f) => f.severity === "warn").length,
}));

async function load() {
  error.value = "";
  try {
    full.value = await fetchResumeFull(id.value, resumeToday());
    if (selected.value) reselect(selected.value.id);
  } catch (e) {
    error.value = e.message;
  }
}

async function loadLint() {
  try {
    lint.value = await fetchLint(id.value, resumeToday());
  } catch (e) {
    error.value = e.message;
  }
}

async function loadSnapshots() {
  snapshots.value = await fetchSnapshots(id.value);
}

// После перезагрузки дерева выделение должно остаться на том же объекте.
function reselect(targetId) {
  for (const section of sections.value) {
    for (const bullet of section.bullets || []) {
      if (bullet.id === targetId) {
        selected.value = bullet;
        selectedKind.value = "bullet";
        return;
      }
    }
    for (const entry of section.entries || []) {
      if (entry.id === targetId) {
        selected.value = entry;
        selectedKind.value = "entry";
        return;
      }
      for (const bullet of entry.bullets || []) {
        if (bullet.id === targetId) {
          selected.value = bullet;
          selectedKind.value = "bullet";
          return;
        }
      }
    }
  }
  selected.value = null;
}

function select(item) {
  selected.value = item;
  selectedKind.value = item.sectionId && "text" in item ? "bullet" : "entry";
  // У строки есть text, у блока — organization. Различаем по этому.
  selectedKind.value = Object.prototype.hasOwnProperty.call(item, "organization")
    ? "entry"
    : "bullet";
  tab.value = "links";
}

async function run(action) {
  busy.value = true;
  error.value = "";
  try {
    await action();
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

// --- Правки прямо на листе ---

function onEditBullet(patch) {
  const bullet = findBullet(patch.id);
  if (!bullet) return;
  return run(() =>
    updateBullet(patch.id, {
      sectionId: bullet.sectionId,
      entryId: bullet.entryId,
      groupLabel: bullet.groupLabel,
      text: patch.text ?? bullet.text,
      textTarget: bullet.textTarget,
      note: bullet.note,
      status: bullet.status,
      deadline: bullet.deadline || null,
      hidden: bullet.hidden,
      sortOrder: bullet.sortOrder,
    }),
  );
}

function onEditEntry(patch) {
  const entry = findEntry(patch.id);
  if (!entry) return;
  return run(() =>
    updateEntry(patch.id, {
      title: patch.title ?? entry.title,
      organization: entry.organization,
      location: entry.location,
      dateStart: entry.dateStart || null,
      dateEnd: entry.dateEnd || null,
      isCurrent: entry.isCurrent,
      url: entry.url,
      description: entry.description,
      status: entry.status,
      deadline: entry.deadline || null,
      note: entry.note,
      hidden: entry.hidden,
      sortOrder: entry.sortOrder,
    }),
  );
}

function onEditHeader(patch) {
  return run(() => updateResume(id.value, { ...resume.value, ...patch }));
}

function findBullet(bulletId) {
  for (const section of sections.value) {
    const direct = (section.bullets || []).find((b) => b.id === bulletId);
    if (direct) return direct;
    for (const entry of section.entries || []) {
      const inner = (entry.bullets || []).find((b) => b.id === bulletId);
      if (inner) return inner;
    }
  }
  return null;
}

function findEntry(entryId) {
  for (const section of sections.value) {
    const entry = (section.entries || []).find((e) => e.id === entryId);
    if (entry) return entry;
  }
  return null;
}

// --- Секции ---

function addSection() {
  const kind = SECTION_KINDS[SECTION_KINDS.length - 1];
  return run(() =>
    createSection(id.value, {
      kind: kind.code,
      title: "Новая секция",
      layout: kind.layout,
      sortOrder: sections.value.length,
    }),
  );
}

function renameSection(section) {
  const title = prompt("Название секции", section.title);
  if (title === null) return;
  return run(() => updateSection(section.id, { ...section, title }));
}

function toggleSection(section) {
  return run(() => updateSection(section.id, { ...section, hidden: !section.hidden }));
}

function removeSection(section) {
  if (!confirm(`Удалить секцию «${section.title}» со всем содержимым?`)) return;
  return run(() => deleteSection(section.id));
}

function moveSection(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= sections.value.length) return;
  const list = [...sections.value];
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  return run(() =>
    reorderResume(id.value, {
      sections: list.map((section, order) => ({ id: section.id, sortOrder: order })),
    }),
  );
}

function addBullet(section, entryId = null) {
  const list = entryId
    ? (section.entries.find((e) => e.id === entryId)?.bullets ?? [])
    : section.bullets;
  return run(() =>
    createBullet({
      sectionId: section.id,
      entryId,
      text: "Новая строка",
      status: "fact",
      sortOrder: list.length,
    }),
  );
}

function addEntry(section) {
  return run(() =>
    createEntry({
      sectionId: section.id,
      title: "Должность",
      organization: "Компания",
      status: "fact",
      sortOrder: (section.entries || []).length,
    }),
  );
}

// --- Экспорт и версии ---

const exportFile = (format) =>
  downloadExport(id.value, format, mode.value === "clean" ? "clean" : "working").catch(
    (e) => (error.value = e.message),
  );

function print() {
  router.push(`/resume/${id.value}/print`);
}

function snapshot() {
  return run(async () => {
    await createSnapshot(id.value, { mode: mode.value });
    await loadSnapshots();
  });
}

function restore(snapshotId) {
  if (!confirm("Развернуть версию как новое резюме? Текущее останется как есть.")) return;
  return run(async () => {
    const created = await restoreSnapshot(snapshotId);
    if (created?.id) router.push(`/resume/${created.id}`);
  });
}

function dropSnapshot(snapshotId) {
  if (!confirm("Удалить версию?")) return;
  return run(async () => {
    await deleteSnapshot(snapshotId);
    await loadSnapshots();
  });
}

function jumpTo(finding) {
  const targetId = finding.bulletId || finding.entryId;
  if (targetId) reselect(targetId);
  tab.value = "links";
}

function openTab(code) {
  tab.value = code;
  if (code === "lint") loadLint();
  if (code === "snapshots") loadSnapshots();
}

onMounted(async () => {
  await load();
  await loadLint();
});
</script>

<template>
  <div class="rs">
    <div class="rs-header rs-print-hide">
      <div>
        <h1>{{ resume.title || "Резюме" }}</h1>
        <div class="rs-sub">
          {{ resume.headline }}
          <span v-if="resume.lang === 'en'"> · English</span>
        </div>
      </div>
      <div class="rs-row">
        <button class="rs-btn" @click="router.push('/resume')">← Все резюме</button>
        <button class="rs-btn" @click="headerOpen = true">Шапка и контакты</button>
        <button
          class="rs-btn"
          :class="{ 'is-active': mode === 'working' }"
          @click="mode = 'working'"
        >
          Рабочий вид
        </button>
        <button class="rs-btn" :class="{ 'is-active': mode === 'clean' }" @click="mode = 'clean'">
          Чистый вид
        </button>
        <button class="rs-btn is-primary" @click="print">Печать / PDF</button>
      </div>
    </div>

    <div v-if="mode === 'clean'" class="rs-sub rs-print-hide">
      Плановые строки в этом виде скрыты — и в экспорт они не попадут ни при каких настройках.
    </div>
    <div v-if="error" class="rs-error rs-print-hide">{{ error }}</div>

    <div class="rs-editor">
      <!-- Левая колонка: секции -->
      <div class="rs-pane rs-print-hide">
        <h4>Секции</h4>
        <div v-for="(section, index) in sections" :key="section.id">
          <div class="rs-tree-item" :class="{ 'is-hidden': section.hidden }">
            <span style="flex: 1" @click="renameSection(section)">{{ section.title }}</span>
            <button class="rs-btn is-small" title="выше" @click="moveSection(index, -1)">↑</button>
            <button class="rs-btn is-small" title="ниже" @click="moveSection(index, 1)">↓</button>
            <button
              class="rs-btn is-small"
              :title="section.hidden ? 'показать' : 'скрыть в экспорте'"
              @click="toggleSection(section)"
            >
              {{ section.hidden ? "🚫" : "👁" }}
            </button>
            <button class="rs-btn is-small is-danger" @click="removeSection(section)">×</button>
          </div>
          <div class="rs-row" style="padding: 0 8px 8px">
            <button class="rs-btn is-small" @click="addBullet(section)">+ строка</button>
            <button
              v-if="section.layout === 'entries'"
              class="rs-btn is-small"
              @click="addEntry(section)"
            >
              + блок
            </button>
            <button
              v-for="entry in section.entries"
              :key="entry.id"
              class="rs-btn is-small"
              :title="`строка в блок «${entry.organization || entry.title}»`"
              @click="addBullet(section, entry.id)"
            >
              + в {{ (entry.organization || entry.title || "").slice(0, 10) }}
            </button>
          </div>
        </div>
        <button class="rs-btn" style="width: 100%; margin-top: 8px" @click="addSection">
          + секция
        </button>
      </div>

      <!-- Центр: лист А4 -->
      <div class="rs-sheet-wrap">
        <ResumeSheet
          v-if="full"
          :full="full"
          :mode="mode"
          :editable="mode === 'working'"
          :selected-id="selected?.id || ''"
          @select="select"
          @edit-bullet="onEditBullet"
          @edit-entry="onEditEntry"
          @edit-header="onEditHeader"
        />
        <div class="rs-row rs-print-hide">
          <button class="rs-btn" @click="exportFile('docx')">DOCX</button>
          <button class="rs-btn" @click="exportFile('md')">Markdown</button>
          <button class="rs-btn" @click="exportFile('txt')">Текст для hh</button>
          <button class="rs-btn" @click="exportFile('html')">HTML</button>
          <button class="rs-btn" @click="exportFile('json')">JSON</button>
        </div>
      </div>

      <!-- Правая колонка: связи, линтер, гайд, версии -->
      <div class="rs-pane rs-print-hide">
        <div class="rs-side-tabs">
          <button class="rs-btn is-small" :class="{ 'is-active': tab === 'links' }" @click="openTab('links')">
            Связи
          </button>
          <button class="rs-btn is-small" :class="{ 'is-active': tab === 'lint' }" @click="openTab('lint')">
            Линтер
            <template v-if="lintCounts.error || lintCounts.warn">
              ({{ lintCounts.error }}/{{ lintCounts.warn }})
            </template>
          </button>
          <button class="rs-btn is-small" :class="{ 'is-active': tab === 'guide' }" @click="openTab('guide')">
            Гайд
          </button>
          <button
            class="rs-btn is-small"
            :class="{ 'is-active': tab === 'snapshots' }"
            @click="openTab('snapshots')"
          >
            Версии
          </button>
        </div>

        <ResumeInspector
          v-if="tab === 'links'"
          :item="selected"
          :item-kind="selectedKind"
          @changed="load"
        />

        <template v-else-if="tab === 'lint'">
          <div v-if="!lint.length" class="rs-sub">Замечаний нет.</div>
          <div
            v-for="(finding, index) in lint"
            :key="index"
            class="rs-lint-item"
            :class="`is-${finding.severity}`"
            @click="jumpTo(finding)"
          >
            <div>{{ finding.message }}</div>
            <div v-if="finding.hint" class="rs-lint-hint">{{ finding.hint }}</div>
          </div>
          <button class="rs-btn" style="width: 100%; margin-top: 8px" @click="loadLint">
            Перепроверить
          </button>
        </template>

        <ResumeGuidePanel v-else-if="tab === 'guide'" />

        <template v-else>
          <button class="rs-btn is-primary" style="width: 100%" @click="snapshot">
            Снять версию
          </button>
          <div v-for="item in snapshots" :key="item.id" class="rs-link-row">
            <span class="rs-link-title">
              {{ item.label }}
              <span class="rs-sub">— {{ item.createdAt }}</span>
            </span>
            <button class="rs-btn is-small" @click="restore(item.id)">↺</button>
            <button class="rs-btn is-small is-danger" @click="dropSnapshot(item.id)">×</button>
          </div>
        </template>
      </div>
    </div>

    <!-- Шапка: контакты живут в теле документа, а не в колонтитуле -->
    <div v-if="headerOpen" class="modal-overlay" @click.self="headerOpen = false">
      <div class="modal-card rs" style="max-width: 620px; width: 100%; min-height: auto; padding: 24px">
        <h3 style="margin: 0 0 14px">Шапка и настройки</h3>
        <div class="rs-two">
          <div class="rs-field">
            <label class="rs-label">Название резюме (внутреннее)</label>
            <input class="rs-input" :value="resume.title" @change="onEditHeader({ title: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Целевая должность</label>
            <input class="rs-input" :value="resume.targetRole" @change="onEditHeader({ targetRole: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">ФИО</label>
            <input class="rs-input" :value="resume.fullName" @change="onEditHeader({ fullName: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Заголовок со стеком</label>
            <input class="rs-input" :value="resume.headline" @change="onEditHeader({ headline: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Город</label>
            <input class="rs-input" :value="resume.city" @change="onEditHeader({ city: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Релокация</label>
            <input class="rs-input" :value="resume.relocation" @change="onEditHeader({ relocation: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Телефон</label>
            <input class="rs-input" :value="resume.phone" @change="onEditHeader({ phone: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Email</label>
            <input class="rs-input" :value="resume.email" @change="onEditHeader({ email: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Telegram</label>
            <input class="rs-input" :value="resume.telegram" @change="onEditHeader({ telegram: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">GitHub</label>
            <input class="rs-input" :value="resume.github" @change="onEditHeader({ github: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Шаблон</label>
            <select class="rs-select" :value="resume.templateKey" @change="onEditHeader({ templateKey: $event.target.value })">
              <option value="strict">Строгий ATS</option>
              <option value="accent">Строгий с акцентом</option>
              <option value="en">Английский</option>
            </select>
          </div>
          <div class="rs-field">
            <label class="rs-label">Акцентный цвет</label>
            <input class="rs-input" type="color" :value="resume.accentColor || '#111111'" @change="onEditHeader({ accentColor: $event.target.value })" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Предел страниц</label>
            <select class="rs-select" :value="resume.pageLimit" @change="onEditHeader({ pageLimit: Number($event.target.value) })">
              <option :value="1">1 страница</option>
              <option :value="2">2 страницы</option>
            </select>
          </div>
        </div>
        <div class="rs-row">
          <span class="rs-spacer" />
          <button class="rs-btn is-primary" @click="headerOpen = false">Готово</button>
        </div>
      </div>
    </div>
  </div>
</template>
