import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  Category,
  Transaction,
  Account,
  SavingsGoal,
  PlannedExpense,
  BudgetDashboard,
  MonthlyStats,
  Installment,
  InstallmentSchedulePayment,
  BudgetPlan,
  BudgetPlanSummary,
} from "../types/budget";
import * as api from "../api/budget";

export const useBudgetStore = defineStore("budget", () => {
  // --- State ---
  const categories = ref<Category[]>([]);
  const transactions = ref<Transaction[]>([]);
  const transactionsTotal = ref(0);
  const accounts = ref<Account[]>([]);
  const goals = ref<SavingsGoal[]>([]);
  const plannedExpenses = ref<PlannedExpense[]>([]);
  const dashboard = ref<BudgetDashboard | null>(null);
  const monthlyStats = ref<Map<string, MonthlyStats>>(new Map());
  const installments = ref<Installment[]>([]);
  const banks = ref<{ id: string; name: string }[]>([]);
  const plans = ref<BudgetPlan[]>([]);
  const currentPlan = ref<BudgetPlanSummary | null>(null);

  // Navigation state (for cross-tab navigation)
  const navigateTo = ref<{ tab: string; categoryId?: string } | null>(null);

  const loading = ref(false);
  const error = ref<string | null>(null);
  const currentMonth = ref(
    new Date().toISOString().slice(0, 7) // "2026-03"
  );

  // --- Getters ---
  const expenseCategories = computed(() =>
    categories.value.filter((c) => c.type === "expense").sort((a, b) => a.sortOrder - b.sortOrder)
  );

  const incomeCategories = computed(() =>
    categories.value.filter((c) => c.type === "income").sort((a, b) => a.sortOrder - b.sortOrder)
  );

  const totalBalance = computed(() =>
    accounts.value.reduce((sum, a) => sum + (a.isActive ? a.balance : 0), 0)
  );

  const activeGoals = computed(() =>
    goals.value.filter((g) => g.status === "active")
  );

  const getCategoryById = computed(() => (id: string) =>
    categories.value.find((c) => c.id === id)
  );

  const activeInstallments = computed(() =>
    installments.value.filter((i) => i.status === "active")
  );

  const totalDebt = computed(() =>
    accounts.value
      .filter((a) => ["credit", "credit_line", "installment"].includes(a.type) && a.balance < 0)
      .reduce((sum, a) => sum + Math.abs(a.balance), 0)
  );

  const netWorth = computed(() => totalBalance.value - totalDebt.value);

  const creditAccounts = computed(() =>
    accounts.value.filter((a) => ["credit", "credit_line", "installment"].includes(a.type))
  );

  const monthlyTransfers = computed(() =>
    transactions.value.filter((t) => t.type === "transfer")
  );

  // --- Actions ---

  async function fetchCategories() {
    loading.value = true;
    error.value = null;
    try {
      categories.value = await api.getCategories();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch categories";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createCategory(data: Parameters<typeof api.createCategory>[0]) {
    loading.value = true;
    error.value = null;
    try {
      const { id } = await api.createCategory(data);
      categories.value.push({
        id,
        ...data,
        sortOrder: data.sortOrder ?? categories.value.length,
      });
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create category";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateCategory(id: string, data: Parameters<typeof api.updateCategory>[1]) {
    error.value = null;
    try {
      await api.updateCategory(id, data);
      const idx = categories.value.findIndex((c) => c.id === id);
      if (idx !== -1) categories.value[idx] = { ...categories.value[idx], ...data };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update category";
      throw e;
    }
  }

  async function deleteCategory(id: string) {
    error.value = null;
    try {
      await api.deleteCategory(id);
      categories.value = categories.value.filter((c) => c.id !== id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete category";
      throw e;
    }
  }

  async function exportCategories() {
    return api.exportCategories();
  }

  async function exportAccounts() {
    return api.exportAccounts();
  }

  async function fetchBanks() {
    try {
      banks.value = await api.getBanks();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch banks";
    }
  }

  async function createBank(name: string) {
    try {
      const { id } = await api.createBank({ name });
      banks.value.push({ id, name });
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create bank";
      throw e;
    }
  }

  async function updateBank(id: string, name: string) {
    try {
      await api.updateBank(id, { name });
      const idx = banks.value.findIndex((b) => b.id === id);
      if (idx !== -1) banks.value[idx].name = name;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update bank";
      throw e;
    }
  }

  async function deleteBank(id: string) {
    try {
      await api.deleteBank(id);
      banks.value = banks.value.filter((b) => b.id !== id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete bank";
      throw e;
    }
  }

  // Transactions
  async function fetchTransactions(params?: Parameters<typeof api.getTransactions>[0]) {
    loading.value = true;
    error.value = null;
    try {
      // First fetch to get total count
      const first = await api.getTransactions({ ...params, limit: 50, offset: 0 });
      let allItems = [...first.items];
      transactionsTotal.value = first.total;

      // Load remaining if there are more
      if (first.total > 50) {
        const remaining = Math.ceil((first.total - 50) / 200);
        for (let i = 0; i < remaining; i++) {
          const batch = await api.getTransactions({ ...params, limit: 200, offset: 50 + i * 200 });
          allItems = allItems.concat(batch.items);
        }
      }
      transactions.value = allItems;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch transactions";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createTransaction(data: Parameters<typeof api.createTransaction>[0]) {
    error.value = null;
    try {
      const { id } = await api.createTransaction(data);
      transactions.value.unshift({
        id,
        ...data,
        createdAt: new Date().toISOString(),
      });
      transactionsTotal.value++;
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create transaction";
      throw e;
    }
  }

  async function updateTransaction(id: string, data: Parameters<typeof api.updateTransaction>[1]) {
    error.value = null;
    try {
      await api.updateTransaction(id, data);
      const idx = transactions.value.findIndex((t) => t.id === id);
      if (idx !== -1) transactions.value[idx] = { ...transactions.value[idx], ...data };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update transaction";
      throw e;
    }
  }

  async function deleteTransaction(id: string) {
    error.value = null;
    try {
      await api.deleteTransaction(id);
      transactions.value = transactions.value.filter((t) => t.id !== id);
      transactionsTotal.value--;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete transaction";
      throw e;
    }
  }

  async function importTransactions(data: Parameters<typeof api.importTransactions>[0]) {
    loading.value = true;
    error.value = null;
    try {
      const result = await api.importTransactions(data);
      // Reload transactions after import
      await fetchTransactions({ month: currentMonth.value });
      return result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to import transactions";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // Accounts
  async function fetchAccounts() {
    loading.value = true;
    error.value = null;
    try {
      accounts.value = await api.getAccounts();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch accounts";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createAccount(data: Parameters<typeof api.createAccount>[0]) {
    error.value = null;
    try {
      const { id } = await api.createAccount(data);
      accounts.value.push({
        id,
        ...data,
        currency: data.currency ?? "RUB",
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create account";
      throw e;
    }
  }

  async function updateAccount(id: string, data: Parameters<typeof api.updateAccount>[1]) {
    error.value = null;
    try {
      await api.updateAccount(id, data);
      const idx = accounts.value.findIndex((a) => a.id === id);
      if (idx !== -1) accounts.value[idx] = { ...accounts.value[idx], ...data };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update account";
      throw e;
    }
  }

  async function deleteAccount(id: string) {
    error.value = null;
    try {
      await api.deleteAccount(id);
      accounts.value = accounts.value.filter((a) => a.id !== id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete account";
      throw e;
    }
  }

  // Goals
  async function fetchGoals() {
    loading.value = true;
    error.value = null;
    try {
      goals.value = await api.getSavingsGoals();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch goals";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createGoal(data: Parameters<typeof api.createSavingsGoal>[0]) {
    error.value = null;
    try {
      const { id } = await api.createSavingsGoal(data);
      goals.value.push({
        id,
        ...data,
        currentAmount: data.currentAmount ?? 0,
        icon: data.icon ?? "🎯",
        color: data.color ?? "#1767fd",
        status: "active",
        createdAt: new Date().toISOString(),
      });
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create goal";
      throw e;
    }
  }

  async function updateGoal(id: string, data: Parameters<typeof api.updateSavingsGoal>[1]) {
    error.value = null;
    try {
      await api.updateSavingsGoal(id, data);
      const idx = goals.value.findIndex((g) => g.id === id);
      if (idx !== -1) goals.value[idx] = { ...goals.value[idx], ...data };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update goal";
      throw e;
    }
  }

  async function deleteGoal(id: string) {
    error.value = null;
    try {
      await api.deleteSavingsGoal(id);
      goals.value = goals.value.filter((g) => g.id !== id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete goal";
      throw e;
    }
  }

  // Planned Expenses
  async function fetchPlannedExpenses(params?: Parameters<typeof api.getPlannedExpenses>[0]) {
    loading.value = true;
    error.value = null;
    try {
      plannedExpenses.value = await api.getPlannedExpenses(params);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch planned expenses";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createPlannedExpense(data: Parameters<typeof api.createPlannedExpense>[0]) {
    error.value = null;
    try {
      const { id } = await api.createPlannedExpense(data);
      plannedExpenses.value.push({
        id,
        ...data,
        isCompleted: false,
        createdAt: new Date().toISOString(),
      });
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create planned expense";
      throw e;
    }
  }

  async function updatePlannedExpense(id: string, data: Parameters<typeof api.updatePlannedExpense>[1]) {
    error.value = null;
    try {
      await api.updatePlannedExpense(id, data);
      const idx = plannedExpenses.value.findIndex((p) => p.id === id);
      if (idx !== -1) plannedExpenses.value[idx] = { ...plannedExpenses.value[idx], ...data };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update planned expense";
      throw e;
    }
  }

  async function deletePlannedExpense(id: string) {
    error.value = null;
    try {
      await api.deletePlannedExpense(id);
      plannedExpenses.value = plannedExpenses.value.filter((p) => p.id !== id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete planned expense";
      throw e;
    }
  }

  // Installments
  async function fetchInstallments(params?: Parameters<typeof api.getInstallments>[0]) {
    loading.value = true;
    error.value = null;
    try {
      installments.value = await api.getInstallments(params);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch installments";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createInstallment(data: Parameters<typeof api.createInstallment>[0]) {
    error.value = null;
    try {
      const { id } = await api.createInstallment(data);
      installments.value.push({
        id,
        ...data,
        monthlyPayment: data.monthlyPayment ?? Math.ceil(data.totalAmount / data.totalInstallments),
        paidInstallments: 0,
        remainingAmount: data.totalAmount,
        gracePeriodDays: data.gracePeriodDays ?? 0,
        status: "active",
      });
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create installment";
      throw e;
    }
  }

  async function updateInstallment(id: string, data: Parameters<typeof api.updateInstallment>[0 | 1] extends string ? Parameters<typeof api.updateInstallment>[1] : never) {
    error.value = null;
    try {
      await api.updateInstallment(id, data);
      const idx = installments.value.findIndex((i) => i.id === id);
      if (idx !== -1) installments.value[idx] = { ...installments.value[idx], ...data };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update installment";
      throw e;
    }
  }

  async function deleteInstallment(id: string) {
    error.value = null;
    try {
      await api.deleteInstallment(id);
      installments.value = installments.value.filter((i) => i.id !== id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete installment";
      throw e;
    }
  }

  async function payInstallment(id: string, data: Parameters<typeof api.payInstallment>[1]) {
    error.value = null;
    try {
      await api.payInstallment(id, data);
      // Refresh installments and accounts after payment
      await Promise.all([fetchInstallments(), fetchAccounts()]);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to pay installment";
      throw e;
    }
  }

  async function fetchInstallmentSchedule(id: string): Promise<InstallmentSchedulePayment[]> {
    error.value = null;
    try {
      const result = await api.getInstallmentSchedule(id);
      return result.payments;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch schedule";
      throw e;
    }
  }

  // Plans
  async function fetchPlans() {
    try {
      plans.value = await api.getPlans();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch plans";
    }
  }

  async function fetchPlan(id: string) {
    try {
      currentPlan.value = await api.getPlan(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch plan";
      throw e;
    }
  }

  async function fetchPlanByMonth(month: string) {
    try {
      currentPlan.value = await api.getPlanByMonth(month);
    } catch {
      currentPlan.value = null;
    }
  }

  async function createPlan(data: Parameters<typeof api.createPlan>[0]) {
    try {
      const { id } = await api.createPlan(data);
      await fetchPlans();
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create plan";
      throw e;
    }
  }

  async function deletePlan(id: string) {
    try {
      await api.deletePlan(id);
      plans.value = plans.value.filter((p) => p.id !== id);
      if (currentPlan.value?.plan.id === id) currentPlan.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete plan";
      throw e;
    }
  }

  async function clonePlanFromTemplate(planId: string, month: string) {
    try {
      const { id } = await api.clonePlanFromTemplate(planId, month);
      await fetchPlans();
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to clone plan";
      throw e;
    }
  }

  async function addPlanItem(planId: string, data: Parameters<typeof api.addPlanItem>[1]) {
    try {
      const { id } = await api.addPlanItem(planId, data);
      // Refresh current plan to get updated summary
      if (currentPlan.value?.plan.id === planId) {
        await fetchPlan(planId);
      }
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to add plan item";
      throw e;
    }
  }

  async function updatePlanItem(id: string, data: Parameters<typeof api.updatePlanItem>[1]) {
    try {
      await api.updatePlanItem(id, data);
      if (currentPlan.value) {
        await fetchPlan(currentPlan.value.plan.id);
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update plan item";
      throw e;
    }
  }

  async function deletePlanItem(id: string) {
    try {
      await api.deletePlanItem(id);
      if (currentPlan.value) {
        await fetchPlan(currentPlan.value.plan.id);
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete plan item";
      throw e;
    }
  }

  // Dashboard
  async function fetchDashboard(month?: string) {
    loading.value = true;
    error.value = null;
    try {
      dashboard.value = await api.getDashboard(month);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch dashboard";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMonthlyStats(month: string) {
    error.value = null;
    try {
      const stats = await api.getMonthlyStats(month);
      monthlyStats.value.set(month, stats);
      return stats;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch stats";
      throw e;
    }
  }

  function setCurrentMonth(month: string) {
    currentMonth.value = month;
  }

  function clearError() {
    error.value = null;
  }

  return {
    // State
    categories,
    transactions,
    transactionsTotal,
    accounts,
    goals,
    plannedExpenses,
    dashboard,
    monthlyStats,
    loading,
    error,
    currentMonth,
    installments,
    banks,
    plans,
    currentPlan,
    navigateTo,

    // Getters
    expenseCategories,
    incomeCategories,
    totalBalance,
    activeGoals,
    getCategoryById,
    activeInstallments,
    totalDebt,
    netWorth,
    creditAccounts,
    monthlyTransfers,

    // Actions
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    exportCategories,

    fetchTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    importTransactions,

    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    exportAccounts,
    fetchBanks,
    createBank,
    updateBank,
    deleteBank,

    fetchGoals,
    createGoal,
    updateGoal,
    deleteGoal,

    fetchPlannedExpenses,
    createPlannedExpense,
    updatePlannedExpense,
    deletePlannedExpense,

    fetchInstallments,
    createInstallment,
    updateInstallment,
    deleteInstallment,
    payInstallment,
    fetchInstallmentSchedule,

    fetchPlans,
    fetchPlan,
    fetchPlanByMonth,
    createPlan,
    deletePlan,
    clonePlanFromTemplate,
    addPlanItem,
    updatePlanItem,
    deletePlanItem,

    fetchDashboard,
    fetchMonthlyStats,
    setCurrentMonth,
    clearError,
  };
});
