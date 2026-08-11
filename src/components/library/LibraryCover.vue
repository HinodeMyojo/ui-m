<script setup>
import { ref, watch, onBeforeUnmount } from "vue";
import { fetchPdfCoverObjectUrl } from "@/api/pdfFiles.js";

// Обложка книги. Ручка защищена токеном, поэтому <img src> напрямую не работает:
// тянем блобом и показываем object-URL, который освобождаем при размонтировании.

const props = defineProps({
  file: { type: Object, required: true },
});

const url = ref("");

async function load() {
  release();
  if (!props.file?.hasCover) return;
  url.value = await fetchPdfCoverObjectUrl(props.file.id);
}

function release() {
  if (url.value) {
    URL.revokeObjectURL(url.value);
    url.value = "";
  }
}

watch(() => [props.file?.id, props.file?.hasCover], load, { immediate: true });
onBeforeUnmount(release);
</script>

<template>
  <div class="lb-cover">
    <img v-if="url" :src="url" :alt="file.title" loading="lazy" />
    <div v-else class="lb-cover-fallback">
      <span>📕</span>
      {{ file.title || file.filename }}
    </div>
    <slot />
  </div>
</template>
