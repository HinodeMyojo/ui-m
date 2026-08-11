<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/roadmap.css";
import {
  fetchRoadmapToday,
  setItemProgress,
  createSession,
  percent,
  formatHours,
  roadmapToday,
} from "@/components/roadmapApi.js";

// Экран чтения для телефона: только ввод прогресса и часов. Отдельная раскладка,
// а не адаптив десктопной страницы — на диване нужны крупные кнопки, а не таймлайн.

const router = useRouter();

const data = ref(null);
const pages = ref({});
const hours = ref({});
const error = ref("");
const busy = ref(false);

async function load() {
  error.value = "";
  try {
    data.value = await fetchRoadmapToday(roadmapToday());
    for (const item of data.value.active || []) {
      pages.value[item.id] = item.progressCurrent || "";
    }
  } catch (e) {
    error.value = e.message || "не удалось загрузить";
  }
}

function hoursOf(id) {
  const parsed = Number(String(hours.value[id] ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function run(action) {
  busy.value = true;
  error.value = "";
  try {
    await action();
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

function savePages(item) {
  const parsed = parseInt(pages.value[item.id], 10);
  if (!Number.isFinite(parsed)) return;
  return run(async () => {
    await setItemProgress(item.id, { current: parsed, hours: hoursOf(item.id), date: roadmapToday() });
    hours.value[item.id] = "";
  });
}

function addPages(item, delta) {
  return run(async () => {
    await setItemProgress(item.id, { delta, hours: hoursOf(item.id), date: roadmapToday() });
    hours.value[item.id] = "";
  });
}

function logHours(item) {
  const value = hoursOf(item.id);
  if (!value) return;
  return run(async () => {
    await createSession(item.id, { hours: value, date: roadmapToday() });
    hours.value[item.id] = "";
  });
}

function start(item) {
  return run(() => setItemProgress(item.id, { delta: 0, hours: 0.25, date: roadmapToday() }));
}

onMounted(load);
</script>

<template>
  <div class="rm rmm">
    <div class="rmm-top">
      <button class="rm-btn" @click="router.push('/roadmap')">←</button>
      <strong>{{ data?.emoji }} Чтение</strong>
      <div class="rm-spacer" />
      <span class="rm-sub">{{ roadmapToday() }}</span>
    </div>

    <div v-if="error" class="rm-error">{{ error }}</div>

    <div v-if="data?.roadmapId" class="rm-card rmm-block">
      <div class="rm-widget-head">
        <strong>Q{{ data.quarterNumber }} · {{ data.quarterTitle }}</strong>
        <span>{{ percent(data.quarterProgress) }}</span>
      </div>
      <div class="rm-bar">
        <div class="rm-bar-fill" :style="{ width: percent(data.quarterProgress) }" />
      </div>
      <div class="rmm-hero-meta" style="margin-top: 8px">
        Сегодня {{ formatHours(data.hoursToday) }} · за неделю {{ formatHours(data.hoursLast7) }}
        <template v-if="data.targetPerWeek"> из {{ data.targetPerWeek }} ч</template>
        <template v-if="data.behind > 0.02"> · отстаёшь на {{ Math.round(data.behind * 100) }}%</template>
        <template v-else-if="data.behind < -0.02"> · опережаешь на {{ -Math.round(data.behind * 100) }}%</template>
      </div>
    </div>

    <div v-for="item in data?.active || []" :key="item.id" class="rm-card rmm-block rmm-hero">
      <div>
        <div class="rmm-hero-title">{{ item.emoji }} {{ item.title }}</div>
        <div class="rmm-hero-meta">
          {{ item.author }}
          <template v-if="item.progressTotal">
            · {{ item.progressCurrent }}/{{ item.progressTotal }} {{ item.progressUnit }}
          </template>
        </div>
      </div>

      <div class="rm-bar">
        <div class="rm-bar-fill" :style="{ width: percent(item.progress) }" />
      </div>

      <div v-if="item.progressTotal" class="rmm-pages">
        <input
          v-model="pages[item.id]"
          class="rm-input"
          type="number"
          inputmode="numeric"
          :disabled="busy"
        />
        <button class="rm-btn is-primary" :disabled="busy" @click="savePages(item)">
          Записать
        </button>
      </div>

      <div class="rmm-pages">
        <input
          v-model="hours[item.id]"
          class="rm-input"
          type="number"
          step="0.25"
          inputmode="decimal"
          placeholder="часы"
          :disabled="busy"
        />
        <button class="rm-btn" :disabled="busy" @click="logHours(item)">+ сессия</button>
      </div>

      <div v-if="item.progressTotal" class="rmm-quick">
        <button class="rm-btn" :disabled="busy" @click="addPages(item, 5)">+5</button>
        <button class="rm-btn" :disabled="busy" @click="addPages(item, 10)">+10</button>
        <button class="rm-btn" :disabled="busy" @click="addPages(item, 25)">+25</button>
        <button class="rm-btn" :disabled="busy" @click="addPages(item, 50)">+50</button>
      </div>
    </div>

    <div v-if="data?.next?.length" class="rm-card rmm-block">
      <h3 style="margin: 0 0 6px; font-size: 15px">Дальше по плану</h3>
      <div v-for="item in data.next" :key="item.id" class="rmm-list-item">
        <span>{{ item.emoji }}</span>
        <span style="flex: 1">{{ item.title }}</span>
        <button class="rm-btn is-small" :disabled="busy" @click="start(item)">Начать</button>
      </div>
    </div>

    <div v-if="data && !data.roadmapId" class="rm-card rmm-block">
      <p class="rm-sub">Активного roadmap'а нет. Откройте раздел и отметьте один активным.</p>
      <button class="rm-btn" @click="router.push('/roadmap')">К разделу</button>
    </div>
  </div>
</template>
