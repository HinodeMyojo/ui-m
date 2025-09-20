import { describe, expect, it } from "vitest";
import { useTaskProgress } from "@/composables/useTaskProgress";
import { PROGRESS_STATUS } from "@/config/progress";
import type { Task } from "@/types/task";

const baseTask: Task = {
  id: "1",
  title: "Test task",
  color: "#25636A",
  description: "",
  start: new Date(2024, 0, 1),
  end: new Date(2024, 0, 5),
  totalDays: 5,
  subtasks: [],
  steps: 4,
  stepActive: 2,
  totalSubtasks: 4,
  completedSubtasks: 2,
  requiredSubtasks: 4,
  currentDay: 0,
};

describe("useTaskProgress", () => {
  const { getProgressStatus, getProgressColor } = useTaskProgress();

  it("marks task as done when all subtasks completed", () => {
    const task: Task = {
      ...baseTask,
      completedSubtasks: 4,
    };

    expect(getProgressStatus(task)).toBe(PROGRESS_STATUS.DONE);
  });

  it("marks task as urgent when overdue", () => {
    const task: Task = {
      ...baseTask,
      completedSubtasks: 0,
      requiredSubtasks: 4,
      totalSubtasks: 4,
    };

    expect(getProgressStatus(task)).toBe(PROGRESS_STATUS.URGENT);
  });

  it("returns color for status", () => {
    const color = getProgressColor(PROGRESS_STATUS.NORMAL);
    expect(color).toBeTruthy();
  });
});
