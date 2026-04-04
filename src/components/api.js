import router from "@/router";

const API_BASE_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//82.202.136.167:5005`;

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

// time

export async function fetchTimeEntries(date) {
  const formattedDate = date.toISOString().split("T")[0];
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/v1/time/${formattedDate}`,
  );
  return await response.json();
}

// Добавить запись времени
export async function addTimeEntry(entry) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/time`, {
    method: "POST",
    body: JSON.stringify(entry),
  });

  return await response.json();
}

// Удалить запись времени
export async function deleteTimeEntry(id) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/time/${id}`, {
    method: "DELETE",
  });

  return await response.json();
}

// Получить статистику за период
export async function fetchTimeStats(startDate, endDate) {
  const token = localStorage.getItem("token");
  const start = startDate.toISOString().split("T")[0];
  const end = endDate.toISOString().split("T")[0];

  const response = await authorizedFetch(
    `${API_BASE_URL}/api/v1/time/stats?start=${start}&end=${end}`,
  );
  return await response.json();
}

// jobs api
export async function fetchJobs() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/jobs`);
  const data = await response.json();
  return data;
}

export async function fetchJob(id) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/jobs/${id}`);
  const data = await response.json();
  return data;
}

export async function addJobAPI(job) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/jobs`, {
    method: "POST",
    body: JSON.stringify(job),
  });
  const data = await response.json();
  return data.id;
}

export async function updateJobAPI(id, job) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/jobs/${id}`, {
    method: "PUT",
    body: JSON.stringify(job),
  });
}

export async function deleteJobAPI(id) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/jobs/${id}`, {
    method: "DELETE",
  });
}

// salaries api
export async function fetchSalaries() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/salaries`);
  const data = await response.json();
  return data;
}

export async function fetchSalary(id) {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/v1/salaries/${id}`,
  );
  const data = await response.json();
  return data;
}

export async function addSalaryAPI(salary) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/salaries`, {
    method: "POST",
    body: JSON.stringify(salary),
  });
  const data = await response.json();
  return data.id;
}

export async function updateSalaryAPI(id, salary) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/salaries/${id}`, {
    method: "PUT",
    body: JSON.stringify(salary),
  });
}

export async function deleteSalaryAPI(id) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/salaries/${id}`, {
    method: "DELETE",
  });
}

// tasks api
export async function fetchTasks(date) {
  const formattedDate = date.value.toISOString().substring(0, 10);

  const response = await authorizedFetch(
    `${API_BASE_URL}/api/v1/tasks/?date=${formattedDate}`,
  );
  const data = await response.json();
  return data;
}

// Новый метод для получения глобальных задач
export async function fetchGlobalTasks() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/tasks/global`);
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
    `${API_BASE_URL}/api/v1/tasks/progress/${taskId}`,
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
    description: task.description ?? "",
    start: task.start || null,
    end: task.end || null,
    color: task.color || null,
    parentId: task.parentId || null,
    sticker: task.sticker || null,
    isGlobal: task.isGlobal || false,
    learningSkillId: task.learningSkillId || null,
    learningGradeId: task.learningGradeId || null,
    subtasks: (task.subtasks || []).map((subtask) => ({
      title: subtask.title,
      description: subtask.description ?? "",
      color: task.color,
      parentId: null,
      subtasks: [],
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
  await authorizedFetch(`${API_BASE_URL}/api/v1/tasks/?id=${id}`, {
    method: "DELETE",
  });
}

// chat api
export async function fetchChatMessages(chatId, context) {
  let url = `${API_BASE_URL}/api/v1/chats/messages?chat_id=${chatId}`;
  if (context) url += `&context=${encodeURIComponent(context)}`;
  const response = await authorizedFetch(url);
  return await response.json();
}

export async function sendChatMessage(chatId, text, context, files, images) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("text", text);
  formData.append("context", context || "task");
  if (images) for (const img of images) formData.append("images", img);
  if (files) for (const f of files) formData.append("files", f);

  const response = await fetch(`${API_BASE_URL}/api/v1/chats/message`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (response.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  return await response.json();
}

// vocabulary api
export async function fetchVocabCards() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/vocab`);
  return await response.json();
}

export async function fetchDueCards() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/vocab/due`);
  return await response.json();
}

export async function addVocabCard(card) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/vocab`, {
    method: "POST",
    body: JSON.stringify(card),
  });
  return await response.json();
}

export async function reviewVocabCard(id, quality) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/vocab/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ quality }),
  });
}

export async function deleteVocabCard(id) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/vocab/${id}`, {
    method: "DELETE",
  });
}

