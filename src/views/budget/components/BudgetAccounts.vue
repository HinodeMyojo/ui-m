<script setup lang="ts">
import { ref, computed } from "vue";
import { useBudgetStore } from "@/stores/budget";
import type { CreateAccountRequest, AccountType } from "@/types/budget";

const store = useBudgetStore();

const showModal = ref(false);
const editingId = ref<string | null>(null);

const form = ref<CreateAccountRequest>({
  name: "",
  type: "card",
  balance: 0,
  currency: "RUB",
  interestRate: undefined,
  maturityDate: undefined,
  creditLimit: undefined,
  gracePeriodDays: undefined,
  dailyCommission: undefined,
  minPaymentPercent: undefined,
});

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string }[] = [
  { value: "card", label: "Карта", icon: "💳" },
  { value: "deposit", label: "Вклад", icon: "🏦" },
  { value: "savings", label: "Накопительный", icon: "🐷" },
  { value: "cash", label: "Наличные", icon: "💵" },
  { value: "credit", label: "Кредитная", icon: "🔴" },
  { value: "credit_line", label: "Кубышка", icon: "🏧" },
  { value: "installment", label: "Рассрочка", icon: "📦" },
];

const CREDIT_TYPES: AccountType[] = ["credit", "credit_line", "installment"];

function getTypeInfo(type: AccountType) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[0];
}

function openAdd() {
  editingId.value = null;
  form.value = { name: "", type: "card", balance: 0, currency: "RUB" };
  showModal.value = true;
}

function openEdit(id: string) {
  const acc = store.accounts.find((a) => a.id === id);
  if (!acc) return;
  editingId.value = id;
  form.value = {
    name: acc.name,
    type: acc.type,
    balance: acc.balance,
    currency: acc.currency,
    interestRate: acc.interestRate,
    maturityDate: acc.maturityDate,
    creditLimit: acc.creditLimit,
    gracePeriodDays: acc.gracePeriodDays,
    dailyCommission: acc.dailyCommission,
    minPaymentPercent: acc.minPaymentPercent,
  };
  showModal.value = true;
}

async function submit() {
  if (!form.value.name.trim()) return;
  try {
    if (editingId.value) {
      await store.updateAccount(editingId.value, form.value);
    } else {
      await store.createAccount(form.value);
    }
    showModal.value = false;
  } catch {}
}

async function handleDelete(id: string) {
  if (!confirm("Удалить счёт?")) return;
  await store.deleteAccount(id);
}

function fmt(n: number) {
  return n.toLocaleString("ru");
}

const monthlyPassiveTotal = computed(() => {
  return store.accounts.reduce((sum, acc) => {
    if (!acc.isActive || !acc.interestRate) return sum;
    return sum + (acc.balance * acc.interestRate) / 100 / 12;
  }, 0);
});

const showInterest = computed(() => form.value.type === "deposit" || form.value.type === "savings");
const showCreditFields = computed(() => CREDIT_TYPES.includes(form.value.type));
const showGracePeriod = computed(() => form.value.type === "credit" || form.value.type === "credit_line");
const showDailyCommission = computed(() => form.value.type === "credit_line");
const showMinPayment = computed(() => form.value.type === "credit");

function isCreditType(type: AccountType) {
  return CREDIT_TYPES.includes(type);
}

function utilizationPercent(acc: { balance: number; creditLimit?: number }) {
  if (!acc.creditLimit || acc.creditLimit <= 0) return 0;
  return Math.min(100, Math.round((Math.abs(acc.balance) / acc.creditLimit) * 100));
}
</script>

