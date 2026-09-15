<script setup>
import { ref, onMounted } from "vue";
import { fetchArReading, speakArabic, canSpeakArabic } from "@/components/arabicApi.js";
import ArSheet from "./ArSheet.vue";

// Чтение — единственное место модуля, где не спрашивают, а дают прочитать.
//
// Перевод спрятан: смысл в том, чтобы разобрать строку самому. По тапу
// открывается слово, по кнопке — вся фраза. Фразы подбираются такие, где
// знакомо хотя бы половина слов: ниже этого читать нечего, и получается не
// чтение, а разглядывание.

const data = ref(null);
const loading = ref(true);
const error = ref("");
const opened = ref({}); // индекс фразы → показан ли перевод
const word = ref(null); // слово, раскрытое по тапу
const sheet = ref(null);
const canHear = canSpeakArabic();

async function load() {
  loading.value = true;
  error.value = "";
  opened.value = {};
  word.value = null;
  try {
    data.value = await fetchArReading();
  } catch (e) {
    error.value = e.message || "не удалось загрузить чтение";
  } finally {
    loading.value = false;
  }
}

function tapWord(w) {
  // Второй тап по тому же слову открывает лист целиком: первый — подсказка на
  // месте, чтобы не терять строку из виду.
  if (word.value?.bare === w.bare && w.text) {
    sheet.value = { kind: "word", value: w.bare };
    return;
  }
  word.value = w;
}

onMounted(load);
</script>

<template>
  <div class="ar-reading">
    <p v-if="loading" class="ar-muted">Загружаем…</p>
    <p v-if="error" class="ar-err">{{ error }}</p>

    <section v-if="data && !data.sentences?.length" class="ar-card">
      <h3 class="ar-card-title">Читать пока нечего</h3>
      <p class="ar-muted">
        Сюда попадают фразы, где знакомо хотя бы половина слов. Закреплённых слов сейчас
        {{ data.known }} — пройдите несколько сессий, и строки появятся сами.
      </p>
    </section>

    <template v-if="data?.sentences?.length">
      <section class="ar-card">
        <h3 class="ar-card-title">Чтение</h3>
        <p class="ar-muted">
          Прочитайте вслух. Слово по тапу — подсказка, второй тап по нему открывает разбор.
          Перевод — кнопкой, когда уже попробовали сами.
        </p>
      </section>

      <section v-for="(s, i) in data.sentences" :key="i" class="ar-card ar-read">
        <p class="ar-ar ar-read-text" dir="rtl">
          <button
            v-for="(w, j) in s.words"
            :key="j"
            class="ar-read-word"
            :class="{ known: w.known, active: word?.bare === w.bare }"
            @click="tapWord(w)"
          >
            {{ w.form }}
          </button>
        </p>

        <p v-if="word && s.words.some((w) => w.bare === word.bare)" class="ar-read-hint">
          <span class="ar-ar">{{ word.text || word.form }}</span>
          — {{ (word.meanings || []).join(", ") || "нет в словаре" }}
        </p>

        <div class="ar-row ar-read-btns">
          <button class="ar-btn ar-btn-sm" @click="opened[i] = !opened[i]">
            {{ opened[i] ? "Скрыть перевод" : "Перевод" }}
          </button>
          <button v-if="canHear" class="ar-btn ar-btn-sm" @click="speakArabic(s.text)">🔊</button>
          <span class="ar-muted ar-read-pct">{{ s.knownPct }}% знакомо</span>
        </div>
        <p v-if="opened[i]" class="ar-read-translation">{{ s.translationRu }}</p>
      </section>

      <button class="ar-btn" @click="load">Другие фразы</button>
    </template>

    <ArSheet v-if="sheet" :kind="sheet.kind" :value="sheet.value" @close="sheet = null" />
  </div>
</template>

<style scoped>
.ar-reading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ar-read-text {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  justify-content: flex-start;
  margin: 0;
  font-size: clamp(22px, 6.5vw, 30px);
}

/* Слово — кнопка, но выглядит как текст: подчёркивание и рамки превратили бы
   строку в список ссылок, а её надо читать. */
.ar-read-word {
  border: none;
  background: transparent;
  color: #7a7f8e;
  font: inherit;
  padding: 0 2px;
  cursor: pointer;
  border-radius: 6px;
}

.ar-read-word.known {
  color: #e8eaf2;
}

.ar-read-word.active {
  background: rgba(24, 169, 153, 0.22);
  color: #e8eaf2;
}

.ar-read-hint {
  margin: 0;
  font-size: 14px;
  color: #d9a441;
}

.ar-read-hint .ar-ar {
  font-size: 19px;
}

.ar-read-btns {
  justify-content: flex-start;
}

.ar-read-pct {
  margin-left: auto;
}

.ar-read-translation {
  margin: 0;
  font-size: 15px;
  color: #b9bdc9;
}
</style>
