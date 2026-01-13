import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Canvas, CanvasElement } from "../types/canvas";
import * as api from "../api";

export const useCanvasStore = defineStore("canvas", () => {
  // State
  const canvases = ref<Map<string, Canvas>>(new Map());
  const currentCanvas = ref<Canvas | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const allCanvases = computed(() =>
    Array.from(canvases.value.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  );

  const getCanvasById = (id: string) => canvases.value.get(id);

  // Actions
  async function fetchCanvases() {
    loading.value = true;
    error.value = null;
    try {
      const fetchedCanvases = await api.getCanvases();
      canvases.value.clear();
      fetchedCanvases.forEach((canvas) => {
        canvases.value.set(canvas.id, canvas);
      });
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Ошибка загрузки схем";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchCanvas(id: string) {
    loading.value = true;
    error.value = null;
    try {
      const canvas = await api.getCanvas(id);
      canvases.value.set(id, canvas);
      currentCanvas.value = canvas;
      return canvas;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Ошибка загрузки схемы";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createCanvas(data: { name: string; description?: string }) {
    loading.value = true;
    error.value = null;
    try {
      const { id } = await api.createCanvas(data);
      const newCanvas: Canvas = {
        id,
        name: data.name,
        description: data.description,
        elements: [],
        zoom: 1,
        panX: 0,
        panY: 0,
        backgroundColor: "#1a1b26",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      canvases.value.set(id, newCanvas);
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Ошибка создания схемы";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateCanvas(id: string, data: Partial<Canvas>) {
    loading.value = true;
    error.value = null;
    try {
      await api.updateCanvas(id, data);
      const existing = canvases.value.get(id);
      if (existing) {
        const updated = {
          ...existing,
          ...data,
          updatedAt: new Date().toISOString(),
        };
        canvases.value.set(id, updated);
        if (currentCanvas.value?.id === id) {
          currentCanvas.value = updated;
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Ошибка обновления схемы";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteCanvas(id: string) {
    loading.value = true;
    error.value = null;
    try {
      await api.deleteCanvas(id);
      canvases.value.delete(id);
      if (currentCanvas.value?.id === id) {
        currentCanvas.value = null;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Ошибка удаления схемы";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // Локальное обновление элементов (без API call, для performance)
  function updateLocalElements(canvasId: string, elements: CanvasElement[]) {
    const canvas = canvases.value.get(canvasId);
    if (canvas) {
      canvas.elements = elements;
      canvas.updatedAt = new Date().toISOString();
      if (currentCanvas.value?.id === canvasId) {
        currentCanvas.value = { ...canvas };
      }
    }
  }

  // Сохранить текущие элементы на сервер
  async function saveElements(canvasId: string, elements: CanvasElement[]) {
    await updateCanvas(canvasId, { elements });
  }

  function setCurrentCanvas(canvas: Canvas | null) {
    currentCanvas.value = canvas;
  }

  function clearError() {
    error.value = null;
  }

  return {
    // State
    canvases,
    currentCanvas,
    loading,
    error,
    // Getters
    allCanvases,
    getCanvasById,
    // Actions
    fetchCanvases,
    fetchCanvas,
    createCanvas,
    updateCanvas,
    deleteCanvas,
    updateLocalElements,
    saveElements,
    setCurrentCanvas,
    clearError,
  };
});
