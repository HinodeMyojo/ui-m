<script setup>
import { computed, inject, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { createArchLink, deleteArchLink, searchArchTargets, updateArchLink } from "@/components/archApi.js";
import { docTitle, elementList, viewList } from "./archModel.js";

// Дела проекта: карточки «Сегодня» и задачи главной, привязанные к проекту
// целиком или к его части — элементу, сценарию, документу.
const arch = inject("arch");
const { project, dump, files, paths, selection } = arch;
const router = useRouter();

const query = ref("");
const results = ref([]);
const searching = ref(false);
const anchor = ref(selection.anchor || "");
const note = ref("");
const error = ref("");
const showDone = ref(false);

onMounted(() => {
  selection.anchor = "";
  search();
});

let timer = null;
watch(query, () => {
  clearTimeout(timer);
  timer = setTimeout(search, 250);
});

async function search() {
  searching.value = true;
  try {
    results.value = await searchArchTargets(query.value);
  } catch (err) {
    error.value = err.message || String(err);
  } finally {
    searching.value = false;
  }
}

// Куда можно привязать: проект, элемент, сценарий, документ.
const anchors = computed(() => {
  const out = [{ value: "", label: "Проект целиком" }];
  for (const v of viewList(dump.value)) out.push({ value: "view:" + v.id, label: "▦ " + v.title, group: "Диаграммы" });
  for (const e of elementList(dump.value)) out.push({ value: e.id, label: "◇ " + e.title + " (" + e.id + ")", group: "Элементы" });
  for (const p of paths.value) {
    if (p.endsWith(".md")) out.push({ value: "file:" + p, label: "¶ " + docTitle(p, files[p]), group: "Документы" });
  }
  return out;
});

function anchorLabel(value) {
  if (!value) return "Проект целиком";
  return anchors.value.find((a) => a.value === value)?.label || value;
}

const links = computed(() => (project.value?.links || []).filter((l) => showDone.value || !l.done));
const grouped = computed(() => {
  const map = new Map();
  for (const l of links.value) {
    if (!map.has(l.anchor)) map.set(l.anchor, []);
    map.get(l.anchor).push(l);
  }
  return [...map.entries()].map(([key, list]) => ({ key, title: anchorLabel(key), list }));
});
const doneCount = computed(() => (project.value?.links || []).filter((l) => l.done).length);
const linkedKeys = computed(() => new Set((project.value?.links || []).map((l) => `${l.targetKind}:${l.targetId}:${l.anchor}`)));

async function attach(target) {
  error.value = "";
  try {
    await createArchLink(project.value.id, {
      targetKind: target.kind,
      targetId: target.id,
      anchor: anchor.value,
      note: note.value,
    });
    note.value = "";
    await arch.refreshMeta();
  } catch (err) {
    error.value = err.message || String(err);
  }
}

async function detach(link) {
  await deleteArchLink(link.id);
  await arch.refreshMeta();
}

async function changeAnchor(link, value) {
  await updateArchLink(link.id, { anchor: value });
  await arch.refreshMeta();
}

async function editNote(link) {
  const value = window.prompt("Заметка к привязке", link.note || "");
  if (value === null) return;
  await updateArchLink(link.id, { note: value });
  await arch.refreshMeta();
}

function openTarget(link) {
  if (link.targetKind === "card") {
    router.push({ path: "/today", query: { ...(link.date ? { date: link.date } : {}), item: link.targetId } });
  } else {
    router.push({ path: "/" });
  }
}

function openAnchor(value) {
  if (!value) return;
  if (value.startsWith("view:")) arch.openView(value.slice(5));
  else if (value.startsWith("file:")) arch.openFile(value.slice(5));
  else arch.openElement(value);
}

const STATUS = {
  todo: { title: "в плане", color: "#94a3b8" },
  doing: { title: "в работе", color: "#38bdf8" },
  paused: { title: "пауза", color: "#f59e0b" },
  done: { title: "сделано", color: "#22c55e" },
  dropped: { title: "отменено", color: "#64748b" },
};
</script>

<template>
  <div class="ar-split" style="grid-template-columns: minmax(0, 1fr) minmax(300px, 420px)">
    <div class="ar-pane">
      <div class="ar-pane-head">
        <strong>Привязанные дела</strong>
        <div class="ar-spacer" />
        <label v-if="doneCount" class="ar-row ar-muted" style="font-size: 12px; gap: 4px">
          <input v-model="showDone" type="checkbox" /> закрытые ({{ doneCount }})
        </label>
      </div>
      <div class="ar-pane-body" style="padding: 8px 12px">
        <div v-if="!grouped.length" class="ar-empty">
          Пока ничего не привязано. Найдите карточку или задачу справа — или скажите Claude:
          «привяжи карточку про идемпотентность к {{ project.slug }}».
        </div>
        <div v-for="g in grouped" :key="g.key" style="margin-bottom: 14px">
          <div class="ar-group-title" style="padding-left: 0">
            <a v-if="g.key" href="#" style="color: inherit" @click.prevent="openAnchor(g.key)">{{ g.title }}</a>
            <span v-else>{{ g.title }}</span>
          </div>
          <div v-for="l in g.list" :key="l.id" class="ar-card" style="padding: 10px; margin-bottom: 6px">
            <div class="ar-row" style="flex-wrap: nowrap">
              <span>{{ l.targetKind === "card" ? "📅" : "📋" }}</span>
              <span v-if="l.emoji">{{ l.emoji }}</span>
              <a
                href="#"
                style="flex: 1; color: var(--ar-text); min-width: 0"
                :style="{ textDecoration: l.done ? 'line-through' : 'none', opacity: l.missing ? 0.5 : 1 }"
                @click.prevent="openTarget(l)"
              >
                {{ l.missing ? "удалено" : l.title }}
              </a>
              <span class="ar-chip">
                <span class="ar-dot" :style="{ background: STATUS[l.status]?.color }" />
                {{ STATUS[l.status]?.title || l.status }}
              </span>
              <button class="ar-btn is-ghost is-small" title="Отвязать" @click="detach(l)">✕</button>
            </div>
            <div v-if="l.note" class="ar-muted" style="font-size: 13px; margin-top: 4px">{{ l.note }}</div>
            <div class="ar-row" style="margin-top: 6px; gap: 6px">
              <select class="ar-select" style="width: auto; max-width: 100%; padding: 3px 6px; font-size: 12px" :value="l.anchor" @change="changeAnchor(l, $event.target.value)">
                <option v-for="a in anchors" :key="a.value" :value="a.value">{{ a.label }}</option>
              </select>
              <button class="ar-btn is-ghost is-small" @click="editNote(l)">✎ заметка</button>
              <span v-if="l.date" class="ar-dim" style="font-size: 12px">{{ l.date }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="ar-pane">
      <div class="ar-pane-head"><strong>Привязать</strong></div>
      <div class="ar-pane-body" style="padding: 10px; display: flex; flex-direction: column; gap: 8px">
        <div v-if="error" class="ar-error">{{ error }}</div>
        <div class="ar-field">
          <label class="ar-label">К чему</label>
          <select v-model="anchor" class="ar-select">
            <option v-for="a in anchors" :key="a.value" :value="a.value">{{ a.label }}</option>
          </select>
        </div>
        <input v-model="note" class="ar-input" placeholder="Заметка (необязательно)" />
        <input v-model="query" class="ar-input" placeholder="Найти карточку или задачу" />
        <div v-if="searching" class="ar-muted" style="font-size: 12px">ищу…</div>
        <div
          v-for="t in results"
          :key="t.kind + t.id"
          class="ar-item"
          :style="{ opacity: t.done ? 0.55 : 1 }"
          @click="!linkedKeys.has(`${t.kind}:${t.id}:${anchor}`) && attach(t)"
        >
          <span class="ar-item-icon">{{ t.kind === "card" ? "📅" : "📋" }}</span>
          <span class="ar-item-label">{{ t.emoji }} {{ t.title }}</span>
          <span class="ar-dim" style="font-size: 11px; white-space: nowrap">{{ t.hint }}</span>
          <span v-if="linkedKeys.has(`${t.kind}:${t.id}:${anchor}`)" class="ar-chip">✓</span>
        </div>
        <div v-if="!searching && !results.length" class="ar-muted" style="font-size: 13px">Ничего не нашлось.</div>
      </div>
    </div>
  </div>
</template>
