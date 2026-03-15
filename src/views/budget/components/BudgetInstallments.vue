<script setup lang="ts">
import { ref, computed } from "vue";
import { useBudgetStore } from "@/stores/budget";
import type { CreateInstallmentRequest, InstallmentSchedulePayment, InstallmentStatus } from "@/types/budget";

const store = useBudgetStore();

const filterStatus = ref<"all" | InstallmentStatus>("all");
const showAddModal = ref(false);
const showPayModal = ref(false);
const showScheduleModal = ref(false);
const editingId = ref<string | null>(null);
const payingId = ref<string | null>(null);
const scheduleId = ref<string | null>(null);
const schedule = ref<InstallmentSchedulePayment[]>([]);

const form = ref<CreateInstallmentRequest>({
  accountId: "",
  name: "",
  totalAmount: 0,
  totalInstallments: 1,
  monthlyPayment: 0,
  startDate: new Date().toISOString().slice(0, 10),
  gracePeriodDays: 0,
});

const payForm = ref({
  amount: 0,
  fromAccountId: "",
});

const filteredInstallments = computed(() => {
  const sorted = [...store.installments].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    return (a.nextPaymentDate ?? "").localeCompare(b.nextPaymentDate ?? "");
  });
  if (filterStatus.value === "all") return sorted;
  return sorted.filter((i) => i.status === filterStatus.value);
});

const installmentAccounts = computed(() =>
  store.accounts.filter((a) => a.type === "installment" && a.isActive)
);

const debitAccounts = computed(() =>
  store.accounts.filter((a) => !["credit", "credit_line", "installment"].includes(a.type) && a.isActive)
);

function autoCalcPayment() {
  if (form.value.totalAmount > 0 && form.value.totalInstallments > 0) {
    form.value.monthlyPayment = Math.ceil(form.value.totalAmount / form.value.totalInstallments);
  }
}

function openAdd() {
  editingId.value = null;
  form.value = {
    accountId: installmentAccounts.value[0]?.id ?? "",
    name: "",
    totalAmount: 0,
    totalInstallments: 1,
    monthlyPayment: 0,
    startDate: new Date().toISOString().slice(0, 10),
    gracePeriodDays: 0,
  };
  showAddModal.value = true;
}

async function submitInstallment() {
  if (!form.value.name.trim() || form.value.totalAmount <= 0 || form.value.totalInstallments < 1) return;
  if (!form.value.accountId) return;
  try {
    if (editingId.value) {
      await store.updateInstallment(editingId.value, form.value);
    } else {
      await store.createInstallment(form.value);
    }
    showAddModal.value = false;
  } catch {}
}

function openPay(id: string) {
  const inst = store.installments.find((i) => i.id === id);
  if (!inst) return;
  payingId.value = id;
  payForm.value = {
    amount: inst.monthlyPayment,
    fromAccountId: debitAccounts.value[0]?.id ?? "",
  };
  showPayModal.value = true;
}

async function submitPayment() {
  if (!payingId.value || payForm.value.amount <= 0 || !payForm.value.fromAccountId) return;
  try {
    await store.payInstallment(payingId.value, payForm.value);
    showPayModal.value = false;
    payingId.value = null;
  } catch {}
}

async function openSchedule(id: string) {
  scheduleId.value = id;
  schedule.value = [];
  showScheduleModal.value = true;
  try {
    schedule.value = await store.fetchInstallmentSchedule(id);
  } catch {}
}

async function handleDelete(id: string) {
  if (!confirm("Удалить рассрочку?")) return;
  await store.deleteInstallment(id);
}

function fmt(n: number) {
  return n.toLocaleString("ru");
}

function getAccountName(accId: string) {
  return store.accounts.find((a) => a.id === accId)?.name ?? "";
}

function getStatusLabel(status: InstallmentStatus) {
  if (status === "active") return "Активна";
  if (status === "paid_off") return "Погашена";
  return "Просрочена";
}

