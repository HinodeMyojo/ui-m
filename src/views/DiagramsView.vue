<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getDiagrams, createDiagram, deleteDiagram } from "@/api/diagrams.js";

const router = useRouter();
const diagrams = ref([]);
const loading = ref(false);
const showModal = ref(false);
const newName = ref("");
const newDesc = ref("");
const creating = ref(false);

onMounted(loadDiagrams);

async function loadDiagrams() {
  loading.value = true;
  try {
    diagrams.value = await getDiagrams();
  } finally {
    loading.value = false;
  }
}

async function onCreate() {
  if (!newName.value.trim()) return;
  creating.value = true;
  try {
    const { id } = await createDiagram({
      name: newName.value.trim(),
      description: newDesc.value.trim(),
    });
    showModal.value = false;
    router.push(`/diagrams/${id}`);
  } finally {
    creating.value = false;
  }
}

async function onDelete(id, e) {
  e.stopPropagation();
  if (!confirm("Удалить диаграмму?")) return;
  await deleteDiagram(id);
  diagrams.value = diagrams.value.filter((d) => d.id !== id);
}

function openModal() {
  newName.value = "";
  newDesc.value = "";
  showModal.value = true;
}

function formatDate(str) {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="page">
    <header class="header">
      <div class="header-left">
        <button class="back-btn" @click="router.push('/')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Назад
        </button>
        <h1 class="title">Диаграммы</h1>
      </div>
      <button class="create-btn" @click="openModal">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Новая диаграмма
      </button>
    </header>

    <main class="content">
      <div v-if="loading" class="state-center">
        <div class="spinner"></div>
        <p>Загрузка...</p>
      </div>

      <div v-else-if="!diagrams.length" class="state-center">
        <div class="empty-icon">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <rect x="3" y="3" width="8" height="8" rx="1.5"/>
            <rect x="13" y="3" width="8" height="8" rx="1.5"/>
            <rect x="3" y="13" width="8" height="8" rx="1.5"/>
            <rect x="13" y="13" width="8" height="8" rx="1.5"/>
            <line x1="7" y1="11" x2="7" y2="13"/>
            <line x1="17" y1="11" x2="17" y2="13"/>
            <line x1="11" y1="7" x2="13" y2="7"/>
          </svg>
        </div>
        <p class="empty-title">Ни одной диаграммы</p>
        <p class="empty-sub">Создайте первую схему архитектуры</p>
        <button class="create-btn large" @click="openModal">Создать</button>
      </div>

      <div v-else class="grid">
        <div
          v-for="d in diagrams"
          :key="d.id"
          class="card"
          @click="router.push(`/diagrams/${d.id}`)"
        >
          <div class="card-preview">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <rect x="2" y="2" width="7" height="5" rx="1"/>
              <rect x="15" y="2" width="7" height="5" rx="1"/>
              <rect x="8" y="17" width="8" height="5" rx="1"/>
              <line x1="5.5" y1="7" x2="5.5" y2="19.5"/>
              <line x1="18.5" y1="7" x2="18.5" y2="11"/>
              <line x1="5.5" y1="19.5" x2="8" y2="19.5"/>
              <line x1="18.5" y1="11" x2="12" y2="19.5"/>
            </svg>
          </div>
          <div class="card-body">
            <h3>{{ d.name }}</h3>
            <p v-if="d.description" class="desc">{{ d.description }}</p>
            <div class="meta">
              <span>{{ (d.nodes || []).length }} узлов</span>
              <span>{{ formatDate(d.updatedAt) }}</span>
            </div>
          </div>
          <button class="del-btn" title="Удалить" @click="onDelete(d.id, $event)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </main>

    <Transition name="fade">
      <div v-if="showModal" class="overlay" @click.self="showModal = false">
        <div class="modal">
          <h2>Новая диаграмма</h2>
          <div class="field">
            <label>Название</label>
            <input
              v-model="newName"
              type="text"
              placeholder="Архитектура сервиса..."
              @keyup.enter="onCreate"
              autofocus
            />
          </div>
          <div class="field">
            <label>Описание <span class="optional">(необязательно)</span></label>
            <textarea v-model="newDesc" placeholder="Кратко о схеме..." rows="3"/>
          </div>
          <div class="modal-actions">
            <button class="btn-ghost" @click="showModal = false">Отмена</button>
            <button class="btn-primary" @click="onCreate" :disabled="!newName.trim() || creating">
              {{ creating ? "Создаю..." : "Создать" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  width: 100%;
  background: #0d0d14;
  color: #fff;
  padding: 28px 36px;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 36px;
}
.header-left { display: flex; align-items: center; gap: 20px; }

.title {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #a78bfa, #60a5fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.back-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 10px;
  color: rgba(255,255,255,0.65);
  font-size: 14px;
  cursor: pointer;
  transition: all .2s;
}
.back-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

.create-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
  box-shadow: 0 4px 16px rgba(124,58,237,0.35);
}
.create-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(124,58,237,0.5); }
.create-btn.large { padding: 14px 32px; font-size: 15px; margin-top: 16px; }

