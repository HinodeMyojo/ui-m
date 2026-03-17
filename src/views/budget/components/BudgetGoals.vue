<script setup lang="ts">
import { ref, computed } from "vue";
import { useBudgetStore } from "@/stores/budget";
import type { CreateSavingsGoalRequest } from "@/types/budget";

const store = useBudgetStore();

const showModal = ref(false);
const showCalcModal = ref(false);
const editingId = ref<string | null>(null);
const calcGoalId = ref<string | null>(null);

const form = ref<CreateSavingsGoalRequest>({
  name: "",
  targetAmount: 0,
  currentAmount: 0,
  deadline: "",
  icon: "🎯",
  color: "#1767fd",
  imageURL: "",
  priceMin: undefined,
  priceMax: undefined,
  links: [],
  priority: 0,
});

const newLink = ref("");

const GOAL_ICONS = ["🎯", "🚗", "🏠", "✈️", "💻", "📱", "🎓", "💰", "💎", "🏖️", "🎮", "👶"];

// Calculator state
const calcMonthlySaving = ref(30000);
const calcDepositRate = ref(15);

function openAdd() {
  editingId.value = null;
  form.value = { name: "", targetAmount: 0, currentAmount: 0, deadline: "", icon: "🎯", color: "#1767fd", imageURL: "", priceMin: undefined, priceMax: undefined, links: [], priority: 0 };
  newLink.value = "";
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
    imageURL: g.imageURL ?? "",
    priceMin: g.priceMin,
    priceMax: g.priceMax,
    links: [...(g.links ?? [])],
    priority: g.priority ?? 0,
  };
  newLink.value = "";
  showModal.value = true;
}

function openCalc(id: string) {
  const g = store.goals.find((g) => g.id === id);
  if (!g) return;
  calcGoalId.value = id;
  calcMonthlySaving.value = monthlyNeeded(g);
  calcDepositRate.value = 15;
  showCalcModal.value = true;
}

const calcGoal = computed(() => store.goals.find((g) => g.id === calcGoalId.value));

// Calculator: months to goal with simple saving
const calcMonthsSimple = computed(() => {
  if (!calcGoal.value || calcMonthlySaving.value <= 0) return Infinity;
  const remaining = calcGoal.value.targetAmount - calcGoal.value.currentAmount;
  return Math.ceil(remaining / calcMonthlySaving.value);
});

// Calculator: months to goal with deposit (compound interest)
const calcMonthsWithDeposit = computed(() => {
  if (!calcGoal.value || calcMonthlySaving.value <= 0) return Infinity;
  const remaining = calcGoal.value.targetAmount - calcGoal.value.currentAmount;
  const monthlyRate = calcDepositRate.value / 100 / 12;
  if (monthlyRate <= 0) return calcMonthsSimple.value;
  // PMT formula: n = log((FV * r / PMT) + 1) / log(1 + r)
  // where FV = remaining, r = monthlyRate, PMT = calcMonthlySaving
  const n = Math.log((remaining * monthlyRate / calcMonthlySaving.value) + 1) / Math.log(1 + monthlyRate);
  return Math.ceil(n);
});

const calcDateSimple = computed(() => {
  if (calcMonthsSimple.value === Infinity) return "—";
  const d = new Date();
  d.setMonth(d.getMonth() + calcMonthsSimple.value);
  return d.toLocaleDateString("ru", { month: "long", year: "numeric" });
});

const calcDateDeposit = computed(() => {
  if (calcMonthsWithDeposit.value === Infinity) return "—";
  const d = new Date();
  d.setMonth(d.getMonth() + calcMonthsWithDeposit.value);
  return d.toLocaleDateString("ru", { month: "long", year: "numeric" });
});

const calcSavedMonths = computed(() => {
  if (calcMonthsSimple.value === Infinity || calcMonthsWithDeposit.value === Infinity) return 0;
  return calcMonthsSimple.value - calcMonthsWithDeposit.value;
});

function addLink() {
  const url = newLink.value.trim();
  if (!url) return;
  if (!form.value.links) form.value.links = [];
  form.value.links.push(url);
  newLink.value = "";
}