export async function lookupVocabWord(word) {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/v1/vocab/lookup?word=${encodeURIComponent(word)}`,
  );
  return await response.json();
}

export async function reorderTasksAPI(items) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/tasks/reorder`, {
    method: "POST",
    body: JSON.stringify(items),
  });
}

export async function updateTaskAPI(id, patch) {
  const updateTask = {
    title: patch.title,
    start: patch.start,
    end: patch.end,
    steps: [],
    color: patch.color,
    isGlobal: patch.isGlobal || false,
  };
  await authorizedFetch(`${API_BASE_URL}/api/v1/tasks/?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(updateTask),
  });
}

// journey map api
export async function fetchJourneyMonth(month, year) {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/v1/journey?month=${month}&year=${year}`,
  );
  return await response.json();
}

export async function upsertJourneyDay(data) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/journey/day`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteJourneyDay(id) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/journey/day/${id}`, {
    method: "DELETE",
  });
}

export async function updateJourneySettings(data) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/journey/settings`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// journey stickers
export async function createJourneySticker(data) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/journey/stickers`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return await response.json();
}

export async function updateJourneySticker(id, data) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/journey/stickers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteJourneySticker(id) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/journey/stickers/${id}`, {
    method: "DELETE",
  });
}

// journey music
export async function uploadJourneyMusic(month, year, title, file) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", file);
  formData.append("month", String(month));
  formData.append("year", String(year));
  formData.append("title", title || file.name);

  const response = await fetch(`${API_BASE_URL}/api/v1/journey/music`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  return await response.json();
}

export function getJourneyMusicStreamUrl(id) {
  return `${API_BASE_URL}/api/v1/journey/music/${id}/stream`;
}

export async function deleteJourneyMusic(id) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/journey/music/${id}`, {
    method: "DELETE",
  });
}

export async function fetchJourneyMusicLibrary() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/journey/music/library`);
  return await response.json();
}

export async function linkJourneyMusic(sourceId, month, year) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/journey/music/link`, {
    method: "POST",
    body: JSON.stringify({ sourceId, month, year }),
  });
  return await response.json();
}

// === Learning Skills API ===

export async function fetchLearningSkills() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills`);
  return await response.json();
}

export async function fetchLearningSkill(id) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/${id}`);
  return await response.json();
}

export async function createLearningSkill(data) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return await response.json();
}

export async function updateLearningSkill(id, data) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteLearningSkill(id) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/${id}`, {
    method: "DELETE",
  });
}

// Grades
export async function createLearningGrade(data) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/grades`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return await response.json();
}

export async function updateLearningGrade(id, data) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/grades/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteLearningGrade(id) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/grades/${id}`, {
    method: "DELETE",
  });
}

// Exams
export async function createLearningExam(data) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/exams`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return await response.json();
}

export async function updateLearningExam(id, data) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/exams/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteLearningExam(id) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/exams/${id}`, {
    method: "DELETE",
  });
}

// Month plan
export async function fetchLearningMonthPlan(month, year) {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/v1/learning-skills/month-plan?month=${month}&year=${year}`,
  );
  return await response.json();
}

export async function setLearningMonthPlan(data) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/month-plan`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Assign task to skill
export async function assignTaskLearningSkill(taskId, learningSkillId, learningGradeId) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/assign-task`, {
    method: "POST",
    body: JSON.stringify({ taskId, learningSkillId, learningGradeId }),
  });
}

export async function removeLearningMonthPlan(learningSkillId, month, year) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/month-plan`, {
    method: "DELETE",
    body: JSON.stringify({ learningSkillId, month, year }),
  });
}

export async function importLearningGrades(learningSkillId, grades) {
  await authorizedFetch(`${API_BASE_URL}/api/v1/learning-skills/import-grades`, {
    method: "POST",
    body: JSON.stringify({ learningSkillId, grades }),
  });
}
