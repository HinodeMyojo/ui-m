import { API_BASE_URL } from "./base";

async function authorizedFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${response.statusText}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function getDiagrams() {
  return authorizedFetch(`${API_BASE_URL}/api/v1/diagrams`);
}

export async function getDiagram(id) {
  return authorizedFetch(`${API_BASE_URL}/api/v1/diagrams/${id}`);
}

export async function createDiagram(data) {
  return authorizedFetch(`${API_BASE_URL}/api/v1/diagrams`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateDiagram(id, data) {
  return authorizedFetch(`${API_BASE_URL}/api/v1/diagrams/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteDiagram(id) {
  return authorizedFetch(`${API_BASE_URL}/api/v1/diagrams/${id}`, {
    method: "DELETE",
  });
}
