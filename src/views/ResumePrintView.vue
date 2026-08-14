<script setup>
import { ref, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import "@/styles/resume.css";

import { fetchResumeFull, resumeToday } from "@/components/resumeApi.js";
import ResumeSheet from "@/components/resume/ResumeSheet.vue";

// Страница под печать — docs/resume-module.md, решение 24.
// PDF печатает браузер: кириллица в Go-PDF библиотеках — боль, а браузерный
// PDF даёт выделяемый текст, который читает ATS.

const route = useRoute();
const router = useRouter();

const full = ref(null);
// Чистый режим по умолчанию: печатаем то, что уходит работодателю.
const mode = ref(route.query.mode === "working" ? "working" : "clean");
const error = ref("");

async function load() {
  try {
    full.value = await fetchResumeFull(route.params.id, resumeToday());
  } catch (e) {
    error.value = e.message;
  }
}

async function print() {
  await nextTick();
  window.print();
}

onMounted(async () => {
  await load();
  await print();
});
</script>

<template>
  <div class="rs" style="align-items: center">
    <div class="rs-row rs-print-hide" style="width: 100%">
      <button class="rs-btn" @click="router.push(`/resume/${route.params.id}`)">← В редактор</button>
      <button class="rs-btn" :class="{ 'is-active': mode === 'clean' }" @click="mode = 'clean'">
        Чистый
      </button>
      <button class="rs-btn" :class="{ 'is-active': mode === 'working' }" @click="mode = 'working'">
        Рабочий
      </button>
      <span class="rs-spacer" />
      <button class="rs-btn is-primary" @click="print">Печать</button>
    </div>
    <div v-if="error" class="rs-error rs-print-hide">{{ error }}</div>
    <ResumeSheet v-if="full" :full="full" :mode="mode" />
  </div>
</template>