<template>
  <div class="accounts-tab">
    <div class="acc-toolbar">
      <div class="acc-summary">
        <div class="summary-item">
          <span class="summary-label">Общий баланс</span>
          <span class="summary-value">{{ fmt(store.totalBalance) }} ₽</span>
        </div>
        <div class="summary-item" v-if="store.totalDebt > 0">
          <span class="summary-label">Долги</span>
          <span class="summary-value red">-{{ fmt(store.totalDebt) }} ₽</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Чистыми</span>
          <span class="summary-value" :class="store.netWorth >= 0 ? '' : 'red'">{{ fmt(store.netWorth) }} ₽</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Пассивный доход/мес</span>
          <span class="summary-value green">+{{ fmt(Math.round(monthlyPassiveTotal)) }} ₽</span>
        </div>
      </div>
      <button class="btn-add" @click="openAdd">+ Добавить счёт</button>
    </div>

    <div class="acc-grid">
      <div v-if="!store.accounts.length" class="empty-hint">Нет счетов</div>
      <div
        v-for="acc in store.accounts"
        :key="acc.id"
        class="acc-card"
        :class="{ inactive: !acc.isActive }"
        @click="openEdit(acc.id)"
      >
        <div class="acc-top">
          <span class="acc-type-icon">{{ getTypeInfo(acc.type).icon }}</span>
          <span class="acc-type-label">{{ getTypeInfo(acc.type).label }}</span>
          <button class="acc-delete" @click.stop="handleDelete(acc.id)" title="Удалить">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <div class="acc-name">{{ acc.name }}</div>

        <!-- Balance -->
        <div class="acc-balance" :class="{ 'acc-balance-debt': acc.balance < 0 && isCreditType(acc.type) }">
          <template v-if="acc.balance < 0 && isCreditType(acc.type)">
            Долг: {{ fmt(Math.abs(acc.balance)) }} ₽
          </template>
          <template v-else>
            {{ fmt(acc.balance) }} ₽
          </template>
        </div>

        <!-- Credit utilization -->
        <div v-if="isCreditType(acc.type) && acc.creditLimit" class="acc-credit-bar">
          <div class="credit-bar-track">
            <div
              class="credit-bar-fill"
              :style="{ width: utilizationPercent(acc) + '%' }"
              :class="{ 'credit-bar-high': utilizationPercent(acc) > 70 }"
            ></div>
          </div>
          <span class="credit-bar-label">{{ utilizationPercent(acc) }}% из {{ fmt(acc.creditLimit) }} ₽</span>
        </div>

        <!-- Interest info -->
        <div class="acc-meta" v-if="acc.interestRate">
          <span class="acc-rate">{{ acc.interestRate }}% годовых</span>
          <span class="acc-monthly">~{{ fmt(Math.round((acc.balance * acc.interestRate) / 100 / 12)) }} ₽/мес</span>
        </div>
        <div class="acc-meta" v-if="acc.maturityDate">
          <span class="acc-maturity">до {{ new Date(acc.maturityDate).toLocaleDateString('ru') }}</span>
        </div>

        <!-- Credit-specific meta -->
        <div class="acc-meta" v-if="acc.gracePeriodDays">
          <span class="acc-grace">Грейс: {{ acc.gracePeriodDays }} дн.</span>
        </div>
        <div class="acc-meta" v-if="acc.dailyCommission">
          <span class="acc-commission">Комиссия: {{ acc.dailyCommission }}%/день</span>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-card">
          <button class="modal-close" @click="showModal = false">×</button>
          <h3 class="modal-title">{{ editingId ? 'Редактировать счёт' : 'Новый счёт' }}</h3>
          <form @submit.prevent="submit" class="modal-form">
            <label>
              <span>Тип</span>
              <div class="type-grid">
                <button
                  v-for="t in ACCOUNT_TYPES"
                  :key="t.value"
                  type="button"
                  class="type-btn"
                  :class="{ active: form.type === t.value }"
                  @click="form.type = t.value"
                >
                  <span>{{ t.icon }}</span>
                  <span>{{ t.label }}</span>
                </button>
              </div>
            </label>
            <label>
              <span>Название</span>
              <input v-model="form.name" type="text" required placeholder="Тинькофф Чёрная" />
            </label>
            <label>
              <span>Баланс (₽)</span>
              <input v-model.number="form.balance" type="number" step="0.01" required />
            </label>

            <!-- Deposit / Savings fields -->
            <label v-if="showInterest">
              <span>Процентная ставка (% годовых)</span>
              <input v-model.number="form.interestRate" type="number" min="0" max="100" step="0.1" placeholder="13.5" />
            </label>
            <label v-if="form.type === 'deposit'">
              <span>Дата окончания вклада</span>
              <input v-model="form.maturityDate" type="date" />
            </label>

            <!-- Credit fields -->
            <label v-if="showCreditFields">
              <span>Кредитный лимит (₽)</span>
              <input v-model.number="form.creditLimit" type="number" min="0" step="1" placeholder="100000" />
            </label>
            <label v-if="showGracePeriod">
              <span>Грейс-период (дней)</span>
              <input v-model.number="form.gracePeriodDays" type="number" min="0" step="1" placeholder="55" />
            </label>
            <label v-if="showMinPayment">
              <span>Минимальный платёж (%)</span>
              <input v-model.number="form.minPaymentPercent" type="number" min="0" max="100" step="0.1" placeholder="5" />
            </label>
            <label v-if="showDailyCommission">
              <span>Комиссия за день (%)</span>
              <input v-model.number="form.dailyCommission" type="number" min="0" max="10" step="0.01" placeholder="0.03" />
            </label>

            <button type="submit" class="btn-submit">{{ editingId ? 'Сохранить' : 'Создать' }}</button>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.accounts-tab { display: flex; flex-direction: column; gap: 16px; }

