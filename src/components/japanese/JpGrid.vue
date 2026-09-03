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
// Раскраска: по уровню JLPT или по тому, что уже пройдено. Одновременно
// нельзя — цвет один, и два смысла в нём не помещаются.
const paint = ref("jlpt");

const FILTERS = [
  { code: "all", title: "Все" },
  { code: "n5", title: "N5" },
  { code: "n4", title: "N4" },
  { code: "n3", title: "N3" },
  { code: "n2", title: "N2" },
  { code: "n1", title: "N1" },
  { code: "study", title: "В работе" },
  { code: "learned", title: "Закреплено" },
  { code: "rest", title: "Не тронуто" },
];

// N5 зелёный, дальше к красному: чем выше уровень, тем дальше цель.
const LEVEL_COLORS = {
  5: "#63c94f",
  4: "#4aa8ff",
  3: "#a58bff",
  2: "#ffd666",
  1: "#e5484d",
};

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
  const f = filter.value;
  if (f === "study") return all.filter((k) => k.inStudy && !k.learned);
  if (f === "learned") return all.filter((k) => k.learned);
  if (f === "rest") return all.filter((k) => !k.inStudy);
  const level = /^n(\d)$/.exec(f);
  if (level) return all.filter((k) => k.jlpt === Number(level[1]));
  return all;
});

// Сколько знаков на каждом уровне и сколько из них закреплено — легенда без
// чисел не отвечает на вопрос «сколько мне ещё».
const byLevel = computed(() => {
  const out = [5, 4, 3, 2, 1].map((n) => ({ level: n, total: 0, learned: 0 }));
  for (const k of data.value?.kanji || []) {
    const row = out.find((r) => r.level === k.jlpt);
    if (!row) continue;
    row.total++;
    if (k.learned) row.learned++;
  }
  return out.filter((r) => r.total > 0);
});

// Знаки вне уровней JLPT в дзёё есть, и их немало: молчать о них нельзя.
const outsideCount = computed(
  () => (data.value?.kanji || []).filter((k) => !k.jlpt).length,
);

function cellStyle(k) {
  if (paint.value !== "jlpt") return {};
  const color = LEVEL_COLORS[k.jlpt];
  if (!color) return {};
  // Пройденное — заливкой, непройденное — только рамкой и буквой: иначе
  // сетка превращается в равномерный цветной ковёр, по которому не видно
  // прогресса.
  if (k.learned) return { background: color, borderColor: color, color: "#14151b" };
  if (k.inStudy) return { background: color + "44", borderColor: color, color: "#e8eaf2" };
  return { borderColor: color + "55", color: color + "cc" };
}

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

      <div class="jp-tabs" style="margin-bottom: 8px">
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

      <div class="jp-row" style="margin-bottom: 10px">
        <span class="jp-muted">Цвет:</span>
        <button
          class="jp-btn jp-btn-sm"
          :class="{ 'is-primary': paint === 'jlpt' }"
          @click="paint = 'jlpt'"
        >
          по уровню
        </button>
        <button
          class="jp-btn jp-btn-sm"
          :class="{ 'is-primary': paint === 'state' }"
          @click="paint = 'state'"
        >
          по прогрессу
        </button>
      </div>

      <div v-if="paint === 'jlpt'" class="jpg-legend">
        <span v-for="row in byLevel" :key="row.level" class="jpg-legend-item">
          <i :style="{ background: LEVEL_COLORS[row.level] }"></i>
          N{{ row.level }} — {{ row.learned }}/{{ row.total }}
        </span>
        <span v-if="outsideCount" class="jpg-legend-item">
          <i style="background: #3a3d47"></i>
          вне уровней — {{ outsideCount }}
        </span>
      </div>

      <div v-if="!cells.length" class="jp-empty">Здесь пока пусто</div>
      <div v-else class="jpg-grid">
        <button
          v-for="k in cells"
          :key="k.char"
          class="jpg-cell"
          :class="{
            'is-study': paint === 'state' && k.inStudy && !k.learned,
            'is-learned': paint === 'state' && k.learned,
          }"
          :style="cellStyle(k)"
          :title="k.jlpt ? `N${k.jlpt}` : 'вне уровней JLPT'"
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
.jpg-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-bottom: 10px;
  font-size: 11.5px;
  color: #7a7f8e;
}

.jpg-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.jpg-legend-item i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

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
