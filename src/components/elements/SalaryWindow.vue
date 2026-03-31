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
        </div>
        <button class="close-button" @click="handleClose">✕</button>
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
                  <button
                    class="manage-jobs-btn"
                    @click="showManageSalariesModal = true"
                  >
                    💰 Управление данными
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
                  <div class="info-label">Путь самурая</div>

                  <select v-model="selectedSamuraiPlanId" class="plan-select">
                    <option :value="null">Авто (ближайший)</option>
                    <option
                      v-for="plan in allPlans"
                      :key="plan.id || plan.label"
                      :value="plan.id"
                    >
                      {{ plan.label }} — {{ formatCurrency(plan.amount) }}
                    </option>
                  </select>

                  <div class="info-value highlight">
                    {{ formatCurrency(selectedSamuraiPlan.amount) }}
                  </div>
                  <div class="info-date">{{ selectedSamuraiPlan.label }}</div>
                </div>

                <div class="info-card">
                  <div class="info-label">Рост за период</div>
                  <div
                    class="info-value"
                    :class="growthPercent >= 0 ? 'positive' : 'negative'"
                  >
                    {{ growthPercent >= 0 ? "+" : "" }}{{ growthPercent }}%
                  </div>
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
              <div
                class="progress-section"
                v-if="selectedSamuraiPlan.amount > 0"
              >
                <h3 class="chart-title">Прогресс к ближайшей цели</h3>
                <div class="progress-bar-container">
                  <div
                    class="progress-bar"
                    :style="{ width: progressPercent + '%' }"
                  ></div>
                </div>
                <div class="progress-info">
                  <span
                    >{{ progressPercent }}%
                    {{ progressPercent >= 100 ? "выполнено" : "до цели" }}</span
                  >
                  <span v-if="progressPercent < 100"
                    >{{ 100 - progressPercent }}% осталось</span
                  >
                </div>
              </div>

              <!-- Список всех планов -->
              <div class="detailed-stats" v-if="allPlans.length > 0">
                <h3 class="chart-title">Запланированные цели</h3>
                <div
                  class="stat-row"
                  v-for="(plan, index) in allPlans"
                  :key="index"
                >
                  <span class="stat-label"> {{ plan.label }}: </span>
                  <span class="stat-value highlight">{{
                    formatCurrency(plan.amount)
                  }}</span>
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
                <div v-if="globalTasks.length === 0" class="no-tasks">
                  Нет глобальных задач
                </div>
              </div>
            </div>
          </div>
        </template>

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

    <!-- Модальное окно управления данными о зарплате -->
    <div
      v-if="showManageSalariesModal"
      class="modal-overlay"
      @click="showManageSalariesModal = false"
    >
      <div class="modal large-modal" @click.stop>
        <div class="modal-header">
          <h3>Управление данными о зарплате</h3>
          <button class="modal-close" @click="showManageSalariesModal = false">
            ✕
          </button>
        </div>
        <div class="modal-body">
          <button class="btn-add-job" @click="showAddDataModal = true">
            + Добавить запись
          </button>

          <div class="salaries-filters">
            <select v-model="salaryFilter" class="filter-select">
              <option value="all">Все записи</option>
              <option value="fact">Только факты</option>
              <option value="plan">Только планы</option>
            </select>
          </div>

          <div class="salaries-list">
            <div
              v-for="salary in filteredSalariesForManagement"
              :key="salary.id"
              class="salary-item"
            >
              <div class="salary-main">
                <div class="salary-badge" :class="salary.type">
                  {{ salary.type === "fact" ? "ФАКТ" : "ПЛАН" }}
                </div>
                <div class="salary-info">
                  <div class="salary-period">
                    {{ getMonthName(salary.month) }} {{ salary.year }}
                  </div>
                  <div class="salary-job" v-if="salary.type === 'fact'">
                    {{ getJobName(salary.jobId) }}
                  </div>
                </div>
                <div class="salary-amount">
                  {{ formatCurrency(salary.amount) }}
                </div>
                <div class="salary-actions">
                  <button class="btn-icon" @click="editSalary(salary)">
                    ✏️
                  </button>
                  <button class="btn-icon" @click="deleteSalaryData(salary.id)">
                    🗑️
                  </button>
                </div>
              </div>
              <div v-if="salary.note" class="salary-note">
                {{ salary.note }}
              </div>
            </div>
            <div
              v-if="filteredSalariesForManagement.length === 0"
              class="no-data"
            >
              Нет записей
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

    <!-- Модальное окно добавления/редактирования данных зарплаты -->
    <div
      v-if="showAddDataModal"
      class="modal-overlay"
      @click="showAddDataModal = false"
    >
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>
            {{
              editingSalary
                ? "Редактировать запись"
                : "Добавить данные о зарплате"
            }}
          </h3>
          <button class="modal-close" @click="closeAddDataModal">✕</button>
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
          <button class="btn-cancel" @click="closeAddDataModal">Отмена</button>
          <button class="btn-save" @click="saveSalaryData">Сохранить</button>
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
            <input v-model="taskForm.end" type="date" />
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
import { ref, computed, onMounted, watch } from "vue";
import { Line } from "vue-chartjs";
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

