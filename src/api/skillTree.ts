import type {
  CharacterProfile,
  CharacterLevelImage,
  SkillCategory,
  SkillNode,
  SkillLevel,
  SubSkill,
  SkillTreeOverview,
  SkillTreeExport,
  CreateCategoryRequest,
  CreateSkillNodeRequest,
  CreateSkillLevelRequest,
  CreateSubSkillRequest,
} from "../types/skillTree";

const API_BASE = `${window.location.protocol}//82.202.136.167:5005/api/v1/skill-tree`;

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

// === Character ===
export const getCharacter = () => request<CharacterProfile>("/character");

export const updateCharacter = (data: { name?: string; title?: string }) =>
  request<void>("/character", { method: "PUT", body: JSON.stringify(data) });

export const uploadCharacterImage = async (file: File) => {
  const token = localStorage.getItem("token");
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`${API_BASE}/character/image`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
};

// === Categories ===
export const getCategories = () =>
  request<SkillCategory[]>("/categories");

export const getCategory = (id: string) =>
  request<SkillCategory>(`/categories/${id}`);

export const createCategory = (data: CreateCategoryRequest) =>
  request<{ id: string }>("/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateCategory = (
  id: string,
  data: Partial<CreateCategoryRequest>
) =>
  request<void>(`/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteCategory = (id: string) =>
  request<void>(`/categories/${id}`, { method: "DELETE" });

export const uploadCategoryImage = async (id: string, file: File) => {
  const token = localStorage.getItem("token");
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`${API_BASE}/categories/${id}/image`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
};

// === Skill Nodes ===
export const getSkillNodes = (categoryId?: string) => {
  const params = categoryId ? `?categoryId=${categoryId}` : "";
  return request<SkillNode[]>(`/nodes${params}`);
};

export const getSkillNode = (id: string) =>
  request<SkillNode>(`/nodes/${id}`);

export const createSkillNode = (data: CreateSkillNodeRequest) =>
  request<{ id: string }>("/nodes", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateSkillNode = (
  id: string,
  data: Partial<CreateSkillNodeRequest>
) =>
  request<void>(`/nodes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteSkillNode = (id: string) =>
  request<void>(`/nodes/${id}`, { method: "DELETE" });

export const uploadSkillNodeImage = async (id: string, file: File) => {
  const token = localStorage.getItem("token");
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`${API_BASE}/nodes/${id}/image`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
};

// === Skill Levels ===
export const getSkillLevels = (skillNodeId?: string) => {
  const params = skillNodeId ? `?skillNodeId=${skillNodeId}` : "";
  return request<SkillLevel[]>(`/levels${params}`);
};

export const getSkillLevel = (id: string) =>
  request<SkillLevel>(`/levels/${id}`);

export const createSkillLevel = (data: CreateSkillLevelRequest) =>
  request<{ id: string }>("/levels", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateSkillLevel = (
  id: string,
  data: Partial<CreateSkillLevelRequest>
) =>
  request<void>(`/levels/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteSkillLevel = (id: string) =>
  request<void>(`/levels/${id}`, { method: "DELETE" });

// === Sub Skills ===
export const getSubSkills = (skillLevelId?: string) => {
  const params = skillLevelId ? `?skillLevelId=${skillLevelId}` : "";
  return request<SubSkill[]>(`/sub-skills${params}`);
};

export const createSubSkill = (data: CreateSubSkillRequest) =>
  request<{ id: string }>("/sub-skills", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateSubSkill = (
  id: string,
  data: Partial<CreateSubSkillRequest>
) =>
  request<void>(`/sub-skills/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteSubSkill = (id: string) =>
  request<void>(`/sub-skills/${id}`, { method: "DELETE" });

export const completeSubSkill = (id: string) =>
  request<void>(`/sub-skills/${id}/complete`, { method: "POST" });

export const uncompleteSubSkill = (id: string) =>
  request<void>(`/sub-skills/${id}/uncomplete`, { method: "POST" });

// === Character Level Images ===
export async function fetchCharacterImageBlob(): Promise<string | null> {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/character/image`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export const getCharacterLevelImages = () =>
  request<CharacterLevelImage[]>("/character/level-images");

export const addCharacterLevelImage = async (minLevel: number, file: File) => {
  const token = localStorage.getItem("token");
  const form = new FormData();
  form.append("image", file);
  form.append("minLevel", String(minLevel));
  const res = await fetch(`${API_BASE}/character/level-images`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json() as Promise<{ id: string }>;
};

export const deleteCharacterLevelImage = (id: string) =>
  request<void>(`/character/level-images/${id}`, { method: "DELETE" });

// === Exams ===
export const passExam = (levelId: string) =>
  request<void>(`/levels/${levelId}/pass-exam`, { method: "POST" });

export const unpassExam = (levelId: string) =>
  request<void>(`/levels/${levelId}/unpass-exam`, { method: "POST" });

// === Overview ===
export const getOverview = () =>
  request<SkillTreeOverview>("/overview");

// === Export/Import ===
export const exportTree = () => request<SkillTreeExport>("/export");

export const importTree = (data: SkillTreeExport) =>
  request<void>("/import", {
    method: "POST",
    body: JSON.stringify(data),
  });
