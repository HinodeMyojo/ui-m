// =============================================
// Budget Planner — TypeScript types
// =============================================

// --- Enums / Literals ---

export type TransactionType = "income" | "expense" | "transfer";
export type AccountType = "card" | "deposit" | "savings" | "cash" | "credit" | "credit_line" | "installment";
export type GoalStatus = "active" | "completed" | "cancelled";
export type PeriodType = "month" | "quarter" | "year" | "custom";
export type InstallmentStatus = "active" | "paid_off" | "overdue";

// --- Category ---

export interface Category {
  id: string;
  name: string;
  icon: string;           // emoji or mdi icon name
  color: string;          // hex color
  type: TransactionType;  // income or expense
  monthlyLimit?: number;  // optional budget limit per month
  sortOrder: number;
}

export interface CreateCategoryRequest {
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  monthlyLimit?: number;
  sortOrder?: number;
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {}

// --- Transaction ---

export interface Transaction {
  id: string;
  categoryId?: string;
  type: TransactionType;
  amount: number;
  description?: string;
  date: string;           // ISO date "2026-03-12"
  fromAccountId?: string; // for transfer
  toAccountId?: string;   // for transfer
  accountId?: string;     // for income/expense — linked account
  createdAt: string;
}

export interface CreateTransactionRequest {
  categoryId?: string;
  type: TransactionType;
  amount: number;
  description?: string;
  date: string;
  fromAccountId?: string;
  toAccountId?: string;
  accountId?: string;
}

export interface UpdateTransactionRequest extends Partial<CreateTransactionRequest> {}

// --- Batch import (JSON from AI) ---

export interface TransactionImportItem {
  categoryName: string;   // AI provides name, frontend resolves to categoryId
  type: TransactionType;
  amount: number;
  description?: string;
  date: string;
}

export interface TransactionImportPayload {
  transactions: CreateTransactionRequest[];
}

// --- Account / Deposit ---

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;       // "RUB"
  interestRate?: number;  // annual %, e.g. 13.5
  maturityDate?: string;  // ISO date when deposit ends
  isActive: boolean;
  creditLimit?: number;       // for credit/credit_line/installment
  gracePeriodDays?: number;   // for credit/credit_line
  dailyCommission?: number;   // for credit_line
  minPaymentPercent?: number; // for credit
  createdAt: string;
}

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  balance: number;
  currency?: string;
  interestRate?: number;
  maturityDate?: string;
  creditLimit?: number;
  gracePeriodDays?: number;
  dailyCommission?: number;
  minPaymentPercent?: number;
}

export interface UpdateAccountRequest extends Partial<CreateAccountRequest> {
  isActive?: boolean;
}

// --- Savings Goal ---

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;        // ISO date
  icon: string;
  color: string;
  status: GoalStatus;
  createdAt: string;
}

export interface CreateSavingsGoalRequest {
  name: string;
  targetAmount: number;
  currentAmount?: number;
  deadline: string;
  icon?: string;
  color?: string;
}

export interface UpdateSavingsGoalRequest extends Partial<CreateSavingsGoalRequest> {
  status?: GoalStatus;
}

// --- Planned Expense ---

export interface PlannedExpense {
  id: string;
  name: string;
  amount: number;
  categoryId?: string;
  date: string;            // planned date
  description?: string;
  isCompleted: boolean;
  createdAt: string;
}

export interface CreatePlannedExpenseRequest {
  name: string;
  amount: number;
  categoryId?: string;
  date: string;
  description?: string;
}

export interface UpdatePlannedExpenseRequest extends Partial<CreatePlannedExpenseRequest> {
  isCompleted?: boolean;
}

// --- Installment ---

export interface Installment {
  id: string;
  accountId: string;
  transactionId?: string;
  name: string;
  totalAmount: number;
  monthlyPayment: number;
  totalInstallments: number;
  paidInstallments: number;
  remainingAmount: number;
  nextPaymentDate?: string;
  startDate: string;
  gracePeriodDays: number;
  status: InstallmentStatus;
}

export interface CreateInstallmentRequest {
  accountId: string;
  name: string;
  totalAmount: number;
  totalInstallments: number;
  monthlyPayment?: number;
  startDate: string;
  gracePeriodDays?: number;
}

export interface UpdateInstallmentRequest extends Partial<CreateInstallmentRequest> {
  status?: InstallmentStatus;
}

export interface InstallmentPayRequest {
  amount: number;
  fromAccountId: string;
}

export interface InstallmentSchedulePayment {
  number: number;
  date: string;
  amount: number;
  status: "paid" | "upcoming" | "overdue";
}

// --- Budget Summary (computed by backend) ---

export interface MonthlyStats {
  month: string;           // "2026-03"
  totalIncome: number;
  totalExpense: number;
  balance: number;         // income - expense
  byCategory: CategoryStats[];
}

export interface CategoryStats {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  amount: number;
  limit?: number;
  percentage: number;      // % of total
  isOverLimit: boolean;
}

export interface DashboardCreditAccount {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  creditLimit: number;
  utilizationPercent: number;
}

export interface DashboardActiveInstallment {
  id: string;
  name: string;
  remainingAmount: number;
  nextPaymentDate: string;
  progressPercent: number;
}

export interface DashboardUpcomingInstallmentPayment {
  installmentId: string;
  installmentName: string;
  amount: number;
  date: string;
}

export interface BudgetDashboard {
  currentMonth: MonthlyStats;
  previousMonth: MonthlyStats;
  totalBalance: number;           // all accounts sum
  monthlyPassiveIncome: number;   // from deposits/savings interest
  savingsGoals: SavingsGoal[];
  upcomingExpenses: PlannedExpense[];  // next 30 days
  monthlyTrend: MonthlyStats[];       // last 6-12 months
  recommendedMonthlySaving: number;   // how much to save per month to reach goals
  totalDebt: number;
  netWorth: number;
  creditAccounts: DashboardCreditAccount[];
  activeInstallments: DashboardActiveInstallment[];
  upcomingInstallmentPayments: DashboardUpcomingInstallmentPayment[];
  installmentsTotalRemaining: number;
  transfersTotal: number;
}
