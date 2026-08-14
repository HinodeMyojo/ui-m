<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { spawnRoadmapItem, spawnTask } from "@/components/resumeApi.js";
import { fetchRoadmaps, fetchRoadmapFull } from "@/components/roadmapApi.js";

// Создание пункта roadmap или задачи из плановой строки.
// Диалог намеренно подробный: пользователь должен видеть, что именно и куда
// создаётся, до того как нажмёт кнопку. Ничего не создаётся «где-то само».

const props = defineProps({
  bullet: { type: Object, required: true },
  kind: { type: String, default: "roadmap" }, // roadmap | task
});

const emit = defineEmits(["close", "created"]);

const roadmaps = ref([]);
const quarters = ref([]);
const busy = ref(false);
const error = ref("");

const form = ref({
  roadmapId: "",
  quarterId: "",
  type: "book",
  tier: 1,
  title: props.bullet.text || "",
  author: "",
  url: "",
  description: `Из плановой строки резюме: «${props.bullet.text || ""}»`,
  estimateHours: 0,
  end: props.bullet.deadline || "",
});

const ITEM_TYPES = [
  { code: "book", title: "Книга" },
  { code: "paper", title: "Статья" },
  { code: "standard", title: "Стандарт / нормативка" },
  { code: "course", title: "Курс" },
  { code: "cert", title: "Сертификация" },
  { code: "project", title: "Pet-проект" },
  { code: "other", title: "Другое" },
];

const selectedRoadmap = computed(
  () => roadmaps.value.find((r) => r.id === form.value.roadmapId) || null,
);
const selectedQuarter = computed(
  () => quarters.value.find((q) => q.id === form.value.quarterId) || null,
);

// Предпросмотр: одной фразой, что именно появится после нажатия.
const preview = computed(() => {
  if (props.kind === "task") {
    return `Задача «${form.value.title}»${form.value.end ? `, дедлайн ${form.value.end}` : ""}`;
  }
  const type = ITEM_TYPES.find((t) => t.code === form.value.type)?.title || form.value.type;
  const where = selectedQuarter.value
    ? `квартал «${selectedQuarter.value.title}»`
    : "бэклог (без квартала)";
  const roadmap = selectedRoadmap.value ? `«${selectedRoadmap.value.title}»` : "—";
  return `${type}, эшелон ${form.value.tier} → roadmap ${roadmap}, ${where}`;
});

async function loadRoadmaps() {
  if (props.kind !== "roadmap") return;
  roadmaps.value = await fetchRoadmaps();
  const active = roadmaps.value.find((r) => r.isActive) || roadmaps.value[0];
  if (active) form.value.roadmapId = active.id;
}

async function loadQuarters() {
  quarters.value = [];
  form.value.quarterId = "";
  if (!form.value.roadmapId) return;
  const full = await fetchRoadmapFull(form.value.roadmapId);
  quarters.value = full?.quarters || [];
}

watch(() => form.value.roadmapId, loadQuarters);

onMounted(async () => {
  try {
    await loadRoadmaps();
  } catch (e) {
    error.value = e.message;
  }
});

async function submit() {
  error.value = "";
  if (!form.value.title.trim()) {
    error.value = "Название обязательно";
    return;
  }
  busy.value = true;
  try {
    if (props.kind === "task") {
      await spawnTask(props.bullet.id, {
        title: form.value.title,
        description: form.value.description,
        end: form.value.end || null,
      });
    } else {
      if (!form.value.roadmapId) {
        error.value = "Выберите roadmap";
        busy.value = false;
        return;
      }
      await spawnRoadmapItem(props.bullet.id, {
        roadmapId: form.value.roadmapId,
        quarterId: form.value.quarterId || null,
        type: form.value.type,
        tier: Number(form.value.tier),
        title: form.value.title,
        author: form.value.author,
        url: form.value.url,
        description: form.value.description,
        estimateHours: Number(form.value.estimateHours) || 0,
      });
    }
    emit("created");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card rs" style="max-width: 560px; width: 100%; min-height: auto; padding: 24px">
      <h3 style="margin: 0 0 4px">
        {{ kind === "task" ? "Создать задачу из строки" : "Создать пункт roadmap из строки" }}
      </h3>
      <div class="rs-sub" style="margin-bottom: 14px">
        Строка: «{{ bullet.text }}». Связь добавится автоматически.
      </div>

      <template v-if="kind === 'roadmap'">
        <div class="rs-field">
          <label class="rs-label">Roadmap</label>
          <select v-model="form.roadmapId" class="rs-select">
            <option v-for="r in roadmaps" :key="r.id" :value="r.id">{{ r.title }}</option>
          </select>
        </div>

        <div class="rs-field">
          <label class="rs-label">Квартал</label>
          <select v-model="form.quarterId" class="rs-select">
            <option value="">Бэклог — без квартала</option>
            <option v-for="q in quarters" :key="q.id" :value="q.id">
              {{ q.number }}. {{ q.title }}
            </option>
          </select>
        </div>

        <div class="rs-row" style="gap: 10px">
          <div class="rs-field" style="flex: 1">
            <label class="rs-label">Тип</label>
            <select v-model="form.type" class="rs-select">
              <option v-for="t in ITEM_TYPES" :key="t.code" :value="t.code">{{ t.title }}</option>
            </select>
          </div>
          <div class="rs-field" style="width: 140px">
            <label class="rs-label">Эшелон</label>
            <select v-model="form.tier" class="rs-select">
              <option :value="1">1 — в процент</option>
              <option :value="2">2 — важное</option>
              <option :value="3">3 — по желанию</option>
            </select>
          </div>
          <div class="rs-field" style="width: 120px">
            <label class="rs-label">Часов</label>
            <input v-model="form.estimateHours" type="number" min="0" class="rs-input" />
          </div>
        </div>
      </template>

      <div class="rs-field">
        <label class="rs-label">Название</label>
        <input v-model="form.title" class="rs-input" />
      </div>

      <div v-if="kind === 'roadmap'" class="rs-row" style="gap: 10px">
        <div class="rs-field" style="flex: 1">
          <label class="rs-label">Автор</label>
          <input v-model="form.author" class="rs-input" />
        </div>
        <div class="rs-field" style="flex: 1">
          <label class="rs-label">Ссылка</label>
          <input v-model="form.url" class="rs-input" />
        </div>
      </div>

      <div v-else class="rs-field">
        <label class="rs-label">Дедлайн задачи</label>
        <input v-model="form.end" type="date" class="rs-input" />
      </div>

      <div class="rs-field">
        <label class="rs-label">Описание</label>
        <textarea v-model="form.description" class="rs-textarea" />
      </div>

      <div class="rs-field">
        <label class="rs-label">Что будет создано</label>
        <div class="rs-chip" style="display: inline-block; white-space: normal">{{ preview }}</div>
      </div>

      <div v-if="error" class="rs-error" style="margin-bottom: 10px">{{ error }}</div>

      <div class="rs-row">
        <span class="rs-spacer" />
        <button class="rs-btn" @click="emit('close')">Отмена</button>
        <button class="rs-btn is-primary" :disabled="busy" @click="submit">
          {{ busy ? "Создаю…" : "Создать и привязать" }}
        </button>
      </div>
    </div>
  </div>
</template>
