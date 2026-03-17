<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useBudgetStore } from "@/stores/budget";
import type { CreateTransactionRequest, TransactionImportItem, TransactionType } from "@/types/budget";

const store = useBudgetStore();

const filterType = ref<"all" | "income" | "expense" | "transfer">("all");
const showAddModal = ref(false);
const showImportModal = ref(false);

const form = ref<CreateTransactionRequest>({
  categoryId: "",
  type: "expense",
  amount: 0,
  description: "",
  date: new Date().toISOString().slice(0, 10),
  bank: "",
  fromAccountId: "",
  toAccountId: "",
  accountId: "",
});

// Load banks on mount
if (!store.banks.length) store.fetchBanks();

const filteredTransactions = computed(() => {
  if (filterType.value === "all") return store.transactions;
  return store.transactions.filter((t) => t.type === filterType.value);
});

// Grouping
const groupBy = ref<"none" | "category" | "date">("none");
const expandedGroups = ref(new Set<string>());

// When switching groupBy mode, collapse all
watch(groupBy, () => {
  expandedGroups.value = new Set();
});

// Navigation from dashboard: click on category → open transactions grouped by category with that category expanded
watch(() => store.navigateTo, (nav) => {
  if (nav?.tab === "transactions" && nav.categoryId) {
    groupBy.value = "category";
    expandedGroups.value = new Set([nav.categoryId]);
    store.navigateTo = null;
  }
}, { immediate: true });

function toggleGroup(key: string) {
  if (expandedGroups.value.has(key)) {
    expandedGroups.value.delete(key);
  } else {
    expandedGroups.value.add(key);
  }
}

interface TxGroup {
  key: string;
  label: string;
  icon?: string;
  total: number;
  count: number;
  transactions: typeof store.transactions;
}

const groupedTransactions = computed((): TxGroup[] => {
  const txs = filteredTransactions.value;
  if (groupBy.value === "none") {
    return [{ key: "__all", label: "", icon: "", total: 0, count: txs.length, transactions: txs }];
  }

  const map = new Map<string, TxGroup>();

  if (groupBy.value === "category") {
    for (const tx of txs) {
      let key: string, label: string, icon: string;
      if (tx.type === "transfer") {
        key = "__transfer";
        label = "Переводы";
        icon = "↔";
      } else {
        const cat = getCatInfo(tx.categoryId);
        key = tx.categoryId ?? "__nocat";
        label = cat?.name ?? "Без категории";
        icon = cat?.icon ?? "❓";
      }
      if (!map.has(key)) {
        map.set(key, { key, label, icon, total: 0, count: 0, transactions: [] });
      }
      const g = map.get(key)!;
      g.total += tx.type === "income" ? tx.amount : -tx.amount;
      g.count++;
      g.transactions.push(tx);
    }
  } else {
    // group by date
    for (const tx of txs) {
      const key = tx.date.slice(0, 10);
      if (!map.has(key)) {
        const d = new Date(key);
        const label = d.toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" });
        map.set(key, { key, label, total: 0, count: 0, transactions: [] });
      }
      const g = map.get(key)!;
      g.total += tx.type === "income" ? tx.amount : tx.type === "expense" ? -tx.amount : 0;
      g.count++;
      g.transactions.push(tx);
    }
  }

  // Sort groups
  const groups = [...map.values()];
  if (groupBy.value === "date") {
    groups.sort((a, b) => b.key.localeCompare(a.key)); // newest first
  } else {
    groups.sort((a, b) => Math.abs(b.total) - Math.abs(a.total)); // largest first
  }
  return groups;
});

const availableCategories = computed(() =>
  form.value.type === "income" ? store.incomeCategories : store.expenseCategories
);

const isTransfer = computed(() => form.value.type === "transfer");

function setFormType(type: TransactionType) {
  form.value.type = type;
  form.value.categoryId = "";
  form.value.fromAccountId = "";
  form.value.toAccountId = "";
  form.value.accountId = "";
}

