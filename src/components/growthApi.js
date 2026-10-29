// API «Я» и «Развития» — docs/me-module.md (back-m).
// Любая правка возвращает доску целиком: прогресс, статусы и пороги чтения
// считает сервер, клиенту остаётся только перерисовать.

import { API_BASE_URL, authorizedFetch, disciplineLogicalToday } from "@/components/api.js";

const G = `${API_BASE_URL}/api/v1/growth`;

async function request(url, options = {}) {
  const sep = url.includes("?") ? "&" : "?";
  const response = await authorizedFetch(`${url}${sep}today=${disciplineLogicalToday()}`, options);
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
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const post = (url, body) => request(url, { method: "POST", body: JSON.stringify(body ?? {}) });
const put = (url, body) => request(url, { method: "PUT", body: JSON.stringify(body ?? {}) });
const del = (url) => request(url, { method: "DELETE" });

export const fetchGrowthBoard = () => request(G);
export const seedGrowth = () => post(`${G}/seed`);
export const setGrowthMonth = (year, month, levelIds) =>
  put(`${G}/month`, { year, month, levelIds, today: disciplineLogicalToday() });
export const updateGrowthProfile = (patch) => put(`${G}/profile`, patch);
export const setGrowthDayState = (state) =>
  put(`${G}/day-state`, { date: disciplineLogicalToday(), state });

export const createGrowthSkill = (body) => post(`${G}/skills`, body);
export const updateGrowthSkill = (id, patch) => put(`${G}/skills/${id}`, patch);
export const deleteGrowthSkill = (id) => del(`${G}/skills/${id}`);

export const createGrowthLevel = (body) => post(`${G}/levels`, body);
export const updateGrowthLevel = (id, patch) => put(`${G}/levels/${id}`, patch);
export const deleteGrowthLevel = (id) => del(`${G}/levels/${id}`);
export const completeGrowthLevel = (id, undo = false, note = "") =>
  post(`${G}/levels/${id}/complete`, { undo, note });
export const makeGrowthDisciplined = (id, body) =>
  post(`${G}/levels/${id}/discipline`, { ...body, today: disciplineLogicalToday() });
export const createGrowthTasks = (id) => post(`${G}/levels/${id}/tasks`);
export const linkGrowthTask = (id, taskId, unlink = false) =>
  post(`${G}/levels/${id}/link-task`, { taskId, unlink });

export const addGrowthCriterion = (levelId, body) => post(`${G}/levels/${levelId}/criteria`, body);
export const updateGrowthCriterion = (id, patch) => put(`${G}/criteria/${id}`, patch);
export const deleteGrowthCriterion = (id) => del(`${G}/criteria/${id}`);

export const addGrowthMaterial = (levelId, body) => post(`${G}/levels/${levelId}/materials`, body);
export const updateGrowthMaterial = (id, patch) => put(`${G}/materials/${id}`, patch);
export const deleteGrowthMaterial = (id) => del(`${G}/materials/${id}`);

export const addGrowthEdge = (fromId, toId) => post(`${G}/edges`, { fromId, toId });
export const deleteGrowthEdge = (id) => del(`${G}/edges/${id}`);
