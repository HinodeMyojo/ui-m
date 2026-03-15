import type {
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  Transaction,
  CreateTransactionRequest,
  UpdateTransactionRequest,
  TransactionImportPayload,
  Account,
  CreateAccountRequest,
  UpdateAccountRequest,
  SavingsGoal,
  CreateSavingsGoalRequest,
  UpdateSavingsGoalRequest,
  PlannedExpense,
  CreatePlannedExpenseRequest,
  UpdatePlannedExpenseRequest,
  MonthlyStats,
  BudgetDashboard,
  Installment,
  CreateInstallmentRequest,
  UpdateInstallmentRequest,
  InstallmentPayRequest,
  InstallmentSchedulePayment,
  BudgetPlan,
  BudgetPlanSummary,
  CreateBudgetPlanRequest,
  CreateBudgetPlanItemRequest,
  UpdateBudgetPlanItemRequest,
} from "../types/budget";

const API_BASE_URL = `${window.location.protocol}//82.202.136.167:5005`;
const PREFIX = "/api/v1/budget";

async function budgetRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_BASE_URL}${PREFIX}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message ?? `HTTP ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// === CATEGORIES ===

export async function getCategories(): Promise<Category[]> {
  return budgetRequest<Category[]>("/categories");
}

export async function createCategory(data: CreateCategoryRequest): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>("/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCategory(id: string, data: UpdateCategoryRequest): Promise<void> {
  return budgetRequest<void>(`/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  return budgetRequest<void>(`/categories/${id}`, {
    method: "DELETE",
  });
}

export async function exportCategories(): Promise<Category[]> {
  return budgetRequest<Category[]>("/categories/export");
}

// === TRANSACTIONS ===

