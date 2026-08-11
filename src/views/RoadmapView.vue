<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/roadmap.css";

import {
  fetchRoadmaps,
  fetchRoadmapFull,
  seedRoadmap,
  updateRoadmap,
  createRoadmap,
  deleteRoadmap,
  percent,
  formatHours,
  roadmapToday,
} from "@/components/roadmapApi.js";
import RoadmapPlanTab from "@/components/roadmap/RoadmapPlanTab.vue";
import RoadmapFeedsTab from "@/components/roadmap/RoadmapFeedsTab.vue";
import RoadmapCertsTab from "@/components/roadmap/RoadmapCertsTab.vue";
import RoadmapStatsTab from "@/components/roadmap/RoadmapStatsTab.vue";
import RoadmapSettingsModal from "@/components/roadmap/RoadmapSettingsModal.vue";

// Раздел «Roadmap» — docs/roadmap-module.md (back-m).

const router = useRouter();

const TABS = [
  { code: "plan", title: "План" },
  { code: "feeds", title: "Источники" },
  { code: "certs", title: "Сертификации" },
  { code: "stats", title: "Статистика" },
];

const tab = ref(localStorage.getItem("roadmapTab") || "plan");
const roadmaps = ref([]);
const currentId = ref(localStorage.getItem("roadmapId") || "");
const full = ref(null);
const loadError = ref("");
const busy = ref(false);
const settingsOpen = ref(false);

const current = computed(() => roadmaps.value.find((r) => r.id === currentId.value) || null);

function selectTab(code) {
  tab.value = code;
  localStorage.setItem("roadmapTab", code);
}

async function loadList() {
  roadmaps.value = await fetchRoadmaps();
  const known = roadmaps.value.some((r) => r.id === currentId.value);
  if (!known) {
    const active = roadmaps.value.find((r) => r.isActive) || roadmaps.value[0];
    currentId.value = active ? active.id : "";
  }
  if (currentId.value) localStorage.setItem("roadmapId", currentId.value);
}

async function loadFull() {
  if (!currentId.value) {
    full.value = null;
    return;
  }
  full.value = await fetchRoadmapFull(currentId.value, roadmapToday());
}

async function load() {
  loadError.value = "";
  try {
    await loadList();
    await loadFull();
  } catch (e) {
    loadError.value = e.message || "не удалось загрузить roadmap";
  }
}

async function switchRoadmap(id) {
  currentId.value = id;
  localStorage.setItem("roadmapId", id);
  await load();
}

// Первый заход в пустой раздел: заводим готовый финтех-roadmap из сида.
async function runSeed() {
  busy.value = true;
  loadError.value = "";
  try {
    const result = await seedRoadmap();
    if (result?.id) {
      currentId.value = result.id;
      localStorage.setItem("roadmapId", result.id);
    }
    await load();
  } catch (e) {
    loadError.value = e.message || "не удалось наполнить roadmap";
  } finally {
    busy.value = false;
  }
}

async function makeActive() {
  if (!current.value) return;
  await updateRoadmap(current.value.id, { ...current.value, isActive: true });
  await load();
}

