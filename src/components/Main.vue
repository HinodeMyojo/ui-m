<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import confetti from "canvas-confetti";
import {
  fetchTasks,
  addTaskAPI,
  deleteTaskAPI,
  updateTaskAPI,
  fetchTask,
} from "./api.js";
import { useRouter } from "vue-router";

import TaskDetails from "@/components/modals/TaskDetails.vue";

let idCounter = 5;

const tasks = ref([]);

async function loadTasks() {
  tasks.value = (await fetchTasks()).map((t) => ({
    ...t,
    start: DateToRealUtc(t.start),
    end: DateToRealUtc(t.end),
    // start: new Date(2025, 5, 1),
    // end: new Date(2025, 5, 30),
  }));
}

const currentDate = ref(new Date());
const currentMonth = ref(currentDate.value.getMonth());
const currentYear = ref(currentDate.value.getFullYear());

const getDaysInMonth = (month, year) => {
  return new Date(year, month + 1, 0).getDate();
};

const daysInMonth = ref(getDaysInMonth(currentMonth.value, currentYear.value));

const monthStart = computed(
  () => new Date(currentYear.value, currentMonth.value, 1)
);
const monthEnd = computed(
  () => new Date(currentYear.value, currentMonth.value, daysInMonth.value)
);

const visibleTasks = computed(() => {
  const msMonthStart = monthStart.value.getTime();
  const msMonthEnd = monthEnd.value.getTime();
  const result = tasks.value
    .map((task) => {
      // Определяем границы задачи в текущем месяце
      const msTaskStart = task.start.getTime();
      const msTaskEnd = task.end.getTime();
      const start = msTaskStart < msMonthStart ? monthStart.value : task.start;
      const end = msTaskEnd > msMonthEnd ? monthEnd.value : task.end;
      // Если задача не пересекается с месяцем — не показываем
      if (msTaskEnd < msMonthStart || msTaskStart > msMonthEnd) return null;
      // Для позиционирования
      return {
        ...task,
        startDay: start.getDate(),
        endDay: end.getDate(),
        progress: (task.stepActive / task.steps) * 100,
      };
    })
    .filter(Boolean);
  // Для отладки
  return result;
});

function DateToRealUtc(date) {
  var date = new Date(date);
  var userTimezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() + userTimezoneOffset);
}

// добавление подзадач в модалке
function addSubtask(title) {
  if (!title) return;

  const position = newTask.value.subtasks.length;
  newTask.value.subtasks.push({
    title: title,
    completed: false,
    position: position,
  });

  newTask.value.subtaskInput = ""; // очистка поля ввода, если нужно
}

function removeSubtask(idx) {
  newTask.value.subtasks.splice(idx, 1);
}

const columns = Array.from({ length: 31 }, (_, i) => i + 1);
const draggedTask = ref(null);
const dragOffset = ref(0);
const dragOverTask = ref(null);
const dropIndex = ref(null);
const hoveredTask = ref(null);
const openedTask = ref(null);

const TASK_HEIGHT = 75;
const TASK_MARGIN = 24;
const TASK_TOTAL_HEIGHT = TASK_HEIGHT + TASK_MARGIN;
const TASKS_TOP_OFFSET = 50;

const SEGMENT_WIDTH = 24;
const SEGMENT_GAP = 6;
const TASK_PADDING = 48; // 24px слева и справа
const calendarRef = ref(null);
const calendarWidth = ref(0);
// const MAX_TASK_WIDTH_PERC = 0.5
const MAX_TASK_WIDTH_PERC = 1;
const MIN_TASK_WIDTH = 120;

function updateCalendarWidth() {
  if (calendarRef.value) {
    calendarWidth.value = calendarRef.value.offsetWidth;
  }
}

function calcTaskWidth(task) {
  const days = task.endDay - task.startDay + 1;
  if (days <= 3) return MIN_TASK_WIDTH;
  if (!calendarWidth.value || !daysInMonth.value) return 200;
  const widthByDays = (calendarWidth.value / daysInMonth.value) * days;
  const maxWidth = calendarWidth.value * MAX_TASK_WIDTH_PERC;
  return Math.min(widthByDays, maxWidth);
}

const handleDragStart = (task, event) => {
  draggedTask.value = task;
  dragOffset.value = event.clientY - event.target.getBoundingClientRect().top;
  event.dataTransfer.effectAllowed = "move";
  event.target.style.opacity = "0.5";
};

const handleDragEnd = (event) => {
  event.target.style.opacity = "1";
  draggedTask.value = null;
  dragOverTask.value = null;
  dropIndex.value = null;
};

