<script setup>
import { ref, watch } from "vue";
import { analyzeArText, speakArabic, canSpeakArabic } from "@/components/arabicApi.js";
import ArSheet from "./ArSheet.vue";

// Разбор вставленной строки: что это за слова и какие из них уже знакомы.
//
// Главный сценарий — встретил фразу (в песне, в переписке, на вывеске) и хочешь
// понять её прямо сейчас, не заводя карточек. Второй — посмотреть, сколько из
// слов уже выучено: это самая честная мера прогресса из всех, что есть.

const props = defineProps({
  text: { type: String, default: "" },
});

const input = ref(props.text);
const result = ref(null);
const loading = ref(false);
const error = ref("");
const sheet = ref(null);
const canHear = canSpeakArabic();

watch(
  () => props.text,
  (value) => {
    if (!value) return;
    input.value = value;
    run();
  },
);

async function run() {
  const text = input.value.trim();
  if (!text) return;
  loading.value = true;
  error.value = "";
  try {
    result.value = await analyzeArText(text);
  } catch (e) {
    error.value = e.message || "не удалось разобрать";
  } finally {
    loading.value = false;
  }
}

function clear() {
  input.value = "";
  result.value = null;
}
</script>

<template>
  <div class="ar-analyze">
    <section class="ar-card">
      <h3 class="ar-card-title">Разбор текста</h3>
      <textarea
        v-model="input"
        class="ar-input ar-textarea ar-ar"
        dir="rtl"
        placeholder="вставьте арабскую строку"
      ></textarea>
      <div class="ar-row">
        <button class="ar-btn ar-btn-accent" :disabled="loading || !input.trim()" @click="run">
          {{ loading ? "Разбираем…" : "Разобрать" }}
        </button>
        <button v-if="canHear && input.trim()" class="ar-btn" @click="speakArabic(input)">🔊</button>
        <button v-if="result" class="ar-btn" @click="clear">Очистить</button>
      </div>
      <p v-if="error" class="ar-err">{{ error }}</p>
    </section>

    <template v-if="result">
      <section v-if="result.words?.length" class="ar-card">
        <h3 class="ar-card-title">Слова словаря — {{ result.words.length }}</h3>
        <button
          v-for="w in result.words"
          :key="w.bare"
          class="ar-found"
          @click="sheet = { kind: 'word', value: w.bare }"
        >
          <span class="ar-ar ar-found-word">{{ w.text }}</span>
          <span class="ar-found-meaning">
            {{ (w.meanings || []).join(", ") }}
            <small v-if="w.count > 1">×{{ w.count }}</small>
          </span>
          <span class="ar-found-state" :class="{ learned: w.learned, study: w.inStudy }">
            {{ w.learned ? "знаю" : w.inStudy ? "учу" : "новое" }}
          </span>
        </button>
      </section>

      <section v-if="result.unknown?.length" class="ar-card">
        <h3 class="ar-card-title">Нет в словаре — {{ result.unknown.length }}</h3>
        <p class="ar-muted">
          Словарь модуля — ядро в несколько сотен слов, а не весь язык. Здесь то, что в него пока
          не входит: формы слов, имена, редкое.
        </p>
        <p class="ar-ar ar-unknown">{{ result.unknown.join("، ") }}</p>
      </section>

      <section v-if="result.letters?.length" class="ar-card">
        <h3 class="ar-card-title">Буквы строки</h3>
        <div class="ar-letters-row">
          <button
            v-for="l in result.letters"
            :key="l.char"
            class="ar-letter-chip"
            :class="{ known: l.known }"
            @click="sheet = { kind: 'letter', value: l.char }"
          >
            <span class="ar-ar">{{ l.char }}</span>
            <small>{{ l.translit }}</small>
          </button>
        </div>
      </section>
    </template>

    <ArSheet v-if="sheet" :kind="sheet.kind" :value="sheet.value" @close="sheet = null" />
  </div>
</template>

<style scoped>
.ar-analyze {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ar-found {
  display: grid;
  grid-template-columns: minmax(80px, auto) 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid #2a2d38;
  background: #22242d;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.ar-found-word {
  font-size: 22px;
}

.ar-found-meaning {
  font-size: 14px;
}

.ar-found-meaning small {
  color: #7a7f8e;
}

.ar-found-state {
  font-size: 11px;
  color: #7a7f8e;
  white-space: nowrap;
}

.ar-found-state.study {
  color: #d9a441;
}

.ar-found-state.learned {
  color: #18a999;
}

.ar-unknown {
  margin: 0;
  font-size: 20px;
  color: #b9bdc9;
}

.ar-letters-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  direction: rtl;
}

.ar-letter-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 40px;
  padding: 4px 6px;
  border-radius: 10px;
  border: 1px solid #2a2d38;
  background: #22242d;
  color: #b9bdc9;
  cursor: pointer;
}

.ar-letter-chip.known {
  border-color: #18a999;
  color: #e8eaf2;
}

.ar-letter-chip .ar-ar {
  font-size: 22px;
}

.ar-letter-chip small {
  font-size: 10px;
  direction: ltr;
  color: #7a7f8e;
}
</style>