async function submitTransaction() {
  if (isTransfer.value) {
    if (!form.value.fromAccountId || !form.value.toAccountId || form.value.fromAccountId === form.value.toAccountId) return;
    if (form.value.amount <= 0) return;
    const payload: CreateTransactionRequest = {
      type: "transfer",
      amount: form.value.amount,
      description: form.value.description,
      date: form.value.date,
      bank: form.value.bank || undefined,
      fromAccountId: form.value.fromAccountId,
      toAccountId: form.value.toAccountId,
    };
    try {
      await store.createTransaction(payload);
      showAddModal.value = false;
      resetForm();
    } catch {}
  } else {
    if (!form.value.categoryId || form.value.amount <= 0) return;
    const payload: CreateTransactionRequest = {
      categoryId: form.value.categoryId,
      type: form.value.type,
      amount: form.value.amount,
      description: form.value.description,
      date: form.value.date,
      bank: form.value.bank || undefined,
      accountId: form.value.accountId || undefined,
    };
    try {
      await store.createTransaction(payload);
      showAddModal.value = false;
      resetForm();
    } catch {}
  }
}

function resetForm() {
  form.value = {
    categoryId: "",
    type: "expense",
    amount: 0,
    description: "",
    date: new Date().toISOString().slice(0, 10),
    bank: "",
    fromAccountId: "",
    toAccountId: "",
    accountId: "",
  };
}

async function handleDelete(id: string) {
  if (!confirm("Удалить операцию?")) return;
  await store.deleteTransaction(id);
}

// JSON import
const importJson = ref("");
const importError = ref("");
const importPreview = ref<TransactionImportItem[]>([]);

