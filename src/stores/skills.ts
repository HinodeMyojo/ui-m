import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { SkillGroup, Skill, SkillPart } from "../types";
import * as api from "../api";

export const useSkillsStore = defineStore("skills", () => {
  // State
  const groups = ref<SkillGroup[]>([]);
  const skills = ref<Map<string, Skill>>(new Map());
  const partsBySkill = ref<Map<string, SkillPart[]>>(new Map());
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastFetchTime = ref(0);

  // Getters
  const allSkills = computed(() => Array.from(skills.value.values()));

  const skillsByGroup = computed(() => (groupId: string) => {
    return allSkills.value.filter((s) => s.groupId === groupId);
  });

  const getSkillById = computed(() => (id: string) => {
    return skills.value.get(id);
  });

  const getPartsBySkillId = computed(() => (skillId: string) => {
    return partsBySkill.value.get(skillId) || [];
  });

  // Actions
  async function fetchGroups() {
    loading.value = true;
    error.value = null;
    try {
      groups.value = await api.getGroups();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch groups";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchSkills(params?: Parameters<typeof api.getSkills>[0]) {
    loading.value = true;
    error.value = null;
    try {
      const fetchedSkills = await api.getSkills(params);
      fetchedSkills.forEach((skill) => {
        skills.value.set(skill.id, skill);
      });
      lastFetchTime.value = Date.now();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch skills";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchSkillDetail(id: string) {
    loading.value = true;
    error.value = null;
    try {
      const skillWithParts = await api.getSkill(id);
      skills.value.set(id, skillWithParts);
      partsBySkill.value.set(id, skillWithParts.parts);
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to fetch skill detail";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createSkill(data: Parameters<typeof api.createSkill>[0]) {
    loading.value = true;
    error.value = null;
    try {
      const { id } = await api.createSkill(data);
      // Оптимистично добавляем в локальное состояние
      const newSkill: Skill = {
        id,
        ...data,
        spentHours: 0,
        tags: data.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      skills.value.set(id, newSkill);
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to create skill";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateSkill(
    id: string,
    data: Parameters<typeof api.updateSkill>[1]
  ) {
    loading.value = true;
    error.value = null;
    try {
      await api.updateSkill(id, data);
      const existing = skills.value.get(id);
      if (existing) {
        skills.value.set(id, {
          ...existing,
          ...data,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update skill";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteSkill(id: string) {
    loading.value = true;
    error.value = null;
    try {
      await api.deleteSkill(id);
      skills.value.delete(id);
      partsBySkill.value.delete(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete skill";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function setPartStatus(
    partId: string,
    status: "not-started" | "in-progress" | "done"
  ) {
    loading.value = true;
    error.value = null;
    try {
      await api.setPartStatus(partId, status);
      // Обновляем локальное состояние
      for (const [skillId, parts] of Array.from(partsBySkill.value.entries())) {
        const partIndex = parts.findIndex((p) => p.id === partId);
        if (partIndex !== -1) {
          parts[partIndex].status = status;
          partsBySkill.value.set(skillId, [...parts]);
          break;
        }
      }
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to update part status";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createSkillPart(
    skillId: string,
    data: Omit<Parameters<typeof api.createSkillPart>[1], "skillId">
  ) {
    loading.value = true;
    error.value = null;
    try {
      const { id } = await api.createSkillPart(skillId, data);

      // Добавляем новую часть в локальное состояние
      const newPart: SkillPart = {
        id,
        skillId,
        title: data.title,
        content: data.content,
        status: "not-started",
        expectedHours: data.expectedHours,
        spentHours: 0,
      };

      const existingParts = partsBySkill.value.get(skillId) || [];
      partsBySkill.value.set(skillId, [...existingParts, newPart]);

      return id;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to create skill part";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateSkillPart(
    skillId: string,
    partId: string,
    data: Partial<SkillPart>
  ) {
    loading.value = true;
    error.value = null;
    try {
      await api.updateSkillPart(skillId, partId, data);

      // Обновляем локальное состояние
      const parts = partsBySkill.value.get(skillId);
      if (parts) {
        const partIndex = parts.findIndex((p) => p.id === partId);
        if (partIndex !== -1) {
          parts[partIndex] = { ...parts[partIndex], ...data };
          partsBySkill.value.set(skillId, [...parts]);
        }
      }
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to update skill part";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteSkillPart(skillId: string, partId: string) {
    loading.value = true;
    error.value = null;
    try {
      await api.deleteSkillPart(skillId, partId);

      // Удаляем из локального состояния
      const parts = partsBySkill.value.get(skillId);
      if (parts) {
        const filtered = parts.filter((p) => p.id !== partId);
        partsBySkill.value.set(skillId, filtered);
      }
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to delete skill part";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function clearError() {
    error.value = null;
  }

  function reset() {
    groups.value = [];
    skills.value.clear();
    partsBySkill.value.clear();
    loading.value = false;
    error.value = null;
    lastFetchTime.value = 0;
  }

  return {
    // State
    groups,
    skills,
    partsBySkill,
    loading,
    error,
    lastFetchTime,

    // Getters
    allSkills,
    skillsByGroup,
    getSkillById,
    getPartsBySkillId,

    // Actions
    fetchGroups,
    fetchSkills,
    fetchSkillDetail,
    createSkill,
    updateSkill,
    deleteSkill,
    setPartStatus,
    createSkillPart,
    updateSkillPart,
    deleteSkillPart,
    clearError,
    reset,
  };
});
