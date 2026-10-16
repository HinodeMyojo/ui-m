<script setup>
import { ref, watch } from "vue";
import { renderMermaid } from "./mermaid.js";

// Схема Mermaid: статусная машина, ER, любая другая.
const props = defineProps({
  code: { type: String, default: "" },
});

const svg = ref("");
const error = ref("");
let seq = 0;

watch(
  () => props.code,
  async (code) => {
    const mine = ++seq;
    if (!code.trim()) {
      svg.value = "";
      error.value = "";
      return;
    }
    try {
      const out = await renderMermaid(code);
      if (mine !== seq) return;
      svg.value = out;
      error.value = "";
    } catch (err) {
      if (mine !== seq) return;
      // Старую картинку не убираем: пока правишь, схема не должна мигать.
      error.value = String(err?.message || err).split("\n").slice(0, 3).join(" ");
    }
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <div v-if="error" class="ar-error" style="margin-bottom: 8px">Mermaid: {{ error }}</div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-if="svg" class="ar-mermaid" v-html="svg" />
  </div>
</template>
