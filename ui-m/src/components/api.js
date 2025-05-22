// Заглушки API для задач

const fakeTasks = [
  {
    id: 1,
    title: 'Сдать все предметы по ВУЗУ',
    start: new Date(2025, 5, 20),
    end: new Date(2025, 5, 29),
    color: '#25636A',
    steps: 1,
    stepActive: 0,
  },
  {
    id: 2,
    title: 'Пройти LeetCode 75 (7 задач)',
    start: new Date(2025, 5, 20),
    end: new Date(2025, 5, 31),
    color: '#6B3B1A',
    steps: 7,
    stepActive: 0,
  },
  {
    id: 3,
    title: 'Пройти 5 собесов',
    start: new Date(2025, 5, 1),
    end: new Date(2025, 5, 31),
    color: '#25636A',
    steps: 5,
    stepActive: 2,
  },
  {
    id: 4,
    title: 'Книга по памяти .net',
    start: new Date(2025, 5, 16),
    end: new Date(2025, 5, 31),
    color: '#3B3551',
    steps: 6,
    stepActive: 1,
  },
  {
    id: 5,
    title: 'Сайт месячного календаря',
    start: new Date(2025, 5, 18),
    end: new Date(2025, 5, 31),
    color: '#531c6b',
    steps: 1,
    stepActive: 0,
  },
  {
    id: 6,
    title: 'Сайт любимкинс',
    start: new Date(2025, 5, 18),
    end: new Date(2025, 5, 31),
    color: '#2568ba',
    steps: 1,
    stepActive: 0,
  },
]

let idCounter = 6

export async function fetchTasks() {
  // Здесь будет реальный запрос к бэку
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const formattedDate = `${yyyy}-${mm}-${dd}`;

  const response = await fetch(`http://localhost:5005/api/v1/tasks?date=${formattedDate}`);
  const data = await response.json();
  return data;

  // Возвращаем заглушку
  // return [...fakeTasks];
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