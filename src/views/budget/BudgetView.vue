<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useBudgetStore } from "@/stores/budget";
import BudgetDashboard from "./components/BudgetDashboard.vue";
import BudgetTransactions from "./components/BudgetTransactions.vue";
import BudgetCategories from "./components/BudgetCategories.vue";
import BudgetAccounts from "./components/BudgetAccounts.vue";
import BudgetGoals from "./components/BudgetGoals.vue";
import BudgetPlanned from "./components/BudgetPlanned.vue";
import { useRouter } from "vue-router";

const router = useRouter();
const store = useBudgetStore();

const tabs = [
  { id: "dashboard", label: "Обзор", icon: "📊" },
  { id: "transactions", label: "Операции", icon: "💳" },
  { id: "categories", label: "Категории", icon: "🏷️" },
  { id: "accounts", label: "Счета", icon: "🏦" },
  { id: "goals", label: "Цели", icon: "🎯" },
  { id: "planned", label: "Планы", icon: "📅" },
] as const;

type TabId = (typeof tabs)[number]["id"];
const activeTab = ref<TabId>("dashboard");

function goHome() {
  router.push("/");
}

onMounted(async () => {
  try {
    await Promise.all([
      store.fetchCategories(),
      store.fetchAccounts(),
      store.fetchGoals(),
      store.fetchPlannedExpenses(),
      store.fetchDashboard(store.currentMonth),
      store.fetchTransactions({ month: store.currentMonth }),
    ]);
  } catch {
    // errors handled in store
  }
});

watch(
  () => store.currentMonth,
  async (month) => {
    try {
      await Promise.all([
        store.fetchDashboard(month),
        store.fetchTransactions({ month }),
      ]);
    } catch {
      // handled
    }
  }
);
</script>

<template>
  <div class="budget-page">
    <!-- Header -->
    <header class="budget-header">
      <button class="back-btn" @click="goHome" title="На главную">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="budget-title">Бюджет</h1>

      <!-- Month selector -->
      <div class="month-selector">
        <button
          class="month-arrow"
          @click="store.setCurrentMonth(
            new Date(store.currentMonth + '-01').getTime() - 86400000
              ? new Date(new Date(store.currentMonth + '-15').setMonth(new Date(store.currentMonth + '-15').getMonth() - 1)).toISOString().slice(0, 7)
              : store.currentMonth
          )"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span class="month-label">
          {{ new Date(store.currentMonth + '-15').toLocaleString('ru', { month: 'long', year: 'numeric' }) }}
        </span>
        <button
          class="month-arrow"
          @click="store.setCurrentMonth(
            new Date(new Date(store.currentMonth + '-15').setMonth(new Date(store.currentMonth + '-15').getMonth() + 1)).toISOString().slice(0, 7)
          )"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </header>

    <!-- Tab bar -->
    <nav class="budget-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </nav>

    <!-- Error banner -->
    <div v-if="store.error" class="error-banner">
      <span>{{ store.error }}</span>
      <button @click="store.clearError">✕</button>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="loading-bar">
      <div class="loading-bar-inner"></div>
    </div>

    <!-- Tab content -->
    <main class="budget-content">
      <BudgetDashboard v-if="activeTab === 'dashboard'" />
      <BudgetTransactions v-else-if="activeTab === 'transactions'" />
      <BudgetCategories v-else-if="activeTab === 'categories'" />
      <BudgetAccounts v-else-if="activeTab === 'accounts'" />
      <BudgetGoals v-else-if="activeTab === 'goals'" />
      <BudgetPlanned v-else-if="activeTab === 'planned'" />
    </main>
  </div>
</template>

<style scoped>
.budget-page {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  min-height: 100vh;
  background: #0e0f1a;
  color: #fff;
  font-family: 'Inter', sans-serif;
}

/* Header */
.budget-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 12px;
  flex-wrap: wrap;
}

.back-btn {
  background: rgba(23, 103, 253, 0.12);
  border: 1px solid rgba(23, 103, 253, 0.25);
  border-radius: 10px;
  color: #7eb0ff;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.back-btn:hover {
  background: rgba(23, 103, 253, 0.25);
  color: #fff;
}

.budget-title {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #fff, #7eb0ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
}

.month-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  background: rgba(23, 103, 253, 0.08);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 12px;
  padding: 6px 12px;
}

.month-arrow {
  background: none;
  border: none;
  color: #7eb0ff;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}
.month-arrow:hover {
  background: rgba(23, 103, 253, 0.2);
  color: #fff;
}

.month-label {
  font-size: 14px;
  font-weight: 600;
  color: #c8daf0;
  text-transform: capitalize;
  min-width: 130px;
  text-align: center;
}

/* Tabs */
.budget-tabs {
  display: flex;
  gap: 4px;
  padding: 0 24px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  border-bottom: 1px solid rgba(23, 103, 253, 0.1);
}
.budget-tabs::-webkit-scrollbar { display: none; }

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  background: none;
  border: none;
  color: #6b7fa3;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
}
.tab-btn:hover {
  color: #a5c4f0;
}
.tab-btn.active {
  color: #fff;
  border-bottom-color: #1767fd;
}

.tab-icon {
  font-size: 16px;
}

/* Error */
.error-banner {
  margin: 12px 24px;
  padding: 12px 16px;
  background: rgba(255, 59, 48, 0.12);
  border: 1px solid rgba(255, 59, 48, 0.3);
  border-radius: 10px;
  color: #ff6b6b;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
.error-banner button {
  background: none;
  border: none;
  color: #ff6b6b;
  cursor: pointer;
  font-size: 16px;
}

/* Loading */
.loading-bar {
  height: 2px;
  background: rgba(23, 103, 253, 0.1);
  margin: 0 24px;
  border-radius: 1px;
  overflow: hidden;
}
.loading-bar-inner {
  height: 100%;
  width: 30%;
  background: linear-gradient(90deg, #1767fd, #6e4aff);
  border-radius: 1px;
  animation: loading-slide 1.2s ease-in-out infinite;
}
@keyframes loading-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}

/* Content */
.budget-content {
  padding: 20px 24px 40px;
}

/* Mobile */
@media (max-width: 768px) {
  .budget-header {
    padding: 16px 16px 8px;
    gap: 10px;
  }
  .budget-title {
    font-size: 20px;
  }
  .month-selector {
    margin-left: 0;
    order: 3;
    width: 100%;
    justify-content: center;
  }
  .budget-tabs {
    padding: 0 12px;
  }
  .tab-btn {
    padding: 10px 12px;
    font-size: 12px;
  }
  .tab-label {
    display: none;
  }
  .tab-icon {
    font-size: 20px;
  }
  .budget-content {
    padding: 16px 12px 32px;
  }
}
</style>
