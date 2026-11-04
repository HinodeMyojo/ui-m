<script setup>
// Правка устройства ветки: сфера, навык, первый уровень навыка.
// docs/me-module.md (back-m)
//
// Одно окно на все случаи, потому что поля почти одни и те же, а человек
// создаёт ветку подряд: сфера → навык в ней → первый уровень.
import { computed, ref, watch } from "vue";
import {
  createGrowthLevel,
  createGrowthSkill,
  createGrowthSphere,
  deleteGrowthSkill,
  deleteGrowthSphere,
  updateGrowthSkill,
  updateGrowthSphere,
} from "@/components/growthApi.js";
import { growth, growthAct, growthError } from "@/composables/useGrowth.js";

// mode: sphere-new | sphere | skill-new | skill | level-new
const props = defineProps({
  mode: { type: String, required: true },
  target: { type: Object, default: null }, // сфера или навык для правки
  parentId: { type: String, default: null }, // сфера для новой подсферы или навыка
  skillId: { type: String, default: null }, // навык для нового уровня
  afterId: { type: String, default: null }, // откуда стрелка к новому уровню
});
const emit = defineEmits(["close", "created-skill"]);

const PALETTE = ["#7c8cff", "#2bb673", "#f5a524", "#e85d75", "#ff7a45", "#52c41a", "#d4b106", "#13c2c2", "#9254de", "#eb2f96", "#2f54eb", "#2fbfa0", "#8c8c8c"];

const spheres = computed(() => growth.value?.spheres || []);
const skills = computed(() => growth.value?.skills || []);
const isSphere = computed(() => props.mode.startsWith("sphere"));
const isSkill = computed(() => props.mode.startsWith("skill"));
const isNew = computed(() => props.mode.endsWith("-new"));

const form = ref({});
const busy = ref(false);
const local = ref("");

function reset() {
  local.value = "";
  const t = props.target || {};
  const parent = spheres.value.find((s) => s.id === props.parentId);
  if (isSphere.value) {
    form.value = {
      title: t.title || "", emoji: t.emoji || "", color: t.color || parent?.color || PALETTE[0],
      parentId: isNew.value ? props.parentId || "" : t.parentId || "",
    };
  } else if (isSkill.value) {
    form.value = {
      title: t.title || "", emoji: t.emoji || "", description: t.description || "",
      sphereId: t.sphereId || props.parentId || spheres.value[0]?.id || "",
      disciplineBlock: t.disciplineBlock || defaultBlock(props.parentId),
      travelCountry: t.travelCountry || "", persistent: !!t.persistent,
      firstLevel: "",
    };
  } else {
    form.value = { title: "", emoji: "", goal: "", months: 3 };
  }
}
watch(() => [props.mode, props.target?.id, props.parentId], reset, { immediate: true });

// Блок дисциплины по умолчанию — как у соседей по сфере.
function defaultBlock(sphereId) {
  return skills.value.find((s) => s.sphereId === sphereId && s.disciplineBlock)?.disciplineBlock || "";
}

const blocks = computed(() => [...new Set(skills.value.map((s) => s.disciplineBlock).filter(Boolean))].sort());

// Дерево сфер для выбора: «Разработка › Данные». Свою ветку в родители
// предлагать нельзя — сервер тоже не даст.
function descendants(id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of spheres.value) {
      if (s.parentId && out.has(s.parentId) && !out.has(s.id)) {
        out.add(s.id);
        grew = true;
      }
    }
  }
  return out;
}

function pathOf(s) {
  const parts = [];
  const seen = new Set();
  let cur = s;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.title);
    cur = spheres.value.find((x) => x.id === cur.parentId);
  }
  return parts;
}