.acc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.acc-summary { display: flex; gap: 24px; flex-wrap: wrap; }
.summary-item { display: flex; flex-direction: column; gap: 2px; }
.summary-label { font-size: 12px; color: #6b7fa3; }
.summary-value { font-size: 20px; font-weight: 700; color: #fff; }
.summary-value.green { color: #34d399; }
.summary-value.red { color: #f87171; }

.btn-add {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none; color: #fff;
  padding: 10px 20px; border-radius: 10px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.btn-add:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

.acc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.acc-card {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.25s;
}
.acc-card:hover {
  transform: translateY(-2px);
  border-color: rgba(23, 103, 253, 0.35);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
.acc-card.inactive { opacity: 0.5; }

.acc-top { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.acc-type-icon { font-size: 22px; }
.acc-type-label { font-size: 12px; color: #6b7fa3; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }

.acc-delete {
  background: none; border: none;
  color: #4a5c7a; cursor: pointer;
  padding: 4px; border-radius: 6px;
  opacity: 0; transition: all 0.2s;
}
.acc-card:hover .acc-delete { opacity: 1; }
.acc-delete:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

.acc-name { font-size: 16px; font-weight: 600; color: #e1e8f0; margin-bottom: 4px; }
.acc-balance { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 8px; }
.acc-balance-debt { color: #f87171; }

/* Credit utilization bar */
.acc-credit-bar { margin-bottom: 8px; }
.credit-bar-track {
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}
.credit-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: #60a5fa;
  transition: width 0.4s ease;
}
.credit-bar-fill.credit-bar-high { background: #f87171; }
.credit-bar-label { font-size: 11px; color: #6b7fa3; }

.acc-meta { display: flex; gap: 12px; font-size: 12px; margin-top: 4px; }
.acc-rate { color: #34d399; font-weight: 500; }
.acc-monthly { color: #7eb0ff; }
.acc-maturity { color: #fbbf24; }
.acc-grace { color: #c084fc; }
.acc-commission { color: #f97316; }

.empty-hint { color: #4a5c7a; font-size: 14px; text-align: center; padding: 40px; grid-column: 1 / -1; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; padding: 16px;
}
.modal-card {
  background: linear-gradient(135deg, rgba(14, 15, 26, 0.99), rgba(20, 22, 36, 0.99));
  border: 1px solid rgba(23, 103, 253, 0.3); border-radius: 16px;
  padding: 28px; width: 100%; max-width: 440px;
  max-height: 90vh; overflow-y: auto; position: relative;
}
.modal-close {
  position: absolute; top: 16px; right: 16px;
  background: none; border: none; color: #6b7fa3;
  font-size: 22px; cursor: pointer; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center; border-radius: 8px;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.modal-title { font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 20px; }

.modal-form { display: flex; flex-direction: column; gap: 14px; }
.modal-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #7eb0ff; }
.modal-form input {
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.2); border-radius: 10px;
  padding: 10px 14px; color: #fff; font-size: 14px; outline: none;
}
.modal-form input:focus { border-color: rgba(23, 103, 253, 0.5); }

.type-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.type-btn {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: rgba(23, 103, 253, 0.04); border: 1px solid rgba(23, 103, 253, 0.12);
  border-radius: 10px; padding: 10px 6px; cursor: pointer; transition: all 0.2s;
  color: #6b7fa3; font-size: 11px;
}
.type-btn span:first-child { font-size: 22px; }
.type-btn:hover { background: rgba(23, 103, 253, 0.1); }
.type-btn.active { border-color: #1767fd; background: rgba(23, 103, 253, 0.15); color: #fff; }

.btn-submit {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none; color: #fff; padding: 12px; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-top: 4px;
}
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

@media (max-width: 768px) {
  .acc-toolbar { flex-direction: column; align-items: stretch; }
  .acc-summary { justify-content: space-between; }
  .acc-grid { grid-template-columns: 1fr; }
  .acc-delete { opacity: 1; }
  .type-grid { grid-template-columns: repeat(3, 1fr); }
}
</style>
