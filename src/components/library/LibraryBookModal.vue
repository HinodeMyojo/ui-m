<script setup>
import { ref, computed, watch, onMounted } from "vue";
import LibraryCover from "@/components/library/LibraryCover.vue";
import {
  updatePdfFile,
  linkPdfRoadmapItem,
  deletePdfFile,
  replacePdfFile,
  savePdfFile,
  formatPdfSize,
} from "@/api/pdfFiles.js";
import { fetchRoadmaps, fetchRoadmapFull } from "@/components/roadmapApi.js";
import { useSessionGoal } from "@/composables/useReadingGoal.js";
import {
  goalTimeLine,
  goalBookLine,
  goalPlanLine,
  goalPlanStatus,
} from "@/utils/readingGoal.js";

// Карточка книги: метаданные, полка, теги, привязка к пункту roadmap'а,
// цель на текущую сессию чтения.

const props = defineProps({
  file: { type: Object, required: true },
  categories: { type: Array, default: () => [] },
  // Вся библиотека — только ради темпа чтения: у новой книги своей истории нет,
  // а средняя по всем книгам всё же ближе к правде, чем оценка из воздуха.
  library: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "saved", "read"]);

const form = ref({
  title: props.file.title || "",
  author: props.file.author || "",
  categoryId: props.file.categoryId || null,
  tagsText: (props.file.tags || []).join(", "),
  note: props.file.note || "",
  language: props.file.language || "",
  favorite: props.file.favorite || false,
  archived: props.file.archived || false,
  pageCount: props.file.pageCount || 0,
});

const roadmapItemId = ref(props.file.roadmapItemId || "");
const roadmapItems = ref([]);
const roadmapFull = ref(null);
const busy = ref(false);
const error = ref("");
const replaceInput = ref(null);
const downloading = ref(false);
const downloadPct = ref(0);

// Скачать книгу себе. Файл лежит на сервере за токеном, поэтому это не ссылка,
// а честная загрузка блобом — с процентом, чтобы на телефоне было видно, что
// сорок мегабайт едут, а не всё зависло.
async function download() {
  downloading.value = true;
  downloadPct.value = 0;
  error.value = "";
  try {
    await savePdfFile(props.file, (part) => {
      downloadPct.value = Math.round(part * 100);
    });
  } catch (e) {
    error.value = e.message || "не удалось скачать книгу";
  } finally {
    downloading.value = false;
  }
}

const downloadLabel = computed(() => {
  if (!downloading.value) {
    const size = formatPdfSize(props.file.size);
    return size ? `⬇ Скачать · ${size}` : "⬇ Скачать";
  }
  return downloadPct.value ? `⬇ ${downloadPct.value}%` : "⬇ Скачиваю…";
});

// Файл на диске потерялся (например, контейнер пересоздали без тома под
// uploads) — карточку не выбрасываем, а даём подложить файл обратно.
async function onReplaceFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  busy.value = true;
  error.value = "";
  try {
    await replacePdfFile(props.file.id, file);
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось загрузить файл";
  } finally {
    busy.value = false;
  }
}

// Список пунктов для привязки: только книги и статьи активного плана —
// прикручивать PDF к сертификации смысла нет.
async function loadRoadmapItems() {
  try {
    const list = await fetchRoadmaps();
    const active = list.find((r) => r.isActive) || list[0];
    if (!active) return;
    const full = await fetchRoadmapFull(active.id);
    // План держим целиком: по нему считается, что цель на сессию сделает с
    // отставанием квартала.
    roadmapFull.value = full;
    const items = [];
    for (const quarter of full.quarters) {
      for (const item of quarter.items) {
        if (["book", "paper", "standard", "course"].includes(item.type)) {
          items.push({ id: item.id, label: `Q${quarter.number} · ${item.title}` });
        }
      }
    }
    for (const item of full.backlog) {
      if (["book", "paper", "standard", "course"].includes(item.type)) {
        items.push({ id: item.id, label: `Бэклог · ${item.title}` });
      }
    }
    roadmapItems.value = items;
  } catch {
    roadmapItems.value = [];
  }
}

const progressLabel = computed(() => {
  if (!props.file.pageCount) return "объём пока неизвестен";
  return `страница ${props.file.currentPage} из ${props.file.pageCount}`;
});