// Получить индекс задачи в исходном массиве по title (или добавить уникальный id в будущем)
function getTaskIndex(task) {
  return tasks.value.findIndex((t) => t.title === task.title);
}

const handleDragOver = (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const container = event.currentTarget.querySelector(".tasks-container");
  const rect = container.getBoundingClientRect();
  const y = event.clientY - rect.top;
  let index = Math.floor((y - TASKS_TOP_OFFSET) / TASK_TOTAL_HEIGHT);
  if (index < 0) index = 0;
  if (index > visibleTasks.value.length) index = visibleTasks.value.length;
  dropIndex.value = index;
};

const handleDrop = (event) => {
  event.preventDefault();
  if (draggedTask.value !== null && dropIndex.value !== null) {
    // Получаем индекс задачи в исходном массиве
    const draggedIndex = getTaskIndex(draggedTask.value);
    // Получаем индекс задачи, на которую дропаем, в visibleTasks
    let insertIndex = dropIndex.value;
    // Получаем задачу, на которую дропаем (если не в самый конец)
    let targetTask = visibleTasks.value[insertIndex];
    // Получаем индекс в исходном массиве
    let targetIndex = targetTask
      ? getTaskIndex(targetTask)
      : tasks.value.length;
    // Если перетаскиваем вниз по списку, и targetIndex > draggedIndex, уменьшаем targetIndex на 1
    if (targetIndex > draggedIndex) targetIndex--;
    // Перемещаем задачу в исходном массиве
    if (draggedIndex !== -1) {
      const newTasks = [...tasks.value];
      const [movedTask] = newTasks.splice(draggedIndex, 1);
      newTasks.splice(targetIndex, 0, movedTask);
      tasks.value = newTasks;
    }
  }
  dropIndex.value = null;
  draggedTask.value = null;
  dragOverTask.value = null;
};

const handlePrevMonth = () => {
  currentMonth.value--;
  if (currentMonth.value < 0) {
    currentMonth.value = 11;
    currentYear.value--;
  }
  daysInMonth.value = getDaysInMonth(currentMonth.value, currentYear.value);

  // Adjust tasks that are outside the new month's range
  tasks.value = tasks.value.map((task) => {
    if (task.endDate > daysInMonth.value) {
      const duration = task.endDate - task.startDate;
      return {
        ...task,
        startDate: Math.max(1, daysInMonth.value - duration),
        endDate: Math.max(1, daysInMonth.value - duration) + duration,
      };
    }
    return task;
  });
};

const handleNextMonth = () => {
  currentMonth.value++;
  if (currentMonth.value > 11) {
    currentMonth.value = 0;
    currentYear.value++;
  }
  daysInMonth.value = getDaysInMonth(currentMonth.value, currentYear.value);

  // Adjust tasks that are outside the new month's range
  tasks.value = tasks.value.map((task) => {
    if (task.endDate > daysInMonth.value) {
      const duration = task.endDate - task.startDate;
      return {
        ...task,
        startDate: Math.max(1, daysInMonth.value - duration),
        endDate: Math.max(1, daysInMonth.value - duration) + duration,
      };
    }
    return task;
  });
};

const getMonthName = (month) => {
  return new Date(2000, month, 1)
    .toLocaleString("default", { month: "long" })
    .toUpperCase();
};

async function openTaskDetails(task) {
  var task = await fetchTask(task.id);
  openedTask.value = task;
}
function closeTaskDetails() {
  openedTask.value = null;
}

