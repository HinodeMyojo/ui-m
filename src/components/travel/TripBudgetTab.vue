<script setup>
// Бюджет поездки: квоты по категориям, раскладка по дням, реестр факта,
// взаиморасчёты и закрытие поездки в основной бюджет.
//
// Квота задаётся на всю поездку и делится по дням; ручное значение на день
// пересчитывает остальные из остатка. Спецификация: раздел 2.6.
import { ref, computed, onMounted } from "vue";
import {
  fetchTripBudget,
  saveTripQuota,
  saveTripDayQuota,
  fetchTripExpenses,
  createTripExpense,
  updateTripExpense,
  deleteTripExpense,
  closeTrip,
  fetchExpenseCategories,
  createParticipant,
  deleteParticipant,
} from "@/components/api.js";

const props = defineProps({
  trip: { type: Object, required: true },
});
const emit = defineEmits(["changed"]);

const budget = ref(null);
const expenses = ref([]);
const categories = ref([]);
const loading = ref(true);
const error = ref("");

const section = ref("plan"); // plan | days | fact
const quotaEditing = ref(null);
const quotaForm = ref({ expenseCategoryId: "", totalAmount: 0, currency: "" });
const expenseEditing = ref(null);
const expenseForm = ref(emptyExpense());
const closeOpen = ref(false);
const closeForm = ref({ description: "", bank: "" });
const participantName = ref("");

function emptyExpense() {
  return {
    dayId: null,
    expenseCategoryId: null,
    title: "",
    amount: 0,
    currency: "",
    spentAt: new Date().toISOString().slice(0, 10),
    paidById: null,
    splitAmong: [],
    note: "",
  };
}

function rub(value) {
  return Math.round(value || 0).toLocaleString("ru");
}

function money(amount, currency) {
  if (amount == null) return "";
  return `${Math.round(amount * 100) / 100} ${currency || ""}`.trim();
}

const participants = computed(() => props.trip.participants || []);

// Категории, для которых квота ещё не задана — их можно добавить в план.
const freeCategories = computed(() => {
  const used = new Set((budget.value?.categories || []).map((c) => c.categoryId));
  return categories.value.filter((c) => !used.has(c.id));
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [b, e, c] = await Promise.all([
      fetchTripBudget(props.trip.id),
      fetchTripExpenses(props.trip.id),
      categories.value.length ? Promise.resolve(categories.value) : fetchExpenseCategories(),
    ]);
    budget.value = b;
    expenses.value = e;
    categories.value = c;
  } catch (err) {
    error.value = err.message || "не удалось загрузить бюджет";
  } finally {
    loading.value = false;
  }
}

// --- Квоты ---

function openQuota(category) {
  quotaEditing.value = category ? category.categoryId : "new";
  quotaForm.value = category
    ? {
        expenseCategoryId: category.categoryId,
        totalAmount: category.totalAmount,
        currency: category.currency,
      }
    : { expenseCategoryId: "", totalAmount: 0, currency: props.trip.localCurrency };
}

async function saveQuota() {
  if (!quotaForm.value.expenseCategoryId) {
    error.value = "выбери категорию";
    return;
  }
  try {
    await saveTripQuota(props.trip.id, quotaForm.value);
    quotaEditing.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить квоту";
  }
}

async function removeQuota(category) {
  if (!window.confirm(`Убрать «${category.name}» из плана?`)) return;
  await saveTripQuota(props.trip.id, {
    expenseCategoryId: category.categoryId,
    totalAmount: 0,
    currency: category.currency,
  });
  await load();
}

// Ручное значение на день; пустое поле возвращает день в автораздачу.
async function setDayQuota(day, item, raw) {
  const value = raw === "" || raw === null ? null : Number(raw);
  try {
    await saveTripDayQuota(day.dayId, {
      expenseCategoryId: item.categoryId,
      plannedAmount: value,
      currency: item.currency,
    });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить квоту дня";
  }
}

// --- Траты ---

function openExpense(expense) {
  expenseEditing.value = expense ? expense.id : "new";
  expenseForm.value = expense
    ? { ...expense, splitAmong: [...(expense.splitAmong || [])] }
    : {
        ...emptyExpense(),
        currency: props.trip.localCurrency,
        paidById: participants.value.find((p) => p.isMe)?.id || null,
        splitAmong: participants.value.map((p) => p.id),
      };
}

