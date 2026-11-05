<script setup>
// Источник строки дисциплины: руками, сессии приложения, план тренировок,
// страницы книги уровня. Правит поля строки на месте и сообщает change.
import { computed, onMounted, ref } from "vue";
import { growth } from "@/composables/useGrowth.js";
import { DISCIPLINE_SOURCES, appRef, loadSourceCatalog, parseAppRef, sourceOf } from "./sources.js";

const props = defineProps({
  row: { type: Object, required: true },
  // Уровень, чьи книги считать по умолчанию у строки «страницы».
  levelId: { type: String, default: "" },
});
const emit = defineEmits(["change"]);

const apps = ref([]);
const studies = ref([]);
const error = ref("");

onMounted(async () => {
  try {
    ({ apps: apps.value, studies: studies.value } = await loadSourceCatalog());
  } catch (e) {
    error.value = e.message;
  }
});

const bookLevels = computed(() =>
  (growth.value?.levels || []).filter((l) => (l.materials || []).some((m) => m.pdfFileId)),
);
const app = computed(() => parseAppRef(props.row.sourceRef));

// Новый источник — пороги по умолчанию, а пустые описания уровней
// подписываются ими же: без описания уровень строке не положен.
function onSource() {
  const r = props.row;
  const src = sourceOf(r.source);
  r.sourceRef = null;
  if (r.source === "app") r.sourceRef = apps.value[0]?.key || null;
  if (r.source === "reading") r.sourceRef = props.levelId || null;
  if (src.defaults) {
    [r.sourceMin, r.sourceMid, r.sourceMax] = src.defaults;
    r.minDesc ||= src.describe(src.defaults[0]);
    r.midDesc ||= src.describe(src.defaults[1]);
    r.maxDesc ||= src.describe(src.defaults[2]);
  } else {
    r.sourceMin = r.sourceMid = r.sourceMax = null;
  }
  emit("change");
}

function setApp(key, course = "") {
  props.row.sourceRef = key ? appRef(key, course) : null;
  emit("change");
}
</script>

<template>
  <div class="dsf">
    <div class="dsf-line">
      <select v-model="row.source" @change="onSource">
        <option v-for="o in DISCIPLINE_SOURCES" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <template v-if="row.source === 'app'">
        <select :value="app.app" @change="setApp($event.target.value)">
          <option value="">— приложение —</option>
          <option v-for="a in apps" :key="a.key" :value="a.key">{{ a.emoji }} {{ a.title }}</option>
        </select>
        <select v-if="app.app === 'japanese'" :value="app.course" @change="setApp(app.app, $event.target.value)">
          <option value="">все курсы</option>
          <option v-for="st in studies" :key="st.id" :value="st.id">{{ st.emoji }} {{ st.name }}</option>
        </select>
      </template>
      <select v-if="row.source === 'reading'" v-model="row.sourceRef" @change="emit('change')">
        <option :value="null">— уровень с книгой —</option>
        <option v-for="l in bookLevels" :key="l.id" :value="l.id">{{ l.emoji }} {{ l.title }}</option>
      </select>
    </div>
    <div v-if="row.source" class="dsf-line dsf-thr">
      <label>мин <input v-model.number="row.sourceMin" type="number" min="0" @change="emit('change')" /></label>
      <label>сред <input v-model.number="row.sourceMid" type="number" min="0" @change="emit('change')" /></label>
      <label>макс <input v-model.number="row.sourceMax" type="number" min="0" @change="emit('change')" /></label>
      <span>{{ sourceOf(row.source).unit }} в день — отмечается само</span>
    </div>
    <div v-if="error" class="dsf-error">{{ error }}</div>
  </div>
</template>

<style scoped>
.dsf {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.dsf-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
select,
input {
  background: #1d1f29;
  border: 1px solid #343746;
  color: #e8eaf0;
  border-radius: 7px;
  padding: 5px 8px;
  font: inherit;
  font-size: 13px;
  min-width: 0;
}
.dsf-thr label,
.dsf-thr span {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #8a8fa3;
}
.dsf-thr input {
  width: 60px;
}
.dsf-error {
  color: #ff8a8a;
  font-size: 12px;
}
</style>
