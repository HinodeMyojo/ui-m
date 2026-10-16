<script setup>
import { computed, inject, onMounted, ref } from "vue";
import { fetchArchRevision, fetchArchRevisions, restoreArchRevision } from "@/components/archApi.js";
import { collapse, lineDiff } from "./lineDiff.js";

// История правок: кто (вы, Claude, шаблон), что и когда. Правка одной
// пачкой — одна строка; внутри — файлы и построчное сравнение.
const arch = inject("arch");

const revisions = ref([]);
const loading = ref(false);
const error = ref("");
const open = ref(null); // { rev, lines }
const filter = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    revisions.value = await fetchArchRevisions(arch.projectId.value, "", 200);
  } catch (err) {
    error.value = err.message || String(err);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const batches = computed(() => {
  const q = filter.value.trim().toLowerCase();
  const map = new Map();
  for (const r of revisions.value) {
    if (q && !r.path.toLowerCase().includes(q) && !(r.message || "").toLowerCase().includes(q)) continue;
    if (!map.has(r.batch)) map.set(r.batch, { id: r.batch, at: r.createdAt, author: r.author, message: r.message, files: [] });
    map.get(r.batch).files.push(r);
  }
  return [...map.values()];
});

// Предыдущая ревизия того же файла — с ней и сравниваем.
function previousOf(rev) {
  const list = revisions.value;
  const idx = list.findIndex((r) => r.id === rev.id);
  for (let i = idx + 1; i < list.length; i++) {
    if (list[i].path === rev.path) return list[i];
  }
  return null;
}

async function show(rev) {
  if (open.value?.rev.id === rev.id) {
    open.value = null;
    return;
  }
  const full = await fetchArchRevision(rev.id);
  const prev = previousOf(rev);
  const prevFull = prev && prev.op !== "delete" ? await fetchArchRevision(prev.id) : null;
  const before = rev.op === "create" ? "" : prevFull?.content || "";
  const after = rev.op === "delete" ? "" : full.content || "";
  open.value = { rev, lines: collapse(lineDiff(before, after)) };
}

async function restore(rev) {
  if (!window.confirm(`Вернуть ${rev.path} к версии ${rev.version}? Текущий текст останется в истории.`)) return;
  try {
    await restoreArchRevision(rev.id);
    await arch.reload();
    await load();
  } catch (err) {
    error.value = err.message || String(err);
  }
}

const AUTHOR = { user: "👤 вы", claude: "✳ Claude", template: "📦 шаблон" };
const OP = { create: "＋", update: "✎", delete: "🗑" };
const MARK = { add: "+ ", del: "- ", same: "  ", skip: "" };
const fmt = (iso) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div class="ar-pane" style="flex: 1">
    <div class="ar-pane-head">
      <strong>История правок</strong>
      <span class="ar-muted" style="font-size: 12px">последние {{ revisions.length }}</span>
      <div class="ar-spacer" />
      <input v-model="filter" class="ar-input" placeholder="Файл или текст правки" style="width: 240px" />
      <button class="ar-btn is-small" @click="load">↻</button>
    </div>
    <div v-if="error" class="ar-error" style="margin: 8px">{{ error }}</div>
    <div class="ar-pane-body">
      <div v-if="loading && !revisions.length" class="ar-empty">Загружаю…</div>
      <div v-for="b in batches" :key="b.id" class="ar-batch">
        <div class="ar-batch-head">
          <span>{{ AUTHOR[b.author] || b.author }}</span>
          <strong>{{ b.message || "правка" }}</strong>
          <span class="ar-dim">{{ fmt(b.at) }}</span>
        </div>
        <div v-for="r in b.files" :key="r.id">
          <div class="ar-item" style="padding: 3px 6px" @click="show(r)">
            <span class="ar-item-icon">{{ OP[r.op] }}</span>
            <span class="ar-item-label ar-mono" style="font-size: 12px">{{ r.path }}</span>
            <span class="ar-dim" style="font-size: 12px">v{{ r.version }} · {{ r.size }} симв.</span>
            <button class="ar-btn is-small is-ghost" title="Вернуть файл к этой версии" @click.stop="restore(r)">↶ вернуть</button>
          </div>
          <div v-if="open && open.rev.id === r.id" class="ar-diff ar-card" style="padding: 6px 0; margin: 4px 0 8px">
            <!-- prettier-ignore -->
            <div v-for="(l, i) in open.lines" :key="i" class="ar-diff-line" :class="'is-' + l.type">{{ MARK[l.type] }}{{ l.text }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
