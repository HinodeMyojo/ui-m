<script setup>
import { ref, onMounted } from "vue";
import {
  fetchSportTemplate,
  fetchSportExercises,
  createSportTemplate,
  updateSportTemplate,
  deleteSportTemplate,
  SPORT_SET_FIELDS,
} from "@/components/sportApi.js";

const props = defineProps({ templateId: { type: String, default: null } });
const emit = defineEmits(["close", "saved"]);

const exercises = ref([]);
const error = ref("");
const busy = ref(false);
const adding = ref("");

const form = ref({ title: "", note: "", color: "#6e4aff", exercises: [] });

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
        <h3>{{ templateId ? "Шаблон тренировки" : "Новый шаблон" }}</h3>
        <button class="sp-btn sp-btn-sm" @click="emit('close')">✕</button>
      </div>

      <div class="sp-modal-body">
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
        <button v-if="templateId" class="sp-btn is-danger" :disabled="busy" @click="remove">
          Удалить
        </button>
        <div class="sp-spacer"></div>
        <button class="sp-btn" @click="emit('close')">Отмена</button>
        <button class="sp-btn is-primary" :disabled="busy" @click="save">Сохранить</button>
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
</style>
