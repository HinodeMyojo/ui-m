import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useTasksStore } from "@/stores/tasksStore";

export function useCalendar() {
  const tasksStore = useTasksStore();
  const { currentDate } = storeToRefs(tasksStore);

  const currentMonth = computed(() => currentDate.value.getMonth());
  const currentYear = computed(() => currentDate.value.getFullYear());

  const daysInMonth = computed(() =>
    new Date(currentYear.value, currentMonth.value + 1, 0).getDate()
  );

  const days = computed(() =>
    Array.from({ length: daysInMonth.value }, (_, index) => index + 1)
  );

  const monthStart = computed(
    () => new Date(currentYear.value, currentMonth.value, 1)
  );

  const monthEnd = computed(
    () => new Date(currentYear.value, currentMonth.value, daysInMonth.value)
  );

  function setCurrentDate(date: Date) {
    tasksStore.setCurrentDate(date);
  }

  function changeMonth(offset: number) {
    const targetDate = new Date(
      currentYear.value,
      currentMonth.value + offset,
      Math.min(currentDate.value.getDate(), daysInMonth.value)
    );
    setCurrentDate(targetDate);
  }

  const goToPrevMonth = () => changeMonth(-1);
  const goToNextMonth = () => changeMonth(1);

  const formatMonthLabel = computed(() =>
    new Date(currentYear.value, currentMonth.value, 1)
      .toLocaleString("default", { month: "long" })
      .toUpperCase()
  );

  function isToday(day: number) {
    const today = new Date();
    return (
      today.getFullYear() === currentYear.value &&
      today.getMonth() === currentMonth.value &&
      today.getDate() === day
    );
  }

  return {
    currentDate,
    currentMonth,
    currentYear,
    daysInMonth,
    days,
    monthStart,
    monthEnd,
    setCurrentDate,
    changeMonth,
    goToPrevMonth,
    goToNextMonth,
    formatMonthLabel,
    isToday,
  };
}