function formatDate(date) {
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

const showAddModal = ref(false);
const newTask = ref({
  title: "",
  start: "",
  end: "",
  color: "#25636A",
  subtasks: [],
});

function openAddModal() {
  showAddModal.value = true;
  newTask.value = {
    title: "",
    start: "",
    end: "",
    color: "#25636A",
    subtasks: [],
  };
}
function closeAddModal() {
  showAddModal.value = false;
}
const showFirework = ref(false);

function addTask() {
  if (!newTask.value.title || !newTask.value.end) return;
  let startDate = newTask.value.start
    ? new Date(newTask.value.start)
    : new Date(currentYear.value, currentMonth.value, 1);
  const endDate = new Date(newTask.value.end);
  if (isNaN(startDate) || isNaN(endDate) || endDate < startDate) return;
  const steps = Math.max(0, Number(newTask.value.steps));
  const stepActive =
    steps === 0
      ? 0
      : Math.max(0, Math.min(Number(newTask.value.stepActive), steps));
  const taskToAdd = {
    title: newTask.value.title,
    start: startDate,
    end: endDate,
    color: newTask.value.color,
    subtasks: newTask.value.subtasks,
  };
  addTaskAPI(taskToAdd).then((added) => {
    loadTasks();
    showAddModal.value = false;
    setTimeout(() => {
      confetti({
        particleCount: 90,
        spread: 80,
        startVelocity: 38,
        origin: { y: 0.35 },
        colors: [
          "#ffec3d",
          "#ff85c0",
          "#5cdbd3",
          "#ffd666",
          "#69c0ff",
          "#b37feb",
          "#ff7875",
          "#95de64",
          "#fffbe6",
          "#ffadd2",
          "#bae7ff",
          "#ffd6e7",
        ],
        scalar: 1.1,
        gravity: 0.85,
        ticks: 180,
      });
      confetti({
        particleCount: 60,
        angle: 120,
        spread: 100,
        startVelocity: 32,
        origin: { x: 0.2, y: 0.45 },
        colors: [
          "#ffec3d",
          "#ff85c0",
          "#5cdbd3",
          "#ffd666",
          "#69c0ff",
          "#b37feb",
          "#ff7875",
          "#95de64",
        ],
        scalar: 0.9,
        gravity: 0.95,
        ticks: 140,
      });
      confetti({
        particleCount: 60,
        angle: 60,
        spread: 100,
        startVelocity: 32,
        origin: { x: 0.8, y: 0.45 },
        colors: [
          "#ffec3d",
          "#ff85c0",
          "#5cdbd3",
          "#ffd666",
          "#69c0ff",
          "#b37feb",
          "#ff7875",
          "#95de64",
        ],
        scalar: 0.9,
        gravity: 0.95,
        ticks: 140,
      });
    }, 200);
  });
}

async function deleteTask(id) {
  await deleteTaskAPI(id);
  loadTasks();
}

async function updateTask(id, patch) {
  await updateTaskAPI(id, patch);
  loadTasks();
}

function handleKeydown(e) {
  if (e.key === "ArrowLeft") {
    handlePrevMonth();
  } else if (e.key === "ArrowRight") {
    handleNextMonth();
  }
}

onMounted(() => {
  loadTasks();
  window.addEventListener("resize", updateCalendarWidth);
  updateCalendarWidth();
  window.addEventListener("keydown", handleKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateCalendarWidth);
  window.removeEventListener("keydown", handleKeydown);
});

const router = useRouter();

function logout() {
  localStorage.removeItem("token");
  router.push("/login");
}

function formatShortDateRange(start, end) {
  if (!start || !end) return "";
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${start.toLocaleString("ru", {
      month: "short",
    })}`;
  }
  if (sameYear) {
    return `${start.getDate()} ${start.toLocaleString("ru", {
      month: "short",
    })} – ${end.getDate()} ${end.toLocaleString("ru", { month: "short" })}`;
  }
  return `${start.getDate()} ${start.toLocaleString("ru", {
    month: "short",
  })} ${start
    .getFullYear()
    .toString()
    .slice(-2)} – ${end.getDate()} ${end.toLocaleString("ru", {
    month: "short",
  })} ${end.getFullYear().toString().slice(-2)}`;
}

const showEditModal = ref(false);
const editTask = ref(null);
const editTaskForm = ref({});
const editError = ref("");

function openEditModal(task) {
  editTask.value = task;
  editTaskForm.value = {
    title: task.title,
    start: task.start.toISOString().slice(0, 10),
    end: task.end.toISOString().slice(0, 10),
    color: task.color,
    steps: task.steps,
    stepActive: task.stepActive,
  };
  editError.value = "";
  showEditModal.value = true;
}
function closeEditModal() {
  showEditModal.value = false;
  editTask.value = null;
}
async function saveEditTask() {
  if (!editTaskForm.value.title || !editTaskForm.value.end) return;
  if (Number(editTaskForm.value.steps) > 25) {
    editError.value = "Максимум 25 пунктов!";
    return;
  }
  let startDate = editTaskForm.value.start
    ? new Date(editTaskForm.value.start)
    : new Date(currentYear.value, currentMonth.value, 1);
  const endDate = new Date(editTaskForm.value.end);
  if (isNaN(startDate) || isNaN(endDate) || endDate < startDate) return;
  const steps = Math.max(0, Number(editTaskForm.value.steps));
  const stepActive =
    steps === 0
      ? 0
      : Math.max(0, Math.min(Number(editTaskForm.value.stepActive), steps));
  await updateTask(editTask.value.id, {
    title: editTaskForm.value.title,
    start: startDate,
    end: endDate,
    color: editTaskForm.value.color,
    steps,
    stepActive,
  });
  showEditModal.value = false;
}

const showDeleteConfirm = ref(false);
const taskToDelete = ref(null);
function confirmDeleteTask(task) {
  showDeleteConfirm.value = true;
  taskToDelete.value = task;
}
function cancelDeleteTask() {
  showDeleteConfirm.value = false;
  taskToDelete.value = null;
}
async function doDeleteTask() {
  if (taskToDelete.value) {
    await deleteTask(taskToDelete.value.id);
    showDeleteConfirm.value = false;
    taskToDelete.value = null;
    openedTask.value = null;
  }
}

function getToday() {
  var today = new Date();
  return today;
}
</script>

<template>
  <!-- <div class="main" :class="{ 'calendar-dimmed': calendarDimmed }"> -->
  <div class="main">
    <div class="header">
      <div class="header-left">
        <div class="biliboba">
          <div class="biliboba-left"></div>
          <div class="biliboba-right"></div>
        </div>
      </div>
      <div class="header-center">
        <v-icon
          icon="mdi-chevron-left"
          size="large"
          class="month-nav-icon"
          @click="handlePrevMonth"
        />
        <div class="month-block">
          <h3>{{ getMonthName(currentMonth) }}</h3>
          <span class="year-label">{{ currentYear }}</span>
        </div>
        <v-icon
          icon="mdi-chevron-right"
          size="large"
          class="month-nav-icon"
          @click="handleNextMonth"
        />
      </div>
      <div class="header-right">
        <button class="add-task-btn" @click="openAddModal">
          + Добавить задачу
        </button>
        <button class="logout-btn" @click="logout">Выйти</button>
      </div>
    </div>
    <div class="body">
      <div
        class="columns-container"
        ref="calendarRef"
        @dragover="handleDragOver"
        @drop="handleDrop"
      >
        <div
          v-for="col in daysInMonth"
          :key="col"
          class="column active"
          :class="{
            today:
              getToday().getFullYear() === currentYear &&
              getToday().getMonth() === currentMonth &&
              col === getToday().getDate(),
          }"
        >
          <div class="column-number">{{ col }}</div>
        </div>
        <div class="tasks-container">
          <template v-for="(task, index) in visibleTasks" :key="task.title">
            <div
              v-if="dropIndex === index"
              class="drop-indicator"
              :style="{
                top: `${TASKS_TOP_OFFSET + index * TASK_TOTAL_HEIGHT}px`,
              }"
            ></div>
            <!-- <div>{{ task }}</div> -->
            <div
              class="task-item"
              :class="{
                'drag-over': dragOverTask === task,
                dragging: draggedTask === task,
              }"
              :style="{
                top: `${TASKS_TOP_OFFSET + index * TASK_TOTAL_HEIGHT}px`,
                left: `${(task.startDay - 1) * (100 / daysInMonth)}%`,
                width: calcTaskWidth(task) + 'px',
                height: `${TASK_HEIGHT}px`,
                marginBottom: `${TASK_MARGIN}px`,
                background:
                  hoveredTask === task
                    ? `linear-gradient(120deg, ${task.color}ee 90%, #18343b 100%)`
                    : `linear-gradient(120deg, ${task.color}cc 25%, #18343b 100%)`,
              }"
              draggable="true"
              @dragstart="handleDragStart(task, $event)"
              @dragend="handleDragEnd"
              @mouseenter="hoveredTask = task"
              @mouseleave="hoveredTask = null"
              @click="openTaskDetails(task)"
            >
              <div class="task-inner">
                <div class="task-row">
                  <!-- <span class="task-icon">📚</span> -->
                  <span class="task-title">{{ task.title }}</span>
                </div>
                <div class="task-down">
                  <div
                    class="task-dates"
                    :title="
                      formatDate(task.start) + ' – ' + formatDate(task.end)
                    "
                    :class="{
                      'task-dates-small':
                        task.steps > 12 || task.endDay - task.startDay + 1 < 4,
                    }"
                  >
                    {{ formatShortDateRange(task.start, task.end) }}
                  </div>
                  <div class="task-progress-bar-segments" v-if="task.steps > 0">
                    <span
                      v-for="n in task.steps"
                      :key="n"
                      class="segment"
                      :class="{ filled: n <= task.stepActive }"
                      :style="{
                        backgroundColor: n <= task.stepActive ? task.color : '',
                      }"
                    ></span>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <div
            v-if="dropIndex === tasks.length"
            class="drop-indicator"
            :style="{
              top: `${TASKS_TOP_OFFSET + tasks.length * TASK_TOTAL_HEIGHT}px`,
            }"
          ></div>
        </div>
      </div>
    </div>
  </div>
  <!-- <transition name="modal-fade">
    <div v-if="openedTask" class="modal-overlay" @click.self="closeTaskDetails">
      <div class="modal-card">
        <button class="modal-close" @click="closeTaskDetails">×</button>
        <div class="modal-content">
          <div class="modal-row">
            <span class="modal-title">{{ openedTask.title }}</span>
            <button
              class="edit-task-btn"
              @click.stop="openEditModal(openedTask)"
              title="Редактировать"
            >
              ✏️
            </button>
            <button
              class="delete-task-btn"
              @click="confirmDeleteTask(openedTask)"
              title="Удалить"
            >
              🗑
            </button>
          </div>
          <div class="modal-dates">
            {{ formatDate(openedTask.start) }} –
            {{ formatDate(openedTask.end) }}
          </div>
          <div class="modal-progress-bar-segments" v-if="openedTask.steps > 0">
            <span
              v-for="n in openedTask.steps"
              :key="n"
              class="modal-segment"
              :class="{ filled: n <= openedTask.stepActive }"
              :style="{
                backgroundColor:
                  n <= openedTask.stepActive ? openedTask.color : '',
              }"
            ></span>
          </div>
          <div class="modal-progress-label" v-if="openedTask.steps > 0">
            Прогресс: {{ openedTask.stepActive }} / {{ openedTask.steps }}
          </div>
        </div>
      </div>
    </div>
  </transition> -->
  <transition name="modal-fade">
    <div
      class="modal-overlay-2"
      v-if="openedTask"
      @click.self="closeTaskDetails"
    >
      <TaskDetails :task="openedTask" />
    </div>
  </transition>
  <transition name="modal-fade">
    <div v-if="showAddModal" class="modal-overlay">
      <div class="modal-card">
        <button class="modal-close" @click="closeAddModal">×</button>
        <div class="modal-content">
          <h2 class="modal-title">Добавить задачу</h2>
          <form class="add-task-form" @submit.prevent="addTask">
            <label
              >Название задачи
              <input
                v-model="newTask.title"
                type="text"
                required
                maxlength="60"
              />
            </label>
            <label
              >Дата начала
              <input v-model="newTask.start" type="date" name="start" />
            </label>
            <label
              >Дата окончания
              <input v-model="newTask.end" type="date" required />
            </label>
            <label
              >Цвет
              <input
                v-model="newTask.color"
                type="color"
                class="color-fullwidth"
              />
            </label>
            <label>
              Подзадачи
              <div class="subtasks-label">
                <input
                  v-model="newTask.subtaskInput"
                  type="text"
                  name="subtasks"
                  placeholder="Введите подзадачу"
                  @keyup.enter="addSubtask"
                />
                <button
                  class="add-subtask"
                  type="button"
                  @click="addSubtask(newTask.subtaskInput)"
                >
                  +
                </button>
              </div>
              <ul v-if="newTask.subtasks && newTask.subtasks.length">
                <li v-for="(sub, idx) in newTask.subtasks" :key="idx">
                  <div class="added-subtask">
                    {{ idx }}.
                    {{ sub.title }}
                    <button
                      type="button"
                      @click="removeSubtask(idx)"
                      style="margin-left: 8px"
                    >
                      ×
                    </button>
                  </div>
                </li>
              </ul>
            </label>
            <!-- <label
              >Выполнено шагов
              <input
                v-model.number="newTask.stepActive"
                type="number"
                :min="0"
                :max="25"
                :disabled="!newTask.steps"
                :class="{ 'steps-disabled': !newTask.steps }"
              />
            </label> -->
            <button class="add-task-submit" type="submit">Добавить</button>
          </form>
        </div>
      </div>
    </div>
  </transition>
  <transition name="modal-fade">
    <div
      v-if="showEditModal"
      class="modal-overlay"
      @click.self="closeEditModal"
    >
      <div class="modal-card">
        <button class="modal-close" @click="closeEditModal">×</button>
        <div class="modal-content">
          <h2 class="modal-title">Редактировать задачу</h2>
          <form class="add-task-form" @submit.prevent="saveEditTask">
            <label
              >Название задачи
              <input
                v-model="editTaskForm.title"
                type="text"
                required
                maxlength="60"
              />
            </label>
            <label
              >Дата начала
              <input v-model="editTaskForm.start" type="date" name="start" />
            </label>
            <label
              >Дата окончания
              <input v-model="editTaskForm.end" type="date" required />
            </label>
            <label
              >Цвет
              <input
                v-model="editTaskForm.color"
                type="color"
                class="color-fullwidth"
              />
            </label>
            <label
              >Подзадачи
              <input
                v-model.number="editTaskForm.subtasks"
                type="number"
                min="0"
                max="25"
              />
            </label>
            <!-- <label
              >Выполнено шагов
              <input
                v-model.number="editTaskForm.stepActive"
                type="number"
                :min="0"
                :max="25"
                :disabled="!editTaskForm.steps"
                :class="{ 'steps-disabled': !editTaskForm.steps }"
              />
            </label> -->
            <div v-if="editError" class="form-error">{{ editError }}</div>
            <button class="add-task-submit" type="submit">Сохранить</button>
          </form>
        </div>
      </div>
    </div>
  </transition>
  <transition name="modal-fade">
    <div
      v-if="showDeleteConfirm"
      class="modal-overlay"
      @click.self="cancelDeleteTask"
    >
      <div class="modal-card delete-confirm-card">
        <div class="modal-content delete-confirm-content">
          <h2 class="modal-title">Удалить задачу?</h2>
          <div class="delete-confirm-text">
            Вы уверены, что хотите удалить задачу
            <b>{{ taskToDelete?.title }}</b
            >?
          </div>
          <div class="delete-confirm-btns">
            <button class="add-task-submit delete-btn" @click="doDeleteTask">
              Удалить
            </button>
            <button class="add-task-btn cancel-btn" @click="cancelDeleteTask">
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.body {
  width: 100%;
  flex: 5;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.columns-container {
  width: 100%;
  height: 100%;
  display: flex;
  position: relative;
  background: transparent;
}

.column {
  flex: 1;
  min-width: 0;
  border-right: 1px solid rgba(44, 47, 54, 0.5);
  position: relative;
}

.column:first-child {
  border-left: 1px solid rgba(44, 47, 54, 0.5);
}

.column.active {
  opacity: 1;
}

.column.active.today {
  opacity: 1;
  background-color: #2e26601f;
}

.column-number {
  padding: 8px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
  user-select: none;
}

.tasks-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 2;
}

