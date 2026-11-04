<script setup>
// Из чего состоит дисциплина навыка: строки его блока в плане этого месяца.
// Блок общий у навыков с одним «блоком дисциплины» (у всех IT-навыков —
// «IT»), поэтому правка видна у каждого из них. Новый месяц копирует план
// прошлого — правка остаётся и дальше. docs/me-module.md (back-m)
import { onMounted, ref, watch } from "vue";
import {
  createDisciplineActivity,
  deleteDisciplineActivity,
  disciplineLogicalToday,
  fetchDisciplineMonth,
  updateDisciplineActivity,
} from "@/components/api.js";

const props = defineProps({
  block: { type: String, required: true },
});

const loading = ref(true);
const error = ref("");
const planId = ref("");
const skill = ref(null); // блок в плане месяца
const rows = ref([]); // правимые копии строк
const confirmId = ref("");
const fresh = ref({ emoji: "", title: "", minDesc: "", midDesc: "", maxDesc: "" });

function monthYear() {
  const [y, m] = disciplineLogicalToday().split("-").map(Number);
  return { month: m, year: y };
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const { month, year } = monthYear();
    const data = await fetchDisciplineMonth(month, year);
    planId.value = data.plan?.id || "";
    const name = props.block.trim().toLowerCase();
    skill.value = (data.skills || []).find((s) => !s.general && s.title.trim().toLowerCase() === name) || null;
    rows.value = (skill.value?.activities || []).map((a) => ({ ...a }));
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function changed() {
  window.dispatchEvent(new Event("discipline:reload"));
}

const nul = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// PUT заменяет строку целиком — шлём всё, что у неё было, с правкой поверх:
// иначе слетели бы варианты, замены и привязка к чтению.
async function saveRow(row) {
  if (!row.title.trim()) {
    error.value = "У строки должно быть название";
    return;
  }
  error.value = "";
  try {
    await updateDisciplineActivity(row.id, {
      ...row,
      title: row.title.trim(),
      emoji: row.emoji.trim(),
      minDesc: nul(row.minDesc),
      midDesc: nul(row.midDesc),
      maxDesc: nul(row.maxDesc),
    });
    changed();
  } catch (e) {
    error.value = e.message;
  }
}

async function removeRow(row) {
  confirmId.value = "";
  try {
    await deleteDisciplineActivity(row.id);
    rows.value = rows.value.filter((r) => r.id !== row.id);
    changed();
  } catch (e) {
    error.value = e.message;
  }
}

async function addRow() {
  const f = fresh.value;
  if (!f.title.trim()) {
    error.value = "Напишите, что делать";
    return;
  }
  if (!planId.value || !skill.value) return;
  error.value = "";
  try {
    await createDisciplineActivity({
      planId: planId.value,
      learningSkillId: skill.value.learningSkillId,
      title: f.title.trim(),
      emoji: f.emoji.trim(),
      position: rows.value.length,
      minDesc: nul(f.minDesc),
      midDesc: nul(f.midDesc),
      maxDesc: nul(f.maxDesc),
    });
    fresh.value = { emoji: "", title: "", minDesc: "", midDesc: "", maxDesc: "" };
    await load();
    changed();
  } catch (e) {
    error.value = e.message;
  }
}

watch(() => props.block, load);
onMounted(load);
</script>

<template>
  <section class="sde">
    <div class="sde-head">
      Дисциплина блока «{{ block }}» в этом месяце
      <small>Общая у всех навыков с этим блоком. Новый месяц возьмёт этот же состав.</small>
    </div>
    <div v-if="loading" class="sde-muted">Загрузка…</div>
    <template v-else>
      <p v-if="!skill" class="sde-muted">
        Блока «{{ block }}» в дисциплине этого месяца нет. Он появится, когда уровень навыка возьмут в месяц, —
        тогда здесь можно будет настроить, из чего он состоит.
      </p>
      <template v-else>
        <p v-if="!rows.length" class="sde-muted">Строк пока нет — добавьте ниже.</p>
        <div v-for="r in rows" :key="r.id" class="sde-row">
          <div class="sde-line">
            <input v-model="r.emoji" class="sde-emoji" maxlength="8" placeholder="🙂" @change="saveRow(r)" @keydown.enter.prevent="saveRow(r)" />
            <input v-model="r.title" class="sde-title" placeholder="Что делать" @change="saveRow(r)" @keydown.enter.prevent="saveRow(r)" />
            <button v-if="confirmId !== r.id" type="button" class="sde-x" title="Убрать строку" @click="confirmId = r.id">✕</button>
          </div>
          <div class="sde-levels">
            <input v-model="r.minDesc" placeholder="минимум" @change="saveRow(r)" @keydown.enter.prevent="saveRow(r)" />
            <input v-model="r.midDesc" placeholder="средний" @change="saveRow(r)" @keydown.enter.prevent="saveRow(r)" />
            <input v-model="r.maxDesc" placeholder="максимум" @change="saveRow(r)" @keydown.enter.prevent="saveRow(r)" />
          </div>
          <div v-if="r.source === 'reading'" class="sde-muted">Считается по страницам книги уровня — пороги пересчитываются сами.</div>
          <div v-if="confirmId === r.id" class="sde-confirm">
            Убрать «{{ r.title }}» из дисциплины? Отметки по ней за месяц пропадут.
            <button type="button" class="sde-btn danger" @click="removeRow(r)">Убрать</button>
            <button type="button" class="sde-btn" @click="confirmId = ''">Нет</button>
          </div>
        </div>

        <div class="sde-row sde-new">
          <div class="sde-line">
            <input v-model="fresh.emoji" class="sde-emoji" maxlength="8" placeholder="🙂" @keydown.enter.prevent="addRow" />
            <input v-model="fresh.title" class="sde-title" placeholder="Новая строка: что делать" @keydown.enter.prevent="addRow" />
          </div>
          <div class="sde-levels">
            <input v-model="fresh.minDesc" placeholder="минимум" @keydown.enter.prevent="addRow" />
            <input v-model="fresh.midDesc" placeholder="средний" @keydown.enter.prevent="addRow" />
            <input v-model="fresh.maxDesc" placeholder="максимум" @keydown.enter.prevent="addRow" />
          </div>
          <button type="button" class="sde-btn primary" @click="addRow">+ Добавить строку</button>
        </div>
      </template>
    </template>
    <div v-if="error" class="sde-error">{{ error }}</div>
  </section>
</template>

<style scoped>
.sde {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid #343746;
  border-radius: 10px;
  background: #15161d;
}
.sde-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-weight: 600;
}
.sde-head small,
.sde-muted {
  font-weight: 400;
  font-size: 12px;
  color: #8a8fa3;
  margin: 0;
}
.sde-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 8px;
  border-top: 1px solid #262833;
}
.sde-line,
.sde-levels {
  display: flex;
  gap: 6px;
}
.sde-levels input {
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
  font-size: 14px;
}
.sde-emoji {
  width: 44px;
  text-align: center;
}
.sde-title {
  flex: 1;
  min-width: 0;
}
.sde-x {
  background: none;
  border: none;
  color: #8a8fa3;
  cursor: pointer;
  font-size: 15px;
}
.sde-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #f0b4b4;
}
.sde-btn {
  border: 1px solid #343746;
  background: #1d1f29;
  color: #e8eaf0;
  border-radius: 7px;
  padding: 5px 10px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.sde-btn.primary {
  background: #6e4aff;
  border-color: #6e4aff;
  align-self: flex-start;
}
.sde-btn.danger {
  background: #c0392b;
  border-color: #c0392b;
}
.sde-error {
  color: #ff8a8a;
  font-size: 13px;
}
</style>