async function saveExpense() {
  if (!expenseForm.value.title.trim()) {
    error.value = "у траты должно быть название";
    return;
  }
  try {
    if (expenseEditing.value === "new") {
      await createTripExpense(props.trip.id, expenseForm.value);
    } else {
      await updateTripExpense(expenseEditing.value, expenseForm.value);
    }
    expenseEditing.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить трату";
  }
}

async function removeExpense(expense) {
  if (!window.confirm(`Удалить «${expense.title}»?`)) return;
  await deleteTripExpense(expense.id);
  await load();
}

function toggleSplit(id) {
  const list = expenseForm.value.splitAmong;
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
}

// --- Участники ---

async function addParticipant() {
  if (!participantName.value.trim()) return;
  await createParticipant(props.trip.id, {
    name: participantName.value.trim(),
    isMe: participants.value.length === 0,
  });
  participantName.value = "";
  emit("changed");
}

async function removeParticipant(participant) {
  if (!window.confirm(`Убрать ${participant.name} из поездки?`)) return;
  await deleteParticipant(participant.id);
  emit("changed");
}

// --- Закрытие поездки ---

async function doClose() {
  try {
    const result = await closeTrip(props.trip.id, closeForm.value);
    closeOpen.value = false;
    error.value = `Готово: ${rub(result.amountRub)} ₽ записаны в бюджет как «${result.description}»`;
    emit("changed");
    await load();
  } catch (e) {
    error.value = e.message || "не удалось закрыть поездку";
  }
}

onMounted(load);
</script>

