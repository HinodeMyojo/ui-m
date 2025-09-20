import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TaskItem from "@/components/Tasks/TaskItem.vue";
import type { CalendarTaskView } from "@/composables/useTasks";

const task: CalendarTaskView = {
  id: "1",
  title: "Test task",
  description: "",
  color: "#25636A",
  start: new Date(2024, 0, 1),
  end: new Date(2024, 0, 3),
  totalDays: 3,
  subtasks: [],
  steps: 3,
  stepActive: 1,
  totalSubtasks: 3,
  completedSubtasks: 1,
  requiredSubtasks: 3,
  currentDay: 0,
  startDay: 1,
  endDay: 3,
  progressStatus: 0,
  progressColor: "#00ffff99",
};

describe("TaskItem", () => {
  it("renders task title", () => {
    const wrapper = mount(TaskItem, {
      props: {
        task,
        top: 10,
        leftPercent: 0,
        width: 150,
        height: 75,
        hovered: false,
        isDragging: false,
        formatShortDateRange: () => "1-3 янв",
        formatDate: () => "1 янв",
      },
    });

    expect(wrapper.text()).toContain("Test task");
  });
});
