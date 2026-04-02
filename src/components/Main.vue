<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import confetti from "canvas-confetti";
import SalaryViewer from "./elements/SalaryViewer.vue";
import {
  fetchTasks,
  addTaskAPI,
  deleteTaskAPI,
  updateTaskAPI,
  fetchTask,
  fetchLearningSkills,
  reorderTasksAPI,
} from "./api.js";
import { useRouter } from "vue-router";

import gifRocket from "../assets/gif/rocket_1f680.gif"
import gifLantern from "../assets/gif/1f383.gif"

import TaskDetails from "@/components/modals/TaskDetails.vue";

import TimeTrackerMini from "./elements/TimeTrackerMini.vue";
import TimeStatsModal from "@/components/elements/TimeStatsModal.vue";

import SkillsMiniWidget from "./elements/SkillsMiniWidget.vue";

const DEFAULT_TASK_COLOR = "#25636A";
const CONFETTI_DELAY_MS = 200;
const CONFETTI_COLORS = [
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
];
const CONFETTI_PRESETS = [
  {
    particleCount: 90,
    spread: 80,
    startVelocity: 38,
    origin: { y: 0.35 },
    scalar: 1.1,
    gravity: 0.85,
    ticks: 180,
  },
  {
    particleCount: 60,
    angle: 120,
    spread: 100,
    startVelocity: 32,
    origin: { x: 0.2, y: 0.45 },
    scalar: 0.9,
    gravity: 0.95,
    ticks: 140,
  },
  {
    particleCount: 60,
    angle: 60,
    spread: 100,
    startVelocity: 32,
    origin: { x: 0.8, y: 0.45 },
    scalar: 0.9,
    gravity: 0.95,
    ticks: 140,
  },
];

const createEmptyTaskForm = () => ({
  title: "",
  start: "",
  end: "",
  color: DEFAULT_TASK_COLOR,
  subtasks: [],
  subtaskInput: "",
  steps: 0,
  stepActive: 0,
  isGlobal: false,
  learningSkillId: null,
  learningGradeId: null,
});

function openMdToPdfPage() {
  const { href } = router.resolve({ name: 'mdToPdf', params: { id: 1 } });
  window.open(href, '_blank');
}

function celebrateTaskCreation() {
  setTimeout(() => {
    CONFETTI_PRESETS.forEach((preset) =>
      confetti({
        ...preset,
        colors: CONFETTI_COLORS,
      }),
    );
  }, CONFETTI_DELAY_MS);
}

/* global __APP_VERSION__, __BUILD_TIME__ */
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?';
const buildTime = typeof __BUILD_TIME__ !== 'undefined'
  ? new Date(__BUILD_TIME__).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '?';
const showBuildInfo = ref(false);

const tasks = ref([]);
const learningSkills = ref([]);
const collapsedSkills = ref({}); // { skillId: true/false }
const SKILL_ORDER_KEY = "skillDisplayOrder";
const skillDisplayOrder = ref(JSON.parse(localStorage.getItem(SKILL_ORDER_KEY) || "[]"));

function saveSkillOrder() {
  localStorage.setItem(SKILL_ORDER_KEY, JSON.stringify(skillDisplayOrder.value));
}