async function downloadAiContext() {
  const [cats, accs] = await Promise.all([
    store.exportCategories(),
    store.exportAccounts(),
  ]);
  const context = {
    categories: cats.map((c) => ({ name: c.name, type: c.type })),
    accounts: accs,
    banks: store.banks.map((b) => b.name),
    format: {
      expense_or_income: { categoryName: "string", type: "expense|income", amount: 0, date: "YYYY-MM-DD", description: "optional", bank: "optional", accountName: "optional" },
      transfer: { type: "transfer", fromAccountName: "string", toAccountName: "string", amount: 0, date: "YYYY-MM-DD", description: "optional", bank: "optional" },
    },
  };
  const blob = new Blob([JSON.stringify(context, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "budget-ai-context.json";
  a.click();
  URL.revokeObjectURL(url);
}

function parseImportJson() {
  importError.value = "";
  importPreview.value = [];
  try {
    const parsed = JSON.parse(importJson.value);
    const items: TransactionImportItem[] = Array.isArray(parsed) ? parsed : parsed.transactions ?? [];
    if (!items.length) {
      importError.value = "Массив транзакций пуст";
      return;
    }
    importPreview.value = items;
  } catch {
    importError.value = "Невалидный JSON";
  }
}

function resolveAccountByName(name: string): string {
  const acc = store.accounts.find(
    (a) => a.isActive && a.name.toLowerCase() === name.toLowerCase()
  );
  return acc?.id ?? "";
}

async function confirmImport() {
  const errors: string[] = [];
  const resolved: CreateTransactionRequest[] = importPreview.value.map((item, i) => {
    if (item.type === "transfer") {
      const fromId = item.fromAccountName ? resolveAccountByName(item.fromAccountName) : "";
      const toId = item.toAccountName ? resolveAccountByName(item.toAccountName) : "";
      if (!fromId) errors.push(`#${i + 1}: счёт «${item.fromAccountName}» не найден`);
      if (!toId) errors.push(`#${i + 1}: счёт «${item.toAccountName}» не найден`);
      return {
        type: item.type,
        amount: item.amount,
        description: item.description,
        date: item.date,
        bank: item.bank,
        fromAccountId: fromId,
        toAccountId: toId,
      };
    } else {
      const cat = store.categories.find(
        (c) => c.name.toLowerCase() === (item.categoryName ?? "").toLowerCase() && c.type === item.type
      );
      if (!cat) errors.push(`#${i + 1}: категория «${item.categoryName}» не найдена`);
      return {
        categoryId: cat?.id ?? "",
        type: item.type,
        amount: item.amount,
        description: item.description,
        date: item.date,
        bank: item.bank,
        accountId: item.accountName ? resolveAccountByName(item.accountName) : undefined,
      };
    }
  });

  if (errors.length) {
    importError.value = errors.join("\n");
    return;
  }

  try {
    await store.importTransactions({ transactions: resolved });
    showImportModal.value = false;
    importJson.value = "";
    importPreview.value = [];
    importError.value = "";
  } catch {}
}

function fmt(n: number) {
  return n.toLocaleString("ru");
}

function getCatInfo(catId?: string) {
  if (!catId) return undefined;
  return store.getCategoryById(catId);
}

function getAccountName(accId?: string) {
  if (!accId) return "";
  return store.accounts.find((a) => a.id === accId)?.name ?? "";
}
</script>

<template>
  <div class="transactions-tab">
    <!-- Toolbar -->
    <div class="tx-toolbar">
      <div class="filter-pills">
        <button :class="{ active: filterType === 'all' }" @click="filterType = 'all'">Все</button>
        <button :class="{ active: filterType === 'expense' }" @click="filterType = 'expense'">Расходы</button>
        <button :class="{ active: filterType === 'income' }" @click="filterType = 'income'">Доходы</button>
        <button :class="{ active: filterType === 'transfer' }" @click="filterType = 'transfer'">Переводы</button>
      </div>
      <div class="tx-actions">
        <div class="group-pills">
          <button :class="{ active: groupBy === 'none' }" @click="groupBy = 'none'">Список</button>
          <button :class="{ active: groupBy === 'category' }" @click="groupBy = 'category'">Категории</button>
          <button :class="{ active: groupBy === 'date' }" @click="groupBy = 'date'">По дням</button>
        </div>
        <button class="btn-import" @click="showImportModal = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          JSON
        </button>
        <button class="btn-add" @click="showAddModal = true">+ Добавить</button>
      </div>
    </div>

    <!-- Transaction list (grouped) -->
    <div class="tx-list">
      <div v-if="!filteredTransactions.length" class="empty-hint">Нет операций за этот период</div>
      <template v-for="group in groupedTransactions" :key="group.key">
        <!-- Group header (only when grouping is active) -->
        <div
          v-if="groupBy !== 'none'"
          class="group-header"
          @click="toggleGroup(group.key)"
        >
          <span class="group-icon" v-if="group.icon">{{ group.icon }}</span>
          <span class="group-label">{{ group.label }}</span>
          <span class="group-count">{{ group.count }}</span>
          <span class="group-total" :class="group.total >= 0 ? 'green' : 'red'">
            {{ group.total >= 0 ? '+' : '' }}{{ fmt(Math.abs(group.total)) }} ₽
          </span>
          <span class="group-chevron" :class="{ collapsed: !expandedGroups.has(group.key) }">▼</span>
        </div>
        <template v-if="expandedGroups.has(group.key)">
          <div
            v-for="tx in group.transactions"
            :key="tx.id"
            class="tx-row"
            :class="tx.type"
          >
        <!-- Transfer row -->
        <template v-if="tx.type === 'transfer'">
          <div class="tx-cat-icon tx-transfer-icon">↔</div>
          <div class="tx-info">
            <span class="tx-cat-name">Перевод</span>
            <span class="tx-desc">
              {{ getAccountName(tx.fromAccountId) }} → {{ getAccountName(tx.toAccountId) }}
              <template v-if="tx.description"> · {{ tx.description }}</template>
            </span>
          </div>
          <div class="tx-right">
            <span class="tx-amount transfer">{{ fmt(tx.amount) }} ₽</span>
            <span class="tx-date">
              {{ new Date(tx.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) }}
              <span v-if="tx.bank" class="tx-bank">{{ tx.bank }}</span>
            </span>
          </div>
        </template>
        <!-- Income/Expense row -->
        <template v-else>
          <div class="tx-cat-icon">
            {{ getCatInfo(tx.categoryId)?.icon ?? '❓' }}
          </div>
          <div class="tx-info">
            <span class="tx-cat-name">{{ getCatInfo(tx.categoryId)?.name ?? 'Без категории' }}</span>
            <span v-if="tx.description" class="tx-desc">{{ tx.description }}</span>
          </div>
          <div class="tx-right">
            <span class="tx-amount" :class="tx.type">
              {{ tx.type === 'income' ? '+' : '-' }}{{ fmt(tx.amount) }} ₽
            </span>
            <span class="tx-date">
              {{ new Date(tx.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) }}
              <span v-if="tx.bank" class="tx-bank">{{ tx.bank }}</span>
            </span>
          </div>
        </template>
        <button class="tx-delete" @click="handleDelete(tx.id)" title="Удалить">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
        </template>
      </template>
    </div>

    <!-- Add transaction modal -->
    <Teleport to="body">
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal-card">
          <button class="modal-close" @click="showAddModal = false">×</button>
          <h3 class="modal-title">Новая операция</h3>
          <form @submit.prevent="submitTransaction" class="modal-form">
            <div class="type-switch">
              <button type="button" :class="{ active: form.type === 'expense' }" @click="setFormType('expense')">Расход</button>
              <button type="button" :class="{ active: form.type === 'income' }" @click="setFormType('income')">Доход</button>
              <button type="button" :class="{ active: form.type === 'transfer' }" @click="setFormType('transfer')">Перевод</button>
            </div>

            <!-- Transfer fields -->
            <template v-if="isTransfer">
              <label>
                <span>Откуда</span>
                <select v-model="form.fromAccountId" required>
                  <option value="" disabled>Выберите счёт...</option>
                  <option
                    v-for="acc in store.accounts.filter(a => a.isActive)"
                    :key="acc.id"
                    :value="acc.id"
                    :disabled="acc.id === form.toAccountId"
                  >
                    {{ acc.name }} ({{ fmt(acc.balance) }} ₽)
                  </option>
                </select>
              </label>
              <label>
                <span>Куда</span>
                <select v-model="form.toAccountId" required>
                  <option value="" disabled>Выберите счёт...</option>
                  <option
                    v-for="acc in store.accounts.filter(a => a.isActive)"
                    :key="acc.id"
                    :value="acc.id"
                    :disabled="acc.id === form.fromAccountId"
                  >
                    {{ acc.name }} ({{ fmt(acc.balance) }} ₽)
                  </option>
                </select>
              </label>
            </template>

            <!-- Income/Expense fields -->
            <template v-else>
              <label>
                <span>Категория</span>
                <select v-model="form.categoryId" required>
                  <option value="" disabled>Выберите...</option>
                  <option v-for="cat in availableCategories" :key="cat.id" :value="cat.id">
                    {{ cat.icon }} {{ cat.name }}
                  </option>
                </select>
              </label>
              <label>
                <span>Счёт</span>
                <select v-model="form.accountId">
                  <option value="">Не указан</option>
                  <option v-for="acc in store.accounts.filter(a => a.isActive)" :key="acc.id" :value="acc.id">
                    {{ acc.name }}
                  </option>
                </select>
              </label>
            </template>

            <label>
              <span>Банк</span>
              <select v-model="form.bank">
                <option value="">Не указан</option>
                <option v-for="b in store.banks" :key="b.id" :value="b.name">{{ b.name }}</option>
              </select>
            </label>
            <label>
              <span>Сумма (₽)</span>
              <input v-model.number="form.amount" type="number" min="1" step="0.01" required />
            </label>
            <label>
              <span>Дата</span>
              <input v-model="form.date" type="date" required />
            </label>
            <label>
              <span>Описание</span>
              <input v-model="form.description" type="text" placeholder="Необязательно" />
            </label>
            <button type="submit" class="btn-submit">Добавить</button>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Import modal -->
    <Teleport to="body">
      <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
        <div class="modal-card modal-wide">
          <button class="modal-close" @click="showImportModal = false">×</button>
          <h3 class="modal-title">Импорт из JSON</h3>
          <p class="modal-hint">
            Вставьте JSON от нейросети. Расходы/доходы:<br>
            <code>[{"categoryName": "Продукты", "type": "expense", "amount": 1500, "date": "2026-03-01", "description": "Пятёрочка"}]</code>
            <br>Переводы:<br>
            <code>[{"type": "transfer", "fromAccountName": "Дебетовая", "toAccountName": "Рассрочка", "amount": 5000, "date": "2026-03-01"}]</code>
            <br>Можно смешивать все типы в одном массиве.
          </p>
          <button class="btn-download-context" @click="downloadAiContext">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Скачать данные для ИИ
          </button>
          <textarea
            v-model="importJson"
            class="import-textarea"
            rows="8"
            placeholder='[{"categoryName": "...", "type": "expense", "amount": 0, "date": "2026-03-01"}, {"type": "transfer", "fromAccountName": "...", "toAccountName": "...", "amount": 0, "date": "2026-03-01"}]'
          ></textarea>
          <div v-if="importError" class="import-error">{{ importError }}</div>
          <button class="btn-parse" @click="parseImportJson">Разобрать</button>

          <div v-if="importPreview.length" class="import-preview">
            <h4>Предпросмотр ({{ importPreview.length }} записей)</h4>
            <div class="preview-list">
              <div v-for="(item, i) in importPreview" :key="i" class="preview-row">
                <span class="preview-type" :class="item.type">{{ item.type === 'transfer' ? '↔' : item.type === 'income' ? '+' : '-' }}</span>
                <span class="preview-cat">
                  <template v-if="item.type === 'transfer'">{{ item.fromAccountName }} → {{ item.toAccountName }}</template>
                  <template v-else>{{ item.categoryName }}</template>
                </span>
                <span class="preview-amt">{{ fmt(item.amount) }} ₽</span>
                <span class="preview-date">{{ item.date }}</span>
              </div>
            </div>
            <button class="btn-submit" @click="confirmImport">Импортировать</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.transactions-tab { display: flex; flex-direction: column; gap: 16px; }

/* Toolbar */
.tx-toolbar {
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

.tx-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.group-pills {
  display: flex; gap: 2px;
  background: rgba(110, 74, 255, 0.06); border-radius: 8px; padding: 2px;
}
.group-pills button {
  background: none; border: none; color: #6b7fa3;
  padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
}
.group-pills button.active {
  background: rgba(110, 74, 255, 0.2); color: #c084fc;
}

/* Group headers */
.group-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; margin-top: 8px;
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.12); border-radius: 10px;
  cursor: pointer; transition: all 0.2s;
  user-select: none;
}
.group-header:hover { background: rgba(23, 103, 253, 0.1); }
.group-icon { font-size: 18px; }
.group-label { font-size: 14px; font-weight: 600; color: #e1e8f0; flex: 1; text-transform: capitalize; }
.group-count {
  font-size: 11px; color: #6b7fa3; background: rgba(107, 127, 163, 0.15);
  padding: 2px 8px; border-radius: 10px;
}
.group-total { font-size: 14px; font-weight: 700; }
.group-total.green { color: #34d399; }
.group-total.red { color: #f87171; }
.group-chevron {
  font-size: 10px; color: #6b7fa3; transition: transform 0.2s;
}
.group-chevron.collapsed { transform: rotate(-90deg); }

.btn-import {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(110, 74, 255, 0.12);
  border: 1px solid rgba(110, 74, 255, 0.3);
  color: #b197fc;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-import:hover {
  background: rgba(110, 74, 255, 0.25);
  color: #fff;
}

.btn-add {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  color: #fff;
  padding: 8px 18px;
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
.tx-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tx-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.1);
  border-radius: 12px;
  transition: all 0.2s;
}
.tx-row:hover {
  border-color: rgba(23, 103, 253, 0.25);
  background: rgba(23, 25, 40, 0.98);
}

.tx-cat-icon {
  font-size: 24px;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(23, 103, 253, 0.08);
  border-radius: 10px;
  flex-shrink: 0;
}

.tx-transfer-icon {
  font-size: 20px;
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.1);
}

.tx-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tx-cat-name { font-size: 14px; font-weight: 600; color: #e1e8f0; }
.tx-desc { font-size: 12px; color: #6b7fa3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tx-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.tx-amount { font-size: 15px; font-weight: 700; }
.tx-amount.income { color: #34d399; }
.tx-amount.expense { color: #f87171; }
.tx-amount.transfer { color: #60a5fa; }
.tx-date { font-size: 11px; color: #6b7fa3; }
.tx-bank {
  display: inline-block;
  font-size: 9px;
  color: #7eb0ff;
  background: rgba(23, 103, 253, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 4px;
  font-weight: 500;
}

.tx-delete {
  background: none;
  border: none;
  color: #4a5c7a;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  opacity: 0;
  transition: all 0.2s;
}
.tx-row:hover .tx-delete { opacity: 1; }
.tx-delete:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

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
  max-width: 420px;
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
.modal-form select,
.modal-form textarea {
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
.modal-form select:focus,
.modal-form textarea:focus {
  border-color: rgba(23, 103, 253, 0.5);
}

.modal-form select option {
  background: #1a1b2e;
  color: #fff;
}

.type-switch {
  display: flex;
  gap: 4px;
  background: rgba(23, 103, 253, 0.06);
  border-radius: 10px;
  padding: 3px;
}
.type-switch button {
  flex: 1;
  background: none;
  border: none;
  color: #6b7fa3;
  padding: 10px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.type-switch button.active {
  background: rgba(23, 103, 253, 0.2);
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

/* Import */
.modal-hint {
  font-size: 12px;
  color: #6b7fa3;
  margin: 0 0 12px;
  line-height: 1.5;
}
.modal-hint code {
  display: block;
  background: rgba(23, 103, 253, 0.06);
  padding: 8px;
  border-radius: 6px;
  margin-top: 6px;
  font-size: 11px;
  color: #7eb0ff;
  word-break: break-all;
}

.import-textarea {
  width: 100%;
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 10px;
  padding: 12px;
  color: #c8daf0;
  font-family: monospace;
  font-size: 12px;
  resize: vertical;
  outline: none;
}
.import-textarea:focus { border-color: rgba(23, 103, 253, 0.5); }

.import-error {
  color: #f87171;
  font-size: 13px;
  margin-top: 8px;
  white-space: pre-line;
}

.btn-download-context {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.3);
  color: #34d399;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 12px;
  cursor: pointer;
  margin-bottom: 10px;
  transition: all 0.2s;
}
.btn-download-context:hover {
  background: rgba(52, 211, 153, 0.2);
  color: #6ee7b7;
}

.btn-parse {
  background: rgba(23, 103, 253, 0.12);
  border: 1px solid rgba(23, 103, 253, 0.3);
  color: #7eb0ff;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  margin-top: 8px;
  transition: all 0.2s;
}
.btn-parse:hover { background: rgba(23, 103, 253, 0.25); color: #fff; }

.import-preview { margin-top: 16px; }
.import-preview h4 { color: #c8daf0; font-size: 14px; margin: 0 0 10px; }

.preview-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(23, 103, 253, 0.04);
  border-radius: 8px;
  font-size: 13px;
}
.preview-type { font-weight: 700; width: 16px; }
.preview-type.income { color: #34d399; }
.preview-type.expense { color: #f87171; }
.preview-type.transfer { color: #60a5fa; }
.preview-cat { color: #c8daf0; flex: 1; }
.preview-amt { color: #fff; font-weight: 600; }
.preview-date { color: #6b7fa3; font-size: 12px; }

/* Mobile */
@media (max-width: 768px) {
  .tx-toolbar { flex-direction: column; align-items: stretch; }
  .filter-pills { overflow-x: auto; scrollbar-width: none; }
  .filter-pills::-webkit-scrollbar { display: none; }
  .tx-actions { justify-content: stretch; }
  .tx-actions button { flex: 1; justify-content: center; }
  .tx-delete { opacity: 1; }
  .modal-card { max-width: 92vw; padding: 22px; }
  .modal-wide { max-width: 92vw; }
}

@media (max-width: 480px) {
  .filter-pills button { padding: 8px 12px; font-size: 12px; }
  .group-pills button { padding: 6px 10px; font-size: 11px; }
  .tx-actions { flex-direction: column; }
  .tx-actions button { width: 100%; min-height: 44px; }
  .btn-add { width: 100%; text-align: center; min-height: 44px; font-size: 14px; }
  .btn-import { width: 100%; justify-content: center; min-height: 44px; font-size: 14px; }

  .tx-row { padding: 12px; gap: 10px; }
  .tx-cat-icon { font-size: 20px; width: 36px; height: 36px; border-radius: 8px; }
  .tx-cat-name { font-size: 13px; }
  .tx-desc { font-size: 11px; }
  .tx-amount { font-size: 14px; }
  .tx-date { font-size: 10px; }
  .tx-delete { opacity: 1; padding: 8px; }

  .group-header { padding: 10px 12px; gap: 8px; }
  .group-label { font-size: 13px; }
  .group-total { font-size: 13px; }

  .modal-card { max-width: 92vw; padding: 18px; }
  .modal-wide { max-width: 92vw; }
  .modal-title { font-size: 16px; margin-bottom: 16px; }
  .modal-form input,
  .modal-form select,
  .modal-form textarea { font-size: 16px; padding: 12px 14px; }
  .type-switch button { padding: 10px 6px; font-size: 13px; }
  .btn-submit { min-height: 44px; font-size: 16px; }

  .import-textarea { font-size: 14px; }
  .btn-parse { min-height: 44px; font-size: 14px; }
  .btn-download-context { min-height: 44px; font-size: 13px; justify-content: center; }
  .modal-hint { font-size: 11px; }
  .modal-hint code { font-size: 10px; overflow-x: auto; }
  .preview-row { font-size: 12px; padding: 6px 8px; flex-wrap: wrap; }
}
</style>
