export interface Subtask {
  id?: string;
  title: string;
  description?: string;
  completed?: boolean;
  position?: number;
  color?: string | null;
  parentId?: string | null;
}

export interface TaskProgressMetrics {
  totalSubtasks: number;
  completedSubtasks: number;
  requiredSubtasks: number;
  currentDay: number;
}

export interface TaskBase {
  id: string;
  title: string;
  description?: string;
  color: string;
}

export interface TaskTimeframe {
  start: Date;
  end: Date;
  totalDays: number;
}

export interface Task extends TaskBase, TaskTimeframe, TaskProgressMetrics {
  subtasks: Subtask[];
  stepActive: number;
  steps: number;
  parentId?: string | null;
}

export interface TaskDraft {
  title: string;
  description?: string;
  color: string;
  start: Date | null;
  end: Date | null;
  subtasks: Subtask[];
}

export interface CalendarDate {
  year: number;
  month: number;
  date: number;
}

export interface TaskUpdatePayload {
  id: string;
  title: string;
  color: string;
  start: Date;
  end: Date;
  steps: number;
  stepActive: number;
}
