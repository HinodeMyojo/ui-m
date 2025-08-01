import router from "@/router";

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5005`;

async function authorizedFetch(url, options = {}) {
  const token = localStorage.getItem("token");

  // Создаем объект с заголовками, добавляя Authorization, если токен есть
  const headers = {
    "Content-Type": "application/json", // по умолчанию
    ...options.headers, // кастомные заголовки сверху
    ...(token ? { Authorization: `Bearer ${token}` } : {}), // Authorization сверху
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    router.push("/login");
    throw new Error("Unauthorized");
  }

  return response;
}

export async function login(password) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: "hinode",
        password: password,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw data.error;
    }
    localStorage.setItem("token", data.token.accessToken);
    return;
  } catch (error) {
    throw error;
  }
}

export async function fetchTasks(date) {
  const formattedDate = date.value.toISOString().substring(0, 10);

  const response = await authorizedFetch(
    `${API_BASE_URL}/api/v1/tasks/?date=${formattedDate}`
  );
  const data = await response.json();
  return data;
}

export async function checkTask(id, isCompleted) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/tasks/check`, {
    method: "POST",
    body: JSON.stringify({
      taskId: id,
      isCompleted: isCompleted,
    }),
  });
}

export async function fetchProgress(taskId) {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/v1/tasks/progress/${taskId}`
  );
  const data = await response.json();
  return data;
}

export async function fetchTask(id) {
  // Здесь будет реальный запрос к бэку
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/tasks/${id}`);
  const data = await response.json();
  return data;
}
export async function addTaskAPI(task) {
  const newTask = {
    title: task.title,
    description: task.description ?? "", // если описание не указано — будет пустым
    start: task.start || null,
    end: task.end || null,
    color: task.color || null,
    parentId: task.parentId || null,
    subtasks: (task.subtasks || []).map((subtask) => ({
      title: subtask.title,
      description: subtask.description ?? "", // опционально
      color: task.color, // наследуем цвет от родительской задачи
      parentId: null,
      subtasks: [], // пока без вложенности
      position: subtask.position,
    })),
  };

  await authorizedFetch(`${API_BASE_URL}/api/v1/tasks/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newTask),
  });
}

export async function deleteTaskAPI(id) {
  // Здесь будет DELETE на бэк
  await authorizedFetch(`${API_BASE_URL}/api/v1/tasks/?id=${id}`, {
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
  await authorizedFetch(`${API_BASE_URL}/api/v1/tasks/?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(updateTask),
  });
}
