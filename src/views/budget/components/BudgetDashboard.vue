<script setup lang="ts">
import { computed, ref } from "vue";
import { useBudgetStore } from "@/stores/budget";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler } from "chart.js";
import { Doughnut, Bar, Line } from "vue-chartjs";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

const store = useBudgetStore();
const chartType = ref<"doughnut" | "bar">("doughnut");

const dash = computed(() => store.dashboard);

// Doughnut chart — expenses by category
const doughnutData = computed(() => {
  const stats = dash.value?.currentMonth?.byCategory?.filter((c) => c.amount > 0) ?? [];
  return {
    labels: stats.map((c) => c.categoryName),
    datasets: [
      {
        data: stats.map((c) => c.amount),
        backgroundColor: stats.map((c) => c.categoryColor),
        borderWidth: 0,
        hoverOffset: 8,
      },
    ],
  };
});

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "65%",
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(14, 15, 26, 0.95)",
      borderColor: "rgba(23, 103, 253, 0.3)",
      borderWidth: 1,
      titleColor: "#fff",
      bodyColor: "#c8daf0",
      padding: 12,
      cornerRadius: 8,
      callbacks: {
        label: (ctx: any) => `${ctx.label}: ${Number(ctx.raw).toLocaleString("ru")} ₽`,
      },
    },
  },
};

// Bar chart — expenses by category
const barData = computed(() => {
  const stats = dash.value?.currentMonth?.byCategory?.filter((c) => c.amount > 0) ?? [];
  return {
    labels: stats.map((c) => c.categoryName),
    datasets: [
      {
        label: "Расход",
        data: stats.map((c) => c.amount),
        backgroundColor: stats.map((c) => c.categoryColor + "cc"),
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: "Лимит",
        data: stats.map((c) => c.limit ?? 0),
        backgroundColor: "rgba(255, 255, 255, 0.08)",
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };
});

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(14, 15, 26, 0.95)",
      borderColor: "rgba(23, 103, 253, 0.3)",
      borderWidth: 1,
      titleColor: "#fff",
      bodyColor: "#c8daf0",
      padding: 12,
      cornerRadius: 8,
      callbacks: {
        label: (ctx: any) => `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString("ru")} ₽`,
      },
    },
  },
  scales: {
    x: { ticks: { color: "#6b7fa3", font: { size: 11 } }, grid: { display: false } },
    y: { ticks: { color: "#6b7fa3", callback: (v: number) => v >= 1000 ? `${v / 1000}k` : v }, grid: { color: "rgba(23, 103, 253, 0.06)" } },
  },
};

// Trend line chart
const trendData = computed(() => {
  const trend = dash.value?.monthlyTrend ?? [];
  return {
    labels: trend.map((m) =>
      new Date(m.month + "-15").toLocaleString("ru", { month: "short" })
    ),
    datasets: [
      {
        label: "Доходы",
        data: trend.map((m) => m.totalIncome),
        borderColor: "#34d399",
        backgroundColor: "rgba(52, 211, 153, 0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: "Расходы",
        data: trend.map((m) => m.totalExpense),
        borderColor: "#f87171",
        backgroundColor: "rgba(248, 113, 113, 0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };
});

const trendOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: "top" as const,
      labels: { color: "#c8daf0", boxWidth: 12, padding: 16, font: { size: 12 } },
    },
    tooltip: {
      backgroundColor: "rgba(14, 15, 26, 0.95)",
      borderColor: "rgba(23, 103, 253, 0.3)",
      borderWidth: 1,
      titleColor: "#fff",
      bodyColor: "#c8daf0",
      padding: 12,
      cornerRadius: 8,
      callbacks: {
        label: (ctx: any) => `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString("ru")} ₽`,
      },
    },
  },
  scales: {
    x: { ticks: { color: "#6b7fa3" }, grid: { display: false } },
    y: { ticks: { color: "#6b7fa3", callback: (v: number) => v >= 1000 ? `${v / 1000}k` : v }, grid: { color: "rgba(23, 103, 253, 0.06)" } },
  },
};

function fmt(n: number | undefined) {
  return (n ?? 0).toLocaleString("ru");
}