<template>
  <div class="tb">
    <p v-if="error" class="tb-error" @click="error = ''">{{ error }}</p>
    <div v-if="loading" class="tb-empty">Загружаю…</div>

    <template v-else-if="budget">
      <!-- Шапка: план, факт, резерв -->
      <div class="tb-top">
        <div class="tb-stat">
          <span class="tb-stat__label">План</span>
          <span class="tb-stat__value">{{ rub(budget.planRub) }} ₽</span>
          <span class="tb-stat__hint">
            подготовка {{ rub(budget.prepRub) }} · на месте {{ rub(budget.quotasRub) }}
          </span>
        </div>
        <div class="tb-stat">
          <span class="tb-stat__label">Факт</span>
          <span class="tb-stat__value">{{ rub(budget.factRub) }} ₽</span>
          <span class="tb-stat__hint">
            по дням {{ rub(budget.factDaysRub) }} · подготовка {{ rub(budget.factPrepRub) }}
          </span>
        </div>
        <div class="tb-stat">
          <span class="tb-stat__label">Осталось</span>
          <span
            class="tb-stat__value"
            :style="{ color: budget.remainingRub < 0 ? '#ff9d9f' : '#86d68b' }"
          >
            {{ rub(budget.remainingRub) }} ₽
          </span>
        </div>
        <div class="tb-stat">
          <span class="tb-stat__label">Резерв</span>
          <span
            class="tb-stat__value"
            :style="{ color: budget.reserveRub < 0 ? '#ff9d9f' : '#86d68b' }"
          >
            {{ budget.reserveRub > 0 ? "+" : "" }}{{ rub(budget.reserveRub) }} ₽
          </span>
          <span class="tb-stat__hint">
            сэкономлено {{ rub(budget.savedRub) }} · перерасход {{ rub(budget.overspentRub) }}
          </span>
        </div>
        <button class="tb-primary" @click="closeOpen = true">
          <i class="mdi mdi-check-all"></i> Закрыть поездку
        </button>
      </div>

      <nav class="tb-sections">
        <button :class="{ active: section === 'plan' }" @click="section = 'plan'">Квоты</button>
        <button :class="{ active: section === 'days' }" @click="section = 'days'">По дням</button>
        <button :class="{ active: section === 'fact' }" @click="section = 'fact'">
          Факт ({{ expenses.length }})
        </button>
      </nav>

      <!-- КВОТЫ -->
      <section v-if="section === 'plan'">
        <p class="tb-hint">
          Задаёшь сумму на всю поездку — она делится по дням поровну.
          Поставишь вручную значение на конкретный день, и остальные пересчитаются из остатка.
        </p>

        <div v-if="!budget.categories.length" class="tb-empty tb-empty--small">
          Квот пока нет.
        </div>

        <div v-for="category in budget.categories" :key="category.categoryId" class="tb-quota">
          <span class="tb-quota__icon" :style="{ background: category.color }">
            <i class="mdi" :class="category.icon"></i>
          </span>
          <div class="tb-quota__body">
            <div class="tb-quota__title">{{ category.name }}</div>
            <div class="tb-quota__meta">
              {{ money(category.totalAmount, category.currency) }} за поездку ·
              {{ Math.round(category.autoPerDay * 100) / 100 }} {{ category.currency }}/день
              <template v-if="category.manualDays">
                (вручную задано дней: {{ category.manualDays }})
              </template>
            </div>
          </div>
          <div class="tb-quota__numbers">
            <span>план {{ rub(category.totalRub) }} ₽</span>
            <span>факт {{ rub(category.factRub) }} ₽</span>
            <span :style="{ color: category.diffRub < 0 ? '#ff9d9f' : '#86d68b' }">
              {{ category.diffRub > 0 ? "+" : "" }}{{ rub(category.diffRub) }} ₽
            </span>
          </div>
          <button class="tb-icon" @click="openQuota(category)"><i class="mdi mdi-pencil"></i></button>
          <button class="tb-icon" @click="removeQuota(category)"><i class="mdi mdi-delete"></i></button>
        </div>

        <button v-if="freeCategories.length" class="tb-add" @click="openQuota(null)">
          <i class="mdi mdi-plus"></i> Добавить категорию в план
        </button>
      </section>

      <!-- ПО ДНЯМ -->
      <section v-else-if="section === 'days'">
        <p class="tb-hint">
          Поле дня можно перебить руками — остальные дни пересчитаются.
          Пустое поле возвращает день в автораздачу.
        </p>
        <div class="tb-table-wrap">
          <table class="tb-table">
            <thead>
              <tr>
                <th>День</th>
                <th v-for="category in budget.categories" :key="category.categoryId">
                  {{ category.name }}
                </th>
                <th>План</th>
                <th>Факт</th>
                <th>Разница</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="day in budget.days" :key="day.dayId" :class="{ 'tb-row--fact': day.hasFact }">
                <td class="tb-table__day">
                  {{ day.index }}
                  <em v-if="day.date">{{ day.date.slice(5) }}</em>
                </td>
                <td v-for="item in day.items" :key="item.categoryId">
                  <input
                    class="tb-cell"
                    :class="{ manual: item.isManual }"
                    type="number"
                    step="1"
                    :value="Math.round(item.planAmount * 100) / 100"
                    :title="item.isManual ? 'задано вручную' : 'посчитано автоматически'"
                    @change="setDayQuota(day, item, $event.target.value)"
                  />
                  <span v-if="item.factAmount" class="tb-cell__fact">
                    факт {{ Math.round(item.factAmount) }}
                  </span>
                </td>
                <td>{{ rub(day.planRub) }}</td>
                <td>{{ day.hasFact ? rub(day.factRub) : "—" }}</td>
                <td :style="{ color: day.hasFact ? (day.diffRub < 0 ? '#ff9d9f' : '#86d68b') : '#4d5464' }">
                  {{ day.hasFact ? (day.diffRub > 0 ? "+" : "") + rub(day.diffRub) : "—" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ФАКТ -->
      <section v-else>
        <div class="tb-fact-head">
          <button class="tb-primary" @click="openExpense(null)">
            <i class="mdi mdi-plus"></i> Трата
          </button>
          <div class="tb-participants">
            <span v-for="p in participants" :key="p.id" class="tb-participant">
              {{ p.name }}<template v-if="p.isMe"> (я)</template>
              <button @click="removeParticipant(p)"><i class="mdi mdi-close"></i></button>
            </span>
            <input
              v-model="participantName"
              class="tb-input tb-input--inline"
              type="text"
              placeholder="+ участник"
              @keydown.enter="addParticipant"
            />
          </div>
        </div>

        <div v-if="budget.settle.length" class="tb-settle">
          <div class="tb-settle__title">Кто кому должен</div>
          <div v-for="(s, i) in budget.settle" :key="i" class="tb-settle__row">
            <b>{{ s.fromName }}</b> → <b>{{ s.toName }}</b>
            <span>{{ rub(s.amountRub) }} ₽</span>
          </div>
        </div>

        <div v-if="!expenses.length" class="tb-empty tb-empty--small">
          Трат пока нет. Записывай их прямо в поездке — потом всё сложится само.
        </div>

        <div v-for="expense in expenses" :key="expense.id" class="tb-expense" @click="openExpense(expense)">
          <span
            class="tb-expense__icon"
            :style="{ background: expense.categoryColor || '#2c313d' }"
          >
            <i class="mdi" :class="expense.categoryIcon || 'mdi-cash'"></i>
          </span>
          <div class="tb-expense__body">
            <div class="tb-expense__title">{{ expense.title }}</div>
            <div class="tb-expense__meta">
              {{ expense.spentAt }}
              <template v-if="expense.dayId">· день {{ expense.dayIndex }}</template>
              <template v-else>· подготовка</template>
              <template v-if="expense.paidByName">· платил {{ expense.paidByName }}</template>
              <template v-if="expense.splitAmong.length > 1">
                · делят {{ expense.splitAmong.length }}
              </template>
            </div>
          </div>
          <div class="tb-expense__amount">
            <b>{{ rub(expense.amountRub) }} ₽</b>
            <em v-if="expense.currency !== 'RUB'">{{ money(expense.amount, expense.currency) }}</em>
          </div>
          <button class="tb-icon" @click.stop="removeExpense(expense)"><i class="mdi mdi-delete"></i></button>
        </div>
      </section>
    </template>

    <!-- Квота -->
    <div v-if="quotaEditing" class="tb-modal-backdrop" @click.self="quotaEditing = null">
      <div class="tb-modal">
        <h2>Квота на поездку</h2>
        <label v-if="quotaEditing === 'new'" class="tb-field">
          Категория
          <select v-model="quotaForm.expenseCategoryId" class="tb-input">
            <option value="">— выбери —</option>
            <option v-for="c in freeCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>

        <!-- Два поля суммы: рубли без пересчёта, местная валюта — с пересчётом -->
        <div class="tb-row">
          <label class="tb-field">
            Всего, {{ trip.localCurrency }}
            <input
              class="tb-input"
              type="number"
              step="1"
              :value="quotaForm.currency === trip.localCurrency ? quotaForm.totalAmount : null"
              @input="
                quotaForm.totalAmount = Number($event.target.value || 0);
                quotaForm.currency = trip.localCurrency;
              "
            />
          </label>
          <label class="tb-field">
            Всего, ₽
            <input
              class="tb-input"
              type="number"
              step="1"
              :value="quotaForm.currency === 'RUB' ? quotaForm.totalAmount : null"
              @input="
                quotaForm.totalAmount = Number($event.target.value || 0);
                quotaForm.currency = 'RUB';
              "
            />
          </label>
        </div>
        <p class="tb-hint">
          Сумма поделится на {{ budget?.days.length || 0 }} дней. Ручные значения дней
          вычитаются, а остаток делится на оставшиеся.
        </p>

        <div class="tb-modal__actions">
          <button class="tb-ghost" @click="quotaEditing = null">Отмена</button>
          <button class="tb-primary" @click="saveQuota">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Трата -->
    <div v-if="expenseEditing" class="tb-modal-backdrop" @click.self="expenseEditing = null">
      <div class="tb-modal">
        <h2>{{ expenseEditing === "new" ? "Новая трата" : "Трата" }}</h2>

        <label class="tb-field">
          На что
          <input v-model="expenseForm.title" class="tb-input" type="text" placeholder="Ужин в идзакае" />
        </label>

        <div class="tb-row">
          <label class="tb-field">
            Сумма, {{ trip.localCurrency }}
            <input
              class="tb-input"
              type="number"
              step="0.01"
              :value="expenseForm.currency === trip.localCurrency ? expenseForm.amount : null"
              @input="
                expenseForm.amount = Number($event.target.value || 0);
                expenseForm.currency = trip.localCurrency;
              "
            />
          </label>
          <label class="tb-field">
            Сумма, ₽
            <input
              class="tb-input"
              type="number"
              step="0.01"
              :value="expenseForm.currency === 'RUB' ? expenseForm.amount : null"
              @input="
                expenseForm.amount = Number($event.target.value || 0);
                expenseForm.currency = 'RUB';
              "
            />
          </label>
        </div>

        <div class="tb-row">
          <label class="tb-field">
            Дата
            <input v-model="expenseForm.spentAt" class="tb-input" type="date" />
          </label>
          <label class="tb-field">
            Категория
            <select v-model="expenseForm.expenseCategoryId" class="tb-input">
              <option :value="null">— без категории —</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
        </div>

        <label class="tb-field">
          День поездки
          <select v-model="expenseForm.dayId" class="tb-input">
            <option :value="null">вне дней — подготовка</option>
            <option v-for="day in budget.days" :key="day.dayId" :value="day.dayId">
              День {{ day.index }}<template v-if="day.date"> · {{ day.date }}</template>
            </option>
          </select>
        </label>

        <template v-if="participants.length">
          <label class="tb-field">
            Кто платил
            <select v-model="expenseForm.paidById" class="tb-input">
              <option :value="null">—</option>
              <option v-for="p in participants" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <div class="tb-field">
            На кого делим
            <div class="tb-split">
              <button
                v-for="p in participants"
                :key="p.id"
                :class="{ active: expenseForm.splitAmong.includes(p.id) }"
                @click="toggleSplit(p.id)"
              >
                {{ p.name }}
              </button>
            </div>
          </div>
        </template>

        <label class="tb-field">
          Заметка
          <input v-model="expenseForm.note" class="tb-input" type="text" />
        </label>

        <div class="tb-modal__actions">
          <button class="tb-ghost" @click="expenseEditing = null">Отмена</button>
          <button class="tb-primary" @click="saveExpense">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Закрытие поездки -->
    <div v-if="closeOpen" class="tb-modal-backdrop" @click.self="closeOpen = false">
      <div class="tb-modal">
        <h2>Закрыть поездку</h2>
        <p class="tb-hint">
          Итог реестра — <b>{{ rub(budget?.factRub) }} ₽</b> — уйдёт в основной бюджет
          одной транзакцией в категорию «Путешествия». Детализация по дням и статьям
          останется здесь.
        </p>
        <label class="tb-field">
          Описание
          <input
            v-model="closeForm.description"
            class="tb-input"
            type="text"
            :placeholder="trip.title"
          />
        </label>
        <label class="tb-field">
          Банк
          <input v-model="closeForm.bank" class="tb-input" type="text" placeholder="Тинькофф" />
        </label>
        <div class="tb-modal__actions">
          <button class="tb-ghost" @click="closeOpen = false">Отмена</button>
          <button class="tb-primary" @click="doClose">Записать в бюджет</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tb {
  flex: 1;
  padding: 16px 20px 60px;
  overflow-y: auto;
  color: #eaeef7;
}

.tb-top {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  padding: 14px 18px;
  margin-bottom: 14px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 13px;
}

.tb-stat {
  display: flex;
  flex-direction: column;
  min-width: 140px;
}

.tb-stat__label {
  font-size: 11px;
  color: #6e7688;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tb-stat__value {
  font-size: 20px;
  font-weight: 600;
}

.tb-stat__hint {
  font-size: 11px;
  color: #6e7688;
}

.tb-sections {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 14px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 11px;
}

.tb-sections button {
  padding: 8px 16px;
  font-size: 13px;
  color: #8b93a7;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.tb-sections button.active {
  color: #fff;
  background: #1767fd;
}

.tb-quota {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 11px 13px;
  margin-bottom: 7px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 11px;
}

.tb-quota__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  color: #fff;
  border-radius: 9px;
}

.tb-quota__body {
  flex: 1;
  min-width: 0;
}

.tb-quota__title {
  font-size: 14px;
}

.tb-quota__meta {
  margin-top: 2px;
  font-size: 11px;
  color: #6e7688;
}

.tb-quota__numbers {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: #8b93a7;
  white-space: nowrap;
}

.tb-table-wrap {
  overflow-x: auto;
}

.tb-table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}

