<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import "@/styles/resume.css";

import {
  fetchResumeToday,
  promoteBullet,
  setBulletStatus,
  resumeToday,
} from "@/components/resumeApi.js";

// Мобильная раскладка — docs/resume-module.md, раздел 4.
// Только одно: плановые строки по дедлайну и кнопка «перевести в факт».

const router = useRouter();

const items = ref([]);
const error = ref("");
const busy = ref(false);

const overdue = computed(() => items.value.filter((i) => i.overdue));
const ready = computed(() => items.value.filter((i) => i.ready && !i.overdue));

async function load() {
  error.value = "";
  try {
    items.value = await fetchResumeToday(resumeToday());
  } catch (e) {
    error.value = e.message;
  }
}

async function run(action) {
  busy.value = true;
  try {
    await action();
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

const promote = (item) => run(() => promoteBullet(item.bulletId));

function postpone(item) {
  const value = prompt("Новый дедлайн (ГГГГ-ММ-ДД)", item.deadline || "");
  if (!value) return;
  return run(() => setBulletStatus(item.bulletId, { status: item.status, deadline: value }));
}

function deadlineLabel(item) {
  if (!item.deadline) return "без дедлайна";
  if (item.daysLeft === null || item.daysLeft === undefined) return item.deadline;
  if (item.daysLeft < 0) return `просрочено на ${-item.daysLeft} дн.`;
  if (item.daysLeft === 0) return "сегодня";
  return `осталось ${item.daysLeft} дн.`;
}

onMounted(load);
</script>

<template>
  <div class="rs">
    <div class="rs-header">
      <div>
        <h1>Резюме: план</h1>
        <div class="rs-sub">
          {{ items.length }} строк · {{ overdue.length }} просрочено · {{ ready.length }} готово к факту
        </div>
      </div>
      <button class="rs-btn" @click="router.push('/resume')">Все резюме</button>
    </div>

    <div v-if="error" class="rs-error">{{ error }}</div>
    <div v-if="!items.length" class="rs-sub">Плановых строк нет.</div>

    <div class="rs-cards">
      <div
        v-for="item in items"
        :key="item.bulletId"
        class="rs-today-card"
        :class="{ 'is-overdue': item.overdue, 'is-ready': item.ready }"
      >
        <div class="rs-chips">
          <span class="rs-chip" :class="item.status === 'planned' ? 'is-plan' : 'is-progress'">
            {{ item.status === "planned" ? "план" : "в процессе" }}
          </span>
          <span class="rs-chip">{{ item.resumeTitle }}</span>
          <span class="rs-chip">{{ item.sectionTitle }}</span>
          <span class="rs-chip" :class="{ 'is-bad': item.overdue }">{{ deadlineLabel(item) }}</span>
        </div>

        <div>{{ item.text }}</div>
        <div v-if="item.textTarget" class="rs-sub">⇢ {{ item.textTarget }}</div>

        <template v-if="item.linksTotal">
          <div class="rs-progress">
            <i :style="{ width: `${(item.linksDone / item.linksTotal) * 100}%` }" />
          </div>
          <div class="rs-sub">Связи закрыты: {{ item.linksDone }} из {{ item.linksTotal }}</div>
        </template>
        <div v-else class="rs-sub">Связей нет — непонятно, чем план подкреплён.</div>

        <div class="rs-row">
          <button class="rs-btn is-primary" :disabled="busy" @click="promote(item)">
            Перевести в факт
          </button>
          <button class="rs-btn" :disabled="busy" @click="postpone(item)">Сдвинуть срок</button>
          <span class="rs-spacer" />
          <button class="rs-btn is-small" @click="router.push(`/resume/${item.resumeId}`)">
            Открыть
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
