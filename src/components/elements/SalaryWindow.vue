<template>
  <div class="window-main">
    <div class="window-container">
      <div class="window-header">
        <div class="tabs">
          <button
            :class="['tab', { active: currentTab === 'finance' }]"
            @click="currentTab = 'finance'"
          >
            Финансовая статистика
          </button>
          <button
            :class="['tab', { active: currentTab === 'plans' }]"
            @click="currentTab = 'plans'"
          >
            Финансовые планы
          </button>
        </div>
        <button class="close-button" @click="$emit('close')">✕</button>
      </div>
      <div class="window-content">
        <template v-if="currentTab === 'finance'">
          <div class="content-left">
            <!-- Графики и статистика -->
            <div class="stats-section">
              <div class="header-with-controls">
                <h2 class="section-title">Финансовая статистика</h2>
                <div class="controls-group">
                  <button
                    class="manage-jobs-btn"
                    @click="showManageJobsModal = true"
                  >
                    💼 Работы
                  </button>
                  <div class="period-selector">
                    <button
                      v-for="period in periods"
                      :key="period.value"
                      :class="[
                        'period-btn',
                        { active: selectedPeriod === period.value },
                      ]"
                      @click="selectPeriod(period.value)"
                    >
                      {{ period.label }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Текущая информация -->
              <div class="current-info">
                <div
                  class="info-card expandable"
                  @click="toggleCurrentBreakdown"
                >
                  <div class="info-label">Текущая зарплата</div>
                  <div class="info-value">
                    {{ formatCurrency(currentSalary.total) }}
                  </div>
                  <div class="info-date">{{ currentMonthLabel }}</div>
                  <div
                    class="expand-icon"
                    :class="{ expanded: showCurrentBreakdown }"
                  >
                    ▼
                  </div>

                  <!-- Разбивка по работам -->
                  <div v-if="showCurrentBreakdown" class="breakdown-list">
                    <div
                      v-for="item in currentSalary.breakdown"
                      :key="item.jobId"
                      class="breakdown-item"
                    >
                      <div
                        class="breakdown-color"
                        :style="{ backgroundColor: item.color }"
                      ></div>
                      <div class="breakdown-info">
                        <div class="breakdown-name">{{ item.jobName }}</div>
                        <div class="breakdown-amount">
                          {{ formatCurrency(item.amount) }}
                        </div>
                      </div>
                    </div>
                    <div
                      v-if="currentSalary.breakdown.length === 0"
                      class="no-data"
                    >
                      Нет данных за текущий месяц
                    </div>
                  </div>
                </div>

                <div class="info-card">
                  <div class="info-label">Желаемая зарплата</div>
                  <div class="info-value highlight">
                    {{ formatCurrency(targetSalary.amount) }}
                  </div>
                  <div class="info-date">Цель: {{ targetSalary.label }}</div>
                </div>

                <div class="info-card">
                  <div class="info-label">Рост за период</div>
                  <div class="info-value positive">+{{ growthPercent }}%</div>
                  <div class="info-date">{{ periodRange }}</div>
                </div>
              </div>

              <!-- График роста -->
              <div class="chart-section">
                <div class="chart-header">
                  <h3 class="chart-title">График роста заработной платы</h3>
                  <button class="add-data-btn" @click="showAddDataModal = true">
                    + Добавить данные
                  </button>
                </div>
                <div class="chart-wrapper">
                  <Line :data="chartData" :options="chartOptions" />
                </div>
              </div>

              <!-- Детальная статистика -->
              <div class="detailed-stats">
                <h3 class="chart-title">Детальная информация</h3>
                <div
                  class="stat-row"
                  v-for="stat in detailedStats"
                  :key="stat.label"
                >
                  <span class="stat-label">{{ stat.label }}:</span>
                  <span class="stat-value" :class="stat.class">{{
                    stat.value
                  }}</span>
                </div>
              </div>

              <!-- Разбивка по текущему месяцу -->
              <div
                class="detailed-stats"
                v-if="currentSalary.breakdown.length > 0"
              >
                <h3 class="chart-title">Разбивка по текущему месяцу</h3>
                <div
                  class="stat-row"
                  v-for="item in currentSalary.breakdown"
                  :key="item.jobId"
                >
                  <span class="stat-label">
                    <span
                      class="color-dot"
                      :style="{ backgroundColor: item.color }"
                    ></span>
                    {{ item.jobName }}:
                  </span>
                  <span class="stat-value">{{
                    formatCurrency(item.amount)
                  }}</span>
                </div>
              </div>

              <!-- Прогресс к цели -->
              <div class="progress-section">
                <h3 class="chart-title">Прогресс к цели</h3>
                <div class="progress-bar-container">
                  <div
                    class="progress-bar"
                    :style="{ width: progressPercent + '%' }"
                  ></div>
                </div>
                <div class="progress-info">
                  <span>{{ progressPercent }}% выполнено</span>
                  <span>{{ 100 - progressPercent }}% осталось</span>
                </div>
              </div>
            </div>
          </div>

          <div class="content-right">
            <!-- Глобальные задачи -->
            <div class="global-tasks-section">
              <div class="tasks-header">
                <h2 class="section-title">Глобальные задачи</h2>
                <button class="add-task-btn" @click="showAddTaskModal = true">
                  +
                </button>
              </div>

              <div class="tasks-list">
                <div
                  class="task-item"
                  v-for="task in globalTasks"
                  :key="task.id"
                  :class="{ completed: task.completed }"
                >
                  <div class="task-header">
                    <div class="task-icon">{{ task.icon }}</div>
                    <div class="task-info">
                      <div class="task-name">{{ task.name }}</div>
                      <div class="task-deadline">
                        {{ formatTaskDeadline(task.deadline) }}
                      </div>
                    </div>
                    <button class="task-edit-btn" @click="editTask(task)">
                      ✏️
                    </button>
                  </div>
                  <div class="task-description">{{ task.description }}</div>
                  <div class="task-progress">
                    <div class="task-progress-bar">
                      <div
                        class="task-progress-fill"
                        :style="{ width: task.progress + '%' }"
                      ></div>
                    </div>
                    <span class="task-progress-text">{{ task.progress }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <FinancialPlansWindow v-if="currentTab === 'plans'" />
      </div>
    </div>

    <!-- Модальное окно управления работами -->
    <div
      v-if="showManageJobsModal"
      class="modal-overlay"
      @click="showManageJobsModal = false"
    >
      <div class="modal large-modal" @click.stop>
        <div class="modal-header">
          <h3>Управление работами</h3>
          <button class="modal-close" @click="showManageJobsModal = false">
            ✕
          </button>
        </div>
        <div class="modal-body">
          <button class="btn-add-job" @click="openJobForm()">
            + Добавить работу
          </button>

          <div class="jobs-section">
            <h4>Активные работы</h4>
            <div class="jobs-list">
              <div v-for="job in activeJobs" :key="job.id" class="job-item">
                <div
                  class="job-color"
                  :style="{ backgroundColor: job.color }"
                ></div>
                <div class="job-info">
                  <div class="job-name">{{ job.name }}</div>
                  <div class="job-position">{{ job.position }}</div>
                </div>
                <div class="job-actions">
                  <button class="btn-icon" @click="openJobForm(job)">✏️</button>
                  <button class="btn-icon" @click="archiveJob(job.id)">
                    📦
                  </button>
                </div>
              </div>
              <div v-if="activeJobs.length === 0" class="no-data">
                Нет активных работ
              </div>
            </div>
          </div>

          <div class="jobs-section" v-if="archivedJobs.length > 0">
            <h4>Архив</h4>
            <div class="jobs-list">
              <div
                v-for="job in archivedJobs"
                :key="job.id"
                class="job-item archived"
              >
                <div
                  class="job-color"
                  :style="{ backgroundColor: job.color }"
                ></div>
                <div class="job-info">
                  <div class="job-name">{{ job.name }}</div>
                  <div class="job-position">{{ job.position }}</div>
                </div>
                <div class="job-actions">
                  <button class="btn-icon" @click="restoreJob(job.id)">
                    ↩️
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Модальное окно добавления/редактирования работы -->
    <div
      v-if="showJobFormModal"
      class="modal-overlay"
      @click="showJobFormModal = false"
    >
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>{{ editingJob ? "Редактировать работу" : "Добавить работу" }}</h3>
          <button class="modal-close" @click="closeJobForm">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Название компании</label>
            <input v-model="jobForm.name" type="text" placeholder="Mirtek" />
          </div>
          <div class="form-group">
            <label>Должность</label>
            <input
              v-model="jobForm.position"
              type="text"
              placeholder="Backend Dev"
            />
          </div>
          <div class="form-group">
            <label>Цвет</label>
            <div class="color-picker">
              <input v-model="jobForm.color" type="color" />
              <span class="color-value">{{ jobForm.color }}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="closeJobForm">Отмена</button>
          <button class="btn-save" @click="saveJob">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Модальное окно добавления данных зарплаты -->
    <div
      v-if="showAddDataModal"
      class="modal-overlay"
      @click="showAddDataModal = false"
    >
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>Добавить данные о зарплате</h3>
          <button class="modal-close" @click="showAddDataModal = false">
            ✕
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Тип</label>
            <select v-model="newSalaryData.type">
              <option value="fact">Фактическая</option>
              <option value="plan">План</option>
            </select>
          </div>

          <div class="form-group" v-if="newSalaryData.type === 'fact'">
            <label>Работа *</label>
            <select v-model="newSalaryData.jobId">
              <option value="">Выберите работу</option>
              <option v-for="job in activeJobs" :key="job.id" :value="job.id">
                {{ job.name }} - {{ job.position }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Год</label>
            <input
              v-model.number="newSalaryData.year"
              type="number"
              placeholder="2025"
            />
          </div>

          <div class="form-group">
            <label>Месяц</label>
            <select v-model.number="newSalaryData.month">
              <option v-for="m in 12" :key="m" :value="m">
                {{ getMonthName(m) }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Зарплата (₽)</label>
            <input
              v-model.number="newSalaryData.amount"
              type="number"
              placeholder="180000"
            />
          </div>

          <div class="form-group">
            <label>Примечание (опционально)</label>
            <textarea
              v-model="newSalaryData.note"
              placeholder="Дополнительная информация"
            ></textarea>
          </div>

          <div v-if="salaryDataError" class="error-message">
            {{ salaryDataError }}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showAddDataModal = false">
            Отмена
          </button>
          <button class="btn-save" @click="addSalaryData">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Модальное окно добавления/редактирования задачи -->
    <div
      v-if="showAddTaskModal"
      class="modal-overlay"
      @click="showAddTaskModal = false"
    >
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>
            {{ editingTask ? "Редактировать задачу" : "Добавить задачу" }}
          </h3>
          <button class="modal-close" @click="closeTaskModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Иконка</label>
            <input v-model="taskForm.icon" type="text" placeholder="🎯" />
          </div>
          <div class="form-group">
            <label>Название</label>
            <input
              v-model="taskForm.name"
              type="text"
              placeholder="Название задачи"
            />
          </div>
          <div class="form-group">
            <label>Дедлайн</label>
            <input v-model="taskForm.deadline" type="date" />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea
              v-model="taskForm.description"
              placeholder="Описание задачи"
            ></textarea>
          </div>
          <div class="form-group">
            <label>Прогресс (%)</label>
            <input
              v-model.number="taskForm.progress"
              type="number"
              min="0"
              max="100"
            />
          </div>
          <div class="form-group checkbox-group">
            <label>
              <input v-model="taskForm.completed" type="checkbox" />
              Выполнено
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button v-if="editingTask" class="btn-delete" @click="deleteTask">
            Удалить
          </button>
          <button class="btn-cancel" @click="closeTaskModal">Отмена</button>
          <button class="btn-save" @click="saveTask">Сохранить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { Line } from "vue-chartjs";
import FinancialPlansWindow from "./FinancialPlansWindow.vue";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale,
} from "chart.js";

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale
);

defineEmits(["close"]);

// Текущая активная вкладка
const currentTab = ref("finance");

// Состояния модальных окон
const showManageJobsModal = ref(false);
const showJobFormModal = ref(false);
const showAddDataModal = ref(false);
const showAddTaskModal = ref(false);
const showCurrentBreakdown = ref(false);
const editingJob = ref(null);
const editingTask = ref(null);
const salaryDataError = ref("");

// Периоды для фильтрации
const periods = [
  { label: "3 мес", value: "3m" },
  { label: "6 мес", value: "6m" },
  { label: "1 год", value: "1y" },
  { label: "Все", value: "all" },
];
const selectedPeriod = ref("all");

// Мок данных - Работы
const jobs = ref([
  {
    id: 1,
    name: "Mirtek",
    position: ".Net middle",
    color: "#E86CFF",
    isActive: true,
  },
  {
    id: 2,
    name: "Egar",
    position: ".Net Middle",
    color: "#3DDFFF",
    isActive: true,
  },
]);

// Мок данных - Записи зарплат
const salaries = ref([
  { id: 1, type: "fact", jobId: 1, year: 2025, month: 2, amount: 42000 },
  { id: 2, type: "fact", jobId: 1, year: 2025, month: 6, amount: 57000 },
  { id: 3, type: "fact", jobId: 1, year: 2025, month: 7, amount: 200000 },
  { id: 4, type: "fact", jobId: 2, year: 2025, month: 7, amount: 180000 },
  { id: 5, type: "fact", jobId: 2, year: 2025, month: 11, amount: 200000 },
  { id: 6, type: "fact", jobId: 1, year: 2025, month: 11, amount: 200000 },
  { id: 7, type: "fact", jobId: 2, year: 2025, month: 12, amount: 180000 },
  { id: 8, type: "plan", year: 2026, month: 2, amount: 350000 },
  { id: 9, type: "plan", year: 2026, month: 6, amount: 420000 },
]);

// Глобальные задачи
const globalTasks = ref([
  {
    id: 1,
    name: "Собеседования ОМ",
    icon: "🎯",
    deadline: "2025-12-15",
    description:
      "Подготовка к собеседованиям по объектным моделям и архитектуре",
    progress: 65,
    completed: false,
  },
  {
    id: 2,
    name: "SQRC сертификация",
    icon: "📜",
    deadline: "2026-01-01",
    description: "Получение сертификации по SQRC стандартам",
    progress: 40,
    completed: false,
  },
  {
    id: 3,
    name: "Изучение паттернов проектирования",
    icon: "📚",
    deadline: "2025-12-20",
    description: "Углубленное изучение GoF паттернов и их применение",
    progress: 80,
    completed: false,
  },
  {
    id: 4,
    name: "Построить pet-проект",
    icon: "🚀",
    deadline: "2026-01-10",
    description:
      "Разработать полноценное приложение с использованием новых технологий",
    progress: 25,
    completed: false,
  },
]);

// Формы
const jobForm = ref({
  name: "",
  position: "",
  color: "#E86CFF",
});

const newSalaryData = ref({
  type: "fact",
  jobId: "",
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  amount: "",
  note: "",
});

const taskForm = ref({
  icon: "",
  name: "",
  deadline: "",
  description: "",
  progress: 0,
  completed: false,
});

// Computed - Фильтрация работ
const activeJobs = computed(() => jobs.value.filter((j) => j.isActive));
const archivedJobs = computed(() => jobs.value.filter((j) => !j.isActive));

// Computed - Фильтрация данных по периоду
const filteredSalaries = computed(() => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let monthsBack = 0;
  switch (selectedPeriod.value) {
    case "3m":
      monthsBack = 3;
      break;
    case "6m":
      monthsBack = 6;
      break;
    case "1y":
      monthsBack = 12;
      break;
    default:
      return salaries.value;
  }

  return salaries.value.filter((s) => {
    const itemDate = new Date(s.year, s.month - 1);
    const cutoffDate = new Date(currentYear, currentMonth - 1 - monthsBack);
    return itemDate >= cutoffDate;
  });
});

// Computed - Текущий месяц
const currentMonthLabel = computed(() => {
  const now = new Date();
  return getMonthName(now.getMonth() + 1) + " " + now.getFullYear();
});

// Computed - Текущая зарплата
const currentSalary = computed(() => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const currentFacts = filteredSalaries.value.filter(
    (s) =>
      s.type === "fact" && s.year === currentYear && s.month === currentMonth
  );

  const breakdown = activeJobs.value
    .map((job) => {
      const salary = currentFacts.find((s) => s.jobId === job.id);
      return salary
        ? {
            jobId: job.id,
            jobName: job.name,
            color: job.color,
            amount: salary.amount,
          }
        : null;
    })
    .filter(Boolean);

  const total = breakdown.reduce((sum, item) => sum + item.amount, 0);

  return { total, breakdown };
});