.tb-table th {
  padding: 8px 9px;
  color: #6e7688;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid #2c313d;
}

.tb-table td {
  padding: 6px 9px;
  border-bottom: 1px solid #1f232e;
}

.tb-row--fact {
  background: rgba(23, 103, 253, 0.05);
}

.tb-table__day {
  white-space: nowrap;
}

.tb-table__day em {
  font-style: normal;
  color: #6e7688;
}

.tb-cell {
  width: 84px;
  padding: 5px 7px;
  font-size: 12px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 7px;
  outline: none;
}

.tb-cell.manual {
  color: #fff;
  border-color: #1767fd;
}

.tb-cell__fact {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: #6e7688;
}

.tb-fact-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.tb-participants {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.tb-participant {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 12px;
  color: #b9c0cf;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 999px;
}

.tb-participant button {
  padding: 0;
  color: #6e7688;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tb-input--inline {
  width: 120px;
}

.tb-settle {
  padding: 11px 14px;
  margin-bottom: 12px;
  background: rgba(23, 103, 253, 0.08);
  border: 1px solid rgba(23, 103, 253, 0.25);
  border-radius: 11px;
}

.tb-settle__title {
  margin-bottom: 6px;
  font-size: 11px;
  color: #6e7688;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tb-settle__row {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.tb-settle__row span {
  margin-left: auto;
  font-weight: 600;
}

.tb-expense {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 10px 13px;
  margin-bottom: 6px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 11px;
  cursor: pointer;
}

.tb-expense:hover {
  border-color: #3d4353;
}

.tb-expense__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  color: #fff;
  border-radius: 8px;
}

