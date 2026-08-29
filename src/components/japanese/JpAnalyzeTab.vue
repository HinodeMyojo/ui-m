<script setup>
import { ref } from "vue";
import { analyzeJpText, fetchJpKanji } from "@/components/japaneseApi.js";
import JpStrokeOrder from "./JpStrokeOrder.vue";

// Разбор текста. Второй сценарий из спеки целиком: читает Нечаеву или мангу,
// встречает непонятное — вставляет строку и видит, из чего она состоит.
//
// Разбирается вся строка, а не первый знак: по каждому кандзи и по каждому
// найденному слову видно значение, чтение и учится ли оно уже. Тап по знаку
// открывает полную карточку с составом, порядком черт и похожими.

const text = ref("");
const result = ref(null);
const loading = ref(false);
const error = ref("");

const detail = ref(null);
const detailLoading = ref(false);

async function analyze() {
  if (!text.value.trim()) return;
  loading.value = true;
  error.value = "";
  detail.value = null;
  try {
    result.value = await analyzeJpText(text.value);
  } catch (e) {
    result.value = null;
    error.value = e.message || "не разобралось";
  } finally {
    loading.value = false;
  }
}

async function openKanji(char) {
  detailLoading.value = true;
  error.value = "";
  try {
    detail.value = await fetchJpKanji(char);
  } catch (e) {
    detail.value = null;
    error.value = e.message || "карточка не нашлась";
  } finally {
    detailLoading.value = false;
  }
}

function stateLabel(item) {
  if (item.learned) return "закреплено";
  if (item.inStudy) return "учится";
  return "не в изучении";
}

const SAMPLE = "日本語を勉強しています";
</script>

<template>
  <div class="jpa">
    <section class="jp-card">
      <h3>Разбор текста</h3>
      <p class="jp-muted">
        Вставь строку из учебника, подпись из манги или просто список знаков — разберём всё, что
        в ней есть, а не первый иероглиф.
      </p>
      <textarea
        v-model="text"
        class="jp-textarea"
        style="min-height: 88px; margin-top: 10px"
        :placeholder="SAMPLE"
      ></textarea>
      <div class="jp-row" style="margin-top: 8px">
        <button class="jp-btn is-primary" :disabled="loading || !text.trim()" @click="analyze">
          Разобрать
        </button>
        <button class="jp-btn" :disabled="loading" @click="((text = SAMPLE), analyze())">
          Пример
        </button>
      </div>
    </section>

    <div v-if="error" class="jp-error">{{ error }}</div>
    <div v-if="loading" class="jp-empty">Разбираю…</div>

    <template v-else-if="result">
      <section v-if="result.words.length" class="jp-card">
        <h3>Слова — {{ result.words.length }}</h3>
        <div class="jpa-list">
          <div v-for="w in result.words" :key="w.text + w.reading" class="jpa-word">
            <div class="jpa-word-head">
              <span class="jpa-word-text">{{ w.text }}</span>
              <span class="jpa-word-reading">{{ w.reading }}</span>
              <span class="jpa-state" :class="{ 'is-on': w.inStudy, 'is-done': w.learned }">
                {{ stateLabel(w) }}
              </span>
            </div>
            <div class="jpa-word-meaning">{{ w.meaningsRu.slice(0, 3).join("; ") }}</div>
          </div>
        </div>
      </section>

      <section class="jp-card">
        <h3>
          Кандзи — {{ result.kanji.length }}
          <span v-if="result.skipped" class="jp-muted" style="font-weight: 400">
            (кана и знаки препинания пропущены: {{ result.skipped }})
          </span>
        </h3>

        <div v-if="!result.kanji.length" class="jp-empty">В строке нет иероглифов</div>

        <div v-else class="jpa-list">
          <button
            v-for="k in result.kanji"
            :key="k.char"
            class="jpa-kanji"
            :class="{ 'is-study': k.inStudy, 'is-done': k.learned }"
            @click="openKanji(k.char)"
          >
            <span class="jpa-kanji-char">{{ k.char }}</span>
            <span class="jpa-kanji-body">
              <span class="jpa-kanji-meaning">
                {{ k.meaningsRu.slice(0, 3).join(", ") || "нет в справочнике" }}
              </span>
              <span class="jpa-kanji-sub">
                <template v-if="k.mainReading">{{ k.mainReading }} · </template>
                <template v-if="k.jlpt">N{{ k.jlpt }} · </template>
                {{ k.strokes }} черт
                <template v-if="k.count > 1"> · {{ k.count }} раза в строке</template>
              </span>
            </span>
            <span class="jpa-state" :class="{ 'is-on': k.inStudy, 'is-done': k.learned }">
              {{ stateLabel(k) }}
            </span>
          </button>
        </div>
      </section>
    </template>

    <!-- Полная карточка по тапу: то же, что показывает словарь. -->
    <section v-if="detailLoading" class="jp-empty">Открываю…</section>
    <section v-else-if="detail" class="jp-card jpa-detail">
      <div class="jpa-detail-head">
        <div class="jp-char-lg">{{ detail.char }}</div>
        <button class="jp-btn jp-btn-sm" @click="detail = null">Свернуть</button>
      </div>
      <div class="jpa-detail-meanings">{{ detail.meaningsRu.join(", ") }}</div>
      <div class="jp-muted">
        <template v-if="detail.jlpt">N{{ detail.jlpt }} · </template>
        <template v-if="detail.grade">{{ detail.grade }} класс · </template>
        <template v-if="detail.freq">#{{ detail.freq }} по частоте · </template>
        {{ detail.strokes }} черт
      </div>

      <div class="jp-field">
        <label>Оны</label>
        <div class="jp-readings">
          <span
            v-for="r in detail.onReadings"
            :key="r"
            class="jp-reading"
            :class="{ 'is-main': r === detail.mainReading }"
            >{{ r }}</span
          >
          <span v-if="!detail.onReadings.length" class="jp-muted">нет</span>
        </div>
      </div>
      <div class="jp-field">
        <label>Куны</label>
        <div class="jp-readings">
          <span
            v-for="r in detail.kunReadings"
            :key="r"
            class="jp-reading"
            :class="{ 'is-main': r === detail.mainReading }"
            >{{ r }}</span
          >
          <span v-if="!detail.kunReadings.length" class="jp-muted">нет</span>
        </div>
      </div>

      <div v-if="detail.components?.length" class="jp-field">
        <label>Из чего состоит</label>
        <div class="jpa-parts">
          <button
            v-for="c in detail.components"
            :key="c.char"
            class="jpa-part"
            :class="{ 'is-known': c.known }"
            @click="c.type === 'kanji' && openKanji(c.char)"
          >
            <b>{{ c.char }}</b> {{ c.meaningRu }}
          </button>
        </div>
      </div>

      <div v-if="detail.similar?.length" class="jp-field">
        <label>Не перепутай</label>
        <div class="jpa-parts">
          <button v-for="sc in detail.similar" :key="sc" class="jpa-part" @click="openKanji(sc)">
            <b>{{ sc }}</b>
          </button>
        </div>
      </div>

      <JpStrokeOrder v-if="detail.strokePaths?.length" :paths="detail.strokePaths" :size="180" />
    </section>
  </div>