// Computed - Целевая зарплата (ближайший план)
const targetSalary = computed(() => {
  const now = new Date();
  const plans = filteredSalaries.value
    .filter((s) => s.type === "plan")
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

  const futurePlans = plans.filter((p) => {
    const planDate = new Date(p.year, p.month - 1);
    return planDate > now;
  });

  const nearestPlan = futurePlans[0] ||
    plans[plans.length - 1] || {
      amount: 0,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    };

  return {
    amount: nearestPlan.amount,
    label: `${getMonthName(nearestPlan.month)} ${nearestPlan.year}`,
    year: nearestPlan.year,
    month: nearestPlan.month,
  };
});

// Computed - Второй план (дальний)
const distantPlan = computed(() => {
  const now = new Date();
  const plans = filteredSalaries.value
    .filter((s) => s.type === "plan")
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

  const futurePlans = plans.filter((p) => {
    const planDate = new Date(p.year, p.month - 1);
    return planDate > now;
  });

  return futurePlans[1] || null;
});

// Computed - Факты по месяцам (агрегированные)
const factsByMonth = computed(() => {
  const facts = filteredSalaries.value.filter((s) => s.type === "fact");
  const grouped = {};

  facts.forEach((f) => {
    const key = `${f.year}-${String(f.month).padStart(2, "0")}`;
    if (!grouped[key]) {
      grouped[key] = { year: f.year, month: f.month, amount: 0, jobs: [] };
    }
    grouped[key].amount += f.amount;
    const job = jobs.value.find((j) => j.id === f.jobId);
    if (job) {
      grouped[key].jobs.push({
        jobId: f.jobId,
        jobName: job.name,
        color: job.color,
        amount: f.amount,
      });
    }
  });

  return Object.values(grouped).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
});

