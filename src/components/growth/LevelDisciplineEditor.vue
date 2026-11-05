<script setup>
// Дисциплина уровня: что делать каждый день, пока уровень взят в месяц.
// Строки живут на уровне; взятый уровень ставит их в блок своего навыка, и
// чек-лист показывает их под уровнем. docs/me-module.md (back-m)
import { computed, ref, watch } from "vue";
import { disciplineLogicalToday, fetchDisciplineMonth } from "@/components/api.js";
import {
  addGrowthDiscipline,
  deleteGrowthDiscipline,
  updateGrowthDiscipline,
} from "@/components/growthApi.js";
import { growth, growthAct, levelsById } from "@/composables/useGrowth.js";
import DisciplineSourceFields from "@/components/discipline/DisciplineSourceFields.vue";
import { normalizeSource } from "@/components/discipline/sources.js";

const props = defineProps({
  level: { type: Object, required: true },
  skill: { type: Object, default: null },
});

const blank = () => ({
  emoji: "", title: "", minDesc: "", midDesc: "", maxDesc: "",
  source: "", sourceRef: null, sourceMin: null, sourceMid: null, sourceMax: null,
});

const rows = ref([]);
const fresh = ref(blank());
const adding = ref(false);
const confirmId = ref("");
const busy = ref(false);
watch(
  () => props.level.disciplines,
  (list) => (rows.value = (list || []).map((d) => normalizeSource({ ...d }))),
  { immediate: true },
);
watch(() => props.level.id, () => {
  adding.value = false;
  confirmId.value = "";
  fresh.value = blank();
});

const block = computed(() => (props.skill?.disciplineBlock || props.skill?.title || "").trim());

const nul = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const payload = (r, position) => ({
  title: r.title.trim(),
  emoji: r.emoji.trim(),
  minDesc: nul(r.minDesc),
  midDesc: nul(r.midDesc),
  maxDesc: nul(r.maxDesc),
  source: r.source || "",
  sourceRef: r.source ? r.sourceRef || null : null,
  sourceMin: r.source ? num(r.sourceMin) : null,
  sourceMid: r.source ? num(r.sourceMid) : null,
  sourceMax: r.source ? num(r.sourceMax) : null,
  position,
});

function changed() {
  window.dispatchEvent(new Event("discipline:reload"));
}

async function act(call) {
  busy.value = true;
  const ok = await growthAct(call);
  busy.value = false;
  if (ok) changed();
  return ok;
}

const saveRow = (r) => act(() => updateGrowthDiscipline(r.id, payload(r, r.position)));

async function removeRow(r) {
  confirmId.value = "";
  await act(() => deleteGrowthDiscipline(r.id));
}

async function addRow() {
  if (await act(() => addGrowthDiscipline(props.level.id, payload(fresh.value, rows.value.length)))) {
    fresh.value = blank();
    adding.value = false;
  }
}

// Строки блока без уровня: их можно забрать в уровень вместе с отметками.
const free = ref([]);
async function loadFree() {
  free.value = [];
  if (!block.value || !props.level.picked) return;
  const [y, m] = disciplineLogicalToday().split("-").map(Number);
  try {
    const month = await fetchDisciplineMonth(m, y);
    const name = block.value.toLowerCase();
    const skill = (month.skills || []).find((s) => !s.general && s.title.trim().toLowerCase() === name);
    free.value = (skill?.activities || []).filter((a) => !a.level && !a.isCounter);
  } catch {
    free.value = [];
  }
}
watch(() => [props.level.id, props.level.picked], loadFree, { immediate: true });

async function take(a) {
  if (await act(() => addGrowthDiscipline(props.level.id, { activityId: a.id }))) {
    free.value = free.value.filter((x) => x.id !== a.id);
  }
}

// Строки предыдущего уровня — заготовка для следующего: N5 → N4.
const previous = computed(() =>
  (growth.value?.edges || [])
    .filter((e) => e.toId === props.level.id)
    .map((e) => levelsById.value.get(e.fromId))
    .filter((l) => l?.disciplines?.length),
);

async function copyFrom(other) {
  for (const [i, d] of other.disciplines.entries()) {
    const row = normalizeSource({ ...d, minDesc: d.minDesc || "", midDesc: d.midDesc || "", maxDesc: d.maxDesc || "" });
    if (!(await act(() => addGrowthDiscipline(props.level.id, payload(row, rows.value.length + i))))) return;
  }
}
</script>

