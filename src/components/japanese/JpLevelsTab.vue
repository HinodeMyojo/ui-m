<script setup>
import { ref, computed, onMounted } from "vue";
import { fetchJpDecks } from "@/components/japaneseApi.js";
import { JLPT_LEVELS, JLPT_NOTE, JLPT_SOURCES, JLPT_HOURS_NOTE } from "./jlptReference.js";

// Справочник по уровням: что спрашивают, сколько знать, какая грамматика.
// Чистая справка, без изучения — сюда заходят, чтобы понять, куда идёшь.
//
// К каждому уровню подтягивается собственный прогресс из набора jlpt-nX:
// справка без «где я сейчас» отвечает на половину вопроса.

const decks = ref([]);
const open = ref(5); // N5 раскрыт сразу: с него начинают
const showSources = ref(false);
const openGrammar = ref({});

onMounted(async () => {
  try {
    decks.value = await fetchJpDecks();
  } catch {
    decks.value = [];
  }
});

const progressByLevel = computed(() => {
  const map = {};
  for (const d of decks.value) {
    const m = /^jlpt-n(\d)$/.exec(d.code || "");
    if (m) map[Number(m[1])] = d;
  }
  return map;
});

function pct(level) {
  const d = progressByLevel.value[level.code];
  if (!d?.total) return 0;
  return Math.round((d.learned / d.total) * 100);
}

function toggle(code) {
  open.value = open.value === code ? 0 : code;
}

function toggleGrammar(levelCode, title) {
  const key = `${levelCode}:${title}`;
  openGrammar.value[key] = !openGrammar.value[key];
}

function grammarOpen(levelCode, title) {
  return !!openGrammar.value[`${levelCode}:${title}`];
}

// Цвета уровней — те же, что в сетке дзёё: N5 зелёный, дальше к красному.
const LEVEL_COLORS = {
  5: "#63c94f",
  4: "#4aa8ff",
  3: "#a58bff",
  2: "#ffd666",
  1: "#e5484d",
};
</script>

