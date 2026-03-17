<script setup lang="ts">
import { ref, computed } from "vue";
import { useBudgetStore } from "@/stores/budget";
import type { CreatePlannedExpenseRequest } from "@/types/budget";

const store = useBudgetStore();

const showModal = ref(false);
const editingId = ref<string | null>(null);

const form = ref<CreatePlannedExpenseRequest>({
  name: "",
  amount: 0,
  categoryId: undefined,
  date: "",
  description: "",
});

const sortedPlanned = computed(() =>
  [...store.plannedExpenses].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
);

const totalPlanned = computed(() =>
  store.plannedExpenses.filter((p) => !p.isCompleted).reduce((s, p) => s + p.amount, 0)
);

function openAdd() {
  editingId.value = null;
  form.value = { name: "", amount: 0, date: "", description: "" };
  showModal.value = true;
}

function openEdit(id: string) {
  const pe = store.plannedExpenses.find((p) => p.id === id);
  if (!pe) return;
  editingId.value = id;
  form.value = {
    name: pe.name,
    amount: pe.amount,
    categoryId: pe.categoryId,
    date: pe.date,
    description: pe.description,
  };
  showModal.value = true;
}

async function submit() {
  if (!form.value.name.trim() || !form.value.amount || !form.value.date) return;
  try {
    if (editingId.value) {
      await store.updatePlannedExpense(editingId.value, form.value);
    } else {
      await store.createPlannedExpense(form.value);
    }
    showModal.value = false;
  } catch {}
}

async function toggleComplete(id: string) {
  const pe = store.plannedExpenses.find((p) => p.id === id);
  if (!pe) return;
  await store.updatePlannedExpense(id, { isCompleted: !pe.isCompleted });
}

async function handleDelete(id: string) {
  if (!confirm("Удалить запланированную трату?")) return;
  await store.deletePlannedExpense(id);
}

function fmt(n: number) {
  return n.toLocaleString("ru");
}

function isPast(date: string) {
  return new Date(date) < new Date();
}

function daysUntil(date: string) {
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  return diff;
}
</script>

