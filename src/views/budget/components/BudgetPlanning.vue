<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useBudgetStore } from "@/stores/budget";
import type { PlanItemType } from "@/types/budget";

const store = useBudgetStore();

const showAddItemModal = ref(false);
const editingItemId = ref<string | null>(null);

const itemForm = ref({
  type: "expense" as PlanItemType,
  categoryId: "",
  name: "",
  amount: 0,
  plannedDate: 0,
  depositRate: undefined as number | undefined,
  depositMonths: undefined as number | undefined,
});

const ITEM_TYPES: { value: PlanItemType; label: string; icon: string }[] = [
  { value: "income", label: "Доход", icon: "📈" },
  { value: "expense", label: "Расход", icon: "📉" },
  { value: "saving", label: "Накопление", icon: "🐷" },
  { value: "deposit", label: "Вклад", icon: "🏦" },
];

// Current month for planning (next month by default)
const planMonth = ref(getNextMonth());

function getNextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
}

const plan = computed(() => store.currentPlan);
const hasPlan = computed(() => plan.value !== null);

// Items grouped by type
const incomeItems = computed(() => plan.value?.items.filter((i) => i.type === "income") ?? []);
const expenseItems = computed(() => plan.value?.items.filter((i) => i.type === "expense") ?? []);
const savingItems = computed(() => plan.value?.items.filter((i) => i.type === "saving") ?? []);
const depositItems = computed(() => plan.value?.items.filter((i) => i.type === "deposit") ?? []);

onMounted(async () => {
  await store.fetchPlans();
  await store.fetchPlanByMonth(planMonth.value);
});

watch(planMonth, async (month) => {
  await store.fetchPlanByMonth(month);
});

async function createPlanForMonth() {
  const monthLabel = new Date(planMonth.value + "-15").toLocaleString("ru", { month: "long", year: "numeric" });
  const id = await store.createPlan({
    month: planMonth.value,
    name: `План на ${monthLabel}`,
  });
  if (id) await store.fetchPlan(id);
}

async function createTemplate() {
  const id = await store.createPlan({
    month: "template",
    isTemplate: true,
    name: "Базовый шаблон",
  });
  if (id) {
    planMonth.value = "template";
    await store.fetchPlan(id);
  }
}

async function handleDeletePlan() {
  if (!plan.value || !confirm("Удалить этот план?")) return;
  await store.deletePlan(plan.value.plan.id);
}

function openAddItem(type: PlanItemType) {
  editingItemId.value = null;
  itemForm.value = {
    type,
    categoryId: "",
    name: "",
    amount: 0,
    plannedDate: 0,
    depositRate: undefined,
    depositMonths: undefined,
  };
  showAddItemModal.value = true;
}

function openEditItem(id: string) {
  const item = plan.value?.items.find((i) => i.id === id);
  if (!item) return;
  editingItemId.value = id;
  itemForm.value = {
    type: item.type,
    categoryId: item.categoryId ?? "",
    name: item.name,
    amount: item.amount,
    plannedDate: item.plannedDate,
    depositRate: item.depositRate,
    depositMonths: item.depositMonths,
  };
  showAddItemModal.value = true;
}

async function submitItem() {
  if (!plan.value || !itemForm.value.name.trim() || itemForm.value.amount <= 0) return;
  const data = {
    type: itemForm.value.type,
    categoryId: itemForm.value.categoryId || undefined,
    name: itemForm.value.name,
    amount: itemForm.value.amount,
    plannedDate: itemForm.value.plannedDate,
    depositRate: itemForm.value.type === "deposit" ? itemForm.value.depositRate : undefined,
    depositMonths: itemForm.value.type === "deposit" ? itemForm.value.depositMonths : undefined,
  };
  try {
    if (editingItemId.value) {
      await store.updatePlanItem(editingItemId.value, data);
    } else {
      await store.addPlanItem(plan.value.plan.id, data);
    }
    showAddItemModal.value = false;
  } catch {}
}

async function handleDeleteItem(id: string) {
  if (!confirm("Удалить?")) return;
  await store.deletePlanItem(id);
}

function fmt(n: number | undefined) {
  return (n ?? 0).toLocaleString("ru");
}

function getCatInfo(catId?: string) {
  if (!catId) return null;
  return store.categories.find((c) => c.id === catId);
}

// Available months for selector
const monthOptions = computed(() => {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 15);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleString("ru", { month: "long", year: "numeric" });
    opts.push({ value: val, label });
  }
  opts.push({ value: "template", label: "Шаблон" });
  return opts;
});

