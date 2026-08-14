// API модуля «Резюме» — docs/resume-module.md (back-m).
// Отдельный файл, как roadmapApi.js: ручек много, и с остальным приложением
// они не переплетаются.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const RS = `${API_BASE_URL}/api/v1/resume`;

async function request(url, options = {}) {
  const response = await authorizedFetch(url, options);
  if (!response.ok) {
    let message = "";
    try {
      const data = await response.json();
      message = data.error || data.message || "";
    } catch {
      message = "";
    }
    throw new Error(message || `ошибка запроса (${response.status})`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function post(url, body) {
  return request(url, { method: "POST", body: JSON.stringify(body ?? {}) });
}

function put(url, body) {
  return request(url, { method: "PUT", body: JSON.stringify(body ?? {}) });
}

function del(url) {
  return request(url, { method: "DELETE" });
}

// Логическая дата клиента: сервер сам её не знает.
export function resumeToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- Резюме ---

export const fetchResumes = () => request(RS);
export const createResume = (body) => post(RS, body);
export const updateResume = (id, body) => put(`${RS}/${id}`, body);
export const deleteResume = (id) => del(`${RS}/${id}`);
export const cloneResume = (id, body) => post(`${RS}/${id}/clone`, body);
export const fetchResumeFull = (id, today = resumeToday()) =>
  request(`${RS}/${id}/full?today=${today}`);
export const reorderResume = (id, body) => put(`${RS}/${id}/reorder`, body);
export const seedResume = () => post(`${RS}/seed`);

// --- Секции, блоки, строки ---

export const createSection = (resumeId, body) => post(`${RS}/${resumeId}/sections`, body);
export const updateSection = (id, body) => put(`${RS}/sections/${id}`, body);
export const deleteSection = (id) => del(`${RS}/sections/${id}`);

export const createEntry = (body) => post(`${RS}/entries`, body);
export const updateEntry = (id, body) => put(`${RS}/entries/${id}`, body);
export const deleteEntry = (id) => del(`${RS}/entries/${id}`);
export const setEntryStatus = (id, body) => put(`${RS}/entries/${id}/status`, body);
export const addEntryLink = (id, body) => post(`${RS}/entries/${id}/links`, body);

export const createBullet = (body) => post(`${RS}/bullets`, body);
export const updateBullet = (id, body) => put(`${RS}/bullets/${id}`, body);
export const deleteBullet = (id) => del(`${RS}/bullets/${id}`);
export const setBulletStatus = (id, body) => put(`${RS}/bullets/${id}/status`, body);
export const promoteBullet = (id) => post(`${RS}/bullets/${id}/promote`);

// --- Связи ---

export const fetchBulletLinks = (id) => request(`${RS}/bullets/${id}/links`);
export const addBulletLink = (id, body) => post(`${RS}/bullets/${id}/links`, body);
export const deleteLink = (id) => del(`${RS}/links/${id}`);
export const searchLinkTargets = (query, types = []) => {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (types.length) params.set("types", types.join(","));
  return request(`${RS}/link-targets?${params.toString()}`);
};
export const spawnRoadmapItem = (bulletId, body) =>
  post(`${RS}/bullets/${bulletId}/spawn-roadmap-item`, body);
export const spawnTask = (bulletId, body) => post(`${RS}/bullets/${bulletId}/spawn-task`, body);

// --- Сегодня ---

export const fetchResumeToday = (today = resumeToday()) =>
  request(`${RS}/today?today=${today}`);

// --- Библиотека достижений ---

export const fetchAchievements = () => request(`${RS}/achievements`);
export const createAchievement = (body) => post(`${RS}/achievements`, body);
export const updateAchievement = (id, body) => put(`${RS}/achievements/${id}`, body);
export const deleteAchievement = (id) => del(`${RS}/achievements/${id}`);
export const insertAchievement = (id, body) => post(`${RS}/achievements/${id}/insert`, body);

// --- Линтер, экспорт, версии ---

export const fetchLint = (id, today = resumeToday()) =>
  request(`${RS}/${id}/lint?today=${today}`);

// Экспорт скачивается blob'ом: authorizedFetch кладёт JWT, а простая ссылка — нет.
export async function downloadExport(id, format, mode = "clean") {
  const response = await authorizedFetch(`${RS}/${id}/export?format=${format}&mode=${mode}`);
  if (!response.ok) throw new Error(`не удалось выгрузить (${response.status})`);
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : `resume.${format}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const fetchSnapshots = (id) => request(`${RS}/${id}/snapshots`);
export const createSnapshot = (id, body) => post(`${RS}/${id}/snapshots`, body);
export const deleteSnapshot = (id) => del(`${RS}/snapshots/${id}`);
export const restoreSnapshot = (id) => post(`${RS}/snapshots/${id}/restore`);

// --- Вакансии ---

export const fetchVacancies = () => request(`${RS}/vacancies`);
export const fetchVacancy = (id) => request(`${RS}/vacancies/${id}`);
export const createVacancy = (body) => post(`${RS}/vacancies`, body);
export const updateVacancy = (id, body) => put(`${RS}/vacancies/${id}`, body);
export const deleteVacancy = (id) => del(`${RS}/vacancies/${id}`);
export const fetchVacancyByUrl = (body) => post(`${RS}/vacancies/fetch`, body);
export const analyzeVacancy = (id) => post(`${RS}/vacancies/${id}/analyze`);
export const updateRequirement = (id, body) => put(`${RS}/requirements/${id}`, body);
export const requirementToBullet = (id, body) => post(`${RS}/requirements/${id}/to-bullet`, body);

// --- Справочники интерфейса ---

export const STATUSES = [
  { code: "fact", title: "Факт", short: "факт", color: "#22c55e" },
  { code: "in_progress", title: "В процессе", short: "в процессе", color: "#f59e0b" },
  { code: "planned", title: "План", short: "план", color: "#8b5cf6" },
];

export function statusMeta(code) {
  return STATUSES.find((s) => s.code === code) || STATUSES[0];
}

export const SECTION_KINDS = [
  { code: "summary", title: "О себе", layout: "text" },
  { code: "experience", title: "Опыт работы", layout: "entries" },
  { code: "projects", title: "Проекты", layout: "entries" },
  { code: "skills", title: "Навыки", layout: "tags" },
  { code: "courses", title: "Курсы и сертификаты", layout: "entries" },
  { code: "certs", title: "Сертификаты", layout: "entries" },
  { code: "education", title: "Образование", layout: "entries" },
  { code: "languages", title: "Языки", layout: "bullets" },
  { code: "achievements", title: "Достижения", layout: "bullets" },
  { code: "custom", title: "Своя секция", layout: "bullets" },
];

export const LINK_TYPES = [
  { code: "roadmap_item", title: "Пункт roadmap" },
  { code: "roadmap_quarter", title: "Квартал roadmap" },
  { code: "roadmap", title: "Roadmap целиком" },
  { code: "task", title: "Задача" },
  { code: "learning_skill", title: "Направление обучения" },
  { code: "learning_skill_grade", title: "Ступень навыка" },
  { code: "skill_node", title: "Навык на карте" },
  { code: "pdf_file", title: "Книга" },
];

export function linkTypeTitle(code) {
  return (LINK_TYPES.find((t) => t.code === code) || {}).title || code;
}

// Даты в резюме печатаются как MM/YYYY: единый формат по всему документу.
export function monthYear(value) {
  if (!value) return "";
  const [y, m] = value.split("-");
  if (!y || !m) return value;
  return `${m}/${y}`;
}

export function dateRange(entry, lang = "ru") {
  const start = monthYear(entry.dateStart);
  const end = entry.isCurrent
    ? lang === "en"
      ? "Present"
      : "настоящее время"
    : monthYear(entry.dateEnd);
  if (start && end) return `${start} — ${end}`;
  return start || end || "";
}
