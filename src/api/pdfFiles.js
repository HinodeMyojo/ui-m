const API_BASE_URL = `${window.location.protocol}//82.202.136.167:5005`;

async function authorizedFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const response = await fetch(url, {
    ...options,
    headers: {
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

export async function getPdfFiles() {
  return authorizedFetch(`${API_BASE_URL}/api/v1/pdfs`);
}

export async function uploadPdfFile(file) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/api/v1/pdfs`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
  return response.json();
}

export async function deletePdfFile(id) {
  return authorizedFetch(`${API_BASE_URL}/api/v1/pdfs/${id}`, {
    method: "DELETE",
  });
}

export function getPdfDownloadUrl(id) {
  return `${API_BASE_URL}/api/v1/pdfs/${id}/download`;
}
