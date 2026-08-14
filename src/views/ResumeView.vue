<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/resume.css";

import {
  fetchResumes,
  createResume,
  cloneResume,
  deleteResume,
  seedResume,
} from "@/components/resumeApi.js";

// Список резюме — docs/resume-module.md, раздел 4.

const router = useRouter();

const resumes = ref([]);
const error = ref("");
const busy = ref(false);
const createOpen = ref(false);
const form = ref({ title: "", lang: "ru", targetRole: "", fromSample: true });

async function load() {
  error.value = "";
  try {
    resumes.value = await fetchResumes();
  } catch (e) {
    error.value = e.message;
  }
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

function create() {
  if (!form.value.title.trim()) {
    error.value = "Название обязательно";
    return;
  }
  return run(async () => {
    const created = await createResume({ ...form.value });
    createOpen.value = false;
    form.value = { title: "", lang: "ru", targetRole: "", fromSample: true };
    if (created?.id) router.push(`/resume/${created.id}`);
  });
}

function clone(resume, lang) {
  const suffix = lang === "en" ? " (EN)" : " — копия";
  const title = prompt("Название копии", resume.title + suffix);
  if (!title) return;
  return run(async () => {
    const created = await cloneResume(resume.id, { title, lang: lang || resume.lang });
    if (created?.id) router.push(`/resume/${created.id}`);
  });
}

function remove(resume) {
  if (!confirm(`Удалить резюме «${resume.title}» со всем содержимым?`)) return;
  return run(() => deleteResume(resume.id));
}

const seed = () => run(seedResume);

onMounted(load);
</script>

<template>
  <div class="rs">
    <div class="rs-header">
      <div>
        <h1>Резюме</h1>
        <div class="rs-sub">
          Живое резюме: строки со статусом «факт / в процессе / план», связанные с roadmap и задачами
        </div>
      </div>
      <div class="rs-row">
        <button class="rs-btn" @click="router.push('/resume/library')">Библиотека достижений</button>
        <button class="rs-btn" @click="router.push('/resume/vacancies')">Вакансии</button>
        <button class="rs-btn" @click="router.push('/resume/today')">Сегодня</button>
        <button class="rs-btn" :disabled="busy" @click="seed">Загрузить базовое</button>
        <button class="rs-btn is-primary" @click="createOpen = true">+ Резюме</button>
      </div>
    </div>

    <div v-if="error" class="rs-error">{{ error }}</div>

    <div v-if="!resumes.length" class="rs-sub">
      Пока пусто. «Загрузить базовое» создаст резюме из docs/resume-base.md — переписанную версию
      выгрузки с hh.ru с плановыми строками.
    </div>

    <div class="rs-cards">
      <div v-for="resume in resumes" :key="resume.id" class="rs-card">
        <div>
          <h3>
            {{ resume.title }}
            <span v-if="resume.lang === 'en'" class="rs-chip">EN</span>
            <span v-if="resume.isActive" class="rs-chip is-ready">основное</span>
          </h3>
          <div class="rs-card-role">{{ resume.headline || resume.targetRole }}</div>
        </div>

        <div class="rs-chips">
          <span class="rs-chip is-fact">{{ resume.factCount }} фактов</span>
          <span v-if="resume.inProgressCount" class="rs-chip is-progress">
            {{ resume.inProgressCount }} в процессе
          </span>
          <span v-if="resume.plannedCount" class="rs-chip is-plan">
            {{ resume.plannedCount }} планов
          </span>
          <span v-if="resume.readyCount" class="rs-chip is-ready">
            {{ resume.readyCount }} готово к факту
          </span>
          <span v-if="resume.overdueCount" class="rs-chip is-bad">
            {{ resume.overdueCount }} просрочено
          </span>
        </div>

        <div class="rs-sub">
          Изменено {{ resume.updatedAt }}
          <template v-if="resume.lastSnapshotAt"> · версия {{ resume.lastSnapshotAt }}</template>
        </div>

        <div class="rs-row">
          <button class="rs-btn is-primary" @click="router.push(`/resume/${resume.id}`)">
            Открыть
          </button>
          <button class="rs-btn" @click="clone(resume)">Копия</button>
          <button v-if="resume.lang !== 'en'" class="rs-btn" @click="clone(resume, 'en')">
            На английский
          </button>
          <span class="rs-spacer" />
          <button class="rs-btn is-danger" @click="remove(resume)">Удалить</button>
        </div>
      </div>
    </div>

    <div v-if="createOpen" class="modal-overlay" @click.self="createOpen = false">
      <div class="modal-card rs" style="max-width: 460px; width: 100%; min-height: auto; padding: 24px">
        <h3 style="margin: 0 0 14px">Новое резюме</h3>
        <div class="rs-field">
          <label class="rs-label">Название (внутреннее)</label>
          <input v-model="form.title" class="rs-input" placeholder="Go backend / финтех" />
        </div>
        <div class="rs-field">
          <label class="rs-label">Целевая должность</label>
          <input v-model="form.targetRole" class="rs-input" placeholder="Senior Go Developer" />
        </div>
        <div class="rs-field">
          <label class="rs-label">Язык</label>
          <select v-model="form.lang" class="rs-select">
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>
        <div class="rs-field">
          <label class="rs-label">
            <input v-model="form.fromSample" type="checkbox" />
            Создать каркас секций в порядке, который ждёт ATS
          </label>
        </div>
        <div class="rs-row">
          <span class="rs-spacer" />
          <button class="rs-btn" @click="createOpen = false">Отмена</button>
          <button class="rs-btn is-primary" :disabled="busy" @click="create">Создать</button>
        </div>
      </div>
    </div>
  </div>
</template>
