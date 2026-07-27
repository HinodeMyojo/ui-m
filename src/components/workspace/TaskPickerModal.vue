<script setup>
import { ref, computed, onMounted } from "vue";
import { fetchGlobalTasks, fetchTasks } from "@/components/api.js";

const props = defineProps({
  selected: { type: Array, default: () => [] }, // массив id уже привязанных
});
const emit = defineEmits(["close", "apply"]);

const loading = ref(true);
const error = ref("");
const groups = ref([]); // [{ id, title, color, isGlobal, done, subtasks: [] }]
const chosen = ref(new Set(props.selected));
const query = ref("");
const expanded = ref(new Set());
const onlyOpen = ref(true);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const now = new Date();
    const [global, monthly] = await Promise.all([
      fetchGlobalTasks(),
      fetchTasks({ value: now }).catch(() => []),
    ]);
    const merged = [...(global || []), ...(monthly || [])];
    const byId = new Map();
    for (const t of merged) {
      if (!byId.has(t.id)) byId.set(t.id, t);
    }
    groups.value = Array.from(byId.values());
    // Раскрываем те, где уже что-то выбрано.
    for (const g of groups.value) {
      if ((g.subtasks || []).some((s) => chosen.value.has(s.id))) expanded.value.add(g.id);
    }
  } catch (e) {
    error.value = e.message || "не удалось загрузить задачи";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return groups.value
    .map((g) => {
      const subtasks = (g.subtasks || []).filter((s) => {
        if (onlyOpen.value && s.done && !chosen.value.has(s.id)) return false;
        if (!q) return true;
        return s.title.toLowerCase().includes(q);
      });
      const selfMatches = !q || g.title.toLowerCase().includes(q);
      if (!selfMatches && subtasks.length === 0) return null;
      return { ...g, subtasks, forceOpen: !!q && subtasks.length > 0 };
    })
    .filter(Boolean)
    .filter((g) => (onlyOpen.value ? !g.done || chosen.value.has(g.id) || g.subtasks.length : true));
});

function toggle(id) {
  const next = new Set(chosen.value);
  next.has(id) ? next.delete(id) : next.add(id);
  chosen.value = next;
}

function toggleExpand(id) {
  const next = new Set(expanded.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expanded.value = next;
}

function isOpen(group) {
  return group.forceOpen || expanded.value.has(group.id);
}

function apply() {
  emit("apply", Array.from(chosen.value));
}
</script>

<template>
  <div class="tp-overlay" @click.self="emit('close')">
    <div class="tp">
      <div class="tp-head">
        <h3>Прикрепить задачи</h3>
        <button class="tp-x" @click="emit('close')">✕</button>
      </div>

      <div class="tp-controls">
        <input v-model="query" class="tp-search" placeholder="Поиск по задачам и подзадачам…" />
        <label class="tp-check">
          <input type="checkbox" v-model="onlyOpen" />
          только незакрытые
        </label>
      </div>

      <div class="tp-body">
        <div v-if="loading" class="tp-note">Загружаю…</div>
        <div v-else-if="error" class="tp-note tp-err">{{ error }}</div>
        <div v-else-if="!filtered.length" class="tp-note">Ничего не нашлось</div>

        <div v-for="g in filtered" :key="g.id" class="tp-group">
          <div class="tp-row" :class="{ picked: chosen.has(g.id) }">
            <button
              class="tp-expand"
              :class="{ hidden: !(g.subtasks || []).length }"
              @click="toggleExpand(g.id)"
            >
              {{ isOpen(g) ? "▾" : "▸" }}
            </button>
            <label class="tp-label">
              <input type="checkbox" :checked="chosen.has(g.id)" @change="toggle(g.id)" />
              <span class="tp-dot" :style="{ background: g.color || '#1767fd' }"></span>
              <span class="tp-title" :class="{ done: g.done }">{{ g.title }}</span>
              <span v-if="g.isGlobal" class="tp-badge">глобальная</span>
              <span v-if="(g.subtasks || []).length" class="tp-count">
                {{ g.completedSubtasks }}/{{ g.totalSubtasks }}
              </span>
            </label>
          </div>

          <div v-if="isOpen(g)" class="tp-subs">
            <label
              v-for="s in g.subtasks"
              :key="s.id"
              class="tp-label tp-sub"
              :class="{ picked: chosen.has(s.id) }"
            >
              <input type="checkbox" :checked="chosen.has(s.id)" @change="toggle(s.id)" />
              <span class="tp-title" :class="{ done: s.done }">{{ s.title }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="tp-foot">
        <span class="tp-selected">Выбрано: {{ chosen.size }}</span>
        <button class="tp-btn" @click="emit('close')">Отмена</button>
        <button class="tp-btn primary" @click="apply">Прикрепить</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2200;
  padding: 16px;
}

.tp {
  width: min(720px, 100%);
  max-height: min(80vh, 720px);
  background: #1b1d24;
  border: 1px solid #2f3340;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #2a2d38;
}

.tp-head h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}

.tp-x {
  background: none;
  border: none;
  color: #8f95a6;
  font-size: 18px;
  cursor: pointer;
}

.tp-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid #2a2d38;
  flex-wrap: wrap;
}

.tp-search {
  flex: 1;
  min-width: 180px;
  background: #16171d;
  border: 1px solid #2f3340;
  border-radius: 8px;
  color: #e8eaf2;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
}

.tp-search:focus {
  border-color: #1767fd;
}

.tp-check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #9aa0b1;
  font-size: 12px;
  cursor: pointer;
}

.tp-body {
  overflow-y: auto;
  padding: 8px 10px 12px;
  flex: 1;
}

.tp-note {
  color: #7a7f8e;
  text-align: center;
  padding: 26px;
  font-size: 13px;
}

.tp-err {
  color: #e5484d;
}

.tp-group {
  margin-bottom: 2px;
}

.tp-row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 8px;
}

.tp-row.picked,
.tp-label.picked {
  background: #1767fd1a;
}

.tp-expand {
  background: none;
  border: none;
  color: #7a7f8e;
  cursor: pointer;
  width: 22px;
  font-size: 12px;
}

.tp-expand.hidden {
  visibility: hidden;
}

.tp-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.tp-label:hover {
  background: #23262f;
}

.tp-sub {
  margin-left: 30px;
  font-size: 13px;
}

.tp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tp-title {
  color: #dfe3ee;
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tp-title.done {
  color: #6e7382;
  text-decoration: line-through;
}

.tp-badge {
  font-size: 10px;
  color: #a98bff;
  border: 1px solid #6e4aff66;
  border-radius: 20px;
  padding: 1px 7px;
  flex-shrink: 0;
}

.tp-count {
  margin-left: auto;
  font-size: 11px;
  color: #7a7f8e;
  flex-shrink: 0;
}

.tp-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #2a2d38;
}

.tp-selected {
  margin-right: auto;
  color: #8f95a6;
  font-size: 12px;
}

.tp-btn {
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  min-height: 38px;
}

.tp-btn:hover {
  border-color: #6e4aff;
}

.tp-btn.primary {
  background: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

@media (max-width: 620px) {
  .tp {
    max-height: 92vh;
    width: 100%;
  }
  .tp-sub {
    margin-left: 14px;
  }
}
</style>