</template>

<style scoped>
.jpa {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.jpa-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* --- Слова --- */

.jpa-word {
  padding: 9px 11px;
  border-radius: 10px;
  background: #22242d;
  border: 1px solid #2a2d38;
}

.jpa-word-head {
  display: flex;
  align-items: baseline;
  gap: 9px;
  flex-wrap: wrap;
}

.jpa-word-text {
  font-size: 21px;
}

.jpa-word-reading {
  font-size: 13px;
  color: #a58bff;
}

.jpa-word-meaning {
  margin-top: 3px;
  font-size: 13px;
  color: #cfd3e0;
}

/* --- Кандзи --- */

.jpa-kanji {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  text-align: left;
  padding: 9px 11px;
  border-radius: 10px;
  background: #22242d;
  border: 1px solid #2a2d38;
  color: #e8eaf2;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jpa-kanji.is-study {
  border-color: rgba(110, 74, 255, 0.5);
}

.jpa-kanji.is-done {
  border-color: rgba(99, 201, 79, 0.5);
}

.jpa-kanji-char {
  font-size: 34px;
  line-height: 1;
  flex-shrink: 0;
  width: 44px;
  text-align: center;
}

.jpa-kanji-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.jpa-kanji-meaning {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jpa-kanji-sub {
  font-size: 11.5px;
  color: #7a7f8e;
}

.jpa-state {
  flex-shrink: 0;
  font-size: 10.5px;
  border-radius: 999px;
  padding: 3px 8px;
  border: 1px solid #2a2d38;
  color: #7a7f8e;
  white-space: nowrap;
}

.jpa-state.is-on {
  border-color: rgba(110, 74, 255, 0.6);
  color: #c9b9ff;
}

.jpa-state.is-done {
  border-color: rgba(99, 201, 79, 0.6);
  color: #9ee08c;
}

/* --- Карточка знака --- */

.jpa-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jpa-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.jpa-detail-meanings {
  font-size: 18px;
  font-weight: 600;
}

.jpa-parts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.jpa-part {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 9px;
  background: #22242d;
  border: 1px solid #2a2d38;
  color: #cfd3e0;
  font-size: 12.5px;
  cursor: pointer;
  min-height: 40px;
}

.jpa-part.is-known {
  border-color: rgba(99, 201, 79, 0.45);
}

.jpa-part b {
  font-size: 20px;
  color: #e8eaf2;
}
</style>
