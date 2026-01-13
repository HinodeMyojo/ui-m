<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useCanvasStore } from "../stores/canvas";

const router = useRouter();
const canvasStore = useCanvasStore();

const showCreateModal = ref(false);
const newCanvasName = ref("");
const newCanvasDescription = ref("");
const searchQuery = ref("");

const loading = computed(() => canvasStore.loading);
const canvases = computed(() => {
  const all = canvasStore.allCanvases;
  if (!searchQuery.value) return all;
  const q = searchQuery.value.toLowerCase();
  return all.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
  );
});

onMounted(async () => {
  await canvasStore.fetchCanvases();
});

function openCanvas(id: string) {
  router.push(`/canvas/${id}`);
}

function openCreateModal() {
  newCanvasName.value = "";
  newCanvasDescription.value = "";
  showCreateModal.value = true;
}

async function createCanvas() {
  if (!newCanvasName.value.trim()) return;

  try {
    const id = await canvasStore.createCanvas({
      name: newCanvasName.value.trim(),
      description: newCanvasDescription.value.trim() || undefined,
    });
    showCreateModal.value = false;
    router.push(`/canvas/${id}`);
  } catch (e) {
    console.error("Failed to create canvas:", e);
  }
}

async function deleteCanvas(id: string, event: Event) {
  event.stopPropagation();
  if (confirm("Удалить эту схему?")) {
    await canvasStore.deleteCanvas(id);
  }
}

function goBack() {
  router.push("/");
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
</script>

<template>
  <div class="canvas-page">
    <!-- Header -->
    <header class="canvas-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Назад
        </button>
        <h1>Схемы и диаграммы</h1>
      </div>
      <div class="header-right">
        <div class="search-box">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Поиск схем..."
          />
        </div>
        <button class="create-btn" @click="openCreateModal">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Новая схема
        </button>
      </div>
    </header>

    <!-- Content -->
    <main class="canvas-content">
      <!-- Loading -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Загрузка схем...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="canvases.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        </div>
        <h2>Нет схем</h2>
        <p>Создайте первую схему для визуализации ваших идей</p>
        <button class="create-btn large" @click="openCreateModal">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Создать схему
        </button>
      </div>

      <!-- Canvas Grid -->
      <div v-else class="canvas-grid">
        <div
          v-for="canvas in canvases"
          :key="canvas.id"
          class="canvas-card"
          @click="openCanvas(canvas.id)"
        >
          <div class="card-preview">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <div class="card-info">
            <h3>{{ canvas.name }}</h3>
            <p v-if="canvas.description">{{ canvas.description }}</p>
            <div class="card-meta">
              <span class="elements-count">
                {{ canvas.elements.length }} элементов
              </span>
              <span class="updated-at">
                {{ formatDate(canvas.updatedAt) }}
              </span>
            </div>
          </div>
          <button
            class="delete-btn"
            @click="deleteCanvas(canvas.id, $event)"
            title="Удалить"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"
              />
            </svg>
          </button>
        </div>
      </div>
    </main>

    <!-- Create Modal -->
    <transition name="modal-fade">
      <div
        v-if="showCreateModal"
        class="modal-overlay"
        @click.self="showCreateModal = false"
      >
        <div class="modal-content">
          <h2>Новая схема</h2>
          <div class="form-group">
            <label>Название</label>
            <input
              v-model="newCanvasName"
              type="text"
              placeholder="Введите название..."
              @keyup.enter="createCanvas"
              autofocus
            />
          </div>
          <div class="form-group">
            <label>Описание (опционально)</label>
            <textarea
              v-model="newCanvasDescription"
              placeholder="Краткое описание схемы..."
              rows="3"
            ></textarea>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" @click="showCreateModal = false">
              Отмена
            </button>
            <button
              class="btn-primary"
              @click="createCanvas"
              :disabled="!newCanvasName.trim()"
            >
              Создать
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.canvas-page {
  min-height: 100vh;
  width: 100%;
  background: linear-gradient(135deg, #0f0f1a 0%, #1a1b2e 100%);
  padding: 24px 32px;
}

.canvas-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.header-left h1 {
  font-size: 28px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.5);
}

.search-box input {
  background: none;
  border: none;
  outline: none;
  color: #fff;
  font-size: 14px;
  width: 200px;
}

.search-box input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.create-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.create-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
}

.create-btn.large {
  padding: 16px 28px;
  font-size: 16px;
}

/* Content States */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: rgba(255, 255, 255, 0.6);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  color: rgba(255, 255, 255, 0.2);
  margin-bottom: 20px;
}

.empty-state h2 {
  font-size: 24px;
  color: #fff;
  margin: 0 0 8px;
}

.empty-state p {
  margin: 0 0 24px;
}

/* Canvas Grid */
.canvas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.canvas-card {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s;
}

.canvas-card:hover {
  border-color: rgba(99, 102, 241, 0.5);
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
}

.card-preview {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.1) 0%,
    rgba(139, 92, 246, 0.1) 100%
  );
  color: rgba(255, 255, 255, 0.3);
}

.card-info {
  padding: 20px;
}

.card-info h3 {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 8px;
}

.card-info p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.delete-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
}

.canvas-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.8);
  color: #fff;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1a1b2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 32px;
  width: 100%;
  max-width: 440px;
}

.modal-content h2 {
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: #6366f1;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 28px;
}

.btn-secondary {
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

.btn-primary {
  padding: 12px 24px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .modal-content,
.modal-fade-leave-active .modal-content {
  transition: transform 0.25s ease;
}

.modal-fade-enter-from .modal-content,
.modal-fade-leave-to .modal-content {
  transform: scale(0.95);
}
</style>