function daysUntil(dateStr?: string) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  return diff;
}
</script>

<template>
  <div class="installments-tab">
    <!-- Toolbar -->
    <div class="inst-toolbar">
      <div class="filter-pills">
        <button :class="{ active: filterStatus === 'all' }" @click="filterStatus = 'all'">Все</button>
        <button :class="{ active: filterStatus === 'active' }" @click="filterStatus = 'active'">Активные</button>
        <button :class="{ active: filterStatus === 'paid_off' }" @click="filterStatus = 'paid_off'">Погашенные</button>
        <button :class="{ active: filterStatus === 'overdue' }" @click="filterStatus = 'overdue'">Просроченные</button>
      </div>
      <button class="btn-add" @click="openAdd">+ Новая рассрочка</button>
    </div>

    <!-- List -->
    <div class="inst-list">
      <div v-if="!filteredInstallments.length" class="empty-hint">Нет рассрочек</div>
      <div
        v-for="inst in filteredInstallments"
        :key="inst.id"
        class="inst-card"
        :class="inst.status"
      >
        <div class="inst-top">
          <span class="inst-icon">📦</span>
          <div class="inst-info">
            <span class="inst-name">{{ inst.name }}</span>
            <span class="inst-account">{{ getAccountName(inst.accountId) }}</span>
          </div>
          <span class="inst-badge" :class="inst.status">{{ getStatusLabel(inst.status) }}</span>
          <button class="inst-delete" @click="handleDelete(inst.id)" title="Удалить">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>

        <!-- Progress -->
        <div class="inst-progress-section">
          <div class="progress-track">
            <div
              class="progress-fill progress-fill-purple"
              :style="{ width: (inst.totalInstallments > 0 ? (inst.paidInstallments / inst.totalInstallments) * 100 : 0) + '%' }"
            ></div>
          </div>
          <span class="inst-progress-label">{{ inst.paidInstallments }}/{{ inst.totalInstallments }} платежей</span>
        </div>

        <!-- Details -->
        <div class="inst-details">
          <div class="inst-detail">
            <span class="detail-label">Осталось</span>
            <span class="detail-value">{{ fmt(inst.remainingAmount) }} ₽</span>
          </div>
          <div class="inst-detail" v-if="inst.nextPaymentDate && inst.status === 'active'">
            <span class="detail-label">Следующий платёж</span>
            <span class="detail-value">
              {{ new Date(inst.nextPaymentDate).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) }}
              · {{ fmt(inst.monthlyPayment) }} ₽
              <template v-if="daysUntil(inst.nextPaymentDate) !== null">
                <span
                  class="days-badge"
                  :class="{ overdue: (daysUntil(inst.nextPaymentDate) ?? 0) < 0 }"
                >
                  {{ (daysUntil(inst.nextPaymentDate) ?? 0) < 0
                    ? `просрочен на ${Math.abs(daysUntil(inst.nextPaymentDate) ?? 0)} дн.`
                    : `через ${daysUntil(inst.nextPaymentDate)} дн.` }}
                </span>
              </template>
            </span>
          </div>
        </div>

        <!-- Actions -->
        <div class="inst-actions" v-if="inst.status === 'active'">
          <button class="btn-pay" @click.stop="openPay(inst.id)">Внести платёж</button>
          <button class="btn-schedule" @click.stop="openSchedule(inst.id)">График</button>
        </div>
      </div>
    </div>

    <!-- Add modal -->
    <Teleport to="body">
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal-card">
          <button class="modal-close" @click="showAddModal = false">×</button>
          <h3 class="modal-title">{{ editingId ? 'Редактировать рассрочку' : 'Новая рассрочка' }}</h3>
          <form @submit.prevent="submitInstallment" class="modal-form">
            <label>
              <span>Название (что купил)</span>
              <input v-model="form.name" type="text" required placeholder="Наушники Sony WH-1000XM5" />
            </label>
            <label>
              <span>Счёт рассрочки</span>
              <select v-model="form.accountId" required>
                <option value="" disabled>Выберите...</option>
                <option v-for="acc in installmentAccounts" :key="acc.id" :value="acc.id">
                  {{ acc.name }}
                </option>
              </select>
            </label>
            <label>
              <span>Общая сумма (₽)</span>
              <input v-model.number="form.totalAmount" type="number" min="1" step="0.01" required @input="autoCalcPayment" />
            </label>
            <label>
              <span>Количество платежей</span>
              <input v-model.number="form.totalInstallments" type="number" min="1" step="1" required @input="autoCalcPayment" />
            </label>
            <label>
              <span>Ежемесячный платёж (₽)</span>
              <input v-model.number="form.monthlyPayment" type="number" min="0" step="0.01" />
            </label>
            <label>
              <span>Дата покупки</span>
              <input v-model="form.startDate" type="date" required />
            </label>
            <label>
              <span>Грейс-период (дней)</span>
              <input v-model.number="form.gracePeriodDays" type="number" min="0" step="1" />
            </label>
            <button type="submit" class="btn-submit">{{ editingId ? 'Сохранить' : 'Создать' }}</button>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Pay modal -->
    <Teleport to="body">
      <div v-if="showPayModal" class="modal-overlay" @click.self="showPayModal = false">
        <div class="modal-card">
          <button class="modal-close" @click="showPayModal = false">×</button>
          <h3 class="modal-title">Внести платёж</h3>
          <form @submit.prevent="submitPayment" class="modal-form">
            <label>
              <span>Сумма (₽)</span>
              <input v-model.number="payForm.amount" type="number" min="1" step="0.01" required />
            </label>
            <label>
              <span>Списать со счёта</span>
              <select v-model="payForm.fromAccountId" required>
                <option value="" disabled>Выберите...</option>
                <option v-for="acc in debitAccounts" :key="acc.id" :value="acc.id">
                  {{ acc.name }} ({{ fmt(acc.balance) }} ₽)
                </option>
              </select>
            </label>
            <button type="submit" class="btn-submit">Оплатить</button>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Schedule modal -->
    <Teleport to="body">
      <div v-if="showScheduleModal" class="modal-overlay" @click.self="showScheduleModal = false">
        <div class="modal-card modal-wide">
          <button class="modal-close" @click="showScheduleModal = false">×</button>
          <h3 class="modal-title">График платежей</h3>
          <div v-if="!schedule.length" class="empty-hint">Загрузка...</div>
          <div v-else class="schedule-table-wrap">
            <table class="schedule-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Дата</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in schedule" :key="p.number" :class="p.status">
                  <td>{{ p.number }}</td>
                  <td>{{ new Date(p.date).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' }) }}</td>
                  <td>{{ fmt(p.amount) }} ₽</td>
                  <td>
                    <span class="schedule-status" :class="p.status">
                      {{ p.status === 'paid' ? '✅ Оплачен' : p.status === 'overdue' ? '🔴 Просрочен' : '⏳ Предстоит' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.installments-tab { display: flex; flex-direction: column; gap: 16px; }

/* Toolbar */
.inst-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-pills {
  display: flex;
  gap: 4px;
  background: rgba(23, 103, 253, 0.06);
  border-radius: 10px;
  padding: 3px;
}
.filter-pills button {
  background: none;
  border: none;
  color: #6b7fa3;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.filter-pills button.active {
  background: rgba(23, 103, 253, 0.2);
  color: #fff;
}

.btn-add {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  color: #fff;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-add:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3);
}

/* List */
.inst-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.inst-card {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 14px;
  padding: 20px;
  transition: all 0.25s;
}
.inst-card:hover {
  border-color: rgba(23, 103, 253, 0.3);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}
.inst-card.paid_off { opacity: 0.6; }

.inst-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.inst-icon { font-size: 28px; }
.inst-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.inst-name { font-size: 16px; font-weight: 600; color: #e1e8f0; }
.inst-account { font-size: 12px; color: #6b7fa3; }

.inst-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.inst-badge.active { background: rgba(23, 103, 253, 0.15); color: #60a5fa; }
.inst-badge.paid_off { background: rgba(52, 211, 153, 0.15); color: #34d399; }
.inst-badge.overdue { background: rgba(248, 113, 113, 0.15); color: #f87171; }

.inst-delete {
  background: none;
  border: none;
  color: #4a5c7a;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  opacity: 0;
  transition: all 0.2s;
}
.inst-card:hover .inst-delete { opacity: 1; }
.inst-delete:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

/* Progress */
.inst-progress-section { margin-bottom: 14px; }
.progress-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}
.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease;
}
.progress-fill-purple { background: #8b5cf6; }
.inst-progress-label { font-size: 12px; color: #6b7fa3; }

/* Details */
.inst-details {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.inst-detail { display: flex; flex-direction: column; gap: 2px; }
.detail-label { font-size: 11px; color: #6b7fa3; text-transform: uppercase; letter-spacing: 0.3px; }
.detail-value { font-size: 14px; font-weight: 600; color: #c8daf0; }

.days-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(23, 103, 253, 0.1);
  color: #7eb0ff;
  margin-left: 6px;
}
.days-badge.overdue {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

/* Actions */
.inst-actions {
  display: flex;
  gap: 8px;
}
.btn-pay {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-pay:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(23, 103, 253, 0.3);
}
.btn-schedule {
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.3);
  color: #c084fc;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-schedule:hover {
  background: rgba(139, 92, 246, 0.25);
  color: #fff;
}

.empty-hint {
  color: #4a5c7a;
  font-size: 14px;
  text-align: center;
  padding: 40px;
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
}
.modal-card {
  background: linear-gradient(135deg, rgba(14, 15, 26, 0.99), rgba(20, 22, 36, 0.99));
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 16px;
  padding: 28px;
  width: 100%;
  max-width: 440px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}
.modal-wide { max-width: 600px; }
.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: #6b7fa3;
  font-size: 22px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 20px;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #7eb0ff;
}
.modal-form input,
.modal-form select {
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 10px;
  padding: 10px 14px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.modal-form input:focus,
.modal-form select:focus {
  border-color: rgba(23, 103, 253, 0.5);
}
.modal-form select option {
  background: #1a1b2e;
  color: #fff;
}

.btn-submit {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  color: #fff;
  padding: 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 4px;
}
.btn-submit:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3);
}

/* Schedule table */
.schedule-table-wrap {
  overflow-x: auto;
}
.schedule-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.schedule-table th {
  text-align: left;
  padding: 10px 12px;
  color: #6b7fa3;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  border-bottom: 1px solid rgba(23, 103, 253, 0.15);
}
.schedule-table td {
  padding: 10px 12px;
  color: #c8daf0;
  border-bottom: 1px solid rgba(23, 103, 253, 0.06);
}
.schedule-table tr.paid td { color: #6b7fa3; }
.schedule-table tr.overdue td { color: #f87171; }
.schedule-status { font-size: 12px; }
.schedule-status.paid { color: #34d399; }
.schedule-status.upcoming { color: #7eb0ff; }
.schedule-status.overdue { color: #f87171; }

/* Mobile */
@media (max-width: 768px) {
  .inst-toolbar { flex-direction: column; align-items: stretch; }
  .filter-pills { overflow-x: auto; scrollbar-width: none; }
  .filter-pills::-webkit-scrollbar { display: none; }
  .inst-details { flex-direction: column; gap: 8px; }
  .inst-actions { flex-direction: column; }
  .inst-actions button { width: 100%; text-align: center; }
  .inst-delete { opacity: 1; }
}
</style>
