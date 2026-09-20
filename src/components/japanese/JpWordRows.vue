<script setup>
import { watch } from "vue";
import { primeJapaneseSpeech, speakJapanese } from "@/components/japaneseApi.js";

// Популярные слова со знаком — справка, а не то, что учат.
//
// Просьба: «популярные слова для каждого уровня иероглифов, чтобы можно было
// тыкнуть — и это будет озвучка». Поэтому тап по строке произносит слово, а
// примеры с разбором открываются отдельной кнопкой. Слова приходят с сервера
// уже отобранными: из списков JLPT, лёгкие уровни вперёд.
//
// В чтении слова подсвечено то, как звучит в нём сам знак, и подписано, он это
// или кун: так на живых словах видно, какое чтение где работает. У слов с
// особым чтением (今日 = きょう) знаку своего чтения не досталось — они
// подписаны «особое».

const props = defineProps({
  words: { type: Array, required: true },
  // Показывать кнопку примеров. В листе знака её нет: лист поверх листа.
  openable: { type: Boolean, default: false },
});
const emit = defineEmits(["open"]);

function parts(w) {
  const reading = w.reading || "";
  const part = w.part || "";
  const at = w.at || 0;
  if (!part || reading.slice(at, at + part.length) !== part) {
    return { before: reading, part: "", after: "" };
  }
  return {
    before: reading.slice(0, at),
    part,
    after: reading.slice(at + part.length),
  };
}

function kindLabel(kind) {
  if (kind === "on") return "он";
  if (kind === "kun") return "кун";
  return "особое";
}

// Звук каждого слова заказывается при показе: на iOS тап проигрывает только
// то, что уже лежит готовым, запрос к серверу внутри тапа жест «остужает».
watch(
  () => props.words,
  (list) => {
    for (const w of list || []) primeJapaneseSpeech(w.reading);
  },
  { immediate: true },
);
</script>

<template>
  <div class="jpw">
    <div v-for="w in words" :key="w.text + w.reading" class="jpw-row">
      <button
        class="jpw-main"
        :aria-label="`${w.text}, ${w.reading}: произнести`"
        @click="speakJapanese(w.reading)"
      >
        <span class="jpw-text">{{ w.text }}</span>
        <span class="jpw-body">
          <span class="jpw-line">
            <span class="jpw-reading"
              >{{ parts(w).before
              }}<b v-if="parts(w).part" :class="`is-${w.kind}`">{{ parts(w).part }}</b
              >{{ parts(w).after }}</span
            >
            <span class="jpw-tag" :class="`is-${w.kind || 'special'}`">{{ kindLabel(w.kind) }}</span>
            <span v-if="w.jlpt" class="jpw-level">N{{ w.jlpt }}</span>
          </span>
          <span class="jpw-meaning">{{ w.meaningRu }}</span>
        </span>
        <span class="jpw-say" aria-hidden="true">🔊</span>
      </button>
      <button
        v-if="openable"
        class="jpw-open"
        :aria-label="`Примеры со словом ${w.text}`"
        @click="emit('open', w.text)"
      >
        📖
      </button>
    </div>
  </div>
</template>

<style scoped>
.jpw {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jpw-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.jpw-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--m-card-2, #22242d);
  color: inherit;
  font: inherit;
  padding: 6px 10px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jpw-main:active {
  border-color: var(--m-line, #262933);
  background: #2b2e39;
}

/* Запись крупнее всего остального: слово читают глазами по-японски, а подписи
   — только если не вышло. */
.jpw-text {
  flex-shrink: 0;
  font-size: 22px;
  line-height: 1.15;
}

.jpw-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.jpw-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 6px;
}

.jpw-reading {
  font-size: 14px;
  color: #cfd3e0;
}

.jpw-reading b {
  font-weight: 700;
}

.jpw-reading b.is-on,
.jpw-tag.is-on {
  color: #a58bff;
}

.jpw-reading b.is-kun,
.jpw-tag.is-kun {
  color: #63c94f;
}

.jpw-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.jpw-tag.is-special {
  color: var(--m-muted, #7a7f8e);
}

.jpw-level {
  font-size: 10px;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 6px;
  border: 1px solid var(--m-line, #262933);
  color: var(--m-muted, #7a7f8e);
}

.jpw-meaning {
  font-size: 13px;
  color: var(--m-muted, #7a7f8e);
  line-height: 1.3;
}

.jpw-say {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.55;
}

.jpw-open {
  flex-shrink: 0;
  width: 42px;
  border-radius: 10px;
  border: 1px solid var(--m-line, #262933);
  background: transparent;
  color: inherit;
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jpw-open:active {
  background: var(--m-card-2, #22242d);
}
</style>
