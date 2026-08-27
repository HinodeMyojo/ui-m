<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  fetchRoadmapToday,
  setItemProgress,
  percent,
  formatHours,
  roadmapToday,
} from "@/components/roadmapApi.js";

// Roadmap на мобильной главной. Смысл тот же, что у полосы под шапкой на
// десктопе (RoadmapStatusBar): отставание должно бросаться в глаза сразу.
// Поэтому первой строкой идёт не название плана, а «отстаёшь на 12%».
//
// Плюс то, чего на десктопной полосе нет: страницы можно записать прямо
// отсюда. Открыть книгу, дочитать главу и вбить номер страницы — это ровно
// то, что делают с телефона, и ради этого не должно быть трёх переходов.

const router = useRouter();

const data = ref(null);
const pages = ref({});
const loading = ref(true);
const failed = ref(false);
const busy = ref(false);

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    const result = await fetchRoadmapToday(roadmapToday());
    data.value = result?.roadmapId ? result : null;
    for (const item of data.value?.active || []) {
      pages.value[item.id] = item.progressCurrent || "";
    }
  } catch {
    data.value = null;
    failed.value = true;
  } finally {
    loading.value = false;
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

// Порог 2% — шум округления, а не отставание. Те же числа, что в RoadmapStatusBar.
const tone = computed(() => {
  const b = data.value?.behind || 0;
  if (b > 0.15) return "bad";
  if (b > 0.02) return "warn";
  if (b < -0.02) return "ahead";
  return "ok";
});

const toneColor = computed(
  () => ({ bad: "#e5484d", warn: "#ffd666", ahead: "#4aa8ff", ok: "#63c94f" })[tone.value],
);

const statusText = computed(() => {
  const b = Math.round((data.value?.behind || 0) * 100);
  if (tone.value === "ok") return "Идёшь по графику";
  if (tone.value === "ahead") return `Опережаешь на ${-b}%`;
  return `Отстаёшь на ${b}%`;
});

onMounted(load);
</script>

<template>
  <!-- Активного плана нет — карточки нет вовсе, а не пустая рамка. -->
  <section v-if="loading || failed || data" class="m-card">
    <button class="m-card-head" @click="router.push('/roadmap')">
      <span class="m-card-title">🗺️ {{ data?.title || "Roadmap" }}</span>
      <span v-if="data" class="m-card-note">Q{{ data.quarterNumber }}</span>
      <span class="m-chev">›</span>
    </button>

    <template v-if="loading">
      <div class="m-skeleton" style="width: 60%"></div>
      <div class="m-skeleton" style="height: 6px"></div>
    </template>

    <div v-else-if="failed" class="m-err">
      Не загрузился <button class="m-btn m-btn-sm" @click="load">↻</button>
    </div>

    <template v-else-if="data">
      <div class="mrm-status" :style="{ color: toneColor, borderColor: toneColor + '55' }">
        <span class="mrm-status-dot" :style="{ background: toneColor }"></span>
        {{ statusText }}
      </div>

      <div>
        <div class="m-bar">
          <div
            class="m-bar-fill"
            :style="{ width: percent(data.quarterProgress), background: toneColor }"
          />
        </div>
        <div class="mrm-meta">
          {{ data.quarterTitle }} · {{ percent(data.quarterProgress) }} ·
          за неделю {{ formatHours(data.hoursLast7) }}<template v-if="data.targetPerWeek">
            из {{ data.targetPerWeek }} ч</template
          >
        </div>
      </div>

      <div v-if="!data.active.length" class="m-empty">Сейчас ничего не в работе</div>

      <div v-for="item in data.active" :key="item.id" class="mrm-item">
        <div class="mrm-item-title">{{ item.emoji }} {{ item.title }}</div>
        <div class="m-bar">
          <div class="m-bar-fill" :style="{ width: percent(item.progress) }" />
        </div>
        <div class="mrm-item-row">
          <span class="mrm-item-meta">
            <template v-if="item.progressTotal">
              {{ item.progressCurrent }}/{{ item.progressTotal }} {{ item.progressUnit }}
            </template>
            <template v-else>{{ percent(item.progress) }}</template>
          </span>
          <template v-if="item.progressTotal">
            <input
              v-model="pages[item.id]"
              class="m-input mrm-num"
              type="number"
              inputmode="numeric"
              :disabled="busy"
              :aria-label="`Страница в «${item.title}»`"
            />
            <button class="m-btn m-btn-sm m-btn-accent" :disabled="busy" @click="savePages(item)">
              Записать
            </button>
          </template>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.mrm-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 14px;
  font-weight: 700;
}

.mrm-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.mrm-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #7a7f8e;
  line-height: 1.35;
}

.mrm-item {
  border-top: 1px solid #262933;
  padding-top: 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.mrm-item-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mrm-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mrm-item-meta {
  font-size: 12px;
  color: #7a7f8e;
  flex: 1;
  min-width: 0;
}

/* Номер страницы — короткое поле: клавиатура всё равно цифровая,
   а места на строке в обрез. */
.mrm-num {
  width: 74px;
  flex-shrink: 0;
  min-height: 36px;
  text-align: center;
  padding: 0 6px;
}
</style>