import {
  fetchJobs,
  addJobAPI,
  updateJobAPI,
  deleteJobAPI,
  deleteTaskAPI,
  addTaskAPI,
  fetchSalaries,
  addSalaryAPI,
  updateSalaryAPI,
  deleteSalaryAPI,
  fetchGlobalTasks,
} from "../api";

import { getTaskIcon, calculateTaskProgress } from "@/utils/taskUtils";

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale
);

const emit = defineEmits(["close"]);

// Текущая активная вкладка
const currentTab = ref("finance");
const selectedSamuraiPlan = ref({
  amount: 0,
  label: "Не выбран",
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
});
const selectedSamuraiPlanId = ref(null);

watch(selectedSamuraiPlanId, (newId) => {
  if (newId) {
    const plan = allPlans.value.find((p) => p.id === newId);
    if (plan) {
      selectedSamuraiPlan.value = plan;
      localStorage.setItem("selectedSamuraiPlan", JSON.stringify(plan));
    }
  } else {
    // авто режим — ближайший
    selectedSamuraiPlan.value = nearestPlan.value;
    localStorage.removeItem("selectedSamuraiPlan");
  }
});

// Состояния модальных окон
const showManageJobsModal = ref(false);
const showManageSalariesModal = ref(false);
const showJobFormModal = ref(false);
const showAddDataModal = ref(false);
const showAddTaskModal = ref(false);
const showCurrentBreakdown = ref(false);
const editingJob = ref(null);
const editingSalary = ref(null);
const editingTask = ref(null);
const salaryDataError = ref("");
const salaryFilter = ref("all");

// Периоды для фильтрации
const periods = [
  { label: "3 мес", value: "3m" },
  { label: "6 мес", value: "6m" },
  { label: "1 год", value: "1y" },
  { label: "Все", value: "all" },
];
const selectedPeriod = ref("all");

// Данные
const jobs = ref([]);
const salaries = ref([]);

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

// Computed - Фильтрация для модального окна управления
const filteredSalariesForManagement = computed(() => {
  let filtered = [...salaries.value];

  if (salaryFilter.value !== "all") {
    filtered = filtered.filter((s) => s.type === salaryFilter.value);
  }

  return filtered.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
});

// Computed - Текущий месяц
const currentMonthLabel = computed(() => {
  const now = new Date();
  return getMonthName(now.getMonth() + 1) + " " + now.getFullYear();
});

