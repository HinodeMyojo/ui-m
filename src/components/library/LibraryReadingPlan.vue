<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { fetchRoadmaps, fetchRoadmapFull, roadmapToday } from "@/components/roadmapApi.js";
import { planDate, daysWord, planStatusWords, planTodayLine } from "@/utils/readingPlan.js";

// План чтения на полке библиотеки: сохранённая прикидка из песочницы roadmap'а.
// Здесь только «что читать сегодня» и кнопка в читалку — править план ходят
// в Roadmap, где видно и график квартала.

const router = useRouter();
const plan = ref(null);

onMounted(async () => {
  try {
    const list = await fetchRoadmaps();
    const active = list.find((r) => r.isActive) || list[0];
    if (!active) return;
    const full = await fetchRoadmapFull(active.id, roadmapToday());
    plan.value = full?.readingPlan?.items?.length ? full.readingPlan : null;
  } catch {
    plan.value = null;
  }
});

const status = computed(() => planStatusWords(plan.value));

function read(row) {
  if (row.pdfFileId) router.push({ path: "/pdfReader", query: { file: row.pdfFileId } });
}
</script>

<template>
  <div v-if="plan" class="lrp">
    <div class="lrp-head">
      <b>📌 План чтения до {{ planDate(plan.targetDate) }}</b>
      <span class="lrp-dim">
        <span :class="`lb-plan-${status.tone}`">{{ status.text }}</span>
        · {{ plan.pagesDone }} из {{ plan.pagesTotal }} стр.
        <template v-if="plan.daysLeft && plan.status !== 'done'">
          · {{ daysWord(plan.daysLeft) }}, ≈ {{ plan.perDay }} стр/день
        </template>
      </span>
      <span class="lb-spacer" />
      <button class="lb-btn is-small" @click="router.push('/roadmap')">Изменить</button>
    </div>
    <div class="lrp-rows">
      <div v-for="row in plan.items" :key="row.itemId" class="lrp-row"
        :class="{ 'is-link': row.pdfFileId && !row.finished, 'is-done': row.finished }" @click="read(row)">
        <span class="lrp-title">{{ row.emoji }} {{ row.title }}</span>
        <span class="lrp-today">{{ planTodayLine(plan, row) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lrp {
  border: 1px solid var(--lb-line, #2a2d38);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lrp-head {
  display: flex;
  align-items: center;
  gap: 4px 10px;
  flex-wrap: wrap;
}

.lrp-dim {
  font-size: 12px;
  color: var(--lb-muted, #7a7f8e);
}

.lrp-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lrp-row {
  display: flex;
  gap: 4px 12px;
  flex-wrap: wrap;
  align-items: baseline;
  padding: 6px 8px;
  border-radius: 8px;
}

.lrp-row.is-link {
  cursor: pointer;
}

.lrp-row.is-link:hover {
  background: rgba(128, 128, 128, 0.12);
}

.lrp-row.is-done {
  opacity: 0.6;
}

.lrp-title {
  font-size: 13.5px;
}

.lrp-today {
  font-size: 12.5px;
  color: #8ab4ff;
}
</style>
