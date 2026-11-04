<script setup>
// Полоса уровней месяца над задачами — заменила полосу roadmap'а.
// Ужата до «название · прогресс · неделя». Скрыть можно, но только до
// перезагрузки: пользователь хочет видеть её по умолчанию всегда.
// docs/me-module.md (back-m)
import { computed, ref } from "vue";
import { growth, levelColor, openMe, pickedLevels } from "@/composables/useGrowth.js";

const hidden = ref(false);
const levels = computed(() => pickedLevels.value.filter((l) => !l.maintenance));
const pct = (v) => `${Math.round((v || 0) * 100)}%`;
</script>

<template>
  <div v-if="growth && (levels.length || growth.month.needPick)" class="glb" :class="{ hidden }">
    <button class="glb-toggle" :title="hidden ? 'Показать уровни' : 'Скрыть до перезагрузки'" @click="hidden = !hidden">
      {{ hidden ? "▸ уровни месяца" : "▾" }}
    </button>
    <template v-if="!hidden">
      <button v-if="growth.month.needPick" class="glb-need" @click="openMe(null, 'month')">
        ⚠ Навыки на месяц не выбраны — дисциплина ждёт. Выбрать {{ growth.month.min }}–{{ growth.month.max }} уровня
      </button>
      <button v-for="l in levels" :key="l.id" class="glb-item" :style="{ '--c': levelColor(l) }" @click="openMe(l.id)">
        <span class="glb-title">{{ l.emoji }} {{ l.title }}</span>
        <span class="glb-bar"><em :style="{ width: pct(l.progress) }" /></span>
        <span class="glb-num">{{ pct(l.progress) }}</span>
        <span v-if="l.hoursWeek" class="glb-week">{{ l.hoursWeek.toFixed(1) }} ч/нед</span>
        <span v-if="l.monthsLeft <= 0" class="glb-over">срок</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.glb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid #1e2025;
}

.glb-toggle {
  background: none;
  border: 0;
  color: #6b7186;
  cursor: pointer;
  font-size: 12px;
}

.glb-need {
  border: 1px solid #ffd66688;
  background: #ffd66614;
  color: #ffd666;
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 13px;
}

.glb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #262833;
  border-left: 3px solid var(--c);
  background: #17181f;
  color: #e8eaf0;
  cursor: pointer;
  font-size: 12px;
  max-width: 420px;
}

.glb-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.glb-bar {
  width: 70px;
  height: 4px;
  border-radius: 2px;
  background: #2a2d38;
  overflow: hidden;
  flex: none;
}

.glb-bar em {
  display: block;
  height: 100%;
  background: var(--c);
}

.glb-num,
.glb-week {
  font-variant-numeric: tabular-nums;
  color: #b9bfd0;
}

.glb-week {
  color: #8a90a2;
}

.glb-over {
  color: #ff7a8a;
}
</style>
