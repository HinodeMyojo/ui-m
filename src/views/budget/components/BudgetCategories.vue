<script setup lang="ts">
import { ref, computed } from "vue";
import { useBudgetStore } from "@/stores/budget";
import type { CreateCategoryRequest, TransactionType } from "@/types/budget";

const store = useBudgetStore();

const showModal = ref(false);
const editingId = ref<string | null>(null);
const activeType = ref<TransactionType>("expense");

const form = ref<CreateCategoryRequest>({
  name: "",
  icon: "🛒",
  color: "#1767fd",
  type: "expense",
  monthlyLimit: undefined,
});

const EMOJI_PRESETS = [
  "🛒", "🍕", "🏠", "🚗", "💊", "🎮", "👕", "✈️", "📱", "🎓",
  "💼", "🎬", "☕", "🐶", "💡", "🔧", "🎁", "📦", "🏋️", "💇",
  "💰", "💳", "📈", "🏦", "💵", "🎯", "📊", "💎",
];

const COLOR_PRESETS = [
  "#f87171", "#fb923c", "#fbbf24", "#34d399", "#22d3ee",
  "#60a5fa", "#818cf8", "#a78bfa", "#f472b6", "#6b7fa3",
  "#1767fd", "#6e4aff",
];

const displayCategories = computed(() =>
  activeType.value === "expense" ? store.expenseCategories : store.incomeCategories
);

function openAdd(type: TransactionType) {
  editingId.value = null;
  form.value = { name: "", icon: "🛒", color: "#1767fd", type, monthlyLimit: undefined };
  showModal.value = true;
}

function openEdit(id: string) {
  const cat = store.getCategoryById(id);
  if (!cat) return;
  editingId.value = id;
  form.value = { name: cat.name, icon: cat.icon, color: cat.color, type: cat.type, monthlyLimit: cat.monthlyLimit };
  showModal.value = true;
}

async function submit() {
  if (!form.value.name.trim()) return;
  try {
    if (editingId.value) {
      await store.updateCategory(editingId.value, form.value);
    } else {
      await store.createCategory(form.value);
    }
    showModal.value = false;
  } catch {}
}

async function handleDelete(id: string) {
  if (!confirm("Удалить категорию? Все связанные операции потеряют привязку.")) return;
  await store.deleteCategory(id);
}