// Computed - Текущая зарплата (ИСПРАВЛЕНО)
const currentSalary = computed(() => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Берём все фактические записи
  const allFacts = salaries.value.filter((s) => s.type === "fact");

  if (allFacts.length === 0) {
    return { total: 0, breakdown: [] };
  }

  // Ищем запись за текущий месяц
  let selectedYear = currentYear;
  let selectedMonth = currentMonth;

  // Проверяем, есть ли факт за текущий месяц
  const hasCurrent = allFacts.some(
    (s) => s.year === currentYear && s.month === currentMonth
  );

  if (!hasCurrent) {
    // Если нет — ищем ближайший предыдущий месяц с данными
    const sortedFacts = [...allFacts].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    const previous = sortedFacts.find(
      (s) =>
        s.year < currentYear ||
        (s.year === currentYear && s.month < currentMonth)
    );

    if (previous) {
      selectedYear = previous.year;
      selectedMonth = previous.month;
    } else {
      // fallback — если ничего нет до этого
      const latest = sortedFacts[0];
      selectedYear = latest.year;
      selectedMonth = latest.month;
    }
  }

  // Берём все фактические записи за найденный месяц
  const currentFacts = allFacts.filter(
    (s) => s.year === selectedYear && s.month === selectedMonth
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

  return { total, breakdown, year: selectedYear, month: selectedMonth };
});

// Computed - Все планы (отсортированные по дате)
const allPlans = computed(() => {
  const now = new Date();
  return salaries.value
    .filter((s) => s.type === "plan")
    .map((p) => ({
      ...p,
      label: `${getMonthName(p.month)} ${p.year}`,
      date: new Date(p.year, p.month - 1),
    }))
    .sort((a, b) => a.date - b.date);
});

