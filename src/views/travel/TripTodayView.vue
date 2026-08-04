<script setup>
// Режим «в поездке» для телефона: открываешь приложение — сразу сегодняшний
// день, ближайшая точка и кнопка навигации. Всё редактируется прямо отсюда:
// отметить, что был, записать трату, поправить время.
// Спецификация: docs/travel-module.md, раздел 6, этап 7.
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  fetchActiveTrip,
  fetchTripToday,
  updatePoint,
  createTripExpense,
  fetchExpenseCategories,
  createSubPoint,
  updateSubPoint,
} from "@/components/api.js";

const route = useRoute();
const router = useRouter();

const today = ref(null);
const categories = ref([]);
const loading = ref(true);
const error = ref("");
const notice = ref("");
const expenseOpen = ref(false);
const expenseForm = ref({ title: "", amount: 0, currency: "", expenseCategoryId: null });
const openPointId = ref("");

const steps = computed(() => today.value?.steps || []);

function mainPointOf(step) {
  if (!step.points.length) return null;
  if (step.chosenPointId) {
    const chosen = step.points.find((p) => p.id === step.chosenPointId);
    if (chosen) return chosen;
  }
  return step.points[0];
}

function formatTime(minutes) {
  if (minutes == null || minutes < 0) return "";
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function rub(value) {
  return Math.round(value || 0).toLocaleString("ru");
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    today.value = route.params.id
      ? await fetchTripToday(route.params.id)
      : await fetchActiveTrip();
    if (!categories.value.length) categories.value = await fetchExpenseCategories();
  } catch (e) {
    error.value = e.message || "не удалось загрузить";
  } finally {
    loading.value = false;
  }
}

// Отметить «я тут был» — одно нажатие, без открытия карточки.
async function markVisited(point) {
  const next = point.status === "visited" ? "plan" : "visited";
  try {
    await updatePoint(point.id, { ...point, status: next });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось отметить";
  }
}

async function toggleSub(sub) {
  await updateSubPoint(sub.id, { ...sub, done: !sub.done });
  await load();
}

async function addSub(point) {
  const title = window.prompt("Что не забыть?");
  if (!title) return;
  await createSubPoint(point.id, { title });
  await load();
}

// Маршрут отдаём родным картам телефона — они умеют вести лучше нас.
function navigate(point) {
  if (point.lat == null || point.lng == null) return;
  window.open(`https://maps.google.com/?q=${point.lat},${point.lng}`, "_blank", "noopener");
}

function openExpense(point) {
  expenseForm.value = {
    title: point ? point.title : "",
    amount: 0,
    currency: "",
    expenseCategoryId: point?.expenseCategoryId || null,
    pointId: point?.id || null,
  };
  expenseOpen.value = true;
}

async function saveExpense() {
  if (!expenseForm.value.amount) {
    error.value = "укажи сумму";
    return;
  }
  try {
    await createTripExpense(today.value.tripId, {
      ...expenseForm.value,
      dayId: today.value.dayId,
      spentAt: today.value.date,
    });
    expenseOpen.value = false;
    notice.value = "Записал";
    await load();
  } catch (e) {
    error.value = e.message || "не удалось записать";
  }
}

onMounted(load);
</script>

