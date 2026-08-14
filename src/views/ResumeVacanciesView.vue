<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/resume.css";

import {
  fetchVacancies,
  fetchVacancy,
  fetchVacancyByUrl,
  createVacancy,
  updateVacancy,
  deleteVacancy,
  analyzeVacancy,
  updateRequirement,
  requirementToBullet,
  fetchResumes,
  fetchResumeFull,
} from "@/components/resumeApi.js";

// Целевые вакансии — docs/resume-module.md, решения 26–27.
// Ссылка на hh.ru тянется через публичный api.hh.ru; если не вышло — вставляем
// текст руками. Разметка требований редактируемая: эвристика ошибается.

const router = useRouter();

const vacancies = ref([]);
const current = ref(null);
const resumes = ref([]);
const sections = ref([]);
const error = ref("");
const busy = ref(false);
const url = ref("");
const manualOpen = ref(false);
const manual = ref({ title: "", company: "", rawText: "", resumeId: "" });
const targetSectionId = ref("");

const uncovered = computed(() =>
  (current.value?.requirements || []).filter((r) => !r.covered && !r.ignored),
);
const covered = computed(() =>
  (current.value?.requirements || []).filter((r) => r.covered && !r.ignored),
);

async function load() {
  error.value = "";
  try {
    vacancies.value = await fetchVacancies();
    if (!resumes.value.length) resumes.value = await fetchResumes();
  } catch (e) {
    error.value = e.message;
  }
}