// Combine upcoming expenses and installment payments, sorted by date
const upcomingPayments = computed(() => {
  const expenses = (dash.value?.upcomingExpenses ?? []).map((pe) => ({
    type: "planned" as const,
    name: pe.name,
    amount: pe.amount,
    date: pe.date,
    icon: "📋",
  }));
  const installments = (dash.value?.upcomingInstallmentPayments ?? []).map((ip) => ({
    type: "installment" as const,
    name: ip.installmentName,
    amount: ip.amount,
    date: ip.date,
    icon: "💳",
  }));
  return [...expenses, ...installments].sort((a, b) => a.date.localeCompare(b.date));
});
</script>

<template>
  <div class="dashboard">
    <!-- Top stat cards -->
    <div class="stat-cards">
      <div class="stat-card stat-balance">
        <div class="stat-icon">💰</div>
        <div class="stat-info">
          <span class="stat-label">Активы</span>
          <span class="stat-value">{{ fmt(dash?.totalBalance) }} ₽</span>
        </div>
      </div>
      <div class="stat-card stat-debt" v-if="(dash?.totalDebt ?? 0) > 0">
        <div class="stat-icon">🔴</div>
        <div class="stat-info">
          <span class="stat-label">Долги</span>
          <span class="stat-value red">-{{ fmt(dash?.totalDebt) }} ₽</span>
        </div>
      </div>
      <div class="stat-card stat-networth">
        <div class="stat-icon">💎</div>
        <div class="stat-info">
          <span class="stat-label">Чистыми</span>
          <span class="stat-value" :class="(dash?.netWorth ?? 0) >= 0 ? '' : 'red'">{{ fmt(dash?.netWorth) }} ₽</span>
        </div>
      </div>
      <div class="stat-card stat-income">
        <div class="stat-icon">📈</div>
        <div class="stat-info">
          <span class="stat-label">Доходы за месяц</span>
          <span class="stat-value green">+{{ fmt(dash?.currentMonth?.totalIncome) }} ₽</span>
        </div>
      </div>
      <div class="stat-card stat-expense">
        <div class="stat-icon">📉</div>
        <div class="stat-info">
          <span class="stat-label">Расходы за месяц</span>
          <span class="stat-value red">-{{ fmt(dash?.currentMonth?.totalExpense) }} ₽</span>
        </div>
      </div>
      <div class="stat-card stat-passive">
        <div class="stat-icon">🏦</div>
        <div class="stat-info">
          <span class="stat-label">Пассивный доход/мес</span>
          <span class="stat-value blue">+{{ fmt(dash?.monthlyPassiveIncome) }} ₽</span>
        </div>
      </div>
    </div>

    <!-- Charts row -->
    <div class="charts-row">
      <!-- Category breakdown -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Расходы по категориям</h3>
          <div class="chart-toggle">
            <button :class="{ active: chartType === 'doughnut' }" @click="chartType = 'doughnut'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v10l7 4"/></svg>
            </button>
            <button :class="{ active: chartType === 'bar' }" @click="chartType = 'bar'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
            </button>
          </div>
        </div>
        <div class="chart-body">
          <Doughnut v-if="chartType === 'doughnut'" :data="doughnutData" :options="doughnutOptions" />
          <Bar v-else :data="barData" :options="barOptions" />
        </div>
        <!-- Legend -->
        <div class="category-legend" v-if="chartType === 'doughnut'">
          <div
            v-for="cat in dash?.currentMonth?.byCategory?.filter(c => c.amount > 0)"
            :key="cat.categoryId"
            class="legend-item"
          >
            <span class="legend-dot" :style="{ background: cat.categoryColor }"></span>
            <span class="legend-name">{{ cat.categoryIcon }} {{ cat.categoryName }}</span>
            <span class="legend-val">{{ fmt(cat.amount) }} ₽</span>
            <span class="legend-pct">{{ cat.percentage }}%</span>
            <span v-if="cat.isOverLimit" class="legend-over">!</span>
          </div>
        </div>
      </div>

      <!-- Trend -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Динамика по месяцам</h3>
        </div>
        <div class="chart-body chart-body-line">
          <Line :data="trendData" :options="trendOptions" />
        </div>
      </div>
    </div>

    <!-- Debt & Installments row -->
    <div class="debt-row" v-if="(dash?.creditAccounts?.length ?? 0) > 0 || (dash?.activeInstallments?.length ?? 0) > 0">
      <!-- Credit accounts -->
      <div class="panel-card" v-if="dash?.creditAccounts?.length">
        <h3 class="panel-title">🔴 Кредитные счета</h3>
        <div v-for="ca in dash.creditAccounts" :key="ca.id" class="credit-row">
          <div class="credit-top">
            <span class="credit-name">{{ ca.name }}</span>
            <span class="credit-debt red">{{ fmt(Math.abs(ca.balance)) }} ₽</span>
          </div>
          <div class="progress-track">
            <div
              class="progress-fill"
              :style="{ width: ca.utilizationPercent + '%' }"
              :class="{ 'progress-fill-high': ca.utilizationPercent > 70 }"
            ></div>
          </div>
          <div class="credit-bottom">
            <span class="credit-util">{{ ca.utilizationPercent }}% использовано</span>
            <span class="credit-limit">Лимит: {{ fmt(ca.creditLimit) }} ₽</span>
          </div>
        </div>
      </div>

      <!-- Active installments -->
      <div class="panel-card" v-if="dash?.activeInstallments?.length">
        <h3 class="panel-title">📦 Активные рассрочки</h3>
        <div class="inst-total" v-if="dash?.installmentsTotalRemaining">
          Осталось выплатить: <strong>{{ fmt(dash.installmentsTotalRemaining) }} ₽</strong>
        </div>
        <div v-for="inst in dash.activeInstallments" :key="inst.id" class="inst-row">
          <div class="inst-top">
            <span class="inst-name">{{ inst.name }}</span>
            <span class="inst-remaining">{{ fmt(inst.remainingAmount) }} ₽</span>
          </div>
          <div class="progress-track">
            <div
              class="progress-fill progress-fill-purple"
              :style="{ width: inst.progressPercent + '%' }"
            ></div>
          </div>
          <div class="inst-bottom">
            <span class="inst-pct">{{ inst.progressPercent }}%</span>
            <span class="inst-next" v-if="inst.nextPaymentDate">
              Следующий: {{ new Date(inst.nextPaymentDate).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom row: goals + upcoming + compare -->
    <div class="bottom-row">
      <!-- Savings goals progress -->
      <div class="panel-card">
        <h3 class="panel-title">🎯 Цели накоплений</h3>
        <div v-if="!dash?.savingsGoals?.length" class="empty-hint">Нет активных целей</div>
        <div v-for="goal in dash?.savingsGoals" :key="goal.id" class="goal-row">
          <div class="goal-top">
            <span class="goal-icon">{{ goal.icon }}</span>
            <span class="goal-name">{{ goal.name }}</span>
            <span class="goal-amounts">{{ fmt(goal.currentAmount) }} / {{ fmt(goal.targetAmount) }} ₽</span>
          </div>
          <div class="progress-track">
            <div
              class="progress-fill"
              :style="{
                width: Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) + '%',
                background: goal.color,
              }"
            ></div>
          </div>
          <div class="goal-bottom">
            <span class="goal-pct">{{ Math.round((goal.currentAmount / goal.targetAmount) * 100) }}%</span>
            <span class="goal-deadline">до {{ new Date(goal.deadline).toLocaleDateString('ru') }}</span>
          </div>
        </div>
      </div>

      <!-- Upcoming payments (planned + installments combined) -->
      <div class="panel-card">
        <h3 class="panel-title">📅 Ближайшие платежи</h3>
        <div class="recommend-block" v-if="dash?.recommendedMonthlySaving">
          <span class="recommend-label">Рекомендуемые накопления/мес:</span>
          <span class="recommend-val">{{ fmt(dash.recommendedMonthlySaving) }} ₽</span>
        </div>
        <div v-if="!upcomingPayments.length" class="empty-hint">Нет запланированных платежей</div>
        <div v-for="(pay, idx) in upcomingPayments" :key="idx" class="planned-row">
          <span class="planned-icon">{{ pay.icon }}</span>
          <span class="planned-date">{{ new Date(pay.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) }}</span>
          <span class="planned-name">{{ pay.name }}</span>
          <span class="planned-amount">-{{ fmt(pay.amount) }} ₽</span>
        </div>
      </div>

      <!-- Month vs month comparison -->
      <div class="panel-card">
        <h3 class="panel-title">📊 Сравнение с пред. месяцем</h3>
        <div class="compare-grid">
          <div class="compare-item">
            <span class="compare-label">Доходы</span>
            <span class="compare-prev">{{ fmt(dash?.previousMonth?.totalIncome) }} ₽</span>
            <span class="compare-arrow">→</span>
            <span class="compare-curr">{{ fmt(dash?.currentMonth?.totalIncome) }} ₽</span>
            <span
              class="compare-diff"
              :class="(dash?.currentMonth?.totalIncome ?? 0) >= (dash?.previousMonth?.totalIncome ?? 0) ? 'green' : 'red'"
            >
              {{ (dash?.currentMonth?.totalIncome ?? 0) >= (dash?.previousMonth?.totalIncome ?? 0) ? '↑' : '↓' }}
              {{ fmt(Math.abs((dash?.currentMonth?.totalIncome ?? 0) - (dash?.previousMonth?.totalIncome ?? 0))) }} ₽
            </span>
          </div>
          <div class="compare-item">
            <span class="compare-label">Расходы</span>
            <span class="compare-prev">{{ fmt(dash?.previousMonth?.totalExpense) }} ₽</span>
            <span class="compare-arrow">→</span>
            <span class="compare-curr">{{ fmt(dash?.currentMonth?.totalExpense) }} ₽</span>
            <span
              class="compare-diff"
              :class="(dash?.currentMonth?.totalExpense ?? 0) <= (dash?.previousMonth?.totalExpense ?? 0) ? 'green' : 'red'"
            >
              {{ (dash?.currentMonth?.totalExpense ?? 0) <= (dash?.previousMonth?.totalExpense ?? 0) ? '↓' : '↑' }}
              {{ fmt(Math.abs((dash?.currentMonth?.totalExpense ?? 0) - (dash?.previousMonth?.totalExpense ?? 0))) }} ₽
            </span>
          </div>
          <div class="compare-item">
            <span class="compare-label">Баланс</span>
            <span class="compare-prev">{{ fmt(dash?.previousMonth?.balance) }} ₽</span>
            <span class="compare-arrow">→</span>
            <span class="compare-curr">{{ fmt(dash?.currentMonth?.balance) }} ₽</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 20px; }

