<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchSportTemplate,
  fetchSportExercises,
  createSportTemplate,
  updateSportTemplate,
  deleteSportTemplate,
  fetchSportTemplateVersions,
  restoreSportTemplateVersion,
  SPORT_SET_FIELDS,
} from "@/components/sportApi.js";

const props = defineProps({ templateId: { type: String, default: null } });
const emit = defineEmits(["close", "saved"]);

const exercises = ref([]);
const error = ref("");
const busy = ref(false);
const adding = ref("");

const form = ref({ title: "", note: "", color: "#6e4aff", exercises: [] });

// История изменений. Снимок снимается сам, перед каждой правкой состава, —
// поэтому список наполняется по ходу работы, а не по кнопке «сохранить версию».
const versions = ref([]);
const showVersions = ref(false);
const openVersion = ref(null);

async function loadVersions() {
  if (!props.templateId) return;
  versions.value = await fetchSportTemplateVersions(props.templateId).catch(() => []);
}

async function restoreVersion(no) {
  if (!confirm(`Вернуть состав версии ${no}?

Текущий тоже сохранится в истории.`)) return;
  busy.value = true;
  error.value = "";
  try {
    await restoreSportTemplateVersion(props.templateId, no);
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось вернуть версию";
    busy.value = false;
  }
}

// Подпись подхода в истории: «15 повт.», «8 × 60 кг».
function setLabel(set) {
  const parts = [];
  if (set.reps != null && set.reps !== "") parts.push(`${set.reps} повт.`);
  if (set.weight != null && set.weight !== "") parts.push(`${set.weight} кг`);
  if (set.duration != null && set.duration !== "") parts.push(`${set.duration} с`);
  if (set.distance != null && set.distance !== "") parts.push(`${set.distance} м`);
  return parts.join(" × ") || "—";
}

// Подпись всего упражнения: «3 × 18 повт.», а если подходы разные — перечислением.
function setsLabel(sets) {
  const labels = (sets || []).map(setLabel);
  if (!labels.length) return "без подходов";
  const same = labels.every((l) => l === labels[0]);
  return same && labels.length > 1 ? `${labels.length} × ${labels[0]}` : labels.join(" / ");
}

// --- Что именно поменялось ---
//
// Снимок пишется ПЕРЕД правкой, поэтому сам по себе он отвечает на вопрос
// «как было», но не на «что сделали». Ответ — разница со следующим состоянием:
// для самого свежего снимка это текущий состав, для остальных — снимок новее.
// Без этого список версий читается как одинаковые строки с датами.

function compositionOf(items) {
  return (items || []).map((ex) => ({
    id: ex.exerciseId,
    title: ex.exercise?.title || exerciseById(ex.exerciseId).title || "упражнение удалено",
    emoji: ex.exercise?.emoji || exerciseById(ex.exerciseId).emoji || "",
    label: setsLabel(ex.sets),
  }));
}

// Текущий состав берём из формы: он может быть уже поправлен, но не сохранён —
// и тогда честнее показать разницу именно с тем, что на экране.
const currentComposition = computed(() =>
  compositionOf(
    form.value.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      sets: ex.sets.map((s) => {
        const out = {};
        for (const f of SPORT_SET_FIELDS) out[f.code] = numeric(s[f.code]);
        return out;
      }),
    })),
  ),
);

function diff(before, after) {
  const out = [];
  const beforeById = new Map(before.map((e) => [e.id, e]));
  const afterById = new Map(after.map((e) => [e.id, e]));

  for (const e of after) {
    if (!beforeById.has(e.id)) {
      out.push({ kind: "add", title: e.title, emoji: e.emoji, to: e.label });
    }
  }
  for (const e of before) {
    const now = afterById.get(e.id);
    if (!now) {
      out.push({ kind: "remove", title: e.title, emoji: e.emoji, from: e.label });
    } else if (now.label !== e.label) {
      out.push({ kind: "change", title: e.title, emoji: e.emoji, from: e.label, to: now.label });
    }
  }

  // Перестановка — тоже правка, но упоминаем её только когда больше ничего
  // не менялось: иначе она засоряет список настоящих изменений.
  if (!out.length) {
    const beforeOrder = before.map((e) => e.id).join(",");
    const afterOrder = after.map((e) => e.id).join(",");
    if (beforeOrder !== afterOrder) out.push({ kind: "order" });
  }
  return out;
}

