<template>
  <div class="calendar-container">
    <CalendarHeader
      :month-label="monthLabel"
      :year="calendar.currentYear.value"
      @prev="calendar.goToPrevMonth"
      @next="calendar.goToNextMonth"
      @add="openAddModal"
      @logout="logout"
    />
    <main class="calendar-container__body">
      <div class="calendar-container__sidebar">
        <h3>Home</h3>
      </div>
      <CalendarGrid
        :days="calendar.days.value"
        :is-today="calendar.isToday"
        :calendar-ref-setter="setCalendarElement"
      >
        <TaskList
          :tasks="visibleTasks"
          :days-in-month="calendar.daysInMonth.value"
          :drop-index="dropIndex"
          :dragged-task-id="draggedTaskId"
          :hovered-task-id="hoveredTaskId"
          :calc-task-width="calcTaskWidth"
          :format-short-date-range="formatShortDateRange"
          :format-date="formatDate"
          :container-ref-setter="setTasksContainer"
          @dragover="handleDragOver"
          @drop="handleDrop"
          @dragstart="onTaskDragStart"
          @dragend="onTaskDragEnd"
          @hover="onTaskHover"
          @task-click="handleTaskClick"
        />
      </CalendarGrid>
    </main>

    <AddTaskModal
      :open="addModal.isOpen.value"
      @submit="handleAddTaskSubmit"
      @close="addModal.close"
    />

    <EditTaskModal
      :open="editModal.isOpen.value"
      :task="taskToEdit"
      @submit="handleEditTaskSubmit"
      @close="closeEditModal"
    />

    <DeleteConfirmModal
      :open="deleteModal.isOpen.value"
      :task-title="taskToDelete?.title ?? ''"
      @confirm="handleDeleteConfirm"
      @close="closeDeleteModal"
    />

    <TaskDetailsModal
      :open="detailsModal.isOpen.value && !!selectedTaskView"
      :task="selectedTaskView"
      :format-date="formatDate"
      @close="closeDetailsModal"
      @edit="editFromDetails"
      @delete="deleteFromDetails"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import CalendarHeader from "./CalendarHeader.vue";
import CalendarGrid from "./CalendarGrid.vue";
import TaskList from "@/components/Tasks/TaskList.vue";
import AddTaskModal from "@/components/Modals/AddTaskModal.vue";
import EditTaskModal from "@/components/Modals/EditTaskModal.vue";
import DeleteConfirmModal from "@/components/Modals/DeleteConfirmModal.vue";
import TaskDetailsModal from "@/components/Modals/TaskDetailsModal.vue";
import { useCalendar } from "@/composables/useCalendar";
import { useTasks } from "@/composables/useTasks";
import { useDragAndDrop } from "@/composables/useDragAndDrop";
import { useModal } from "@/composables/useModal";
import { useKeyboardNavigation } from "@/composables/useKeyboardNavigation";
import type { CalendarTaskView } from "@/composables/useTasks";
import type { TaskDraft, TaskUpdatePayload, Task } from "@/types/task";

const router = useRouter();

const calendar = useCalendar();
const monthLabel = computed(() => calendar.formatMonthLabel.value);

const {
  visibleTasks,
  selectedTask,
  selectedTaskView,
  formatDate,
  formatShortDateRange,
  calcTaskWidth,
  addTask,
  updateTask,
  removeTask,
  openTaskDetails,
  closeTaskDetails,
  reorderTasks,
  setCalendarWidth,
} = useTasks(calendar);

const calendarElement = ref<HTMLElement | null>(null);
const tasksContainerElement = ref<HTMLElement | null>(null);

const setCalendarElement = (el: HTMLElement | null) => {
  calendarElement.value = el;
  if (el) {
    setCalendarWidth(el.offsetWidth);
  }
};

const setTasksContainer = (el: HTMLElement | null) => {
  tasksContainerElement.value = el;
};

const hoveredTaskId = ref<string | null>(null);

const addModal = useModal();
const editModal = useModal();
const deleteModal = useModal();
const detailsModal = useModal();

const taskToEdit = ref<CalendarTaskView | null>(null);
const taskToDelete = ref<CalendarTaskView | null>(null);

const {
  draggedTaskId,
  dropIndex,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDrop,
} = useDragAndDrop({
  tasks: visibleTasks,
  containerRef: tasksContainerElement,
  onReorder: reorderTasks,
});

const updateCalendarWidth = () => {
  if (calendarElement.value) {
    setCalendarWidth(calendarElement.value.offsetWidth);
  }
};

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  updateCalendarWidth();
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => updateCalendarWidth());
    if (calendarElement.value) {
      resizeObserver.observe(calendarElement.value);
    }
  } else {
    window.addEventListener("resize", updateCalendarWidth);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver && calendarElement.value) {
    resizeObserver.unobserve(calendarElement.value);
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  window.removeEventListener("resize", updateCalendarWidth);
});

const openAddModal = () => {
  addModal.open();
};

const handleAddTaskSubmit = async (task: TaskDraft) => {
  await addTask(task);
};

const closeEditModal = () => {
  editModal.close();
  taskToEdit.value = null;
};

const handleEditTaskSubmit = async (payload: TaskUpdatePayload) => {
  await updateTask(payload);
  closeEditModal();
};

const closeDeleteModal = () => {
  deleteModal.close();
  taskToDelete.value = null;
};

const handleDeleteConfirm = async () => {
  if (taskToDelete.value) {
    await removeTask(taskToDelete.value.id);
  }
  closeDeleteModal();
  closeDetailsModal();
};

const closeDetailsModal = () => {
  detailsModal.close();
  closeTaskDetails();
};

const handleTaskClick = async (task: CalendarTaskView) => {
  await openTaskDetails(task);
  detailsModal.open();
};

const onTaskHover = ({ value, task }: { value: boolean; task: CalendarTaskView }) => {
  hoveredTaskId.value = value ? task.id : hoveredTaskId.value === task.id ? null : hoveredTaskId.value;
};

const onTaskDragStart = ({ event, task }: { event: DragEvent; task: CalendarTaskView }) => {
  handleDragStart(task.id, event);
};

const onTaskDragEnd = () => {
  handleDragEnd();
};

const editFromDetails = () => {
  if (!selectedTaskView.value) {
    return;
  }
  taskToEdit.value = selectedTaskView.value;
  editModal.open();
  closeDetailsModal();
};

const deleteFromDetails = () => {
  if (!selectedTaskView.value) {
    return;
  }
  taskToDelete.value = selectedTaskView.value;
  deleteModal.open();
};

const logout = () => {
  localStorage.removeItem("token");
  router.push("/login");
};

useKeyboardNavigation({
  onPrev: calendar.goToPrevMonth,
  onNext: calendar.goToNextMonth,
  isEnabled: () =>
    !addModal.isOpen.value &&
    !editModal.isOpen.value &&
    !deleteModal.isOpen.value &&
    !detailsModal.isOpen.value,
});
</script>

<style scoped>
.calendar-container {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.calendar-container__body {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  position: relative;
}

.calendar-container__sidebar {
  position: absolute;
  background-color: #6200ff52;
  height: 170px;
  max-width: 35px;
  left: -30px;
  top: 0;
  border-top-left-radius: 15px;
  border-bottom-left-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(0deg);
}

.calendar-container__sidebar h3 {
  transform: rotate(270deg);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #fff;
  opacity: 0.8;
}
</style>
