import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  fetchTasks as fetchTasksAPI,
  addTaskAPI,
  deleteTaskAPI,
  updateTaskAPI,
  fetchTask as fetchTaskAPI,
} from "@/components/api.js";
import type { Task, TaskDraft, TaskUpdatePayload } from "@/types/task";

function toDate(value: string | Date | null | undefined): Date {
  if (!value) {
    return new Date();
  }

  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
}

function calculateTotalDays(start: Date, end: Date): number {
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}

function normalizeTask(task: any): Task {
  const start = toDate(task.start ?? task.startDate ?? task.begin);
  const end = toDate(task.end ?? task.endDate ?? task.finish);

  const subtasks = Array.isArray(task.subtasks)
    ? task.subtasks.map((subtask: any, index: number) => ({
        id: subtask.id ?? `${task.id}-sub-${index}`,
        title: subtask.title ?? subtask.name ?? "",
        description: subtask.description ?? "",
        completed: subtask.completed ?? subtask.isCompleted ?? false,
        position: subtask.position ?? index,
        color: subtask.color ?? task.color ?? null,
        parentId: subtask.parentId ?? null,
      }))
    : [];

  const fallbackId = `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const generatedId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : fallbackId;

  return {
    id: String(task.id ?? generatedId),
    title: task.title ?? task.name ?? "",
    description: task.description ?? "",
    color: task.color ?? "#25636A",
    start,
    end,
    totalDays: task.totalDays ?? calculateTotalDays(start, end),
    subtasks,
    steps: task.steps ?? 0,
    stepActive: task.stepActive ?? task.activeStep ?? 0,
    totalSubtasks: task.totalSubtasks ?? subtasks.length,
    completedSubtasks: task.completedSubtasks ??
      subtasks.filter((subtask: any) => subtask.completed).length,
    requiredSubtasks: task.requiredSubtasks ?? subtasks.length,
    currentDay: task.currentDay ?? 0,
    parentId: task.parentId ?? null,
  };
}

export const useTasksStore = defineStore("tasks", () => {
  const tasks = ref<Task[]>([]);
  const currentDate = ref<Date>(new Date());
  const selectedTask = ref<Task | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const hasTasks = computed(() => tasks.value.length > 0);

  function setCurrentDate(date: Date) {
    currentDate.value = date;
  }

  function setTasks(nextTasks: Task[]) {
    tasks.value = nextTasks;
  }

  async function fetchTasks(date?: Date) {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await fetchTasksAPI(date ?? currentDate.value);
      const normalized = Array.isArray(result)
        ? result.map((task) => normalizeTask(task))
        : [];
      setTasks(normalized);
    } catch (err: any) {
      error.value = err?.message ?? "Не удалось загрузить задачи";
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function addTask(task: TaskDraft) {
    isLoading.value = true;
    error.value = null;

    try {
      await addTaskAPI({
        ...task,
        start: task.start,
        end: task.end,
      });
      await fetchTasks();
    } catch (err: any) {
      error.value = err?.message ?? "Не удалось создать задачу";
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function updateTask(payload: TaskUpdatePayload) {
    isLoading.value = true;
    error.value = null;

    try {
      await updateTaskAPI(payload.id, {
        title: payload.title,
        start: payload.start,
        end: payload.end,
        color: payload.color,
        steps: payload.steps,
        stepActive: payload.stepActive,
      });
      await fetchTasks();
    } catch (err: any) {
      error.value = err?.message ?? "Не удалось обновить задачу";
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function removeTask(id: string) {
    isLoading.value = true;
    error.value = null;

    try {
      await deleteTaskAPI(id);
      await fetchTasks();
    } catch (err: any) {
      error.value = err?.message ?? "Не удалось удалить задачу";
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchTaskDetails(id: string) {
    isLoading.value = true;
    error.value = null;

    try {
      const task = await fetchTaskAPI(id);
      selectedTask.value = normalizeTask(task);
      return selectedTask.value;
    } catch (err: any) {
      error.value = err?.message ?? "Не удалось загрузить задачу";
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  function selectTask(task: Task | null) {
    selectedTask.value = task;
  }

  function reorderTasks(draggedId: string, targetIndex: number) {
    const index = tasks.value.findIndex((task) => task.id === draggedId);
    if (index === -1) {
      return;
    }

    const updated = [...tasks.value];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setTasks(updated);
  }

  return {
    tasks,
    currentDate,
    selectedTask,
    isLoading,
    error,
    hasTasks,
    setCurrentDate,
    setTasks,
    fetchTasks,
    addTask,
    updateTask,
    removeTask,
    fetchTaskDetails,
    selectTask,
    reorderTasks,
  };
});
