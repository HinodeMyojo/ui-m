<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchRoadmapToday,
  setItemProgress,
  formatHours,
  roadmapToday,
} from "@/components/roadmapApi.js";

// Полоса статуса активного roadmap'а — главная страница, docs/roadmap-module.md.
// Смысл ровно один: отставание должно бросаться в глаза сразу, а не жить
// внизу правой колонки. Поэтому полоса идёт под шапкой, во всю ширину, и
// красится по величине отставания.

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

// behind — доля: сколько времени квартала прошло минус сколько сделано.
const behindPct = computed(() => Math.round((data.value?.behind || 0) * 100));

// Порог 2% — это шум округления, а не отставание.
const tone = computed(() => {
  const b = data.value?.behind || 0;
  if (b > 0.15) return "bad";
  if (b > 0.02) return "warn";
  if (b < -0.02) return "ahead";
  return "ok";
});

const statusLabel = computed(() => {
  if (tone.value === "ahead") return "опережаешь график";
  if (tone.value === "ok") return "идёшь по графику";
  return "отстаёшь от графика";
});

const statusValue = computed(() => {
  if (tone.value === "ok") return "в графике";
  return `${Math.abs(behindPct.value)}%`;
});

// Ожидаемая по времени позиция квартала: прогресс + отставание.
const timeMark = computed(() => {
  const value = (data.value?.quarterProgress || 0) + (data.value?.behind || 0);
  return Math.max(0, Math.min(1, value));
});

const quarterPct = computed(() => Math.round((data.value?.quarterProgress || 0) * 100));

const weekPct = computed(() => {
  const target = data.value?.targetPerWeek || 0;
  if (!target) return 0;
  return Math.min(100, Math.round(((data.value.hoursLast7 || 0) / target) * 100));
});

// Сколько часов недобрано за неделю: цифра понятнее процента.
const weekGap = computed(() => {
  const target = data.value?.targetPerWeek || 0;
  if (!target) return 0;
  return Math.max(0, target - (data.value.hoursLast7 || 0));
});

onMounted(load);
</script>

<template>
  <section v-if="data" class="rmb" :class="'is-' + tone">
    <router-link class="rmb-title" to="/roadmap">
      <span class="rmb-emoji">{{ data.emoji }}</span>
      <span class="rmb-title-text">
        <b>{{ data.title }}</b>
        <small>Q{{ data.quarterNumber }} · {{ data.quarterTitle }}</small>
      </span>
    </router-link>

    <div class="rmb-status">
      <span class="rmb-status-value">{{ statusValue }}</span>
      <span class="rmb-status-label">{{ statusLabel }}</span>
    </div>

    <div class="rmb-gauges">
      <div class="rmb-gauge">
        <div class="rmb-gauge-head">
          <span>Квартал</span><b>{{ quarterPct }}%</b>
        </div>
        <div class="rmb-bar">
          <div class="rmb-bar-fill" :style="{ width: quarterPct + '%' }" />
          <div
            class="rmb-bar-mark"
            :style="{ left: Math.round(timeMark * 100) + '%' }"
            :title="`По времени квартала должно быть ${Math.round(timeMark * 100)}%`"
          />
        </div>
      </div>

      <div class="rmb-gauge">
        <div class="rmb-gauge-head">
          <span>Неделя</span>
          <b>
            {{ formatHours(data.hoursLast7) }}
            <template v-if="data.targetPerWeek">/ {{ data.targetPerWeek }} ч</template>
          </b>
        </div>
        <div class="rmb-bar">
          <div class="rmb-bar-fill is-week" :style="{ width: weekPct + '%' }" />
        </div>
        <div v-if="weekGap > 0.05" class="rmb-gap">не хватает {{ formatHours(weekGap) }}</div>
        <div v-else-if="data.targetPerWeek" class="rmb-gap is-ok">норма недели закрыта</div>
      </div>
    </div>

    <div class="rmb-items">
      <div v-if="!data.active.length" class="rmb-empty">Сейчас ничего не в работе</div>
      <div v-for="item in data.active" :key="item.id" class="rmb-item" :title="item.title">
        <span>{{ item.emoji }}</span>
        <span class="rmb-item-title">{{ item.title }}</span>
        <input
          v-model="pages[item.id]"
          class="rmb-input"
          type="number"
          :disabled="busy"
          @keyup.enter="savePages(item)"
        />
        <button class="rmb-ok" :disabled="busy" @click="savePages(item)">✓</button>
      </div>
    </div>

    <div class="rmb-links">
      <router-link class="rmb-link" to="/roadmap">Раздел</router-link>
      <router-link class="rmb-link" to="/roadmap/today">📱 Чтение</router-link>
    </div>
  </section>
