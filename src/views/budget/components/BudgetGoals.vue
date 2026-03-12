<script setup lang="ts">
import { ref, computed } from "vue";
import { useBudgetStore } from "@/stores/budget";
import type { CreateSavingsGoalRequest } from "@/types/budget";

const store = useBudgetStore();

const showModal = ref(false);
const editingId = ref<string | null>(null);

const form = ref<CreateSavingsGoalRequest>({
  name: "",
  targetAmount: 0,
  currentAmount: 0,
  deadline: "",
  icon: "🎯",
  color: "#1767fd",
});

const GOAL_ICONS = ["🎯", "🚗", "🏠", "✈️", "💻", "📱", "🎓", "💰", "💎", "🏖️", "🎮", "👶"];

function openAdd() {
  editingId.value = null;
  form.value = { name: "", targetAmount: 0, currentAmount: 0, deadline: "", icon: "🎯", color: "#1767fd" };
  showModal.value = true;
}

function openEdit(id: string) {
  const g = store.goals.find((g) => g.id === id);
  if (!g) return;
  editingId.value = id;
  form.value = {
    name: g.name,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    deadline: g.deadline,
    icon: g.icon,
    color: g.color,
  };
  showModal.value = true;
}

async function submit() {
  if (!form.value.name.trim() || !form.value.targetAmount || !form.value.deadline) return;
  try {
    if (editingId.value) {
      await store.updateGoal(editingId.value, form.value);
    } else {
      await store.createGoal(form.value);
    }
    showModal.value = false;
  } catch {}
}

async function handleDelete(id: string) {
  if (!confirm("Удалить цель?")) return;
  await store.deleteGoal(id);
}

function fmt(n: number) {
  return n.toLocaleString("ru");
}

function monthsLeft(deadline: string) {
  const now = new Date();
  const end = new Date(deadline);
  const diff = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return Math.max(0, diff);
}

function monthlyNeeded(goal: { targetAmount: number; currentAmount: number; deadline: string }) {
  const months = monthsLeft(goal.deadline);
  if (months <= 0) return goal.targetAmount - goal.currentAmount;
  return Math.ceil((goal.targetAmount - goal.currentAmount) / months);
}
</script>

<template>
  <div class="goals-tab">
    <div class="goals-toolbar">
      <h3 class="section-title">Цели накоплений</h3>
      <button class="btn-add" @click="openAdd">+ Новая цель</button>
    </div>

    <div class="goals-grid">
      <div v-if="!store.goals.length" class="empty-hint">Нет целей. Создайте первую!</div>
      <div
        v-for="goal in store.goals"
        :key="goal.id"
        class="goal-card"
        :class="{ completed: goal.status === 'completed' }"
        @click="openEdit(goal.id)"
      >
        <div class="goal-header">
          <span class="goal-icon" :style="{ background: goal.color + '20' }">{{ goal.icon }}</span>
          <div class="goal-info">
            <span class="goal-name">{{ goal.name }}</span>
            <span class="goal-status" :class="goal.status">
              {{ goal.status === 'completed' ? 'Достигнута' : goal.status === 'cancelled' ? 'Отменена' : 'Активна' }}
            </span>
          </div>
          <button class="goal-delete" @click.stop="handleDelete(goal.id)" title="Удалить">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>

        <div class="goal-amounts">
          <span class="goal-current">{{ fmt(goal.currentAmount) }} ₽</span>
          <span class="goal-separator">/</span>
          <span class="goal-target">{{ fmt(goal.targetAmount) }} ₽</span>
        </div>

        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{
              width: Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) + '%',
              background: `linear-gradient(90deg, ${goal.color}, ${goal.color}cc)`,
            }"
          ></div>
        </div>

        <div class="goal-footer">
          <span class="goal-pct">{{ Math.round((goal.currentAmount / goal.targetAmount) * 100) }}%</span>
          <span class="goal-deadline">
            {{ monthsLeft(goal.deadline) > 0
              ? `${monthsLeft(goal.deadline)} мес. осталось`
              : 'Срок истёк'
            }}
          </span>
        </div>

        <div v-if="goal.status === 'active'" class="goal-recommend">
          Нужно: <strong>{{ fmt(monthlyNeeded(goal)) }} ₽/мес</strong>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-card">
          <button class="modal-close" @click="showModal = false">×</button>
          <h3 class="modal-title">{{ editingId ? 'Редактировать цель' : 'Новая цель' }}</h3>
          <form @submit.prevent="submit" class="modal-form">
            <label>
              <span>Иконка</span>
              <div class="icon-grid">
                <button
                  v-for="ic in GOAL_ICONS"
                  :key="ic"
                  type="button"
                  class="icon-btn"
                  :class="{ active: form.icon === ic }"
                  @click="form.icon = ic"
                >{{ ic }}</button>
              </div>
            </label>
            <label>
              <span>Название</span>
              <input v-model="form.name" type="text" required placeholder="Машина" />
            </label>
            <label>
              <span>Целевая сумма (₽)</span>
              <input v-model.number="form.targetAmount" type="number" min="1" step="1000" required />
            </label>
            <label>
              <span>Уже накоплено (₽)</span>
              <input v-model.number="form.currentAmount" type="number" min="0" step="100" />
            </label>
            <label>
              <span>Дедлайн</span>
              <input v-model="form.deadline" type="date" required />
            </label>
            <button type="submit" class="btn-submit">{{ editingId ? 'Сохранить' : 'Создать' }}</button>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.goals-tab { display: flex; flex-direction: column; gap: 16px; }

