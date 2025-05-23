

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
  console.log(task)
  // const newTask = { ...task, id: idCounter++ }
  const newTask = {
    title: task.title,
    start: task.start,
    end: task.end,
    steps: [],
    color: task.color,
  }
  await fetch(`http://localhost:5005/api/v1/tasks`, {
    method:'POST',
    body: JSON.stringify(newTask),
  });
  // fakeTasks.push(newTask)
  // return newTask
}
export async function deleteTaskAPI(id) {
  // Здесь будет DELETE на бэк
  await fetch(`http://localhost:5005/api/v1/tasks/${id}`, {
    method:'DELETE'
  });
}
export async function updateTaskAPI(id, patch) {
  // Здесь будет PATCH/PUT на бэк
  const updateTask = {
    title: patch.title,
    start: patch.start,
    end: patch.end,
    steps: [],
    color: patch.color,
  }
  await fetch(`http://localhost:5005/api/v1/tasks/${id}`, {
    method:'PUT',
    body: JSON.stringify(updateTask)
  })
} 