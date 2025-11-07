import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { PetProject } from "../types";
import * as api from "../api";

export const useProjectsStore = defineStore("projects", () => {
  // State
  const projects = ref<Map<string, PetProject>>(new Map());
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const allProjects = computed(() => Array.from(projects.value.values()));

  const getProjectById = computed(() => (id: string) => {
    return projects.value.get(id);
  });

  const projectsBySkillId = computed(() => (skillId: string) => {
    return allProjects.value.filter((p) =>
      p.skills?.some((s) => s.id === skillId)
    );
  });

  // Actions
  async function fetchProjects(params?: Parameters<typeof api.getProjects>[0]) {
    loading.value = true;
    error.value = null;
    try {
      const fetchedProjects = await api.getProjects(params);
      fetchedProjects.forEach((project) => {
        projects.value.set(project.id, project);
      });
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch projects";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchProject(id: string) {
    loading.value = true;
    error.value = null;
    try {
      const project = await api.getProject(id);
      projects.value.set(id, project);
      return project;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch project";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createProject(data: Parameters<typeof api.createProject>[0]) {
    loading.value = true;
    error.value = null;
    try {
      const { id } = await api.createProject(data);
      const newProject: PetProject = {
        id,
        ...data,
        spentHours: 0,
        status: "not-started",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      projects.value.set(id, newProject);
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create project";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateProject(
    id: string,
    data: Parameters<typeof api.updateProject>[1]
  ) {
    loading.value = true;
    error.value = null;
    try {
      await api.updateProject(id, data);
      const existing = projects.value.get(id);
      if (existing) {
        projects.value.set(id, {
          ...existing,
          ...data,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update project";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteProject(id: string) {
    loading.value = true;
    error.value = null;
    try {
      await api.deleteProject(id);
      projects.value.delete(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete project";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function attachSkills(projectId: string, skillIds: string[]) {
    loading.value = true;
    error.value = null;
    try {
      await api.attachSkillsToProject(projectId, { skillIds });
      // Перезагружаем проект для получения актуальных данных
      await fetchProject(projectId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to attach skills";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function attachParts(projectId: string, partIds: string[]) {
    loading.value = true;
    error.value = null;
    try {
      await api.attachPartsToProject(projectId, { partIds });
      await fetchProject(projectId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to attach parts";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function detachSkill(projectId: string, skillId: string) {
    loading.value = true;
    error.value = null;
    try {
      await api.detachSkillFromProject(projectId, skillId);
      await fetchProject(projectId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to detach skill";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function detachPart(projectId: string, partId: string) {
    loading.value = true;
    error.value = null;
    try {
      await api.detachPartFromProject(projectId, partId);
      await fetchProject(projectId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to detach part";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function clearError() {
    error.value = null;
  }

  return {
    // State
    projects,
    loading,
    error,
    // Getters
    allProjects,
    getProjectById,
    projectsBySkillId,
    // Actions
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    attachSkills,
    attachParts,
    detachSkill,
    detachPart,
    clearError,
  };
});
