export const PROGRESS_STATUS = {
  DONE: 999,
  NORMAL: 0,
  WARN: 1,
  URGENT: 2,
  FAILED: -1,
} as const;

export type ProgressStatus = (typeof PROGRESS_STATUS)[keyof typeof PROGRESS_STATUS];

export const PROGRESS_THRESHOLDS = {
  MAXIMUM_NORMAL_OVERDUE_RATIO: 0.125,
  MAXIMUM_WARN_OVERDUE_RATIO: 0.25,
} as const;
