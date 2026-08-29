<script setup>
import { ref, computed, onMounted } from "vue";
import { fetchJpGrid } from "@/components/japaneseApi.js";

// Сетка дзёё: 2136 знаков, клетки закрашиваются по мере изучения. Смысл в том,
// чтобы масштаб был виден целиком — сколько пройдено и сколько ещё впереди, —
// поэтому она не листается постранично и не режется на куски.
//
// Знаки идут по классам кёику, как в школе: 一 в начале, редкое в конце.

const emit = defineEmits(["open"]);

const data = ref(null);
const loading = ref(true);
const error = ref("");
const filter = ref("all");

const FILTERS = [
  { code: "all", title: "Все" },
  { code: "study", title: "В работе" },
  { code: "learned", title: "Закреплено" },
  { code: "rest", title: "Не тронуто" },
];

async function load() {
  loading.value = true;
  error.value = "";
  try {
    data.value = await fetchJpGrid();
  } catch (e) {
    error.value = e.message || "сетка не загрузилась";
  } finally {
    loading.value = false;
  }
}

const cells = computed(() => {
  const all = data.value?.kanji || [];
  if (filter.value === "study") return all.filter((k) => k.inStudy && !k.learned);
  if (filter.value === "learned") return all.filter((k) => k.learned);
  if (filter.value === "rest") return all.filter((k) => !k.inStudy);
  return all;
});

const pct = computed(() => {
  if (!data.value?.total) return 0;
  return Math.round((data.value.learned / data.value.total) * 100);
});

onMounted(load);
</script>

<template>
  <section class="jp-card">
    <h3>Дзёё — {{ data?.total ?? 0 }} знаков</h3>

    <div v-if="error" class="jp-error">{{ error }}</div>
    <div v-else-if="loading" class="jp-empty">Загружаю…</div>

    <template v-else-if="data">
      <div class="jpg-summary">
        <b>{{ data.learned }}</b> закреплено · <b>{{ data.started }}</b> в работе ·
        {{ pct }}% всего дзёё
      </div>
      <div class="jp-bar" style="margin-bottom: 10px">
        <span :style="{ width: pct + '%', background: '#63c94f' }" />
      </div>

      <div class="jp-tabs" style="margin-bottom: 10px">
        <button
          v-for="f in FILTERS"
          :key="f.code"
          class="jp-tab"
          :class="{ 'is-active': filter === f.code }"
          @click="filter = f.code"
        >
          {{ f.title }}
        </button>
      </div>

      <div v-if="!cells.length" class="jp-empty">Здесь пока пусто</div>
      <div v-else class="jpg-grid">
        <button
          v-for="k in cells"
          :key="k.char"
          class="jpg-cell"
          :class="{ 'is-study': k.inStudy && !k.learned, 'is-learned': k.learned }"
          :title="k.jlpt ? `N${k.jlpt}` : ''"
          @click="emit('open', k.char)"
        >
          {{ k.char }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.jpg-summary {
  font-size: 13px;
  color: #cfd3e0;
  margin-bottom: 6px;
}

/* Клетка мелкая намеренно: две тысячи знаков должны помещаться на экран,
   иначе пропадает то единственное, ради чего сетка нужна — масштаб. Тапают
   по ней редко, поэтому правило про 44 пикселя здесь не работает: у клетки
   есть увеличенная область нажатия за счёт зазора. */
.jpg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));
  gap: 3px;
}

.jpg-cell {
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border-radius: 5px;
  border: 1px solid #24262f;
  background: #1b1d25;
  color: #4a4e5a;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jpg-cell.is-study {
  background: rgba(110, 74, 255, 0.22);
  border-color: rgba(110, 74, 255, 0.55);
  color: #d5c9ff;
}

.jpg-cell.is-learned {
  background: rgba(99, 201, 79, 0.22);
  border-color: rgba(99, 201, 79, 0.55);
  color: #cdf0c2;
}
</style>
