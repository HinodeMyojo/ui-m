<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import "@/styles/library.css";
import {
  getPdfFiles,
  getPdfCategories,
  createPdfCategory,
  updatePdfCategory,
  deletePdfCategory,
  uploadPdfFile,
  updatePdfFile,
  PDF_STATUSES,
  PDF_SORTS,
  formatPdfSize,
} from "@/api/pdfFiles.js";
import LibraryCover from "@/components/library/LibraryCover.vue";
import LibraryBookModal from "@/components/library/LibraryBookModal.vue";

// Библиотека PDF — docs/pdf-library.md (back-m).

const router = useRouter();

const files = ref([]);
const categories = ref([]);
const loading = ref(false);
const error = ref("");
const uploading = ref(false);
const dragging = ref(false);
const dragFileId = ref("");
const dropCategoryId = ref("");
const selected = ref(null);
const fileInput = ref(null);

const filter = ref({
  categoryId: localStorage.getItem("libraryCategory") || "",
  query: "",
  status: "",
  favorite: false,
  archived: false,
  sort: localStorage.getItem("librarySort") || "recent",
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [list, cats] = await Promise.all([
      getPdfFiles({
        ...filter.value,
        categoryId: filter.value.categoryId === "none" ? "" : filter.value.categoryId,
      }),
      getPdfCategories(),
    ]);
    // «Без полки» сервер отдельным фильтром не умеет — отсекаем здесь.
    files.value = filter.value.categoryId === "none" ? list.filter((f) => !f.categoryId) : list;
    categories.value = cats;
  } catch (e) {
    error.value = e.message || "не удалось загрузить библиотеку";
  } finally {
    loading.value = false;
  }
}

let searchTimer = null;
watch(
  () => filter.value.query,
  () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  },
);

watch(
  () => [filter.value.categoryId, filter.value.status, filter.value.favorite, filter.value.archived, filter.value.sort],
  () => {
    localStorage.setItem("libraryCategory", filter.value.categoryId || "");
    localStorage.setItem("librarySort", filter.value.sort);
    load();
  },
);

const continueReading = computed(() =>
  files.value
    .filter((f) => !f.finishedAt && (f.currentPage > 1 || f.hoursRead > 0))
    .slice(0, 8),
);

const totals = computed(() => {
  const reading = files.value.filter((f) => !f.finishedAt && f.currentPage > 1).length;
  const finished = files.value.filter((f) => f.finishedAt).length;
  const hours = files.value.reduce((sum, f) => sum + (f.hoursRead || 0), 0);
  return { reading, finished, hours: Math.round(hours * 10) / 10 };
});

function openBook(file) {
  selected.value = file;
}

function readBook(file) {
  router.push({ path: "/pdfReader", query: { file: file.id } });
}

// --- Загрузка файлов ---

async function handleFiles(list) {
  const pdfs = Array.from(list || []).filter((f) => f.type === "application/pdf");
  if (!pdfs.length) return;
  uploading.value = true;
  error.value = "";
  try {
    for (const file of pdfs) {
      const categoryId = filter.value.categoryId && filter.value.categoryId !== "none"
        ? filter.value.categoryId
        : null;
      await uploadPdfFile(file, categoryId);
    }
    await load();
  } catch (e) {
    error.value = e.message || "не удалось загрузить файл";
  } finally {
    uploading.value = false;
  }
}

function onDrop(e) {
  dragging.value = false;
  handleFiles(e.dataTransfer?.files);
}

function onFileChange(e) {
  handleFiles(e.target.files);
  e.target.value = "";
}

// --- Перетаскивание книги на полку ---

function onBookDragStart(file) {
  dragFileId.value = file.id;
}

async function onShelfDrop(categoryId) {
  const id = dragFileId.value;
  dragFileId.value = "";
  dropCategoryId.value = "";
  if (!id) return;
  const file = files.value.find((f) => f.id === id);
  if (!file) return;
  const target = categoryId === "none" || categoryId === "" ? null : categoryId;
  if ((file.categoryId || null) === target) return;
  try {
    await updatePdfFile(id, { ...file, categoryId: target });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось переложить книгу";
  }
}

