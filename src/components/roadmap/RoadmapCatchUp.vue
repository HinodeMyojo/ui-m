<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { getPdfFiles } from "@/api/pdfFiles.js";
import { saveReadingPlan } from "@/components/roadmapApi.js";
import { pagesPerHour, formatDuration, behindWords } from "@/utils/readingGoal.js";
import {
  catchUpCandidates,
  catchUpResult,
  distributeToCatchUp,
  timeProgressAt,
  todayIso,
  addDays,
} from "@/utils/catchUpPlan.js";

// Песочница: прикинуть, сколько читать в день, чтобы к выбранной дате
// сравняться с графиком. Сама по себе ничего не меняет — справка. Прикидку,
// которая понравилась, можно сохранить планом чтения: тогда её видно на
// странице roadmap'а, в библиотеке и в читалке.
//
// mode: new — чистая прикидка; edit — правка сохранённого плана (подставляем
// его и сохраняем с прежней точкой отсчёта); redo — переделать с нуля.
const props = defineProps({
  full: { type: Object, required: true },
  mode: { type: String, default: "new" },
});
const emit = defineEmits(["close", "saved"]);

const existingPlan = computed(() => props.full?.readingPlan || null);
const editing = computed(() => props.mode === "edit" && !!existingPlan.value);

const quarters = computed(() =>
  (props.full?.quarters || []).filter((q) => (q.items || []).length > 0),
);
const quarterId = ref(null);
const quarter = computed(
  () => quarters.value.find((q) => q.id === quarterId.value) || quarters.value[0] || null,
);

watch(
  quarters,
  (list) => {
    if (quarterId.value) return;
    const planQuarter = editing.value && list.find((q) => q.id === existingPlan.value.quarterId);
    quarterId.value = (planQuarter || list.find((q) => q.isCurrent) || list[0])?.id || null;
  },
  { immediate: true },
);

const candidates = computed(() => catchUpCandidates(quarter.value));

// Срок по умолчанию — две недели: столько человек ещё представляет себе
// целиком, а до конца квартала цифра выходит утешительно маленькой.
const targetDate = ref(addDays(todayIso(), 14));
watch(quarter, (q) => {
  if (q?.endDate && targetDate.value > q.endDate) targetDate.value = q.endDate;
});

const selected = ref([]);
const pages = ref({});

// Правка плана: подставляем его книги. Страницы в песочнице считаются от
// текущей позиции, поэтому берём остаток до цели, а не весь объём плана.
if (editing.value) {
  const plan = existingPlan.value;
  if (plan.targetDate >= todayIso()) targetDate.value = plan.targetDate;
  const known = new Set(candidates.value.map((c) => c.id));
  for (const row of plan.items || []) {
    if (!known.has(row.itemId) || row.pagesLeft <= 0) continue;
    selected.value.push(row.itemId);
    pages.value[row.itemId] = row.pagesLeft;
  }
}

function toggle(id) {
  const idx = selected.value.indexOf(id);
  if (idx === -1) {
    selected.value.push(id);
    if (!pages.value[id]) pages.value[id] = 0;
  } else {
    selected.value.splice(idx, 1);
    pages.value[id] = 0;
  }
}

function spread() {
  const { plan } = distributeToCatchUp({
    quarter: quarter.value,
    candidates: candidates.value,
    selected: selected.value,
    targetDate: targetDate.value,
  });
  pages.value = { ...pages.value, ...plan };
}

// Личный темп чтения — из библиотеки: он же показывается в читалке.
const library = ref([]);
onMounted(async () => {
  try {
    library.value = await getPdfFiles();
  } catch {
    library.value = [];
  }
});
const rate = computed(() => pagesPerHour(null, library.value));

const result = computed(() =>
  catchUpResult({
    quarter: quarter.value,
    candidates: candidates.value,
    plan: pages.value,
    targetDate: targetDate.value,
    rate: rate.value.value,
  }),
);

