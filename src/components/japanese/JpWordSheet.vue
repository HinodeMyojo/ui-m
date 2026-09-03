<script setup>
import { ref, watch } from "vue";
import { fetchJpWord, canSpeakJapanese, speakJapanese } from "@/components/japaneseApi.js";
import JpSentenceList from "./JpSentenceList.vue";
import JpKanjiSheet from "./JpKanjiSheet.vue";

// Слово крупным планом: чтение, значения, из каких знаков сложено и как стоит
// в живой фразе. Тот же лист, что и у знака, но для слова — у него нет ни
// черт, ни ключей, зато есть примеры, ради которых сюда и заходят.
//
// Знак из разбора открывает свой лист поверх этого: цепочка «слово → знак»
// естественная, а обратная почти не нужна.

const props = defineProps({
  text: { type: String, required: true },
});
const emit = defineEmits(["close"]);

const data = ref(null);
const error = ref("");
const loading = ref(false);
const kanjiChar = ref("");

watch(
  () => props.text,
  async (text) => {
    if (!text) return;
    loading.value = true;
    error.value = "";
    data.value = null;
    try {
      data.value = await fetchJpWord(text);
    } catch (e) {
      error.value = e.message || "не удалось загрузить слово";
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function say() {
  speakJapanese(data.value?.reading || props.text);
}
</script>

<template>
  <Teleport to="body">
    <div class="jws" @click.self="emit('close')">
      <div class="jws-sheet">
        <header class="jws-top">
          <div class="jws-word">
            <div v-if="data?.reading" class="jws-reading">{{ data.reading }}</div>
            <div class="jws-text">{{ text }}</div>
          </div>
          <button class="jws-close" aria-label="Закрыть" @click="emit('close')">✕</button>
        </header>

        <div v-if="loading" class="jws-muted">Загружаю…</div>
        <div v-else-if="error" class="jws-muted">{{ error }}</div>

        <template v-else-if="data">
          <div class="jws-meaning">{{ (data.meaningsRu || []).slice(0, 3).join(", ") }}</div>

          <button v-if="canSpeakJapanese()" class="jws-say" @click="say">🔊 Как звучит</button>

          <div v-if="data.breakdown?.length" class="jws-block">
            <div class="jws-label">По знакам</div>
            <button
              v-for="p in data.breakdown"
              :key="p.char"
              class="jws-part"
              @click="kanjiChar = p.char"
            >
              <span class="jws-part-char">{{ p.char }}</span>
              <span class="jws-part-body">
                <span class="jws-part-meaning">{{ (p.meaningsRu || []).join(", ") }}</span>
                <span v-if="p.onReadings?.length || p.kunReadings?.length" class="jws-part-readings">
                  <template v-if="p.onReadings?.length">он {{ p.onReadings.join(", ") }}</template>
                  <template v-if="p.onReadings?.length && p.kunReadings?.length"> · </template>
                  <template v-if="p.kunReadings?.length">кун {{ p.kunReadings.join(", ") }}</template>
                </span>
              </span>
              <span class="jws-part-more">✎</span>
            </button>
          </div>

          <div v-if="data.sentences?.length" class="jws-block">
            <div class="jws-label">Примеры</div>
            <JpSentenceList :sentences="data.sentences" />
          </div>
          <div v-else class="jws-muted">Примеров с этим словом в корпусе не нашлось.</div>
        </template>
      </div>

      <JpKanjiSheet v-if="kanjiChar" :char="kanjiChar" @close="kanjiChar = ''" />
    </div>
  </Teleport>
</template>

<style scoped>
.jws {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.62);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.jws-sheet {
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 18px 18px 0 0;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card, #1b1d25);
  color: var(--m-text, #e6e8ef);
  padding: 12px 14px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.jws-top {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

.jws-word {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.jws-reading {
  font-size: 15px;
  color: #a58bff;
}

.jws-text {
  font-size: 40px;
  line-height: 1.15;
}

.jws-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-muted, #7a7f8e);
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jws-meaning {
  font-size: 16px;
  color: #cfd3e0;
}

.jws-say {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 11px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jws-block {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jws-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--m-muted, #7a7f8e);
  text-align: left;
}

.jws-part {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
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

.jws-part:active {
  border-color: var(--m-line, #262933);
  background: #2b2e39;
}

.jws-part-char {
  flex-shrink: 0;
  min-width: 34px;
  text-align: center;
  font-size: 28px;
  line-height: 1.1;
}

.jws-part-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.jws-part-meaning {
  font-size: 14px;
  color: #cfd3e0;
}

.jws-part-readings {
  font-size: 12px;
  color: var(--m-muted, #7a7f8e);
}

.jws-part-more {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--m-muted, #7a7f8e);
}

.jws-muted {
  color: var(--m-muted, #7a7f8e);
  font-size: 14px;
  padding: 12px 0;
}
</style>
