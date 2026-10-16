import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

// Модуль «Архитектура» — entities/arch.go (back-m).
const AR = `${API_BASE_URL}/api/v1/arch`;

// ConflictError — сервер не принял правку: файл тем временем поменяли.
// В conflicts — серверные версии, чтобы человек решил, чья правка главнее.
export class ConflictError extends Error {
  constructor(conflicts) {
    super("файл успели поменять в другом месте");
    this.conflicts = conflicts;
  }
}

async function request(url, options = {}) {
  const response = await authorizedFetch(url, options);
  if (response.status === 409) {
    const data = await response.json().catch(() => ({}));
    throw new ConflictError(data.conflicts || []);
  }
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

export const fetchArchProjects = () => request(`${AR}/projects`);
export const fetchArchProject = (id) => request(`${AR}/projects/${id}`);
export const createArchProject = (body) => post(`${AR}/projects`, body);
export const updateArchProject = (id, body) => put(`${AR}/projects/${id}`, body);
export const deleteArchProject = (id) => del(`${AR}/projects/${id}`);
export const setArchStage = (id, stage, note) => post(`${AR}/projects/${id}/stage`, { stage, note });

// saveArchFiles — пачка правок: files [{path, content, baseVersion}],
// delete [{path, baseVersion}], rename [{from, to}], check {status, errors}.
export const saveArchFiles = (id, body) => post(`${AR}/projects/${id}/files`, body);

export const fetchArchRevisions = (id, path = "", limit = 200) =>
  request(`${AR}/projects/${id}/revisions?path=${encodeURIComponent(path)}&limit=${limit}`);
export const fetchArchRevision = (revisionId) => request(`${AR}/revisions/${revisionId}`);
export const restoreArchRevision = (revisionId) => post(`${AR}/revisions/${revisionId}/restore`);

export const saveArchLayout = (id, viewId, snapshot) =>
  put(`${AR}/projects/${id}/layouts/${encodeURIComponent(viewId)}`, snapshot);
export const deleteArchLayout = (id, viewId) =>
  del(`${AR}/projects/${id}/layouts/${encodeURIComponent(viewId)}`);

export const createArchLink = (id, body) => post(`${AR}/projects/${id}/links`, body);
export const updateArchLink = (linkId, body) => put(`${AR}/links/${linkId}`, body);
export const deleteArchLink = (linkId) => del(`${AR}/links/${linkId}`);
export const searchArchTargets = (q) => request(`${AR}/targets?q=${encodeURIComponent(q || "")}`);
export const fetchTargetProjects = (kind, id) => request(`${AR}/targets/${kind}/${id}`);

export const fetchArchTemplates = () => request(`${AR}/templates`);
export const createArchSnippet = (body) => post(`${AR}/snippets`, body);
export const updateArchSnippet = (id, body) => put(`${AR}/snippets/${id}`, body);
export const deleteArchSnippet = (id) => del(`${AR}/snippets/${id}`);

// Стадии: порядок задаёт сервер (entities.ArchStages), подписи — здесь.
export const STAGE_TITLES = {
  idea: "Идея",
  design: "Проектирование",
  development: "Разработка",
  review: "Ревью",
  testing: "Тест на стенде",
  production: "Прод",
  support: "Поддержка",
  frozen: "Заморожен",
};

export const STAGE_COLORS = {
  idea: "#94a3b8",
  design: "#a855f7",
  development: "#38bdf8",
  review: "#f59e0b",
  testing: "#f97316",
  production: "#22c55e",
  support: "#14b8a6",
  frozen: "#64748b",
};

export const stageTitle = (stage) => STAGE_TITLES[stage] || stage;