.tb-expense__body {
  flex: 1;
  min-width: 0;
}

.tb-expense__title {
  font-size: 13px;
}

.tb-expense__meta {
  margin-top: 2px;
  font-size: 11px;
  color: #6e7688;
}

.tb-expense__amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 13px;
  white-space: nowrap;
}

.tb-expense__amount em {
  font-size: 11px;
  font-style: normal;
  color: #6e7688;
}

.tb-add {
  width: 100%;
  padding: 10px;
  font-size: 12px;
  color: #6e7688;
  background: transparent;
  border: 1px dashed #2c313d;
  border-radius: 10px;
  cursor: pointer;
}

.tb-add:hover {
  color: #eaeef7;
  border-color: #3d4353;
}

.tb-icon {
  padding: 5px;
  color: #6e7688;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tb-icon:hover {
  color: #eaeef7;
}

.tb-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 15px;
  font-size: 13px;
  color: #fff;
  white-space: nowrap;
  background: #1767fd;
  border: none;
  border-radius: 9px;
  cursor: pointer;
}

.tb-ghost {
  padding: 9px 15px;
  font-size: 13px;
  color: #b9c0cf;
  background: transparent;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.tb-error {
  padding: 9px 14px;
  margin: 0 0 12px;
  font-size: 13px;
  color: #ff9d9f;
  cursor: pointer;
  background: rgba(229, 72, 77, 0.14);
  border-radius: 9px;
}

.tb-empty {
  padding: 34px 20px;
  color: #6e7688;
  text-align: center;
}

.tb-empty--small {
  padding: 20px;
  font-size: 13px;
}

.tb-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #6e7688;
}

.tb-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 9, 13, 0.72);
}

.tb-modal {
  width: 100%;
  max-width: 480px;
  max-height: 92vh;
  padding: 20px;
  overflow-y: auto;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 16px;
}

.tb-modal h2 {
  margin: 0 0 10px;
  font-size: 18px;
}

.tb-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.tb-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 9px;
  outline: none;
}

.tb-input:focus {
  border-color: #1767fd;
}

.tb-field {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: #8b93a7;
}

.tb-field .tb-input {
  margin-top: 4px;
}

.tb-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.tb-split {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}

.tb-split button {
  padding: 6px 12px;
  font-size: 12px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 999px;
  cursor: pointer;
}

.tb-split button.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

@media (max-width: 900px) {
  .tb {
    padding: 12px 12px 60px;
  }

  .tb-top {
    gap: 10px;
    padding: 12px;
  }

  .tb-stat {
    min-width: 120px;
  }

  .tb-top .tb-primary {
    width: 100%;
    justify-content: center;
  }

  .tb-quota {
    flex-wrap: wrap;
  }

  .tb-quota__numbers {
    width: 100%;
    justify-content: space-between;
  }

  .tb-row {
    grid-template-columns: 1fr;
  }
}
</style>