async function saveSettings(payload) {
  busy.value = true;
  try {
    if (payload.id) await updateRoadmap(payload.id, payload);
    else await createRoadmap(payload);
    settingsOpen.value = false;
    if (!payload.id) currentId.value = "";
    await load();
  } catch (e) {
    loadError.value = e.message || "не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

async function removeRoadmap() {
  if (!current.value) return;
  if (!confirm(`Удалить roadmap «${current.value.title}» со всеми пунктами и прогрессом?`)) return;
  await deleteRoadmap(current.value.id);
  currentId.value = "";
  settingsOpen.value = false;
  await load();
}

const behindLabel = computed(() => {
  const quarter = (full.value?.quarters || []).find((q) => q.isCurrent);
  if (!quarter) return "";
  const delta = Math.round(quarter.behind * 100);
  if (delta > 2) return `отстаёшь на ${delta}%`;
  if (delta < -2) return `опережаешь на ${-delta}%`;
  return "идёшь по плану";
});

const behindClass = computed(() => {
  const quarter = (full.value?.quarters || []).find((q) => q.isCurrent);
  if (!quarter) return "";
  if (quarter.behind > 0.02) return "is-late";
  if (quarter.behind < -0.02) return "is-ahead";
  return "";
});

onMounted(load);
</script>

<template>
  <div class="rm">
    <div class="rm-header">
      <div>
        <h1>{{ full?.emoji || "🗺️" }} {{ full?.title || "Roadmap" }}</h1>
        <div v-if="full" class="rm-sub">
          {{ full.subtitle }}
          <template v-if="full.targetHoursPerWeek">
            · цель {{ full.targetHoursPerWeek }} ч/нед
          </template>
        </div>
      </div>

      <div class="rm-tabs">
        <button
          v-for="t in TABS"
          :key="t.code"
          class="rm-tab"
          :class="{ 'is-active': tab === t.code }"
          @click="selectTab(t.code)"
        >
          {{ t.title }}
        </button>
      </div>

      <div class="rm-row">
        <select
          v-if="roadmaps.length > 1"
          class="rm-select"
          :value="currentId"
          @change="switchRoadmap($event.target.value)"
        >
          <option v-for="r in roadmaps" :key="r.id" :value="r.id">
            {{ r.emoji }} {{ r.title }}
          </option>
        </select>
        <button v-if="full && !full.isActive" class="rm-btn" @click="makeActive">
          ⭐ Сделать активным
        </button>
        <button class="rm-btn" @click="settingsOpen = true">⚙️</button>
        <button class="rm-btn" @click="router.push('/roadmap/today')">📱 Экран чтения</button>
        <button class="rm-btn" @click="router.push('/')">← Назад</button>
      </div>
    </div>

    <div v-if="loadError" class="rm-error">{{ loadError }}</div>

    <div v-if="full" class="rm-kpis">
      <div class="rm-kpi">
        <span>Прогресс года (Э1)</span>
        <strong>{{ percent(full.progress) }}</strong>
      </div>
      <div class="rm-kpi">
        <span>Часов всего</span>
        <strong>{{ formatHours(full.hoursTotal) }}</strong>
      </div>
      <div class="rm-kpi">
        <span>Темп</span>
        <strong>{{ formatHours(full.pacePerWeek) }}/нед</strong>
      </div>
      <div class="rm-kpi">
        <span>Осталось по Э1</span>
        <strong>{{ formatHours(full.hoursRemaining) }}</strong>
      </div>
      <div class="rm-kpi">
        <span>Прогноз финиша</span>
        <strong>{{ full.forecastDate || "—" }}</strong>
      </div>
      <div v-if="behindLabel" class="rm-kpi">
        <span>Текущий квартал</span>
        <strong class="rm-behind" :class="behindClass">{{ behindLabel }}</strong>
      </div>
    </div>

    <div v-if="!full && !loadError" class="rm-card">
      <p class="rm-desc">
        Ни одного roadmap'а пока нет. Можно налить готовый план «Senior .NET → архитектор
        финтеха» — 4 квартала, книги, статьи, стандарты, курсы, сертификации, pet-проекты
        и источники. Прогресс и конспекты сид не трогает, так что прогонять его можно
        повторно.
      </p>
      <div class="rm-row">
        <button class="rm-btn is-primary" :disabled="busy" @click="runSeed">
          {{ busy ? "Наполняю…" : "📥 Налить финтех-roadmap" }}
        </button>
        <button class="rm-btn" @click="settingsOpen = true">＋ Создать свой</button>
      </div>
    </div>

    <template v-if="full">
      <RoadmapPlanTab v-if="tab === 'plan'" :roadmap="full" @changed="loadFull" />
      <RoadmapFeedsTab v-else-if="tab === 'feeds'" :roadmap-id="full.id" />
      <RoadmapCertsTab v-else-if="tab === 'certs'" :roadmap-id="full.id" />
      <RoadmapStatsTab v-else-if="tab === 'stats'" :roadmap="full" />
    </template>

    <RoadmapSettingsModal
      v-if="settingsOpen"
      :roadmap="full"
      @close="settingsOpen = false"
      @save="saveSettings"
      @delete="removeRoadmap"
      @seed="runSeed"
    />
  </div>
</template>
