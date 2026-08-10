<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/sport.css";

import { fetchSportSettings, sportToday } from "@/components/sportApi.js";
import SportOverviewTab from "@/components/sport/SportOverviewTab.vue";
import SportDiaryTab from "@/components/sport/SportDiaryTab.vue";
import SportPhotosTab from "@/components/sport/SportPhotosTab.vue";
import SportPlanTab from "@/components/sport/SportPlanTab.vue";
import SportExercisesTab from "@/components/sport/SportExercisesTab.vue";
import SportSettingsTab from "@/components/sport/SportSettingsTab.vue";

const router = useRouter();

const TABS = [
  { code: "overview", title: "Обзор" },
  { code: "diary", title: "Дневник" },
  { code: "photos", title: "Фото" },
  { code: "plan", title: "План" },
  { code: "exercises", title: "Упражнения" },
  { code: "settings", title: "Настройки" },
];

// Вкладку помним между заходами: возвращаться каждый раз на «Обзор» надоедает.
const tab = ref(localStorage.getItem("sportTab") || "overview");
const settings = ref(null);
const loadError = ref("");
const today = sportToday();

function selectTab(code) {
  tab.value = code;
  localStorage.setItem("sportTab", code);
}

async function loadSettings() {
  loadError.value = "";
  try {
    settings.value = await fetchSportSettings();
  } catch (e) {
    loadError.value = e.message || "не удалось загрузить настройки раздела";
  }
}

onMounted(loadSettings);
</script>

<template>
  <div class="sp">
    <div class="sp-header">
      <h1>🏋️ Спорт</h1>
      <div class="sp-tabs">
        <button
          v-for="t in TABS"
          :key="t.code"
          class="sp-tab"
          :class="{ 'is-active': tab === t.code }"
          @click="selectTab(t.code)"
        >
          {{ t.title }}
        </button>
      </div>
      <div class="sp-row">
        <button class="sp-btn" @click="router.push('/sport/today')">📱 Экран дня</button>
        <button class="sp-btn" @click="router.push('/')">← Назад</button>
      </div>
    </div>

    <div v-if="loadError" class="sp-error">{{ loadError }}</div>

    <SportOverviewTab v-if="tab === 'overview'" :today="today" @go="selectTab" />
    <SportDiaryTab v-else-if="tab === 'diary'" :today="today" :settings="settings" />
    <SportPhotosTab v-else-if="tab === 'photos'" :settings="settings" @settings="loadSettings" />
    <SportPlanTab v-else-if="tab === 'plan'" :today="today" />
    <SportExercisesTab v-else-if="tab === 'exercises'" />
    <SportSettingsTab v-else-if="tab === 'settings'" :settings="settings" @saved="loadSettings" />
  </div>
</template>