.task-item {
  position: absolute;
  pointer-events: auto;
  cursor: move;
  user-select: none;
  border-radius: 14px;
  transition: top 0.35s cubic-bezier(0.4, 2, 0.6, 1),
    box-shadow 0.25s cubic-bezier(0.4, 2, 0.6, 1), background 0.25s,
    transform 0.25s, z-index 0.25s, border-radius 0.2s;
  will-change: top, box-shadow, background, transform, border-radius;
  z-index: 1;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.18);
  padding: 5px 24px 16px 24px;
  min-width: 120px;
  max-width: 100vw;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.task-item:hover {
  box-shadow: 0 6px 24px 0 rgba(80, 200, 255, 0.18),
    0 1.5px 6px 0 rgba(0, 0, 0, 0.1);
  filter: brightness(1.08);
  border-radius: 18px;
}

.task-item.dragging {
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.32);
  transform: scale(1.04) translateY(-4px);
  z-index: 10;
  background: rgba(40, 60, 80, 0.95) !important;
}

.task-item.drag-over {
  transform: translateY(10px);
}

.task-inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  /* white-space: nowrap; */
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-icon {
  font-size: 1.2rem;
}

.task-title {
  font-size: 1.05rem;
  font-weight: 500;
  color: #fff;
  letter-spacing: 0.01em;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.task-down {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 8px;
}

.task-dates {
  text-align: start;
  min-width: 0;
  flex: 2;
}

.task-progress-bar-segments {
  display: flex;
  width: 100%;
  gap: 6px;
  flex: 2;
  justify-content: stretch;
  align-items: center;
  background: rgba(20, 30, 40, 0.85);
  border-radius: 5px;
  padding: 3px 6px;
  min-height: 16px;
  box-sizing: border-box;
}

.segment {
  flex: 1 1 0;
  min-width: 0;
  height: 10px;
  border-radius: 3px;
  background: rgba(60, 70, 80, 0.55);
  border: 1px solid rgba(80, 90, 100, 0.18);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.08);
  transition: background 0.2s, border 0.2s, box-shadow 0.2s;
}