<template>
  <div class="tt">
    <div v-if="loading" class="tt-empty">Загружаю…</div>

    <div v-else-if="!today" class="tt-empty">
      <p>Сейчас нет активной поездки.</p>
      <button class="tt-primary" @click="router.push('/travel')">К путешествиям</button>
    </div>

    <template v-else>
      <header class="tt-header">
        <button class="tt-icon" @click="router.push(`/travel/trips/${today.tripId}`)">
          <i class="mdi mdi-map"></i>
        </button>
        <div class="tt-title">
          <h1>{{ today.dayTitle || `День ${today.dayIndex}` }}</h1>
          <span>
            {{ today.date }} · день {{ today.dayIndex }} из {{ today.daysTotal }}
            <template v-if="today.weather"> · {{ today.weather.label }}</template>
          </span>
        </div>
      </header>

      <p v-if="error" class="tt-error" @click="error = ''">{{ error }}</p>
      <p v-if="notice" class="tt-notice" @click="notice = ''">{{ notice }}</p>

      <!-- Ближайшая точка крупно: ради неё экран и открывают -->
      <section v-if="today.next" class="tt-next">
        <div class="tt-next__label">Дальше</div>
        <div class="tt-next__title">
          <b v-if="today.next.plannedStartMin >= 0">{{ formatTime(today.next.plannedStartMin) }}</b>
          {{ today.next.title }}
        </div>
        <div v-if="today.next.address" class="tt-next__addr">{{ today.next.address }}</div>

        <div class="tt-next__actions">
          <button class="tt-primary" @click="navigate(today.next)">
            <i class="mdi mdi-navigation"></i> Маршрут
          </button>
          <button class="tt-ghost" @click="markVisited(today.next)">
            <i class="mdi mdi-check"></i> Был здесь
          </button>
          <button class="tt-ghost" @click="openExpense(today.next)">
            <i class="mdi mdi-cash-plus"></i>
          </button>
        </div>
      </section>

      <!-- Бюджет дня -->
      <section class="tt-money">
        <div>
          <span class="tt-money__label">На сегодня</span>
          <b>{{ rub(today.planRub) }} ₽</b>
        </div>
        <div>
          <span class="tt-money__label">Потрачено</span>
          <b :style="{ color: today.factRub > today.planRub ? '#ff9d9f' : '#86d68b' }">
            {{ rub(today.factRub) }} ₽
          </b>
        </div>
        <button class="tt-primary" @click="openExpense(null)">
          <i class="mdi mdi-plus"></i> Трата
        </button>
      </section>

      <!-- Весь день -->
      <section class="tt-steps">
        <div v-for="(step, i) in steps" :key="step.id">
          <div v-if="step.transport" class="tt-transport">
            <i class="mdi mdi-arrow-down"></i>
            {{ step.transport.line || step.transport.kind }}
            <em v-if="step.transport.durationMin">{{ step.transport.durationMin }} мин</em>
          </div>

          <div
            v-for="point in step.points"
            :key="point.id"
            class="tt-point"
            :class="{
              visited: point.status === 'visited',
              skipped: point.status === 'skipped',
              alt: step.points.length > 1 && mainPointOf(step)?.id !== point.id,
            }"
          >
            <button class="tt-check" @click="markVisited(point)">
              <i class="mdi" :class="point.status === 'visited' ? 'mdi-check-circle' : 'mdi-circle-outline'"></i>
            </button>

            <div class="tt-point__body" @click="openPointId = openPointId === point.id ? '' : point.id">
              <div class="tt-point__title">
                <b v-if="point.plannedStartMin >= 0">{{ formatTime(point.plannedStartMin) }}</b>
                {{ point.title }}
              </div>
              <div class="tt-point__meta">
                <span v-if="point.subPoints.length">
                  <i class="mdi mdi-format-list-checks"></i>
                  {{ point.subPoints.filter((s) => s.done).length }}/{{ point.subPoints.length }}
                </span>
                <span v-if="point.costAmount">{{ point.costAmount }} {{ point.costCurrency }}</span>
              </div>
            </div>

            <button v-if="point.lat != null" class="tt-icon" @click="navigate(point)">
              <i class="mdi mdi-navigation-outline"></i>
            </button>
          </div>

          <div v-if="openPointId && step.points.some((p) => p.id === openPointId)" class="tt-details">
            <template v-for="point in step.points.filter((p) => p.id === openPointId)" :key="point.id">
              <p v-if="point.description" class="tt-details__descr">{{ point.description }}</p>

              <div v-for="sub in point.subPoints" :key="sub.id" class="tt-sub" @click="toggleSub(sub)">
                <i class="mdi" :class="sub.done ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'"></i>
                <span :class="{ done: sub.done }">{{ sub.title }}</span>
              </div>

              <div v-if="point.nearby.length" class="tt-nearby">
                <div class="tt-details__label">Поблизости</div>
                <span v-for="item in point.nearby" :key="item.id">{{ item.title }}</span>
              </div>

              <div class="tt-details__actions">
                <button @click="addSub(point)"><i class="mdi mdi-plus"></i> пункт</button>
                <button @click="openExpense(point)"><i class="mdi mdi-cash-plus"></i> трата</button>
              </div>
            </template>
          </div>
        </div>

        <p v-if="!steps.length" class="tt-empty tt-empty--small">На этот день ничего не запланировано.</p>
      </section>
    </template>

    <!-- Трата -->
    <div v-if="expenseOpen" class="tt-modal-backdrop" @click.self="expenseOpen = false">
      <div class="tt-modal">
        <h2>Записать трату</h2>
        <label class="tt-field">
          На что
          <input v-model="expenseForm.title" class="tt-input" type="text" />
        </label>
        <label class="tt-field">
          Сумма
          <input v-model.number="expenseForm.amount" class="tt-input" type="number" inputmode="decimal" autofocus />
        </label>
        <label class="tt-field">
          Валюта
          <input v-model="expenseForm.currency" class="tt-input" type="text" placeholder="оставь пустым — местная" />
        </label>
        <label class="tt-field">
          Категория
          <select v-model="expenseForm.expenseCategoryId" class="tt-input">
            <option :value="null">— без категории —</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <div class="tt-modal__actions">
          <button class="tt-ghost" @click="expenseOpen = false">Отмена</button>
          <button class="tt-primary" @click="saveExpense">Записать</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Экран рассчитан на телефон в руке: крупные цели, ничего лишнего. */
.tt {
  width: 100%;
  align-self: stretch;
  min-height: 100dvh;
  padding-bottom: 40px;
  color: #eaeef7;
  background: #12141a;
}

