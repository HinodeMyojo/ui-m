<template>
  <div
    class="skills-mini-widget"
    @click="navigateToSkills"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Основной контент -->
    <div class="widget-main">
      <!-- Кольцевая метрика прогресса -->
      <div class="progress-ring">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle
            cx="28"
            cy="28"
            r="24"
            fill="none"
            stroke="rgba(39, 103, 253, 0.15)"
            stroke-width="4"
          />
          <circle
            cx="28"
            cy="28"
            r="24"
            fill="none"
            stroke="url(#gradient)"
            stroke-width="4"
            stroke-linecap="round"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="progressOffset"
            transform="rotate(-90 28 28)"
            class="progress-circle"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#1767fd" />
              <stop offset="100%" stop-color="#6e4aff" />
            </linearGradient>
          </defs>
        </svg>
        <div class="progress-text">{{ summary?.progressPercent || 0 }}%</div>
      </div>

      <!-- Информация о времени -->
      <div class="time-info">
        <div class="time-block">
          <div class="time-label">Сегодня</div>
          <div class="time-value">
            {{ formatHours(summary?.todayHours || 0) }}
          </div>
        </div>
        <div class="time-divider"></div>
        <div class="time-block">
          <div class="time-label">Месяц</div>
          <div class="time-value">
            {{ formatHours(summary?.monthHours || 0) }}
          </div>
        </div>
      </div>

      <!-- Топ навыков -->
      <div class="top-skills">
        <div class="top-skills-title">Активные навыки</div>
        <div class="top-skills-list">
          <div
            v-for="skill in topSkills"
            :key="skill.skillId"
            class="top-skill-item"
          >
            <div class="skill-name">{{ skill.name }}</div>
            <div class="skill-hours">{{ formatHours(skill.hours) }}</div>
          </div>
        </div>
      </div>

      <!-- Иконка перехода -->
      <div class="nav-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M7 4l6 6-6 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </div>

    <!-- Тултип с графиком (при hover) -->
    <Transition name="tooltip-fade">
      <div v-if="isHovered && showTooltip" class="widget-tooltip">
        <div class="tooltip-title">Активность за неделю</div>
        <div class="sparkline">
          <svg width="200" height="50" viewBox="0 0 200 50">
            <polyline
              :points="sparklinePoints"
              fill="none"
              stroke="url(#sparkGradient)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <defs>
              <linearGradient
                id="sparkGradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stop-color="#1767fd" />
                <stop offset="100%" stop-color="#6e4aff" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="tooltip-days">
          <span v-for="day in weekDays" :key="day" class="day-label">{{
            day
          }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import * as api from "../../api";
import type { SkillsSummary } from "../../types";

const router = useRouter();
const summary = ref<SkillsSummary | null>(null);
const isHovered = ref(false);
const showTooltip = ref(true);

// Данные для sparkline (часы за последние 7 дней)
const weeklyData = ref([2, 3.5, 1, 4, 2.5, 3, 3.5]);
const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// Загрузка данных
onMounted(async () => {
  try {
    summary.value = await api.getSummary({
      period: "month",
      tz: "Europe/Amsterdam",
    });
  } catch (error) {
    console.error("Failed to load skills summary:", error);
  }
});

// Топ-3 навыка
const topSkills = computed(() => {
  return (summary.value?.topSkills || []).slice(0, 3);
});

// Прогресс для кольцевой диаграммы
const circumference = 2 * Math.PI * 24; // 2πr где r=24
const progressOffset = computed(() => {
  const percent = summary.value?.progressPercent || 0;
  return circumference - (percent / 100) * circumference;
});

// Точки для sparkline графика
const sparklinePoints = computed(() => {
  if (weeklyData.value.length === 0) return "";

  const maxValue = Math.max(...weeklyData.value);
  const width = 200;
  const height = 50;
  const padding = 5;
  const step = width / (weeklyData.value.length - 1);

  return weeklyData.value
    .map((value, index) => {
      const x = index * step;
      const y = height - padding - (value / maxValue) * (height - 2 * padding);
      return `${x},${y}`;
    })
    .join(" ");
});

// Форматирование часов
function formatHours(hours: number): string {
  if (hours === 0) return "0ч";
  if (hours < 1) return `${Math.round(hours * 60)}м`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}

// Навигация в модуль навыков
function navigateToSkills() {
  router.push("/skills");
}
</script>

<style scoped>
.skills-mini-widget {
  position: relative;
  background: linear-gradient(135deg, #111 0%, #2a063f2d 100%);
  /* background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.08) 0%,
    rgba(110, 74, 255, 0.08) 100%
  ); */
  backdrop-filter: blur(12px);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 16px;
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.skills-mini-widget:hover {
  background: linear-gradient(
    135deg,
    rgba(23, 103, 253, 0.12) 0%,
    rgba(110, 74, 255, 0.12) 100%
  );
  border-color: rgba(23, 103, 253, 0.4);
  box-shadow: 0 8px 24px rgba(23, 103, 253, 0.25);
  transform: translateY(-2px);
}

.widget-main {
  display: flex;
  align-items: center;
  gap: 20px;
}

/* Кольцевая метрика */
.progress-ring {
  position: relative;
  flex-shrink: 0;
}

.progress-circle {
  transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 0 6px rgba(23, 103, 253, 0.6));
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 8px rgba(23, 103, 253, 0.8);
}

/* Информация о времени */
.time-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.time-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.time-label {
  font-size: 11px;
  color: #b7c9d1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

.time-value {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 8px rgba(23, 103, 253, 0.4);
}

.time-divider {
  width: 1px;
  height: 32px;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(23, 103, 253, 0.3) 50%,
    transparent 100%
  );
}

/* Топ навыков */
.top-skills {
  flex: 1;
  min-width: 0;
}

.top-skills-title {
  font-size: 11px;
  color: #b7c9d1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
  margin-bottom: 8px;
}

.top-skills-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.top-skill-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.skill-name {
  font-size: 13px;
  color: #fff;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.skill-hours {
  font-size: 12px;
  color: #1767fd;
  font-weight: 600;
  flex-shrink: 0;
}

/* Иконка навигации */
.nav-icon {
  color: #1767fd;
  opacity: 0.6;
  transition: all 0.2s;
  flex-shrink: 0;
}

.skills-mini-widget:hover .nav-icon {
  opacity: 1;
  transform: translateX(4px);
}

/* Тултип с графиком */
.widget-tooltip {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  right: 0;
  background: rgba(18, 19, 31, 0.98);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.tooltip-title {
  font-size: 12px;
  color: #b7c9d1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
  margin-bottom: 12px;
}

.sparkline {
  width: 100%;
  margin-bottom: 8px;
}

.tooltip-days {
  display: flex;
  justify-content: space-between;
  padding: 0 2px;
}

.day-label {
  font-size: 10px;
  color: #b7c9d1;
  opacity: 0.7;
}

/* Transitions */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.tooltip-fade-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Адаптивность */
@media (max-width: 1200px) {
  .top-skills {
    display: none;
  }
}

@media (max-width: 768px) {
  .skills-mini-widget {
    padding: 12px 16px;
  }

  .widget-main {
    gap: 12px;
  }

  .progress-ring svg {
    width: 48px;
    height: 48px;
  }

  .progress-text {
    font-size: 12px;
  }

  .time-value {
    font-size: 14px;
  }

  .widget-tooltip {
    display: none;
  }
}
</style>