.content { flex: 1; }

.state-center {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-height: 50vh;
  color: rgba(255,255,255,0.4);
  gap: 8px;
}
.empty-icon { color: rgba(255,255,255,0.12); margin-bottom: 8px; }
.empty-title { font-size: 20px; color: rgba(255,255,255,0.7); margin: 0; }
.empty-sub { margin: 0; font-size: 14px; }

.spinner {
  width: 36px; height: 36px;
  border: 3px solid rgba(124,58,237,.2);
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.card {
  position: relative;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all .25s;
}
.card:hover {
  border-color: rgba(124,58,237,0.5);
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(0,0,0,.4);
}

.card-preview {
  height: 140px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, rgba(124,58,237,.08), rgba(79,70,229,.08));
  color: rgba(124,58,237,0.5);
}

.card-body { padding: 16px 20px 20px; }
.card-body h3 { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
.desc {
  font-size: 13px; color: rgba(255,255,255,0.45);
  margin: 0 0 10px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.meta {
  display: flex; justify-content: space-between;
  font-size: 12px; color: rgba(255,255,255,0.3);
}

.del-btn {
  position: absolute; top: 10px; right: 10px;
  padding: 7px;
  background: rgba(0,0,0,.5); border: none;
  border-radius: 8px; color: rgba(255,255,255,0.5);
  cursor: pointer; opacity: 0; transition: all .2s;
}
.card:hover .del-btn { opacity: 1; }
.del-btn:hover { background: rgba(239,68,68,.8); color: #fff; }

/* Modal */
.overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.75);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.modal {
  background: #13131f;
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 18px;
  padding: 32px;
  width: 100%; max-width: 440px;
}
.modal h2 { font-size: 22px; font-weight: 700; margin: 0 0 24px; }

.field { margin-bottom: 18px; }
.field label { display: block; font-size: 13px; color: rgba(255,255,255,.6); margin-bottom: 8px; }
.optional { color: rgba(255,255,255,.3); }
.field input, .field textarea {
  width: 100%; padding: 11px 14px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 10px;
  color: #fff; font-size: 14px;
  outline: none; transition: border-color .2s;
  box-sizing: border-box;
}
.field input:focus, .field textarea:focus { border-color: #7c3aed; }
.field textarea { resize: vertical; min-height: 72px; }

.modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }

.btn-ghost {
  padding: 11px 20px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.09);
  border-radius: 10px; color: rgba(255,255,255,.65);
  font-size: 14px; cursor: pointer; transition: all .2s;
}
.btn-ghost:hover { background: rgba(255,255,255,.1); }

.btn-primary {
  padding: 11px 24px;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  border: none; border-radius: 10px;
  color: #fff; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all .2s;
}
.btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(124,58,237,.4); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 768px) {
  .page {
    padding: 16px 12px;
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 24px;
  }

  .header-left {
    gap: 12px;
  }

  .title {
    font-size: 22px;
  }

  .back-btn {
    padding: 8px 12px;
    font-size: 13px;
  }

  .create-btn {
    width: 100%;
    justify-content: center;
    padding: 12px 20px;
  }

  .grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .card-preview {
    height: 100px;
  }

  .card-body {
    padding: 12px 16px 16px;
  }

  .del-btn {
    opacity: 1;
  }

  /* Modal */
  .modal {
    padding: 24px 18px;
    max-width: 92vw;
    border-radius: 14px;
  }

  .modal h2 {
    font-size: 18px;
  }

  .field input,
  .field textarea {
    font-size: 16px; /* prevents iOS zoom */
  }

  .modal-actions {
    flex-direction: column;
    gap: 8px;
  }

  .modal-actions .btn-ghost,
  .modal-actions .btn-primary {
    width: 100%;
    text-align: center;
    justify-content: center;
  }
}
</style>