const sphereOptions = computed(() => {
  const banned = isSphere.value && !isNew.value && props.target ? descendants(props.target.id) : new Set();
  return spheres.value
    .filter((s) => !banned.has(s.id))
    .map((s) => ({ id: s.id, label: pathOf(s).join(" › "), depth: pathOf(s).length }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
});
// Родителем сферы может быть только сфера не глубже второго этажа.
const parentOptions = computed(() => sphereOptions.value.filter((o) => o.depth <= 2));

const title = computed(() => ({
  "sphere-new": props.parentId ? "Новая подсфера" : "Новая сфера",
  sphere: "Сфера",
  "skill-new": "Новый навык",
  skill: "Навык",
  "level-new": "Новый уровень",
}[props.mode]));

async function save() {
  const f = form.value;
  if (!f.title?.trim()) {
    local.value = "Нужно название";
    return;
  }
  busy.value = true;
  let ok = false;
  if (isSphere.value) {
    const body = { title: f.title, emoji: f.emoji, color: f.color };
    if (f.parentId) body.parentId = f.parentId;
    else body.clearParent = true;
    ok = await growthAct(() => (isNew.value ? createGrowthSphere(body) : updateGrowthSphere(props.target.id, body)));
  } else if (isSkill.value) {
    const body = {
      title: f.title, emoji: f.emoji, description: f.description, sphereId: f.sphereId,
      disciplineBlock: f.disciplineBlock, travelCountry: (f.travelCountry || "").trim().toUpperCase(),
      persistent: f.persistent,
    };
    if (isNew.value) {
      const before = new Set(skills.value.map((s) => s.id));
      ok = await growthAct(() => createGrowthSkill(body));
      const created = ok && skills.value.find((s) => !before.has(s.id));
      if (created && f.firstLevel?.trim()) {
        ok = await growthAct(() => createGrowthLevel({ skillId: created.id, title: f.firstLevel.trim() }));
      }
      if (created) emit("created-skill", created.id);
    } else {
      ok = await growthAct(() => updateGrowthSkill(props.target.id, body));
    }
  } else {
    ok = await growthAct(() =>
      createGrowthLevel({
        skillId: props.skillId, title: f.title, emoji: f.emoji, goal: f.goal,
        months: Number(f.months) || 3, after: props.afterId ? [props.afterId] : [],
      }),
    );
  }
  busy.value = false;
  if (ok) emit("close");
  else local.value = growthError.value;
}

async function remove() {
  const what = isSphere.value ? `сферу «${props.target.title}»` : `навык «${props.target.title}» со всеми уровнями`;
  if (!confirm(`Удалить ${what}?`)) return;
  busy.value = true;
  const ok = await growthAct(() =>
    isSphere.value ? deleteGrowthSphere(props.target.id) : deleteGrowthSkill(props.target.id),
  );
  busy.value = false;
  if (ok) emit("close");
  else local.value = growthError.value;
}
</script>

<template>
  <div class="ged-backdrop" @click.self="emit('close')">
    <form class="ged" @submit.prevent="save" @keydown.esc.stop="emit('close')">
      <header>
        <h3>{{ title }}</h3>
        <button type="button" class="ged-x" @click="emit('close')">✕</button>
      </header>

      <div class="ged-row">
        <input v-model="form.emoji" class="ged-emoji" placeholder="🙂" maxlength="8" />
        <input v-model="form.title" class="ged-title" placeholder="Название" autofocus />
      </div>

      <template v-if="isSphere">
        <label>Внутри сферы
          <select v-model="form.parentId">
            <option value="">— верхний уровень —</option>
            <option v-for="o in parentOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
        <div class="ged-label">Цвет</div>
        <div class="ged-colors">
          <button v-for="c in PALETTE" :key="c" type="button" class="ged-color" :class="{ on: form.color === c }"
            :style="{ background: c }" @click="form.color = c" />
          <input v-model="form.color" type="color" title="Свой цвет" />
        </div>
      </template>

      <template v-else-if="isSkill">
        <label>Сфера
          <select v-model="form.sphereId">
            <option v-for="o in sphereOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
        <label>Описание <textarea v-model="form.description" rows="2" placeholder="1–2 предложения: к чему ведёт навык" /></label>
        <label>Блок дисциплины
          <input v-model="form.disciplineBlock" list="ged-blocks" placeholder="IT, Японский язык, Спорт…" />
          <datalist id="ged-blocks"><option v-for="b in blocks" :key="b" :value="b" /></datalist>
          <small>Когда уровень навыка взят в месяц, в дисциплине появляется этот блок.</small>
        </label>
        <label>Страна (для путешествий)
          <input v-model="form.travelCountry" maxlength="2" placeholder="JP, IT, KR…" class="ged-code" />
          <small>Код ISO. Уровни навыка будут брать места из вишлиста страны в «Путешествиях».</small>
        </label>
        <label class="ged-check"><input v-model="form.persistent" type="checkbox" /> Всегда в дисциплине (поддержка)</label>
        <label v-if="isNew">Первый уровень <input v-model="form.firstLevel" placeholder="Например: «Основы» — можно пусто" /></label>
      </template>

      <template v-else>
        <label>Цель <input v-model="form.goal" placeholder="Что умеешь после уровня" /></label>
        <label>Срок, месяцев <input v-model="form.months" type="number" min="1" class="ged-code" /></label>
      </template>

      <div v-if="local" class="ged-error">{{ local }}</div>
      <footer>
        <button v-if="!isNew && target && mode !== 'level-new'" type="button" class="ged-btn danger" :disabled="busy" @click="remove">
          Удалить
        </button>
        <span class="ged-space" />
        <button type="button" class="ged-btn" @click="emit('close')">Отмена</button>
        <button type="submit" class="ged-btn primary" :disabled="busy">{{ isNew ? "Создать" : "Сохранить" }}</button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.ged-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1600;
  background: #0008;
  display: grid;
  place-items: center;
}

.ged {
  width: min(460px, 94vw);
  max-height: 90vh;
  overflow-y: auto;
  background: #16171e;
  border: 1px solid #2a2d38;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #e8eaf0;
  box-shadow: 0 20px 60px #000c;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h3 {
  margin: 0;
  font-size: 17px;
}

.ged-x {
  background: none;
  border: 0;
  color: #9aa0b0;
  font-size: 16px;
  cursor: pointer;
}

.ged-row {
  display: flex;
  gap: 8px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #9aa0b0;
}

label small {
  font-size: 11px;
  color: #7d8396;
}

input,
select,
textarea {
  background: #1d1f28;
  border: 1px solid #2d3040;
  border-radius: 8px;
  color: #e8eaf0;
  padding: 7px 10px;
  font: inherit;
  font-size: 14px;
}

.ged-emoji {
  width: 52px;
  text-align: center;
}

.ged-title {
  flex: 1;
}

.ged-code {
  width: 110px;
}

.ged-check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.ged-label {
  font-size: 13px;
  color: #9aa0b0;
}

.ged-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.ged-color {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.ged-color.on {
  border-color: #fff;
}

.ged-colors input[type="color"] {
  width: 32px;
  height: 28px;
  padding: 0;
}

.ged-error {
  color: #ff7a8a;
  font-size: 13px;
}

footer {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
}

.ged-space {
  flex: 1;
}

.ged-btn {
  border-radius: 8px;
  border: 1px solid #2d3040;
  background: #1d1f28;
  color: #e8eaf0;
  padding: 7px 14px;
  cursor: pointer;
}

.ged-btn.primary {
  background: #6e4aff;
  border-color: #6e4aff;
  color: #fff;
}

.ged-btn.danger {
  color: #ff7a8a;
  border-color: #5a2a33;
}
</style>
