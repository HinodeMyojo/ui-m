<script setup>
import { ref, computed, onMounted } from "vue";
import { fetchTimeEntries, addTimeEntry } from "@/components/api.js";
import { fetchTasks } from "@/components/api.js";

const emit = defineEmits(["openStats"]);

const todayTotal = ref(0); // в часах
const timeEntries = ref([]);
const tasks = ref([]);

const showQuickAdd = ref(false);
const selectedTask = ref(null);
const customDescription = ref("");
const selectedHours = ref(1);

const dailyGoal = computed(() => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = воскресенье, 6 = суббота

  if (dayOfWeek === 0) {
    return 8; // воскресенье
  } else if (dayOfWeek === 6) {
    return 4; // суббота
  } else {
    return 12; // будние дни (пн-пт)
  }
});

const progressPercent = computed(() => {
  return Math.min((todayTotal.value / dailyGoal.value) * 100, 100);
});

const remainingHours = computed(() => {
  const remaining = dailyGoal.value - todayTotal.value;
  return remaining > 0 ? remaining : 0;
});

async function loadTodayEntries() {
  const today = new Date();
  const entries = await fetchTimeEntries(today);
  timeEntries.value = entries;

  // Подсчет общего времени
  console.log("Entries:", entries);
  todayTotal.value = entries.reduce((sum, entry) => sum + entry.hours, 0);
}

async function loadTasks() {
  const today = new Date();
  tasks.value = await fetchTasks(today);
}

async function quickAddTime(hours) {
  selectedHours.value = hours;
  showQuickAdd.value = true;
}

async function submitTimeEntry() {
  const entry = {
    date: new Date(),
    hours: selectedHours.value,
    taskId: selectedTask.value?.id || null,
    description: customDescription.value || selectedTask.value?.title || "",
  };

  await addTimeEntry(entry);
  await loadTodayEntries();

  // Сброс формы
  showQuickAdd.value = false;
  selectedTask.value = null;
  customDescription.value = "";
  selectedHours.value = 1;
}

function openStatsModal() {
  emit("openStats");
}

onMounted(() => {
  loadTodayEntries();
  loadTasks();
});
</script>