function removeLink(idx: number) {
  form.value.links?.splice(idx, 1);
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
  return Math.max(0, (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()));
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
        :class="{ completed: goal.status === 'completed', 'high-priority': goal.priority === 1 }"
      >
        <!-- Image -->
        <div v-if="goal.imageURL" class="goal-image" :style="{ backgroundImage: `url(${goal.imageURL})` }"></div>

        <div class="goal-body" @click="openEdit(goal.id)">
          <div class="goal-header">
            <span class="goal-icon" :style="{ background: goal.color + '20' }">{{ goal.icon }}</span>
            <div class="goal-info">
              <span class="goal-name">{{ goal.name }}</span>
              <div class="goal-meta">
                <span class="goal-status" :class="goal.status">
                  {{ goal.status === 'completed' ? 'Достигнута' : goal.status === 'cancelled' ? 'Отменена' : 'Активна' }}
                </span>
                <span v-if="goal.priority === 1" class="priority-badge">Приоритет</span>
              </div>
            </div>
            <button class="goal-delete" @click.stop="handleDelete(goal.id)" title="Удалить">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>

          <!-- Price range -->
          <div v-if="goal.priceMin || goal.priceMax" class="goal-price-range">
            <span v-if="goal.priceMin">от {{ fmt(goal.priceMin) }} ₽</span>
            <span v-if="goal.priceMin && goal.priceMax"> — </span>
            <span v-if="goal.priceMax">до {{ fmt(goal.priceMax) }} ₽</span>
          </div>

          <div class="goal-amounts">
            <span class="goal-current">{{ fmt(goal.currentAmount) }} ₽</span>
            <span class="goal-separator">/</span>
            <span class="goal-target">{{ fmt(goal.targetAmount) }} ₽</span>
          </div>

          <div class="progress-track">
            <div class="progress-fill" :style="{
              width: Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) + '%',
              background: `linear-gradient(90deg, ${goal.color}, ${goal.color}cc)`,
            }"></div>
          </div>

          <div class="goal-footer">
            <span class="goal-pct">{{ Math.round((goal.currentAmount / goal.targetAmount) * 100) }}%</span>
            <span class="goal-deadline">
              {{ monthsLeft(goal.deadline) > 0 ? `${monthsLeft(goal.deadline)} мес.` : 'Срок истёк' }}
            </span>
          </div>

          <div v-if="goal.status === 'active'" class="goal-recommend">
            Нужно: <strong>{{ fmt(monthlyNeeded(goal)) }} ₽/мес</strong>
          </div>

          <!-- Links -->
          <div v-if="goal.links?.length" class="goal-links">
            <a
              v-for="(link, i) in goal.links"
              :key="i"
              :href="link"
              target="_blank"
              rel="noopener"
              class="goal-link"
              @click.stop
            >{{ new URL(link).hostname }}</a>
          </div>
        </div>

        <!-- Calculator button -->
        <button v-if="goal.status === 'active'" class="btn-calc" @click.stop="openCalc(goal.id)">
          🧮 Калькулятор
        </button>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-card modal-wide">
          <button class="modal-close" @click="showModal = false">×</button>
          <h3 class="modal-title">{{ editingId ? 'Редактировать цель' : 'Новая цель' }}</h3>
          <form @submit.prevent="submit" class="modal-form">
            <label>
              <span>Иконка</span>
              <div class="icon-grid">
                <button v-for="ic in GOAL_ICONS" :key="ic" type="button" class="icon-btn" :class="{ active: form.icon === ic }" @click="form.icon = ic">{{ ic }}</button>
              </div>
            </label>
            <label>
              <span>Название</span>
              <input v-model="form.name" type="text" required placeholder="Mitsubishi Pajero Sport" />
            </label>
            <div class="form-row">
              <label>
                <span>Целевая сумма (₽)</span>
                <input v-model.number="form.targetAmount" type="number" min="1" step="1000" required />
              </label>
              <label>
                <span>Уже накоплено (₽)</span>
                <input v-model.number="form.currentAmount" type="number" min="0" step="100" />
              </label>
            </div>
            <div class="form-row">
              <label>
                <span>Мин. цена (₽)</span>
                <input v-model.number="form.priceMin" type="number" min="0" step="1000" placeholder="Необязательно" />
              </label>
              <label>
                <span>Макс. цена (₽)</span>
                <input v-model.number="form.priceMax" type="number" min="0" step="1000" placeholder="Необязательно" />
              </label>
            </div>
            <label>
              <span>Дедлайн</span>
              <input v-model="form.deadline" type="date" required />
            </label>
            <label>
              <span>Картинка (URL)</span>
              <input v-model="form.imageURL" type="url" placeholder="https://..." />
            </label>
            <label>
              <span>Приоритет</span>
              <select v-model.number="form.priority">
                <option :value="0">Обычный</option>
                <option :value="1">Высокий</option>
              </select>
            </label>
            <!-- Links -->
            <label>
              <span>Ссылки</span>
              <div class="links-editor">
                <div v-for="(link, i) in form.links" :key="i" class="link-chip">
                  <a :href="link" target="_blank" rel="noopener" @click.stop>{{ link.length > 40 ? link.slice(0, 40) + '...' : link }}</a>
                  <button type="button" @click="removeLink(i)">×</button>
                </div>
                <div class="link-add-row">
                  <input v-model="newLink" type="url" placeholder="https://..." @keydown.enter.prevent="addLink" />
                  <button type="button" @click="addLink" :disabled="!newLink.trim()">+</button>
                </div>
              </div>
            </label>
            <button type="submit" class="btn-submit">{{ editingId ? 'Сохранить' : 'Создать' }}</button>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Calculator Modal -->
    <Teleport to="body">
      <div v-if="showCalcModal && calcGoal" class="modal-overlay" @click.self="showCalcModal = false">
        <div class="modal-card">
          <button class="modal-close" @click="showCalcModal = false">×</button>
          <h3 class="modal-title">🧮 {{ calcGoal.name }}</h3>
          <div class="calc-target">
            Осталось: <strong>{{ fmt(calcGoal.targetAmount - calcGoal.currentAmount) }} ₽</strong>
          </div>

          <div class="calc-section">
            <label class="calc-label">
              <span>Откладываю в месяц</span>
              <div class="calc-slider-row">
                <input type="range" v-model.number="calcMonthlySaving" min="1000" :max="Math.max(200000, calcMonthlySaving)" step="1000" class="calc-slider" />
                <span class="calc-slider-val">{{ fmt(calcMonthlySaving) }} ₽</span>
              </div>
              <input v-model.number="calcMonthlySaving" type="number" min="1000" step="1000" class="calc-input" />
            </label>
          </div>

          <div class="calc-result">
            <div class="calc-result-row">
              <span>Без вклада</span>
              <div>
                <span class="calc-result-months">{{ calcMonthsSimple === Infinity ? '—' : calcMonthsSimple + ' мес' }}</span>
                <span class="calc-result-date">{{ calcDateSimple }}</span>
              </div>
            </div>
          </div>

          <div class="calc-section">
            <label class="calc-label">
              <span>Ставка по вкладу</span>
              <div class="calc-slider-row">
                <input type="range" v-model.number="calcDepositRate" min="1" max="30" step="0.5" class="calc-slider" />
                <span class="calc-slider-val">{{ calcDepositRate }}%</span>
              </div>
            </label>
          </div>

          <div class="calc-result calc-result-highlight">
            <div class="calc-result-row">
              <span>С вкладом {{ calcDepositRate }}%</span>
              <div>
                <span class="calc-result-months">{{ calcMonthsWithDeposit === Infinity ? '—' : calcMonthsWithDeposit + ' мес' }}</span>
                <span class="calc-result-date">{{ calcDateDeposit }}</span>
              </div>
            </div>
            <div v-if="calcSavedMonths > 0" class="calc-saved">
              Вклад сэкономит <strong>{{ calcSavedMonths }} мес</strong>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.goals-tab { display: flex; flex-direction: column; gap: 16px; }

