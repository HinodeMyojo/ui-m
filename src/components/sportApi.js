// API модуля «Спорт» — docs/sport-module.md (back-m).
// Вынесен из api.js отдельным файлом: ручек много, и они не переплетаются
// с остальным приложением.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const SP = `${API_BASE_URL}/api/v1/sport`;

// Токен разблокировки фото живёт в sessionStorage: при перезапуске браузера
// раздел снова закрывается — так и задумано.
const SPORT_PIN_KEY = "sportPinToken";

export function sportPinToken() {
  return sessionStorage.getItem(SPORT_PIN_KEY) || "";
}

export function setSportPinToken(token) {
  if (token) sessionStorage.setItem(SPORT_PIN_KEY, token);
  else sessionStorage.removeItem(SPORT_PIN_KEY);
}

export function sportToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sportShiftDate(date, days) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Понедельник недели, в которую попадает дата.
export function sportWeekStart(date) {
  const d = new Date(`${date}T00:00:00`);
  const wd = d.getDay() === 0 ? 7 : d.getDay();
  return sportShiftDate(date, -(wd - 1));
}

async function sportFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const pin = sportPinToken();
  if (pin) headers["X-Sport-Pin-Token"] = pin;

  const response = await authorizedFetch(`${SP}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error((data && data.error) || "ошибка запроса");
    error.locked = !!(data && data.locked);
    error.status = response.status;
    throw error;
  }
  return data;
}

function q(params) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

// Полноразмерный кадр тянем как blob и отдаём object-URL: тег img не умеет
// слать Authorization, а пускать JWT в строку запроса ради картинки не хочется.
// Кто вызвал — тот и делает URL.revokeObjectURL, иначе кадры копятся в памяти.
export async function fetchSportPhotoBlobUrl(id, original = false) {
  const headers = {};
  const pin = sportPinToken();
  if (pin) headers["X-Sport-Pin-Token"] = pin;

  const response = await authorizedFetch(
    `${SP}/photos/${id}/${original ? "original" : "full"}`,
    { headers },
  );
  if (!response.ok) throw new Error("не удалось загрузить кадр");
  return URL.createObjectURL(await response.blob());
}

// --- настройки и PIN ---

export const fetchSportSettings = () => sportFetch("/settings");
export const updateSportSettings = (data) =>
  sportFetch("/settings", { method: "PUT", body: JSON.stringify(data) });
export const setSportPin = (data) =>
  sportFetch("/pin", { method: "POST", body: JSON.stringify(data) });
export const removeSportPin = (pin) =>
  sportFetch("/pin", { method: "DELETE", body: JSON.stringify({ pin }) });

export async function unlockSportPin(pin) {
  const data = await sportFetch("/pin/unlock", { method: "POST", body: JSON.stringify({ pin }) });
  setSportPinToken(data && data.token);
  return data;
}

// --- метрики ---

export const fetchSportMetrics = (archived = false) => sportFetch(`/metrics${q({ archived })}`);
export const createSportMetric = (data) =>
  sportFetch("/metrics", { method: "POST", body: JSON.stringify(data) });
export const updateSportMetric = (id, data) =>
  sportFetch(`/metrics/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportMetric = (id) => sportFetch(`/metrics/${id}`, { method: "DELETE" });

export const fetchSportEntries = (metricId, from, to) =>
  sportFetch(`/metrics/${metricId}/entries${q({ from, to })}`);
export const setSportEntry = (metricId, date, data) =>
  sportFetch(`/metrics/${metricId}/entries/${date}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportEntry = (metricId, date) =>
  sportFetch(`/metrics/${metricId}/entries/${date}`, { method: "DELETE" });
export const importSportEntries = (metricId, data) =>
  sportFetch(`/metrics/${metricId}/import`, { method: "POST", body: JSON.stringify(data) });

export const fetchSportChart = ({ ids, from, to, smoothing, goalId } = {}) =>
  sportFetch(`/metrics/chart${q({ ids, from, to, smoothing, goalId })}`);

// --- цели ---

export const fetchSportGoals = (status = "", today = sportToday()) =>
  sportFetch(`/goals${q({ status, today })}`);
export const fetchSportGoal = (id, today = sportToday()) =>
  sportFetch(`/goals/${id}${q({ today })}`);
export const createSportGoal = (data) =>
  sportFetch("/goals", { method: "POST", body: JSON.stringify(data) });
export const updateSportGoal = (id, data) =>
  sportFetch(`/goals/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportGoal = (id) => sportFetch(`/goals/${id}`, { method: "DELETE" });
export const closeSportGoal = (id, data) =>
  sportFetch(`/goals/${id}/close`, { method: "POST", body: JSON.stringify(data) });
export const fetchSportGoalSummary = (id, today = sportToday()) =>
  sportFetch(`/goals/${id}/summary${q({ today })}`);

// --- фото ---

export const fetchSportSlots = (archived = false) => sportFetch(`/photo-slots${q({ archived })}`);
export const createSportSlot = (data) =>
  sportFetch("/photo-slots", { method: "POST", body: JSON.stringify(data) });
export const updateSportSlot = (id, data) =>
  sportFetch(`/photo-slots/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportSlot = (id) => sportFetch(`/photo-slots/${id}`, { method: "DELETE" });

export const fetchSportPhotos = ({ from, to, slotId, thumbs } = {}) =>
  sportFetch(`/photos${q({ from, to, slotId, thumbs })}`);
export const fetchSportTimelapse = ({ from, to, slotId } = {}) =>
  sportFetch(`/photos/timelapse${q({ from, to, slotId })}`);
export const updateSportPhoto = (id, data) =>
  sportFetch(`/photos/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportPhoto = (id) => sportFetch(`/photos/${id}`, { method: "DELETE" });

// Загрузка идёт мимо sportFetch: multipart нельзя отправлять
// с Content-Type: application/json, который проставляет общий клиент.
export async function uploadSportPhotos(files, { date, slotId } = {}) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  if (date) form.append("date", date);
  if (slotId) form.append("slotId", slotId);

  const headers = {};
  const pin = sportPinToken();
  if (pin) headers["X-Sport-Pin-Token"] = pin;
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${SP}/photos`, { method: "POST", headers, body: form });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error((data && data.error) || "не удалось загрузить фото");
    error.locked = !!(data && data.locked);
    throw error;
  }
  return data;
}

// --- упражнения и рекорды ---

export const fetchSportExercises = (archived = false) => sportFetch(`/exercises${q({ archived })}`);
export const createSportExercise = (data) =>
  sportFetch("/exercises", { method: "POST", body: JSON.stringify(data) });
export const updateSportExercise = (id, data) =>
  sportFetch(`/exercises/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportExercise = (id) => sportFetch(`/exercises/${id}`, { method: "DELETE" });
export const fetchSportExerciseHistory = (id, from, to) =>
  sportFetch(`/exercises/${id}/history${q({ from, to })}`);
export const fetchSportRecords = (exerciseId) => sportFetch(`/records${q({ exerciseId })}`);

// --- тренировки ---

export const fetchSportWorkouts = ({ from, to, status, goalId } = {}) =>
  sportFetch(`/workouts${q({ from, to, status, goalId })}`);
export const fetchSportWorkout = (id) => sportFetch(`/workouts/${id}`);
export const createSportWorkout = (data) =>
  sportFetch("/workouts", { method: "POST", body: JSON.stringify(data) });
export const updateSportWorkout = (id, data) =>
  sportFetch(`/workouts/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportWorkout = (id) => sportFetch(`/workouts/${id}`, { method: "DELETE" });
export const startSportWorkout = (id) => sportFetch(`/workouts/${id}/start`, { method: "POST" });
export const finishSportWorkout = (id) => sportFetch(`/workouts/${id}/finish`, { method: "POST" });
export const moveSportWorkout = (id, date) =>
  sportFetch(`/workouts/${id}/move`, { method: "POST", body: JSON.stringify({ date }) });
export const repeatSportWorkout = (id, date) =>
  sportFetch(`/workouts/${id}/repeat`, { method: "POST", body: JSON.stringify({ date }) });
export const quickSportWorkout = (data) =>
  sportFetch("/workouts/quick", { method: "POST", body: JSON.stringify(data) });

export const addSportSet = (workoutExerciseId, data) =>
  sportFetch(`/workout-exercises/${workoutExerciseId}/sets`, {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateSportSet = (id, data) =>
  sportFetch(`/sets/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportSet = (id) => sportFetch(`/sets/${id}`, { method: "DELETE" });

// --- план ---

export const fetchSportTemplates = (archived = false) => sportFetch(`/templates${q({ archived })}`);
export const fetchSportTemplate = (id) => sportFetch(`/templates/${id}`);
export const createSportTemplate = (data) =>
  sportFetch("/templates", { method: "POST", body: JSON.stringify(data) });
export const updateSportTemplate = (id, data) =>
  sportFetch(`/templates/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportTemplate = (id) => sportFetch(`/templates/${id}`, { method: "DELETE" });
export const applySportTemplate = (id, data) =>
  sportFetch(`/templates/${id}/apply`, { method: "POST", body: JSON.stringify(data) });

export const fetchSportPrograms = () => sportFetch("/programs");
export const fetchSportProgram = (id) => sportFetch(`/programs/${id}`);
export const createSportProgram = (data) =>
  sportFetch("/programs", { method: "POST", body: JSON.stringify(data) });
export const updateSportProgram = (id, data) =>
  sportFetch(`/programs/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSportProgram = (id) => sportFetch(`/programs/${id}`, { method: "DELETE" });
export const rolloutSportProgram = (id, data) =>
  sportFetch(`/programs/${id}/rollout`, { method: "POST", body: JSON.stringify(data) });

export const fetchSportWeekPlans = (from, to) => sportFetch(`/week-plans${q({ from, to })}`);
export const fetchSportWeekPlan = (weekStart) => sportFetch(`/week-plans/${weekStart}`);
export const upsertSportWeekPlan = (weekStart, data) =>
  sportFetch(`/week-plans/${weekStart}`, { method: "PUT", body: JSON.stringify(data) });

// --- сводки ---

export const fetchSportDashboard = (today = sportToday()) => sportFetch(`/dashboard${q({ today })}`);
export const fetchSportTodayData = (today = sportToday()) => sportFetch(`/today${q({ today })}`);
export const fetchSportCalendar = (from, to) => sportFetch(`/calendar${q({ from, to })}`);
export const fetchSportDay = (date) => sportFetch(`/day/${date}`);
export const setSportDayNote = (date, note) =>
  sportFetch(`/day/${date}/note`, { method: "PUT", body: JSON.stringify({ note }) });
export const fetchSportVolume = (from, to, by = "muscle") =>
  sportFetch(`/stats/volume${q({ from, to, by })}`);
export const fetchSportStreak = (today = sportToday()) => sportFetch(`/stats/streak${q({ today })}`);

// --- подписи ---

export const SPORT_PR_LABELS = {
  max_weight: "Макс. вес",
  max_reps: "Макс. повторов",
  max_volume: "Макс. объём подхода",
  est_1rm: "Оценка 1ПМ",
  max_distance: "Макс. дистанция",
  max_duration: "Макс. время",
  best_pace: "Лучший темп",
};

export const SPORT_STATUS_LABELS = {
  planned: "запланирована",
  done: "выполнена",
  partial: "частично",
  skipped: "пропущена",
};

export const SPORT_STATUS_COLORS = {
  planned: "#5b616e",
  done: "#63c94f",
  partial: "#ffd666",
  skipped: "#e5484d",
};

export const SPORT_MUSCLE_TITLES = {
  chest: "Грудь",
  back: "Спина",
  shoulders: "Плечи",
  biceps: "Бицепс",
  triceps: "Трицепс",
  quads: "Квадрицепс",
  hamstrings: "Бицепс бедра",
  glutes: "Ягодицы",
  core: "Пресс",
  calves: "Икры",
  cardio: "Кардио",
};

export const SPORT_SET_FIELDS = [
  { code: "reps", label: "Повт.", unit: "", step: 1 },
  { code: "weight", label: "Вес", unit: "кг", step: 2.5 },
  { code: "distance", label: "Дист.", unit: "м", step: 100 },
  { code: "duration", label: "Время", unit: "сек", step: 30 },
  { code: "heartRate", label: "Пульс", unit: "уд", step: 5 },
  { code: "rpe", label: "RPE", unit: "", step: 0.5 },
  { code: "restSec", label: "Отдых", unit: "сек", step: 15 },
  { code: "incline", label: "Наклон", unit: "%", step: 1 },
  { code: "resistance", label: "Сопр.", unit: "", step: 1 },
];

// Форматирование значения рекорда: у темпа и времени свои единицы.
export function sportFormatPR(kind, value) {
  if (kind === "best_pace") {
    const total = Math.round(value);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} /км`;
  }
  if (kind === "max_duration") {
    const total = Math.round(value);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }
  if (kind === "max_distance") return `${(value / 1000).toFixed(2)} км`;
  if (kind === "max_reps") return `${value} повт.`;
  return `${value} кг`;
}