async function loadLearningSkills() {
  try {
    learningSkills.value = await fetchLearningSkills();
    const newIds = learningSkills.value.map(s => s.id);
    // Preserve saved order, remove stale, append new
    const ordered = skillDisplayOrder.value.filter(id => newIds.includes(id));
    for (const id of newIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    skillDisplayOrder.value = ordered;
    saveSkillOrder();
  } catch (e) {
    console.error(e);
  }
}

async function loadTasks(date) {
  tasks.value = await fetchTasks(date);
}

function toggleSkillCollapse(skillId) {
  collapsedSkills.value[skillId] = !collapsedSkills.value[skillId];
}

function moveSkillGroup(skillId, direction) {
  const order = [...skillDisplayOrder.value];
  const idx = order.indexOf(skillId);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= order.length) return;
  [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
  skillDisplayOrder.value = order;
  saveSkillOrder();
}

const selectedNewTaskSkill = computed(() => {
  if (!newTask.value.learningSkillId) return null;
  return learningSkills.value.find((s) => s.id === newTask.value.learningSkillId);
});

const currentDate = ref(new Date());
const currentMonth = ref(currentDate.value.getMonth());
const currentYear = ref(currentDate.value.getFullYear());

const getDaysInMonth = (month, year) => {
  return new Date(year, month + 1, 0).getDate();
};

const daysInMonth = ref(getDaysInMonth(currentMonth.value, currentYear.value));
const reloadTasksForCurrentDate = () => loadTasks(currentDate);

const monthStart = computed(
  () => new Date(currentYear.value, currentMonth.value, 1),
);
const monthEnd = computed(
  () => new Date(currentYear.value, currentMonth.value, daysInMonth.value),
);

const visibleTasks = computed(() => {
  if (!Array.isArray(tasks.value)) {
    return [];
  }

  const msMonthStart = monthStart.value.getTime();
  const msMonthEnd = monthEnd.value.getTime();

  const mapped = tasks.value
    .map((task) => {
      const msTaskStart = new Date(task.start).getTime();
      const msTaskEnd = new Date(task.end).getTime();
      const start = msTaskStart < msMonthStart ? monthStart.value : task.start;
      const end = msTaskEnd > msMonthEnd ? monthEnd.value : task.end;

      if (msTaskEnd < msMonthStart || msTaskStart > msMonthEnd) return null;

      return {
        ...task,
        startDay: new Date(start).getDate(),
        endDay: new Date(end).getDate(),
        progress: (task.stepActive / task.steps) * 100,
      };
    })
    .filter(Boolean);

  // Sort: group by skill using custom display order, within group by position
  const orderMap = {};
  skillDisplayOrder.value.forEach((id, i) => { orderMap[id] = i; });

  mapped.sort((a, b) => {
    const aSkill = a.learningSkillId || null;
    const bSkill = b.learningSkillId || null;
    if (aSkill !== bSkill) {
      if (!aSkill) return 1;
      if (!bSkill) return -1;
      return (orderMap[aSkill] ?? 999) - (orderMap[bSkill] ?? 999);
    }
    // Within same skill group: sort by position
    const aPos = a.position ?? 9999;
    const bPos = b.position ?? 9999;
    return aPos - bPos;
  });

  return mapped;
});

// Build display rows: tasks (visible) + collapsed skill placeholders
// Each row has a `rowIndex` for absolute positioning
const displayData = computed(() => {
  const tasks = visibleTasks.value;
  const rows = []; // { type: 'task', task, rowIndex } or { type: 'collapsed', skill, taskCount, rowIndex }
  const brackets = []; // { skillId, title, color, startRow, endRow }

  // Group tasks by skill in order
  let currentSkillId = null;
  let groupTasks = [];

  function flushGroup() {
    if (!groupTasks.length) return;
    const sid = groupTasks[0].learningSkillId || null;
    const isCollapsed = sid && collapsedSkills.value[sid];
    const skill = sid ? learningSkills.value.find(s => s.id === sid) : null;

    if (isCollapsed && skill) {
      const rowIdx = rows.length;
      rows.push({ type: 'collapsed', skill, taskCount: groupTasks.length, rowIndex: rowIdx });
    } else {
      const startRow = rows.length;
      for (const t of groupTasks) {
        rows.push({ type: 'task', task: t, rowIndex: rows.length });
      }
      const endRow = rows.length - 1;
      if (skill && startRow <= endRow) {
        brackets.push({ skillId: sid, title: skill.title, color: skill.color, startRow, endRow });
      }
    }
    groupTasks = [];
  }

  for (const t of tasks) {
    const sid = t.learningSkillId || null;
    if (sid !== currentSkillId) {
      flushGroup();
      currentSkillId = sid;
    }
    groupTasks.push(t);
  }
  flushGroup();

  return { rows, brackets };
});

const draggedTask = ref(null);
const dragOverTask = ref(null);
const dropIndex = ref(null);
const hoveredTask = ref(null);
const openedTask = ref(null);

const TASK_HEIGHT = 75;
const TASK_MARGIN = 24;
const TASK_TOTAL_HEIGHT = TASK_HEIGHT + TASK_MARGIN;
const TASKS_TOP_OFFSET = 50;
const calendarRef = ref(null);
const calendarWidth = ref(0);
// const MAX_TASK_WIDTH_PERC = 0.5
const MAX_TASK_WIDTH_PERC = 1;
const MIN_TASK_WIDTH = ref(120);

function updateCalendarWidth() {
  if (calendarRef.value) {
    calendarWidth.value = calendarRef.value.offsetWidth;
  }
}

function calcTaskWidth(task) {
  MIN_TASK_WIDTH.value = getColumnWidth();
  const days = task.endDay - task.startDay + 1;
  if (days <= 1) return MIN_TASK_WIDTH.value;
  if (!calendarWidth.value || !daysInMonth.value) return 200;
  const widthByDays = (calendarWidth.value / daysInMonth.value) * days;
  const maxWidth = calendarWidth.value * MAX_TASK_WIDTH_PERC;
  return Math.min(widthByDays, maxWidth);
}

const handleDragStart = (task, event) => {
  draggedTask.value = task;
  event.dataTransfer.effectAllowed = "move";
  event.target.style.opacity = "0.5";
};

const handleDragEnd = (event) => {
  event.target.style.opacity = "1";
  draggedTask.value = null;
  dragOverTask.value = null;
  dropIndex.value = null;
};

function getTaskIndex(task) {
  return tasks.value.findIndex((t) => t.id === task.id);
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

const handleDrop = async (event) => {
  event.preventDefault();
  if (draggedTask.value !== null && dropIndex.value !== null) {
    // Work with the displayed task rows (what user sees)
    const taskRows = displayData.value.rows.filter(r => r.type === 'task');
    const draggedRowIdx = taskRows.findIndex(r => r.task.id === draggedTask.value.id);
    let targetRowIdx = dropIndex.value;
    if (targetRowIdx > taskRows.length) targetRowIdx = taskRows.length;

    if (draggedRowIdx !== -1 && draggedRowIdx !== targetRowIdx) {
      // Build new order from display rows
      const ordered = taskRows.map(r => r.task);
      const [moved] = ordered.splice(draggedRowIdx, 1);
      if (targetRowIdx > draggedRowIdx) targetRowIdx--;
      ordered.splice(targetRowIdx, 0, moved);

      // Assign new positions
      const reorderItems = ordered.map((t, i) => ({ id: t.id, position: i }));

      // Update local tasks with new positions
      for (const item of reorderItems) {
        const t = tasks.value.find(t => t.id === item.id);
        if (t) t.position = item.position;
      }

      try {
        await reorderTasksAPI(reorderItems);
      } catch (e) {
        console.error("Failed to save task order:", e);
      }
    }
  }
  dropIndex.value = null;
  draggedTask.value = null;
  dragOverTask.value = null;
};

function changeMonth(offset) {
  const targetDate = new Date(
    currentYear.value,
    currentMonth.value + offset,
    10,
  );

  currentYear.value = targetDate.getFullYear();
  currentMonth.value = targetDate.getMonth();
  daysInMonth.value = getDaysInMonth(currentMonth.value, currentYear.value);
  currentDate.value = targetDate;

  reloadTasksForCurrentDate();
  updateCalendarWidth();
}

const handlePrevMonth = () => changeMonth(-1);

const handleNextMonth = () => changeMonth(1);

// Секция для получения ширины column
const columnRef = ref([]);

const getColumnWidth = () => {
  if (columnRef.value.length > 0) {
    const width = columnRef.value[0].getBoundingClientRect().width;
    return width;
  }
  return 0;
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
  reloadTasksForCurrentDate();
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

const showAddModal = ref(false);
const showNyamaModals = ref(false);
const newTask = ref(createEmptyTaskForm());

function resetNewTaskForm() {
  newTask.value = createEmptyTaskForm();
}

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

// --- JSON Import ---
const showJsonImport = ref(false);
const jsonImportText = ref("");
const jsonImportError = ref("");

const jsonImportPrompt = `Сгенерируй JSON-массив подзадач для проекта/задачи, которую я опишу.

Формат — массив объектов:
[
  { "title": "Название подзадачи" },
  { "title": "Ещё одна подзадача" }
]

Правила:
- Каждый объект ОБЯЗАН иметь поле "title" (строка)
- Разбивай задачу на конкретные, выполнимые шаги
- Порядок = логическая последовательность выполнения
- Без вложенности — плоский массив
- Только JSON, без markdown, без пояснений

Пример запроса: "Сделать лендинг для кофейни"
Пример ответа:
[
  { "title": "Собрать референсы и мудборд" },
  { "title": "Нарисовать wireframe главной страницы" },
  { "title": "Дизайн Hero-секции" },
  { "title": "Секция меню с карточками напитков" },
  { "title": "Секция 'О нас' с фото" },
  { "title": "Контакты и карта" },
  { "title": "Адаптив под мобильные" },
  { "title": "Вёрстка HTML/CSS" },
  { "title": "Подключить форму обратной связи" },
  { "title": "Деплой на хостинг" }
]

Моя задача:`;

function importSubtasksFromJson() {
  jsonImportError.value = "";
  try {
    const parsed = JSON.parse(jsonImportText.value.trim());
    if (!Array.isArray(parsed)) {
      jsonImportError.value = "JSON должен быть массивом [ ... ]";
      return;
    }
    const startPos = newTask.value.subtasks.length;
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      const title = item.title || item.name || item.text;
      if (!title) continue;
      newTask.value.subtasks.push({
        title: String(title),
        completed: false,
        position: startPos + i,
      });
    }
    jsonImportText.value = "";
    showJsonImport.value = false;
  } catch (e) {
    jsonImportError.value = "Невалидный JSON: " + e.message;
  }
}

function copyPromptToClipboard() {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(jsonImportPrompt).catch(() => fallbackCopy(jsonImportPrompt));
  } else {
    fallbackCopy(jsonImportPrompt);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function openAddModal() {
  showAddModal.value = true;
  resetNewTaskForm();
}

// открывает модалку берти бонс
function openNyamaModal() {
  showNyamaModals.value = true;
}

function closeAddModal() {
  showAddModal.value = false;
}

function addTask() {
  const { title, start, end, color, subtasks, isGlobal, learningSkillId, learningGradeId } = newTask.value;
  if (!title || !end) return;

  const startDate = start
    ? new Date(start)
    : new Date(currentYear.value, currentMonth.value, 1);
  const endDate = new Date(end);
  if (isNaN(startDate) || isNaN(endDate) || endDate < startDate) return;

  const taskToAdd = {
    title,
    start: startDate,
    end: endDate,
    color,
    subtasks,
    isGlobal,
    learningSkillId: learningSkillId || null,
    learningGradeId: learningGradeId || null,
  };

  addTaskAPI(taskToAdd).then(() => {
    reloadTasksForCurrentDate();
    showAddModal.value = false;
    celebrateTaskCreation();
    resetNewTaskForm();
  });
}

async function deleteTask(id) {
  await deleteTaskAPI(id);
  reloadTasksForCurrentDate();
}

async function updateTask(id, patch) {
  await updateTaskAPI(id, patch);
  reloadTasksForCurrentDate();
}

function handleKeydown(e) {
  if (showAddModal.value || showEditModal.value || openedTask.value != null) {
    return;
  }

  if (e.key === "ArrowLeft") {
    handlePrevMonth();
  } else if (e.key === "ArrowRight") {
    handleNextMonth();
  }
}

onMounted(() => {
  reloadTasksForCurrentDate();
  loadLearningSkills();
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
  start = new Date(start);
  end = new Date(end);

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

// 999 - завершено (зеленый цвет)
// 0 - нормальный прогрес (зелёный/бирюзовый цвет?)
// 1 - надо поторопиться (жёлтый цвет?)
// 2 - надо порвать жопу (оранджевый цвет?)
// -1 - проебал деделайн (красный цвет?)
const PROGRESS_DONE = 999; // завершено (зеленый цвет)
const PROGRESS_NORMAL = 0; // нормальный прогресс (зелёный/бирюзовый цвет)
const PROGRESS_WARN = 1; // надо поторопиться (жёлтый цвет)
const PROGRESS_URGENT = 2; // надо порвать жопу (оранджевый цвет)
const PROGRESS_FAILED = -1; // проебал дедлайн (красный цвет)

const MAXIMUM_NORMAL_OVERDUE_RATIO = 0.125;
const MAXIMUM_WARN_OVERDUE_RATIO = 0.25;

function checkProgressBackgroundColor(progressValue) {
  switch (progressValue) {
    case PROGRESS_DONE:
      return "#00ff8099";
    case PROGRESS_NORMAL:
      return "#00ffff99";
    case PROGRESS_WARN:
      return "#ffa50099";
    case PROGRESS_FAILED:
      return "#00000099";
    case PROGRESS_URGENT:
      return "#b2222299";
    default:
      return "#00ffff99";
  }
}

function checkProgress(task) {
  if (task.totalSubtasks === task.completedSubtasks) {
    return PROGRESS_DONE;
  } else if (task.currentDay === PROGRESS_FAILED) {
    return PROGRESS_FAILED;
  } else if (
    task.requiredSubtasks === 0 ||
    getTaskOverdueRatio(task) <= MAXIMUM_NORMAL_OVERDUE_RATIO
  ) {
    return PROGRESS_NORMAL;
  } else if (getTaskOverdueRatio(task) <= MAXIMUM_WARN_OVERDUE_RATIO) {
    return PROGRESS_WARN;
  } else {
    return PROGRESS_URGENT;
  }
}
function getTaskOverdueRatio(task) {
  return (task.requiredSubtasks - task.completedSubtasks) / task.totalSubtasks;
}

const showTimeStats = ref(false);
function openTimeStats() {
  showTimeStats.value = true;
}
function closeTimeStats() {
  showTimeStats.value = false;
}

</script>

<template>
  <!-- <div class="main" :class="{ 'calendar-dimmed': calendarDimmed }"> -->
  <div class="main">
    <div class="header">
      <div class="header-left">
        <div class="salary-viewer">
          <SalaryViewer />
        </div>
      </div>
      <div class="header-center">
        <v-icon icon="mdi-chevron-left" size="large" class="month-nav-icon" @click="handlePrevMonth" />
        <div class="month-block">
          <h3>{{ getMonthName(currentMonth) }}</h3>
          <span class="year-label">{{ currentYear }}</span>
        </div>
        <v-icon icon="mdi-chevron-right" size="large" class="month-nav-icon" @click="handleNextMonth" />
      </div>
      <div class="header-right">
        <button class="add-task-btn" @click="router.push('/learning-skills')">Навыки</button>
        <button class="add-task-btn" @click="openNyamaModal">Вкусняхи</button>
        <button class="add-task-btn" @click="openAddModal">
          + Добавить задачу
        </button>
        <button class="logout-btn" @click="logout">Выйти</button>
      </div>
    </div>
    <div class="body">
      <div class="columns-container" ref="calendarRef" @dragover="handleDragOver" @drop="handleDrop">
        <div v-for="col in daysInMonth" :key="col" ref="columnRef" class="column active" :class="{
          today:
            getToday().getFullYear() === currentYear &&
            getToday().getMonth() === currentMonth &&
            col === getToday().getDate(),
        }">
          <div class="column-number">{{ col }}</div>
        </div>
        <div class="tasks-container">
          <!-- Skill brackets -->
          <div
            v-for="br in displayData.brackets"
            :key="'br-' + br.skillId"
            class="skill-bracket"
            :style="{
              top: (TASKS_TOP_OFFSET + br.startRow * TASK_TOTAL_HEIGHT - 4) + 'px',
              height: ((br.endRow - br.startRow + 1) * TASK_TOTAL_HEIGHT - TASK_MARGIN + 8) + 'px',
              borderColor: br.color,
            }"
          >
            <div class="skill-bracket-controls">
              <button class="skill-bracket-move" @click.stop="moveSkillGroup(br.skillId, -1)" title="Вверх">▲</button>
              <button class="skill-bracket-move" @click.stop="moveSkillGroup(br.skillId, 1)" title="Вниз">▼</button>
            </div>
            <div class="skill-bracket-line" :style="{ borderColor: br.color }" @click="toggleSkillCollapse(br.skillId)" :title="br.title">
              <span class="skill-bracket-label" :style="{ color: br.color }">{{ br.title }}</span>
            </div>
          </div>

          <!-- Rows: tasks or collapsed placeholders -->
          <template v-for="row in displayData.rows" :key="row.type + '-' + (row.task?.id || row.skill?.id)">
            <!-- Collapsed skill row -->
            <div
              v-if="row.type === 'collapsed'"
              class="skill-collapsed-row"
              :style="{ top: (TASKS_TOP_OFFSET + row.rowIndex * TASK_TOTAL_HEIGHT) + 'px' }"
              @click="toggleSkillCollapse(row.skill.id)"
            >
              <div class="skill-collapsed-dot" :style="{ background: row.skill.color }"></div>
              <span class="skill-collapsed-name">{{ row.skill.title }}</span>
              <span class="skill-collapsed-count">{{ row.taskCount }} задач</span>
              <span class="skill-collapsed-expand">▸</span>
            </div>
          </template>

          <template v-for="row in displayData.rows.filter(r => r.type === 'task')" :key="row.task.id">
            <div class="task-item" :class="{
              'drag-over': dragOverTask === row.task,
              dragging: draggedTask === row.task,
            }" :style="{
              top: `${TASKS_TOP_OFFSET + row.rowIndex * TASK_TOTAL_HEIGHT}px`,
              left: `${(row.task.startDay - 1) * (100 / daysInMonth)}%`,
              width: calcTaskWidth(row.task) + 'px',
              height: `${TASK_HEIGHT}px`,
              marginBottom: `${TASK_MARGIN}px`,
              background:
                hoveredTask === row.task
                  ? `linear-gradient(120deg, ${row.task.color}ee 90%, #18343b 100%)`
                  : `linear-gradient(120deg, ${row.task.color}cc 25%, #18343b 100%)`,
            }" draggable="true" @dragstart="handleDragStart(row.task, $event)" @dragend="handleDragEnd"
              @mouseenter="hoveredTask = row.task" @mouseleave="hoveredTask = null" @click="openTaskDetails(row.task)">
              <div class="task-inner">
                <div class="task-row">
                  <span class="task-title" v-if="row.task.totalDays >= 2">
                    {{ row.task.title }}
                  </span>
                  <div class="task-progres">
                    <div class="progress-thing" :style="{
                      backgroundColor: checkProgressBackgroundColor(
                        checkProgress(row.task),
                      ),
                    }">
                      {{ row.task.completedSubtasks }} / {{ row.task.totalSubtasks }}
                    </div>
                    <div v-if="row.task.totalDays >= 2">
                      <div class="progress-icon" v-if="checkProgress(row.task) === PROGRESS_DONE">
                        ✅
                      </div>
                      <div class="progress-icon" v-if="checkProgress(row.task) === PROGRESS_NORMAL">
                        💨
                      </div>
                      <div class="progress-icon" v-if="checkProgress(row.task) === PROGRESS_WARN">
                        ⚠️
                      </div>
                      <div class="progress-icon" v-if="checkProgress(row.task) === PROGRESS_URGENT">
                        ♨️
                      </div>
                      <div class="progress-icon" v-if="checkProgress(row.task) === PROGRESS_FAILED">
                        🤡
                      </div>
                    </div>
                  </div>
                </div>
                <div class="task-down">
                  <div class="task-dates" :title="formatDate(row.task.start) + ' – ' + formatDate(row.task.end)
                    " :class="{
                      'task-dates-small':
                        row.task.steps > 12 || row.task.endDay - row.task.startDay + 1 < 4,
                    }">
                    {{ formatShortDateRange(row.task.start, row.task.end) }}
                  </div>
                  <div class="task-progress-bar-segments" v-if="row.task.steps > 0">
                    <span v-for="n in row.task.steps" :key="n" class="segment" :class="{ filled: n <= row.task.stepActive }"
                      :style="{
                        backgroundColor: n <= row.task.stepActive ? row.task.color : '',
                      }"></span>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <div v-if="dropIndex === tasks.length" class="drop-indicator" :style="{
            top: `${TASKS_TOP_OFFSET + tasks.length * TASK_TOTAL_HEIGHT}px`,
          }"></div>
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
    <div class="modal-overlay-2" v-if="openedTask" @click.self="closeTaskDetails">
      <TaskDetails :task="openedTask" />
    </div>
  </transition>
  <transition name="modal-fade">
    <TimeStatsModal v-if="showTimeStats" @close="closeTimeStats" />
  </transition>
  <transition name="modal-fade">
    <div v-if="showAddModal" class="modal-overlay">
      <div class="modal-card">
        <button class="modal-close" @click="closeAddModal">×</button>
        <div class="modal-content">
          <h2 class="modal-title">Добавить задачу</h2>
          <form class="add-task-form" @submit.prevent="addTask">
            <label>
              Название задачи
              <input v-model="newTask.title" type="text" required maxlength="200" />
            </label>
            <label>
              Дата начала
              <input v-model="newTask.start" type="date" name="start" />
            </label>
            <label>
              Дата окончания
              <input v-model="newTask.end" type="date" required />
            </label>
            <label>
              Цвет
              <input v-model="newTask.color" type="color" class="color-fullwidth" />
            </label>

            <!-- НОВЫЙ ЧЕКБОКС ДЛЯ ГЛОБАЛЬНОЙ ЗАДАЧИ -->
            <label class="checkbox-label">
              <input v-model="newTask.isGlobal" type="checkbox" class="checkbox-input" />
              <span class="checkbox-text">Глобальная задача</span>
            </label>

            <!-- Навык -->
            <label v-if="learningSkills.length">
              Навык
              <select v-model="newTask.learningSkillId" class="skill-select" @change="newTask.learningGradeId = null">
                <option :value="null">Без навыка</option>
                <option v-for="s in learningSkills" :key="s.id" :value="s.id">{{ s.title }}</option>
              </select>
            </label>
            <label v-if="newTask.learningSkillId && selectedNewTaskSkill?.grades?.length">
              Уровень
              <select v-model="newTask.learningGradeId" class="skill-select">
                <option :value="null">Не указан</option>
                <option v-for="g in selectedNewTaskSkill.grades" :key="g.id" :value="g.id">{{ g.title }}</option>
              </select>
            </label>

            <label>
              Подзадачи
              <div class="subtasks-label">
                <input v-model="newTask.subtaskInput" type="text" name="subtasks" placeholder="Введите подзадачу"
                  @keyup.enter="addSubtask" />
                <button class="add-subtask" type="button" @click="addSubtask(newTask.subtaskInput)">
                  +
                </button>
              </div>

              <!-- JSON Import -->
              <button type="button" class="json-import-toggle" @click="showJsonImport = !showJsonImport">
                {{ showJsonImport ? '▾ Скрыть импорт JSON' : '▸ Импорт из JSON' }}
              </button>

              <div v-if="showJsonImport" class="json-import-section">
                <div class="json-import-prompt-row">
                  <span class="json-import-hint">Скопируй промпт для нейронки, опиши задачу — вставь сюда результат</span>
                  <button type="button" class="json-import-copy-btn" @click="copyPromptToClipboard">📋 Копировать промпт</button>
                </div>
                <textarea
                  v-model="jsonImportText"
                  class="json-import-textarea"
                  rows="6"
                  placeholder='[{ "title": "Подзадача 1" }, { "title": "Подзадача 2" }]'
                ></textarea>
                <div v-if="jsonImportError" class="json-import-error">{{ jsonImportError }}</div>
                <button type="button" class="json-import-btn" @click="importSubtasksFromJson">Импортировать</button>
              </div>

              <ul v-if="newTask.subtasks && newTask.subtasks.length">
                <li v-for="(sub, idx) in newTask.subtasks" :key="idx">
                  <div class="added-subtask">
                    {{ idx }}.
                    {{ sub.title }}
                    <button type="button" @click="removeSubtask(idx)" style="margin-left: 8px">
                      ×
                    </button>
                  </div>
                </li>
              </ul>
            </label>
            <button class="add-task-submit" type="submit">Добавить</button>
          </form>
        </div>
      </div>
    </div>
  </transition>
  <transition name="modal-fade">
    <div v-if="showNyamaModals" class="modal-nyama-backdrop" @click.self="showNyamaModals = false">
      <div class="modal-nyama">
        <button class="nyamaaa" @click="openMdToPdfPage">
          <div class="icon"><img :src="gifRocket" alt=""></div>
          <p class="text">MD TO PDF</p>
        </button>
        <button class="nyamaaa" @click="router.push('/pdfReader')">
          <div class="icon"><img :src="gifLantern" alt=""></div>
          <p class="text">PDF Reader</p>
        </button>
        <button class="nyamaaa" @click="router.push('/diagrams')">
          <div class="icon">🗺️</div>
          <p class="text">Диаграммы</p>
        </button>
        <button class="nyamaaa" @click="router.push('/vocabulary')">
          <div class="icon">🗣️</div>
          <p class="text">English Coach</p>
        </button>
        <button class="nyamaaa" @click="router.push('/budget')">
          <div class="icon">💰</div>
          <p class="text">Бюджет</p>
        </button>
        <button class="nyamaaa" @click="router.push('/skill-tree')">
          <div class="icon">⚔️</div>
          <p class="text">Skill Tree</p>
        </button>
        <button class="nyamaaa" @click="router.push('/journey')">
          <div class="icon">🗺️</div>
          <p class="text">Карта пути</p>
        </button>
        <button class="nyamaaa nyamaaa-soon nyamaaa-unknown" disabled>
          <div class="icon">❓</div>
          <span class="nyama-badge">Неизвестно</span>
        </button>
        <button class="nyamaaa nyamaaa-soon nyamaaa-unknown" disabled>
          <div class="icon">❓</div>
          <span class="nyama-badge">Неизвестно</span>
        </button>
        <button class="nyamaaa nyamaaa-soon nyamaaa-unknown" disabled>
          <div class="icon">❓</div>
          <span class="nyama-badge">Неизвестно</span>
        </button>
      </div>
    </div>
  </transition>
  <transition name="modal-fade">
    <div v-if="showEditModal" class="modal-overlay" @click.self="closeEditModal">
      <div class="modal-card">
        <button class="modal-close" @click="closeEditModal">×</button>
        <div class="modal-content">
          <h2 class="modal-title">Редактировать задачу</h2>
          <form class="add-task-form" @submit.prevent="saveEditTask">
            <label>
              Название задачи
              <input v-model="editTaskForm.title" type="text" required maxlength="200" />
            </label>
            <label>
              Дата начала
              <input v-model="editTaskForm.start" type="date" name="start" />
            </label>
            <label>
              Дата окончания
              <input v-model="editTaskForm.end" type="date" required />
            </label>
            <label>
              Цвет
              <input v-model="editTaskForm.color" type="color" class="color-fullwidth" />
            </label>
            <label>
              Подзадачи
              <input v-model.number="editTaskForm.subtasks" type="number" min="0" max="25" />
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
    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="cancelDeleteTask">
      <div class="modal-card delete-confirm-card">
        <div class="modal-content delete-confirm-content">
          <h2 class="modal-title">Удалить задачу?</h2>
          <div class="delete-confirm-text">
            Вы уверены, что хотите удалить задачу
            <b>{{ taskToDelete?.title }}</b>
            ?
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
.main {
  flex: 1;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  overflow: hidden;
}