<template>
  <div class="time-tracker-mini">
    <div class="tracker-header">
      <div class="header-info">
        <span class="label">Сегодня</span>
        <span class="hours-big">{{ todayTotal }}ч</span>
        <span class="hours-remaining">/ {{ dailyGoal }}ч</span>
      </div>
      <button class="stats-btn" @click="openStatsModal" title="Статистика">
        📊
      </button>
    </div>

    <div class="progress-bar-container">
      <div
        class="progress-bar-fill"
        :style="{ width: progressPercent + '%' }"
        :class="{
          'progress-low': progressPercent < 50,
          'progress-medium': progressPercent >= 50 && progressPercent < 80,
          'progress-high': progressPercent >= 80,
        }"
      ></div>
    </div>

    <div class="remaining-text" v-if="remainingHours > 0">
      Осталось: {{ remainingHours.toFixed(1) }}ч
    </div>
    <div class="remaining-text success" v-else>Цель достигнута! 🎉</div>

    <div class="quick-buttons">
      <button
        class="quick-btn"
        @click="quickAddTime(0.5)"
        title="Добавить 30 минут"
      >
        +30м
      </button>
      <button class="quick-btn" @click="quickAddTime(1)" title="Добавить 1 час">
        +1ч
      </button>
      <button
        class="quick-btn"
        @click="quickAddTime(2)"
        title="Добавить 2 часа"
      >
        +2ч
      </button>
    </div>

    <!-- Модальное окно для добавления времени -->
    <transition name="modal-fade">
      <div
        v-if="showQuickAdd"
        class="quick-add-modal"
        @click.self="showQuickAdd = false"
      >
        <div class="modal-content-small">
          <button class="modal-close-small" @click="showQuickAdd = false">
            ×
          </button>

          <h3 class="modal-title-small">
            Добавить
            {{ selectedHours === 0.5 ? "30 минут" : selectedHours + "ч" }}
          </h3>

          <div class="form-group">
            <label class="form-label">Выберите задачу (опционально)</label>
            <select v-model="selectedTask" class="form-select">
              <option :value="null">Без задачи</option>
              <option v-for="task in tasks" :key="task.id" :value="task">
                {{ task.title }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Или введите описание</label>
            <input
              v-model="customDescription"
              type="text"
              class="form-input-small"
              placeholder="Что вы делали?"
              maxlength="200"
            />
          </div>

          <button
            class="submit-btn-small"
            @click="submitTimeEntry"
            :disabled="!selectedTask && !customDescription"
          >
            Добавить
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.time-tracker-mini {
  background: linear-gradient(
    135deg,
    rgba(10 7 22 / 0.15),
    rgba(46, 38, 96, 0.25)
  );
  border: 1px solid rgba(110, 74, 255, 0.3);
  border-radius: 14px;
  padding: 5px 10px;
  min-width: 300px;
  max-width: 350px;
  height: 120px;
  display: flex;
  flex-direction: column;
  /* gap: 12px; */
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
}

.time-tracker-mini:hover {
  border-color: rgba(110, 74, 255, 0.5);
  box-shadow: 0 6px 20px rgba(110, 74, 255, 0.15);
}

.tracker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-info {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.label {
  font-size: 0.85rem;
  color: #b7c9d1;
  font-weight: 500;
}

.hours-big {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.hours-remaining {
  font-size: 1rem;
  color: #7e8a99;
  font-weight: 500;
}

.stats-btn {
  background: rgba(110, 74, 255, 0.2);
  border: 1px solid rgba(110, 74, 255, 0.3);
  border-radius: 8px;
  padding: 3px 3%;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.2s;
}

.stats-btn:hover {
  background: rgba(110, 74, 255, 0.35);
  border-color: rgba(110, 74, 255, 0.5);
  transform: scale(1.05);
}

.progress-bar-container {
  width: 100%;
  height: 8px;
  background: rgba(20, 30, 40, 0.6);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.4s ease, background-color 0.4s ease;
  box-shadow: 0 0 10px rgba(110, 74, 255, 0.5);
}

.progress-low {
  background: linear-gradient(90deg, #ff7875, #ff4d4f);
}

.progress-medium {
  background: linear-gradient(90deg, #ffa940, #ffec3d);
}

.progress-high {
  background: linear-gradient(90deg, #52c41a, #00ff80);
}

.remaining-text {
  font-size: 0.9rem;
  color: #b7c9d1;
  text-align: center;
  font-weight: 500;
}

.remaining-text.success {
  color: #52c41a;
  font-weight: 600;
}

.quick-buttons {
  display: flex;
  gap: 8px;
  justify-content: stretch;
}

.quick-btn {
  flex: 1;
  background: rgba(110, 74, 255, 0.15);
  border: 1px solid rgba(110, 74, 255, 0.3);
  border-radius: 8px;
  padding: 5px 5px;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-btn:hover {
  background: rgba(110, 74, 255, 0.3);
  border-color: rgba(110, 74, 255, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(110, 74, 255, 0.2);
}

.quick-btn:active {
  transform: translateY(0);
}

/* Модальное окно */
.quick-add-modal {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 30, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content-small {
  background: linear-gradient(
    135deg,
    rgba(35, 35, 43, 0.98),
    rgba(30, 32, 45, 0.98)
  );
  border: 1px solid rgba(110, 74, 255, 0.3);
  border-radius: 16px;
  padding: 28px 24px;
  min-width: 350px;
  max-width: 90vw;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-close-small {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: #fff;
  font-size: 1.8rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  line-height: 1;
}

.modal-close-small:hover {
  opacity: 1;
}

.modal-title-small {
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 20px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 0.9rem;
  color: #b7c9d1;
  margin-bottom: 6px;
  font-weight: 500;
}

.form-select,
.form-input-small {
  width: 100%;
  background: rgba(24, 25, 31, 0.8);
  border: 1px solid rgba(110, 74, 255, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  color: #fff;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-select:focus,
.form-input-small:focus {
  border-color: rgba(110, 74, 255, 0.5);
}

.form-select option {
  background: #18191f;
  color: #fff;
}

.submit-btn-small {
  width: 100%;
  background: linear-gradient(90deg, #6e4aff 60%, #2e2660 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1.05rem;
  font-weight: 600;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
}

.submit-btn-small:hover:not(:disabled) {
  background: linear-gradient(90deg, #8b68ff 60%, #6e4aff 100%);
  box-shadow: 0 4px 16px rgba(110, 74, 255, 0.3);
  transform: translateY(-2px);
}

.submit-btn-small:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 768px) {
  .time-tracker-mini {
    min-width: auto;
    max-width: 100%;
    width: 100%;
    height: auto;
    padding: 8px 14px;
  }

  .tracker-header {
    flex-wrap: nowrap;
  }

  .hours-big {
    font-size: 0.95rem;
  }

  .quick-buttons {
    gap: 6px;
  }

  .quick-btn {
    padding: 6px 4px;
    font-size: 0.85rem;
  }

  .modal-content-small {
    min-width: auto;
    width: 92vw;
    max-width: 92vw;
    padding: 24px 18px;
  }

  .form-select,
  .form-input-small {
    font-size: 16px; /* prevents iOS zoom */
  }
}
</style>
