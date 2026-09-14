<script setup>
// Каталог упражнений с анимациями.
//
// Источник — hasaneyldrm/exercises-dataset: 1324 упражнения, настоящие
// GIF-анимации 180×180 и описания на десяти языках, включая русский.
//
// Почему именно он. Гифки фитнес-баз по всему интернету — это одна и та же
// съёмка Gym visual, которую ExerciseDB когда-то раздавал бесплатно. Тот CDN
// умер (домен не резолвится), база уехала в платную AscendAPI, а живые копии
// лежат на личных репозиториях без всякой лицензии. Здесь же медиа
// перевыложено с письменного разрешения правообладателя: 180×180 и
// обязательная подпись «© Gym visual». Данные — MIT.
//
// Отсюда два правила, которые нельзя нарушать:
//   1. не показывать картинки крупнее 180 пикселей;
//   2. держать подпись рядом с картинками (см. ATTRIBUTION ниже).
//
// Раздаёт файлы jsDelivr — у нас 0.2 ядра, хранить и отдавать 128 МБ гифок
// нечем. Индекс весит 17 МБ, но приезжает пожатым примерно в 1.5 МБ и потом
// живёт в памяти вкладки: каталог открывают помногу раз за сессию.

import { ref, computed, onMounted } from "vue";
import SportDemo from "./SportDemo.vue";

const BASE = "https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/";
const CATALOG_URL = `${BASE}data/exercises.json`;
const SOURCE_CODE = "gymvisual";
const ATTRIBUTION = "© Gym visual — gymvisual.com";

const props = defineProps({
  // Название своего упражнения — показываем, чтобы было видно, к чему привязываем.
  hint: { type: String, default: "" },
});
const emit = defineEmits(["close", "pick"]);

// Индекс держим в модуле, а не в компоненте: перекачивать полтора мегабайта
// на каждое открытие окна незачем.
let cache = null;

const items = ref([]);
const loading = ref(false);
const error = ref("");
const query = ref("");
const limit = ref(24);
const withNote = ref(true);

const BODY_RU = {
  back: "спина", cardio: "кардио", chest: "грудь", neck: "шея",
  shoulders: "плечи", waist: "корпус, пресс",
  "lower arms": "предплечья", "lower legs": "голень",
  "upper arms": "руки", "upper legs": "ноги",
};

async function load() {
  loading.value = true;
  error.value = "";
  try {
    if (!cache) {
      const res = await fetch(CATALOG_URL);
      if (!res.ok) throw new Error(`каталог не ответил (${res.status})`);
      const raw = await res.json();
      // Сразу ужимаем до нужного: девять лишних языков держать в памяти незачем,
      // а строку для поиска дешевле собрать один раз, чем на каждый ввод буквы.
      cache = raw.map((e) => {
        const ru = e.instructions?.ru || "";
        return {
          id: e.id,
          name: e.name,
          gif: BASE + e.gif_url,
          image: BASE + e.image,
          body: e.body_part,
          target: e.target,
          equipment: e.equipment,
          ru,
          steps: e.instruction_steps?.ru || [],
          hay: `${e.name} ${e.target} ${e.equipment} ${e.body_part} ${ru}`.toLowerCase(),
        };
      });
    }
    items.value = cache;
  } catch (e) {
    error.value = e.message || "каталог не загрузился";
  } finally {
    loading.value = false;
  }
}

// Искать можно и по-русски: в стог кладём русское описание, поэтому
// «скручивания» находят crunch, хотя названия в базе английские.
const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return items.value.slice(0, limit.value);
  const words = q.split(/\s+/);
  return items.value.filter((e) => words.every((w) => e.hay.includes(w))).slice(0, limit.value);
});

function pick(e) {
  emit("pick", {
    demoUrls: [e.gif],
    demoSource: SOURCE_CODE,
    catalogName: e.name,
    // Русское описание — то, ради чего на эту базу и стоило переходить:
    // «как делать» появляется в карточке без перевода руками.
    note: withNote.value ? (e.steps.length ? e.steps.join("\n") : e.ru) : "",
  });
}

onMounted(load);
</script>

<template>
  <div class="sp-modal-backdrop" @click.self="emit('close')">
    <div class="sp-modal is-wide">
      <div class="sp-modal-head">
        <h3>Каталог упражнений</h3>
        <div class="sp-spacer"></div>
        <button class="sp-btn sp-btn-sm" @click="emit('close')">✕</button>
      </div>

      <div class="sp-modal-body">
        <p class="spc-note">
          1324 упражнения с анимацией. Названия английские, но
          <b>искать можно по-русски</b> — поиск смотрит и в русское описание:
          попробуйте «скручивания», «приседания», «гантел».
          <template v-if="hint">
            <br />Привязываем к упражнению «{{ hint }}».
          </template>
        </p>

        <div class="sp-row">
          <input
            v-model="query"
            class="sp-input"
            style="flex: 1"
            placeholder="скручивания, жим, приседания, crunch…"
            autofocus
          />
          <label class="sp-check" title="Заполнить заметку упражнения описанием на русском">
            <input v-model="withNote" type="checkbox" /> с описанием
          </label>
        </div>

        <div v-if="error" class="sp-error">{{ error }}</div>
        <div v-if="loading" class="sp-empty">Загружаю каталог (около 1.5 МБ, один раз за сессию)…</div>
        <div v-else-if="!results.length" class="sp-empty">
          Ничего не нашлось. Попробуйте другое слово или английское название движения.
        </div>

        <div v-else class="spc-grid">
          <button v-for="e in results" :key="e.id" class="spc-item" @click="pick(e)">
            <SportDemo :urls="[e.gif]" size="100%" />
            <span class="spc-name">{{ e.name }}</span>
            <span class="spc-meta">{{ BODY_RU[e.body] || e.body }} · {{ e.target }}</span>
            <span v-if="e.equipment" class="spc-meta dim">{{ e.equipment }}</span>
          </button>
        </div>

        <div v-if="!loading && results.length >= limit" class="sp-row">
          <div class="sp-spacer"></div>
          <button class="sp-btn sp-btn-sm" @click="limit += 24">Показать ещё</button>
          <div class="sp-spacer"></div>
        </div>
      </div>

      <div class="sp-modal-foot">
        <!-- Подпись обязательна по условиям, на которых медиа перевыложено. -->
        <span class="sp-muted">
          {{ ATTRIBUTION }} · картинки грузятся с jsDelivr, у нас не хранятся
        </span>
        <div class="sp-spacer"></div>
        <button class="sp-btn" @click="emit('close')">Закрыть</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spc-note {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: #8b90a0;
}

.spc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
}

.spc-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid #262a35;
  border-radius: 10px;
  background: #1b1d24;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
}

.spc-item:hover {
  border-color: #6e4aff;
  transform: translateY(-2px);
}

/* Ширину ячейки держим в пределах 180px: медиа разрешено показывать
   только в исходном разрешении, растягивать его нельзя. */
.spc-item :deep(.spd) {
  aspect-ratio: 1;
  width: 100%;
  max-width: 180px;
}

.spc-name {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.spc-meta {
  font-size: 11px;
  color: #8b90a0;
}

.spc-meta.dim {
  color: #6b7080;
}

@media (max-width: 560px) {
  .spc-grid {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 8px;
  }
}
</style>