// Computed - Рост за период
const growthPercent = computed(() => {
  if (factsByMonth.value.length < 2) return 0;
  const first = factsByMonth.value[0].amount;
  const last = factsByMonth.value[factsByMonth.value.length - 1].amount;
  return Math.round(((last - first) / first) * 100);
});

// Computed - Диапазон периода
const periodRange = computed(() => {
  if (factsByMonth.value.length === 0) return "";
  const first = factsByMonth.value[0];
  const last = factsByMonth.value[factsByMonth.value.length - 1];
  return `${getMonthName(first.month)} ${first.year} - ${getMonthName(
    last.month
  )} ${last.year}`;
});

// Computed - Прогресс к цели
const progressPercent = computed(() => {
  if (factsByMonth.value.length === 0) return 0;
  const start = factsByMonth.value[0].amount;
  const current =
    currentSalary.value.total ||
    factsByMonth.value[factsByMonth.value.length - 1].amount;
  const target = targetSalary.value.amount;

  if (target <= start) return 100;
  return Math.min(
    100,
    Math.round(((current - start) / (target - start)) * 100)
  );
});

// Computed - Детальная статистика
const detailedStats = computed(() => {
  const facts = factsByMonth.value;
  if (facts.length === 0) {
    return [{ label: "Нет данных", value: "—", class: "" }];
  }

  const start = facts[0];
  const current = facts[facts.length - 1];
  const target = targetSalary.value;

  const monthsDiff =
    facts.length > 1
      ? (current.year - start.year) * 12 + (current.month - start.month)
      : 1;
  const avgGrowth =
    monthsDiff > 0 ? (current.amount - start.amount) / monthsDiff : 0;

  const remaining = target.amount - current.amount;
  const monthsToTarget = avgGrowth > 0 ? Math.ceil(remaining / avgGrowth) : 0;

  return [
    {
      label: "Стартовая позиция",
      value: `${formatCurrency(start.amount)} (${getMonthName(start.month)} ${
        start.year
      })`,
      class: "",
    },
    {
      label: "Текущая позиция",
      value: `${formatCurrency(current.amount)} (${getMonthName(
        current.month
      )} ${current.year})`,
      class: "",
    },
    {
      label: "Целевая зарплата",
      value: `${formatCurrency(target.amount)} (${target.label})`,
      class: "highlight",
    },
    {
      label: "Средний рост в месяц",
      value: avgGrowth > 0 ? `+${formatCurrency(avgGrowth)}` : "—",
      class: avgGrowth > 0 ? "positive" : "",
    },
    {
      label: "До цели осталось",
      value:
        remaining > 0
          ? `${formatCurrency(remaining)} (${monthsToTarget} мес.)`
          : "Цель достигнута!",
      class: "",
    },
  ];
});