async function handleExport() {
  const cats = await store.exportCategories();
  const json = JSON.stringify(cats.map(c => ({
    name: c.name,
    icon: c.icon,
    type: c.type,
  })), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "budget-categories.json";
  a.click();
  URL.revokeObjectURL(url);
}

function fmt(n: number | undefined) {
  return n != null ? n.toLocaleString("ru") : "—";
}
</script>

<template>
  <div class="categories-tab">
    <div class="cat-toolbar">
      <div class="filter-pills">
        <button :class="{ active: activeType === 'expense' }" @click="activeType = 'expense'">Расходы</button>
        <button :class="{ active: activeType === 'income' }" @click="activeType = 'income'">Доходы</button>
      </div>
      <div class="cat-actions">
        <button class="btn-export" @click="handleExport">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Экспорт
        </button>
        <button class="btn-add" @click="openAdd(activeType)">+ Добавить</button>
      </div>
    </div>

    <div class="cat-grid">
      <div v-if="!displayCategories.length" class="empty-hint">Нет категорий</div>
      <div
        v-for="cat in displayCategories"
        :key="cat.id"
        class="cat-card"
        :style="{ borderColor: cat.color + '40' }"
        @click="openEdit(cat.id)"
      >
        <div class="cat-icon" :style="{ background: cat.color + '20' }">{{ cat.icon }}</div>
        <div class="cat-info">
          <span class="cat-name">{{ cat.name }}</span>
          <span v-if="cat.monthlyLimit" class="cat-limit">Лимит: {{ fmt(cat.monthlyLimit) }} ₽/мес</span>
        </div>
        <button class="cat-delete" @click.stop="handleDelete(cat.id)" title="Удалить">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-card">
          <button class="modal-close" @click="showModal = false">×</button>
          <h3 class="modal-title">{{ editingId ? 'Редактировать' : 'Новая категория' }}</h3>
          <form @submit.prevent="submit" class="modal-form">
            <label>
              <span>Название</span>
              <input v-model="form.name" type="text" required maxlength="50" placeholder="Продукты" />
            </label>
            <div class="form-row">
              <label class="form-col">
                <span>Иконка</span>
                <div class="emoji-grid">
                  <button
                    v-for="e in EMOJI_PRESETS"
                    :key="e"
                    type="button"
                    class="emoji-btn"
                    :class="{ active: form.icon === e }"
                    @click="form.icon = e"
                  >{{ e }}</button>
                </div>
              </label>
              <label class="form-col">
                <span>Цвет</span>
                <div class="color-grid">
                  <button
                    v-for="c in COLOR_PRESETS"
                    :key="c"
                    type="button"
                    class="color-btn"
                    :class="{ active: form.color === c }"
                    :style="{ background: c }"
                    @click="form.color = c"
                  ></button>
                </div>
              </label>
            </div>
            <label v-if="form.type === 'expense'">
              <span>Лимит на месяц (₽)</span>
              <input v-model.number="form.monthlyLimit" type="number" min="0" step="100" placeholder="Не ограничено" />
            </label>
            <button type="submit" class="btn-submit">{{ editingId ? 'Сохранить' : 'Создать' }}</button>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.categories-tab { display: flex; flex-direction: column; gap: 16px; }

.cat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-pills {
  display: flex;
  gap: 4px;
  background: rgba(23, 103, 253, 0.06);
  border-radius: 10px;
  padding: 3px;
}
.filter-pills button {
  background: none;
  border: none;
  color: #6b7fa3;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.filter-pills button.active {
  background: rgba(23, 103, 253, 0.2);
  color: #fff;
}

.cat-actions { display: flex; gap: 8px; }

.btn-export {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.3);
  color: #34d399;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-export:hover { background: rgba(52, 211, 153, 0.2); color: #fff; }

.btn-add {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  color: #fff;
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-add:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

/* Grid */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.cat-card {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.cat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.cat-icon {
  font-size: 24px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  flex-shrink: 0;
}

.cat-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.cat-name { font-size: 14px; font-weight: 600; color: #e1e8f0; }
.cat-limit { font-size: 12px; color: #6b7fa3; }

.cat-delete {
  background: none;
  border: none;
  color: #4a5c7a;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  opacity: 0;
  transition: all 0.2s;
}
.cat-card:hover .cat-delete { opacity: 1; }
.cat-delete:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

.empty-hint { color: #4a5c7a; font-size: 14px; text-align: center; padding: 40px; grid-column: 1 / -1; }

/* Modal (shared styles) */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; padding: 16px;
}
.modal-card {
  background: linear-gradient(135deg, rgba(14, 15, 26, 0.99), rgba(20, 22, 36, 0.99));
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 16px;
  padding: 28px;
  width: 100%; max-width: 440px;
  max-height: 90vh; overflow-y: auto;
  position: relative;
}
.modal-close {
  position: absolute; top: 16px; right: 16px;
  background: none; border: none;
  color: #6b7fa3; font-size: 22px; cursor: pointer;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.modal-title { font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 20px; }

.modal-form { display: flex; flex-direction: column; gap: 14px; }
.modal-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #7eb0ff; }
.modal-form input, .modal-form select {
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 10px;
  padding: 10px 14px;
  color: #fff; font-size: 14px; outline: none;
}
.modal-form input:focus { border-color: rgba(23, 103, 253, 0.5); }

.form-row { display: flex; gap: 16px; }
.form-col { flex: 1; }

.emoji-grid, .color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.emoji-btn {
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(23, 103, 253, 0.04);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s;
}
.emoji-btn:hover { background: rgba(23, 103, 253, 0.12); }
.emoji-btn.active { border-color: #1767fd; background: rgba(23, 103, 253, 0.15); }

.color-btn {
  width: 28px; height: 28px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}
.color-btn:hover { transform: scale(1.15); }
.color-btn.active { border-color: #fff; box-shadow: 0 0 8px currentColor; }

.btn-submit {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none; color: #fff;
  padding: 12px; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.2s; margin-top: 4px;
}
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

@media (max-width: 768px) {
  .cat-toolbar { flex-direction: column; align-items: stretch; }
  .cat-grid { grid-template-columns: 1fr; }
  .cat-delete { opacity: 1; }
  .form-row { flex-direction: column; }
  .modal-card { max-width: 92vw; padding: 22px; }
}

@media (max-width: 480px) {
  .filter-pills button { padding: 8px 12px; font-size: 12px; }
  .cat-actions { flex-direction: column; width: 100%; }
  .btn-export { width: 100%; justify-content: center; min-height: 44px; font-size: 14px; }
  .btn-add { width: 100%; text-align: center; min-height: 44px; font-size: 14px; }

  .cat-card { padding: 14px; gap: 10px; }
  .cat-icon { width: 40px; height: 40px; font-size: 22px; }
  .cat-name { font-size: 13px; }
  .cat-delete { opacity: 1; min-width: 36px; min-height: 36px; display: flex; align-items: center; justify-content: center; }

  .modal-card { max-width: 92vw; padding: 18px; }
  .modal-title { font-size: 16px; margin-bottom: 16px; }
  .modal-form input,
  .modal-form select { font-size: 16px; padding: 12px 14px; }
  .btn-submit { min-height: 44px; font-size: 16px; }
  .emoji-btn { width: 38px; height: 38px; font-size: 20px; }
  .color-btn { width: 32px; height: 32px; }
}
</style>
