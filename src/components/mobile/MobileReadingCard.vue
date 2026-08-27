<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getPdfFiles } from "@/api/pdfFiles.js";
import LibraryCover from "@/components/library/LibraryCover.vue";

// «Продолжить чтение» на мобильной главной: одна кнопка, чтобы вернуться туда,
// где остановился. Позиция и так живёт на сервере (docs/pdf-library.md), так
// что открытая книга откроется на нужной странице сама.
//
// Показываем максимум три книги: это ленточная карточка, а не библиотека, и
// полка целиком есть по тапу на заголовок.

const router = useRouter();

const files = ref([]);
const loading = ref(true);
const failed = ref(false);

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    files.value = await getPdfFiles({ sort: "recent" });
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

// Тот же отбор, что на полке: начатая и не дочитанная книга.
const reading = computed(() =>
  (files.value || [])
    .filter((f) => !f.finishedAt && (f.currentPage > 1 || f.hoursRead > 0))
    .slice(0, 3),
);

function percentOf(f) {
  if (!f.pageCount) return 0;
  // Прогресс считаем по maxPage — докуда дочитали. Возврат к оглавлению не
  // должен съедать половину книги.
  return Math.min(100, Math.round(((f.maxPage || f.currentPage) / f.pageCount) * 100));
}

function read(f) {
  router.push({ path: "/pdfReader", query: { file: f.id } });
}

onMounted(load);
</script>

<template>
  <section v-if="loading || failed || reading.length" class="m-card">
    <button class="m-card-head" @click="router.push('/library')">
      <span class="m-card-title">📚 Читаю</span>
      <span class="m-chev">›</span>
    </button>

    <div v-if="loading" class="m-skeleton" style="height: 56px"></div>

    <div v-else-if="failed" class="m-err">
      Библиотека не загрузилась <button class="m-btn m-btn-sm" @click="load">↻</button>
    </div>

    <template v-else>
      <button v-for="f in reading" :key="f.id" class="mrd-book" @click="read(f)">
        <LibraryCover :file="f" class="mrd-cover" />
        <span class="mrd-body">
          <span class="mrd-title">{{ f.title || f.filename }}</span>
          <span class="mrd-meta">
            стр. {{ f.currentPage }}<template v-if="f.pageCount"> из {{ f.pageCount }}</template>
          </span>
          <span class="m-bar">
            <span class="m-bar-fill" :style="{ width: percentOf(f) + '%' }"></span>
          </span>
        </span>
      </button>
    </template>
  </section>
</template>

<style scoped>
.mrd-book {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 60px;
  padding: 6px 0;
  background: none;
  border: none;
  border-top: 1px solid #232631;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mrd-book:first-of-type {
  border-top: none;
}

.mrd-cover {
  width: 38px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 5px;
  overflow: hidden;
}

.mrd-cover :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mrd-cover :deep(.lb-cover-fallback) {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: #22242d;
  font-size: 7px;
  line-height: 1.1;
  color: #7a7f8e;
  text-align: center;
  padding: 3px;
  overflow: hidden;
}

.mrd-cover :deep(.lb-cover-fallback span) {
  font-size: 15px;
}

.mrd-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mrd-title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mrd-meta {
  font-size: 11.5px;
  color: #7a7f8e;
}
</style>