// --- Полки ---

async function addCategory() {
  const name = prompt("Название полки");
  if (!name?.trim()) return;
  const emoji = prompt("Эмодзи полки (можно пропустить)") || "";
  await createPdfCategory({ name: name.trim(), emoji, sortOrder: categories.value.length });
  await load();
}

async function renameCategory(category) {
  const name = prompt("Название полки", category.name);
  if (!name?.trim()) return;
  await updatePdfCategory(category.id, { ...category, name: name.trim() });
  await load();
}

async function removeCategory(category) {
  if (!confirm(`Удалить полку «${category.name}»? Книги останутся, просто без полки.`)) return;
  await deletePdfCategory(category.id);
  if (filter.value.categoryId === category.id) filter.value.categoryId = "";
  await load();
}

async function onSaved() {
  selected.value = null;
  await load();
}

function statusBadge(file) {
  if (file.fileMissing) return { text: "нет файла", cls: "is-missing" };
  if (file.finishedAt) return { text: "✓", cls: "is-done" };
  if (file.currentPage > 1) return { text: `${Math.round((file.progress || 0) * 100)}%`, cls: "" };
  return null;
}

onMounted(load);
</script>

<template>
  <div
    class="lb"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="lb-header">
      <div>
        <h1>📚 Библиотека</h1>
        <div class="lb-sub">
          {{ files.length }} книг · читаю {{ totals.reading }} · прочитано {{ totals.finished }} ·
          {{ totals.hours }} ч в читалке
        </div>
      </div>

      <div class="lb-row">
        <input
          v-model="filter.query"
          class="lb-input lb-search"
          placeholder="Название, автор, тег…"
        />
        <select v-model="filter.status" class="lb-select">
          <option v-for="s in PDF_STATUSES" :key="s.code" :value="s.code">{{ s.label }}</option>
        </select>
        <select v-model="filter.sort" class="lb-select">
          <option v-for="s in PDF_SORTS" :key="s.code" :value="s.code">{{ s.label }}</option>
        </select>
        <button
          class="lb-btn"
          :class="{ 'is-active': filter.favorite }"
          @click="filter.favorite = !filter.favorite"
        >
          ⭐
        </button>
        <button
          class="lb-btn"
          :class="{ 'is-active': filter.archived }"
          title="Архив"
          @click="filter.archived = !filter.archived"
        >
          📦
        </button>
        <button class="lb-btn is-primary" :disabled="uploading" @click="fileInput.click()">
          {{ uploading ? "Загружаю…" : "＋ Добавить PDF" }}
        </button>
        <button class="lb-btn" @click="router.push('/pdfReader')">📖 Читалка</button>
        <button class="lb-btn" @click="router.push('/')">← Назад</button>
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          hidden
          @change="onFileChange"
        />
      </div>
    </div>

    <div v-if="error" class="lb-error">{{ error }}</div>
    <div v-if="dragging" class="lb-dropzone is-dragging">Отпустите файлы — заберу в библиотеку</div>

    <div v-if="continueReading.length && !filter.query" >
      <div class="lb-sub" style="margin-bottom: 6px">Продолжить чтение</div>
      <div class="lb-continue">
        <div v-for="f in continueReading" :key="f.id" class="lb-book" @click="readBook(f)">
          <LibraryCover :file="f">
            <span class="lb-badge is-right">{{ Math.round((f.progress || 0) * 100) }}%</span>
          </LibraryCover>
          <div class="lb-book-body">
            <div class="lb-book-title">{{ f.title }}</div>
            <div class="lb-bar">
              <div class="lb-bar-fill" :style="{ width: `${Math.round((f.progress || 0) * 100)}%` }" />
            </div>
            <div class="lb-book-meta">стр. {{ f.currentPage }}<template v-if="f.pageCount"> из {{ f.pageCount }}</template></div>
          </div>
        </div>
      </div>
    </div>

    <div class="lb-body">
      <aside class="lb-shelf">
        <button
          class="lb-shelf-item"
          :class="{ 'is-active': !filter.categoryId }"
          @click="filter.categoryId = ''"
          @dragover.prevent
          @drop.prevent="onShelfDrop('')"
        >
          <span>📚</span>
          <span style="flex: 1">Все книги</span>
        </button>

        <div class="lb-shelf-sep" />

        <button
          v-for="c in categories"
          :key="c.id"
          class="lb-shelf-item"
          :class="{ 'is-active': filter.categoryId === c.id, 'is-drop': dropCategoryId === c.id }"
          @click="filter.categoryId = c.id"
          @dblclick="renameCategory(c)"
          @dragover.prevent="dropCategoryId = c.id"
          @dragleave="dropCategoryId = ''"
          @drop.prevent="onShelfDrop(c.id)"
        >
          <span>{{ c.emoji || "📁" }}</span>
          <span style="flex: 1">{{ c.name }}</span>
          <span class="lb-shelf-count">{{ c.count }}</span>
          <span class="lb-shelf-count" title="Удалить полку" @click.stop="removeCategory(c)">✕</span>
        </button>

        <button
          class="lb-shelf-item"
          :class="{ 'is-active': filter.categoryId === 'none' }"
          @click="filter.categoryId = 'none'"
          @dragover.prevent="dropCategoryId = 'none'"
          @drop.prevent="onShelfDrop('none')"
        >
          <span>📄</span>
          <span style="flex: 1">Без полки</span>
        </button>

        <div class="lb-shelf-sep" />
        <button class="lb-shelf-item" @click="addCategory">＋ Новая полка</button>
        <p class="lb-sub" style="margin: 6px 4px 0; font-size: 11px">
          Книгу можно перетащить на полку. Двойной клик по полке — переименовать.
        </p>
      </aside>

      <div>
        <div v-if="loading" class="lb-empty">Загружаю…</div>
        <div v-else-if="!files.length" class="lb-empty">
          Здесь пусто. Перетащите PDF в окно или нажмите «Добавить PDF».
        </div>

        <div v-else class="lb-grid">
          <div
            v-for="f in files"
            :key="f.id"
            class="lb-book"
            :class="{ 'is-dragging': dragFileId === f.id }"
            draggable="true"
            @dragstart="onBookDragStart(f)"
            @dragend="dragFileId = ''"
            @click="openBook(f)"
            @dblclick="f.fileMissing ? openBook(f) : readBook(f)"
          >
            <LibraryCover :file="f">
              <span v-if="f.favorite" class="lb-badge is-left">⭐</span>
              <span
                v-if="statusBadge(f)"
                class="lb-badge is-right"
                :class="statusBadge(f).cls"
              >
                {{ statusBadge(f).text }}
              </span>
              <span v-else-if="f.roadmapItemId" class="lb-badge is-right is-linked">🗺️</span>
            </LibraryCover>

            <div class="lb-book-body">
              <div class="lb-book-title">{{ f.title }}</div>
              <div class="lb-book-meta">
                {{ f.author || formatPdfSize(f.size) }}
              </div>
              <div class="lb-bar">
                <div
                  class="lb-bar-fill"
                  :class="{ 'is-done': f.finishedAt }"
                  :style="{ width: `${Math.round((f.progress || 0) * 100)}%` }"
                />
              </div>
              <div v-if="f.tags?.length" class="lb-tags">
                <span v-for="t in f.tags.slice(0, 3)" :key="t" class="lb-tag">{{ t }}</span>
              </div>
              <div v-if="f.roadmapItemTitle" class="lb-book-meta" :title="f.roadmapItemTitle">
                🗺️ {{ f.roadmapItemTitle }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <LibraryBookModal
      v-if="selected"
      :file="selected"
      :categories="categories"
      @close="selected = null"
      @saved="onSaved"
      @read="readBook(selected)"
    />
  </div>
</template>