export async function getTransactions(params?: {
  month?: string;
  type?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: Transaction[]; total: number }> {
  const qp = new URLSearchParams();
  if (params?.month) qp.append("month", params.month);
  if (params?.type) qp.append("type", params.type);
  if (params?.categoryId) qp.append("categoryId", params.categoryId);
  if (params?.from) qp.append("from", params.from);
  if (params?.to) qp.append("to", params.to);
  if (params?.limit) qp.append("limit", String(params.limit));
  if (params?.offset) qp.append("offset", String(params.offset));
  return budgetRequest<{ items: Transaction[]; total: number }>(`/transactions?${qp}`);
}

export async function createTransaction(data: CreateTransactionRequest): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>("/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTransaction(id: string, data: UpdateTransactionRequest): Promise<void> {
  return budgetRequest<void>(`/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  return budgetRequest<void>(`/transactions/${id}`, {
    method: "DELETE",
  });
}

export async function importTransactions(data: TransactionImportPayload): Promise<{ imported: number }> {
  return budgetRequest<{ imported: number }>("/transactions/import", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// === ACCOUNTS ===

export async function getAccounts(): Promise<Account[]> {
  return budgetRequest<Account[]>("/accounts");
}

export async function createAccount(data: CreateAccountRequest): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>("/accounts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateAccount(id: string, data: UpdateAccountRequest): Promise<void> {
  return budgetRequest<void>(`/accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteAccount(id: string): Promise<void> {
  return budgetRequest<void>(`/accounts/${id}`, {
    method: "DELETE",
  });
}

export async function exportAccounts(): Promise<{ name: string; type: string; bank: string }[]> {
  return budgetRequest<{ name: string; type: string; bank: string }[]>("/accounts/export");
}

// === BANKS ===

export async function getBanks(): Promise<{ id: string; name: string }[]> {
  return budgetRequest<{ id: string; name: string }[]>("/banks");
}

export async function createBank(data: { name: string }): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>("/banks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateBank(id: string, data: { name: string }): Promise<void> {
  return budgetRequest<void>(`/banks/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteBank(id: string): Promise<void> {
  return budgetRequest<void>(`/banks/${id}`, {
    method: "DELETE",
  });
}

// === SAVINGS GOALS ===

export async function getSavingsGoals(): Promise<SavingsGoal[]> {
  return budgetRequest<SavingsGoal[]>("/goals");
}

export async function createSavingsGoal(data: CreateSavingsGoalRequest): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>("/goals", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSavingsGoal(id: string, data: UpdateSavingsGoalRequest): Promise<void> {
  return budgetRequest<void>(`/goals/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  return budgetRequest<void>(`/goals/${id}`, {
    method: "DELETE",
  });
}

// === PLANNED EXPENSES ===

export async function getPlannedExpenses(params?: {
  from?: string;
  to?: string;
}): Promise<PlannedExpense[]> {
  const qp = new URLSearchParams();
  if (params?.from) qp.append("from", params.from);
  if (params?.to) qp.append("to", params.to);
  return budgetRequest<PlannedExpense[]>(`/planned-expenses?${qp}`);
}

export async function createPlannedExpense(data: CreatePlannedExpenseRequest): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>("/planned-expenses", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updatePlannedExpense(id: string, data: UpdatePlannedExpenseRequest): Promise<void> {
  return budgetRequest<void>(`/planned-expenses/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deletePlannedExpense(id: string): Promise<void> {
  return budgetRequest<void>(`/planned-expenses/${id}`, {
    method: "DELETE",
  });
}

// === INSTALLMENTS ===

export async function getInstallments(params?: {
  status?: string;
  accountId?: string;
}): Promise<Installment[]> {
  const qp = new URLSearchParams();
  if (params?.status) qp.append("status", params.status);
  if (params?.accountId) qp.append("accountId", params.accountId);
  return budgetRequest<Installment[]>(`/installments?${qp}`);
}

export async function createInstallment(data: CreateInstallmentRequest): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>("/installments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateInstallment(id: string, data: UpdateInstallmentRequest): Promise<void> {
  return budgetRequest<void>(`/installments/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteInstallment(id: string): Promise<void> {
  return budgetRequest<void>(`/installments/${id}`, {
    method: "DELETE",
  });
}

export async function payInstallment(id: string, data: InstallmentPayRequest): Promise<void> {
  return budgetRequest<void>(`/installments/${id}/pay`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getInstallmentSchedule(id: string): Promise<{ payments: InstallmentSchedulePayment[] }> {
  return budgetRequest<{ payments: InstallmentSchedulePayment[] }>(`/installments/${id}/schedule`);
}

// === DASHBOARD / STATS ===

export async function getDashboard(month?: string): Promise<BudgetDashboard> {
  const qp = month ? `?month=${month}` : "";
  return budgetRequest<BudgetDashboard>(`/dashboard${qp}`);
}

export async function getMonthlyStats(month: string): Promise<MonthlyStats> {
  return budgetRequest<MonthlyStats>(`/stats/monthly?month=${month}`);
}

export async function getStatsRange(from: string, to: string): Promise<MonthlyStats[]> {
  return budgetRequest<MonthlyStats[]>(`/stats/range?from=${from}&to=${to}`);
}

// === BUDGET PLANS ===

export async function getPlans(): Promise<BudgetPlan[]> {
  return budgetRequest<BudgetPlan[]>("/plans");
}

export async function createPlan(data: CreateBudgetPlanRequest): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>("/plans", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getPlan(id: string): Promise<BudgetPlanSummary> {
  return budgetRequest<BudgetPlanSummary>(`/plans/${id}`);
}

export async function getPlanByMonth(month: string): Promise<BudgetPlanSummary> {
  return budgetRequest<BudgetPlanSummary>(`/plans/month/${month}`);
}

export async function updatePlan(id: string, data: { name?: string }): Promise<void> {
  return budgetRequest<void>(`/plans/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deletePlan(id: string): Promise<void> {
  return budgetRequest<void>(`/plans/${id}`, {
    method: "DELETE",
  });
}

export async function clonePlanFromTemplate(planId: string, month: string): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>(`/plans/${planId}/clone`, {
    method: "POST",
    body: JSON.stringify({ month }),
  });
}

export async function addPlanItem(planId: string, data: CreateBudgetPlanItemRequest): Promise<{ id: string }> {
  return budgetRequest<{ id: string }>(`/plans/${planId}/items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updatePlanItem(id: string, data: UpdateBudgetPlanItemRequest): Promise<void> {
  return budgetRequest<void>(`/plans/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deletePlanItem(id: string): Promise<void> {
  return budgetRequest<void>(`/plans/items/${id}`, {
    method: "DELETE",
  });
}