</template>

<style scoped>
.rmb {
  --rmb-tone: #4aa8ff;
  width: 100%;
  box-sizing: border-box;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 8px 16px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--rmb-tone) 14%, #16171d) 0%, #16171d 55%);
  border-bottom: 1px solid #1e2025;
  border-left: 4px solid var(--rmb-tone);
  color: #e8eaf2;
  font-size: 13px;
}

.rmb.is-bad {
  --rmb-tone: #e5484d;
}

.rmb.is-warn {
  --rmb-tone: #ffd666;
}

.rmb.is-ok {
  --rmb-tone: #4aa8ff;
}

.rmb.is-ahead {
  --rmb-tone: #63c94f;
}

.rmb-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;
  min-width: 0;
  flex: 0 1 260px;
}

.rmb-emoji {
  font-size: 20px;
}

.rmb-title-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rmb-title-text b {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rmb-title-text small {
  color: #7a7f8e;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rmb-title:hover b {
  color: var(--rmb-tone);
}

/* Главное на полосе: цифра отставания. Ради неё всё и затевалось. */
.rmb-status {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--rmb-tone) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--rmb-tone) 45%, transparent);
}

.rmb-status-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--rmb-tone);
}

.rmb-status-label {
  font-size: 11px;
  color: #a8adbd;
  white-space: nowrap;
}

.rmb-gauges {
  display: flex;
  gap: 18px;
  flex: 1 1 300px;
  min-width: 0;
}

.rmb-gauge {
  flex: 1 1 0;
  min-width: 110px;
}

.rmb-gauge-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #7a7f8e;
  margin-bottom: 3px;
}

.rmb-gauge-head b {
  color: #e8eaf2;
  white-space: nowrap;
}

.rmb-bar {
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: #2a2d38;
}

.rmb-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--rmb-tone);
  transition: width 0.25s;
}

.rmb-bar-fill.is-week {
  background: #6e4aff;
}

/* Метка «где должен быть по времени» — без неё процент квартала ни о чём. */
.rmb-bar-mark {
  position: absolute;
  top: -3px;
  width: 2px;
  height: 14px;
  background: #ffffff;
  opacity: 0.75;
}

.rmb-gap {
  margin-top: 3px;
  font-size: 11px;
  color: var(--rmb-tone);
}

.rmb-gap.is-ok {
  color: #63c94f;
}

.rmb-items {
  display: flex;
  gap: 8px;
  flex: 1 1 260px;
  min-width: 0;
  flex-wrap: wrap;
}

.rmb-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1e2027;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  padding: 3px 6px;
  min-width: 0;
  max-width: 260px;
}

.rmb-item-title {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rmb-input {
  width: 58px;
  background: #22242d;
  color: #e8eaf2;
  border: 1px solid #2a2d38;
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 12px;
  font-family: inherit;
  box-sizing: border-box;
}

.rmb-input:focus {
  outline: none;
  border-color: #1767fd;
}

.rmb-ok,
.rmb-link {
  background: #22242d;
  color: #e8eaf2;
  border: 1px solid #2a2d38;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}

.rmb-ok:hover,
.rmb-link:hover {
  border-color: #6e4aff;
}

.rmb-ok:disabled {
  opacity: 0.45;
  cursor: default;
}

.rmb-empty {
  color: #7a7f8e;
  font-size: 12px;
}

.rmb-links {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}

/* Планшет: ссылки и карточки чтения уезжают на вторую строку, цифра остаётся. */
@media (max-width: 1200px) {
  .rmb {
    flex-wrap: wrap;
    gap: 12px;
  }

  .rmb-items {
    order: 5;
    flex-basis: 100%;
  }
}

@media (max-width: 700px) {
  .rmb {
    padding: 8px 10px;
    gap: 10px;
  }

  .rmb-title {
    flex: 1 1 100%;
  }

  .rmb-status {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
    padding: 4px 10px;
  }

  .rmb-status-value {
    font-size: 18px;
  }

  .rmb-gauges {
    flex: 1 1 100%;
  }

  .rmb-links {
    flex: 1 1 100%;
  }
}
</style>
