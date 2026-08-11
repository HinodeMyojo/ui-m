<script setup>
import { ref, onMounted } from "vue";
import "@/styles/roadmap.css";
import {
  fetchRoadmapToday,
  setItemProgress,
  percent,
  formatHours,
  roadmapToday,
} from "@/components/roadmapApi.js";

// Виджет активного roadmap'а: главная и вкладка «Сегодня».
// Активного roadmap'а нет — виджет не показывается вовсе, а не висит пустым.

const props = defineProps({
  // compact — для главной: без полей ввода, только состояние.
  compact: { type: Boolean, default: false },
});

const data = ref(null);
const pages = ref({});
const busy = ref(false);

async function load() {
  try {
    const result = await fetchRoadmapToday(roadmapToday());
    data.value = result?.roadmapId ? result : null;
    for (const item of data.value?.active || []) pages.value[item.id] = item.progressCurrent || "";
  } catch {
    data.value = null;
  }
}

async function savePages(item) {
  const parsed = parseInt(pages.value[item.id], 10);
  if (!Number.isFinite(parsed)) return;
  busy.value = true;
  try {
    await setItemProgress(item.id, { current: parsed, date: roadmapToday() });
    await load();
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-if="data" class="rm rm-widget" style="min-height: 0; padding: 12px">
    <div class="rm-widget-head">
      <router-link to="/roadmap" style="color: inherit; text-decoration: none">
        <strong>{{ data.emoji }} {{ data.title }}</strong>
      </router-link>
      <span>{{ percent(data.quarterProgress) }}</span>
    </div>

    <div class="rm-bar">
      <div class="rm-bar-fill" :style="{ width: percent(data.quarterProgress) }" />
    </div>
    <div class="rm-sub">
      Q{{ data.quarterNumber }} · {{ data.quarterTitle }}
    </div>
    <div class="rm-sub">
      За неделю {{ formatHours(data.hoursLast7) }}
      <template v-if="data.targetPerWeek"> из {{ data.targetPerWeek }} ч</template>
      <template v-if="data.behind > 0.02">
        · <span class="rm-behind is-late">отстаёшь на {{ Math.round(data.behind * 100) }}%</span>
      </template>
      <template v-else-if="data.behind < -0.02">
        · <span class="rm-behind is-ahead">опережаешь</span>
      </template>
    </div>

    <div v-if="!data.active.length" class="rm-sub">Сейчас ничего не в работе.</div>

    <div v-for="item in data.active" :key="item.id" class="rm-widget-item">
      <span>{{ item.emoji }}</span>
      <span
        style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
        :title="item.title"
      >
        {{ item.title }}
      </span>
      <template v-if="compact">
        <span class="rm-sub">{{ percent(item.progress) }}</span>
      </template>
      <template v-else>
        <input
          v-model="pages[item.id]"
          class="rm-input rm-num"
          type="number"
          :disabled="busy"
          @keyup.enter="savePages(item)"
        />
        <button class="rm-btn is-small" :disabled="busy" @click="savePages(item)">✓</button>
      </template>
    </div>

    <div v-if="!compact" class="rm-row">
      <router-link class="rm-btn is-small" to="/roadmap">Раздел</router-link>
      <router-link class="rm-btn is-small" to="/roadmap/today">📱 Экран чтения</router-link>
    </div>
  </div>
</template>