.tt-header {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #232733;
}

.tt-title h1 {
  margin: 0;
  font-size: 19px;
}

.tt-title span {
  font-size: 12px;
  color: #6e7688;
}

.tt-next {
  margin: 14px 12px;
  padding: 16px;
  background: linear-gradient(135deg, #1d2331, #1b1e27);
  border: 1px solid #2c3a55;
  border-radius: 14px;
}

.tt-next__label {
  font-size: 11px;
  color: #6e7688;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tt-next__title {
  margin-top: 4px;
  font-size: 21px;
  font-weight: 600;
}

.tt-next__title b {
  color: #1767fd;
}

.tt-next__addr {
  margin-top: 4px;
  font-size: 13px;
  color: #8b93a7;
}

.tt-next__actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.tt-next__actions .tt-primary {
  flex: 1;
}

.tt-money {
  display: flex;
  gap: 16px;
  align-items: center;
  margin: 0 12px 14px;
  padding: 12px 16px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 12px;
}

.tt-money > div {
  display: flex;
  flex-direction: column;
}

.tt-money__label {
  font-size: 11px;
  color: #6e7688;
}

.tt-money b {
  font-size: 17px;
}

.tt-money .tt-primary {
  margin-left: auto;
}

.tt-steps {
  padding: 0 12px;
}

.tt-transport {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 5px 0 5px 18px;
  font-size: 12px;
  color: #8b93a7;
}

.tt-transport em {
  font-style: normal;
  opacity: 0.7;
}

.tt-point {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 13px 12px;
  margin-bottom: 6px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 12px;
}

.tt-point.visited {
  opacity: 0.6;
}

.tt-point.visited .tt-point__title {
  text-decoration: line-through;
}

.tt-point.skipped {
  opacity: 0.45;
}

.tt-point.alt {
  border-style: dashed;
}

.tt-check {
  flex-shrink: 0;
  padding: 4px;
  font-size: 24px;
  color: #22c55e;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tt-point__body {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.tt-point__title {
  font-size: 15px;
}

.tt-point__title b {
  color: #1767fd;
}

.tt-point__meta {
  display: flex;
  gap: 10px;
  margin-top: 3px;
  font-size: 12px;
  color: #6e7688;
}

.tt-details {
  padding: 12px 14px;
  margin: -2px 0 8px;
  background: #171a22;
  border-radius: 12px;
}

.tt-details__descr {
  margin: 0 0 8px;
  font-size: 13px;
  color: #b9c0cf;
  white-space: pre-wrap;
}

.tt-details__label {
  margin-bottom: 4px;
  font-size: 11px;
  color: #6e7688;
  text-transform: uppercase;
}

.tt-sub {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
  color: #cdd3e0;
  cursor: pointer;
}

.tt-sub .done {
  color: #6e7688;
  text-decoration: line-through;
}

.tt-nearby {
  margin-top: 8px;
}

.tt-nearby span {
  display: inline-block;
  padding: 4px 10px;
  margin: 0 4px 4px 0;
  font-size: 12px;
  color: #b9c0cf;
  background: #1b1e27;
  border-radius: 999px;
}

.tt-details__actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.tt-details__actions button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 10px 14px;
  font-size: 13px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.tt-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 18px;
  font-size: 14px;
  color: #fff;
  background: #1767fd;
  border: none;
  border-radius: 10px;
  cursor: pointer;
}

.tt-ghost {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px;
  font-size: 14px;
  color: #b9c0cf;
  background: transparent;
  border: 1px solid #2c313d;
  border-radius: 10px;
  cursor: pointer;
}

.tt-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: #b9c0cf;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 10px;
  cursor: pointer;
}

.tt-error,
.tt-notice {
  padding: 10px 16px;
  margin: 0;
  font-size: 13px;
  cursor: pointer;
}

.tt-error {
  color: #ff9d9f;
  background: rgba(229, 72, 77, 0.14);
}

.tt-notice {
  color: #86d68b;
  background: rgba(34, 197, 94, 0.13);
}

.tt-empty {
  padding: 50px 20px;
  color: #6e7688;
  text-align: center;
}

.tt-empty--small {
  padding: 24px;
  font-size: 13px;
}

.tt-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(8, 9, 13, 0.75);
}

.tt-modal {
  width: 100%;
  max-width: 520px;
  padding: 20px 16px 28px;
  background: #1b1e27;
  border-radius: 18px 18px 0 0;
}

.tt-modal h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.tt-modal__actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}

.tt-modal__actions button {
  flex: 1;
}

.tt-input {
  width: 100%;
  padding: 12px;
  /* 16px, чтобы iOS не зумил поле при фокусе */
  font-size: 16px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 10px;
  outline: none;
}

.tt-field {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: #8b93a7;
}

.tt-field .tt-input {
  margin-top: 4px;
}

@media (min-width: 900px) {
  .tt {
    max-width: 620px;
    margin: 0 auto;
  }
}
</style>
