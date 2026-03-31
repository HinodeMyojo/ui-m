<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useBudgetStore } from "@/stores/budget";
import * as api from "@/api/budget";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler } from "chart.js";
import { Doughnut, Bar, Line } from "vue-chartjs";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

const store = useBudgetStore();
const chartType = ref<"doughnut" | "bar">("doughnut");
const categorySortOrder = ref<"desc" | "asc">("desc");
const trendPeriod = ref<"1m" | "3m" | "6m" | "1y">("6m");
const customTrendData = ref<{ month: string; totalIncome: number; totalExpense: number }[] | null>(null);

async function loadTrendData() {
  const now = new Date(store.currentMonth + "-15");
  let fromDate: Date;
  switch (trendPeriod.value) {
    case "1m":
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      customTrendData.value = null; // use dashboard data (current month only)
      return;
    case "3m":
      fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case "6m":
      fromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      customTrendData.value = null; // use dashboard's default 6-month data
      return;
    case "1y":
      fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      break;
    default:
      customTrendData.value = null;
      return;
  }
  const fromStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`;
  const toStr = store.currentMonth;
  try {
    const stats = await api.getStatsRange(fromStr, toStr);
    customTrendData.value = stats.map((s) => ({
      month: s.month,
      totalIncome: s.totalIncome,
      totalExpense: s.totalExpense,
    }));
  } catch {
    customTrendData.value = null;
  }
}

watch(trendPeriod, () => loadTrendData());

const dash = computed(() => store.dashboard);

// Sorted categories by amount
const sortedCategories = computed(() => {
  const stats = dash.value?.currentMonth?.byCategory?.filter((c) => c.amount > 0) ?? [];
  const sorted = [...stats].sort((a, b) =>
    categorySortOrder.value === "desc" ? b.amount - a.amount : a.amount - b.amount
  );
  return sorted;
});

// Doughnut chart — expenses by category (sorted)
const doughnutData = computed(() => {
  const stats = sortedCategories.value;
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

// Bar chart — expenses by category (sorted)
const barData = computed(() => {
  const stats = sortedCategories.value;
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
  const trend = customTrendData.value ?? dash.value?.monthlyTrend ?? [];
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

// Projected remaining expense for tooltip
const projectedRemainingExpense = computed(() => {
  const month = store.currentMonth;
  const year = parseInt(month.slice(0, 4));
  const mon = parseInt(month.slice(5, 7)) - 1;
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === mon;
  if (!isCurrentMonth) return 0;
  const daysPassed = now.getDate();
  const daysRemaining = daysInMonth - daysPassed;
  const totalExpense = dash.value?.currentMonth?.totalExpense ?? 0;
  const dailyAvg = daysPassed > 0 ? totalExpense / daysPassed : 0;
  return Math.round(dailyAvg * daysRemaining);
});

function fmt(n: number | undefined) {
  return (n ?? 0).toLocaleString("ru");
}

// Navigate to transactions filtered by category
function goToCategory(categoryId: string) {
  store.navigateTo = { tab: "transactions", categoryId };
}

// Export all data
const exportFrom = ref(store.currentMonth + "-01");
const exportTo = ref(new Date().toISOString().slice(0, 10));
const showExportModal = ref(false);

async function downloadExport() {
  const data = await api.exportAll(exportFrom.value, exportTo.value);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-export-${exportFrom.value}-${exportTo.value}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showExportModal.value = false;
}

// === EXTENDED SPENDING STATS (computed from transactions in store) ===

const expenses = computed(() =>
  store.transactions.filter((t) => t.type === "expense")
);

// Daily spending map
const dailySpending = computed(() => {
  const map = new Map<string, number>();
  for (const tx of expenses.value) {
    const d = tx.date.slice(0, 10);
    map.set(d, (map.get(d) ?? 0) + tx.amount);
  }
  return map;
});

// Top 5 most expensive days
const topDays = computed(() => {
  return [...dailySpending.value.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([date, amount]) => ({ date, amount }));
});

// Average daily spend
const avgDailySpend = computed(() => {
  const days = dailySpending.value.size;
  if (!days) return 0;
  const total = [...dailySpending.value.values()].reduce((s, v) => s + v, 0);
  return Math.round(total / days);
});

// Median daily spend
const medianDailySpend = computed(() => {
  const vals = [...dailySpending.value.values()].sort((a, b) => a - b);
  if (!vals.length) return 0;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
});

// Max single transaction
const maxTransaction = computed(() => {
  if (!expenses.value.length) return null;
  return expenses.value.reduce((max, tx) => (tx.amount > max.amount ? tx : max));
});

// Spending by day of week (0=Mon..6=Sun)
const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const spendingByDayOfWeek = computed(() => {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const tx of expenses.value) {
    const d = new Date(tx.date);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    totals[dow] += tx.amount;
    counts[dow]++;
  }
  return totals.map((total, i) => ({
    day: DAY_NAMES[i],
    total,
    avg: counts[i] ? Math.round(total / counts[i]) : 0,
    count: counts[i],
  }));
});

// Most expensive day of week
const mostExpensiveDow = computed(() => {
  return spendingByDayOfWeek.value.reduce((max, d) => (d.total > max.total ? d : max), spendingByDayOfWeek.value[0]);
});

// Spending by bank
const spendingByBank = computed(() => {
  const map = new Map<string, number>();
  for (const tx of expenses.value) {
    const bank = tx.bank || "Не указан";
    map.set(bank, (map.get(bank) ?? 0) + tx.amount);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([bank, amount]) => ({ bank, amount }));
});

// Number of transactions
const txCount = computed(() => expenses.value.length);

// All days of month with spending
const allDaysOfMonth = computed(() => {
  const month = store.currentMonth;
  const year = parseInt(month.slice(0, 4));
  const mon = parseInt(month.slice(5, 7)) - 1;
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === mon;
  const lastDay = isCurrentMonth ? now.getDate() : daysInMonth;
  const days: { date: string; day: number; amount: number; dow: string }[] = [];
  const SHORT_DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  for (let d = 1; d <= lastDay; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    const dt = new Date(year, mon, d);
    days.push({
      date: key,
      day: d,
      amount: dailySpending.value.get(key) ?? 0,
      dow: SHORT_DAYS[dt.getDay()],
    });
  }
  return days;
});

const maxDayAmount = computed(() =>
  Math.max(...allDaysOfMonth.value.map((d) => d.amount), 1)
);

// Days with zero spending
const daysWithZeroSpend = computed(() => {
  const now = new Date();
  const month = store.currentMonth;
  const year = parseInt(month.slice(0, 4));
  const mon = parseInt(month.slice(5, 7)) - 1;
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const lastDay = (now.getFullYear() === year && now.getMonth() === mon)
    ? now.getDate()
    : daysInMonth;
  let zero = 0;
  for (let d = 1; d <= lastDay; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    if (!dailySpending.value.has(key)) zero++;
  }
  return zero;
});

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
      <div class="stat-card stat-real">
        <div class="stat-icon">💵</div>
        <div class="stat-info">
          <span class="stat-label">Чистыми</span>
          <span class="stat-value" :class="(dash?.netWorth ?? 0) >= 0 ? '' : 'red'">{{ fmt(dash?.netWorth) }} ₽</span>
          <span class="stat-sub">Активы − долги</span>
        </div>
      </div>
      <div class="stat-card stat-debt" v-if="(dash?.totalDebt ?? 0) > 0">
        <div class="stat-icon">🔴</div>
        <div class="stat-info">
          <span class="stat-label">Долги</span>
          <span class="stat-value red">-{{ fmt(dash?.totalDebt) }} ₽</span>
        </div>
      </div>
      <div class="stat-card stat-total-income has-tooltip">
        <div class="stat-icon">📈</div>
        <div class="stat-info">
          <span class="stat-label">Общий доход за месяц</span>
          <span class="stat-value green">+{{ fmt(dash?.totalMonthlyIncome) }} ₽</span>
        </div>
        <div class="stat-tooltip">
          <div class="tooltip-row">
            <span>Активный доход</span>
            <span class="green">+{{ fmt(dash?.currentMonth?.totalIncome) }} ₽</span>
          </div>
          <div class="tooltip-row">
            <span>Пассивный доход</span>
            <span class="blue">+{{ fmt(dash?.monthlyPassiveIncome) }} ₽</span>
          </div>
        </div>
      </div>
      <div class="stat-card stat-expense">
        <div class="stat-icon">📉</div>
        <div class="stat-info">
          <span class="stat-label">Расходы за месяц</span>
          <span class="stat-value red">-{{ fmt(dash?.currentMonth?.totalExpense) }} ₽</span>
        </div>
      </div>
      <div class="stat-card stat-forecast has-tooltip">
        <div class="stat-icon">🔮</div>
        <div class="stat-info">
          <span class="stat-label">Прогноз к концу месяца</span>
          <span class="stat-value" :class="(dash?.forecastEndOfMonth ?? 0) >= 0 ? 'green' : 'red'">
            {{ (dash?.forecastEndOfMonth ?? 0) >= 0 ? '+' : '' }}{{ fmt(dash?.forecastEndOfMonth) }} ₽
          </span>
          <span class="stat-sub">Останется, если тратить в том же темпе</span>
        </div>
        <div class="stat-tooltip">
          <div class="tooltip-row">
            <span>Доход</span>
            <span class="green">+{{ fmt(dash?.currentMonth?.totalIncome) }} ₽</span>
          </div>
          <div class="tooltip-row">
            <span>Уже потрачено</span>
            <span class="red">-{{ fmt(dash?.currentMonth?.totalExpense) }} ₽</span>
          </div>
          <div class="tooltip-row">
            <span>Прогноз расходов до конца</span>
            <span class="red">-{{ fmt(projectedRemainingExpense) }} ₽</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Export button -->
    <div class="export-bar">
      <button class="btn-export" @click="showExportModal = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Экспорт для GPT
      </button>
    </div>

    <!-- Export modal -->
    <Teleport to="body">
      <div v-if="showExportModal" class="modal-overlay" @click.self="showExportModal = false">
        <div class="modal-card-sm">
          <button class="modal-close-sm" @click="showExportModal = false">×</button>
          <h3 style="color: #fff; margin: 0 0 16px; font-size: 16px;">Экспорт данных</h3>
          <p style="color: #6b7fa3; font-size: 13px; margin: 0 0 14px;">Скачайте JSON со всеми данными для анализа в ChatGPT</p>
          <div style="display: flex; gap: 10px; margin-bottom: 14px;">
            <label style="flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #7eb0ff;">
              <span>С</span>
              <input v-model="exportFrom" type="date" style="background: rgba(23,103,253,0.06); border: 1px solid rgba(23,103,253,0.2); border-radius: 8px; padding: 8px; color: #fff; outline: none;" />
            </label>
            <label style="flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #7eb0ff;">
              <span>По</span>
              <input v-model="exportTo" type="date" style="background: rgba(23,103,253,0.06); border: 1px solid rgba(23,103,253,0.2); border-radius: 8px; padding: 8px; color: #fff; outline: none;" />
            </label>
          </div>
          <button class="btn-export-download" @click="downloadExport">Скачать JSON</button>
        </div>
      </div>
    </Teleport>

    <!-- Charts row -->
    <div class="charts-row">
      <!-- Category breakdown -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Расходы по категориям</h3>
          <div class="chart-controls">
            <button
              class="sort-btn"
              @click="categorySortOrder = categorySortOrder === 'desc' ? 'asc' : 'desc'"
              :title="categorySortOrder === 'desc' ? 'По убыванию' : 'По возрастанию'"
            >
              {{ categorySortOrder === 'desc' ? '↓' : '↑' }}
            </button>
            <div class="chart-toggle">
              <button :class="{ active: chartType === 'doughnut' }" @click="chartType = 'doughnut'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v10l7 4"/></svg>
              </button>
              <button :class="{ active: chartType === 'bar' }" @click="chartType = 'bar'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="chart-body">
          <Doughnut v-if="chartType === 'doughnut'" :data="doughnutData" :options="doughnutOptions" />
          <Bar v-else :data="barData" :options="barOptions" />
        </div>
        <!-- Legend -->
        <div class="category-legend" v-if="chartType === 'doughnut'">
          <div
            v-for="cat in sortedCategories"
            :key="cat.categoryId"
            class="legend-item legend-clickable"
            @click="goToCategory(cat.categoryId)"
            title="Открыть операции по категории"
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
          <div class="trend-pills">
            <button :class="{ active: trendPeriod === '1m' }" @click="trendPeriod = '1m'">1М</button>
            <button :class="{ active: trendPeriod === '3m' }" @click="trendPeriod = '3m'">3М</button>
            <button :class="{ active: trendPeriod === '6m' }" @click="trendPeriod = '6m'">6М</button>
            <button :class="{ active: trendPeriod === '1y' }" @click="trendPeriod = '1y'">1Г</button>
          </div>
        </div>
        <div class="chart-body chart-body-line">
          <Line :data="trendData" :options="trendOptions" />
        </div>
      </div>
    </div>

    <!-- Spending Analytics -->
    <div class="analytics-row">
      <!-- Quick stats -->
      <div class="panel-card">
        <h3 class="panel-title">📊 Аналитика расходов</h3>
        <div class="analytics-grid">
          <div class="a-item">
            <span class="a-label">Операций</span>
            <span class="a-value">{{ txCount }}</span>
          </div>
          <div class="a-item">
            <span class="a-label">Средний расход/день</span>
            <span class="a-value">{{ fmt(avgDailySpend) }} ₽</span>
          </div>
          <div class="a-item">
            <span class="a-label">Медиана/день</span>
            <span class="a-value">{{ fmt(medianDailySpend) }} ₽</span>
          </div>
          <div class="a-item">
            <span class="a-label">Дней без трат</span>
            <span class="a-value green">{{ daysWithZeroSpend }}</span>
          </div>
          <div class="a-item a-item-wide" v-if="maxTransaction">
            <span class="a-label">Макс. трата</span>
            <span class="a-value red">{{ fmt(maxTransaction.amount) }} ₽</span>
            <span class="a-sub">{{ maxTransaction.description || 'Без описания' }} · {{ new Date(maxTransaction.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) }}</span>
          </div>
          <div class="a-item a-item-wide" v-if="mostExpensiveDow">
            <span class="a-label">Самый дорогой день недели</span>
            <span class="a-value">{{ mostExpensiveDow.day }}</span>
            <span class="a-sub">{{ fmt(mostExpensiveDow.total) }} ₽ за месяц ({{ mostExpensiveDow.count }} операций)</span>
          </div>
        </div>
      </div>

      <!-- Top expensive days -->
      <div class="panel-card">
        <h3 class="panel-title">🔥 Самые дорогие дни</h3>
        <div v-if="!topDays.length" class="empty-hint">Нет данных</div>
        <div v-for="(day, i) in topDays" :key="day.date" class="top-day-row">
          <span class="top-day-rank">{{ i + 1 }}</span>
          <span class="top-day-date">{{ new Date(day.date).toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short' }) }}</span>
          <div class="top-day-bar-track">
            <div class="top-day-bar-fill" :style="{ width: (topDays.length && topDays[0].amount ? day.amount / topDays[0].amount * 100 : 0) + '%' }"></div>
          </div>
          <span class="top-day-amount">{{ fmt(day.amount) }} ₽</span>
        </div>
      </div>

      <!-- Spending by bank -->
      <div class="panel-card" v-if="spendingByBank.length">
        <h3 class="panel-title">🏦 Расходы по банкам</h3>
        <div v-for="b in spendingByBank" :key="b.bank" class="bank-stat-row">
          <span class="bank-stat-name">{{ b.bank }}</span>
          <div class="bank-stat-bar-track">
            <div
              class="bank-stat-bar-fill"
              :style="{ width: (spendingByBank[0]?.amount ? b.amount / spendingByBank[0].amount * 100 : 0) + '%' }"
            ></div>
          </div>
          <span class="bank-stat-amount">{{ fmt(b.amount) }} ₽</span>
        </div>
      </div>

      <!-- Spending by day of week -->
      <div class="panel-card">
        <h3 class="panel-title">📅 Расходы по дням недели</h3>
        <div class="dow-grid">
          <div v-for="d in spendingByDayOfWeek" :key="d.day" class="dow-item">
            <span class="dow-name">{{ d.day }}</span>
            <div class="dow-bar-track">
              <div
                class="dow-bar-fill"
                :style="{ height: (spendingByDayOfWeek.length && Math.max(...spendingByDayOfWeek.map(x => x.total)) ? d.total / Math.max(...spendingByDayOfWeek.map(x => x.total)) * 100 : 0) + '%' }"
              ></div>
            </div>
            <span class="dow-total">{{ d.total >= 1000 ? Math.round(d.total / 1000) + 'k' : fmt(d.total) }}</span>
            <span class="dow-avg">~{{ fmt(d.avg) }}/д</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Daily spending chart — full width -->
    <div class="panel-card daily-chart-card">
      <h3 class="panel-title">📆 Расходы по дням месяца</h3>
      <div class="daily-chart">
        <div v-for="d in allDaysOfMonth" :key="d.date" class="daily-bar-col" :title="`${d.dow} ${d.day}: ${fmt(d.amount)} ₽`">
          <span class="daily-bar-amount" :class="{ 'daily-bar-amount-hidden': d.amount === 0 }">
            {{ d.amount >= 1000 ? Math.round(d.amount / 1000) + 'k' : d.amount > 0 ? d.amount : '' }}
          </span>
          <div class="daily-bar-track">
            <div
              class="daily-bar-fill"
              :style="{ height: (d.amount / maxDayAmount * 100) + '%' }"
              :class="{ 'daily-bar-top': d.amount === maxDayAmount }"
            ></div>
          </div>
          <span class="daily-bar-day">{{ d.day }}</span>
          <span class="daily-bar-dow">{{ d.dow }}</span>
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
.stat-sub { font-size: 10px; color: #4a5c7a; }

/* Tooltip on hover */
.has-tooltip {
  position: relative;
}
.stat-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(14, 15, 26, 0.98);
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 10px;
  padding: 12px 16px;
  min-width: 220px;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.has-tooltip:hover .stat-tooltip {
  display: block;
}
.tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
  color: #c8daf0;
  padding: 4px 0;
}
.tooltip-row .green { color: #34d399; font-weight: 600; }
.tooltip-row .blue { color: #60a5fa; font-weight: 600; }

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
  flex-wrap: wrap;
  gap: 8px;
}

.trend-pills {
  display: flex; gap: 2px;
  background: rgba(23, 103, 253, 0.06); border-radius: 8px; padding: 2px;
}
.trend-pills button {
  background: none; border: none; color: #6b7fa3;
  padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.trend-pills button.active {
  background: rgba(23, 103, 253, 0.2); color: #7eb0ff;
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
.legend-clickable { cursor: pointer; padding: 4px 6px; border-radius: 6px; transition: background 0.2s; }
.legend-clickable:hover { background: rgba(23, 103, 253, 0.1); }
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

/* Export */
.export-bar { display: flex; justify-content: flex-end; }
.btn-export {
  display: flex; align-items: center; gap: 6px;
  background: rgba(52, 211, 153, 0.1); border: 1px solid rgba(52, 211, 153, 0.3);
  color: #34d399; padding: 8px 16px; border-radius: 10px;
  font-size: 13px; cursor: pointer; transition: all 0.2s;
}
.btn-export:hover { background: rgba(52, 211, 153, 0.2); color: #6ee7b7; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px;
}
.modal-card-sm {
  background: linear-gradient(135deg, rgba(14,15,26,0.99), rgba(20,22,36,0.99));
  border: 1px solid rgba(23,103,253,0.3); border-radius: 16px;
  padding: 24px; width: 100%; max-width: 380px; position: relative;
}
.modal-close-sm {
  position: absolute; top: 12px; right: 12px; background: none; border: none;
  color: #6b7fa3; font-size: 20px; cursor: pointer;
}
.btn-export-download {
  width: 100%; background: linear-gradient(135deg, #34d399, #059669);
  border: none; color: #fff; padding: 12px; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-export-download:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(52,211,153,0.3); }

/* Chart controls */
.chart-controls { display: flex; align-items: center; gap: 8px; }
.sort-btn {
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.25);
  color: #7eb0ff;
  width: 32px; height: 32px;
  border-radius: 8px; cursor: pointer;
  font-size: 16px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.sort-btn:hover { background: rgba(23, 103, 253, 0.25); color: #fff; }

/* Analytics row */
.analytics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.analytics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.a-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px;
  background: rgba(23, 103, 253, 0.04);
  border-radius: 10px;
}
.a-item-wide { grid-column: span 2; }
.a-label { font-size: 11px; color: #6b7fa3; text-transform: uppercase; letter-spacing: 0.3px; }
.a-value { font-size: 18px; font-weight: 700; color: #fff; }
.a-value.green { color: #34d399; }
.a-value.red { color: #f87171; }
.a-sub { font-size: 11px; color: #4a5c7a; }

/* Top days */
.top-day-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(23, 103, 253, 0.06);
}
.top-day-row:last-child { border-bottom: none; }
.top-day-rank {
  width: 24px; height: 24px;
  background: rgba(248, 113, 113, 0.12);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #f87171;
  flex-shrink: 0;
}
.top-day-date { font-size: 13px; color: #c8daf0; min-width: 90px; text-transform: capitalize; }
.top-day-bar-track {
  flex: 1; height: 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 3px; overflow: hidden;
}
.top-day-bar-fill {
  height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, #f87171, #fb923c);
  transition: width 0.4s;
}
.top-day-amount { font-size: 14px; font-weight: 600; color: #f87171; min-width: 80px; text-align: right; }

/* Day of week */
.dow-grid {
  display: flex; gap: 8px; align-items: flex-end;
  height: 160px; padding-top: 10px;
}
.dow-item {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.dow-name { font-size: 11px; color: #6b7fa3; font-weight: 500; order: 3; }
.dow-bar-track {
  width: 100%; height: 100px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px 6px 0 0;
  display: flex; align-items: flex-end;
  order: 1;
}
.dow-bar-fill {
  width: 100%; border-radius: 6px 6px 0 0;
  background: linear-gradient(180deg, #1767fd, #6e4aff);
  transition: height 0.4s;
  min-height: 2px;
}
.dow-total { font-size: 11px; color: #c8daf0; font-weight: 600; order: 2; }
.dow-avg { font-size: 9px; color: #4a5c7a; order: 4; }

/* Bank spending stats */
.bank-stat-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(23, 103, 253, 0.06);
}
.bank-stat-row:last-child { border-bottom: none; }
.bank-stat-name { font-size: 13px; color: #c8daf0; min-width: 100px; }
.bank-stat-bar-track {
  flex: 1; height: 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 3px; overflow: hidden;
}
.bank-stat-bar-fill {
  height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, #1767fd, #60a5fa);
  transition: width 0.4s;
}
.bank-stat-amount { font-size: 14px; font-weight: 600; color: #fff; min-width: 80px; text-align: right; }

/* Daily spending chart */
.daily-chart-card {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 14px;
  padding: 20px;
}
.daily-chart {
  display: flex;
  gap: 2px;
  align-items: flex-end;
  height: 200px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(23, 103, 253, 0.3) transparent;
  padding-bottom: 4px;
}
.daily-bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 28px;
}
.daily-bar-amount {
  font-size: 9px;
  color: #7eb0ff;
  font-weight: 600;
  height: 14px;
}
.daily-bar-amount-hidden { visibility: hidden; }
.daily-bar-track {
  width: 100%;
  height: 140px;
  display: flex;
  align-items: flex-end;
}
.daily-bar-fill {
  width: 100%;
  border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, #1767fd, #6e4aff);
  transition: height 0.4s;
  min-height: 0;
}
.daily-bar-fill.daily-bar-top {
  background: linear-gradient(180deg, #f87171, #fb923c);
}
.daily-bar-day {
  font-size: 11px;
  color: #c8daf0;
  font-weight: 600;
}
.daily-bar-dow {
  font-size: 9px;
  color: #4a5c7a;
}

/* Mobile */
@media (max-width: 768px) {
  .stat-cards { grid-template-columns: 1fr 1fr; }
  .charts-row { grid-template-columns: 1fr; }
  .debt-row { grid-template-columns: 1fr; }
  .analytics-row { grid-template-columns: 1fr; }
  .bottom-row { grid-template-columns: 1fr; }
  .stat-value { font-size: 16px; }
  .stat-icon { font-size: 22px; width: 40px; height: 40px; }
  .chart-body { height: 220px; }
  .chart-body-line { height: 220px; }
  .daily-chart { height: 170px; }
  .daily-bar-track { height: 110px; }
  .dow-grid { height: 140px; }
  .dow-bar-track { height: 80px; }
  .modal-card-sm { max-width: 92vw; padding: 20px; }
  .btn-export-download { min-height: 44px; font-size: 16px; }
}

@media (max-width: 480px) {
  .dashboard { gap: 14px; }
  .stat-cards { grid-template-columns: 1fr; gap: 10px; }
  .stat-card { padding: 14px 16px; gap: 12px; }
  .stat-value { font-size: 18px; }
  .stat-icon { font-size: 24px; width: 42px; height: 42px; }
  .stat-sub { font-size: 11px; }
  .stat-tooltip { left: 0; transform: none; min-width: unset; width: 100%; }

  .chart-card { padding: 14px; }
  .chart-header { flex-wrap: wrap; gap: 8px; }
  .chart-header h3 { font-size: 14px; }
  .chart-body { height: 200px; }
  .chart-body-line { height: 200px; }
  .category-legend { max-height: 160px; }
  .legend-item { font-size: 12px; }

  .panel-card { padding: 14px; }
  .panel-title { font-size: 14px; margin-bottom: 12px; }

  .analytics-grid { grid-template-columns: 1fr; }
  .a-item-wide { grid-column: span 1; }
  .a-value { font-size: 16px; }

  .daily-chart { height: 160px; gap: 1px; }
  .daily-bar-col { min-width: 22px; }
  .daily-bar-track { height: 100px; }
  .daily-bar-amount { font-size: 8px; }
  .daily-bar-day { font-size: 10px; }
  .daily-bar-dow { font-size: 8px; }

  .dow-grid { height: 130px; gap: 4px; }
  .dow-bar-track { height: 70px; }
  .dow-name { font-size: 10px; }
  .dow-total { font-size: 10px; }

  .top-day-date { font-size: 12px; min-width: 70px; }
  .top-day-amount { font-size: 13px; min-width: 60px; }

  .compare-item { font-size: 12px; gap: 4px; }
  .compare-label { min-width: 60px; }

  .export-bar { justify-content: stretch; }
  .btn-export { width: 100%; justify-content: center; min-height: 44px; font-size: 16px; }
  .modal-card-sm { max-width: 92vw; padding: 18px; }
  .modal-card-sm input { font-size: 16px; }
  .btn-export-download { min-height: 44px; font-size: 16px; }

  .recommend-block { flex-direction: column; gap: 4px; text-align: center; }
  .planned-row { gap: 6px; padding: 8px 0; }
  .planned-date { min-width: 50px; font-size: 11px; }
  .planned-name { font-size: 12px; }
  .planned-amount { font-size: 13px; }

  .bank-stat-name { min-width: 70px; font-size: 12px; }
  .bank-stat-amount { min-width: 60px; font-size: 13px; }
}
</style>
