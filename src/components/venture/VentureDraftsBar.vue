<script setup>
import { computed, onMounted, ref } from "vue";
import { fetchGlobalTasks } from "@/components/api.js";
import {
  fetchPendingDrafts,
  takeDraft,
  shortDate,
} from "@/components/ventureApi.js";

// Неразобранные черновики этапов на главной — docs/venture-module.md (back-m).
//
// Смысл полосы: планируя месяц, видеть, что этап уже обещал сделать, и одним
// движением превращать это в настоящую задачу — самостоятельную или подзадачу
// внутри уже заведённой. Пока черновиков нет, полоса не рисуется вовсе.

const emit = defineEmits(["taken"]);

const drafts = ref([]);
const tasks = ref([]);
const open = ref(localStorage.getItem("ventureDraftsOpen") === "1");
const busy = ref("");
const error = ref("");
const parentId = ref({});

async function load() {
  try {
    const result = await fetchPendingDrafts();
    drafts.value = Array.isArray(result) ? result : [];
  } catch {
    drafts.value = []; // раздел выключен или сервер молчит — полосы просто нет
  }
}

onMounted(async () => {
  await load();
  if (!drafts.value.length) return;
  try {
    const list = await fetchGlobalTasks();
    tasks.value = Array.isArray(list) ? list.filter((task) => !task.done) : [];
  } catch {
    tasks.value = [];
  }
});

function toggle() {
  open.value = !open.value;
  localStorage.setItem("ventureDraftsOpen", open.value ? "1" : "0");
}

// Группируем по этапу: черновик без своего узла — просто строка непонятно откуда.
const groups = computed(() => {
  const map = new Map();
  for (const draft of drafts.value) {
    const key = draft.nodeId;
    if (!map.has(key)) {
      map.set(key, {
        nodeId: key,
        title: draft.nodeTitle,
        emoji: draft.nodeEmoji,
        planEnd: draft.nodePlanEnd,
        laneColor: draft.laneColor || "#a855f7",
        ventureTitle: draft.ventureTitle,
        items: [],
      });
    }
    map.get(key).items.push(draft);
  }
  return [...map.values()];
});

async function take(draft, asSubtask) {
  busy.value = draft.id;
  error.value = "";
  try {
    const parent = asSubtask ? parentId.value[draft.nodeId] : null;
    if (asSubtask && !parent) {
      error.value = "Выберите задачу, внутрь которой класть";
      return;
    }
    await takeDraft(draft.id, { parentTaskId: parent || null });
    drafts.value = drafts.value.filter((item) => item.id !== draft.id);
    emit("taken");
  } catch (err) {
    error.value = err.message || String(err);
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <div v-if="drafts.length" class="vdb">
    <button class="vdb-head" @click="toggle">
      <span class="vdb-icon">🚀</span>
      <span class="vdb-title">
        Черновики этапов: <b>{{ drafts.length }}</b>
      </span>
      <span class="vdb-hint">не разобраны в задачи</span>
      <span class="vdb-chevron">{{ open ? "▲" : "▼" }}</span>
    </button>

    <div v-if="open" class="vdb-body">
      <div v-if="error" class="vdb-error">{{ error }}</div>

      <div v-for="group in groups" :key="group.nodeId" class="vdb-group">
        <div class="vdb-group-head">
          <span class="vdb-dot" :style="{ background: group.laneColor }" />
          <b>{{ group.emoji }} {{ group.title }}</b>
          <span class="vdb-muted">{{ group.ventureTitle }}</span>
          <span v-if="group.planEnd" class="vdb-muted">до {{ shortDate(group.planEnd) }}</span>
          <span class="vdb-spacer" />
          <select v-model="parentId[group.nodeId]" class="vdb-select">
            <option value="">— подзадачей в… —</option>
            <option v-for="task in tasks" :key="task.id" :value="task.id">{{ task.title }}</option>
          </select>
        </div>

        <div v-for="draft in group.items" :key="draft.id" class="vdb-item">
          <span class="vdb-item-title">{{ draft.emoji }} {{ draft.title }}</span>
          <span v-if="draft.estimateDays" class="vdb-muted">~{{ draft.estimateDays }} дн</span>
          <button class="vdb-btn" :disabled="busy === draft.id" @click="take(draft, false)">
            Завести задачу
          </button>
          <button
            class="vdb-btn"
            :disabled="busy === draft.id || !parentId[group.nodeId]"
            @click="take(draft, true)"
          >
            Подзадачей
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vdb {
  background: #1a1620;
  border: 1px solid #33283f;
  border-radius: 12px;
  margin: 0 0 10px;
  overflow: hidden;
}

.vdb-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: none;
  color: #e8eaf2;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 14px;
  text-align: left;
}

.vdb-head:hover {
  background: rgba(168, 85, 247, 0.08);
}

.vdb-icon {
  font-size: 16px;
}

.vdb-title {
  font-weight: 500;
}

.vdb-hint,
.vdb-muted {
  color: #8b8f9e;
  font-size: 12px;
}

.vdb-chevron {
  margin-left: auto;
  color: #8b8f9e;
  font-size: 11px;
}

.vdb-body {
  padding: 4px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vdb-group {
  border-top: 1px solid #2a2334;
  padding-top: 8px;
}

.vdb-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  margin-bottom: 6px;
}

.vdb-spacer {
  flex: 1;
}

.vdb-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.vdb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0 5px 18px;
  font-size: 13px;
  flex-wrap: wrap;
}

.vdb-item-title {
  flex: 1;
  min-width: 160px;
}

.vdb-btn,
.vdb-select {
  background: #24202c;
  color: #e8eaf2;
  border: 1px solid #362e44;
  border-radius: 8px;
  padding: 4px 9px;
  font-size: 12px;
  cursor: pointer;
}

.vdb-btn:hover:not(:disabled) {
  background: #2f2839;
}

.vdb-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.vdb-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
}

@media (max-width: 700px) {
  .vdb-item {
    padding-left: 0;
  }
}
</style>