/* Stat cards */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
}

.stat-card {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 14px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: all 0.25s;
}
.stat-card:hover {
  border-color: rgba(23, 103, 253, 0.35);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.stat-icon {
  font-size: 28px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(23, 103, 253, 0.1);
  border-radius: 12px;
}

.stat-info { display: flex; flex-direction: column; gap: 4px; }
.stat-label { font-size: 12px; color: #6b7fa3; font-weight: 500; }
.stat-value { font-size: 20px; font-weight: 700; color: #fff; }
.stat-value.green { color: #34d399; }
.stat-value.red { color: #f87171; }
.stat-value.blue { color: #60a5fa; }

/* Charts row */
.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-card {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 14px;
  padding: 20px;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.chart-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: #c8daf0;
  margin: 0;
}

.chart-toggle {
  display: flex;
  gap: 4px;
  background: rgba(23, 103, 253, 0.08);
  border-radius: 8px;
  padding: 3px;
}
.chart-toggle button {
  background: none;
  border: none;
  color: #6b7fa3;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
}
.chart-toggle button.active {
  background: rgba(23, 103, 253, 0.25);
  color: #fff;
}

.chart-body { height: 260px; position: relative; }
.chart-body-line { height: 280px; }

/* Legend */
.category-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(23, 103, 253, 0.3) transparent;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
.legend-name { color: #c8daf0; flex: 1; }
.legend-val { color: #fff; font-weight: 600; }
.legend-pct { color: #6b7fa3; font-size: 12px; min-width: 36px; text-align: right; }
.legend-over {
  color: #f87171;
  font-weight: 700;
  font-size: 14px;
  animation: pulse-red 1.5s infinite;
}
@keyframes pulse-red {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Debt row */
.debt-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.credit-row {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(23, 103, 253, 0.08);
}
.credit-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.credit-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.credit-name { font-size: 14px; font-weight: 600; color: #e1e8f0; }
.credit-debt { font-size: 15px; font-weight: 700; }
.credit-bottom { display: flex; justify-content: space-between; margin-top: 6px; font-size: 12px; }
.credit-util { color: #6b7fa3; }
.credit-limit { color: #6b7fa3; }

.inst-total {
  font-size: 13px;
  color: #c8daf0;
  margin-bottom: 14px;
  padding: 10px 14px;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 10px;
}
.inst-total strong { color: #c084fc; }

.inst-row {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(23, 103, 253, 0.08);
}
.inst-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.inst-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.inst-name { font-size: 14px; font-weight: 600; color: #e1e8f0; }
.inst-remaining { font-size: 14px; font-weight: 600; color: #c084fc; }
.inst-bottom { display: flex; justify-content: space-between; margin-top: 6px; font-size: 12px; }
.inst-pct { color: #c084fc; font-weight: 600; }
.inst-next { color: #6b7fa3; }

/* Progress bars */
.progress-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 3px;
  background: #1767fd;
  transition: width 0.5s ease;
}
.progress-fill-high { background: #f87171; }
.progress-fill-purple { background: #8b5cf6; }

/* Bottom row */
.bottom-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.panel-card {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 14px;
  padding: 20px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #c8daf0;
  margin: 0 0 16px;
}

.empty-hint {
  color: #4a5c7a;
  font-size: 13px;
  text-align: center;
  padding: 20px;
}

/* Goals */
.goal-row {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(23, 103, 253, 0.08);
}
.goal-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }

.goal-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.goal-icon { font-size: 20px; }
.goal-name { font-size: 14px; font-weight: 600; color: #fff; flex: 1; }
.goal-amounts { font-size: 12px; color: #6b7fa3; }

.goal-bottom {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
}
.goal-pct { color: #7eb0ff; font-weight: 600; }
.goal-deadline { color: #6b7fa3; }

/* Recommend */
.recommend-block {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: rgba(23, 103, 253, 0.08);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 10px;
  margin-bottom: 14px;
}
.recommend-label { font-size: 13px; color: #7eb0ff; }
.recommend-val { font-size: 16px; font-weight: 700; color: #34d399; }

/* Planned rows */
.planned-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(23, 103, 253, 0.06);
}
.planned-row:last-child { border-bottom: none; }
.planned-icon { font-size: 16px; flex-shrink: 0; }
.planned-date { font-size: 12px; color: #6b7fa3; min-width: 60px; }
.planned-name { font-size: 13px; color: #c8daf0; flex: 1; }
.planned-amount { font-size: 14px; font-weight: 600; color: #f87171; }

/* Compare */
.compare-grid { display: flex; flex-direction: column; gap: 12px; }
.compare-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}
.compare-label { color: #6b7fa3; min-width: 70px; font-weight: 500; }
.compare-prev { color: #4a5c7a; }
.compare-arrow { color: #3a4a6a; }
.compare-curr { color: #c8daf0; font-weight: 600; }
.compare-diff { font-weight: 600; font-size: 12px; }
.compare-diff.green { color: #34d399; }
.compare-diff.red { color: #f87171; }
.red { color: #f87171; }

/* Mobile */
@media (max-width: 768px) {
  .stat-cards { grid-template-columns: 1fr 1fr; }
  .charts-row { grid-template-columns: 1fr; }
  .debt-row { grid-template-columns: 1fr; }
  .bottom-row { grid-template-columns: 1fr; }
  .stat-value { font-size: 16px; }
  .stat-icon { font-size: 22px; width: 40px; height: 40px; }
}

@media (max-width: 480px) {
  .stat-cards { grid-template-columns: 1fr; }
}
</style>
