import type {
  SkillGroup,
  Skill,
  SkillPart,
  PetProject,
  SkillsSummary,
  StudySession,
  TaskLink,
  CreateSkillRequest,
  UpdateSkillRequest,
  CreateSkillPartRequest,
  CreatePetProjectRequest,
  AttachSkillsRequest,
  AttachPartsRequest,
  LogTimeRequest,
} from "../types";

import {
  mockGroups,
  mockSkills,
  mockParts,
  mockProjects,
  mockSummary,
  mockSessions,
  getSkillsWithProgress,
  getPartsBySkillId,
  getAllParts,
  getSkillById,
  getProjectById,
} from "../mocks";

// Флаг для переключения между моками и реальным API
const USE_MOCKS = true;

// Базовый URL API (когда будет готов бэкенд)
const API_BASE_URL = "/api";

// Вспомогательная функция для имитации задержки сети
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Вспомогательная функция для API запросов
async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  if (USE_MOCKS) {
    // Имитируем задержку сети
    await delay(300 + Math.random() * 200);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

// === GROUPS API ===

export async function getGroups(): Promise<SkillGroup[]> {
  if (USE_MOCKS) {
    await delay(200);
    return mockGroups;
  }
  return apiRequest<SkillGroup[]>("/skills/groups");
}

export async function createGroup(
  data: Omit<SkillGroup, "id">
): Promise<{ id: string }> {
  if (USE_MOCKS) {
    await delay(300);
    return { id: `grp-${Date.now()}` };
  }
  return apiRequest<{ id: string }>("/skills/groups", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateGroup(
  id: string,
  data: Partial<SkillGroup>
): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/skills/groups/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteGroup(id: string): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/skills/groups/${id}`, {
    method: "DELETE",
  });
}

// === SKILLS API ===

export async function getSkills(params?: {
  groupId?: string;
  q?: string;
  tags?: string[];
}): Promise<Skill[]> {
  if (USE_MOCKS) {
    await delay(250);
    let filtered = getSkillsWithProgress();

    if (params?.groupId) {
      filtered = filtered.filter((s) => s.groupId === params.groupId);
    }

    if (params?.q) {
      const query = params.q.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.goalDescription?.toLowerCase().includes(query)
      );
    }

    if (params?.tags && params.tags.length > 0) {
      filtered = filtered.filter((s) =>
        params.tags!.some((tag) => s.tags.includes(tag))
      );
    }

    return filtered;
  }

  const queryParams = new URLSearchParams();
  if (params?.groupId) queryParams.append("groupId", params.groupId);
  if (params?.q) queryParams.append("q", params.q);
  if (params?.tags) params.tags.forEach((t) => queryParams.append("tags", t));

  return apiRequest<Skill[]>(`/skills?${queryParams}`);
}

export async function getSkill(
  id: string
): Promise<Skill & { parts: SkillPart[] }> {
  if (USE_MOCKS) {
    await delay(200);
    const skill = getSkillById(id);
    if (!skill) throw new Error("Skill not found");

    const parts = getPartsBySkillId(id);
    return {
      ...skill,
      parts,
    };
  }

  return apiRequest<Skill & { parts: SkillPart[] }>(`/skills/${id}`);
}

export async function createSkill(
  data: CreateSkillRequest
): Promise<{ id: string }> {
  if (USE_MOCKS) {
    await delay(300);
    return { id: `sk-${Date.now()}` };
  }
  return apiRequest<{ id: string }>("/skills", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSkill(
  id: string,
  data: UpdateSkillRequest
): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/skills/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSkill(id: string): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/skills/${id}`, {
    method: "DELETE",
  });
}

// === SKILL PARTS API ===

export async function createSkillPart(
  skillId: string,
  data: Omit<CreateSkillPartRequest, "skillId">
): Promise<{ id: string }> {
  if (USE_MOCKS) {
    await delay(300);
    return { id: `p-${Date.now()}` };
  }
  return apiRequest<{ id: string }>(`/skills/${skillId}/parts`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSkillPart(
  skillId: string,
  partId: string,
  data: Partial<SkillPart>
): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/skills/${skillId}/parts/${partId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSkillPart(
  skillId: string,
  partId: string
): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/skills/${skillId}/parts/${partId}`, {
    method: "DELETE",
  });
}

export async function setPartStatus(
  partId: string,
  status: "not-started" | "in-progress" | "done"
): Promise<void> {
  if (USE_MOCKS) {
    await delay(200);
    return;
  }
  return apiRequest<void>(`/skills/parts/${partId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

// === PET PROJECTS API ===

export async function getProjects(params?: {
  q?: string;
  skillId?: string;
}): Promise<PetProject[]> {
  if (USE_MOCKS) {
    await delay(250);
    let filtered = mockProjects;

    if (params?.q) {
      const query = params.q.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    if (params?.skillId) {
      filtered = filtered.filter((p) =>
        p.skills?.some((s) => s.id === params.skillId)
      );
    }

    return filtered;
  }

  const queryParams = new URLSearchParams();
  if (params?.q) queryParams.append("q", params.q);
  if (params?.skillId) queryParams.append("skillId", params.skillId);

  return apiRequest<PetProject[]>(`/pet-projects?${queryParams}`);
}

export async function getProject(id: string): Promise<PetProject> {
  if (USE_MOCKS) {
    await delay(200);
    const project = getProjectById(id);
    if (!project) throw new Error("Project not found");
    return project;
  }

  return apiRequest<PetProject>(`/pet-projects/${id}`);
}

export async function createProject(
  data: CreatePetProjectRequest
): Promise<{ id: string }> {
  if (USE_MOCKS) {
    await delay(300);
    return { id: `pp-${Date.now()}` };
  }
  return apiRequest<{ id: string }>("/pet-projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProject(
  id: string,
  data: Partial<PetProject>
): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/pet-projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/pet-projects/${id}`, {
    method: "DELETE",
  });
}

export async function attachSkillsToProject(
  projectId: string,
  data: AttachSkillsRequest
): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/pet-projects/${projectId}/attach-skills`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function attachPartsToProject(
  projectId: string,
  data: AttachPartsRequest
): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/pet-projects/${projectId}/attach-parts`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function detachSkillFromProject(
  projectId: string,
  skillId: string
): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/pet-projects/${projectId}/detach-skill`, {
    method: "POST",
    body: JSON.stringify({ skillId }),
  });
}

export async function detachPartFromProject(
  projectId: string,
  partId: string
): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/pet-projects/${projectId}/detach-part`, {
    method: "POST",
    body: JSON.stringify({ partId }),
  });
}

// === STUDY SESSIONS (TIME TRACKING) API ===

export async function getSessions(params: {
  entityType: "skill" | "part" | "project";
  entityId: string;
  from?: string;
  to?: string;
}): Promise<StudySession[]> {
  if (USE_MOCKS) {
    await delay(200);
    return mockSessions.filter(
      (s) =>
        s.entityType === params.entityType && s.entityId === params.entityId
    );
  }

  const queryParams = new URLSearchParams();
  queryParams.append("entityType", params.entityType);
  queryParams.append("entityId", params.entityId);
  if (params.from) queryParams.append("from", params.from);
  if (params.to) queryParams.append("to", params.to);

  return apiRequest<StudySession[]>(`/study-sessions?${queryParams}`);
}

export async function logTime(data: LogTimeRequest): Promise<{ id: string }> {
  if (USE_MOCKS) {
    await delay(300);
    return { id: `sess-${Date.now()}` };
  }
  return apiRequest<{ id: string }>("/study-sessions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteSession(id: string): Promise<void> {
  if (USE_MOCKS) {
    await delay(300);
    return;
  }
  return apiRequest<void>(`/study-sessions/${id}`, {
    method: "DELETE",
  });
}

// === SUMMARY API (для виджета) ===

export async function getSummary(params: {
  period: "week" | "month";
  tz?: string;
}): Promise<SkillsSummary> {
  if (USE_MOCKS) {
    await delay(200);
    return mockSummary;
  }

  const queryParams = new URLSearchParams();
  queryParams.append("period", params.period);
  if (params.tz) queryParams.append("tz", params.tz);

  return apiRequest<SkillsSummary>(`/skills/summary?${queryParams}`);
}