.goals-toolbar { display: flex; align-items: center; justify-content: space-between; }
.section-title { font-size: 18px; font-weight: 600; color: #c8daf0; margin: 0; }

.btn-add {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none; color: #fff; padding: 10px 20px; border-radius: 10px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-add:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

.goals-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px;
}

.goal-card {
  background: linear-gradient(135deg, rgba(18, 19, 31, 0.95), rgba(23, 25, 40, 0.95));
  border: 1px solid rgba(23, 103, 253, 0.15); border-radius: 14px;
  overflow: hidden; transition: all 0.25s;
}
.goal-card:hover {
  transform: translateY(-2px); border-color: rgba(23, 103, 253, 0.35);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
.goal-card.completed { opacity: 0.6; }
.goal-card.high-priority { border-color: rgba(251, 191, 36, 0.4); }

.goal-image {
  height: 140px; background-size: cover; background-position: center;
  border-bottom: 1px solid rgba(23, 103, 253, 0.1);
}

.goal-body { padding: 20px; cursor: pointer; }

.goal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.goal-icon {
  font-size: 26px; width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 12px; flex-shrink: 0;
}
.goal-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.goal-name { font-size: 16px; font-weight: 600; color: #e1e8f0; }
.goal-meta { display: flex; gap: 8px; align-items: center; }
.goal-status { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
.goal-status.active { color: #34d399; }
.goal-status.completed { color: #60a5fa; }
.goal-status.cancelled { color: #6b7fa3; }

.priority-badge {
  font-size: 10px; color: #fbbf24; background: rgba(251, 191, 36, 0.12);
  padding: 2px 8px; border-radius: 4px; font-weight: 600;
}

.goal-delete {
  background: none; border: none; color: #4a5c7a; cursor: pointer;
  padding: 4px; border-radius: 6px; opacity: 0; transition: all 0.2s;
}
.goal-card:hover .goal-delete { opacity: 1; }
.goal-delete:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

.goal-price-range {
  font-size: 12px; color: #6b7fa3; margin-bottom: 8px;
  padding: 4px 10px; background: rgba(23, 103, 253, 0.04); border-radius: 6px;
}

.goal-amounts { margin-bottom: 10px; }
.goal-current { font-size: 22px; font-weight: 700; color: #fff; }
.goal-separator { color: #4a5c7a; margin: 0 4px; }
.goal-target { font-size: 16px; color: #6b7fa3; }

.progress-track { height: 8px; background: rgba(255, 255, 255, 0.06); border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
.progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }

.goal-footer { display: flex; justify-content: space-between; font-size: 12px; }
.goal-pct { color: #7eb0ff; font-weight: 600; }
.goal-deadline { color: #6b7fa3; }

.goal-recommend {
  margin-top: 10px; padding: 8px 12px;
  background: rgba(23, 103, 253, 0.06); border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 8px; font-size: 13px; color: #7eb0ff;
}
.goal-recommend strong { color: #fff; }

.goal-links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.goal-link {
  font-size: 11px; color: #60a5fa; background: rgba(96, 165, 250, 0.1);
  padding: 3px 10px; border-radius: 6px; text-decoration: none; transition: all 0.2s;
}
.goal-link:hover { background: rgba(96, 165, 250, 0.2); color: #93c5fd; }

.btn-calc {
  display: block; width: 100%; padding: 10px;
  background: rgba(23, 103, 253, 0.06); border: none; border-top: 1px solid rgba(23, 103, 253, 0.1);
  color: #7eb0ff; font-size: 13px; cursor: pointer; transition: all 0.2s;
}
.btn-calc:hover { background: rgba(23, 103, 253, 0.12); color: #fff; }

.empty-hint { color: #4a5c7a; font-size: 14px; text-align: center; padding: 40px; grid-column: 1 / -1; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px;
}
.modal-card {
  background: linear-gradient(135deg, rgba(14, 15, 26, 0.99), rgba(20, 22, 36, 0.99));
  border: 1px solid rgba(23, 103, 253, 0.3); border-radius: 16px;
  padding: 28px; width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto; position: relative;
}
.modal-wide { max-width: 520px; }
.modal-close {
  position: absolute; top: 16px; right: 16px; background: none; border: none;
  color: #6b7fa3; font-size: 22px; cursor: pointer; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center; border-radius: 8px;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.modal-title { font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 20px; }

.modal-form { display: flex; flex-direction: column; gap: 14px; }
.modal-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #7eb0ff; }
.modal-form input, .modal-form select {
  background: rgba(23, 103, 253, 0.06); border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 14px; outline: none;
}
.modal-form input:focus, .modal-form select:focus { border-color: rgba(23, 103, 253, 0.5); }
.modal-form select option { background: #1a1b2e; color: #fff; }

.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.icon-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.icon-btn {
  width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
  background: rgba(23, 103, 253, 0.04); border: 1px solid transparent; border-radius: 8px;
  font-size: 20px; cursor: pointer; transition: all 0.15s;
}
.icon-btn:hover { background: rgba(23, 103, 253, 0.12); }
.icon-btn.active { border-color: #1767fd; background: rgba(23, 103, 253, 0.15); }

/* Links editor */
.links-editor { display: flex; flex-direction: column; gap: 6px; }
.link-chip {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(96, 165, 250, 0.08); border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 8px; padding: 6px 10px; font-size: 12px;
}
.link-chip a { color: #60a5fa; text-decoration: none; overflow: hidden; text-overflow: ellipsis; }
.link-chip button {
  background: none; border: none; color: #6b7fa3; cursor: pointer; font-size: 16px; padding: 0 4px;
}
.link-chip button:hover { color: #f87171; }
.link-add-row { display: flex; gap: 4px; }
.link-add-row input { flex: 1; }
.link-add-row button {
  background: rgba(23, 103, 253, 0.15); border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 8px; color: #7eb0ff; width: 36px; cursor: pointer; font-size: 18px;
}
.link-add-row button:disabled { opacity: 0.4; cursor: default; }

.btn-submit {
  background: linear-gradient(135deg, #1767fd, #6e4aff); border: none; color: #fff;
  padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.2s; margin-top: 4px;
}
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(23, 103, 253, 0.3); }

/* Calculator Modal */
.calc-target {
  font-size: 15px; color: #c8daf0; margin-bottom: 20px;
  padding: 12px 16px; background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.15); border-radius: 10px;
}
.calc-target strong { color: #fff; font-size: 18px; }

.calc-section { margin-bottom: 16px; }
.calc-label { display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: #7eb0ff; }
.calc-slider-row { display: flex; align-items: center; gap: 12px; }
.calc-slider {
  flex: 1; -webkit-appearance: none; appearance: none;
  height: 6px; border-radius: 3px; background: rgba(23, 103, 253, 0.2); outline: none;
}
.calc-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 20px; height: 20px;
  border-radius: 50%; background: #1767fd; cursor: pointer;
}
.calc-slider-val { font-size: 15px; font-weight: 700; color: #fff; min-width: 80px; text-align: right; }
.calc-input {
  background: rgba(23, 103, 253, 0.06); border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 10px; padding: 8px 12px; color: #fff; font-size: 14px; outline: none; width: 100%;
}

.calc-result {
  padding: 14px 16px; background: rgba(23, 103, 253, 0.04);
  border: 1px solid rgba(23, 103, 253, 0.12); border-radius: 10px; margin-bottom: 16px;
}
.calc-result-highlight {
  background: rgba(52, 211, 153, 0.06); border-color: rgba(52, 211, 153, 0.2);
}
.calc-result-row {
  display: flex; justify-content: space-between; align-items: center;
}
.calc-result-row span:first-child { font-size: 14px; color: #c8daf0; }
.calc-result-row div { text-align: right; }
.calc-result-months { font-size: 20px; font-weight: 700; color: #34d399; display: block; }
.calc-result-date { font-size: 12px; color: #6b7fa3; }
.calc-saved {
  margin-top: 8px; font-size: 13px; color: #34d399; text-align: center;
}
.calc-saved strong { color: #fff; }

@media (max-width: 768px) {
  .goals-grid { grid-template-columns: 1fr; }
  .goal-delete { opacity: 1; }
  .form-row { grid-template-columns: 1fr; }
  .modal-card { max-width: 92vw; padding: 22px; }
  .modal-wide { max-width: 92vw; }
}

@media (max-width: 480px) {
  .goals-toolbar { flex-direction: column; gap: 10px; align-items: stretch; }
  .section-title { font-size: 16px; }
  .btn-add { width: 100%; text-align: center; min-height: 44px; font-size: 14px; }

  .goal-body { padding: 16px; }
  .goal-header { gap: 10px; margin-bottom: 12px; }
  .goal-icon { font-size: 22px; width: 42px; height: 42px; }
  .goal-name { font-size: 15px; }
  .goal-current { font-size: 20px; }
  .goal-target { font-size: 14px; }
  .goal-delete { opacity: 1; min-width: 36px; min-height: 36px; display: flex; align-items: center; justify-content: center; }
  .goal-image { height: 120px; }
  .goal-recommend { font-size: 12px; padding: 6px 10px; }
  .btn-calc { min-height: 44px; font-size: 14px; }

  .modal-card { max-width: 92vw; padding: 18px; }
  .modal-wide { max-width: 92vw; }
  .modal-title { font-size: 16px; margin-bottom: 16px; }
  .modal-form input,
  .modal-form select { font-size: 16px; padding: 12px 14px; }
  .btn-submit { min-height: 44px; font-size: 16px; }
  .icon-btn { width: 42px; height: 42px; font-size: 22px; }

  .link-add-row { flex-direction: column; gap: 6px; }
  .link-add-row input { font-size: 16px; }
  .link-add-row button { width: 100%; min-height: 44px; }

  .calc-target { font-size: 14px; padding: 10px 14px; }
  .calc-target strong { font-size: 16px; }
  .calc-slider-val { font-size: 14px; min-width: 70px; }
  .calc-input { font-size: 16px; padding: 10px 12px; }
  .calc-result-months { font-size: 18px; }
}
</style>
