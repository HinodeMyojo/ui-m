// API артефактов — стандарт: back-m application/services/artifact_standard.md.

import { API_BASE_URL, authorizedFetch } from "@/components/api.js";
import { ensureFreshToken, getToken } from "@/components/session.js";

const ARTIFACTS = `${API_BASE_URL}/api/v1/artifacts`;

// Стандарт открыт без входа: ссылку на него отдают ИИ без коннектора.
export const ARTIFACT_STANDARD_URL = `${API_BASE_URL}/api/v1/artifact-standard`;

// Ошибка несёт код и тело: на 409 вызывающему нужна ревизия из ответа.
async function request(url, options = {}) {
  const response = await authorizedFetch(url, options);
  const text = response.status === 204 ? "" : await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.error || `ошибка запроса (${response.status})`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

export const fetchArtifacts = () => request(ARTIFACTS);
export const fetchArtifact = (id) => request(`${ARTIFACTS}/${id}`);
export const deleteArtifact = (id) => request(`${ARTIFACTS}/${id}`, { method: "DELETE" });
export const markArtifactOpened = (id) => request(`${ARTIFACTS}/${id}/opened`, { method: "POST" });

export const fetchArtifactState = (id) => request(`${ARTIFACTS}/${id}/state`);
export const saveArtifactState = (id, data, revision) =>
  request(`${ARTIFACTS}/${id}/state`, { method: "PUT", body: JSON.stringify({ data, revision }) });
export const resetArtifactState = (id) => request(`${ARTIFACTS}/${id}/state`, { method: "DELETE" });

export async function fetchArtifactContent(id, number) {
  const response = await authorizedFetch(`${ARTIFACTS}/${id}/versions/${number}/content`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `версия не открылась (${response.status})`);
  }
  return response.text();
}

export async function fetchArtifactStandard() {
  const response = await fetch(ARTIFACT_STANDARD_URL);
  if (!response.ok) throw new Error(`стандарт не загрузился (${response.status})`);
  return response.text();
}

// Загрузка формой мимо authorizedFetch: границу multipart ставит браузер.
// artifactId — новая версия этого артефакта, без него — регистрация.
export async function uploadArtifact({ file, author, note, artifactId }) {
  await ensureFreshToken();
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("author", author || "");
  form.append("note", note || "");
  const token = getToken();
  const url = artifactId ? `${ARTIFACTS}/${artifactId}/versions` : ARTIFACTS;
  const response = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `не удалось загрузить (${response.status})`);
  return data;
}

// contractId — id из договора artifact-contract: по нему ясно, новая это
// версия уже известного артефакта или новый артефакт.
export function contractId(html) {
  const block = html.match(/<script\b[^>]*\bid\s*=\s*["']?artifact-contract["']?[^>]*>([\s\S]*?)<\/script\s*>/i);
  if (!block) return null;
  try {
    return JSON.parse(block[1]).id || null;
  } catch {
    return null;
  }
}