const nowWords = computed(() => behindWords(result.value.behindNow));
const afterWords = computed(() => behindWords(result.value.behindAfter));
const targetPct = computed(() => Math.round(timeProgressAt(quarter.value, targetDate.value) * 100));

function pct(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

const saving = ref(false);
const saveError = ref("");

async function saveAsPlan() {
  if (!result.value.pagesTotal) return;
  // «Переделать» уже и есть согласие заменить; спрашиваем только из чистой песочницы.
  if (existingPlan.value && props.mode === "new" &&
    !confirm("План чтения уже есть. Заменить его этой прикидкой?")) {
    return;
  }
  saving.value = true;
  saveError.value = "";
  try {
    await saveReadingPlan(props.full.id, {
      quarterId: quarter.value?.id || null,
      targetDate: targetDate.value,
      restart: !editing.value,
      items: result.value.rows.map((row) => ({ itemId: row.id, pages: row.pages })),
    });
    emit("saved");
  } catch (e) {
    saveError.value = e.message || "не удалось сохранить план";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="rcu-overlay" @click.self="emit('close')">
    <div class="rcu">
      <div class="rcu-head">
        <b v-if="editing">✏️ Правка плана чтения</b>
        <b v-else-if="mode === 'redo'">🔁 План чтения заново</b>
        <b v-else>🧮 Песочница: как догнать график</b>
        <button class="rm-btn" @click="emit('close')">✕</button>
      </div>

      <div v-if="!quarter" class="rcu-empty">В плане нет кварталов с материалами.</div>

      <template v-else>
        <div class="rcu-top">
          <label>
            Квартал
            <select v-model="quarterId" class="rcu-input">
              <option v-for="q in quarters" :key="q.id" :value="q.id">
                Q{{ q.number }} · {{ q.title }}
              </option>
            </select>
          </label>
          <label>
            Догнать к
            <input v-model="targetDate" type="date" class="rcu-input" :max="quarter.endDate" />
          </label>
          <div class="rcu-top-note">
            {{ result.days }} дн. · к этой дате пройдёт {{ targetPct }}% квартала,
            сделано {{ pct(result.progressNow) }}
          </div>
        </div>

        <div class="rcu-status" :class="'is-' + nowWords.tone">
          Сейчас {{ nowWords.text }}
        </div>

        <div class="rcu-list">
          <div v-for="c in candidates" :key="c.id" class="rcu-row"
            :class="{ 'is-on': selected.includes(c.id) }">
            <label class="rcu-pick">
              <input type="checkbox" :checked="selected.includes(c.id)" @change="toggle(c.id)" />
              <span class="rcu-title">
                {{ c.emoji }} {{ c.title }}
                <i v-if="!c.counts" class="rcu-dim">не первый эшелон — в процент квартала не идёт</i>
                <i v-else class="rcu-dim">
                  {{ c.current }} из {{ c.total }} {{ c.unit }} · осталось {{ c.remaining }}
                </i>
              </span>
            </label>
            <input v-if="selected.includes(c.id)" v-model="pages[c.id]" type="number" min="0"
              :max="c.remaining" class="rcu-input rcu-num" placeholder="страниц" />
            <span v-if="selected.includes(c.id) && pages[c.id] > 0" class="rcu-perday">
              {{ Math.ceil(Math.min(pages[c.id], c.remaining) / result.days) }} стр/день
            </span>
          </div>
          <div v-if="!candidates.length" class="rcu-empty">
            В этом квартале нечего дочитывать: у материалов не задан объём в страницах.
          </div>
        </div>

        <div class="rcu-actions">
          <button class="rm-btn" :disabled="!selected.length" @click="spread">
            Разложить, чтобы догнать
          </button>
          <span class="rcu-dim">
            разделит недостающий процент между выбранными книгами
          </span>
        </div>

        <div class="rcu-total">
          <div class="rcu-total-main">
            <b>{{ result.pagesTotal }}</b> страниц за {{ result.days }} дн. —
            это <b>{{ result.perDay }}</b> стр/день<span v-if="result.minutesPerDay">,
            ≈ {{ formatDuration(result.minutesPerDay) }} чтения в день</span>
          </div>
          <div class="rcu-total-line" :class="'is-' + afterWords.tone">
            <template v-if="!result.pagesTotal">Выбери материалы и впиши страницы.</template>
            <template v-else-if="result.onSchedule">
              ✅ К {{ targetDate }} сравняешься с графиком: {{ pct(result.progressNow) }} →
              {{ pct(result.progressAfter) }} при плановых {{ targetPct }}%
            </template>
            <template v-else>
              Останется {{ afterWords.text }}: {{ pct(result.progressAfter) }} против плановых
              {{ targetPct }}%. Не хватает ещё {{ pct(result.shortfall) }} квартала — добавь
              материалов или отодвинь дату.
            </template>
          </div>
          <div class="rcu-dim">
            Темп {{ Math.round(rate.value) }} стр/ч.
            <template v-if="editing">
              Отсчёт плана остаётся с {{ existingPlan.startDate }} — прочитанное с тех пор
              не обнулится.
            </template>
            <template v-else>
              Пока не сохранишь, это просто прикидка.
            </template>
          </div>
        </div>

        <div class="rcu-save">
          <button class="rm-btn is-primary" :disabled="!result.pagesTotal || saving" @click="saveAsPlan">
            {{ saving ? "Сохраняю…" : editing ? "💾 Сохранить изменения" : "📌 Сохранить как план чтения" }}
          </button>
          <span v-if="existingPlan && !editing" class="rcu-dim">
            заменит текущий план до {{ existingPlan.targetDate }}
          </span>
          <span v-else-if="!editing" class="rcu-dim">
            план появится здесь, в библиотеке и в читалке
          </span>
          <span v-if="saveError" class="rcu-error">{{ saveError }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.rcu-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 9, 12, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 60;
}

.rcu {
  background: #16171d;
  border: 1px solid #262a36;
  border-radius: 14px;
  width: min(760px, 100%);
  max-height: 88vh;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #e8eaf2;
}

.rcu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.rcu-top {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
}

.rcu-top label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11.5px;
  color: #8f95a6;
}

.rcu-top-note {
  color: #8f95a6;
  font-size: 12px;
  flex: 1;
  min-width: 200px;
}

.rcu-input {
  background: #101116;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  color: #e8eaf2;
  padding: 7px 9px;
  font-size: 13px;
  outline: none;
}

.rcu-input:focus {
  border-color: #6e4aff;
}

.rcu-num {
  width: 110px;
}

.rcu-status {
  font-size: 13px;
  color: #cfd3e0;
}

.rcu-status.is-late {
  color: #ff9ba0;
}

.rcu-status.is-ahead {
  color: #a8e59a;
}

.rcu-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rcu-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #23262f;
  border-radius: 10px;
  flex-wrap: wrap;
}

.rcu-row.is-on {
  border-color: #3b4159;
  background: #1a1c24;
}

.rcu-pick {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1;
  min-width: 220px;
  cursor: pointer;
}

.rcu-title {
  font-size: 13.5px;
  line-height: 1.35;
}

.rcu-dim {
  display: block;
  color: #7a7f8e;
  font-size: 11px;
  font-style: normal;
}

.rcu-perday {
  color: #8ab4ff;
  font-size: 12px;
}

.rcu-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.rcu-total {
  border-top: 1px solid #262a36;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rcu-total-main {
  font-size: 14px;
}

.rcu-total-line {
  font-size: 13px;
  line-height: 1.45;
  color: #cfd3e0;
}

.rcu-total-line.is-late {
  color: #ffc9cb;
}

.rcu-total-line.is-ok,
.rcu-total-line.is-ahead {
  color: #a8e59a;
}

.rcu-save {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.rcu-save .rcu-dim {
  display: inline;
}

.rcu-error {
  color: #ff9ba0;
  font-size: 12px;
}

.rcu-empty {
  color: #7a7f8e;
  font-size: 13px;
}

@media (max-width: 700px) {
  .rcu-num {
    width: 90px;
  }
}
</style>
