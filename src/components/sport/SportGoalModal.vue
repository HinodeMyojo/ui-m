<script setup>
import { ref, onMounted } from "vue";
import {
  fetchSportMetrics,
  createSportGoal,
  updateSportGoal,
  deleteSportGoal,
  sportShiftDate,
} from "@/components/sportApi.js";

const props = defineProps({
  goal: { type: Object, default: null },
  today: { type: String, required: true },
});
const emit = defineEmits(["close", "saved"]);

const metrics = ref([]);
const saving = ref(false);
const error = ref("");

const form = ref({
  title: "",
  description: "",
  emoji: "🎯",
  color: "#6e4aff",
  startDate: props.today,
  endDate: sportShiftDate(props.today, 20),
  status: "active",
  metrics: [],
  wishes: [],
});

onMounted(async () => {
  try {
    metrics.value = await fetchSportMetrics();
  } catch (e) {
    error.value = e.message || "не удалось загрузить метрики";
  }
  if (props.goal) {
    form.value = {
      title: props.goal.title,
      description: props.goal.description || "",
      emoji: props.goal.emoji || "🎯",
      color: props.goal.color || "#6e4aff",
      startDate: props.goal.startDate,
      endDate: props.goal.endDate,
      status: props.goal.status,
      metrics: (props.goal.metrics || []).map((m) => ({
        metricId: m.metricId,
        // В форме показываем именно то, что задано руками: если стартовое
        // значение вычислялось из первого замера, поле должно остаться пустым.
        startValue: m.startValue,
        targetValue: m.targetValue,
      })),
      wishes: (props.goal.wishes || []).map((w) => ({ text: w.text, done: w.done })),
    };
  }
});

function addMetric() {
  const used = new Set(form.value.metrics.map((m) => m.metricId));
  const free = metrics.value.find((m) => !used.has(m.id));
  if (!free) return;
  form.value.metrics.push({
    metricId: free.id,
    startValue: free.lastValue ?? null,
    targetValue: free.lastValue ?? 0,
  });
}

function metricById(id) {
  return metrics.value.find((m) => m.id === id) || {};
}

async function save() {
  if (!form.value.title.trim()) {
    error.value = "название цели пустое";
    return;
  }
  saving.value = true;
  error.value = "";
  const payload = {
    ...form.value,
    metrics: form.value.metrics.map((m, i) => ({
      metricId: m.metricId,
      startValue: m.startValue === "" || m.startValue === null ? null : Number(m.startValue),
      targetValue: Number(m.targetValue),
      position: i,
    })),
    wishes: form.value.wishes.map((w, i) => ({ text: w.text, done: w.done, position: i })),
  };
  try {
    if (props.goal) await updateSportGoal(props.goal.id, payload);
    else await createSportGoal(payload);
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось сохранить цель";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.goal) return;
  if (!confirm(`Удалить цель «${props.goal.title}»? Тренировки и замеры останутся.`)) return;
  saving.value = true;
  try {
    await deleteSportGoal(props.goal.id);
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось удалить цель";
    saving.value = false;
  }
}
</script>

<template>
  <div class="sp-modal-backdrop" @click.self="emit('close')">
    <div class="sp-modal">
      <div class="sp-modal-head">
        <h3>{{ goal ? "Цель" : "Новая цель" }}</h3>
        <button class="sp-btn sp-btn-sm" @click="emit('close')">✕</button>
      </div>

      <div class="sp-modal-body">
        <div v-if="error" class="sp-error">{{ error }}</div>

        <div class="sp-row">
          <div class="sp-field" style="width: 70px">
            <label>Эмодзи</label>
            <input v-model="form.emoji" class="sp-input" maxlength="4" />
          </div>
          <div class="sp-field" style="flex: 1">
            <label>Название</label>
            <input v-model="form.title" class="sp-input" placeholder="Например: сушка к отпуску" />
          </div>
        </div>

        <div class="sp-row">
          <div class="sp-field">
            <label>Начало</label>
            <input v-model="form.startDate" class="sp-input" type="date" />
          </div>
          <div class="sp-field">
            <label>Дедлайн</label>
            <input v-model="form.endDate" class="sp-input" type="date" />
          </div>
          <div v-if="goal" class="sp-field">
            <label>Статус</label>
            <select v-model="form.status" class="sp-select">
              <option value="active">активная</option>
              <option value="done">достигнута</option>
              <option value="failed">провалена</option>
              <option value="archived">архив</option>
            </select>
          </div>
        </div>

        <div class="sp-field">
          <label>Описание</label>
          <textarea v-model="form.description" class="sp-textarea" placeholder="Что хочу получить" />
        </div>

        <div>
          <div class="sp-row">
            <strong style="font-size: 14px">Измеримые метрики</strong>
            <div class="sp-spacer"></div>
            <button class="sp-btn sp-btn-sm" @click="addMetric">+ метрика</button>
          </div>
          <div class="sp-muted" style="margin: 4px 0 8px">
            Старт можно оставить пустым — тогда возьмётся первый замер после начала цикла.
          </div>
          <div v-for="(m, i) in form.metrics" :key="i" class="sp-row" style="margin-bottom: 6px">
            <select v-model="m.metricId" class="sp-select" style="flex: 1">
              <option v-for="opt in metrics" :key="opt.id" :value="opt.id">
                {{ opt.emoji }} {{ opt.title }}
              </option>
            </select>
            <input
              v-model="m.startValue"
              class="sp-input"
              style="width: 100px"
              type="number"
              step="0.1"
              placeholder="старт"
            />
            <span class="sp-muted">→</span>
            <input
              v-model="m.targetValue"
              class="sp-input"
              style="width: 100px"
              type="number"
              step="0.1"
              placeholder="цель"
            />
            <span class="sp-muted" style="width: 40px">{{ metricById(m.metricId).unit }}</span>
            <button class="sp-btn sp-btn-sm is-danger" @click="form.metrics.splice(i, 1)">✕</button>
          </div>
        </div>

        <div>
          <div class="sp-row">
            <strong style="font-size: 14px">Хотелки без цифр</strong>
            <div class="sp-spacer"></div>
            <button class="sp-btn sp-btn-sm" @click="form.wishes.push({ text: '', done: false })">
              + хотелка
            </button>
          </div>
          <div v-for="(w, i) in form.wishes" :key="i" class="sp-row" style="margin-top: 6px">
            <label class="sp-check">
              <input v-model="w.done" type="checkbox" />
            </label>
            <input v-model="w.text" class="sp-input" placeholder="Чтобы пресс было видно" />
            <button class="sp-btn sp-btn-sm is-danger" @click="form.wishes.splice(i, 1)">✕</button>
          </div>
        </div>
      </div>

      <div class="sp-modal-foot">
        <button v-if="goal" class="sp-btn is-danger" :disabled="saving" @click="remove">
          Удалить
        </button>
        <div class="sp-spacer"></div>
        <button class="sp-btn" @click="emit('close')">Отмена</button>
        <button class="sp-btn is-primary" :disabled="saving" @click="save">Сохранить</button>
      </div>
    </div>
  </div>
</template>