.body {
  width: 100%;
  flex: 1;
  position: relative;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #6e4aff #111;
  /* background: #11111113; */
}

.salary-viewer {
  width: 100%;
  height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.taks-types-main-menu {
  position: absolute;
  background-color: #6200ff52;
  height: 170px;
  max-width: 35px;
  align-items: center;
  left: -30px;
  display: flex;
  top: 0px;
  border-top-left-radius: 15px;
  border-bottom-left-radius: 15px;
  cursor: pointer;
  user-select: none;
}

.taks-types-main-menu:active {
  transform: scale(0.95);
}

.taks-types-word {
  display: flex;
  flex: 1;
  width: 100%;
  align-items: center;
  justify-content: center;
}

.taks-types-word h3 {
  transform: rotate(270deg);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #fff;
  opacity: 0.8;
}

.columns-container {
  width: 100%;
  /* height: 100%; */
  display: flex;
  position: relative;
  background: transparent;
}

.column {
  flex: 1;
  min-width: 0;
  border-right: 1px solid rgba(44, 47, 54, 0.5);
  position: relative;
  height: 100vh;
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

.modal-nyama-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-nyama {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 20px;
  padding: 32px 36px;
  background: rgba(24, 25, 31, 0.96);
  border-radius: 32px;
  border: 1px solid rgba(255,255,255,0.07);
  box-shadow: 0 32px 80px rgba(0,0,0,0.6);
  max-width: 700px;
  justify-content: center;
}

.nyamaaa {
  width: 160px;
  height: 160px;
  border-radius: 22px;
  background: hwb(231.43 10.2% 56.86% / 0.82);
  border: 1px solid rgba(255,255,255,0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
  user-select: none;
  position: relative;
}

.nyamaaa:not(:disabled):hover {
  transform: translateY(-4px) scale(1.03);
  box-shadow: 0 12px 32px rgba(0,0,0,0.4);
}

.nyamaaa:not(:disabled):active {
  transform: scale(0.88);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  transition: transform 0.07s ease;
}

.nyamaaa img {
  width: 80px;
  height: 80px;
  object-fit: contain;
}

.nyamaaa .icon {
  font-size: 52px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nyamaaa p {
  font-weight: 700;
  font-size: 12px;
  color: #fff;
  letter-spacing: 0.05em;
  margin: 0;
  text-transform: uppercase;
}

/* Inactive / coming soon */
.nyamaaa-soon {
  background: rgba(40, 42, 54, 0.5);
  border-color: rgba(255,255,255,0.05);
  cursor: not-allowed;
  opacity: 0.45;
  filter: grayscale(0.4);
}

.nyamaaa-soon p { color: #888; }

.nyamaaa-unknown .icon { font-size: 64px; opacity: 0.4; }

.nyama-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(110, 74, 255, 0.75);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border-radius: 6px;
  text-transform: uppercase;
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

.skill-bracket {
  position: absolute;
  left: -36px;
  width: 30px;
  pointer-events: auto;
  z-index: 3;
  display: flex;
  flex-direction: row;
  align-items: stretch;
}

.skill-bracket-controls {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
  margin-right: 2px;
}

.skill-bracket:hover .skill-bracket-controls {
  opacity: 1;
}

.skill-bracket-move {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  width: 16px;
  height: 16px;
  border-radius: 3px;
  font-size: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.skill-bracket-move:hover {
  background: rgba(23, 103, 253, 0.2);
  color: #fff;
}

.skill-bracket-line {
  width: 6px;
  border-left: 3px solid;
  border-top: 3px solid;
  border-bottom: 3px solid;
  border-right: none;
  border-radius: 4px 0 0 4px;
  cursor: pointer;
  transition: opacity 0.2s;
  position: relative;
  flex: 1;
}

.skill-bracket-line:hover {
  opacity: 0.7;
}

.skill-bracket-label {
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateX(-100%) translateY(-50%);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

.skill-bracket:hover .skill-bracket-label {
  opacity: 1;
}

.skill-collapsed-row {
  position: absolute;
  left: 0;
  right: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 0 24px;
  cursor: pointer;
  pointer-events: auto;
  z-index: 3;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.skill-collapsed-row:hover {
  opacity: 1;
}

.skill-collapsed-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.skill-collapsed-name {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.skill-collapsed-count {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
}

.skill-collapsed-expand {
  font-size: 14px;
  color: rgba(255,255,255,0.4);
  margin-left: auto;
}

.skill-select {
  width: 100%;
  background: #18191f;
  color: #fff;
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  margin-top: 4px;
}

.skill-select option {
  background: #18191f;
  color: #fff;
}

.task-item {
  position: absolute;
  pointer-events: auto;
  cursor: move;
  user-select: none;
  border-radius: 14px;
  transition:
    top 0.35s cubic-bezier(0.4, 2, 0.6, 1),
    box-shadow 0.25s cubic-bezier(0.4, 2, 0.6, 1),
    background 0.25s,
    transform 0.25s,
    z-index 0.25s,
    border-radius 0.2s;
  will-change: top, box-shadow, background, transform, border-radius;
  z-index: 1;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.18);
  padding: 5px 24px 16px 24px;
  max-width: 100vw;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.task-item:hover {
  box-shadow:
    0 6px 24px 0 rgba(80, 200, 255, 0.18),
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
  /* gap: 8px; */
  /* white-space: nowrap; */
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 30px;
  width: auto;
  max-width: 100%;
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
  flex: 1;
}

.task-progres {
  display: flex;
  flex-direction: row;
  gap: 2px;
}

.progress-thing {
  color: white;
  font-weight: 500;
  padding-left: 5px;
  padding-right: 5px;
  border-radius: 9px;
}

.progress-icon {
  color: white;
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
  transition:
    background 0.2s,
    border 0.2s,
    box-shadow 0.2s;
}

.segment.filled {
  background: var(--segment-color, #25636a);
  opacity: 0.98;
  border: 1.5px solid #fff3;
  box-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.1);
}

.header {
  width: 100%;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #1e2025;
  min-height: 62px;
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

.header-center {
  flex: 0.9;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
}

.skills-widget {
  flex: 0.3;
  display: flex;
  height: 130px;
  align-items: center;
  justify-content: center;
  gap: 32px;
}

.header-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  position: relative;
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
  transition:
    background 0.18s,
    color 0.18s;
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
  transition:
    top 0.35s cubic-bezier(0.4, 2, 0.6, 1),
    opacity 0.2s;
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

.json-import-toggle {
  background: none;
  border: none;
  color: rgba(23, 103, 253, 0.8);
  font-size: 13px;
  cursor: pointer;
  padding: 6px 0;
  margin-top: 8px;
  display: block;
}

.json-import-toggle:hover {
  color: #1767fd;
}

.json-import-section {
  margin-top: 8px;
  padding: 12px;
  background: rgba(23, 103, 253, 0.04);
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 10px;
}

.json-import-prompt-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.json-import-hint {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  flex: 1;
}

.json-import-copy-btn {
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.3);
  color: #1767fd;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.json-import-copy-btn:hover {
  background: rgba(23, 103, 253, 0.2);
}

.json-import-textarea {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 8px;
  padding: 10px;
  color: #fff;
  font-size: 12px;
  font-family: monospace;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.json-import-textarea:focus {
  border-color: rgba(23, 103, 253, 0.5);
}

.json-import-error {
  color: #f87171;
  font-size: 12px;
  margin-top: 6px;
}

.json-import-btn {
  margin-top: 8px;
  width: 100%;
  padding: 8px;
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.json-import-btn:hover {
  filter: brightness(1.15);
}

.modal-card {
  background: #23232b;
  border-radius: 18px;
  box-shadow: 0 4px 32px 0 #0008;
  min-width: 320px;
  /* max-width: 30%; */
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
  background: rgba(84 102 121 / 0.55);
  border: 1px solid rgba(80, 90, 100, 0.18);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.08);
  transition:
    background 0.2s,
    border 0.2s,
    box-shadow 0.2s;
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
  transition:
    background 0.2s,
    box-shadow 0.2s;
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
  transition:
    background 0.18s,
    color 0.18s,
    border 0.18s;
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

.time-tracker-widget {
  flex: 0.5;
  display: flex;
  height: 130px;
  align-items: center;
  justify-content: center;
  gap: 32px;
  width: 350px;
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

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 8px 0;
}

.checkbox-input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #6e4aff;
}

.checkbox-text {
  color: #b7c9d1;
  font-size: 1.04rem;
  font-weight: 500;
  user-select: none;
}

.checkbox-label:hover .checkbox-text {
  color: #fff;
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
  transition:
    background 0.18s,
    box-shadow 0.18s;
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
  transition:
    background 0.18s,
    color 0.18s,
    border 0.18s;
}

.cancel-btn:hover {
  background: #23232b !important;
  color: #fff !important;
  border-color: #6e4aff;
}

.version-badge {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.25);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.2s;
  flex-shrink: 0;
}
.version-badge:hover {
  color: rgba(255, 255, 255, 0.6);
}

.build-info-popup {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: #1a1b26;
  border: 1px solid rgba(110, 74, 255, 0.3);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
  z-index: 1000;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  line-height: 1.8;
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 768px) {
  .main {
    height: 100vh;
    height: 100dvh;
  }

  .header {
    flex-direction: column;
    min-height: auto;
    padding: 10px 12px;
    gap: 10px;
  }

  .header-left {
    display: none;
  }

  .header-center {
    width: 100%;
    justify-content: center;
    gap: 16px;
  }

  .month-block h3 {
    font-size: 22px;
  }

  .time-tracker-widget {
    width: 100%;
    height: auto;
    flex: none;
  }

  .header-right {
    width: 100%;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .add-task-btn {
    flex: 1;
    text-align: center;
    margin-left: 0;
    padding: 10px 12px;
    font-size: 0.9rem;
    min-height: 42px;
  }

  .logout-btn {
    margin-left: 0;
    padding: 10px 12px;
    font-size: 0.9rem;
    min-height: 42px;
  }

  .version-badge,
  .build-info-popup {
    display: none;
  }

  /* Calendar: horizontal scroll */
  .body {
    min-height: auto;
    flex: 1;
    overflow-x: auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .columns-container {
    min-width: 900px;
  }

  /* Side tab */
  .taks-types-main-menu {
    display: none;
  }

  /* Modals */
  .modal-overlay,
  .modal-overlay-2 {
    padding: 0;
  }

  .modal-overlay-2 {
    align-items: flex-end;
    justify-content: center;
  }

  .modal-card {
    min-width: auto;
    width: 100vw;
    max-width: 100vw;
    border-radius: 18px 18px 0 0;
    padding: 24px 20px 28px 20px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-title {
    font-size: 1.2rem;
  }

  .add-task-form input[type="text"],
  .add-task-form input[type="date"],
  .add-task-form input[type="number"] {
    font-size: 16px;
    padding: 12px 14px;
  }

  .add-task-submit {
    padding: 14px 16px;
    font-size: 1rem;
    min-height: 44px;
  }

  /* Nyama modal — 3 in a row */
  .modal-nyama {
    max-width: 100vw;
    width: 100vw;
    padding: 24px 16px 32px;
    gap: 12px;
    border-radius: 22px 22px 0 0;
    justify-content: center;
  }

  .nyamaaa {
    width: calc((100vw - 32px - 24px) / 3);
    height: calc((100vw - 32px - 24px) / 3);
    max-width: 120px;
    max-height: 120px;
    border-radius: 16px;
  }

  .nyamaaa img {
    width: 44px;
    height: 44px;
  }

  .nyamaaa .icon {
    font-size: 32px;
  }

  .nyamaaa p {
    font-size: 10px;
  }

  .nyama-badge {
    font-size: 7px;
    padding: 1px 4px;
    top: 5px;
    right: 5px;
  }

  /* Delete confirm */
  .delete-confirm-card {
    min-width: auto;
    width: 100vw;
    border-radius: 18px 18px 0 0;
  }

  .delete-confirm-btns {
    flex-direction: column;
    gap: 10px;
  }

  .delete-confirm-btns button {
    width: 100%;
    padding: 14px;
    min-height: 44px;
  }
}
</style>
