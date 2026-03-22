import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  CharacterProfile,
  SkillCategory,
  SkillNode,
  SkillLevel,
  SkillTreeOverview,
  SkillTreeExport,
} from "../types/skillTree";
import * as api from "../api/skillTree";

export const useSkillTreeStore = defineStore("skillTree", () => {
  const character = ref<CharacterProfile | null>(null);
  const categories = ref<SkillCategory[]>([]);
  const activeCategory = ref<SkillCategory | null>(null);
  const activeNode = ref<SkillNode | null>(null);
  const activeLevel = ref<SkillLevel | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const totalXP = computed(() => character.value?.totalXp ?? 0);
  const currentLevel = computed(() => character.value?.level ?? 1);

  async function fetchCharacter() {
    try {
      character.value = await api.getCharacter();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
    }
  }

  async function fetchCategories() {
    loading.value = true;
    error.value = null;
    try {
      categories.value = await api.getCategories();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
    } finally {
      loading.value = false;
    }
  }

  async function fetchCategory(id: string) {
    loading.value = true;
    error.value = null;
    try {
      activeCategory.value = await api.getCategory(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
    } finally {
      loading.value = false;
    }
  }

  async function fetchSkillNode(id: string) {
    loading.value = true;
    error.value = null;
    try {
      activeNode.value = await api.getSkillNode(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
    } finally {
      loading.value = false;
    }
  }

  async function fetchSkillLevel(id: string) {
    loading.value = true;
    error.value = null;
    try {
      activeLevel.value = await api.getSkillLevel(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
    } finally {
      loading.value = false;
    }
  }

  async function createCategory(data: Parameters<typeof api.createCategory>[0]) {
    loading.value = true;
    try {
      const { id } = await api.createCategory(data);
      await fetchCategories();
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateCategory(id: string, data: Parameters<typeof api.updateCategory>[1]) {
    try {
      await api.updateCategory(id, data);
      await fetchCategories();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function deleteCategory(id: string) {
    try {
      await api.deleteCategory(id);
      categories.value = categories.value.filter((c) => c.id !== id);
      if (activeCategory.value?.id === id) activeCategory.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function createSkillNode(data: Parameters<typeof api.createSkillNode>[0]) {
    try {
      const { id } = await api.createSkillNode(data);
      if (activeCategory.value) await fetchCategory(activeCategory.value.id);
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function updateSkillNode(id: string, data: Parameters<typeof api.updateSkillNode>[1]) {
    try {
      await api.updateSkillNode(id, data);
      if (activeCategory.value) await fetchCategory(activeCategory.value.id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function deleteSkillNode(id: string) {
    try {
      await api.deleteSkillNode(id);
      if (activeCategory.value) await fetchCategory(activeCategory.value.id);
      if (activeNode.value?.id === id) activeNode.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function createSkillLevel(data: Parameters<typeof api.createSkillLevel>[0]) {
    try {
      const { id } = await api.createSkillLevel(data);
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function updateSkillLevel(id: string, data: Parameters<typeof api.updateSkillLevel>[1]) {
    try {
      await api.updateSkillLevel(id, data);
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function deleteSkillLevel(id: string) {
    try {
      await api.deleteSkillLevel(id);
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
      if (activeLevel.value?.id === id) activeLevel.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function createSubSkill(data: Parameters<typeof api.createSubSkill>[0]) {
    try {
      const { id } = await api.createSubSkill(data);
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
      if (activeLevel.value) await fetchSkillLevel(activeLevel.value.id);
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function updateSubSkill(id: string, data: Parameters<typeof api.updateSubSkill>[1]) {
    try {
      await api.updateSubSkill(id, data);
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function deleteSubSkill(id: string) {
    try {
      await api.deleteSubSkill(id);
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
      if (activeLevel.value) await fetchSkillLevel(activeLevel.value.id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function completeSubSkill(id: string) {
    try {
      await api.completeSubSkill(id);
      await fetchCharacter();
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
      if (activeLevel.value) await fetchSkillLevel(activeLevel.value.id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function uncompleteSubSkill(id: string) {
    try {
      await api.uncompleteSubSkill(id);
      await fetchCharacter();
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
      if (activeLevel.value) await fetchSkillLevel(activeLevel.value.id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function passExam(levelId: string) {
    try {
      await api.passExam(levelId);
      await fetchCharacter();
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function unpassExam(levelId: string) {
    try {
      await api.unpassExam(levelId);
      await fetchCharacter();
      if (activeNode.value) await fetchSkillNode(activeNode.value.id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function exportTree() {
    try {
      return await api.exportTree();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    }
  }

  async function importTree(data: SkillTreeExport) {
    loading.value = true;
    try {
      await api.importTree(data);
      await fetchCategories();
      await fetchCharacter();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function clearError() {
    error.value = null;
  }

  return {
    character,
    categories,
    activeCategory,
    activeNode,
    activeLevel,
    loading,
    error,
    totalXP,
    currentLevel,

    fetchCharacter,
    fetchCategories,
    fetchCategory,
    fetchSkillNode,
    fetchSkillLevel,
    createCategory,
    updateCategory,
    deleteCategory,
    createSkillNode,
    updateSkillNode,
    deleteSkillNode,
    createSkillLevel,
    updateSkillLevel,
    deleteSkillLevel,
    createSubSkill,
    updateSubSkill,
    deleteSubSkill,
    completeSubSkill,
    uncompleteSubSkill,
    passExam,
    unpassExam,
    exportTree,
    importTree,
    clearError,
  };
});
