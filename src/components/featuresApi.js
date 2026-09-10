// API вкусняшек — что включено у этой учётки.
// Отдельный файл, как blockersApi.js: свой раздел, своя ручка.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";

const BASE = `${API_BASE_URL}/api/v1/features`;

async function request(path, options = {}) {
  const response = await authorizedFetch(`${BASE}${path}`, options);
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

// Каталог вкусняшек и настройки владельца: умолчания уже применены.
export const fetchFeatures = () => request("");

// Сохранение принимает только то, что менялось: { enabled, order, tabs }.
// Возвращает состояние целиком — сервер мог поправить присланное.
export const saveFeatures = (patch) =>
  request("", { method: "PUT", body: JSON.stringify(patch) });

export const resetFeatures = () => request("/reset", { method: "POST" });