// --- Цель на текущую сессию чтения ---
//
// Необязательное намерение: сколько страниц хочу осилить прямо сейчас. На
// сервер не уезжает и умирает вместе со вкладкой — useReadingGoal.js.

const { goal, setPages, clear: clearGoal } = useSessionGoal(props.file.id);
const goalPages = ref(goal.value?.pages ? String(goal.value.pages) : "");

// Страница, с которой читалка продолжит: от неё и отсчитывается цель.
const startPage = computed(() => Math.max(1, props.file.currentPage || 1));

const goalNum = computed(() => {
  const parsed = parseInt(goalPages.value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
});

// Цель ставится сразу, без «Сохранить»: сохранять нечего, это намерение.
watch(goalNum, (pages) => {
  if (pages) setPages(pages, startPage.value);
  else clearGoal();
});

const pagesLeft = computed(() => Math.max(0, (props.file.pageCount || 0) - startPage.value));

const presets = computed(() => {
  const list = [10, 25, 50].filter((p) => !pagesLeft.value || p < pagesLeft.value);
  return pagesLeft.value ? [...list, pagesLeft.value] : list;
});

const timeLine = computed(() => goalTimeLine(props.file, props.library, goalNum.value));
const bookLine = computed(() => goalBookLine(props.file, goalNum.value, startPage.value));

// Как дела в плане до всякой цели: от этой цифры и выбирают, сколько читать.
const planStatus = computed(() => goalPlanStatus(roadmapFull.value, roadmapItemId.value));

const planLine = computed(() => {
  if (!goalNum.value) return null;
  const line = goalPlanLine({
    full: roadmapFull.value,
    itemId: roadmapItemId.value,
    pages: goalNum.value,
    fromPage: startPage.value,
    pageCount: props.file.pageCount,
  });
  if (line) return line;
  // План есть, а книга ни к чему не привязана — подсказываем, чего не хватает.
  return roadmapItems.value.length
    ? { text: "Привяжите книгу к пункту плана — и будет видно, как цель двигает график.", tone: "" }
    : null;
});

async function save() {
  busy.value = true;
  error.value = "";
  try {
    await updatePdfFile(props.file.id, {
      ...form.value,
      pageCount: Number(form.value.pageCount) || 0,
      tags: form.value.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    // Привязку меняем только если она реально изменилась: ручка снимает файл
    // с прошлого пункта, дёргать её впустую незачем.
    if ((roadmapItemId.value || "") !== (props.file.roadmapItemId || "")) {
      await linkPdfRoadmapItem(props.file.id, roadmapItemId.value || null);
    }
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!confirm(`Удалить «${props.file.title}» из библиотеки? Файл, закладки и выделения пропадут.`)) return;
  busy.value = true;
  try {
    await deletePdfFile(props.file.id);
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось удалить";
  } finally {
    busy.value = false;
  }
}

onMounted(loadRoadmapItems);
</script>

<template>
  <div class="lb-modal-back" @click.self="emit('close')">
    <div class="lb-modal">
      <div class="lb-modal-top">
        <LibraryCover :file="file" />

        <div>
          <div class="lb-form-grid">
            <div class="lb-full">
              <label class="lb-label">Название</label>
              <input v-model="form.title" class="lb-input" style="width: 100%" />
            </div>
            <div>
              <label class="lb-label">Автор</label>
              <input v-model="form.author" class="lb-input" />
            </div>
            <div>
              <label class="lb-label">Полка</label>
              <select v-model="form.categoryId" class="lb-select">
                <option :value="null">Без полки</option>
                <option v-for="c in categories" :key="c.id" :value="c.id">
                  {{ c.emoji }} {{ c.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="lb-label">Язык</label>
              <input v-model="form.language" class="lb-input" placeholder="ru / en" />
            </div>
            <div>
              <label class="lb-label">Страниц</label>
              <input v-model="form.pageCount" class="lb-input" type="number" />
            </div>
            <div class="lb-full">
              <label class="lb-label">Теги через запятую</label>
              <input v-model="form.tagsText" class="lb-input" style="width: 100%" />
            </div>
          </div>

          <div class="lb-row" style="margin-top: 10px">
            <label class="lb-sub" style="display: flex; align-items: center; gap: 6px">
              <input v-model="form.favorite" type="checkbox" /> ⭐ избранное
            </label>
            <label class="lb-sub" style="display: flex; align-items: center; gap: 6px">
              <input v-model="form.archived" type="checkbox" /> 📦 в архив
            </label>
          </div>
        </div>
      </div>

      <div v-if="error" class="lb-error">{{ error }}</div>

      <div class="lb-sub">
        {{ file.cloudBackup
          ? "☁️ Копия книги есть в облаке — файл переживёт переустановку сервера"
          : "⏳ Копия в облаке ещё не готова. Заливка идёт фоном и на большой книге занимает десятки минут" }}
      </div>

      <div v-if="file.fileMissing" class="lb-error">
        Файл книги пропал с диска. Прогресс, закладки и привязка к плану на месте —
        подложите файл обратно, и всё продолжит работать.
        <button class="lb-btn is-small" :disabled="busy" @click="replaceInput.click()">
          📎 Загрузить файл
        </button>
      </div>
      <input ref="replaceInput" type="file" accept=".pdf,application/pdf" hidden @change="onReplaceFile" />

      <div>
        <div class="lb-sub">
          {{ progressLabel }} · прочитано {{ Math.round((file.progress || 0) * 100) }}% ·
          {{ Math.round((file.hoursRead || 0) * 10) / 10 }} ч в читалке
        </div>
        <div class="lb-bar" style="margin-top: 6px">
          <div
            class="lb-bar-fill"
            :class="{ 'is-done': file.finishedAt }"
            :style="{ width: `${Math.round((file.progress || 0) * 100)}%` }"
          />
        </div>
      </div>

      <div>
        <label class="lb-label">Книга в плане обучения</label>
        <select v-model="roadmapItemId" class="lb-select" style="width: 100%">
          <option value="">Не привязана</option>
          <option v-for="i in roadmapItems" :key="i.id" :value="i.id">{{ i.label }}</option>
        </select>
        <p class="lb-sub" style="margin: 6px 0 0">
          Привязанная книга сама двигает прогресс пункта: страницы уходят в план, а время
          в читалке — в сессии чтения.
        </p>
      </div>

      <div class="lb-goal">
        <div class="lb-goal-head">
          <label class="lb-label" style="margin: 0">🎯 Цель на эту сессию</label>
          <button v-if="goalNum" class="lb-btn is-small" @click="goalPages = ''">Сбросить</button>
        </div>

        <div class="lb-row">
          <input
            v-model="goalPages"
            class="lb-input lb-goal-input"
            type="number"
            min="1"
            inputmode="numeric"
            placeholder="стр."
          />
          <button
            v-for="p in presets"
            :key="p"
            class="lb-btn is-small"
            :class="{ 'is-active': goalNum === p }"
            @click="goalPages = String(p)"
          >
            {{ p === pagesLeft ? `до конца · ${p}` : p }}
          </button>
        </div>

        <template v-if="goalNum">
          <div class="lb-sub">{{ timeLine }}</div>
          <div v-if="bookLine" class="lb-sub">{{ bookLine }}</div>
          <div v-if="planLine" class="lb-goal-plan" :class="`is-${planLine.tone || 'plain'}`">
            {{ planLine.text }}
          </div>
        </template>
        <template v-else>
          <div v-if="planStatus" class="lb-goal-plan">{{ planStatus }}</div>
          <p class="lb-sub" style="margin: 0">
            Необязательно. Сколько страниц хочется осилить прямо сейчас — посчитаю время и
            что это даст плану. Цель живёт до закрытия вкладки: это намерение, а не обещание.
          </p>
        </template>
      </div>

      <div>
        <label class="lb-label">Заметка</label>
        <textarea v-model="form.note" class="lb-textarea" />
      </div>

      <div class="lb-row">
        <button class="lb-btn is-primary" :disabled="busy" @click="save">Сохранить</button>
        <button v-if="!file.fileMissing" class="lb-btn" @click="emit('read')">📖 Читать</button>
        <button
          v-if="!file.fileMissing"
          class="lb-btn"
          :disabled="downloading"
          @click="download"
        >
          {{ downloadLabel }}
        </button>
        <button v-else class="lb-btn" :disabled="busy" @click="replaceInput.click()">
          📎 Загрузить файл заново
        </button>
        <button class="lb-btn" @click="emit('close')">Отмена</button>
        <div class="lb-spacer" />
        <button class="lb-btn is-danger" :disabled="busy" @click="remove">Удалить</button>
      </div>
    </div>
  </div>
</template>