.segment.filled {
  background: var(--segment-color, #25636a);
  opacity: 0.98;
  border: 1.5px solid #fff3;
  box-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.1);
}

.main {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.header {
  width: 100%;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #1e2025;
  min-height: 64px;
}

.header-left {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* background-color: #6e4aff; */
}

.biliboba {
  width: 90%;
  height: 80%;
  /* background-color: #25636a; */
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #fff3;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.biliboba-left {
  flex: 1;
}

.biliboba-right {
  width: 100%;
  height: 100%;
  flex: 1;
  background-color: #25636a;
}

.header-center {
  flex: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
}

.header-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.month-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 120px;
}

.month-block h3 {
  font-size: 28px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  line-height: 1.1;
}

.year-label {
  font-size: 0.98rem;
  color: #7e8a99;
  margin-top: 2px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.add-task-btn {
  background: #232b33;
  color: #b7c9d1;
  border: none;
  border-radius: 10px;
  font-size: 1.04rem;
  font-weight: 500;
  padding: 7px 18px;
  margin-left: 12px;
  cursor: pointer;
  box-shadow: none;
  transition: background 0.18s, color 0.18s;
  opacity: 0.82;
}

.add-task-btn:hover {
  background: #232b33;
  color: #fff;
  opacity: 1;
}

.month-nav-icon {
  color: #fff;
  cursor: pointer;
}

.month-nav-icon:hover {
  opacity: 0.8;
}

.drop-indicator {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 2px dashed #4ecdc4;
  z-index: 5;
  pointer-events: none;
  opacity: 1;
  transition: top 0.35s cubic-bezier(0.4, 2, 0.6, 1), opacity 0.2s;
}

/* Modal styles */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s cubic-bezier(0.4, 2, 0.6, 1);
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(20, 24, 30, 0.82);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: modal-bg-fade 0.25s;
}
.modal-overlay-2 {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* background: rgba(20, 24, 30, 0.82); */
  z-index: 1000;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: right;
  animation: modal-bg-fade 0.25s;
}