// Computed - Данные для графика
const chartData = computed(() => {
  const labels = [];
  const factData = [];
  const nearPlanData = [];
  const distPlanData = [];

  // Добавляем факты
  factsByMonth.value.forEach((f) => {
    const label = `${getMonthName(f.month)} ${f.year}`;
    labels.push(label);
    factData.push(f.amount);
    nearPlanData.push(null);
    distPlanData.push(null);
  });

  // Добавляем ближайший план
  if (targetSalary.value.amount > 0) {
    const targetLabel = targetSalary.value.label;
    if (!labels.includes(targetLabel)) {
      labels.push(targetLabel);
      factData.push(null);
      nearPlanData.push(targetSalary.value.amount);
      distPlanData.push(null);
    } else {
      const idx = labels.indexOf(targetLabel);
      nearPlanData[idx] = targetSalary.value.amount;
    }
  }

  // Добавляем дальний план
  if (distantPlan.value) {
    const distLabel = `${getMonthName(distantPlan.value.month)} ${
      distantPlan.value.year
    }`;
    if (!labels.includes(distLabel)) {
      labels.push(distLabel);
      factData.push(null);
      nearPlanData.push(null);
      distPlanData.push(distantPlan.value.amount);
    } else {
      const idx = labels.indexOf(distLabel);
      distPlanData[idx] = distantPlan.value.amount;
    }
  }

  return {
    labels,
    datasets: [
      {
        label: "Зарплата (факт)",
        data: factData,
        borderColor: "#ff66cc",
        backgroundColor: "rgba(255,102,204,0.2)",
        tension: 0.4,
        fill: true,
        pointRadius: 6,
        pointBackgroundColor: "#ff99dd",
        spanGaps: false,
      },
      {
        label: "План (ближайший)",
        data: nearPlanData,
        borderColor: "#1767FD",
        backgroundColor: "rgba(23, 103, 253, 0.1)",
        tension: 0.4,
        fill: false,
        pointRadius: 6,
        pointBackgroundColor: "#3F52FF",
        borderDash: [5, 5],
        spanGaps: true,
      },
      {
        label: "План (дальний)",
        data: distPlanData,
        borderColor: "rgba(23, 103, 253, 0.5)",
        backgroundColor: "rgba(23, 103, 253, 0.05)",
        tension: 0.4,
        fill: false,
        pointRadius: 6,
        pointBackgroundColor: "rgba(63, 82, 255, 0.5)",
        borderDash: [5, 5],
        spanGaps: true,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: "index",
    intersect: false,
  },
  plugins: {
    legend: {
      display: true,
      labels: {
        color: "#fff",
        font: { size: 12 },
        filter: (item) => {
          // Скрываем дальний план если его нет
          if (item.text === "План (дальний)" && !distantPlan.value)
            return false;
          return true;
        },
      },
    },
    title: { display: false },
    tooltip: {
      callbacks: {
        afterBody: (context) => {
          const dataIndex = context[0].dataIndex;
          const monthData = factsByMonth.value[dataIndex];
          if (monthData && monthData.jobs.length > 1) {
            const breakdown = monthData.jobs.map(
              (j) => `  ${j.jobName}: ${formatCurrency(j.amount)}`
            );
            return ["\nРазбивка по работам:", ...breakdown];
          }
          return "";
        },
      },
    },
  },
  scales: {
    x: {
      ticks: { color: "#bbb", font: { size: 11 } },
      grid: { color: "rgba(255,255,255,0.1)" },
    },
    y: {
      ticks: {
        color: "#bbb",
        font: { size: 11 },
        callback: function (value) {
          return formatCurrency(value);
        },
      },
      grid: { color: "rgba(255,255,255,0.1)" },
    },
  },
};

// Methods
function formatCurrency(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function getMonthName(month) {
  const months = [
    "Янв",
    "Фев",
    "Мар",
    "Апр",
    "Май",
    "Июн",
    "Июл",
    "Авг",
    "Сен",
    "Окт",
    "Ноя",
    "Дек",
  ];
  return months[month - 1] || "";
}

function formatTaskDeadline(dateString) {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleDateString("ru-RU", { month: "long" });
  const year = date.getFullYear();
  return `До ${day} ${month} ${year}`;
}

function toggleCurrentBreakdown() {
  showCurrentBreakdown.value = !showCurrentBreakdown.value;
}

function selectPeriod(period) {
  selectedPeriod.value = period;
}

// Управление работами
function openJobForm(job = null) {
  editingJob.value = job;
  if (job) {
    jobForm.value = { ...job };
  } else {
    jobForm.value = { name: "", position: "", color: "#E86CFF" };
  }
  showJobFormModal.value = true;
}

function closeJobForm() {
  showJobFormModal.value = false;
  editingJob.value = null;
  jobForm.value = { name: "", position: "", color: "#E86CFF" };
}

function saveJob() {
  if (editingJob.value) {
    const index = jobs.value.findIndex((j) => j.id === editingJob.value.id);
    jobs.value[index] = {
      ...jobForm.value,
      id: editingJob.value.id,
      isActive: editingJob.value.isActive,
    };
  } else {
    const newJob = { ...jobForm.value, id: Date.now(), isActive: true };
    jobs.value.push(newJob);
  }
  closeJobForm();
}

function archiveJob(jobId) {
  const job = jobs.value.find((j) => j.id === jobId);
  if (job) job.isActive = false;
}

function restoreJob(jobId) {
  const job = jobs.value.find((j) => j.id === jobId);
  if (job) job.isActive = true;
}

// Добавление данных о зарплате
function addSalaryData() {
  salaryDataError.value = "";

  // Валидация
  if (newSalaryData.value.type === "fact" && !newSalaryData.value.jobId) {
    salaryDataError.value = "Для фактической записи необходимо выбрать работу";
    return;
  }

  if (
    !newSalaryData.value.year ||
    !newSalaryData.value.month ||
    !newSalaryData.value.amount
  ) {
    salaryDataError.value = "Заполните все обязательные поля";
    return;
  }

  const newEntry = {
    id: Date.now(),
    type: newSalaryData.value.type,
    year: newSalaryData.value.year,
    month: newSalaryData.value.month,
    amount: newSalaryData.value.amount,
  };

  if (newSalaryData.value.type === "fact") {
    newEntry.jobId = newSalaryData.value.jobId;
  }

  if (newSalaryData.value.note) {
    newEntry.note = newSalaryData.value.note;
  }

  salaries.value.push(newEntry);
  salaries.value.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  showAddDataModal.value = false;
  newSalaryData.value = {
    type: "fact",
    jobId: "",
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    amount: "",
    note: "",
  };
}

// Управление задачами
function editTask(task) {
  editingTask.value = task;
  taskForm.value = { ...task };
  showAddTaskModal.value = true;
}

function closeTaskModal() {
  showAddTaskModal.value = false;
  editingTask.value = null;
  taskForm.value = {
    icon: "",
    name: "",
    deadline: "",
    description: "",
    progress: 0,
    completed: false,
  };
}

function saveTask() {
  if (editingTask.value) {
    const index = globalTasks.value.findIndex(
      (t) => t.id === editingTask.value.id
    );
    globalTasks.value[index] = { ...taskForm.value, id: editingTask.value.id };
  } else {
    const newTask = { ...taskForm.value, id: Date.now() };
    globalTasks.value.push(newTask);
  }
  closeTaskModal();
}

function deleteTask() {
  if (confirm("Вы уверены, что хотите удалить эту задачу?")) {
    globalTasks.value = globalTasks.value.filter(
      (t) => t.id !== editingTask.value.id
    );
    closeTaskModal();
  }
}

onMounted(() => {
  // Инициализация
});
</script>

<style scoped>
.window-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background-color: #111;
  border-bottom: 1px solid #fff1;
}

.tabs {
  display: flex;
  gap: 8px;
}

.tab {
  padding: 8px 20px;
  background-color: transparent;
  border: 1px solid #fff2;
  border-radius: 8px;
  color: #999;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.tab:hover {
  border-color: #fff3;
  color: #fff;
}

.tab.active {
  background-color: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

.window-main {
  position: fixed;
  display: flex;
  width: 90%;
  height: 90%;
  border-radius: 25px;
  z-index: 1000;
  top: 5%;
  left: 5%;
  overflow: hidden;
}

.window-container {
  width: 100%;
  height: 100%;
  background-color: #11111194;
  backdrop-filter: blur(10px);
}

.window-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 16px 20px;
  background-color: #111;
}

.close-button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background-color: #2a2a2a9f;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-button:hover {
  background-color: #ff4444;
  transform: scale(1.05);
}

.close-button:active {
  transform: scale(0.95);
}

.window-content {
  display: flex;
  height: calc(100% - 64px);
  overflow: hidden;
}

.content-left {
  flex: 3;
  padding: 20px;
  overflow-y: auto;
  border-right: 1px solid #fff2;
}

.content-right {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background-color: #0a0a0a80;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  letter-spacing: 0.02em;
}

.header-with-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.controls-group {
  display: flex;
  gap: 12px;
  align-items: center;
}

.manage-jobs-btn {
  padding: 8px 16px;
  background-color: #2a2a2a;
  color: #fff;
  border: 1px solid #fff2;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.manage-jobs-btn:hover {
  background-color: #3a3a3a;
  border-color: #fff3;
}

.period-selector {
  display: flex;
  gap: 8px;
}

.period-btn {
  padding: 6px 14px;
  border: 1px solid #fff2;
  background-color: #1a1a1a;
  color: #999;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.period-btn:hover {
  border-color: #fff3;
  color: #fff;
}

.period-btn.active {
  background-color: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

.current-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.info-card {
  background-color: #1a1a1a;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #fff1;
  position: relative;
}

.info-card.expandable {
  cursor: pointer;
  transition: all 0.2s ease;
}

.info-card.expandable:hover {
  border-color: #fff3;
}

.info-label {
  font-size: 11px;
  color: #999;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}

.info-value.highlight {
  color: #1767fd;
}

.info-value.positive {
  color: #4ade80;
}

.info-date {
  font-size: 12px;
  color: #666;
}

.expand-icon {
  position: absolute;
  top: 16px;
  right: 16px;
  font-size: 12px;
  color: #666;
  transition: transform 0.2s ease;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.breakdown-list {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #fff1;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.breakdown-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.breakdown-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.breakdown-name {
  font-size: 13px;
  color: #bbb;
}

.breakdown-amount {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.no-data {
  font-size: 12px;
  color: #666;
  text-align: center;
  padding: 12px 0;
}

.chart-section {
  margin-bottom: 30px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.add-data-btn {
  padding: 8px 16px;
  background-color: #1767fd;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.add-data-btn:hover {
  background-color: #1557dd;
  transform: scale(1.05);
}

.chart-wrapper {
  background-color: #1a1a1a;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #fff1;
  height: 300px;
}

.detailed-stats {
  background-color: #1a1a1a;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #fff1;
  margin-bottom: 30px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #fff1;
}

.stat-row:last-child {
  border-bottom: none;
}

.stat-label {
  font-size: 13px;
  color: #999;
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.stat-value.highlight {
  color: #1767fd;
}

.stat-value.positive {
  color: #4ade80;
}

.progress-section {
  background-color: #1a1a1a;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #fff1;
}

.progress-bar-container {
  width: 100%;
  height: 24px;
  background-color: #0a0a0a;
  border-radius: 12px;
  overflow: hidden;
  margin: 15px 0 10px 0;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #ff66cc, #1767fd);
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #999;
}

.global-tasks-section {
  height: 100%;
}

.tasks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.add-task-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 18px;
  border-radius: 50%;
  background-color: #1767fd;
  color: #fff;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-task-btn:hover {
  background-color: #1557dd;
  transform: scale(1.05);
}

.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.task-item {
  background-color: #1a1a1a;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #fff1;
  transition: all 0.2s ease;
}

.task-item:hover {
  border-color: #fff3;
  transform: translateY(-2px);
}

.task-item.completed {
  opacity: 0.6;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.task-icon {
  font-size: 24px;
}

.task-info {
  flex: 1;
}

.task-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.task-deadline {
  font-size: 11px;
  color: #999;
}

.task-edit-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.task-item:hover .task-edit-btn {
  opacity: 1;
}

.task-description {
  font-size: 12px;
  color: #bbb;
  line-height: 1.5;
  margin-bottom: 12px;
}

.task-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.task-progress-bar {
  flex: 1;
  height: 6px;
  background-color: #0a0a0a;
  border-radius: 3px;
  overflow: hidden;
}

.task-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff66cc, #1767fd);
  transition: width 0.3s ease;
}

.task-progress-text {
  font-size: 11px;
  font-weight: 600;
  color: #999;
  min-width: 35px;
  text-align: right;
}

/* Модальные окна */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal {
  background-color: #1a1a1a;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  border: 1px solid #fff2;
  max-height: 90vh;
  overflow-y: auto;
}

.modal.large-modal {
  max-width: 700px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #fff1;
  position: sticky;
  top: 0;
  background-color: #1a1a1a;
  z-index: 1;
}

.modal-header h3 {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.modal-close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background-color: #2a2a2a;
  color: #fff;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background-color: #ff4444;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  color: #999;
  font-size: 13px;
  margin-bottom: 6px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  background-color: #0a0a0a;
  border: 1px solid #fff2;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #1767fd;
}

.color-picker {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-picker input[type="color"] {
  width: 60px;
  height: 40px;
  border: none;
  cursor: pointer;
}

.color-value {
  font-size: 13px;
  color: #bbb;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: auto;
  cursor: pointer;
}

.error-message {
  color: #ff4444;
  font-size: 13px;
  margin-top: 8px;
  padding: 8px 12px;
  background-color: rgba(255, 68, 68, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(255, 68, 68, 0.3);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 1px solid #fff1;
  position: sticky;
  bottom: 0;
  background-color: #1a1a1a;
}

.btn-cancel,
.btn-save,
.btn-delete,
.btn-add-job {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-cancel {
  background-color: #2a2a2a;
  color: #fff;
}

.btn-cancel:hover {
  background-color: #3a3a3a;
}

.btn-save {
  background-color: #1767fd;
  color: #fff;
}

.btn-save:hover {
  background-color: #1557dd;
}

.btn-delete {
  background-color: #ff4444;
  color: #fff;
  margin-right: auto;
}

.btn-delete:hover {
  background-color: #dd3333;
}

.btn-add-job {
  width: 100%;
  background-color: #1767fd;
  color: #fff;
  margin-bottom: 20px;
}

.btn-add-job:hover {
  background-color: #1557dd;
}

/* Управление работами */
.jobs-section {
  margin-bottom: 24px;
}

.jobs-section h4 {
  font-size: 14px;
  color: #999;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.job-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: #0a0a0a;
  border-radius: 8px;
  border: 1px solid #fff1;
}

.job-item.archived {
  opacity: 0.6;
}

.job-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.job-info {
  flex: 1;
}

.job-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 2px;
}

.job-position {
  font-size: 12px;
  color: #999;
}

.job-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border: none;
  background-color: #2a2a2a;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.btn-icon:hover {
  background-color: #3a3a3a;
  transform: scale(1.05);
}

/* Scrollbar styles */
.content-left::-webkit-scrollbar,
.content-right::-webkit-scrollbar,
.modal::-webkit-scrollbar {
  width: 6px;
}

.content-left::-webkit-scrollbar-track,
.content-right::-webkit-scrollbar-track,
.modal::-webkit-scrollbar-track {
  background: transparent;
}

.content-left::-webkit-scrollbar-thumb,
.content-right::-webkit-scrollbar-thumb,
.modal::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

.content-left::-webkit-scrollbar-thumb:hover,
.content-right::-webkit-scrollbar-thumb:hover,
.modal::-webkit-scrollbar-thumb:hover {
  background: #444;
}
</style>
