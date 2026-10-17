<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import "@/styles/arch.css";
import {
  fetchArchProjects,
  fetchArchTemplates,
  STAGE_COLORS,
  stageTitle,
} from "@/components/archApi.js";
import ArchCreateModal from "@/components/arch/ArchCreateModal.vue";
import ArchProject from "@/components/arch/ArchProject.vue";

// Раздел «Архитектура»: описание устройства сервисов. Проект — набор файлов
// в общепринятых нотациях (C4 в LikeC4, arc42, MADR, Mermaid), сервер
// хранит их с историей, браузер разбирает и рисует. entities/arch.go (back-m).

const route = useRoute();
const router = useRouter();

const projects = ref([]);
const templates = ref(null);
const loadError = ref("");
const busy = ref(false);
const createOpen = ref(false);
const showArchived = ref(false);

const slug = computed(() => String(route.params.slug || ""));
const tab = computed(() => String(route.params.tab || ""));
const current = computed(() => projects.value.find((p) => p.slug === slug.value) || null);
const visible = computed(() => projects.value.filter((p) => showArchived.value || !p.archived));
const archivedCount = computed(() => projects.value.filter((p) => p.archived).length);

async function reload() {
  busy.value = true;
  loadError.value = "";
  try {
    const [list, tpl] = await Promise.all([
      fetchArchProjects(),
      templates.value ? Promise.resolve(templates.value) : fetchArchTemplates(),
    ]);
    projects.value = list;
    templates.value = tpl;
  } catch (err) {
    loadError.value = err.message || String(err);
  } finally {
    busy.value = false;
  }
}

onMounted(reload);
// Вернулись к списку — освежаем: в проекте могли смениться стадия и дела.
watch(slug, (s) => {
  if (!s) reload();
});

function open(project) {
  router.push({ name: "Arch", params: { slug: project.slug } });
}

function openTab(next) {
  router.replace({ name: "Arch", params: { slug: slug.value, tab: next } });
}

async function created({ slug: newSlug }) {
  createOpen.value = false;
  await reload();
  router.push({ name: "Arch", params: { slug: newSlug } });
}

// Проект переименовали (поменялся slug) — адрес должен поменяться следом.
async function renamed(newSlug) {
  await reload();
  router.replace({ name: "Arch", params: { slug: newSlug, tab: tab.value } });
}

async function removed() {
  await reload();
  router.push({ name: "Arch" });
}

const CHECK = {
  ok: { color: "#22c55e", title: "модель без ошибок" },
  errors: { color: "#ef4444", title: "в модели ошибки" },
  unchecked: { color: "#64748b", title: "модель не проверена" },
};

function ago(iso) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн. назад`;
  return d.toLocaleDateString("ru-RU");
}
</script>

<template>
  <ArchProject
    v-if="slug && current"
    :key="current.id"
    :project-id="current.id"
    :tab="tab"
    :templates="templates"
    @tab="openTab"
    @renamed="renamed"
    @removed="removed"
  />

  <div v-else class="ar">
    <div class="ar-row">
      <div>
        <button class="ar-back" @click="$router.push('/')">← На главную</button>
        <h1 class="ar-title">Архитектура</h1>
        <div class="ar-muted">C4-модели сервисов, сценарии, механизмы и стадии</div>
      </div>
      <div class="ar-spacer" />
      <label v-if="archivedCount" class="ar-row ar-muted" style="font-size: 13px; gap: 6px">
        <input v-model="showArchived" type="checkbox" /> архив ({{ archivedCount }})
      </label>
      <button class="ar-btn is-primary" @click="createOpen = true">＋ Новый проект</button>
    </div>

    <div v-if="loadError" class="ar-error">{{ loadError }}</div>
    <div v-if="slug && !current && !busy" class="ar-note">
      Проекта «{{ slug }}» нет — возможно, его переименовали.
    </div>

    <div v-if="!projects.length && !busy" class="ar-card ar-empty">
      Проектов пока нет. Заведите первый — например TaxService по шаблону «Микросервис»:
      сразу появятся C4-модель, разделы arc42, механизмы и сценарий, которые останется наполнить.
      Или попросите Claude: «заведи архитектуру TaxService и опиши, как формируется платёж».
    </div>

    <div class="ar-grid">
      <div
        v-for="p in visible"
        :key="p.id"
        class="ar-pcard"
        :class="{ 'is-archived': p.archived }"
        :style="{ '--ar-stripe': p.color || STAGE_COLORS[p.stage] }"
        @click="open(p)"
      >
        <div class="ar-pcard-head">
          <div class="ar-pcard-emoji">{{ p.emoji || "🧩" }}</div>
          <div style="flex: 1; min-width: 0">
            <div class="ar-pcard-title">{{ p.title }}</div>
            <div class="ar-pcard-slug">{{ p.slug }}</div>
          </div>
          <span class="ar-chip">
            <span class="ar-dot" :style="{ background: STAGE_COLORS[p.stage] }" />
            {{ stageTitle(p.stage) }}
          </span>
        </div>
        <div v-if="p.summary" class="ar-pcard-summary">{{ p.summary }}</div>
        <div v-if="p.stageNote" class="ar-muted" style="font-size: 12px">↳ {{ p.stageNote }}</div>
        <div class="ar-row ar-muted" style="font-size: 12px; gap: 12px; margin-top: auto">
          <span :title="CHECK[p.checkStatus]?.title">
            <span class="ar-dot" :style="{ background: CHECK[p.checkStatus]?.color }" />
            {{ p.fileCount }} файлов
          </span>
          <span v-if="p.linkCount">📌 {{ p.openLinks }}/{{ p.linkCount }} дел</span>
          <span class="ar-spacer" />
          <span>{{ ago(p.updatedAt) }}</span>
        </div>
      </div>
    </div>

    <ArchCreateModal
      v-if="createOpen && templates"
      :templates="templates.projects"
      @close="createOpen = false"
      @created="created"
    />
  </div>
</template>
