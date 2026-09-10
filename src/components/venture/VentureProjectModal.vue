<script setup>
import { ref } from "vue";
import {
  VENTURE_STATUSES,
  createLane,
  updateLane,
  deleteLane,
  createPeriod,
  generatePeriods,
  updatePeriod,
  deletePeriod,
  ventureToday,
} from "@/components/ventureApi.js";

// Карточка проекта: она же экран создания нового. Рядом — справочник
// направлений и сетка полос времени: и то и другое настраивается на проект.

const props = defineProps({
  venture: { type: Object, default: null },
  lanes: { type: Array, default: () => [] },
  periods: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "save", "delete", "changed"]);

const creating = ref(!props.venture);
const tab = ref("main");
const error = ref("");
const busy = ref(false);

const form = ref({
  title: props.venture?.title || "",
  subtitle: props.venture?.subtitle || "",
  description: props.venture?.description || "",
  emoji: props.venture?.emoji || "🚀",
  color: props.venture?.color || "#a855f7",
  status: props.venture?.status || "idea",
  startDate: props.venture?.startDate || ventureToday(),
  endDate: props.venture?.endDate || "",
  currency: props.venture?.currency || "RUB",
  budgetPlan: props.venture?.budgetPlan || 0,
  isActive: props.venture?.isActive ?? true,
  archived: props.venture?.archived || false,
});

const newLane = ref({ title: "", color: "#22c55e", emoji: "" });
const generate = ref({ kind: "quarter", startDate: props.venture?.startDate || ventureToday(), count: 4 });

function submit() {
  if (!form.value.title.trim()) {
    error.value = "Нужно название";
    return;
  }
  emit("save", {
    ...form.value,
    id: creating.value ? null : props.venture?.id,
    budgetPlan: Number(form.value.budgetPlan) || 0,
    // Новый проект заводится вместе с направлениями и годом кварталов:
    // пустое полотно без сетки бесполезно.
    withDefaults: creating.value,
  });
}

async function run(action) {
  busy.value = true;
  error.value = "";
  try {
    await action();
    emit("changed");
  } catch (err) {
    error.value = err.message || String(err);
  } finally {
    busy.value = false;
  }
}

async function addLane() {
  if (!newLane.value.title.trim() || !props.venture) return;
  await run(async () => {
    await createLane(props.venture.id, { ...newLane.value, sortOrder: props.lanes.length });
    newLane.value = { title: "", color: "#22c55e", emoji: "" };
  });
}

const saveLane = (lane) => run(() => updateLane(lane.id, lane));
const removeLane = (lane) => run(() => deleteLane(lane.id));

async function addPeriods() {
  if (!props.venture) return;
  await run(() =>
    generatePeriods(props.venture.id, {
      kind: generate.value.kind,
      startDate: generate.value.startDate,
      count: Number(generate.value.count) || 1,
    }),
  );
}

async function addOnePeriod() {
  if (!props.venture) return;
  const start = window.prompt("Начало полосы, ГГГГ-ММ-ДД", ventureToday());
  if (!start) return;
  const end = window.prompt("Конец полосы, ГГГГ-ММ-ДД", start);
  if (!end) return;
  await run(() =>
    createPeriod(props.venture.id, { kind: "custom", title: "", startDate: start, endDate: end }),
  );
}

const savePeriod = (period) => run(() => updatePeriod(period.id, period));
const removePeriod = (period) => run(() => deletePeriod(period.id));
</script>

