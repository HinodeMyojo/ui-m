<script setup>
import { ref, onMounted } from "vue";
import {
  fetchTaskStatuses,
  createTaskStatus,
  updateTaskStatus,
  deleteTaskStatus,
  reorderTaskStatuses,
} from "@/components/api.js";

const emit = defineEmits(["close", "changed"]);

const statuses = ref([]);
const loading = ref(true);
const error = ref("");
const draft = ref({ name: "", color: "#5b616e", isFinal: false, isBlocked: false });

const PALETTE = ["#5b616e", "#ffd666", "#e5484d", "#4aa8ff", "#63c94f", "#6e4aff", "#ff7ac6", "#ff8a3d"];

async function load() {
  loading.value = true;
  try {
    statuses.value = await fetchTaskStatuses();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function add() {
  const name = draft.value.name.trim();
  if (!name) return;
  try {
    await createTaskStatus({ ...draft.value, name, position: statuses.value.length });
    draft.value = { name: "", color: "#5b616e", isFinal: false, isBlocked: false };
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

async function save(status) {
  try {
    await updateTaskStatus(status.id, {
      name: status.name,
      color: status.color,
      position: status.position,
      isFinal: status.isFinal,
      isBlocked: status.isBlocked,
    });
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(status) {
  if (!confirm(`Удалить статус «${status.name}»? У задач он снимется, история в ленте останется.`)) return;
  try {
    await deleteTaskStatus(status.id);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

async function move(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= statuses.value.length) return;
  const list = [...statuses.value];
  [list[index], list[target]] = [list[target], list[index]];
  statuses.value = list;
  try {
    await reorderTaskStatuses(list.map((s) => s.id));
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<template>
  <div class="sse-overlay" @click.self="emit('close')">
    <div class="sse">
      <div class="sse-head">
        <h3>Статусы задач</h3>
        <button class="sse-x" @click="emit('close')">✕</button>
      </div>

      <div class="sse-hint">
        Набор общий для всех задач и подзадач. «Финальный» — задача считается сделанной,
        «блокирующий» — подсвечивается как проблема.
      </div>

      <div class="sse-body">
        <div v-if="loading" class="sse-note">Загружаю…</div>
        <div v-for="(s, i) in statuses" :key="s.id" class="sse-row">
          <div class="sse-colors">
            <button
              v-for="c in PALETTE"
              :key="c"
              class="sse-color"
              :class="{ on: s.color === c }"
              :style="{ background: c }"
              @click="s.color = c; save(s)"
            ></button>
          </div>
          <input v-model="s.name" class="sse-input" @change="save(s)" />
          <label class="sse-flag" title="Финальный статус">
            <input type="checkbox" v-model="s.isFinal" @change="save(s)" /> ✔
          </label>
          <label class="sse-flag" title="Блокирующий статус">
            <input type="checkbox" v-model="s.isBlocked" @change="save(s)" /> 🚧
          </label>
          <button class="sse-icon" @click="move(i, -1)">↑</button>
          <button class="sse-icon" @click="move(i, 1)">↓</button>
          <button class="sse-icon danger" @click="remove(s)">✕</button>
        </div>
      </div>

      <div class="sse-add">
        <input v-model="draft.name" class="sse-input" placeholder="Новый статус" @keydown.enter.prevent="add" />
        <div class="sse-colors">
          <button
            v-for="c in PALETTE"
            :key="c"
            class="sse-color"
            :class="{ on: draft.color === c }"
            :style="{ background: c }"
            @click="draft.color = c"
          ></button>
        </div>
        <button class="sse-btn primary" @click="add">Добавить</button>
      </div>

      <div v-if="error" class="sse-err">{{ error }}</div>
    </div>
  </div>
</template>

<style scoped>
.sse-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2400;
  padding: 16px;
}

.sse {
  width: min(620px, 100%);
  max-height: 86vh;
  background: #1b1d24;
  border: 1px solid #2f3340;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sse-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #2a2d38;
}

.sse-head h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}

.sse-x {
  background: none;
  border: none;
  color: #8f95a6;
  font-size: 18px;
  cursor: pointer;
}

.sse-hint {
  padding: 10px 16px 0;
  color: #7a7f8e;
  font-size: 11.5px;
  line-height: 1.6;
}

.sse-body {
  padding: 10px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sse-note {
  color: #7a7f8e;
  font-size: 13px;
}

.sse-row,
.sse-add {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.sse-add {
  padding: 10px 16px 14px;
  border-top: 1px solid #2a2d38;
}

.sse-colors {
  display: flex;
  gap: 2px;
}

.sse-color {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.sse-color.on {
  border-color: #fff;
}

.sse-input {
  flex: 1;
  min-width: 130px;
  background: #16171d;
  border: 1px solid #2f3340;
  border-radius: 8px;
  color: #e8eaf2;
  padding: 7px 10px;
  font-size: 13px;
  outline: none;
}

.sse-input:focus {
  border-color: #1767fd;
}

.sse-flag {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #8f95a6;
  font-size: 12px;
  cursor: pointer;
}

.sse-icon {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  font-size: 12px;
}

.sse-icon.danger:hover {
  border-color: #6b2b2e;
  color: #e5848a;
}

.sse-btn {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  min-height: 36px;
}

.sse-btn.primary {
  background: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

.sse-err {
  color: #e5484d;
  font-size: 12px;
  padding: 0 16px 12px;
}
</style>