// Лента версий сверху вниз: «Сейчас», затем снимки от свежего к старому.
const timeline = computed(() =>
  versions.value.map((v, i) => {
    const before = compositionOf(v.exercises);
    const after = i === 0 ? currentComposition.value : compositionOf(versions.value[i - 1].exercises);
    return { ...v, composition: before, changes: diff(before, after), isLatest: i === 0 };
  }),
);

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// createdAt приходит строкой «2026-09-12 11:04» — читаем её как есть,
// без Date: разбирать её как UTC значило бы уехать на три часа.
function whenLabel(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(raw || "");
  if (!m) return raw || "";
  const [, , month, day, hh, mm] = m;
  return `${Number(day)} ${MONTHS[Number(month) - 1]}, ${hh}:${mm}`;
}

function exerciseById(id) {
  return exercises.value.find((e) => e.id === id) || { fields: ["reps", "weight"] };
}

function fieldsOf(exerciseId) {
  const codes = exerciseById(exerciseId).fields || ["reps", "weight"];
  return SPORT_SET_FIELDS.filter((f) => codes.includes(f.code));
}

onMounted(async () => {
  exercises.value = await fetchSportExercises().catch(() => []);
  if (!props.templateId) return;
  try {
    const t = await fetchSportTemplate(props.templateId);
    form.value = {
      title: t.title,
      note: t.note || "",
      color: t.color || "#6e4aff",
      exercises: t.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        note: e.note,
        superset: e.superset,
        sets: e.sets.length ? e.sets : [{}],
      })),
    };
  } catch (e) {
    error.value = e.message || "не удалось загрузить шаблон";
  }
  await loadVersions();
});

function addExercise() {
  if (!adding.value) return;
  form.value.exercises.push({
    exerciseId: adding.value,
    sets: [{ reps: 8, weight: null }, { reps: 8, weight: null }, { reps: 8, weight: null }],
  });
  adding.value = "";
}

