import { ref, type ComputedRef, type Ref } from "vue";
import type { CalendarTaskView } from "@/composables/useTasks";
import { CALENDAR_CONFIG } from "@/config/calendar";

interface UseDragAndDropOptions {
  tasks: ComputedRef<CalendarTaskView[]>;
  containerRef: Ref<HTMLElement | null>;
  onReorder: (draggedId: string, targetIndex: number) => void;
}

export function useDragAndDrop({
  tasks,
  containerRef,
  onReorder,
}: UseDragAndDropOptions) {
  const draggedTaskId = ref<string | null>(null);
  const dragOverTaskId = ref<string | null>(null);
  const dropIndex = ref<number | null>(null);

  const handleDragStart = (taskId: string, event: DragEvent) => {
    draggedTaskId.value = taskId;
    event.dataTransfer?.setData("text/plain", taskId);
    event.dataTransfer?.setDragImage?.(event.currentTarget as Element, 10, 10);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragEnter = (taskId: string) => {
    dragOverTaskId.value = taskId;
  };

  const handleDragLeave = () => {
    dragOverTaskId.value = null;
  };

  const handleDragEnd = () => {
    dragOverTaskId.value = null;
    dropIndex.value = null;
    draggedTaskId.value = null;
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    const container = containerRef.value;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const y = event.clientY - rect.top;
    let index = Math.floor(
      (y - CALENDAR_CONFIG.TASKS_TOP_OFFSET) /
        CALENDAR_CONFIG.TASK_TOTAL_HEIGHT
    );

    if (index < 0) {
      index = 0;
    }

    if (index > tasks.value.length) {
      index = tasks.value.length;
    }

    dropIndex.value = index;
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();

    if (draggedTaskId.value === null || dropIndex.value === null) {
      return;
    }

    onReorder(draggedTaskId.value, dropIndex.value);

    dropIndex.value = null;
    draggedTaskId.value = null;
    dragOverTaskId.value = null;
  };

  return {
    draggedTaskId,
    dragOverTaskId,
    dropIndex,
    handleDragStart,
    handleDragEnter,
    handleDragLeave,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  };
}
