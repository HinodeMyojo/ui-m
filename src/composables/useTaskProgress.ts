import { PROGRESS_STATUS, PROGRESS_THRESHOLDS } from "@/config/progress";
import type { Task } from "@/types/task";

const STATUS_COLORS: Record<number, string> = {
  [PROGRESS_STATUS.DONE]: "#00ff8099",
  [PROGRESS_STATUS.NORMAL]: "#00ffff99",
  [PROGRESS_STATUS.WARN]: "#ffa50099",
  [PROGRESS_STATUS.URGENT]: "#b2222299",
  [PROGRESS_STATUS.FAILED]: "#00000099",
};

export function useTaskProgress() {
  const getTaskOverdueRatio = (task: Task): number => {
    if (!task.totalSubtasks) {
      return 0;
    }

    return (
      (task.requiredSubtasks - task.completedSubtasks) /
      Math.max(task.totalSubtasks, 1)
    );
  };

  const getProgressStatus = (task: Task) => {
    if (task.totalSubtasks === task.completedSubtasks) {
      return PROGRESS_STATUS.DONE;
    }

    if (task.currentDay === PROGRESS_STATUS.FAILED) {
      return PROGRESS_STATUS.FAILED;
    }

    const overdueRatio = getTaskOverdueRatio(task);

    if (
      task.requiredSubtasks === 0 ||
      overdueRatio <= PROGRESS_THRESHOLDS.MAXIMUM_NORMAL_OVERDUE_RATIO
    ) {
      return PROGRESS_STATUS.NORMAL;
    }

    if (overdueRatio <= PROGRESS_THRESHOLDS.MAXIMUM_WARN_OVERDUE_RATIO) {
      return PROGRESS_STATUS.WARN;
    }

    return PROGRESS_STATUS.URGENT;
  };

  const getProgressColor = (status: number): string => {
    return STATUS_COLORS[status] ?? STATUS_COLORS[PROGRESS_STATUS.NORMAL];
  };

  return {
    getTaskOverdueRatio,
    getProgressStatus,
    getProgressColor,
  };
}
