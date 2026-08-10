<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchSportGoalSummary,
  closeSportGoal,
  SPORT_PR_LABELS,
  sportFormatPR,
} from "@/components/sportApi.js";

const props = defineProps({
  goalId: { type: String, required: true },
  today: { type: String, required: true },
});
const emit = defineEmits(["close", "closed-goal"]);

const data = ref(null);
const error = ref("");
const verdict = ref("");
const saving = ref(false);

// Кадры сопоставляем по ракурсу, чтобы «до» и «после» стояли рядом,
// а не в порядке загрузки.
const pairs = computed(() => {
  if (!data.value) return [];
  const first = data.value.firstPhotos || [];
  const last = data.value.lastPhotos || [];
  const slots = [...new Set([...first, ...last].map((p) => p.slotId || "none"))];
  return slots.map((slot) => ({
    slot,
    title: [...first, ...last].find((p) => (p.slotId || "none") === slot)?.slotTitle || "Без ракурса",
    before: first.find((p) => (p.slotId || "none") === slot) || null,
    after: last.find((p) => (p.slotId || "none") === slot) || null,
  }));
});

function thumb(photo) {
  return photo ? `data:image/jpeg;base64,${photo.thumbnail}` : "";
}

function deltaOf(m) {
  if (m.actualStart === null || m.currentValue === null) return null;
  return m.currentValue - m.actualStart;
}

// Хорошо ли изменение — зависит от того, растёт метрика к цели или падает.
function deltaGood(m) {
  const d = deltaOf(m);
  if (d === null || m.actualStart === null) return null;
  const wantUp = m.targetValue > m.actualStart;
  if (Math.abs(d) < 1e-9) return null;
  return wantUp ? d > 0 : d < 0;
}

async function load() {
  error.value = "";
  try {
    data.value = await fetchSportGoalSummary(props.goalId, props.today);
    verdict.value = data.value.goal.verdict || "";
  } catch (e) {
    error.value = e.message || "не удалось загрузить итог";
  }
}

async function close(status) {
  saving.value = true;
  try {
    await closeSportGoal(props.goalId, { verdict: verdict.value, status });
    emit("closed-goal");
  } catch (e) {
    error.value = e.message || "не удалось закрыть цикл";
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="sp-modal-backdrop" @click.self="emit('close')">
    <div class="sp-modal is-wide">
      <div class="sp-modal-head">
        <h3>Итог цикла{{ data ? `: ${data.goal.title}` : "" }}</h3>
        <button class="sp-btn sp-btn-sm" @click="emit('close')">✕</button>
      </div>

      <div class="sp-modal-body">
        <div v-if="error" class="sp-error">{{ error }}</div>
        <div v-if="!data" class="sp-empty">Загрузка…</div>

        <template v-else>
          <div class="sp-muted">
            {{ data.goal.startDate }} — {{ data.goal.endDate }} ·
            прошло {{ data.goal.daysPassed }} из {{ data.goal.daysTotal }} дней
          </div>

          <div class="sp-row">
            <div class="sp-stat">
              <div class="sp-stat-label">Тренировок</div>
              <div class="sp-stat-value">{{ data.workoutsDone }}<span class="sp-muted" style="font-size: 13px">/{{ data.workoutsPlan }}</span></div>
            </div>
            <div class="sp-stat">
              <div class="sp-stat-label">Тоннаж</div>
              <div class="sp-stat-value">{{ Math.round(data.totalVolumeKg) }} кг</div>
            </div>
            <div class="sp-stat">
              <div class="sp-stat-label">Время в зале</div>
              <div class="sp-stat-value">{{ Math.round(data.totalMinutes / 60) }} ч</div>
            </div>
            <div class="sp-stat">
              <div class="sp-stat-label">Дней с фото</div>
              <div class="sp-stat-value">{{ data.photoDays }}</div>
            </div>
            <div class="sp-stat">
              <div class="sp-stat-label">Дней с замерами</div>
              <div class="sp-stat-value">{{ data.metricDays }}</div>
            </div>
          </div>

          <div class="sp-card">
            <h3>Заявлено / получилось</h3>
            <div class="sp-scroll-x">
              <table class="sp-table">
                <thead>
                  <tr>
                    <th>Метрика</th>
                    <th>Старт</th>
                    <th>Цель</th>
                    <th>Факт</th>
                    <th>Дельта</th>
                    <th>Прогресс</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in data.metrics" :key="m.id">
                    <td>{{ m.metric.emoji }} {{ m.metric.title }}</td>
                    <td>{{ m.actualStart ?? "—" }}</td>
                    <td>{{ m.targetValue }}</td>
                    <td>{{ m.currentValue ?? "—" }}</td>
                    <td
                      :style="{
                        color:
                          deltaGood(m) === null ? '#7a7f8e' : deltaGood(m) ? '#63c94f' : '#e5484d',
                      }"
                    >
                      <template v-if="deltaOf(m) !== null">
                        {{ deltaOf(m) > 0 ? "+" : "" }}{{ deltaOf(m).toFixed(1) }}
                        {{ m.metric.unit }}
                      </template>
                      <template v-else>—</template>
                    </td>
                    <td style="width: 140px">
                      <div class="sp-bar">
                        <span :style="{ width: Math.round((m.progress || 0) * 100) + '%' }"></span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="pairs.length" class="sp-card">
            <h3>До и после</h3>
            <div class="sp-pairs">
              <div v-for="p in pairs" :key="p.slot" class="sp-pair">
                <div class="sp-muted">{{ p.title }}</div>
                <div class="sp-row" style="gap: 8px; align-items: flex-start">
                  <div>
                    <img v-if="p.before" :src="thumb(p.before)" class="sp-pair-img" />
                    <div v-else class="sp-pair-empty">нет</div>
                    <div class="sp-muted">{{ p.before?.date || "" }}</div>
                  </div>
                  <div>
                    <img v-if="p.after" :src="thumb(p.after)" class="sp-pair-img" />
                    <div v-else class="sp-pair-empty">нет</div>
                    <div class="sp-muted">{{ p.after?.date || "" }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="data.newRecords.length" class="sp-card">
            <h3>Рекорды за цикл</h3>
            <div v-for="pr in data.newRecords" :key="pr.id" class="sp-row" style="font-size: 13px">
              <span>🏆 {{ pr.exercise }}</span>
              <div class="sp-spacer"></div>
              <span class="sp-muted">{{ SPORT_PR_LABELS[pr.kind] || pr.kind }}</span>
              <strong>{{ sportFormatPR(pr.kind, pr.value) }}</strong>
              <span class="sp-muted">{{ pr.date }}</span>
            </div>
          </div>

          <div class="sp-field">
            <label>Вердикт</label>
            <textarea v-model="verdict" class="sp-textarea" placeholder="Что вышло и почему" />
          </div>
        </template>
      </div>

      <div class="sp-modal-foot">
        <button class="sp-btn" @click="emit('close')">Закрыть окно</button>
        <div class="sp-spacer"></div>
        <button class="sp-btn is-danger" :disabled="saving || !data" @click="close('failed')">
          Цикл провален
        </button>
        <button class="sp-btn is-primary" :disabled="saving || !data" @click="close('done')">
          Цикл достигнут
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp-pairs {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
}

.sp-pair-img {
  width: 130px;
  border-radius: 8px;
  display: block;
}

.sp-pair-empty {
  width: 130px;
  height: 170px;
  border: 1px dashed #2f3340;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7a7f8e;
  font-size: 12px;
}
</style>
