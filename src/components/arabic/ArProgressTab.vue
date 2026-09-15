<script setup>
import { ref, onMounted } from "vue";
import { fetchArProgress, fetchArAchievements } from "@/components/arabicApi.js";
import ArSheet from "./ArSheet.vue";

// Прогресс: алфавит клетками, корзины и темы полосами, последние выученные
// слова и вехи. Сетка алфавита — та же идея, что сетка дзёё в японском: видеть
// закрашенное поле важнее, чем читать проценты.

const data = ref(null);
const achievements = ref([]);
const loading = ref(true);
const error = ref("");
const sheet = ref(null);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [progress, list] = await Promise.all([fetchArProgress(), fetchArAchievements()]);
    data.value = progress;
    achievements.value = list || [];
  } catch (e) {
    error.value = e.message || "не удалось загрузить прогресс";
  } finally {
    loading.value = false;
  }
}

function pct(group) {
  return group.total ? Math.round((group.learned / group.total) * 100) : 0;
}

onMounted(load);
</script>

<template>
  <div class="ar-progress">
    <p v-if="loading" class="ar-muted">Загружаем…</p>
    <p v-if="error" class="ar-err">{{ error }}</p>

    <template v-if="data">
      <section class="ar-card">
        <div class="ar-row ar-progress-top">
          <div><b>{{ data.wordsLearned }}</b><span>слов закреплено</span></div>
          <div><b>{{ data.streak }}</b><span>дней подряд</span></div>
          <div><b>{{ data.level }}</b><span>уровень</span></div>
        </div>
        <div class="ar-bar">
          <span :style="{ width: (data.wordsTotal ? (data.wordsLearned / data.wordsTotal) * 100 : 0) + '%' }"></span>
        </div>
        <p class="ar-muted">{{ data.wordsLearned }} из {{ data.wordsTotal }} слов словаря</p>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Алфавит</h3>
        <div class="ar-alphabet">
          <button
            v-for="cell in data.letters"
            :key="cell.char"
            class="ar-cell"
            :class="{ 'is-started': cell.inStudy, 'is-learned': cell.learned }"
            @click="sheet = { kind: 'letter', value: cell.char }"
          >
            <span class="ar-ar">{{ cell.char }}</span>
            <small>{{ cell.name }}</small>
          </button>
        </div>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Корзины частотности</h3>
        <div v-for="group in data.tiers" :key="group.code" class="ar-group">
          <div class="ar-row ar-group-head">
            <span>{{ group.title }}</span>
            <span class="ar-muted">{{ group.learned }} / {{ group.total }}</span>
          </div>
          <div class="ar-bar"><span :style="{ width: pct(group) + '%' }"></span></div>
        </div>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Темы</h3>
        <div v-for="group in data.topics" :key="group.code" class="ar-group">
          <div class="ar-row ar-group-head">
            <span>{{ group.title }}</span>
            <span class="ar-muted">{{ group.learned }} / {{ group.total }}</span>
          </div>
          <div class="ar-bar">
            <span :style="{ width: pct(group) + '%', background: '#d9a441' }"></span>
          </div>
        </div>
      </section>

      <section v-if="data.recent?.length" class="ar-card">
        <h3 class="ar-card-title">Закреплено последним</h3>
        <div class="ar-row ar-recent">
          <button
            v-for="w in data.recent"
            :key="w.bare"
            class="ar-chip"
            @click="sheet = { kind: 'word', value: w.bare }"
          >
            <span class="ar-ar">{{ w.text }}</span>
            <small class="ar-muted">{{ (w.meanings || [])[0] }}</small>
          </button>
        </div>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Вехи</h3>
        <div class="ar-grid">
          <div v-for="a in achievements" :key="a.code" class="ar-ach" :class="{ earned: a.earned }">
            <b>{{ a.earned ? "🏅" : "▫️" }} {{ a.title }}</b>
            <small v-if="a.earned">{{ new Date(a.earnedAt).toLocaleDateString("ru-RU") }}</small>
          </div>
        </div>
      </section>
    </template>

    <ArSheet v-if="sheet" :kind="sheet.kind" :value="sheet.value" @close="sheet = null" />
  </div>
</template>

<style scoped>
.ar-progress {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ar-progress-top {
  justify-content: space-between;
}

.ar-progress-top div {
  display: flex;
  flex-direction: column;
}

.ar-progress-top b {
  font-size: 22px;
}

.ar-progress-top span {
  font-size: 12px;
  color: #7a7f8e;
}

.ar-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.ar-group-head {
  justify-content: space-between;
  font-size: 14px;
}

.ar-recent {
  gap: 6px;
}

.ar-recent .ar-chip {
  flex-direction: column;
  gap: 0;
  cursor: pointer;
}

.ar-recent .ar-ar {
  font-size: 19px;
}

.ar-ach {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid #2a2d38;
  background: #22242d;
  color: #7a7f8e;
  font-size: 13px;
}

.ar-ach.earned {
  color: #e8eaf2;
  border-color: #6a5320;
}
</style>