<template>
  <div class="vt-modal-back" @click.self="emit('close')">
    <div class="vt-modal">
      <div class="vt-row">
        <h3 style="margin: 0">{{ creating ? "Новый проект" : "Проект" }}</h3>
        <div class="vt-spacer" />
        <button v-if="venture && !creating" class="vt-btn is-small" @click="creating = true">
          ＋ Создать другой
        </button>
      </div>

      <div v-if="!creating && venture" class="vt-tabs">
        <button class="vt-tab" :class="{ 'is-active': tab === 'main' }" @click="tab = 'main'">
          Карточка
        </button>
        <button class="vt-tab" :class="{ 'is-active': tab === 'lanes' }" @click="tab = 'lanes'">
          Направления ({{ lanes.length }})
        </button>
        <button class="vt-tab" :class="{ 'is-active': tab === 'periods' }" @click="tab = 'periods'">
          Полосы времени ({{ periods.length }})
        </button>
      </div>

      <div v-if="error" class="vt-error">{{ error }}</div>

      <template v-if="creating || tab === 'main'">
        <div class="vt-form-grid">
          <div class="vt-full">
            <label class="vt-label">Название</label>
            <input v-model="form.title" class="vt-input" placeholder="Игра" />
          </div>
          <div class="vt-full">
            <label class="vt-label">Подпись</label>
            <input v-model="form.subtitle" class="vt-input" placeholder="От идеи до масштабирования" />
          </div>
          <div>
            <label class="vt-label">Эмодзи</label>
            <input v-model="form.emoji" class="vt-input" />
          </div>
          <div>
            <label class="vt-label">Цвет</label>
            <input v-model="form.color" type="color" class="vt-input" style="height: 36px" />
          </div>
          <div>
            <label class="vt-label">Статус</label>
            <select v-model="form.status" class="vt-select" style="width: 100%">
              <option v-for="status in VENTURE_STATUSES" :key="status.code" :value="status.code">
                {{ status.title }}
              </option>
            </select>
          </div>
          <div>
            <label class="vt-label">Старт</label>
            <input v-model="form.startDate" type="date" class="vt-input" />
          </div>
          <div>
            <label class="vt-label">Ориентир финиша</label>
            <input v-model="form.endDate" type="date" class="vt-input" />
          </div>
          <div>
            <label class="vt-label">Валюта</label>
            <select v-model="form.currency" class="vt-select" style="width: 100%">
              <option value="RUB">₽ рубли</option>
              <option value="USD">$ доллары</option>
              <option value="EUR">€ евро</option>
            </select>
          </div>
          <div>
            <label class="vt-label">Общий бюджет</label>
            <input v-model="form.budgetPlan" type="number" class="vt-input" />
          </div>
          <div>
            <label class="vt-label">
              <input v-model="form.isActive" type="checkbox" /> Активный
            </label>
            <div class="vt-muted">Показывается виджетом на главной</div>
          </div>
          <div v-if="!creating">
            <label class="vt-label">
              <input v-model="form.archived" type="checkbox" /> В архиве
            </label>
          </div>
          <div class="vt-full">
            <label class="vt-label">Описание: цель, аудитория, замысел (markdown)</label>
            <textarea v-model="form.description" class="vt-textarea" />
          </div>
        </div>

        <div class="vt-row">
          <button
            v-if="venture && !creating"
            class="vt-btn is-danger"
            @click="emit('delete', venture.id)"
          >
            Удалить проект
          </button>
          <div class="vt-spacer" />
          <button class="vt-btn" @click="emit('close')">Отмена</button>
          <button class="vt-btn is-primary" @click="submit">Сохранить</button>
        </div>
      </template>

      <template v-else-if="tab === 'lanes'">
        <div class="vt-muted">Направление даёт узлу цвет и попадает в легенду карты.</div>
        <div class="vt-list">
          <div v-for="lane in lanes" :key="lane.id" class="vt-item">
            <input v-model="lane.color" type="color" style="width: 34px; height: 26px" />
            <input v-model="lane.emoji" class="vt-input" style="width: 56px" placeholder="🛠" />
            <input v-model="lane.title" class="vt-input" style="flex: 1" />
            <span class="vt-muted">узлов {{ lane.nodeCount }}</span>
            <button class="vt-btn is-small" :disabled="busy" @click="saveLane(lane)">✓</button>
            <button class="vt-btn is-small is-danger" :disabled="busy" @click="removeLane(lane)">
              ✕
            </button>
          </div>
        </div>

        <div class="vt-row">
          <input v-model="newLane.color" type="color" style="width: 34px; height: 30px" />
          <input v-model="newLane.emoji" class="vt-input" style="width: 56px" placeholder="🎯" />
          <input
            v-model="newLane.title"
            class="vt-input"
            style="flex: 1"
            placeholder="Например: Найм"
            @keyup.enter="addLane"
          />
          <button class="vt-btn" :disabled="busy" @click="addLane">Добавить</button>
        </div>
      </template>

      <template v-else>
        <div class="vt-muted">
          Полосы рисуют сетку карты слева направо и держат плановый бюджет отрезка.
        </div>
        <div class="vt-list">
          <div v-for="period in periods" :key="period.id" class="vt-item">
            <input v-model="period.title" class="vt-input" style="flex: 1" />
            <input v-model="period.startDate" type="date" class="vt-input" style="width: 140px" />
            <input v-model="period.endDate" type="date" class="vt-input" style="width: 140px" />
            <input
              v-model="period.budgetPlan"
              type="number"
              class="vt-input"
              style="width: 110px"
              placeholder="бюджет"
            />
            <button class="vt-btn is-small" :disabled="busy" @click="savePeriod(period)">✓</button>
            <button class="vt-btn is-small is-danger" :disabled="busy" @click="removePeriod(period)">
              ✕
            </button>
          </div>
          <div v-if="!periods.length" class="vt-empty">Полос нет — нарежьте сетку ниже.</div>
        </div>

        <div class="vt-row">
          <select v-model="generate.kind" class="vt-select">
            <option value="quarter">кварталы</option>
            <option value="month">месяцы</option>
          </select>
          <input v-model="generate.startDate" type="date" class="vt-input" style="width: 150px" />
          <input v-model="generate.count" type="number" min="1" max="40" class="vt-input" style="width: 80px" />
          <button class="vt-btn" :disabled="busy" @click="addPeriods">Нарезать</button>
          <div class="vt-spacer" />
          <button class="vt-btn is-small" :disabled="busy" @click="addOnePeriod">
            ＋ своя полоса
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