<template>
  <div class="jpl">
    <section class="jp-card">
      <h3>Уровни JLPT</h3>
      <p class="jp-muted">{{ JLPT_NOTE }}</p>
      <button class="jp-btn jp-btn-sm" style="margin-top: 8px" @click="showSources = !showSources">
        {{ showSources ? "Скрыть" : "Откуда эти числа" }}
      </button>
      <div v-if="showSources" class="jpl-sources">
        <div v-for="src in JLPT_SOURCES" :key="src.what" class="jpl-source">
          <b>{{ src.what }}</b>
          <span class="jp-muted">{{ src.where }} — {{ src.trust }}</span>
        </div>
        <p class="jp-muted" style="margin: 8px 0 0">{{ JLPT_HOURS_NOTE }}</p>
      </div>
    </section>

    <section v-for="level in JLPT_LEVELS" :key="level.code" class="jp-card jpl-level">
      <button class="jpl-head" @click="toggle(level.code)">
        <span class="jpl-badge" :style="{ background: LEVEL_COLORS[level.code] }">
          {{ level.title }}
        </span>
        <span class="jpl-head-text">
          <span class="jpl-tagline">{{ level.tagline }}</span>
          <span class="jp-muted jpl-nums">
            {{ level.kanjiTotal }} кандзи · {{ level.words }} слов · {{ level.hours }}
          </span>
        </span>
        <span class="jpl-chev">{{ open === level.code ? "−" : "+" }}</span>
      </button>

      <div v-if="progressByLevel[level.code]" class="jpl-progress">
        <div class="jp-bar">
          <span
            :style="{ width: pct(level) + '%', background: LEVEL_COLORS[level.code] }"
          />
        </div>
        <span class="jp-muted">
          у тебя {{ progressByLevel[level.code].learned }} из
          {{ progressByLevel[level.code].total }} кандзи этого уровня ({{ pct(level) }}%)
        </span>
      </div>

      <template v-if="open === level.code">
        <div class="jpl-block">
          <h4>Что должен уметь</h4>
          <ul class="jpl-list">
            <li v-for="c in level.can" :key="c">{{ c }}</li>
          </ul>
        </div>

        <div class="jpl-block">
          <h4>Темы</h4>
          <div class="jpl-chips">
            <span v-for="t in level.topics" :key="t" class="jpl-chip">{{ t }}</span>
          </div>
        </div>

        <div class="jpl-block">
          <h4>Экзамен</h4>
          <ul class="jpl-list">
            <li v-for="p in level.exam.parts" :key="p">{{ p }}</li>
          </ul>
          <p class="jp-muted">
            Всего {{ level.exam.total }}. Проходной балл: {{ level.exam.pass }}.
          </p>
        </div>

        <div class="jpl-block">
          <h4>Грамматика</h4>
          <p class="jp-muted" style="margin-top: 0">
            {{ level.kanjiNew }} новых кандзи на этом уровне, всего к нему —
            {{ level.kanjiTotal }}.<template v-if="level.kanjiJoyo">
              В сетке дзёё из них видно {{ level.kanjiJoyo }}: остальные в список 2136 не
              входят.</template>
          </p>
          <div v-for="group in level.grammar" :key="group.title" class="jpl-group">
            <button class="jpl-group-head" @click="toggleGrammar(level.code, group.title)">
              <b>{{ group.title }}</b>
              <span class="jp-muted">{{ group.items.length }}</span>
              <span class="jpl-chev">{{ grammarOpen(level.code, group.title) ? "−" : "+" }}</span>
            </button>
            <div v-if="grammarOpen(level.code, group.title)" class="jpl-items">
              <div v-for="item in group.items" :key="item.form" class="jpl-item">
                <div class="jpl-item-head">
                  <span class="jpl-form">{{ item.form }}</span>
                  <span class="jp-muted">{{ item.note }}</span>
                </div>
                <div class="jpl-example">{{ item.example }}</div>
                <div class="jp-muted jpl-translation">{{ item.translation }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.jpl {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.jpl-level {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jpl-head {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jpl-badge {
  flex-shrink: 0;
  min-width: 46px;
  padding: 5px 9px;
  border-radius: 9px;
  color: #14151b;
  font-size: 15px;
  font-weight: 800;
  text-align: center;
}

.jpl-head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.jpl-tagline {
  font-size: 14px;
  font-weight: 600;
}

.jpl-nums {
  font-size: 11.5px;
}

.jpl-chev {
  flex-shrink: 0;
  font-size: 20px;
  color: #7a7f8e;
  width: 20px;
  text-align: center;
}

.jpl-progress {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
}

.jpl-sources {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #2a2d38;
}

.jpl-source {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
}

.jpl-block {
  border-top: 1px solid #2a2d38;
  padding-top: 10px;
}

.jpl-block h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #cfd3e0;
}

.jpl-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  line-height: 1.45;
  color: #cfd3e0;
}

.jpl-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.jpl-chip {
  font-size: 12px;
  border-radius: 999px;
  padding: 4px 10px;
  background: #22242d;
  border: 1px solid #2f3340;
  color: #cfd3e0;
}

.jpl-group {
  border-radius: 10px;
  background: #22242d;
  border: 1px solid #2a2d38;
  margin-bottom: 6px;
  overflow: hidden;
}

.jpl-group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 11px;
  background: none;
  border: none;
  color: #e8eaf2;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jpl-group-head b {
  flex: 1;
  min-width: 0;
}

.jpl-items {
  padding: 0 11px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jpl-item {
  border-top: 1px solid #2a2d38;
  padding-top: 9px;
}

.jpl-item-head {
  display: flex;
  align-items: baseline;
  gap: 9px;
  flex-wrap: wrap;
}

/* Конструкция — то, за чем сюда пришли: крупнее и цветом. */
.jpl-form {
  font-size: 16px;
  font-weight: 600;
  color: #c9b9ff;
}

.jpl-example {
  margin-top: 5px;
  font-size: 16px;
  line-height: 1.5;
}

.jpl-translation {
  margin-top: 2px;
  font-size: 12.5px;
}
</style>