<template>
  <div class="planned-tab">
    <div class="planned-toolbar">
      <div class="planned-summary">
        <span class="summary-label">Всего запланировано:</span>
        <span class="summary-value">{{ fmt(totalPlanned) }} ₽</span>
      </div>
      <button class="btn-add" @click="openAdd">+ Запланировать</button>
    </div>

    <div class="planned-list">
      <div v-if="!sortedPlanned.length" class="empty-hint">Нет запланированных трат</div>
      <div
        v-for="pe in sortedPlanned"
        :key="pe.id"
        class="planned-row"
        :class="{ completed: pe.isCompleted, overdue: !pe.isCompleted && isPast(pe.date) }"
        @click="openEdit(pe.id)"
      >
        <button class="check-btn" @click.stop="toggleComplete(pe.id)" :title="pe.isCompleted ? 'Отменить' : 'Выполнено'">
          <svg v-if="pe.isCompleted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          <div v-else class="check-empty"></div>
        </button>
        <div class="planned-info">
          <span class="planned-name">{{ pe.name }}</span>
          <span v-if="pe.description" class="planned-desc">{{ pe.description }}</span>
        </div>
        <div class="planned-right">
          <span class="planned-amount">-{{ fmt(pe.amount) }} ₽</span>
          <span class="planned-date" :class="{ overdue: !pe.isCompleted && isPast(pe.date) }">
            {{ new Date(pe.date).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' }) }}
            <template v-if="!pe.isCompleted && !isPast(pe.date)">
              (через {{ daysUntil(pe.date) }} дн.)
            </template>
          </span>
        </div>
        <button class="row-delete" @click.stop="handleDelete(pe.id)" title="Удалить">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-card">
          <button class="modal-close" @click="showModal = false">×</button>
          <h3 class="modal-title">{{ editingId ? 'Редактировать' : 'Запланировать трату' }}</h3>
          <form @submit.prevent="submit" class="modal-form">
            <label>
              <span>Название</span>
              <input v-model="form.name" type="text" required placeholder="Отпуск в Турцию" />
            </label>
            <label>
              <span>Сумма (₽)</span>
              <input v-model.number="form.amount" type="number" min="1" step="100" required />
            </label>
            <label>
              <span>Дата</span>
              <input v-model="form.date" type="date" required />
            </label>
            <label>
              <span>Категория (необязательно)</span>
              <select v-model="form.categoryId">
                <option :value="undefined">Без категории</option>
                <option v-for="cat in store.expenseCategories" :key="cat.id" :value="cat.id">
                  {{ cat.icon }} {{ cat.name }}
                </option>
              </select>
            </label>
            <label>
              <span>Описание</span>
              <input v-model="form.description" type="text" placeholder="Необязательно" />
            </label>
            <button type="submit" class="btn-submit">{{ editingId ? 'Сохранить' : 'Создать' }}</button>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.planned-tab { display: flex; flex-direction: column; gap: 16px; }

.planned-toolbar {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
}

.planned-summary { display: flex; align-items: baseline; gap: 8px; }
.summary-label { font-size: 14px; color: #6b7fa3; }
.summary-value { font-size: 22px; font-weight: 700; color: #f87171; }

.btn-add {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none; color: #fff;
  padding: 10px 20px; border-radius: 10px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-add:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

.planned-list { display: flex; flex-direction: column; gap: 6px; }

.planned-row {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.1);
  border-radius: 12px;
  cursor: pointer; transition: all 0.2s;
}
.planned-row:hover { border-color: rgba(23, 103, 253, 0.25); }
.planned-row.completed { opacity: 0.5; }
.planned-row.overdue { border-color: rgba(248, 113, 113, 0.3); }

.check-btn {
  background: none; border: none; cursor: pointer;
  padding: 0; display: flex; align-items: center;
}
.check-empty {
  width: 20px; height: 20px;
  border: 2px solid #4a5c7a;
  border-radius: 50%;
  transition: border-color 0.2s;
}
.check-btn:hover .check-empty { border-color: #34d399; }

.planned-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.planned-name { font-size: 14px; font-weight: 600; color: #e1e8f0; }
.planned-desc { font-size: 12px; color: #6b7fa3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.planned-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.planned-amount { font-size: 16px; font-weight: 700; color: #f87171; }
.planned-date { font-size: 12px; color: #6b7fa3; }
.planned-date.overdue { color: #f87171; }

.row-delete {
  background: none; border: none; color: #4a5c7a;
  cursor: pointer; padding: 6px; border-radius: 6px;
  opacity: 0; transition: all 0.2s;
}
.planned-row:hover .row-delete { opacity: 1; }
.row-delete:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

.empty-hint { color: #4a5c7a; font-size: 14px; text-align: center; padding: 40px; }

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
.modal-form input, .modal-form select {
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.2); border-radius: 10px;
  padding: 10px 14px; color: #fff; font-size: 14px; outline: none;
}
.modal-form input:focus, .modal-form select:focus { border-color: rgba(23, 103, 253, 0.5); }
.modal-form select option { background: #1a1b2e; color: #fff; }

.btn-submit {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none; color: #fff; padding: 12px; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-top: 4px;
}
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

@media (max-width: 768px) {
  .planned-toolbar { flex-direction: column; align-items: stretch; }
  .row-delete { opacity: 1; }
  .modal-card { max-width: 92vw; padding: 22px; }
}

@media (max-width: 480px) {
  .planned-summary { flex-direction: column; gap: 4px; }
  .summary-value { font-size: 20px; }
  .btn-add { width: 100%; text-align: center; min-height: 44px; font-size: 14px; }

  .planned-row { padding: 12px; gap: 10px; flex-wrap: wrap; }
  .planned-name { font-size: 13px; }
  .planned-desc { font-size: 11px; }
  .planned-amount { font-size: 15px; }
  .planned-date { font-size: 11px; }
  .check-btn { min-width: 36px; min-height: 36px; display: flex; align-items: center; justify-content: center; }
  .check-empty { width: 24px; height: 24px; }
  .row-delete { opacity: 1; min-width: 36px; min-height: 36px; display: flex; align-items: center; justify-content: center; }

  .modal-card { max-width: 92vw; padding: 18px; }
  .modal-title { font-size: 16px; margin-bottom: 16px; }
  .modal-form input,
  .modal-form select { font-size: 16px; padding: 12px 14px; }
  .btn-submit { min-height: 44px; font-size: 16px; }
}
</style>