.goals-toolbar {
  display: flex; align-items: center; justify-content: space-between;
}

.section-title { font-size: 18px; font-weight: 600; color: #c8daf0; margin: 0; }

.btn-add {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none; color: #fff;
  padding: 10px 20px; border-radius: 10px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-add:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

.goals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.goal-card {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.25s;
}
.goal-card:hover {
  transform: translateY(-2px);
  border-color: rgba(23, 103, 253, 0.35);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
.goal-card.completed { opacity: 0.6; }

.goal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.goal-icon {
  font-size: 26px;
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 12px; flex-shrink: 0;
}
.goal-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.goal-name { font-size: 16px; font-weight: 600; color: #e1e8f0; }
.goal-status { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
.goal-status.active { color: #34d399; }
.goal-status.completed { color: #60a5fa; }
.goal-status.cancelled { color: #6b7fa3; }

.goal-delete {
  background: none; border: none;
  color: #4a5c7a; cursor: pointer;
  padding: 4px; border-radius: 6px;
  opacity: 0; transition: all 0.2s;
}
.goal-card:hover .goal-delete { opacity: 1; }
.goal-delete:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

.goal-amounts { margin-bottom: 10px; }
.goal-current { font-size: 22px; font-weight: 700; color: #fff; }
.goal-separator { color: #4a5c7a; margin: 0 4px; }
.goal-target { font-size: 16px; color: #6b7fa3; }

.progress-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}
.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.goal-footer { display: flex; justify-content: space-between; font-size: 12px; }
.goal-pct { color: #7eb0ff; font-weight: 600; }
.goal-deadline { color: #6b7fa3; }

.goal-recommend {
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 8px;
  font-size: 13px;
  color: #7eb0ff;
}
.goal-recommend strong { color: #fff; }

.empty-hint { color: #4a5c7a; font-size: 14px; text-align: center; padding: 40px; grid-column: 1 / -1; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; padding: 16px;
}
.modal-card {
  background: linear-gradient(135deg, rgba(14, 15, 26, 0.99), rgba(20, 22, 36, 0.99));
  border: 1px solid rgba(23, 103, 253, 0.3); border-radius: 16px;
  padding: 28px; width: 100%; max-width: 440px;
  max-height: 90vh; overflow-y: auto; position: relative;
}
.modal-close {
  position: absolute; top: 16px; right: 16px;
  background: none; border: none; color: #6b7fa3;
  font-size: 22px; cursor: pointer; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center; border-radius: 8px;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.modal-title { font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 20px; }

.modal-form { display: flex; flex-direction: column; gap: 14px; }
.modal-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #7eb0ff; }
.modal-form input {
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.2); border-radius: 10px;
  padding: 10px 14px; color: #fff; font-size: 14px; outline: none;
}
.modal-form input:focus { border-color: rgba(23, 103, 253, 0.5); }

.icon-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.icon-btn {
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(23, 103, 253, 0.04);
  border: 1px solid transparent; border-radius: 8px;
  font-size: 20px; cursor: pointer; transition: all 0.15s;
}
.icon-btn:hover { background: rgba(23, 103, 253, 0.12); }
.icon-btn.active { border-color: #1767fd; background: rgba(23, 103, 253, 0.15); }

.btn-submit {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none; color: #fff; padding: 12px; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-top: 4px;
}
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

@media (max-width: 768px) {
  .goals-grid { grid-template-columns: 1fr; }
  .goal-delete { opacity: 1; }
}
</style>
