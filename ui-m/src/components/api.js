// Заглушки API для задач

const fakeTasks = [
  {
    id: 1,
    title: 'Book: Grokking Algorithms',
    start: new Date(2025, 3, 2),
    end: new Date(2025, 3, 18),
    color: '#25636A',
    steps: 9,
    stepActive: 7,
  },
  {
    id: 2,
    title: 'LeetCode: 25 problems',
    start: new Date(2025, 4, 5),
    end: new Date(2025, 4, 30),
    color: '#6B3B1A',
    steps: 25,
    stepActive: 19,
  },
  {
    id: 3,
    title: 'Interviews (5)',
    start: new Date(2025, 3, 10),
    end: new Date(2025, 3, 28),
    color: '#25636A',
    steps: 5,
    stepActive: 2,
  },
  {
    id: 4,
    title: 'Hackathon Project',
    start: new Date(2025, 2, 29),
    end: new Date(2025, 3, 5),
    color: '#3B3551',
    steps: 6,
    stepActive: 3,
  },
]

let idCounter = 5

export async function fetchTasks() {
  // Здесь будет реальный запрос к бэку
  return JSON.parse(JSON.stringify(fakeTasks))
}
export async function addTaskAPI(task) {
  // Здесь будет POST на бэк
  const newTask = { ...task, id: idCounter++ }
  fakeTasks.push(newTask)
  return newTask
}
export async function deleteTaskAPI(id) {
  // Здесь будет DELETE на бэк
  const idx = fakeTasks.findIndex(t => t.id === id)
  if (idx !== -1) fakeTasks.splice(idx, 1)
  return true
}
export async function updateTaskAPI(id, patch) {
  // Здесь будет PATCH/PUT на бэк
  const idx = fakeTasks.findIndex(t => t.id === id)
  if (idx !== -1) Object.assign(fakeTasks[idx], patch)
  return fakeTasks[idx]
} 