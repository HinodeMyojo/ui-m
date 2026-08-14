<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/resume.css";

import {
  fetchAchievements,
  createAchievement,
  updateAchievement,
  deleteAchievement,
  insertAchievement,
  fetchResumes,
  fetchResumeFull,
} from "@/components/resumeApi.js";

// Библиотека достижений — docs/resume-module.md, решение 31.
// Вставка создаёт независимую строку: правка достижения не трогает вставленное.

const router = useRouter();

const items = ref([]);
const resumes = ref([]);
const sections = ref([]);
const error = ref("");
const busy = ref(false);
const editing = ref(null);
const inserting = ref(null);
const target = ref({ resumeId: "", sectionId: "", useEn: false });

const KINDS = [
  { code: "impact", title: "Эффект" },
  { code: "scale", title: "Масштаб" },
  { code: "tech", title: "Технологии" },
  { code: "leadership", title: "Лидерство" },
];

const empty = () => ({ text: "", textEn: "", company: "", metric: "", kind: "impact", tags: [] });

const canInsert = computed(() => target.value.resumeId && target.value.sectionId);

async function load() {
  error.value = "";
  try {
    items.value = await fetchAchievements();
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

function save() {
  const body = { ...editing.value, tags: editing.value.tags || [] };
  return run(async () => {
    if (editing.value.id) await updateAchievement(editing.value.id, body);
    else await createAchievement(body);
    editing.value = null;
  });
}

function remove(item) {
  if (!confirm("Удалить достижение из библиотеки?")) return;
  return run(() => deleteAchievement(item.id));
}

async function openInsert(item) {
  inserting.value = item;
  if (!resumes.value.length) resumes.value = await fetchResumes();
  sections.value = [];
  target.value = { resumeId: "", sectionId: "", useEn: false };
}

async function pickResume(resumeId) {
  target.value.resumeId = resumeId;
  target.value.sectionId = "";
  if (!resumeId) return;
  const full = await fetchResumeFull(resumeId);
  sections.value = full?.sections || [];
}

function doInsert() {
  return run(async () => {
    await insertAchievement(inserting.value.id, {
      resumeId: target.value.resumeId,
      sectionId: target.value.sectionId,
      useEn: target.value.useEn,
    });
    inserting.value = null;
  });
}

onMounted(load);
</script>

<template>
  <div class="rs">
    <div class="rs-header">
      <div>
        <h1>Библиотека достижений</h1>
        <div class="rs-sub">Пул строк, из которого собираются разные резюме</div>
      </div>
      <div class="rs-row">
        <button class="rs-btn" @click="router.push('/resume')">← Все резюме</button>
        <button class="rs-btn is-primary" @click="editing = empty()">+ Достижение</button>
      </div>
    </div>

    <div v-if="error" class="rs-error">{{ error }}</div>
    <div v-if="!items.length" class="rs-sub">Пусто. Базовый набор появляется вместе с сидом резюме.</div>

    <div class="rs-cards">
      <div v-for="item in items" :key="item.id" class="rs-card">
        <div>{{ item.text }}</div>
        <div v-if="item.textEn" class="rs-sub">EN: {{ item.textEn }}</div>
        <div class="rs-chips">
          <span v-if="item.company" class="rs-chip">{{ item.company }}</span>
          <span class="rs-chip">{{ (KINDS.find((k) => k.code === item.kind) || {}).title }}</span>
          <span v-if="item.metric" class="rs-chip is-fact">{{ item.metric }}</span>
          <span class="rs-chip" :class="{ 'is-ready': item.usedIn }">
            используется в {{ item.usedIn }}
          </span>
        </div>
        <div class="rs-row">
          <button class="rs-btn is-primary" @click="openInsert(item)">Вставить в резюме</button>
          <button class="rs-btn" @click="editing = { ...item }">Править</button>
          <span class="rs-spacer" />
          <button class="rs-btn is-danger" @click="remove(item)">×</button>
        </div>
      </div>
    </div>

    <div v-if="editing" class="modal-overlay" @click.self="editing = null">
      <div class="modal-card rs" style="max-width: 560px; width: 100%; min-height: auto; padding: 24px">
        <h3 style="margin: 0 0 14px">{{ editing.id ? "Правка" : "Новое достижение" }}</h3>
        <div class="rs-field">
          <label class="rs-label">Текст (формула: результат → цифра → за счёт чего)</label>
          <textarea v-model="editing.text" class="rs-textarea" />
        </div>
        <div class="rs-field">
          <label class="rs-label">Английская версия</label>
          <textarea v-model="editing.textEn" class="rs-textarea" />
        </div>
        <div class="rs-two">
          <div class="rs-field">
            <label class="rs-label">Компания</label>
            <input v-model="editing.company" class="rs-input" />
          </div>
          <div class="rs-field">
            <label class="rs-label">Ключевая цифра</label>
            <input v-model="editing.metric" class="rs-input" placeholder="−40 % p99" />
          </div>
        </div>
        <div class="rs-field">
          <label class="rs-label">Вид</label>
          <select v-model="editing.kind" class="rs-select">
            <option v-for="kind in KINDS" :key="kind.code" :value="kind.code">{{ kind.title }}</option>
          </select>
        </div>
        <div class="rs-row">
          <span class="rs-spacer" />
          <button class="rs-btn" @click="editing = null">Отмена</button>
          <button class="rs-btn is-primary" :disabled="busy" @click="save">Сохранить</button>
        </div>
      </div>
    </div>

    <div v-if="inserting" class="modal-overlay" @click.self="inserting = null">
      <div class="modal-card rs" style="max-width: 500px; width: 100%; min-height: auto; padding: 24px">
        <h3 style="margin: 0 0 4px">Вставить в резюме</h3>
        <div class="rs-sub" style="margin-bottom: 14px">{{ inserting.text }}</div>
        <div class="rs-field">
          <label class="rs-label">Резюме</label>
          <select class="rs-select" :value="target.resumeId" @change="pickResume($event.target.value)">
            <option value="">— выберите —</option>
            <option v-for="resume in resumes" :key="resume.id" :value="resume.id">
              {{ resume.title }}
            </option>
          </select>
        </div>
        <div class="rs-field">
          <label class="rs-label">Секция</label>
          <select v-model="target.sectionId" class="rs-select">
            <option value="">— выберите —</option>
            <option v-for="section in sections" :key="section.id" :value="section.id">
              {{ section.title }}
            </option>
          </select>
        </div>
        <div class="rs-field">
          <label class="rs-label">
            <input v-model="target.useEn" type="checkbox" />
            Вставить английскую версию
          </label>
        </div>
        <div class="rs-row">
          <span class="rs-spacer" />
          <button class="rs-btn" @click="inserting = null">Отмена</button>
          <button class="rs-btn is-primary" :disabled="!canInsert || busy" @click="doInsert">
            Вставить
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