function numeric(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

async function save() {
  if (!form.value.title.trim()) {
    error.value = "название пустое";
    return;
  }
  busy.value = true;
  error.value = "";
  const payload = {
    title: form.value.title,
    note: form.value.note || null,
    color: form.value.color,
    exercises: form.value.exercises.map((ex, i) => ({
      exerciseId: ex.exerciseId,
      position: i,
      superset: ex.superset,
      note: ex.note || null,
      // Плановые подходы: пустые поля не отправляем нулями, иначе
      // раскатка проставит вес 0 там, где он не задан.
      sets: ex.sets.map((s, j) => {
        const out = { position: j, isPlanned: true, done: false };
        for (const f of SPORT_SET_FIELDS) out[f.code] = numeric(s[f.code]);
        return out;
      }),
    })),
  };
  try {
    if (props.templateId) await updateSportTemplate(props.templateId, payload);
    else await createSportTemplate(payload);
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось сохранить шаблон";
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!props.templateId) return;
  if (!confirm("Удалить шаблон? Уже раскатанные тренировки останутся.")) return;
  busy.value = true;
  try {
    await deleteSportTemplate(props.templateId);
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось удалить";
    busy.value = false;
  }
}
</script>

<template>
  <div class="sp-modal-backdrop" @click.self="emit('close')">
    <div class="sp-modal is-wide">
      <div class="sp-modal-head">
        <h3>
          <template v-if="showVersions">История шаблона</template>
          <template v-else>{{ templateId ? "Шаблон тренировки" : "Новый шаблон" }}</template>
        </h3>
        <button v-if="showVersions" class="sp-btn sp-btn-sm" @click="showVersions = false">
          ‹ к составу
        </button>
        <div class="sp-spacer"></div>
        <button class="sp-btn sp-btn-sm" @click="emit('close')">✕</button>
      </div>

      <div v-if="showVersions" class="sp-modal-body">
        <p class="sp-hist-intro">
          Снимок состава пишется сам, перед каждым изменением. Ниже — что менялось
          и когда: сверху самое свежее.
        </p>

        <div v-if="!versions.length" class="sp-empty">
          Пока пусто: история появится после первой правки состава.
        </div>

        <div v-else class="sp-hist">
          <!-- Голова ленты — то, что в шаблоне прямо сейчас. Без неё непонятно,
               относительно чего показана разница у самой свежей версии. -->
          <div class="sp-hist-item is-now">
            <div class="sp-hist-dot"></div>
            <div class="sp-hist-card">
              <div class="sp-row">
                <strong>Сейчас</strong>
                <span class="sp-muted">состав, который открыт в редакторе</span>
              </div>
              <div v-for="(ex, i) in currentComposition" :key="i" class="sp-hist-line">
                {{ ex.emoji }} {{ ex.title }} <span class="sp-muted">— {{ ex.label }}</span>
              </div>
            </div>
          </div>

          <div v-for="v in timeline" :key="v.no" class="sp-hist-item">
            <div class="sp-hist-dot"></div>
            <div class="sp-hist-card">
              <div class="sp-row">
                <strong>Версия {{ v.no }}</strong>
                <span class="sp-muted">{{ whenLabel(v.createdAt) }} · {{ v.summary }}</span>
                <div class="sp-spacer"></div>
                <button
                  class="sp-btn sp-btn-sm"
                  @click="openVersion = openVersion === v.no ? null : v.no"
                >
                  {{ openVersion === v.no ? "Свернуть состав" : "Показать состав" }}
                </button>
                <button class="sp-btn sp-btn-sm" :disabled="busy" @click="restoreVersion(v.no)">
                  Вернуть
                </button>
              </div>

              <!-- Главное в истории: не «как было», а «что после этого сделали». -->
              <div class="sp-hist-changes">
                <span class="sp-hist-changes-title">
                  Дальше {{ v.isLatest ? "стало" : "поменяли" }}:
                </span>
                <div v-if="!v.changes.length" class="sp-muted">состав не менялся</div>
                <div
                  v-for="(c, i) in v.changes"
                  :key="i"
                  class="sp-hist-change"
                  :class="c.kind"
                >
                  <template v-if="c.kind === 'add'">
                    ＋ {{ c.emoji }} {{ c.title }} <span class="sp-muted">— {{ c.to }}</span>
                  </template>
                  <template v-else-if="c.kind === 'remove'">
                    − {{ c.emoji }} {{ c.title }} <span class="sp-muted">убрали</span>
                  </template>
                  <template v-else-if="c.kind === 'order'">
                    ↕ поменяли порядок упражнений
                  </template>
                  <template v-else>
                    {{ c.emoji }} {{ c.title }}:
                    <s class="sp-hist-was">{{ c.from }}</s>
                    <b class="sp-hist-now">→ {{ c.to }}</b>
                  </template>
                </div>
              </div>

              <div v-if="openVersion === v.no" class="sp-version-body">
                <div v-for="(ex, i) in v.composition" :key="i" class="sp-hist-line">
                  {{ ex.emoji }} {{ ex.title }} <span class="sp-muted">— {{ ex.label }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="sp-modal-body">
        <div v-if="error" class="sp-error">{{ error }}</div>

        <div class="sp-row">
          <div class="sp-field" style="flex: 1">
            <label>Название</label>
            <input v-model="form.title" class="sp-input" placeholder="День А: грудь / трицепс" />
          </div>
          <div class="sp-field" style="width: 70px">
            <label>Цвет</label>
            <input v-model="form.color" class="sp-input" type="color" style="padding: 2px" />
          </div>
        </div>

        <div class="sp-field">
          <label>Заметка</label>
          <input v-model="form.note" class="sp-input" />
        </div>

        <div v-for="(ex, i) in form.exercises" :key="i" class="sp-tex">
          <div class="sp-row">
            <strong>{{ exerciseById(ex.exerciseId).emoji }} {{ exerciseById(ex.exerciseId).title }}</strong>
            <div class="sp-spacer"></div>
            <button class="sp-btn sp-btn-sm" @click="ex.sets.push({ ...ex.sets[ex.sets.length - 1] })">
              + подход
            </button>
            <button class="sp-btn sp-btn-sm is-danger" @click="form.exercises.splice(i, 1)">✕</button>
          </div>
          <div class="sp-scroll-x">
            <table class="sp-table">
              <thead>
                <tr>
                  <th style="width: 26px">#</th>
                  <th v-for="f in fieldsOf(ex.exerciseId)" :key="f.code">{{ f.label }}</th>
                  <th style="width: 34px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(s, j) in ex.sets" :key="j">
                  <td class="sp-muted">{{ j + 1 }}</td>
                  <td v-for="f in fieldsOf(ex.exerciseId)" :key="f.code">
                    <input v-model="s[f.code]" class="sp-input sp-num" type="number" :step="f.step" />
                  </td>
                  <td>
                    <button class="sp-btn sp-btn-sm is-danger" @click="ex.sets.splice(j, 1)">✕</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="sp-row">
          <select v-model="adding" class="sp-select" style="max-width: 320px">
            <option value="">— добавить упражнение —</option>
            <option v-for="e in exercises" :key="e.id" :value="e.id">{{ e.emoji }} {{ e.title }}</option>
          </select>
          <button class="sp-btn" :disabled="!adding" @click="addExercise">Добавить</button>
        </div>
      </div>

      <div class="sp-modal-foot">
        <template v-if="showVersions">
          <div class="sp-spacer"></div>
          <button class="sp-btn is-primary" @click="showVersions = false">Вернуться к составу</button>
        </template>
        <template v-else>
          <button v-if="templateId" class="sp-btn is-danger" :disabled="busy" @click="remove">
            Удалить
          </button>
          <button
            v-if="templateId"
            class="sp-btn sp-btn-sm"
            :disabled="!versions.length"
            :title="versions.length ? 'Что менялось в составе' : 'История появится после первой правки'"
            @click="showVersions = true"
          >
            🕘 История ({{ versions.length }})
          </button>
          <div class="sp-spacer"></div>
          <button class="sp-btn" @click="emit('close')">Отмена</button>
          <button class="sp-btn is-primary" :disabled="busy" @click="save">Сохранить</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp-tex {
  border: 1px solid #232631;
  border-radius: 10px;
  padding: 10px 12px;
}

.sp-num {
  width: 74px;
  min-height: 28px;
  padding: 3px 6px;
}

.sp-hist-intro {
  margin: 0;
  font-size: 12.5px;
  color: #8b90a0;
  line-height: 1.5;
}

/* Лента с вертикальной нитью: история — это порядок событий, а не список
   карточек. Нить рисуется на элементе, точка — на ней. */
.sp-hist {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-left: 6px;
}

.sp-hist-item {
  position: relative;
  padding-left: 20px;
}

.sp-hist-item::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: -16px;
  width: 2px;
  background: #2a2d38;
}

.sp-hist-item:last-child::before {
  display: none;
}

.sp-hist-dot {
  position: absolute;
  left: 0;
  top: 9px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2e2660;
  border: 2px solid #6e4aff;
}

.sp-hist-item.is-now .sp-hist-dot {
  background: #63c94f;
  border-color: #9ff08c;
}

.sp-hist-card {
  border: 1px solid #262a35;
  border-radius: 10px;
  padding: 10px 12px;
  background: #1b1d24;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sp-hist-item.is-now .sp-hist-card {
  border-color: #34502f;
}

.sp-hist-line {
  font-size: 12.5px;
  line-height: 1.5;
}

.sp-hist-changes {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  border-radius: 8px;
  background: #16181e;
  font-size: 12.5px;
  line-height: 1.5;
}

.sp-hist-changes-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7080;
}

.sp-hist-change.add {
  color: #9ff08c;
}

.sp-hist-change.remove {
  color: #e5848a;
}

.sp-hist-change.order {
  color: #8b90a0;
}

.sp-hist-was {
  color: #8b90a0;
}

.sp-hist-now {
  color: #ffd666;
}

.sp-version-body {
  margin-top: 2px;
  padding-left: 9px;
  border-left: 2px solid #2e2660;
  line-height: 1.5;
}
</style>
