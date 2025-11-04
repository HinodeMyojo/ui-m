export function getTaskIcon(task) {
  if (task.sticker) return task.sticker;
  return "📌"; // дефолтная иконка
}

export function calculateTaskProgress(task) {
  if (task.subtasks === null || task.subtasks.length === 0) {
    return 0;
  } else {
    const completedSubtasks = task.subtasks.filter(
      (subtask) => subtask.completed
    );
    return Math.floor((completedSubtasks.length / task.subtasks.length) * 100);
  }
}
