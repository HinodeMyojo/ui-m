<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getPdfFiles } from "@/api/pdfFiles.js";
import { deleteReadingPlan } from "@/components/roadmapApi.js";
import { pagesPerHour, minutesFor, formatDuration } from "@/utils/readingGoal.js";
import { planDate, daysWord, planStatusWords, planTodayLine } from "@/utils/readingPlan.js";

// План чтения на странице roadmap'а: что договорились прочитать к дате, как
// идёт и что читать сегодня. Изменить — открыть песочницу с этим планом,
// переделать — песочница с нуля, удалить — просто убрать.
const props = defineProps({
  roadmap: { type: Object, required: true },
});
const emit = defineEmits(["edit", "redo", "changed"]);

const router = useRouter();
const plan = computed(() => props.roadmap.readingPlan);
const status = computed(() => planStatusWords(plan.value));
const donePct = computed(() =>
  plan.value?.pagesTotal ? Math.round((plan.value.pagesDone / plan.value.pagesTotal) * 100) : 0,
);

// Личный темп — тот же, что у песочницы и читалки.
const library = ref([]);
onMounted(async () => {
  try {
    library.value = await getPdfFiles();
  } catch {
    library.value = [];
  }
});
const rate = computed(() => pagesPerHour(null, library.value).value);
function timeFor(pages) {
  return pages > 0 ? formatDuration(minutesFor(pages, rate.value)) : "";
}

function rowPct(row) {
  const span = row.targetPage - row.startPage;
  return span > 0 ? Math.round((row.pagesDone / span) * 100) : 0;
}

function read(row) {
  router.push({ path: "/pdfReader", query: { file: row.pdfFileId } });
}

const removing = ref(false);
async function remove() {
  if (!confirm("Удалить план чтения? Прочитанное останется в книгах и в roadmap.")) return;
  removing.value = true;
  try {
    await deleteReadingPlan(props.roadmap.id);
    emit("changed");
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <div v-if="plan && plan.items.length" class="rrp">
    <div class="rrp-head">
      <div class="rrp-title">
        <b>📌 План чтения до {{ planDate(plan.targetDate) }}</b>
        <span class="rrp-dim">
          с {{ planDate(plan.startDate) }} ·
          <template v-if="plan.daysLeft">осталось {{ daysWord(plan.daysLeft) }}</template>
          <template v-else>срок вышел</template>
        </span>
      </div>
      <div class="rrp-actions">
        <button class="rm-btn rm-btn-sm" @click="emit('edit')">✏️ Изменить</button>
        <button class="rm-btn rm-btn-sm" @click="emit('redo')">🔁 Переделать</button>
        <button class="rm-btn rm-btn-sm is-danger" :disabled="removing" @click="remove">🗑</button>
      </div>
    </div>

    <div class="rrp-summary">
      <span class="rrp-status" :class="'is-' + status.tone">{{ status.text }}</span>
      <span>прочитано <b>{{ plan.pagesDone }}</b> из {{ plan.pagesTotal }} стр.</span>
      <span v-if="plan.status !== 'done' && plan.status !== 'overdue'">
        <template v-if="plan.todayLeft > 0">
          сегодня ещё <b>{{ plan.todayLeft }}</b> стр. (≈ {{ timeFor(plan.todayLeft) }})
        </template>
        <template v-else>на сегодня норма есть</template>
        · дальше ≈ {{ plan.perDay }} стр/день
      </span>
    </div>
    <div class="rrp-bar"><div :style="{ width: donePct + '%' }" /></div>

    <div class="rrp-list">
      <div v-for="row in plan.items" :key="row.itemId" class="rrp-row" :class="{ 'is-done': row.finished }">
        <div class="rrp-row-main">
          <div class="rrp-row-title">{{ row.emoji }} {{ row.title }}</div>
          <div class="rrp-dim">
            стр. {{ row.startPage }} → {{ row.targetPage }}<span v-if="row.totalPages"> из {{ row.totalPages }}</span>
            · сейчас {{ row.currentPage }} · прочитано {{ row.pagesDone }} из {{ row.targetPage - row.startPage }}
            <template v-if="!row.finished && plan.daysLeft"> · ≈ {{ row.perDay }} стр/день</template>
          </div>
          <div class="rrp-today">{{ planTodayLine(plan, row) }}</div>
          <div class="rrp-bar is-thin"><div :style="{ width: rowPct(row) + '%' }" /></div>
        </div>
        <button v-if="row.pdfFileId && !row.finished" class="rm-btn rm-btn-sm" @click="read(row)">📖 Читать</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rrp {
  background: var(--rm-card);
  border: 1px solid var(--rm-line);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rrp-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.rrp-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rrp-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.rrp-dim {
  color: var(--rm-muted);
  font-size: 12px;
}

.rrp-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 13px;
  color: #cfd3e0;
}

.rrp-status.is-late {
  color: #ff9ba0;
}

.rrp-status.is-ok,
.rrp-status.is-ahead {
  color: #a8e59a;
}

.rrp-bar {
  height: 6px;
  border-radius: 4px;
  background: var(--rm-line);
  overflow: hidden;
}

.rrp-bar.is-thin {
  height: 4px;
  margin-top: 4px;
}

.rrp-bar > div {
  height: 100%;
  background: var(--rm-blue);
  border-radius: 4px;
  transition: width 0.3s;
}

.rrp-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rrp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--rm-line);
  border-radius: 10px;
  background: var(--rm-card-2);
}

.rrp-row.is-done {
  opacity: 0.65;
}

.rrp-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rrp-row-title {
  font-size: 13.5px;
}

.rrp-today {
  font-size: 12.5px;
  color: #8ab4ff;
}

@media (max-width: 600px) {
  .rrp-row {
    flex-wrap: wrap;
  }

  .rrp-row > .rm-btn {
    width: 100%;
  }
}
</style>
