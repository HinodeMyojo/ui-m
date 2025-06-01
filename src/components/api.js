export async function fetchTasks() {
  // Здесь будет реальный запрос к бэку
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const formattedDate = `${yyyy}-${mm}-${dd}`;

  const response = await fetch(
    `http://localhost:5005/api/v1/tasks?date=${formattedDate}`
  );
  const data = await response.json();
  console.log(data);
  return data;

  // Возвращаем заглушку
  // return [...fakeTasks];
}

export async function fetchTask(id) {
  // Здесь будет реальный запрос к бэку
  const response = await fetch(`http://localhost:5005/api/v1/tasks/${id}`);
  const data = await response.json();
  console.log(data);
  return data;
}
export async function addTaskAPI(task) {
  console.log("raw task:", task);

  const newTask = {
    title: task.title,
    description: task.description ?? "", // если описание не указано — будет пустым
    start: task.start,
    end: task.end,
    color: task.color,
    parentId: null,
    subtasks: (task.subtasks || []).map((subtask) => ({
      title: subtask.title,
      description: subtask.description ?? "", // опционально
      color: task.color, // наследуем цвет от родительской задачи
      parentId: null,
      subtasks: [], // пока без вложенности
    })),
  };

  console.log("newTask to send:", newTask);

  await fetch(`http://localhost:5005/api/v1/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newTask),
  });
}

export async function deleteTaskAPI(id) {
  // Здесь будет DELETE на бэк
  await fetch(`http://localhost:5005/api/v1/tasks/?id=${id}`, {
    method: "DELETE",
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
  };
  await fetch(`http://localhost:5005/api/v1/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify(updateTask),
  });
}