.subtasks-label {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.added-subtask {
  display: flex;
  flex-direction: row;
  margin-left: 5px;
}

.add-subtask {
  background: #18191f;
  /* border: #2e2660 1px solid; */
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 700;
  padding: 0 14px;
  margin-left: 8px;
  cursor: pointer;
  box-shadow: 0 2px 8px 0 rgba(44, 47, 54, 0.12);
  transition: 0.1s ease-in-out;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-subtask:hover {
  background: #232b33;
  box-shadow: 0 4px 16px 0 rgba(44, 47, 54, 0.18);
}

.modal-card {
  background: #23232b;
  border-radius: 18px;
  box-shadow: 0 4px 32px 0 #0008;
  min-width: 320px;
  max-width: 96vw;
  padding: 38px 32px 32px 32px;
  min-width: 500px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  animation: modal-pop 0.28s cubic-bezier(0.4, 2, 0.6, 1);
}
.modal-close {
  position: absolute;
  top: 18px;
  right: 22px;
  background: none;
  border: none;
  color: #fff;
  font-size: 2rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  z-index: 2;
}
.modal-close:hover {
  opacity: 1;
}
.modal-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
}
.modal-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.modal-icon {
  font-size: 2.1rem;
}
.modal-title {
  font-size: 1.45rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.01em;
  line-height: 1.2;
}
.modal-dates {
  font-size: 1.13rem;
  color: #b7c9d1;
  font-weight: 500;
  margin-left: 2px;
}
.modal-progress-bar-segments {
  display: flex;
  gap: 8px;
  width: 100%;
  background: rgba(20, 30, 40, 0.85);
  align-items: center;
  border-radius: 6px;
  padding: 6px 10px;
  min-height: 20px;
  margin-top: 4px;
  box-sizing: border-box;
  justify-content: stretch;
}
.modal-segment {
  flex: 1 1 0;
  min-width: 0;
  max-width: none;
  height: 14px;
  border-radius: 4px;
  background: rgba(60, 70, 80, 0.55);
  border: 1px solid rgba(80, 90, 100, 0.18);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.08);
  transition: background 0.2s, border 0.2s, box-shadow 0.2s;
}
.modal-segment.filled {
  background: var(--segment-color, #25636a);
  opacity: 0.98;
  border: 1.5px solid #fff3;
  box-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.1);
}
.modal-progress-label {
  font-size: 1.08rem;
  color: #b7c9d1;
  margin-top: 2px;
  margin-left: 2px;
}
@keyframes modal-pop {
  0% {
    transform: scale(0.92) translateY(30px);
    opacity: 0;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
@keyframes modal-bg-fade {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
.add-task-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  margin-top: 10px;
}
.add-task-form label {
  color: #b7c9d1;
  font-size: 1.04rem;
  font-weight: 500;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}
.add-task-form input[type="text"],
.add-task-form input[type="date"],
.add-task-form input[type="number"] {
  background: #18191f;
  color: #fff;
  border: 1px solid #2e2660;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 1.08rem;
  margin-top: 2px;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  transition: border 0.2s;
}
.add-task-form input[type="text"]:focus,
.add-task-form input[type="date"]:focus,
.add-task-form input[type="number"]:focus {
  border: 1.5px solid #6e4aff;
}
.add-task-form input[type="color"].color-fullwidth {
  width: 100%;
  min-width: 100px;
  height: 40px;
  border-radius: 8px;
  background: none;
  margin: 0;
  padding: 0;
  border: none;
  outline: none;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.1);
  cursor: pointer;
  display: block;
}
.add-task-submit {
  background: linear-gradient(90deg, #2e2660 60%, #18191f 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1.08rem;
  font-weight: 600;
  padding: 5px 10px;
  /* margin-top: 10px; */
  cursor: pointer;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.1);
  transition: background 0.2s, box-shadow 0.2s;
}
.add-task-submit:hover {
  background: linear-gradient(90deg, #6e4aff 60%, #2e2660 100%);
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.16);
}
.logout-btn {
  background: none;
  color: #b7c9d1;
  border: 1.5px solid #2e2660;
  border-radius: 10px;
  font-size: 1.04rem;
  font-weight: 500;
  padding: 7px 18px;
  margin-left: 16px;
  cursor: pointer;
  box-shadow: none;
  transition: background 0.18s, color 0.18s, border 0.18s;
  opacity: 0.82;
}
.logout-btn:hover {
  background: #232b33;
  color: #fff;
  border-color: #6e4aff;
  opacity: 1;
}
.task-dates-small {
  font-size: 0.88rem;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
@media (max-width: 700px) {
  .task-down {
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
}
.edit-task-btn {
  background: none;
  border: none;
  color: #b7c9d1;
  font-size: 1.1rem;
  margin-left: 8px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.18s;
}
.edit-task-btn:hover {
  opacity: 1;
  color: #6e4aff;
}
.form-error {
  color: #ff7875;
  font-size: 1rem;
  margin-top: 2px;
  min-height: 22px;
}
.steps-disabled {
  background: #23232b !important;
  color: #888 !important;
  border-color: #23232b !important;
  opacity: 0.7;
  cursor: not-allowed;
}
.delete-task-btn {
  background: none;
  border: none;
  color: #b7c9d1;
  font-size: 1.2rem;
  margin-left: 8px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.18s;
}
.delete-task-btn:hover {
  opacity: 1;
  color: #ff7875;
}
.delete-confirm-card {
  min-width: 340px;
  max-width: 96vw;
  padding: 32px 32px 24px 32px;
  align-items: center;
}
.delete-confirm-content {
  align-items: center;
  text-align: center;
  width: 100%;
  gap: 18px;
}
.delete-confirm-text {
  margin-bottom: 18px;
  font-size: 1.08rem;
  color: #b7c9d1;
}
.delete-confirm-btns {
  display: flex;
  flex-direction: row;
  gap: 16px;
  justify-content: center;
  align-items: center;
  width: 100%;
}
.delete-btn {
  background: linear-gradient(90deg, #ff7875 60%, #d7263d 100%) !important;
  color: #fff !important;
  border: none;
  font-weight: 600;
  box-shadow: 0 2px 8px 0 rgba(255, 0, 0, 0.1);
  transition: background 0.18s, box-shadow 0.18s;
}
.delete-btn:hover {
  background: linear-gradient(90deg, #d7263d 60%, #ff7875 100%) !important;
  color: #fff !important;
  box-shadow: 0 4px 16px 0 rgba(255, 0, 0, 0.16);
}
.cancel-btn {
  background: #232b33 !important;
  color: #b7c9d1 !important;
  border: 1.5px solid #2e2660;
  font-weight: 500;
  box-shadow: none;
  transition: background 0.18s, color 0.18s, border 0.18s;
}
.cancel-btn:hover {
  background: #23232b !important;
  color: #fff !important;
  border-color: #6e4aff;
}
</style>