// Computed - Ближайший план
const nearestPlan = computed(() => {
  const now = new Date();
  const futurePlans = allPlans.value.filter((p) => p.date >= now);

  if (futurePlans.length > 0) {
    return futurePlans[0];
  }

  // Если нет будущих планов, берем последний план
  if (allPlans.value.length > 0) {
    return allPlans.value[allPlans.value.length - 1];
  }

  return {
    amount: 0,
    label: "Не установлен",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
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
  if (first === 0) return 0;
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
  if (factsByMonth.value.length === 0 || selectedSamuraiPlan.value.amount === 0)
    return 0;

  const current =
    currentSalary.value.total > 0
      ? currentSalary.value.total
      : factsByMonth.value.length > 0
      ? factsByMonth.value[factsByMonth.value.length - 1].amount
      : 0;

  const start =
    factsByMonth.value.length > 0 ? factsByMonth.value[0].amount : 0;
  const target = selectedSamuraiPlan.value.amount;

  // Если план меньше стартовой позиции (случай уменьшения зарплаты)
  if (target < start) {
    if (current <= target) return 100;
    return Math.max(
      0,
      Math.round(((start - current) / (start - target)) * 100)
    );
  }

  // Если план больше стартовой позиции (обычный случай роста)
  if (target <= start) return 100;
  return Math.min(
    100,
    Math.max(0, Math.round(((current - start) / (target - start)) * 100))
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
  const nearest = selectedSamuraiPlan.value;

  const monthsDiff =
    facts.length > 1
      ? (current.year - start.year) * 12 + (current.month - start.month)
      : 1;
  const avgGrowth =
    monthsDiff > 0 ? (current.amount - start.amount) / monthsDiff : 0;

  const remaining = nearest.amount - current.amount;
  const monthsToTarget = avgGrowth > 0 ? Math.ceil(remaining / avgGrowth) : 0;

  const stats = [
    {
      label: "Стартовая позиция",
      value: `${formatCurrency(start.amount)} (${getMonthName(start.month)} ${
        start.year
      })`,
      class: "",
    },
    {
      label: "Текущая позиция",
      value: `${formatCurrency(
        currentSalary.value.total > 0
          ? currentSalary.value.total
          : current.amount
      )} (${currentMonthLabel.value})`,
      class: "",
    },
  ];

  if (nearest.amount > 0) {
    stats.push({
      label: "Желаемая цель",
      value: `${formatCurrency(nearest.amount)} (${nearest.label})`,
      class: "highlight",
    });
  }

  stats.push({
    label: "Средний рост в месяц",
    value:
      avgGrowth !== 0
        ? `${avgGrowth > 0 ? "+" : ""}${formatCurrency(Math.abs(avgGrowth))}`
        : "—",
    class: avgGrowth > 0 ? "positive" : avgGrowth < 0 ? "negative" : "",
  });

  if (nearest.amount > 0 && remaining !== 0) {
    stats.push({
      label: remaining > 0 ? "До цели осталось" : "Цель превышена на",
      value:
        remaining > 0
          ? `${formatCurrency(remaining)}${
              monthsToTarget > 0 ? ` (~${monthsToTarget} мес.)` : ""
            }`
          : formatCurrency(Math.abs(remaining)),
      class: remaining > 0 ? "" : "positive",
    });
  }

  return stats;
});

const chartData = computed(() => {
  const dataPoints = [];

  // Добавляем факты
  factsByMonth.value.forEach((f) => {
    dataPoints.push({
      date: new Date(f.year, f.month - 1),
      label: `${getMonthName(f.month)} ${f.year}`,
      fact: f.amount,
      plan: null,
      jobs: f.jobs,
    });
  });

  // Добавляем планы
  allPlans.value.forEach((p) => {
    const label = p.label;
    const existing = dataPoints.find((dp) => dp.label === label);

    if (existing) {
      existing.plan = p.amount;
    } else {
      dataPoints.push({
        date: p.date,
        label: label,
        fact: null,
        plan: p.amount,
        jobs: [],
      });
    }
  });

  // Сортируем по дате
  dataPoints.sort((a, b) => a.date - b.date);

  // Формируем данные для Chart.js
  const labels = dataPoints.map((dp) => dp.label);
  const factData = dataPoints.map((dp) => dp.fact);
  const planData = dataPoints.map((dp) => dp.plan);

  // Определяем цвета для разных планов
  const planColors = [
    "#1767FD", // Первый план (ближайший)
    "#3F52FF", // Второй план
    "rgba(23, 103, 253, 0.6)", // Третий план
    "rgba(63, 82, 255, 0.5)", // Четвертый план
  ];

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
      },
      {
        label: "Планы",
        data: planData,
        borderColor: "#1767FD",
        backgroundColor: "rgba(23, 103, 253, 0.1)",
        tension: 0.4,
        fill: false,
        pointRadius: 8,
        pointBackgroundColor: planData.map((val, idx) => {
          if (val === null) return "transparent";
          const planIndex = allPlans.value.findIndex(
            (p) => dataPoints[idx] && p.label === dataPoints[idx].label
          );
          return planColors[planIndex % planColors.length];
        }),
        pointBorderColor: "#1767FD",
        pointBorderWidth: 2,
        borderDash: [5, 5],
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  showTooltips: true,
  spanGaps: true,
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

function getJobName(jobId) {
  const job = jobs.value.find((j) => j.id === jobId);
  return job ? `${job.name} - ${job.position}` : "Не указано";
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

async function saveJob() {
  try {
    if (editingJob.value) {
      const updatedJob = {
        ...jobForm.value,
        id: editingJob.value.id,
        isActive: editingJob.value.isActive,
      };
      await updateJobAPI(updatedJob);
      const index = jobs.value.findIndex((j) => j.id === editingJob.value.id);
      jobs.value[index] = updatedJob;
    } else {
      const newJob = { ...jobForm.value, isActive: true };
      const addedJob = await addJobAPI(newJob);
      jobs.value.push(addedJob);
    }
    closeJobForm();
  } catch (error) {
    console.error("Ошибка сохранения работы:", error);
    alert("Не удалось сохранить работу");
  }
}

async function archiveJob(jobId) {
  try {
    const job = jobs.value.find((j) => j.id === jobId);
    if (job) {
      const updatedJob = { ...job, isActive: false };
      await updateJobAPI(updatedJob);
      job.isActive = false;
    }
  } catch (error) {
    console.error("Ошибка архивации работы:", error);
    alert("Не удалось архивировать работу");
  }
}

async function restoreJob(jobId) {
  try {
    const job = jobs.value.find((j) => j.id === jobId);
    if (job) {
      const updatedJob = { ...job, isActive: true };
      await updateJobAPI(updatedJob);
      job.isActive = true;
    }
  } catch (error) {
    console.error("Ошибка восстановления работы:", error);
    alert("Не удалось восстановить работу");
  }
}

function handleClose() {
  localStorage.setItem("financeWindowOpen", "false");
  emit("close");
}

// Управление данными о зарплате
function editSalary(salary) {
  editingSalary.value = salary;
  newSalaryData.value = {
    type: salary.type,
    jobId: salary.jobId || "",
    year: salary.year,
    month: salary.month,
    amount: salary.amount,
    note: salary.note || "",
  };
  showManageSalariesModal.value = false;
  showAddDataModal.value = true;
}

function closeAddDataModal() {
  showAddDataModal.value = false;
  editingSalary.value = null;
  salaryDataError.value = "";
  newSalaryData.value = {
    type: "fact",
    jobId: "",
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    amount: "",
    note: "",
  };
}

async function saveSalaryData() {
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

  try {
    const salaryData = {
      type: newSalaryData.value.type,
      year: newSalaryData.value.year,
      month: newSalaryData.value.month,
      amount: newSalaryData.value.amount,
    };

    if (newSalaryData.value.type === "fact") {
      salaryData.jobId = newSalaryData.value.jobId;
    }

    if (newSalaryData.value.note) {
      salaryData.note = newSalaryData.value.note;
    }

    if (editingSalary.value) {
      // Редактирование существующей записи
      salaryData.id = editingSalary.value.id;
      await updateSalaryAPI(salaryData.id, salaryData);
      const index = salaries.value.findIndex(
        (s) => s.id === editingSalary.value.id
      );
      salaries.value[index] = salaryData;
    } else {
      // Добавление новой записи
      const addedSalary = await addSalaryAPI(salaryData);
      salaries.value.push(addedSalary);
    }

    salaries.value.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    closeAddDataModal();
  } catch (error) {
    console.error("Ошибка сохранения данных о зарплате:", error);
    salaryDataError.value = "Не удалось сохранить данные";
  }
}

async function deleteSalaryData(salaryId) {
  if (!confirm("Вы уверены, что хотите удалить эту запись?")) {
    return;
  }

  try {
    await deleteSalaryAPI(salaryId);
    salaries.value = salaries.value.filter((s) => s.id !== salaryId);
  } catch (error) {
    console.error("Ошибка удаления данных о зарплате:", error);
    alert("Не удалось удалить запись");
  }
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

async function saveTask() {
  if (editingTask.value) {
    const index = globalTasks.value.findIndex(
      (t) => t.id === editingTask.value.id
    );
    globalTasks.value[index] = { ...taskForm.value, id: editingTask.value.id };
  } else {
    const newTask = {
      isGlobal: true,
      sticker: taskForm.value.icon,
      title: taskForm.value.name,
      end: taskForm.value.end
        ? new Date(taskForm.value.end).toISOString()
        : null,
      description: taskForm.value.description,
    };

    console.log(newTask);
    await addTaskAPI(newTask);
    globalTasks.value.push(newTask);
  }
  closeTaskModal();
}

async function deleteTask() {
  if (confirm("Вы уверены, что хотите удалить эту задачу?")) {
    globalTasks.value = globalTasks.value.filter(
      (t) => t.id !== editingTask.value.id
    );
    await deleteTaskAPI(editingTask.value.id);
    closeTaskModal();
  }
}

onMounted(async () => {
  localStorage.setItem("financeWindowOpen", "true");

  try {
    jobs.value = await fetchJobs();
    salaries.value = await fetchSalaries();
    globalTasks.value = await fetchGlobalTasks();

    globalTasks.value = globalTasks.value.map((task) => ({
      id: task.id,
      name: task.title,
      icon: getTaskIcon(task),
      deadline: task.end,
      description: task.description || "",
      progress: calculateTaskProgress(task),
      completed: task.done,
      // Дополнительные поля для детализации
      totalSubtasks: task.totalSubtasks,
      completedSubtasks: task.completedSubtasks,
      start: task.start,
      end: task.end,
    }));

    const saved = localStorage.getItem("selectedSamuraiPlan");
    if (saved) {
      const parsed = JSON.parse(saved);
      selectedSamuraiPlan.value = parsed;
      const match = allPlans.value.find((p) => p.id === parsed.id);
      selectedSamuraiPlanId.value = match ? match.id : null;
    } else {
      selectedSamuraiPlan.value = nearestPlan.value;
    }
  } catch (error) {
    console.error("Ошибка загрузки данных:", error);
  }
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
  justify-content: space-between;
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

.info-value.negative {
  color: #ff6b6b;
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

.stat-value.negative {
  color: #ff6b6b;
}

.progress-section {
  background-color: #1a1a1a;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #fff1;
  margin-bottom: 30px;
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

/* Управление зарплатами */
.salaries-filters {
  margin-bottom: 16px;
}

.filter-select {
  width: 100%;
  padding: 10px 12px;
  background-color: #0a0a0a;
  border: 1px solid #fff2;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: #1767fd;
}

.salaries-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 500px;
  overflow-y: auto;
}

.salary-item {
  background-color: #0a0a0a;
  border-radius: 8px;
  border: 1px solid #fff1;
  padding: 12px;
}

.salary-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.salary-badge {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.plan-select {
  width: 100%;
  padding: 6px 10px;
  background-color: #1a1a1a;
  border: 1px solid #fff2;
  transition: all 0.2s ease;
  color: #fff;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 8px;
  cursor: pointer;
}

/* При наведении */
.plan-select:hover {
  border-color: #1767fd;
}

/* При фокусе или открытии */
.plan-select:focus,
.plan-select:focus-visible {
  border-color: #1767fd;
  box-shadow: 0 0 0 2px rgba(23, 103, 253, 0.2); /* мягкое сияние */
  outline: none; /* убираем стандартный outline */
}

.salary-badge.fact {
  background-color: rgba(255, 102, 204, 0.2);
  color: #ff66cc;
}

.salary-badge.plan {
  background-color: rgba(23, 103, 253, 0.2);
  color: #1767fd;
}

.salary-info {
  flex: 1;
}

.salary-period {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 2px;
}

.salary-job {
  font-size: 12px;
  color: #999;
}

.salary-amount {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  margin-right: 12px;
}

.salary-actions {
  display: flex;
  gap: 8px;
}

.salary-note {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #fff1;
  font-size: 12px;
  color: #bbb;
  font-style: italic;
}

/* Scrollbar styles */
.content-left::-webkit-scrollbar,
.content-right::-webkit-scrollbar,
.modal::-webkit-scrollbar,
.salaries-list::-webkit-scrollbar {
  width: 6px;
}

.content-left::-webkit-scrollbar-track,
.content-right::-webkit-scrollbar-track,
.modal::-webkit-scrollbar-track,
.salaries-list::-webkit-scrollbar-track {
  background: transparent;
}

.content-left::-webkit-scrollbar-thumb,
.content-right::-webkit-scrollbar-thumb,
.modal::-webkit-scrollbar-thumb,
.salaries-list::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

.content-left::-webkit-scrollbar-thumb:hover,
.content-right::-webkit-scrollbar-thumb:hover,
.modal::-webkit-scrollbar-thumb:hover,
.salaries-list::-webkit-scrollbar-thumb:hover {
  background: #444;
}
</style>
