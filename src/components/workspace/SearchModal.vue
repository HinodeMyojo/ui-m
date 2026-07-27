<script setup>
import { ref, watch, onMounted } from "vue";
import { searchWorkItems } from "@/components/api.js";

const emit = defineEmits(["close", "open"]);

const query = ref("");
const results = ref([]);
const loading = ref(false);
const error = ref("");
const inputRef = ref(null);
let timer = null;

const MATCH_LABELS = {
  title: "заголовок",
  body: "полотно",
  note: "заметка",
  link: "ссылка",
  check: "чек-лист",
};

onMounted(() => inputRef.value?.focus());

watch(query, (value) => {
  clearTimeout(timer);
  if (value.trim().length < 2) {
    results.value = [];
    return;
  }
  timer = setTimeout(run, 250);
});

async function run() {
  loading.value = true;
  error.value = "";
  try {
    results.value = await searchWorkItems(query.value.trim());
  } catch (e) {
    error.value = e.message || "поиск не удался";
  } finally {
    loading.value = false;
  }
}

function open(result) {
  const date = result.dates?.[result.dates.length - 1];
  if (!date) return;
  emit("open", { date, itemId: result.itemId });
}

function dayLabel(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}
</script>

<template>
  <div class="sm-overlay" @click.self="emit('close')">
    <div class="sm">
      <div class="sm-head">
        <input
          ref="inputRef"
          v-model="query"
          class="sm-input"
          placeholder="Искать по всем карточкам, заметкам, ссылкам…"
          @keydown.esc="emit('close')"
        />
        <button class="sm-x" @click="emit('close')">✕</button>
      </div>

      <div class="sm-body">
        <div v-if="loading" class="sm-note">Ищу…</div>
        <div v-else-if="error" class="sm-note sm-err">{{ error }}</div>
        <div v-else-if="query.trim().length < 2" class="sm-note">Введите хотя бы 2 символа</div>
        <div v-else-if="!results.length" class="sm-note">Ничего не нашлось</div>

        <button v-for="r in results" :key="r.itemId" class="sm-row" @click="open(r)">
          <span class="sm-bar" :style="{ background: r.color || '#1767fd' }"></span>
          <span class="sm-main">
            <span class="sm-title">
              <span v-if="r.emoji" class="sm-emoji">{{ r.emoji }}</span>{{ r.title }}
            </span>
            <span class="sm-snippet">{{ r.snippet }}</span>
          </span>
          <span class="sm-meta">
            <span class="sm-where">{{ MATCH_LABELS[r.matchedIn] || r.matchedIn }}</span>
            <span class="sm-dates">{{ (r.dates || []).map(dayLabel).join(", ") }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 2300;
  padding: 8vh 16px 16px;
}

.sm {
  width: min(760px, 100%);
  max-height: 74vh;
  background: #1b1d24;
  border: 1px solid #2f3340;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sm-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid #2a2d38;
}

.sm-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e8eaf2;
  font-size: 15px;
}

.sm-x {
  background: none;
  border: none;
  color: #8f95a6;
  font-size: 18px;
  cursor: pointer;
}

.sm-body {
  overflow-y: auto;
  padding: 6px;
}

.sm-note {
  color: #7a7f8e;
  text-align: center;
  padding: 28px;
  font-size: 13px;
}

.sm-err {
  color: #e5484d;
}

.sm-row {
  display: flex;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  background: transparent;
  border: none;
  border-radius: 9px;
  padding: 9px 10px;
  cursor: pointer;
  text-align: left;
}

.sm-row:hover {
  background: #23262f;
}

.sm-bar {
  width: 3px;
  border-radius: 3px;
  flex-shrink: 0;
}

.sm-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.sm-title {
  color: #e8eaf2;
  font-size: 13.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sm-emoji {
  margin-right: 6px;
}

.sm-snippet {
  color: #8f95a6;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sm-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
}

.sm-where {
  font-size: 10.5px;
  color: #a98bff;
  border: 1px solid #6e4aff55;
  border-radius: 20px;
  padding: 1px 8px;
}

.sm-dates {
  font-size: 11px;
  color: #6e7382;
}

@media (max-width: 620px) {
  .sm-overlay {
    padding: 4vh 8px 8px;
  }
  .sm-meta {
    display: none;
  }
}
</style>