async function run(action) {
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function open(vacancy) {
  await run(async () => {
    current.value = await fetchVacancy(vacancy.id);
    await loadSections();
  });
}

async function loadSections() {
  sections.value = [];
  targetSectionId.value = "";
  if (!current.value?.resumeId) return;
  const full = await fetchResumeFull(current.value.resumeId);
  sections.value = full?.sections || [];
}

function importByUrl() {
  if (!url.value.trim()) return;
  return run(async () => {
    const created = await fetchVacancyByUrl({
      url: url.value.trim(),
      resumeId: resumes.value.find((r) => r.isActive)?.id || resumes.value[0]?.id || null,
    });
    url.value = "";
    await load();
    if (created?.id) await open({ id: created.id });
  });
}

function saveManual() {
  return run(async () => {
    await createVacancy({ ...manual.value, resumeId: manual.value.resumeId || null });
    manualOpen.value = false;
    manual.value = { title: "", company: "", rawText: "", resumeId: "" };
    await load();
  });
}

function attachResume(resumeId) {
  return run(async () => {
    await updateVacancy(current.value.id, { ...current.value, resumeId: resumeId || null });
    current.value = await fetchVacancy(current.value.id);
    await loadSections();
  });
}

function analyze() {
  return run(async () => {
    current.value = await analyzeVacancy(current.value.id);
  });
}

function toggleCovered(requirement) {
  return run(async () => {
    await updateRequirement(requirement.id, {
      text: requirement.text,
      kind: requirement.kind,
      covered: !requirement.covered,
      ignored: requirement.ignored,
    });
    current.value = await fetchVacancy(current.value.id);
  });
}

function ignore(requirement) {
  return run(async () => {
    await updateRequirement(requirement.id, {
      text: requirement.text,
      kind: requirement.kind,
      covered: requirement.covered,
      ignored: true,
    });
    current.value = await fetchVacancy(current.value.id);
  });
}

function toBullet(requirement) {
  if (!targetSectionId.value) {
    error.value = "Выберите секцию, куда добавить плановую строку";
    return;
  }
  return run(async () => {
    await requirementToBullet(requirement.id, { sectionId: targetSectionId.value });
    current.value = await analyzeVacancy(current.value.id);
  });
}

function remove(vacancy) {
  if (!confirm("Удалить вакансию?")) return;
  return run(async () => {
    await deleteVacancy(vacancy.id);
    if (current.value?.id === vacancy.id) current.value = null;
    await load();
  });
}

onMounted(load);
</script>

<template>
  <div class="rs">
    <div class="rs-header">
      <div>
        <h1>Целевые вакансии</h1>
        <div class="rs-sub">Покрытие требований резюме; непокрытое становится плановой строкой</div>
      </div>
      <div class="rs-row">
        <button class="rs-btn" @click="router.push('/resume')">← Все резюме</button>
        <button class="rs-btn" @click="manualOpen = true">Вставить текстом</button>
      </div>
    </div>

    <div class="rs-row">
      <input
        v-model="url"
        class="rs-input"
        style="flex: 1; max-width: 460px"
        placeholder="ссылка на вакансию hh.ru"
        @keyup.enter="importByUrl"
      />
      <button class="rs-btn is-primary" :disabled="busy" @click="importByUrl">Импортировать</button>
    </div>

    <div v-if="error" class="rs-error">{{ error }}</div>

    <div class="rs-two">
      <div class="rs-pane">
        <h4>Вакансии</h4>
        <div v-if="!vacancies.length" class="rs-sub">Пока пусто.</div>
        <div v-for="vacancy in vacancies" :key="vacancy.id" class="rs-link-row">
          <span class="rs-link-title" @click="open(vacancy)">
            {{ vacancy.title || "без названия" }}
            <span class="rs-sub">{{ vacancy.company }}</span>
          </span>
          <span class="rs-chip" :class="{ 'is-fact': vacancy.mustCovered === vacancy.mustTotal }">
            {{ vacancy.mustCovered }}/{{ vacancy.mustTotal }}
          </span>
          <button class="rs-btn is-small is-danger" @click="remove(vacancy)">×</button>
        </div>
      </div>

      <div v-if="current" class="rs-pane">
        <h4>{{ current.title }}</h4>
        <div class="rs-sub" style="margin-bottom: 10px">
          {{ current.company }}
          <template v-if="current.salary"> · {{ current.salary }}</template>
          <template v-if="current.url">
            · <a :href="current.url" target="_blank" rel="noopener">на hh.ru</a>
          </template>
        </div>

        <div class="rs-field">
          <label class="rs-label">Сравнивать с резюме</label>
          <select class="rs-select" :value="current.resumeId || ''" @change="attachResume($event.target.value)">
            <option value="">— не выбрано —</option>
            <option v-for="resume in resumes" :key="resume.id" :value="resume.id">
              {{ resume.title }}
            </option>
          </select>
        </div>

        <div class="rs-row" style="margin-bottom: 10px">
          <button class="rs-btn is-primary" :disabled="!current.resumeId || busy" @click="analyze">
            Пересчитать покрытие
          </button>
          <span class="rs-chip is-fact">покрыто {{ current.covered }}/{{ current.total }}</span>
        </div>

        <div v-if="sections.length" class="rs-field">
          <label class="rs-label">Куда добавлять плановые строки</label>
          <select v-model="targetSectionId" class="rs-select">
            <option value="">— выберите секцию —</option>
            <option v-for="section in sections" :key="section.id" :value="section.id">
              {{ section.title }}
            </option>
          </select>
        </div>

        <h4 style="margin-top: 12px">Непокрыто ({{ uncovered.length }})</h4>
        <div v-for="requirement in uncovered" :key="requirement.id" class="rs-req is-missing">
          <span class="rs-req-text">
            {{ requirement.text }}
            <span v-if="requirement.kind === 'stack'" class="rs-chip">навык</span>
            <span v-else-if="requirement.kind === 'nice'" class="rs-chip">плюсом</span>
          </span>
          <button class="rs-btn is-small" title="в план" @click="toBullet(requirement)">→ план</button>
          <button class="rs-btn is-small" title="уже есть" @click="toggleCovered(requirement)">✓</button>
          <button class="rs-btn is-small" title="не считать" @click="ignore(requirement)">×</button>
        </div>

        <h4 style="margin-top: 12px">Покрыто ({{ covered.length }})</h4>
        <div v-for="requirement in covered" :key="requirement.id" class="rs-req is-covered">
          <span class="rs-req-text">
            {{ requirement.text }}
            <span v-if="requirement.coveredText" class="rs-sub">← {{ requirement.coveredText }}</span>
          </span>
          <button class="rs-btn is-small" @click="toggleCovered(requirement)">снять</button>
        </div>
      </div>
    </div>

    <div v-if="manualOpen" class="modal-overlay" @click.self="manualOpen = false">
      <div class="modal-card rs" style="max-width: 560px; width: 100%; min-height: auto; padding: 24px">
        <h3 style="margin: 0 0 14px">Вакансия текстом</h3>
        <div class="rs-two">
          <div class="rs-field">
            <label class="rs-label">Должность</label>
            <input v-model="manual.title" class="rs-input" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Компания</label>
            <input v-model="manual.company" class="rs-input" />
          </div>
        </div>
        <div class="rs-field">
          <label class="rs-label">Резюме для сравнения</label>
          <select v-model="manual.resumeId" class="rs-select">
            <option value="">— не выбрано —</option>
            <option v-for="resume in resumes" :key="resume.id" :value="resume.id">
              {{ resume.title }}
            </option>
          </select>
        </div>
        <div class="rs-field">
          <label class="rs-label">Текст вакансии</label>
          <textarea v-model="manual.rawText" class="rs-textarea" style="min-height: 200px" />
        </div>
        <div class="rs-row">
          <span class="rs-spacer" />
          <button class="rs-btn" @click="manualOpen = false">Отмена</button>
          <button class="rs-btn is-primary" :disabled="busy" @click="saveManual">Сохранить</button>
        </div>
      </div>
    </div>
  </div>
</template>
