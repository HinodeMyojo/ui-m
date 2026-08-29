<script setup>
import { ref, computed } from "vue";
import { fetchJpKanji } from "@/components/japaneseApi.js";
import JpStrokeOrder from "./JpStrokeOrder.vue";

// Словарь. Один вопрос — «что это за знак», и ответ на него должен помещаться
// на экран целиком: начертание, чтения, из чего состоит, с чем путают и в
// каком состоянии карточка.

const query = ref("");
const kanji = ref(null);
const loading = ref(false);
const error = ref("");

// В поле вставляют что угодно — слово, фразу, строку из учебника. Ищем по
// первому кандзи: спрашивать «введите ровно один иероглиф» бессмысленно,
// когда мы сами умеем его найти.
function firstKanji(text) {
  for (const ch of String(text || "")) {
    const code = ch.codePointAt(0);
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) return ch;
  }
  return "";
}

async function search(text) {
  const char = firstKanji(text ?? query.value);
  if (!char) {
    error.value = "в строке нет кандзи";
    return;
  }
  query.value = char;
  loading.value = true;
  error.value = "";
  try {
    kanji.value = await fetchJpKanji(char);
  } catch (e) {
    kanji.value = null;
    error.value = e.message || "не нашлось";
  } finally {
    loading.value = false;
  }
}

const stateLabel = computed(() => {
  const k = kanji.value;
  if (!k?.inStudy) return "не в изучении";
  if (k.learned) return "закреплено";
  return { new: "новая", learning: "учится", review: "на повторении", relearning: "заново" }[
    k.state
  ] || k.state;
});

const dueLabel = computed(() => {
  const due = kanji.value?.due;
  if (!due) return "";
  return new Date(due).toLocaleDateString("ru-RU");
});

const levelLabel = computed(() => {
  const k = kanji.value;
  if (!k) return "";
  const parts = [];
  if (k.jlpt) parts.push(`N${k.jlpt}`);
  if (k.grade) parts.push(`${k.grade} класс`);
  if (k.freq) parts.push(`#${k.freq} по частоте`);
  return parts.join(" · ");
});
</script>

<template>
  <div class="jpw">
    <div class="jp-row">
      <input
        v-model="query"
        class="jp-input"
        style="flex: 1; min-width: 200px; font-size: 18px"
        placeholder="日 или целая строка из учебника"
        @keyup.enter="search()"
      />
      <button class="jp-btn is-primary" :disabled="loading" @click="search()">Найти</button>
    </div>

    <div v-if="error" class="jp-error">{{ error }}</div>
    <div v-if="loading" class="jp-empty">Ищу…</div>

    <div v-else-if="kanji" class="jpw-body">
      <section class="jp-card jpw-main">
        <div class="jpw-char">
          <div class="jp-char-lg">{{ kanji.char }}</div>
          <div class="jp-muted">{{ levelLabel }}</div>
        </div>

        <div class="jpw-facts">
          <div class="jpw-meanings">{{ kanji.meaningsRu.join(", ") }}</div>
          <div v-if="kanji.meaningsEn?.length" class="jp-muted">
            {{ kanji.meaningsEn.join(", ") }}
          </div>

          <div class="jp-field">
            <label>Оны</label>
            <div class="jp-readings">
              <span
                v-for="r in kanji.onReadings"
                :key="r"
                class="jp-reading"
                :class="{ 'is-main': r === kanji.mainReading }"
                >{{ r }}</span
              >
              <span v-if="!kanji.onReadings.length" class="jp-muted">нет</span>
            </div>
          </div>

          <div class="jp-field">
            <label>Куны</label>
            <div class="jp-readings">
              <span
                v-for="r in kanji.kunReadings"
                :key="r"
                class="jp-reading"
                :class="{ 'is-main': r === kanji.mainReading }"
                >{{ r }}</span
              >
              <span v-if="!kanji.kunReadings.length" class="jp-muted">нет</span>
            </div>
          </div>

          <div class="jpw-state">
            <span class="jpw-state-tag" :class="{ 'is-on': kanji.inStudy }">{{ stateLabel }}</span>
            <span v-if="kanji.inStudy" class="jp-muted">
              повторений {{ kanji.reps }}, провалов {{ kanji.lapses }}
              <template v-if="dueLabel"> · следующее {{ dueLabel }}</template>
            </span>
          </div>
        </div>
      </section>

      <section v-if="kanji.strokePaths?.length" class="jp-card">
        <h3>Порядок черт</h3>
        <JpStrokeOrder :paths="kanji.strokePaths" />
      </section>

      <section v-if="kanji.components?.length" class="jp-card">
        <h3>Из чего состоит</h3>
        <div class="jpw-parts">
          <button
            v-for="c in kanji.components"
            :key="c.char"
            class="jpw-part"
            :class="{ 'is-known': c.known }"
            @click="c.type === 'kanji' && search(c.char)"
          >
            <span class="jp-char-md">{{ c.char }}</span>
            <span class="jpw-part-name">{{ c.meaningRu }}</span>
            <span class="jpw-part-kind">{{ c.type === "radical" ? "ключ" : "кандзи" }}</span>
          </button>
        </div>
      </section>

      <!-- Похожие — не украшение: 土/士 и 未/末 путаются именно так, и увидеть
           их рядом полезнее, чем прочитать про это. -->
      <section v-if="kanji.similar?.length" class="jp-card">
        <h3>Не перепутай</h3>
        <div class="jpw-similar">
          <button v-for="s in kanji.similar" :key="s" class="jpw-sim" @click="search(s)">
            {{ s }}
          </button>
        </div>
      </section>

      <section v-if="kanji.mnemonic" class="jp-card">
        <h3>Мнемоника</h3>
        <p class="jpw-mnemonic">{{ kanji.mnemonic }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.jpw {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.jpw-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.jpw-main {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.jpw-char {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 130px;
}

.jpw-facts {
  flex: 1;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jpw-meanings {
  font-size: 19px;
  font-weight: 600;
}

.jpw-state {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.jpw-state-tag {
  font-size: 12px;
  border-radius: 999px;
  padding: 3px 10px;
  background: #22242d;
  border: 1px solid #2a2d38;
  color: #7a7f8e;
}

.jpw-state-tag.is-on {
  border-color: var(--jp-accent, #6e4aff);
  color: #c9b9ff;
}

.jpw-parts {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.jpw-part {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 92px;
  padding: 10px;
  border-radius: 10px;
  background: #22242d;
  border: 1px solid #2a2d38;
  color: #e8eaf2;
  cursor: pointer;
}

.jpw-part.is-known {
  border-color: rgba(99, 201, 79, 0.45);
}

.jpw-part-name {
  font-size: 12px;
  color: #cfd3e0;
  text-align: center;
}

.jpw-part-kind {
  font-size: 10px;
  color: #7a7f8e;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.jpw-similar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.jpw-sim {
  width: 62px;
  height: 62px;
  border-radius: 12px;
  background: #22242d;
  border: 1px solid #2a2d38;
  color: #e8eaf2;
  font-size: 30px;
  cursor: pointer;
}

.jpw-sim:hover {
  border-color: var(--jp-accent, #6e4aff);
}

.jpw-mnemonic {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: #cfd3e0;
}
</style>
