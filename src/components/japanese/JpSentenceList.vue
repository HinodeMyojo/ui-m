<script setup>
import { ref } from "vue";
import { canSpeakJapanese, speakJapanese } from "@/components/japaneseApi.js";

// Примеры из корпуса Танака: фраза, как она читается, что значит и из каких
// слов состоит.
//
// Чтение каной приходит с сервера и только целиком — половина фразы каной, а
// половина иероглифами читается хуже, чем чистый оригинал. Произносится тоже
// оно, а не запись: синтезатор сам выбирает чтение иероглифов и на 生 или 何
// ошибается.
//
// Разбор по словам спрятан под кнопку: фразу сначала пробуют прочитать, и
// список значений под каждой строкой мешал бы именно этому.

defineProps({
  sentences: { type: Array, default: () => [] },
});

const opened = ref(new Set());

function toggle(text) {
  const next = new Set(opened.value);
  if (next.has(text)) next.delete(text);
  else next.add(text);
  opened.value = next;
}

function say(ex) {
  speakJapanese(ex.reading || ex.text);
}
</script>

<template>
  <div class="jsl">
    <div v-for="ex in sentences" :key="ex.text" class="jsl-item">
      <div v-if="ex.reading" class="jsl-reading">{{ ex.reading }}</div>

      <div class="jsl-row">
        <span class="jsl-text">{{ ex.text }}</span>
        <button
          v-if="canSpeakJapanese()"
          class="jsl-say"
          :aria-label="`Произнести «${ex.text}»`"
          @click="say(ex)"
        >
          🔊
        </button>
      </div>

      <div class="jsl-tr">{{ ex.translationRu || ex.translationEn }}</div>

      <button v-if="ex.words?.length" class="jsl-more" @click="toggle(ex.text)">
        {{ opened.has(ex.text) ? "Скрыть разбор" : "Разобрать по словам" }}
      </button>

      <div v-if="opened.has(ex.text) && ex.words?.length" class="jsl-words">
        <div v-for="w in ex.words" :key="w.text" class="jsl-word">
          <span class="jsl-word-text">{{ w.text }}</span>
          <span v-if="w.reading" class="jsl-word-reading">{{ w.reading }}</span>
          <span v-if="w.meaningRu" class="jsl-word-meaning">{{ w.meaningRu }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.jsl {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jsl-item {
  padding: 9px 11px;
  border-radius: 10px;
  background: #22242d;
  border: 1px solid #2a2d38;
  text-align: left;
}

/* Чтение стоит над фразой и мельче её — как фуригана в книге. */
.jsl-reading {
  font-size: 13px;
  color: #a58bff;
  line-height: 1.4;
}

.jsl-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.jsl-text {
  font-size: 19px;
  line-height: 1.5;
}

.jsl-say {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jsl-tr {
  margin-top: 3px;
  font-size: 13px;
  color: #cfd3e0;
}

.jsl-more {
  margin-top: 6px;
  border: none;
  background: transparent;
  padding: 0;
  color: #7a7f8e;
  font-size: 12px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jsl-words {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.jsl-word {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 7px;
  font-size: 13px;
}

.jsl-word-text {
  font-size: 16px;
}

.jsl-word-reading {
  color: #a58bff;
}

.jsl-word-meaning {
  color: #7a7f8e;
}
</style>
