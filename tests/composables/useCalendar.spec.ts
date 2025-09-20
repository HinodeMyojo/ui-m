import { describe, expect, it, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useCalendar } from "@/composables/useCalendar";

describe("useCalendar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("calculates days in February for leap year", () => {
    const calendar = useCalendar();
    calendar.setCurrentDate(new Date(2024, 1, 10));

    expect(calendar.daysInMonth.value).toBe(29);
  });

  it("navigates to next month", () => {
    const calendar = useCalendar();
    calendar.setCurrentDate(new Date(2023, 10, 15));
    calendar.goToNextMonth();

    expect(calendar.currentMonth.value).toBe(11);
  });

  it("navigates to previous month", () => {
    const calendar = useCalendar();
    calendar.setCurrentDate(new Date(2023, 0, 15));
    calendar.goToPrevMonth();

    expect(calendar.currentMonth.value).toBe(11);
    expect(calendar.currentYear.value).toBe(2022);
  });
});