<template>
  <section class="lde">
    <div class="lde-head">
      <span>Дисциплина уровня</span>
      <small v-if="level.picked && block">стоит в блоке «{{ block }}» этого месяца</small>
      <small v-else>появится в дисциплине, когда возьмёшь уровень в месяц</small>
    </div>

    <div v-for="r in rows" :key="r.id" class="lde-row">
      <div class="lde-line">
        <input v-model="r.emoji" class="lde-emoji" maxlength="8" placeholder="🙂" @change="saveRow(r)" />
        <input v-model="r.title" class="lde-title" placeholder="Что делать" @change="saveRow(r)" />
        <button v-if="confirmId !== r.id" class="lde-x" title="Убрать строку" @click="confirmId = r.id">✕</button>
      </div>
      <div class="lde-levels">
        <input v-model="r.minDesc" placeholder="минимум" @change="saveRow(r)" />
        <input v-model="r.midDesc" placeholder="средний" @change="saveRow(r)" />
        <input v-model="r.maxDesc" placeholder="максимум" @change="saveRow(r)" />
      </div>
      <DisciplineSourceFields :row="r" :level-id="level.id" @change="saveRow(r)" />
      <div v-if="confirmId === r.id" class="lde-confirm">
        Убрать «{{ r.title }}» из уровня? Из дисциплины месяца строка уйдёт тоже.
        <button class="lde-btn danger" @click="removeRow(r)">Убрать</button>
        <button class="lde-btn" @click="confirmId = ''">Нет</button>
      </div>
    </div>

    <div v-if="adding" class="lde-row lde-new">
      <div class="lde-line">
        <input v-model="fresh.emoji" class="lde-emoji" maxlength="8" placeholder="🙂" />
        <input v-model="fresh.title" class="lde-title" placeholder="Что делать: Дуолинго, глава учебника…" @keydown.enter="addRow" />
      </div>
      <div class="lde-levels">
        <input v-model="fresh.minDesc" placeholder="минимум: 1 урок" />
        <input v-model="fresh.midDesc" placeholder="средний (можно пусто)" />
        <input v-model="fresh.maxDesc" placeholder="максимум (можно пусто)" />
      </div>
      <DisciplineSourceFields :row="fresh" :level-id="level.id" />
      <div class="lde-btns">
        <button class="lde-btn primary" :disabled="busy" @click="addRow">Добавить</button>
        <button class="lde-btn" @click="adding = false">Отмена</button>
      </div>
    </div>
    <button v-else class="lde-link" @click="adding = true">+ строка дисциплины</button>

    <div v-if="free.length" class="lde-take">
      <small>В блоке «{{ block }}» есть строки без уровня — забери их сюда, отметки сохранятся:</small>
      <button v-for="a in free" :key="a.id" class="lde-chip" :disabled="busy" @click="take(a)">
        {{ a.emoji }} {{ a.title }} →
      </button>
    </div>
    <div v-if="!rows.length && previous.length" class="lde-take">
      <button v-for="p in previous" :key="p.id" class="lde-chip" :disabled="busy" @click="copyFrom(p)">
        Взять строки уровня «{{ p.title }}» ({{ p.disciplines.length }})
      </button>
    </div>
  </section>
</template>

<style scoped>
.lde {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lde-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a8fa3;
}
.lde-head small,
.lde-take small {
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: #8a8fa3;
}
.lde-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px;
  border: 1px solid #262833;
  border-radius: 9px;
  background: #15161d;
}
.lde-line,
.lde-levels,
.lde-btns {
  display: flex;
  gap: 6px;
}
.lde-levels input {
  flex: 1;
  min-width: 0;
}
input {
  background: #1d1f29;
  border: 1px solid #343746;
  color: #e8eaf0;
  border-radius: 7px;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
}
.lde-emoji {
  width: 42px;
  text-align: center;
}
.lde-title {
  flex: 1;
  min-width: 0;
}
.lde-x {
  background: none;
  border: none;
  color: #8a8fa3;
  cursor: pointer;
}
.lde-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #f0b4b4;
}
.lde-btn,
.lde-chip {
  border: 1px solid #343746;
  background: #1d1f29;
  color: #e8eaf0;
  border-radius: 7px;
  padding: 5px 10px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.lde-btn.primary {
  background: #6e4aff;
  border-color: #6e4aff;
}
.lde-btn.danger {
  background: #c0392b;
  border-color: #c0392b;
}
.lde-btn:disabled,
.lde-chip:disabled {
  opacity: 0.5;
  cursor: default;
}
.lde-link {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  color: #8ab4ff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.lde-take {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.lde-take small {
  flex-basis: 100%;
}
</style>
