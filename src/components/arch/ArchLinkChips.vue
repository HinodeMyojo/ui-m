<script setup>
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import "@/styles/arch.css";
import {
  createArchLink,
  deleteArchLink,
  fetchArchProjects,
  fetchTargetProjects,
} from "@/components/archApi.js";

// Значок «Архитектура» в карточке «Сегодня» и в задаче главной: к каким
// проектам привязано дело, и кнопка привязать ещё к одному.
const props = defineProps({
  kind: { type: String, required: true }, // card | task
  targetId: { type: String, default: "" },
});

const router = useRouter();
const linked = ref([]);
const projects = ref([]);
const picking = ref(false);
const error = ref("");

async function load() {
  if (!props.targetId) return;
  try {
    linked.value = await fetchTargetProjects(props.kind, props.targetId);
  } catch {
    // Модуль выключен или сервер старый — значок просто не показываем.
    linked.value = [];
  }
}

onMounted(load);
watch(() => props.targetId, load);

async function startPick() {
  error.value = "";
  picking.value = !picking.value;
  if (picking.value && !projects.value.length) {
    try {
      projects.value = (await fetchArchProjects()).filter((p) => !p.archived);
    } catch (err) {
      error.value = err.message || String(err);
    }
  }
}

async function pick(project) {
  try {
    await createArchLink(project.id, { targetKind: props.kind, targetId: props.targetId });
    picking.value = false;
    await load();
  } catch (err) {
    error.value = err.message || String(err);
  }
}

async function unlink(item) {
  await deleteArchLink(item.linkId);
  await load();
}

function open(item) {
  router.push({ name: "Arch", params: { slug: item.slug, tab: "tasks" } });
}
</script>

<template>
  <div v-if="targetId" class="ar-links-strip">
    <span v-for="item in linked" :key="item.linkId" class="ar-links-chip" :title="item.anchor || 'Проект целиком'" @click="open(item)">
      🏗️ {{ item.emoji }} {{ item.title }}<template v-if="item.anchor"> · {{ item.anchor.replace(/^(view|file):/, "") }}</template>
      <button class="ar-links-x" title="Отвязать" @click.stop="unlink(item)">✕</button>
    </span>
    <span class="ar-links-chip" style="opacity: 0.8" @click="startPick">＋ архитектура</span>
    <span v-if="error" style="color: #fca5a5; font-size: 12px">{{ error }}</span>
    <div v-if="picking" class="ar-links-strip" style="width: 100%">
      <span v-if="!projects.length" style="font-size: 12px; opacity: 0.7">Проектов нет — заведите в разделе «Архитектура».</span>
      <span
        v-for="p in projects.filter((x) => !linked.some((l) => l.projectId === x.id && !l.anchor))"
        :key="p.id"
        class="ar-links-chip"
        @click="pick(p)"
      >
        {{ p.emoji }} {{ p.title }}
      </span>
    </div>
  </div>
</template>
