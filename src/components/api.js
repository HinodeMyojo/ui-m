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

// === Testing Platform API ===

const T = `${API_BASE_URL}/api/v1/testing`;

// Suites
export async function fetchTestSuites() { return (await authorizedFetch(`${T}/suites`)).json(); }
export async function fetchTestSuite(id) { return (await authorizedFetch(`${T}/suites/${id}`)).json(); }
export async function createTestSuite(data) { return (await authorizedFetch(`${T}/suites`, { method: "POST", body: JSON.stringify(data) })).json(); }
export async function updateTestSuite(id, data) { await authorizedFetch(`${T}/suites/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteTestSuite(id) { await authorizedFetch(`${T}/suites/${id}`, { method: "DELETE" }); }

// Topics
export async function createTestTopic(data) { return (await authorizedFetch(`${T}/topics`, { method: "POST", body: JSON.stringify(data) })).json(); }
export async function updateTestTopic(id, data) { await authorizedFetch(`${T}/topics/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteTestTopic(id) { await authorizedFetch(`${T}/topics/${id}`, { method: "DELETE" }); }

// Subtopics
export async function createTestSubtopic(data) { return (await authorizedFetch(`${T}/subtopics`, { method: "POST", body: JSON.stringify(data) })).json(); }
export async function updateTestSubtopic(id, data) { await authorizedFetch(`${T}/subtopics/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteTestSubtopic(id) { await authorizedFetch(`${T}/subtopics/${id}`, { method: "DELETE" }); }

// Questions
export async function fetchTestQuestions(topicId, subtopicId) {
  let url = `${T}/questions?`;
  if (subtopicId) url += `subtopic_id=${subtopicId}`;
  else if (topicId) url += `topic_id=${topicId}`;
  return (await authorizedFetch(url)).json();
}
export async function createTestQuestion(data) { return (await authorizedFetch(`${T}/questions`, { method: "POST", body: JSON.stringify(data) })).json(); }
export async function updateTestQuestion(id, data) { await authorizedFetch(`${T}/questions/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteTestQuestion(id) { await authorizedFetch(`${T}/questions/${id}`, { method: "DELETE" }); }
export async function importTestQuestions(data) { return (await authorizedFetch(`${T}/questions/import`, { method: "POST", body: JSON.stringify(data) })).json(); }

// Exams
export async function createTestExam(data) { return (await authorizedFetch(`${T}/exams`, { method: "POST", body: JSON.stringify(data) })).json(); }
export async function fetchTestExam(id) { return (await authorizedFetch(`${T}/exams/${id}`)).json(); }
export async function submitTestAnswer(data) { await authorizedFetch(`${T}/exams/answer`, { method: "POST", body: JSON.stringify(data) }); }
export async function finishTestExam(data) { return (await authorizedFetch(`${T}/exams/finish`, { method: "POST", body: JSON.stringify(data) })).json(); }
export async function fetchExamHistory(suiteId) { return (await authorizedFetch(`${T}/exams/history?suite_id=${suiteId}`)).json(); }

// Stats
export async function fetchTestStats(suiteId) { return (await authorizedFetch(`${T}/stats?suite_id=${suiteId}`)).json(); }

// === Discipline (трекер мин/сред/макс) ===

const D = `${API_BASE_URL}/api/v1/discipline`;

// Логическая дата: до 03:00 ночи считается предыдущий день
export function disciplineLogicalToday() {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function fetchDisciplineMonth(month, year) {
  const today = disciplineLogicalToday();
  const response = await authorizedFetch(
    `${D}/month?month=${month}&year=${year}&today=${today}`,
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "не удалось загрузить месяц");
  return data;
}

export async function updateDisciplinePlan(id, data) {
  await authorizedFetch(`${D}/plan/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function createDisciplineActivity(data) {
  return (await authorizedFetch(`${D}/activities`, { method: "POST", body: JSON.stringify(data) })).json();
}

export async function updateDisciplineActivity(id, data) {
  await authorizedFetch(`${D}/activities/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteDisciplineActivity(id) {
  await authorizedFetch(`${D}/activities/${id}`, { method: "DELETE" });
}

export async function addDisciplinePlanSkill(data) {
  return (await authorizedFetch(`${D}/plan-skills`, { method: "POST", body: JSON.stringify(data) })).json();
}

export async function updateDisciplinePlanSkill(id, data) {
  await authorizedFetch(`${D}/plan-skills/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteDisciplinePlanSkill(id) {
  await authorizedFetch(`${D}/plan-skills/${id}`, { method: "DELETE" });
}

// data: { id?, date, activityId?, adhocTitle?, adhocSkillId?, level, variant? }
export async function setDisciplineEntry(data) {
  await authorizedFetch(`${D}/entry`, { method: "POST", body: JSON.stringify(data) });
}

// data: { date, learningSkillId, remove? }
export async function setDisciplineRest(data) {
  await authorizedFetch(`${D}/rest`, { method: "POST", body: JSON.stringify(data) });
}

export async function setDisciplineDayNote(data) {
  await authorizedFetch(`${D}/day-note`, { method: "PUT", body: JSON.stringify(data) });
}

// === Workspace (рабочий стол «Сегодня») ===

const W = `${API_BASE_URL}/api/v1/workspace`;

export function workspaceApiBase() {
  return API_BASE_URL;
}

export function clientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

async function workJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}

export async function fetchWorkDay(date) {
  const response = await authorizedFetch(`${W}/day?date=${date}`);
  return workJson(response, "не удалось загрузить день");
}

export async function saveWorkDay(data) {
  await authorizedFetch(`${W}/day`, { method: "PUT", body: JSON.stringify(data) });
}

export async function fetchWorkDays(from, to) {
  const response = await authorizedFetch(`${W}/days?from=${from}&to=${to}`);
  return workJson(response, "не удалось загрузить период");
}

export async function createWorkItem(data) {
  const response = await authorizedFetch(`${W}/items`, {
    method: "POST",
    body: JSON.stringify({ ...data, tz: clientTimeZone() }),
  });
  return workJson(response, "не удалось создать карточку");
}

export async function updateWorkItem(id, data) {
  const response = await authorizedFetch(`${W}/items/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ...data, tz: clientTimeZone() }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "не удалось сохранить");
}

export async function fetchWorkItem(id, date) {
  const response = await authorizedFetch(`${W}/items/${id}?date=${date}`);
  return workJson(response, "карточка не найдена");
}

export async function deleteWorkItem(id) {
  await authorizedFetch(`${W}/items/${id}`, { method: "DELETE" });
}

export async function setWorkItemStatus(id, data) {
  await authorizedFetch(`${W}/items/${id}/status`, { method: "POST", body: JSON.stringify(data) });
}

// mode: move | link | copy
export async function placeWorkItem(id, data) {
  const response = await authorizedFetch(`${W}/items/${id}/place`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось перенести карточку");
}

export async function unplaceWorkItem(id, date) {
  await authorizedFetch(`${W}/items/${id}/place?date=${date}`, { method: "DELETE" });
}

export async function reorderWorkItems(date, order) {
  await authorizedFetch(`${W}/items/reorder`, {
    method: "POST",
    body: JSON.stringify({ date, order }),
  });
}

export async function searchWorkItems(query) {
  const response = await authorizedFetch(`${W}/search?q=${encodeURIComponent(query)}`);
  return workJson(response, "поиск не удался");
}

export async function uploadWorkItemFile(id, file) {
  const token = localStorage.getItem("token");
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${W}/items/${id}/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return workJson(response, "не удалось загрузить файл");
}

export async function deleteWorkItemFile(id) {
  await authorizedFetch(`${W}/files/${id}`, { method: "DELETE" });
}

export function workFileUrl(id) {
  return `${W}/files/${id}`;
}

export function workIcsUrl(id, date) {
  return `${W}/items/${id}/ics?date=${date}`;
}

// --- Google Calendar ---

export async function fetchGoogleStatus() {
  const response = await authorizedFetch(`${W}/google/status`);
  return workJson(response, "не удалось получить статус");
}

export async function fetchGoogleAuthUrl(redirectUri) {
  const response = await authorizedFetch(
    `${W}/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`,
  );
  return workJson(response, "не удалось построить ссылку авторизации");
}

export async function exchangeGoogleCode(code, redirectUri) {
  const response = await authorizedFetch(`${W}/google/exchange`, {
    method: "POST",
    body: JSON.stringify({ code, redirectUri }),
  });
  return workJson(response, "не удалось подключить Google");
}

export async function disconnectGoogle() {
  await authorizedFetch(`${W}/google`, { method: "DELETE" });
}

export async function setGoogleCalendar(calendarId) {
  await authorizedFetch(`${W}/google/calendar`, {
    method: "PUT",
    body: JSON.stringify({ calendarId }),
  });
}

export async function syncWorkItemToGoogle(id, date) {
  const response = await authorizedFetch(
    `${W}/items/${id}/sync?date=${date}&tz=${encodeURIComponent(clientTimeZone())}`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "синхронизация не удалась");
}

export async function syncWorkDayToGoogle(date) {
  const response = await authorizedFetch(`${W}/google/sync-day`, {
    method: "POST",
    body: JSON.stringify({ date, tz: clientTimeZone() }),
  });
  return workJson(response, "синхронизация не удалась");
}

// === Task log (статусы, блокеры, решения, документы) ===

const TL = `${API_BASE_URL}/api/v1/task-log`;

export async function fetchTaskStatuses() {
  const response = await authorizedFetch(`${TL}/statuses`);
  return workJson(response, "не удалось загрузить статусы");
}

export async function createTaskStatus(data) {
  const response = await authorizedFetch(`${TL}/statuses`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать статус");
}

export async function updateTaskStatus(id, data) {
  await authorizedFetch(`${TL}/statuses/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteTaskStatus(id) {
  await authorizedFetch(`${TL}/statuses/${id}`, { method: "DELETE" });
}

export async function reorderTaskStatuses(order) {
  await authorizedFetch(`${TL}/statuses/reorder`, {
    method: "POST",
    body: JSON.stringify({ order }),
  });
}

// Полная панель задачи: статус, подзадачи со статусами и блокерами, вся лента
export async function fetchTaskLogBoard(taskId) {
  const response = await authorizedFetch(`${TL}/board/${taskId}`);
  return workJson(response, "не удалось загрузить ленту задачи");
}

// Лента одной задачи/подзадачи
export async function fetchTaskLogEntries(taskId) {
  const response = await authorizedFetch(`${TL}/entries?taskId=${taskId}`);
  return workJson(response, "не удалось загрузить ленту");
}

// Сводка по одной задаче/подзадаче
export async function fetchTaskLogNode(taskId) {
  const response = await authorizedFetch(`${TL}/node/${taskId}`);
  return workJson(response, "не удалось загрузить сводку");
}

// data: { taskId, kind, text, url?, statusId?, entryDate?, workItemId? }
export async function createTaskLogEntry(data) {
  const response = await authorizedFetch(`${TL}/entries`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось добавить запись");
}

export async function updateTaskLogEntry(id, data) {
  await authorizedFetch(`${TL}/entries/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteTaskLogEntry(id) {
  await authorizedFetch(`${TL}/entries/${id}`, { method: "DELETE" });
}

// note — необязательная причина снятия блокера
export async function resolveTaskLogEntry(id, resolved, note = "") {
  await authorizedFetch(`${TL}/entries/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolved, note }),
  });
}

// data: { taskId, statusId, comment?, entryDate?, workItemId? }
export async function setTaskLogStatus(data) {
  const response = await authorizedFetch(`${TL}/status`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error || "не удалось сменить статус");
  }
}

// === Путешествия (страны, вишлист, поиск мест) ===
// Спецификация модуля: back-m/docs/travel-module.md

const TR = `${API_BASE_URL}/api/v1/travel`;

export function travelApiBase() {
  return API_BASE_URL;
}

// --- Справочники ---

export async function fetchPlaceCategories() {
  const response = await authorizedFetch(`${TR}/categories/places`);
  return workJson(response, "не удалось загрузить типы точек");
}

export async function createPlaceCategory(data) {
  const response = await authorizedFetch(`${TR}/categories/places`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать тип точки");
}

export async function updatePlaceCategory(id, data) {
  const response = await authorizedFetch(`${TR}/categories/places/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("не удалось сохранить тип точки");
}

export async function deletePlaceCategory(id) {
  await authorizedFetch(`${TR}/categories/places/${id}`, { method: "DELETE" });
}

export async function fetchExpenseCategories() {
  const response = await authorizedFetch(`${TR}/categories/expenses`);
  return workJson(response, "не удалось загрузить категории расходов");
}

export async function createExpenseCategory(data) {
  const response = await authorizedFetch(`${TR}/categories/expenses`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать категорию");
}

export async function updateExpenseCategory(id, data) {
  const response = await authorizedFetch(`${TR}/categories/expenses/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("не удалось сохранить категорию");
}

export async function deleteExpenseCategory(id) {
  await authorizedFetch(`${TR}/categories/expenses/${id}`, { method: "DELETE" });
}

// --- Страны ---

export async function fetchCountries(includeArchived = false) {
  const response = await authorizedFetch(`${TR}/countries?archived=${includeArchived}`);
  return workJson(response, "не удалось загрузить страны");
}

export async function fetchCountry(id) {
  const response = await authorizedFetch(`${TR}/countries/${id}`);
  return workJson(response, "не удалось загрузить страну");
}

export async function suggestCountries(query) {
  const response = await authorizedFetch(`${TR}/countries/suggest?q=${encodeURIComponent(query || "")}`);
  return workJson(response, "не удалось загрузить подсказки");
}

// Создание идёт в сеть за границами страны — может занять пару секунд.
export async function createCountry(data) {
  const response = await authorizedFetch(`${TR}/countries`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать страну");
}

export async function updateCountry(id, data) {
  const response = await authorizedFetch(`${TR}/countries/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("не удалось сохранить страну");
}

export async function deleteCountry(id) {
  await authorizedFetch(`${TR}/countries/${id}`, { method: "DELETE" });
}

// --- Вишлист ---

export async function fetchWishes(countryId) {
  const response = await authorizedFetch(`${TR}/countries/${countryId}/wishes`);
  return workJson(response, "не удалось загрузить вишлист");
}

export async function fetchWish(id) {
  const response = await authorizedFetch(`${TR}/wishes/${id}`);
  return workJson(response, "не удалось загрузить место");
}

export async function createWish(data) {
  const response = await authorizedFetch(`${TR}/wishes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось добавить место");
}

export async function updateWish(id, data) {
  const response = await authorizedFetch(`${TR}/wishes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("не удалось сохранить место");
}

export async function deleteWish(id) {
  await authorizedFetch(`${TR}/wishes/${id}`, { method: "DELETE" });
}

export async function reorderWishes(ids) {
  await authorizedFetch(`${TR}/wishes/reorder`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// --- Файлы страны ---

export async function fetchCountryFiles(countryId) {
  const response = await authorizedFetch(`${TR}/countries/${countryId}/files`);
  return workJson(response, "не удалось загрузить файлы");
}

export async function uploadCountryFile(countryId, file, title = "") {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  const token = localStorage.getItem("token");
  const response = await fetch(`${TR}/countries/${countryId}/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return workJson(response, "не удалось загрузить файл");
}

export async function deleteTravelFile(id) {
  await authorizedFetch(`${TR}/files/${id}`, { method: "DELETE" });
}

export function travelFileUrl(id) {
  return `${TR}/files/${id}`;
}

// --- Поиск мест ---

export async function searchPlaces(query, countryId = "", limit = 10) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (countryId) params.set("countryId", countryId);
  const response = await authorizedFetch(`${TR}/search?${params}`);
  return workJson(response, "поиск не сработал");
}

// Разбирает ссылку из Google Maps в точку с координатами.
export async function resolveMapLink(url) {
  const response = await authorizedFetch(`${TR}/resolve-link`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  return workJson(response, "не удалось разобрать ссылку");
}

export async function reverseGeocode(lat, lng) {
  const response = await authorizedFetch(`${TR}/reverse?lat=${lat}&lng=${lng}`);
  return workJson(response, "не удалось определить место");
}

export async function findPlacePhoto(title) {
  const response = await authorizedFetch(`${TR}/photo?title=${encodeURIComponent(title)}`);
  return workJson(response, "не удалось найти фото");
}

// --- Настройки и курсы ---

export async function fetchTravelSettings() {
  const response = await authorizedFetch(`${TR}/settings`);
  return workJson(response, "не удалось загрузить настройки");
}

export async function saveTravelSettings(data) {
  const response = await authorizedFetch(`${TR}/settings`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("не удалось сохранить настройки");
}

export async function fetchTravelRates(refresh = false) {
  const response = await authorizedFetch(`${TR}/rates?refresh=${refresh}`);
  return workJson(response, "не удалось загрузить курсы");
}

// === Поездки (дни, варианты, шаги, точки, переезды) ===

const TP = `${API_BASE_URL}/api/v1/trips`;

export async function fetchTrips(countryId = "", includeArchived = false) {
  const params = new URLSearchParams({ archived: String(includeArchived) });
  if (countryId) params.set("countryId", countryId);
  const response = await authorizedFetch(`${TP}?${params}`);
  return workJson(response, "не удалось загрузить поездки");
}

// Отдаёт поездку целиком — она же используется как офлайн-выгрузка.
export async function fetchTrip(id) {
  const response = await authorizedFetch(`${TP}/${id}`);
  return workJson(response, "не удалось загрузить поездку");
}

export async function createTrip(data) {
  const response = await authorizedFetch(TP, { method: "POST", body: JSON.stringify(data) });
  return workJson(response, "не удалось создать поездку");
}

export async function updateTrip(id, data) {
  const response = await authorizedFetch(`${TP}/${id}`, { method: "PUT", body: JSON.stringify(data) });
  if (!response.ok) throw new Error("не удалось сохранить поездку");
}

export async function deleteTrip(id) {
  await authorizedFetch(`${TP}/${id}`, { method: "DELETE" });
}

// --- Участники ---

export async function createParticipant(tripId, data) {
  const response = await authorizedFetch(`${TP}/${tripId}/participants`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось добавить участника");
}

export async function updateParticipant(id, data) {
  await authorizedFetch(`${TP}/participants/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteParticipant(id) {
  await authorizedFetch(`${TP}/participants/${id}`, { method: "DELETE" });
}

// --- Дни ---

export async function addTripDay(tripId) {
  const response = await authorizedFetch(`${TP}/${tripId}/days`, { method: "POST" });
  return workJson(response, "не удалось добавить день");
}

export async function updateTripDay(id, data) {
  await authorizedFetch(`${TP}/days/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

// shift=true подтягивает следующие дни на освободившееся место
export async function deleteTripDay(id, shift = true) {
  await authorizedFetch(`${TP}/days/${id}?shift=${shift}`, { method: "DELETE" });
}

// Перенос дня: сделать день 4 днём 7
export async function moveTripDay(id, targetIndex) {
  await authorizedFetch(`${TP}/days/${id}/move`, {
    method: "POST",
    body: JSON.stringify({ targetIndex }),
  });
}

// Копия дня внутри страны: targetTripId пустой — в ту же поездку
export async function copyTripDay(id, targetTripId = null, targetIndex = null) {
  const response = await authorizedFetch(`${TP}/days/${id}/copy`, {
    method: "POST",
    body: JSON.stringify({ targetTripId, targetIndex }),
  });
  return workJson(response, "не удалось скопировать день");
}

// --- Варианты дня ---

export async function createDayVariant(dayId, data) {
  const response = await authorizedFetch(`${TP}/days/${dayId}/variants`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать вариант");
}

export async function updateDayVariant(id, data) {
  await authorizedFetch(`${TP}/variants/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteDayVariant(id) {
  const response = await authorizedFetch(`${TP}/variants/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error || "не удалось удалить вариант");
  }
}

// --- Шаги ---

export async function createStep(variantId, data = {}) {
  const response = await authorizedFetch(`${TP}/variants/${variantId}/steps`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать шаг");
}

export async function updateStep(id, data) {
  await authorizedFetch(`${TP}/steps/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteStep(id) {
  await authorizedFetch(`${TP}/steps/${id}`, { method: "DELETE" });
}

export async function reorderSteps(ids) {
  await authorizedFetch(`${TP}/steps/reorder`, { method: "POST", body: JSON.stringify({ ids }) });
}

// Отметить пройденную ветку развилки; pointId=null снимает отметку
export async function chooseStepPoint(stepId, pointId) {
  await authorizedFetch(`${TP}/steps/${stepId}/choose`, {
    method: "POST",
    body: JSON.stringify({ pointId }),
  });
}

// --- Точки ---

// Отдельным шагом в конец варианта — в data нужен variantId
export async function createPoint(data) {
  const response = await authorizedFetch(`${TP}/points`, { method: "POST", body: JSON.stringify(data) });
  return workJson(response, "не удалось добавить точку");
}

// В существующий шаг — получается развилка «или/или»
export async function createPointInStep(stepId, data) {
  const response = await authorizedFetch(`${TP}/steps/${stepId}/points`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось добавить альтернативу");
}

export async function updatePoint(id, data) {
  const response = await authorizedFetch(`${TP}/points/${id}`, { method: "PUT", body: JSON.stringify(data) });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error || "не удалось сохранить точку");
  }
}

export async function deletePoint(id) {
  await authorizedFetch(`${TP}/points/${id}`, { method: "DELETE" });
}

export async function movePoint(id, data) {
  await authorizedFetch(`${TP}/points/${id}/move`, { method: "POST", body: JSON.stringify(data) });
}

// Взять место из вишлиста: точка станет ссылкой, правки идут в обе стороны
export async function addWishToDay(data) {
  const response = await authorizedFetch(`${TP}/points/from-wish`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось добавить место");
}

export async function pointToWishlist(id) {
  const response = await authorizedFetch(`${TP}/points/${id}/to-wishlist`, { method: "POST" });
  return workJson(response, "не удалось поднять в вишлист");
}

// Убрать из маршрута, но оставить место в вишлисте
export async function releasePointToWishlist(id) {
  await authorizedFetch(`${TP}/points/${id}/release`, { method: "POST" });
}

// --- Подпункты и объекты поблизости ---

export async function createSubPoint(pointId, data) {
  const response = await authorizedFetch(`${TP}/points/${pointId}/subpoints`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось добавить подпункт");
}

export async function updateSubPoint(id, data) {
  await authorizedFetch(`${TP}/subpoints/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteSubPoint(id) {
  await authorizedFetch(`${TP}/subpoints/${id}`, { method: "DELETE" });
}

export async function createNearby(pointId, data) {
  const response = await authorizedFetch(`${TP}/points/${pointId}/nearby`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось добавить объект поблизости");
}

export async function updateNearby(id, data) {
  await authorizedFetch(`${TP}/nearby/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteNearby(id) {
  await authorizedFetch(`${TP}/nearby/${id}`, { method: "DELETE" });
}

// --- Переезды ---

// В data нужен stepId: переезд ведёт К этому шагу от предыдущего
export async function createTransport(data) {
  const response = await authorizedFetch(`${TP}/transports`, { method: "POST", body: JSON.stringify(data) });
  return workJson(response, "не удалось добавить переезд");
}

export async function updateTransport(id, data) {
  await authorizedFetch(`${TP}/transports/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteTransport(id) {
  await authorizedFetch(`${TP}/transports/${id}`, { method: "DELETE" });
}

// --- Файлы поездки и точек ---

export async function uploadTripFile(tripId, file, title = "") {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  const token = localStorage.getItem("token");
  const response = await fetch(`${TP}/${tripId}/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return workJson(response, "не удалось загрузить файл");
}

export async function uploadPointFile(pointId, file, title = "") {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  const token = localStorage.getItem("token");
  const response = await fetch(`${TP}/points/${pointId}/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return workJson(response, "не удалось загрузить файл");
}

export async function deleteTripFile(id) {
  await authorizedFetch(`${TP}/files/${id}`, { method: "DELETE" });
}

export async function deletePointFile(id) {
  await authorizedFetch(`${TP}/point-files/${id}`, { method: "DELETE" });
}

// === Подготовка к поездке (этапы, сравнение вариантов, перелёты) ===

// Сводка: этапы со всеми вариантами, итог и чего ещё не хватает
export async function fetchTripPrep(tripId) {
  const response = await authorizedFetch(`${TP}/${tripId}/prep`);
  return workJson(response, "не удалось загрузить подготовку");
}

// Типовой набор этапов: виза, билеты, жильё, страховка
export async function seedPrepGroups(tripId) {
  await authorizedFetch(`${TP}/${tripId}/prep/seed`, { method: "POST" });
}

export async function createPrepGroup(tripId, data) {
  const response = await authorizedFetch(`${TP}/${tripId}/prep/groups`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать этап");
}

export async function updatePrepGroup(id, data) {
  await authorizedFetch(`${TP}/prep/groups/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deletePrepGroup(id) {
  await authorizedFetch(`${TP}/prep/groups/${id}`, { method: "DELETE" });
}

export async function createPrepOption(groupId, data) {
  const response = await authorizedFetch(`${TP}/prep/groups/${groupId}/options`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать вариант");
}

export async function updatePrepOption(id, data) {
  const response = await authorizedFetch(`${TP}/prep/options/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error || "не удалось сохранить вариант");
  }
}

export async function deletePrepOption(id) {
  await authorizedFetch(`${TP}/prep/options/${id}`, { method: "DELETE" });
}

// Выбранный вариант отдаёт свою цену в бюджет этапа
export async function selectPrepOption(id, purchased = false) {
  await authorizedFetch(`${TP}/prep/options/${id}/select?purchased=${purchased}`, { method: "POST" });
}

// Время в плече локальное для своего аэропорта; длительность считает сервер
export async function createPrepSegment(optionId, data) {
  const response = await authorizedFetch(`${TP}/prep/options/${optionId}/segments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось добавить плечо");
}

export async function updatePrepSegment(id, data) {
  const response = await authorizedFetch(`${TP}/prep/segments/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error || "не удалось сохранить плечо");
  }
}

export async function deletePrepSegment(id) {
  await authorizedFetch(`${TP}/prep/segments/${id}`, { method: "DELETE" });
}

// Длинную пересадку можно превратить в мини-поездку со своей картой
export async function createSideTrip(segmentId, data) {
  const response = await authorizedFetch(`${TP}/prep/segments/${segmentId}/side-trip`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать мини-поездку");
}

export async function uploadPrepOptionFile(optionId, file, title = "") {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  const token = localStorage.getItem("token");
  const response = await fetch(`${TP}/prep/options/${optionId}/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return workJson(response, "не удалось загрузить файл");
}

export async function deletePrepOptionFile(id) {
  await authorizedFetch(`${TP}/prep/files/${id}`, { method: "DELETE" });
}

// === Бюджет поездки (квоты, реестр факта, взаиморасчёты) ===

export async function fetchTripBudget(tripId) {
  const response = await authorizedFetch(`${TP}/${tripId}/budget`);
  return workJson(response, "не удалось загрузить бюджет");
}

// Общая квота по категории на всю поездку; 0 убирает категорию из плана
export async function saveTripQuota(tripId, data) {
  const response = await authorizedFetch(`${TP}/${tripId}/budget/quotas`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("не удалось сохранить квоту");
}

// Ручное значение на день; plannedAmount=null снимает переопределение
export async function saveTripDayQuota(dayId, data) {
  const response = await authorizedFetch(`${TP}/days/${dayId}/quotas`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("не удалось сохранить квоту дня");
}

export async function fetchTripExpenses(tripId) {
  const response = await authorizedFetch(`${TP}/${tripId}/expenses`);
  return workJson(response, "не удалось загрузить траты");
}

export async function createTripExpense(tripId, data) {
  const response = await authorizedFetch(`${TP}/${tripId}/expenses`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось записать трату");
}

export async function updateTripExpense(id, data) {
  const response = await authorizedFetch(`${TP}/expenses/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("не удалось сохранить трату");
}

export async function deleteTripExpense(id) {
  await authorizedFetch(`${TP}/expenses/${id}`, { method: "DELETE" });
}

// Итог поездки уходит в основной бюджет одной транзакцией
export async function closeTrip(tripId, data) {
  const response = await authorizedFetch(`${TP}/${tripId}/close`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось закрыть поездку");
}

// === Совместный доступ, погода, календарь, режим «в поездке» ===

// --- Ссылки и роли (владелец) ---

export async function fetchShareLinks(tripId) {
  const response = await authorizedFetch(`${TP}/${tripId}/links`);
  return workJson(response, "не удалось загрузить ссылки");
}

export async function createShareLink(tripId, data) {
  const response = await authorizedFetch(`${TP}/${tripId}/links`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось создать ссылку");
}

export async function updateShareLink(id, data) {
  await authorizedFetch(`${TP}/links/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function revokeShareLink(id) {
  await authorizedFetch(`${TP}/links/${id}/revoke`, { method: "POST" });
}

export async function deleteShareLink(id) {
  await authorizedFetch(`${TP}/links/${id}`, { method: "DELETE" });
}

// --- Предложения ---

export async function fetchSuggestions(tripId, status = "") {
  const response = await authorizedFetch(`${TP}/${tripId}/suggestions?status=${status}`);
  return workJson(response, "не удалось загрузить предложения");
}

export async function acceptSuggestion(id) {
  const response = await authorizedFetch(`${TP}/suggestions/${id}/accept`, { method: "POST" });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error || "не удалось принять");
  }
}

export async function rejectSuggestion(id, reason = "") {
  await authorizedFetch(`${TP}/suggestions/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// --- История и уведомления ---

export async function fetchTripHistory(tripId) {
  const response = await authorizedFetch(`${TP}/${tripId}/history`);
  return workJson(response, "не удалось загрузить историю");
}

export async function revertHistory(id) {
  const response = await authorizedFetch(`${TP}/history/${id}/revert`, { method: "POST" });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error || "не удалось откатить");
  }
}

export async function fetchTripNotifications(tripId, onlyUnread = false) {
  const response = await authorizedFetch(`${TP}/${tripId}/notifications?unread=${onlyUnread}`);
  return workJson(response, "не удалось загрузить уведомления");
}

export async function readTripNotifications(tripId) {
  await authorizedFetch(`${TP}/${tripId}/notifications/read`, { method: "POST" });
}

// --- Пульс, комментарии, реакции, блокировки (владелец) ---

export async function fetchTripPulse(tripId, since = 0) {
  const response = await authorizedFetch(`${TP}/${tripId}/pulse?since=${since}`);
  return workJson(response, "не удалось получить пульс");
}

export async function fetchTripComments(tripId) {
  const response = await authorizedFetch(`${TP}/${tripId}/comments`);
  return workJson(response, "не удалось загрузить комментарии");
}

export async function createTripComment(tripId, data) {
  const response = await authorizedFetch(`${TP}/${tripId}/comments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return workJson(response, "не удалось отправить комментарий");
}

export async function deleteTripComment(id, tripId) {
  await authorizedFetch(`${TP}/comments/${id}?tripId=${tripId}`, { method: "DELETE" });
}

export async function fetchTripReactions(tripId) {
  const response = await authorizedFetch(`${TP}/${tripId}/reactions`);
  return workJson(response, "не удалось загрузить реакции");
}

export async function toggleTripReaction(tripId, data) {
  await authorizedFetch(`${TP}/${tripId}/reactions`, { method: "POST", body: JSON.stringify(data) });
}

// Объект под правкой недоступен другим; вернёт 409, если уже занят
export async function acquireTripLock(tripId, data) {
  const response = await authorizedFetch(`${TP}/${tripId}/locks`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (response.status === 409) {
    throw new Error((await response.json().catch(() => ({}))).error || "объект занят");
  }
  return workJson(response, "не удалось занять объект");
}

export async function releaseTripLock(tripId, data) {
  await authorizedFetch(`${TP}/${tripId}/locks/release`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Погода и календарь ---

export async function fetchTripWeather(tripId, refresh = false) {
  const response = await authorizedFetch(`${TP}/${tripId}/weather?refresh=${refresh}`);
  return workJson(response, "не удалось загрузить погоду");
}

export function tripCalendarUrl(tripId) {
  const token = localStorage.getItem("token");
  return `${TP}/${tripId}/calendar.ics?token=${encodeURIComponent(token || "")}`;
}

export async function syncTripToGoogle(tripId) {
  const response = await authorizedFetch(`${TP}/${tripId}/calendar/sync`, { method: "POST" });
  return workJson(response, "не удалось синхронизировать календарь");
}

// --- Режим «в поездке» ---

export async function fetchActiveTrip(date = "") {
  const response = await authorizedFetch(`${TP}/active?date=${date}`);
  return workJson(response, "не удалось определить текущую поездку");
}

export async function fetchTripToday(tripId, date = "") {
  const response = await authorizedFetch(`${TP}/${tripId}/today?date=${date}`);
  return workJson(response, "не удалось загрузить день");
}

// --- Гостевой контур: работает по токену ссылки, без входа ---

const PUB = `${API_BASE_URL}/api/v1/public/trips`;

function guestHeaders() {
  const token = localStorage.getItem("travelGuestToken");
  return token ? { "X-Guest-Token": token } : {};
}

async function guestFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...guestHeaders(),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "не получилось");
  return data;
}

// Гость представляется один раз — имя видно рядом с его правками
export async function joinSharedTrip(token, name) {
  const data = await guestFetch(`${PUB}/${token}/join`, {
    method: "POST",
    body: JSON.stringify({ name, guestToken: localStorage.getItem("travelGuestToken") || "" }),
  });
  localStorage.setItem("travelGuestToken", data.guestToken);
  return data;
}

export async function fetchSharedTrip(token) {
  return guestFetch(`${PUB}/${token}`);
}

export async function fetchSharedPulse(token, since = 0) {
  return guestFetch(`${PUB}/${token}/pulse?since=${since}`);
}

export async function sharedCreatePoint(token, data) {
  return guestFetch(`${PUB}/${token}/points`, { method: "POST", body: JSON.stringify(data) });
}

// Чужую точку сервер переведёт в предложение — в ответе будет suggested: true
export async function sharedUpdatePoint(token, id, data) {
  return guestFetch(`${PUB}/${token}/points/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function sharedDeletePoint(token, id) {
  return guestFetch(`${PUB}/${token}/points/${id}`, { method: "DELETE" });
}

export async function sharedAddWish(token, data) {
  return guestFetch(`${PUB}/${token}/points/from-wish`, { method: "POST", body: JSON.stringify(data) });
}

export async function sharedCreateSuggestion(token, data) {
  return guestFetch(`${PUB}/${token}/suggestions`, { method: "POST", body: JSON.stringify(data) });
}

export async function sharedCreateComment(token, data) {
  return guestFetch(`${PUB}/${token}/comments`, { method: "POST", body: JSON.stringify(data) });
}

export async function sharedDeleteComment(token, id) {
  return guestFetch(`${PUB}/${token}/comments/${id}`, { method: "DELETE" });
}

export async function sharedToggleReaction(token, data) {
  return guestFetch(`${PUB}/${token}/reactions`, { method: "POST", body: JSON.stringify(data) });
}

export async function sharedAcquireLock(token, data) {
  return guestFetch(`${PUB}/${token}/locks`, { method: "POST", body: JSON.stringify(data) });
}

export async function sharedReleaseLock(token, data) {
  return guestFetch(`${PUB}/${token}/locks/release`, { method: "POST", body: JSON.stringify(data) });
}