const availableCategories = computed(() =>
  itemForm.value.type === "income" ? store.incomeCategories : store.expenseCategories
);
</script>

<template>
  <div class="planning-tab">
    <!-- Header -->
    <div class="plan-header">
      <div class="plan-month-select">
        <select v-model="planMonth">
          <option v-for="opt in monthOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="plan-actions" v-if="hasPlan">
        <button class="btn-delete-plan" @click="handleDeletePlan">Удалить план</button>
      </div>
    </div>

    <!-- No plan state -->
    <div v-if="!hasPlan" class="no-plan">
      <div class="no-plan-icon">📋</div>
      <h3>Нет плана на этот период</h3>
      <p>Создайте план для планирования доходов, расходов и накоплений</p>
      <div class="no-plan-actions">
        <button class="btn-primary" @click="createPlanForMonth">Создать план</button>
        <button class="btn-secondary" @click="createTemplate" v-if="planMonth !== 'template'">Создать шаблон</button>
      </div>
    </div>

    <!-- Plan content -->
    <div v-else class="plan-content">
      <div class="plan-main">
        <!-- Income section -->
        <div class="plan-section">
          <div class="section-header">
            <span class="section-icon">📈</span>
            <h4>Доходы</h4>
            <span class="section-total green">+{{ fmt(plan?.totalIncome) }} ₽</span>
            <button class="btn-add-item" @click="openAddItem('income')">+</button>
          </div>
          <div v-if="!incomeItems.length" class="section-empty">Добавьте источники дохода</div>
          <div v-for="item in incomeItems" :key="item.id" class="plan-item" @click="openEditItem(item.id)">
            <div class="item-info">
              <span class="item-name">{{ item.name }}</span>
              <span class="item-date" v-if="item.plannedDate > 0">{{ item.plannedDate }}-е число</span>
            </div>
            <span class="item-amount green">+{{ fmt(item.amount) }} ₽</span>
            <button class="item-delete" @click.stop="handleDeleteItem(item.id)">×</button>
          </div>
        </div>

        <!-- Expense section -->
        <div class="plan-section">
          <div class="section-header">
            <span class="section-icon">📉</span>
            <h4>Расходы по категориям</h4>
            <span class="section-total red">-{{ fmt(plan?.totalExpense) }} ₽</span>
            <button class="btn-add-item" @click="openAddItem('expense')">+</button>
          </div>
          <div v-if="!expenseItems.length" class="section-empty">Укажите планируемые расходы</div>
          <div v-for="item in expenseItems" :key="item.id" class="plan-item" @click="openEditItem(item.id)">
            <div class="item-info">
              <span class="item-cat-icon" v-if="getCatInfo(item.categoryId)">{{ getCatInfo(item.categoryId)?.icon }}</span>
              <span class="item-name">{{ item.name }}</span>
            </div>
            <span class="item-amount red">-{{ fmt(item.amount) }} ₽</span>
            <button class="item-delete" @click.stop="handleDeleteItem(item.id)">×</button>
          </div>
        </div>

        <!-- Savings section -->
        <div class="plan-section">
          <div class="section-header">
            <span class="section-icon">🐷</span>
            <h4>Накопления</h4>
            <span class="section-total blue">{{ fmt(plan?.plannedSaving) }} ₽</span>
            <button class="btn-add-item" @click="openAddItem('saving')">+</button>
          </div>
          <div v-if="!savingItems.length" class="section-empty">Запланируйте накопления</div>
          <div v-for="item in savingItems" :key="item.id" class="plan-item" @click="openEditItem(item.id)">
            <div class="item-info">
              <span class="item-name">{{ item.name }}</span>
            </div>
            <span class="item-amount blue">{{ fmt(item.amount) }} ₽</span>
            <button class="item-delete" @click.stop="handleDeleteItem(item.id)">×</button>
          </div>
        </div>

        <!-- Deposits section -->
        <div class="plan-section">
          <div class="section-header">
            <span class="section-icon">🏦</span>
            <h4>Вклады</h4>
            <span class="section-total purple" v-if="(plan?.depositIncome ?? 0) > 0">+{{ fmt(plan?.depositIncome) }} ₽/мес</span>
            <button class="btn-add-item" @click="openAddItem('deposit')">+</button>
          </div>
          <div v-if="!depositItems.length" class="section-empty">Добавьте вклады для расчёта пассивного дохода</div>
          <div v-for="item in depositItems" :key="item.id" class="plan-item" @click="openEditItem(item.id)">
            <div class="item-info">
              <span class="item-name">{{ item.name }}</span>
              <span class="item-date" v-if="item.depositRate">{{ item.depositRate }}% годовых</span>
            </div>
            <span class="item-amount">{{ fmt(item.amount) }} ₽</span>
            <button class="item-delete" @click.stop="handleDeleteItem(item.id)">×</button>
          </div>
        </div>
      </div>

      <!-- Summary sidebar -->
      <div class="plan-summary">
        <h4 class="summary-title">Итоги плана</h4>
        <div class="summary-rows">
          <div class="summary-row">
            <span>Доходы</span>
            <span class="green">+{{ fmt(plan?.totalIncome) }} ₽</span>
          </div>
          <div class="summary-row">
            <span>Расходы</span>
            <span class="red">-{{ fmt(plan?.totalExpense) }} ₽</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-row">
            <span>Запланировано накопить</span>
            <span class="blue">{{ fmt(plan?.plannedSaving) }} ₽</span>
          </div>
          <div class="summary-row">
            <span>Свободные средства</span>
            <span>{{ fmt(plan?.freeSaving) }} ₽</span>
          </div>
          <div class="summary-row" v-if="(plan?.depositIncome ?? 0) > 0">
            <span>Доход от вкладов</span>
            <span class="purple">+{{ fmt(plan?.depositIncome) }} ₽</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-row summary-row-total">
            <span>Чистые накопления/мес</span>
            <span class="green">{{ fmt(plan?.netMonthlySaving) }} ₽</span>
          </div>
        </div>

        <!-- Goal timelines -->
        <div v-if="plan?.goalTimelines?.length" class="goal-timelines">
          <h4 class="summary-title">Цели</h4>
          <div v-for="gt in plan.goalTimelines" :key="gt.goalId" class="goal-timeline-row">
            <div class="gt-info">
              <span class="gt-name">{{ gt.goalName }}</span>
              <span class="gt-remaining">Осталось: {{ fmt(gt.remaining) }} ₽</span>
            </div>
            <div class="gt-result">
              <span class="gt-months" v-if="gt.monthsToReach > 0">
                ~{{ gt.monthsToReach }} мес
              </span>
              <span class="gt-months gt-never" v-else>
                Недостаточно накоплений
              </span>
              <span class="gt-date" v-if="gt.estimatedDate">
                к {{ new Date(gt.estimatedDate).toLocaleDateString('ru', { month: 'long', year: 'numeric' }) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit item modal -->
    <Teleport to="body">
      <div v-if="showAddItemModal" class="modal-overlay" @click.self="showAddItemModal = false">
        <div class="modal-card">
          <button class="modal-close" @click="showAddItemModal = false">×</button>
          <h3 class="modal-title">{{ editingItemId ? 'Редактировать' : 'Добавить' }} {{ ITEM_TYPES.find(t => t.value === itemForm.type)?.label }}</h3>
          <form @submit.prevent="submitItem" class="modal-form">
            <!-- Type switch -->
            <div class="type-switch">
              <button
                v-for="t in ITEM_TYPES"
                :key="t.value"
                type="button"
                :class="{ active: itemForm.type === t.value }"
                @click="itemForm.type = t.value"
              >
                {{ t.icon }} {{ t.label }}
              </button>
            </div>

            <label>
              <span>Название</span>
              <input v-model="itemForm.name" type="text" required placeholder="Зарплата, Продукты, ..." />
            </label>

            <label v-if="itemForm.type === 'expense'">
              <span>Категория</span>
              <select v-model="itemForm.categoryId">
                <option value="">Без категории</option>
                <option v-for="cat in availableCategories" :key="cat.id" :value="cat.id">
                  {{ cat.icon }} {{ cat.name }}
                </option>
              </select>
            </label>

            <label>
              <span>Сумма (₽)</span>
              <input v-model.number="itemForm.amount" type="number" min="0" step="100" required />
            </label>

            <label v-if="itemForm.type === 'income'">
              <span>День поступления (0 = не указан)</span>
              <input v-model.number="itemForm.plannedDate" type="number" min="0" max="31" />
            </label>

            <template v-if="itemForm.type === 'deposit'">
              <label>
                <span>Ставка (% годовых)</span>
                <input v-model.number="itemForm.depositRate" type="number" min="0" max="100" step="0.1" placeholder="15" />
              </label>
              <label>
                <span>Срок (месяцев)</span>
                <input v-model.number="itemForm.depositMonths" type="number" min="1" max="120" placeholder="12" />
              </label>
            </template>

            <button type="submit" class="btn-submit">{{ editingItemId ? 'Сохранить' : 'Добавить' }}</button>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.planning-tab { display: flex; flex-direction: column; gap: 16px; }

/* Header */
.plan-header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.plan-month-select select {
  background: rgba(23, 103, 253, 0.08); border: 1px solid rgba(23, 103, 253, 0.25);
  border-radius: 10px; padding: 10px 16px; color: #fff; font-size: 15px; font-weight: 600;
  outline: none; cursor: pointer; text-transform: capitalize;
}
.plan-month-select select option { background: #1a1b2e; color: #fff; }

.btn-delete-plan {
  background: rgba(248, 113, 113, 0.1); border: 1px solid rgba(248, 113, 113, 0.3);
  color: #f87171; padding: 8px 16px; border-radius: 10px; font-size: 13px; cursor: pointer;
  transition: all 0.2s;
}
.btn-delete-plan:hover { background: rgba(248, 113, 113, 0.2); }

/* No plan */
.no-plan {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 60px 20px; text-align: center;
}
.no-plan-icon { font-size: 64px; }
.no-plan h3 { color: #c8daf0; font-size: 20px; margin: 0; }
.no-plan p { color: #6b7fa3; font-size: 14px; margin: 0; }
.no-plan-actions { display: flex; gap: 12px; margin-top: 12px; }

.btn-primary {
  background: linear-gradient(135deg, #1767fd, #6e4aff); border: none; color: #fff;
  padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

.btn-secondary {
  background: rgba(23, 103, 253, 0.1); border: 1px solid rgba(23, 103, 253, 0.3);
  color: #7eb0ff; padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-secondary:hover { background: rgba(23, 103, 253, 0.2); }

/* Plan content layout */
.plan-content {
  display: grid; grid-template-columns: 1fr 320px; gap: 20px;
}

/* Sections */
.plan-main { display: flex; flex-direction: column; gap: 16px; }

.plan-section {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.12); border-radius: 14px; padding: 20px;
}

.section-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
}
.section-icon { font-size: 20px; }
.section-header h4 { font-size: 15px; font-weight: 600; color: #c8daf0; margin: 0; flex: 1; }
.section-total { font-size: 16px; font-weight: 700; }
.section-total.green { color: #34d399; }
.section-total.red { color: #f87171; }
.section-total.blue { color: #60a5fa; }
.section-total.purple { color: #c084fc; }

.btn-add-item {
  background: rgba(23, 103, 253, 0.15); border: 1px solid rgba(23, 103, 253, 0.3);
  color: #7eb0ff; width: 30px; height: 30px; border-radius: 8px;
  font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.btn-add-item:hover { background: rgba(23, 103, 253, 0.3); color: #fff; }

.section-empty { color: #4a5c7a; font-size: 13px; text-align: center; padding: 16px; }

/* Plan items */
.plan-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; margin-bottom: 4px;
  background: rgba(23, 103, 253, 0.03); border-radius: 10px;
  cursor: pointer; transition: all 0.2s;
}
.plan-item:hover { background: rgba(23, 103, 253, 0.08); }

.item-info { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.item-cat-icon { font-size: 18px; }
.item-name { font-size: 14px; font-weight: 500; color: #e1e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-date { font-size: 11px; color: #6b7fa3; }
.item-amount { font-size: 15px; font-weight: 700; white-space: nowrap; }
.item-amount.green { color: #34d399; }
.item-amount.red { color: #f87171; }
.item-amount.blue { color: #60a5fa; }
.item-amount.purple { color: #c084fc; }

.item-delete {
  background: none; border: none; color: #4a5c7a; font-size: 18px;
  cursor: pointer; opacity: 0; transition: all 0.2s; padding: 2px 4px;
}
.plan-item:hover .item-delete { opacity: 1; }
.item-delete:hover { color: #f87171; }

/* Summary sidebar */
.plan-summary {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.98), rgba(23, 25, 40, 0.98));
  border: 1px solid rgba(23, 103, 253, 0.2); border-radius: 14px;
  padding: 24px; position: sticky; top: 20px; height: fit-content;
}

.summary-title { font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 16px; }

.summary-rows { display: flex; flex-direction: column; gap: 10px; }
.summary-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 14px; color: #c8daf0;
}
.summary-row span:last-child { font-weight: 600; }
.summary-row-total { font-size: 16px; padding-top: 4px; }
.summary-row-total span { font-weight: 700; }
.summary-divider { height: 1px; background: rgba(23, 103, 253, 0.12); margin: 4px 0; }

.green { color: #34d399; }
.red { color: #f87171; }
.blue { color: #60a5fa; }
.purple { color: #c084fc; }

/* Goal timelines */
.goal-timelines { margin-top: 20px; border-top: 1px solid rgba(23, 103, 253, 0.12); padding-top: 16px; }

.goal-timeline-row {
  padding: 12px 0; border-bottom: 1px solid rgba(23, 103, 253, 0.06);
}
.goal-timeline-row:last-child { border-bottom: none; }
.gt-info { display: flex; justify-content: space-between; margin-bottom: 4px; }
.gt-name { font-size: 14px; font-weight: 600; color: #e1e8f0; }
.gt-remaining { font-size: 12px; color: #6b7fa3; }
.gt-result { display: flex; justify-content: space-between; }
.gt-months { font-size: 16px; font-weight: 700; color: #34d399; }
.gt-months.gt-never { font-size: 12px; color: #f87171; }
.gt-date { font-size: 12px; color: #6b7fa3; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px;
}
.modal-card {
  background: linear-gradient(135deg, rgba(14, 15, 26, 0.99), rgba(20, 22, 36, 0.99));
  border: 1px solid rgba(23, 103, 253, 0.3); border-radius: 16px;
  padding: 28px; width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto; position: relative;
}
.modal-close {
  position: absolute; top: 16px; right: 16px; background: none; border: none;
  color: #6b7fa3; font-size: 22px; cursor: pointer; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center; border-radius: 8px;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.modal-title { font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 20px; }

.modal-form { display: flex; flex-direction: column; gap: 14px; }
.modal-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #7eb0ff; }
.modal-form input, .modal-form select {
  background: rgba(23, 103, 253, 0.06); border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 14px; outline: none;
}
.modal-form input:focus, .modal-form select:focus { border-color: rgba(23, 103, 253, 0.5); }
.modal-form select option { background: #1a1b2e; color: #fff; }

.type-switch {
  display: flex; gap: 4px; background: rgba(23, 103, 253, 0.06); border-radius: 10px; padding: 3px;
}
.type-switch button {
  flex: 1; background: none; border: none; color: #6b7fa3; padding: 10px 8px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.type-switch button.active { background: rgba(23, 103, 253, 0.2); color: #fff; }

.btn-submit {
  background: linear-gradient(135deg, #1767fd, #6e4aff); border: none; color: #fff;
  padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.2s; margin-top: 4px;
}
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

/* Mobile */
@media (max-width: 768px) {
  .plan-content { grid-template-columns: 1fr; }
  .plan-summary { position: static; }
  .modal-card { max-width: 92vw; padding: 22px; }
  .item-delete { opacity: 1; }
}

@media (max-width: 480px) {
  .plan-header { flex-direction: column; align-items: stretch; }
  .plan-month-select select { width: 100%; font-size: 16px; padding: 12px 16px; }
  .btn-delete-plan { width: 100%; text-align: center; min-height: 44px; font-size: 14px; }

  .no-plan { padding: 40px 16px; }
  .no-plan-icon { font-size: 48px; }
  .no-plan h3 { font-size: 18px; }
  .no-plan-actions { flex-direction: column; width: 100%; }
  .btn-primary { width: 100%; min-height: 44px; font-size: 16px; }
  .btn-secondary { width: 100%; min-height: 44px; font-size: 16px; }

  .plan-section { padding: 14px; }
  .section-header { flex-wrap: wrap; gap: 8px; }
  .section-header h4 { font-size: 14px; }
  .section-total { font-size: 14px; }
  .btn-add-item { min-width: 36px; min-height: 36px; }

  .plan-item { padding: 10px 12px; gap: 8px; }
  .item-name { font-size: 13px; }
  .item-amount { font-size: 14px; }
  .item-delete { opacity: 1; min-width: 32px; min-height: 32px; }

  .plan-summary { padding: 18px; }
  .summary-title { font-size: 15px; }
  .summary-row { font-size: 13px; }
  .summary-row-total { font-size: 14px; }

  .gt-name { font-size: 13px; }
  .gt-months { font-size: 14px; }

  .modal-card { max-width: 92vw; padding: 18px; }
  .modal-title { font-size: 16px; margin-bottom: 16px; }
  .modal-form input,
  .modal-form select { font-size: 16px; padding: 12px 14px; }
  .type-switch { flex-wrap: wrap; }
  .type-switch button { padding: 10px 6px; font-size: 12px; min-height: 44px; }
  .btn-submit { min-height: 44px; font-size: 16px; }
}
</style>
