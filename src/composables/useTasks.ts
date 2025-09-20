import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import confetti from "canvas-confetti";
import { storeToRefs } from "pinia";
import {
  CALENDAR_CONFIG,
  CONFETTI_COLORS,
  CONFETTI_DELAY_MS,
  CONFETTI_PRESETS,
  DEFAULT_TASK_COLOR,
} from "@/config/calendar";
import { useTasksStore } from "@/stores/tasksStore";
import type { Task, TaskDraft, TaskUpdatePayload } from "@/types/task";
import { useTaskProgress } from "@/composables/useTaskProgress";
import { useErrorHandler } from "@/composables/useErrorHandler";

export interface CalendarContext {
  currentDate: Ref<Date>;
  monthStart: ComputedRef<Date>;
  monthEnd: ComputedRef<Date>;
  daysInMonth: ComputedRef<number>;
}

export interface CalendarTaskView extends Task {
  startDay: number;
  endDay: number;
  progressStatus: number;
  progressColor: string;
}

function runConfetti() {
  setTimeout(() => {
    CONFETTI_PRESETS.forEach((preset) =>
      confetti({
        ...preset,
        colors: CONFETTI_COLORS,
      })
    );
  }, CONFETTI_DELAY_MS);
}

export function useTasks(calendar: CalendarContext) {
  const tasksStore = useTasksStore();
  const { tasks, selectedTask, isLoading, error } = storeToRefs(tasksStore);
  const { getProgressStatus, getProgressColor } = useTaskProgress();
  const { handleAsyncOperation } = useErrorHandler();

  const calendarWidth = ref(0);

  const minTaskWidth = computed(() => {
    if (!calendar.daysInMonth.value) {
      return CALENDAR_CONFIG.MIN_TASK_WIDTH;
    }

    const calculated = calendarWidth.value / calendar.daysInMonth.value;
    return Math.max(CALENDAR_CONFIG.MIN_TASK_WIDTH, calculated || 0);
  });

  const visibleTasks = computed(() => {
    const monthStart = calendar.monthStart.value.getTime();
    const monthEnd = calendar.monthEnd.value.getTime();

    return tasks.value
      .map((task) => {
        const start = task.start.getTime();
        const end = task.end.getTime();

        if (end < monthStart || start > monthEnd) {
          return null;
        }

        const normalizedStart = new Date(
          Math.max(start, monthStart)
        ).getDate();
        const normalizedEnd = new Date(Math.min(end, monthEnd)).getDate();

        const progressStatus = getProgressStatus(task);

        return {
          ...task,
          startDay: normalizedStart,
          endDay: normalizedEnd,
          progressStatus,
          progressColor: getProgressColor(progressStatus),
        } as CalendarTaskView;
      })
      .filter((task): task is CalendarTaskView => Boolean(task));
  });

  const calcTaskWidth = (task: CalendarTaskView) => {
    const days = task.endDay - task.startDay + 1;

    if (days <= 1) {
      return minTaskWidth.value;
    }

    if (!calendarWidth.value || !calendar.daysInMonth.value) {
      return minTaskWidth.value * days;
    }

    const widthByDays =
      (calendarWidth.value / calendar.daysInMonth.value) * days;
    const maxWidth = calendarWidth.value * CALENDAR_CONFIG.MAX_TASK_WIDTH_PERC;
    return Math.min(widthByDays, maxWidth);
  };

  const formatDate = (date: Date | string) =>
    new Date(date).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });

  const formatShortDateRange = (start: Date, end: Date) => {
    if (!start || !end) {
      return "";
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    const sameMonth =
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getFullYear() === endDate.getFullYear();
    const sameYear = startDate.getFullYear() === endDate.getFullYear();

    if (sameMonth) {
      return `${startDate.getDate()}–${endDate.getDate()} ${startDate.toLocaleString(
        "ru",
        { month: "short" }
      )}`;
    }

    if (sameYear) {
      return `${startDate.getDate()} ${startDate.toLocaleString("ru", {
        month: "short",
      })} – ${endDate.getDate()} ${endDate.toLocaleString("ru", {
        month: "short",
      })}`;
    }

    const startLabel = `${startDate.getDate()} ${startDate.toLocaleString("ru", {
      month: "short",
    })} ${startDate.getFullYear().toString().slice(-2)}`;
    const endLabel = `${endDate.getDate()} ${endDate.toLocaleString("ru", {
      month: "short",
    })} ${endDate.getFullYear().toString().slice(-2)}`;

    return `${startLabel} – ${endLabel}`;
  };

  const loadTasks = async () =>
    handleAsyncOperation(
      () => tasksStore.fetchTasks(calendar.currentDate.value),
      "Не удалось загрузить задачи"
    );

  watch(
    () => calendar.currentDate.value,
    () => {
      void loadTasks();
    },
    { immediate: true }
  );

  const addTask = async (task: TaskDraft) => {
    await handleAsyncOperation(
      () =>
        tasksStore.addTask({
          ...task,
          color: task.color || DEFAULT_TASK_COLOR,
        }),
      "Не удалось создать задачу"
    );
    runConfetti();
  };

  const updateTask = async (payload: TaskUpdatePayload) =>
    handleAsyncOperation(
      () => tasksStore.updateTask(payload),
      "Не удалось обновить задачу"
    );

  const removeTask = async (id: string) =>
    handleAsyncOperation(
      () => tasksStore.removeTask(id),
      "Не удалось удалить задачу"
    );

  const openTaskDetails = async (task: Task) => {
    await handleAsyncOperation(
      () => tasksStore.fetchTaskDetails(task.id),
      "Не удалось загрузить задачу"
    );
  };

  const closeTaskDetails = () => {
    tasksStore.selectTask(null);
  };

  const selectedTaskView = computed<CalendarTaskView | null>(() => {
    if (!selectedTask.value) {
      return null;
    }

    const progressStatus = getProgressStatus(selectedTask.value);

    return {
      ...selectedTask.value,
      startDay: selectedTask.value.start.getDate(),
      endDay: selectedTask.value.end.getDate(),
      progressStatus,
      progressColor: getProgressColor(progressStatus),
    } as CalendarTaskView;
  });

  const setCalendarWidth = (width: number) => {
    calendarWidth.value = width;
  };

  const reorderTasks = (draggedId: string, targetIndex: number) => {
    tasksStore.reorderTasks(draggedId, targetIndex);
  };

  const createEmptyTaskDraft = (): TaskDraft => ({
    title: "",
    description: "",
    color: DEFAULT_TASK_COLOR,
    start: null,
    end: null,
    subtasks: [],
  });

  return {
    tasks,
    visibleTasks,
    selectedTask,
    selectedTaskView,
    isLoading,
    error,
    minTaskWidth,
    calendarWidth,
    setCalendarWidth,
    calcTaskWidth,
    formatDate,
    formatShortDateRange,
    loadTasks,
    addTask,
    updateTask,
    removeTask,
    openTaskDetails,
    closeTaskDetails,
    reorderTasks,
    createEmptyTaskDraft,
  };
}
