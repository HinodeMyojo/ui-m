<script setup>
import { percent, shortDate, formatMoney } from "@/components/ventureApi.js";

// Статистика проекта: вехи с весами, направления, бюджет по полосам и отставания.

defineProps({
  stats: { type: Object, required: true },
});
</script>

<template>
  <div class="vt-grid">
    <div class="vt-card">
      <div class="vt-label">Прогресс проекта</div>
      <div style="font-size: 34px; font-weight: 700">{{ percent(stats.progress) }}%</div>
      <div class="vt-muted">
        Считается по вехам: обычные узлы дают вес внутри своей вехи, веха — в проект
      </div>
      <div class="vt-row" style="margin-top: 10px">
        <span class="vt-chip">задачи {{ stats.taskDone }}/{{ stats.taskCount }}</span>
        <span v-if="stats.draftOpen" class="vt-chip is-warn">
          черновиков {{ stats.draftOpen }}
        </span>
        <span v-if="stats.lateNodes.length" class="vt-chip is-late">
          отстают {{ stats.lateNodes.length }}
        </span>
      </div>
    </div>

    <div class="vt-card">
      <div class="vt-label">Бюджет</div>
      <div style="font-size: 22px; font-weight: 600">
        {{ formatMoney(stats.budgetFact, stats.currency) }}
        <span class="vt-muted">из {{ formatMoney(stats.budgetPlan, stats.currency) }}</span>
      </div>
      <table v-if="stats.budget.length" class="vt-table" style="margin-top: 8px">
        <tr v-for="row in stats.budget" :key="row.title">
          <td>{{ row.title }}</td>
          <td>{{ formatMoney(row.budgetPlan, stats.currency) }}</td>
          <td class="vt-muted">узлы {{ formatMoney(row.nodePlan, stats.currency) }}</td>
        </tr>
      </table>
    </div>
  </div>

  <div class="vt-card">
    <div class="vt-label">Вехи</div>
    <table class="vt-table">
      <thead>
        <tr>
          <th>Веха</th>
          <th>Прогресс</th>
          <th>Узлов</th>
          <th>Вес</th>
          <th>Срок</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="milestone in stats.milestones" :key="milestone.id">
          <td>{{ milestone.emoji }} {{ milestone.title }}</td>
          <td style="min-width: 140px">
            <div class="vt-row">
              <div class="vt-bar"><i :style="{ width: percent(milestone.progress) + '%' }" /></div>
              <span>{{ percent(milestone.progress) }}%</span>
            </div>
          </td>
          <td>{{ milestone.childCount }}</td>
          <td>{{ milestone.weight }}</td>
          <td>
            <span v-if="milestone.planEnd" :class="{ 'vt-chip is-late': milestone.isLate }">
              {{ shortDate(milestone.planEnd) }}
            </span>
            <span v-else class="vt-muted">—</span>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!stats.milestones.length" class="vt-empty">
      Вех пока нет. Отметьте узел галочкой «Это веха» — по ним считается процент.
    </div>
  </div>

  <div class="vt-card">
    <div class="vt-label">Направления</div>
    <div class="vt-list">
      <div v-for="lane in stats.lanes" :key="lane.title" class="vt-item">
        <span class="vt-legend-dot" :style="{ background: lane.color || '#7a7f8e' }" />
        <span style="flex: 1">{{ lane.title }}</span>
        <span class="vt-muted">{{ lane.done }}/{{ lane.total }} закрыто</span>
        <div class="vt-bar" style="max-width: 120px">
          <i :style="{ width: percent(lane.progress) + '%', background: lane.color }" />
        </div>
        <span>{{ percent(lane.progress) }}%</span>
      </div>
    </div>
  </div>

  <div v-if="stats.lateNodes.length" class="vt-card">
    <div class="vt-label">Отстают</div>
    <div class="vt-list">
      <div v-for="node in stats.lateNodes" :key="node.id" class="vt-item">
        <span style="flex: 1">{{ node.emoji }} {{ node.title }}</span>
        <span class="vt-chip is-late">срок {{ shortDate(node.planEnd) }}</span>
        <span class="vt-muted">{{ percent(node.progress) }}%</span>
      </div>
    </div>
  </div>
</template>
