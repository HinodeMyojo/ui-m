<script setup>
import { ref, onMounted } from "vue";
import {
  fetchJpStudies,
  saveJpStudy,
  deleteJpStudy,
  JP_ITEM_TYPES,
} from "@/components/japaneseApi.js";

// Учёбы: что учим, сколько в день, когда напоминать и как часто экзамен.
//
// По умолчанию заведена одна — «Иероглифы», и только они. Слова и ключи
// никуда не деваются: у них своя учёба с нулевой нормой, то есть их повторяют,
// но новых не выдают. Слово из незнакомых знаков приходит как одна единица, а
// на деле требует выучить три — поэтому смешивать их по умолчанию нельзя.

const emit = defineEmits(["changed"]);

const studies = ref([]);
const loading = ref(true);
const error = ref("");
const saving = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    studies.value = (await fetchJpStudies()).map((s) => ({
      ...s,
      remindText: (s.remindAt || []).join(", "),
    }));
  } catch (e) {
    error.value = e.message || "не удалось загрузить учёбы";
  } finally {
    loading.value = false;
  }
}

function toggleType(study, code) {
  const types = new Set(study.itemTypes || []);
  if (types.has(code)) types.delete(code);
  else types.add(code);
  study.itemTypes = [...types];
}

async function save(study) {
  saving.value = study.id || "new";
  error.value = "";
  try {
    const body = {
      ...study,
      // Часы вводят строкой через запятую: три поля времени на телефоне
      // занимают экран, а меняют их раз в полгода.
      remindAt: study.remindText
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    };
    delete body.remindText;
    await saveJpStudy(body);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не сохранилось";
  } finally {
    saving.value = "";
  }
}

async function remove(study) {
  if (!study.id) return;
  saving.value = study.id;
  try {
    await deleteJpStudy(study.id);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось удалить";
  } finally {
    saving.value = "";
  }
}

function add() {
  studies.value.push({
    id: "",
    name: "Новая учёба",
    emoji: "📘",
    enabled: true,
    itemTypes: ["kanji"],
    newPerDay: 6,
    sessionSec: 360,
    examEvery: 20,
    remindText: "10:00, 15:00, 20:00",
  });
}

onMounted(load);
</script>

<template>
  <section class="jp-card">
    <h3>Учёбы</h3>
    <p class="jp-muted" style="margin: 0 0 10px">
      Курс решает, что попадёт в сессию. Нулевая норма означает «только
      повторяем, новое не берём».
    </p>

    <div v-if="error" class="jp-error">{{ error }}</div>
    <div v-if="loading" class="jp-empty">Загружаю…</div>

    <div v-for="study in studies" :key="study.id || study.name" class="jps-study">
      <div class="jp-row">
        <input v-model="study.emoji" class="jp-input jps-emoji" maxlength="2" />
        <input v-model="study.name" class="jp-input" />
      </div>

      <div class="jp-row jps-types">
        <button
          v-for="t in JP_ITEM_TYPES"
          :key="t.code"
          class="jp-btn jp-btn-sm"
          :class="{ 'is-primary': (study.itemTypes || []).includes(t.code) }"
          @click="toggleType(study, t.code)"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="jp-grid">
        <div class="jp-field">
          <label>Новых в день</label>
          <input v-model.number="study.newPerDay" class="jp-input" type="number" min="0" max="40" />
        </div>
        <div class="jp-field">
          <label>Экзамен каждые</label>
          <input v-model.number="study.examEvery" class="jp-input" type="number" min="0" max="100" />
        </div>
      </div>

      <div class="jp-field">
        <label>Напоминать в</label>
        <input v-model="study.remindText" class="jp-input" placeholder="10:00, 15:00, 20:00" />
      </div>

      <label class="jp-check">
        <input v-model="study.enabled" type="checkbox" />
        Учёба включена
      </label>

      <div class="jp-row">
        <button
          class="jp-btn is-primary"
          :disabled="saving === (study.id || 'new')"
          @click="save(study)"
        >
          Сохранить
        </button>
        <button v-if="study.id" class="jp-btn is-danger" @click="remove(study)">Удалить</button>
      </div>
    </div>

    <button class="jp-btn" style="margin-top: 8px" @click="add">+ Ещё учёба</button>
  </section>
</template>

<style scoped>
.jps-study {
  border-top: 1px solid #262933;
  padding-top: 10px;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.jps-emoji {
  flex: 0 0 60px;
  text-align: center;
}

.jps-types {
  flex-wrap: wrap;
}
</style>
