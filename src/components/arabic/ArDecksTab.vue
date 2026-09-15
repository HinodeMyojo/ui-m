<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchArDecks,
  createArDeck,
  updateArDeck,
  deleteArDeck,
  addArWordsByText,
} from "@/components/arabicApi.js";

// Наборы: откуда берутся новые единицы и в какой пропорции.
//
// Набор — не список, а доля в потоке: включённые смешиваются пропорционально
// весам. Поэтому у каждого показан процент — вес сам по себе не значит ничего,
// значение имеет только его доля от суммы.
//
// Списком в двадцать карточек это не читается, поэтому наборы разложены по
// назначению: основные (алфавит и частотность), темы и корни. Темы свёрнуты —
// их одиннадцать, и по умолчанию они выключены.

const emit = defineEmits(["changed"]);

const decks = ref([]);
const loading = ref(true);
const error = ref("");
const newName = ref("");
const pasteFor = ref(null);
const pasteText = ref("");
const pasteResult = ref(null);
const busy = ref(false);
const topicsOpen = ref(false);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    decks.value = await fetchArDecks();
  } catch (e) {
    error.value = e.message || "не удалось загрузить наборы";
  } finally {
    loading.value = false;
  }
}

const isTopic = (deck) => (deck.code || "").startsWith("topic-");
const main = computed(() =>
  decks.value.filter((d) => d.kind === "system" && !isTopic(d) && d.code !== "roots"),
);
const topics = computed(() => decks.value.filter((d) => d.kind === "system" && isTopic(d)));
const roots = computed(() => decks.value.filter((d) => d.code === "roots"));
const mine = computed(() => decks.value.filter((d) => d.kind !== "system"));
const topicsOn = computed(() => topics.value.filter((d) => d.enabled).length);

async function toggle(deck) {
  await push(deck, { enabled: !deck.enabled });
}

async function setWeight(deck, value) {
  deck.weight = Number(value);
  await push(deck, { weight: deck.weight });
}

async function push(deck, patch) {
  busy.value = true;
  try {
    await updateArDeck(deck.id, patch);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не сохранилось";
  } finally {
    busy.value = false;
  }
}

async function create() {
  const name = newName.value.trim();
  if (!name) return;
  busy.value = true;
  try {
    await createArDeck({ name, weight: 30 });
    newName.value = "";
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "набор не создался";
  } finally {
    busy.value = false;
  }
}

async function remove(deck) {
  if (!confirm(`Удалить набор «${deck.name}»? Карточки останутся, пропадёт только список.`)) return;
  try {
    await deleteArDeck(deck.id);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалилось";
  }
}

async function paste() {
  if (!pasteFor.value || !pasteText.value.trim()) return;
  busy.value = true;
  pasteResult.value = null;
  try {
    pasteResult.value = await addArWordsByText(pasteFor.value.id, pasteText.value);
    pasteText.value = "";
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не добавилось";
  } finally {
    busy.value = false;
  }
}

function pct(deck) {
  return deck.total ? Math.round((deck.learned / deck.total) * 100) : 0;
}

onMounted(load);
</script>

<template>
  <div class="ar-decks">
    <p v-if="loading" class="ar-muted">Загружаем…</p>
    <p v-if="error" class="ar-err">{{ error }}</p>

    <section class="ar-card ar-decks-intro">
      <h3 class="ar-card-title">Что учим</h3>
      <p class="ar-muted">
        Новые единицы берутся из включённых наборов пропорционально весам. Алфавит идёт первым:
        слово не выдаётся, пока не закрепились его буквы.
      </p>
    </section>

    <!-- Основные наборы: алфавит и корзины частотности. -->
    <section class="ar-card ar-deck-list">
      <h3 class="ar-card-title">Основные</h3>
      <div v-for="deck in main" :key="deck.id" class="ar-deck" :class="{ off: !deck.enabled }">
        <div class="ar-deck-head">
          <label class="ar-switch">
            <input type="checkbox" :checked="deck.enabled" :disabled="busy" @change="toggle(deck)" />
            <i></i>
            <b>{{ deck.name }}</b>
          </label>
          <span v-if="deck.enabled" class="ar-chip ar-chip-gold">{{ deck.sharePct }}% потока</span>
        </div>

        <div class="ar-deck-progress">
          <div class="ar-bar">
            <span :style="{ width: pct(deck) + '%', background: deck.color || undefined }"></span>
          </div>
          <span class="ar-deck-pct">{{ pct(deck) }}%</span>
        </div>
        <p class="ar-muted ar-deck-stats">
          {{ deck.learned }} закреплено · {{ deck.started }} в работе · всего {{ deck.total }}
        </p>

        <label v-if="deck.enabled" class="ar-deck-weight">
          <span class="ar-muted">вес</span>
          <input
            type="range"
            min="0"
            max="100"
            step="10"
            :value="deck.weight"
            :disabled="busy"
            @change="setWeight(deck, $event.target.value)"
          />
          <span class="ar-deck-weight-num">{{ deck.weight }}</span>
        </label>
      </div>
    </section>

    <!-- Темы: их одиннадцать, и по умолчанию они выключены. Разворачиваются по
         просьбе, иначе список наборов не читается. -->
    <section class="ar-card ar-deck-list">
      <button class="ar-fold" @click="topicsOpen = !topicsOpen">
        <h3 class="ar-card-title">Темы</h3>
        <span class="ar-muted">
          {{ topicsOn ? `включено ${topicsOn} из ${topics.length}` : `${topics.length} наборов` }}
        </span>
        <span class="ar-fold-chev" :class="{ open: topicsOpen }">›</span>
      </button>

      <template v-if="topicsOpen">
        <p class="ar-muted">
          Тематический набор перемешивает «спасибо» с «налогом»: включать его стоит тогда, когда
          тема нужна прямо сейчас — например, перед поездкой.
        </p>
        <div class="ar-topics">
          <label
            v-for="deck in topics"
            :key="deck.id"
            class="ar-topic"
            :class="{ on: deck.enabled }"
          >
            <input type="checkbox" :checked="deck.enabled" :disabled="busy" @change="toggle(deck)" />
            <b>{{ deck.name }}</b>
            <small>{{ deck.learned }} / {{ deck.total }}</small>
          </label>
        </div>
      </template>
    </section>

    <section v-if="roots.length" class="ar-card ar-deck-list">
      <h3 class="ar-card-title">Корни</h3>
      <div v-for="deck in roots" :key="deck.id" class="ar-deck" :class="{ off: !deck.enabled }">
        <div class="ar-deck-head">
          <label class="ar-switch">
            <input type="checkbox" :checked="deck.enabled" :disabled="busy" @change="toggle(deck)" />
            <i></i>
            <b>{{ deck.name }}</b>
          </label>
          <span v-if="deck.enabled" class="ar-chip ar-chip-gold">{{ deck.sharePct }}% потока</span>
        </div>
        <p class="ar-muted ar-deck-stats">
          {{ deck.total }} корней · учить их стоит вместе со словами, а не вместо них
        </p>
      </div>
    </section>

    <section class="ar-card ar-deck-list">
      <h3 class="ar-card-title">Свои наборы</h3>
      <p v-if="!mine.length" class="ar-muted">
        Сюда складывают слова из своего источника — учебника, песни, переписки. Вставьте текст, и
        всё, что нашлось в словаре, попадёт в набор.
      </p>

      <div v-for="deck in mine" :key="deck.id" class="ar-deck" :class="{ off: !deck.enabled }">
        <div class="ar-deck-head">
          <label class="ar-switch">
            <input type="checkbox" :checked="deck.enabled" :disabled="busy" @change="toggle(deck)" />
            <i></i>
            <b>{{ deck.name }}</b>
          </label>
          <span class="ar-muted">{{ deck.total }} слов</span>
        </div>
        <div class="ar-row">
          <button class="ar-btn ar-btn-sm" @click="pasteFor = pasteFor?.id === deck.id ? null : deck">
            Вставить слова
          </button>
          <button class="ar-btn ar-btn-sm" @click="remove(deck)">Удалить</button>
        </div>

        <template v-if="pasteFor?.id === deck.id">
          <textarea
            v-model="pasteText"
            class="ar-input ar-textarea ar-ar"
            dir="rtl"
            placeholder="вставьте текст: строку из учебника, список слов, абзац"
          ></textarea>
          <button class="ar-btn ar-btn-accent ar-btn-sm" :disabled="busy" @click="paste">
            Добавить в набор
          </button>
          <p v-if="pasteResult" class="ar-muted">
            добавлено {{ pasteResult.added?.length || 0 }}, уже было
            {{ pasteResult.already?.length || 0 }}, не нашлось в словаре
            {{ pasteResult.unknown?.length || 0 }}
          </p>
        </template>
      </div>

      <div class="ar-row ar-deck-new">
        <input v-model="newName" class="ar-input" placeholder="название набора" />
        <button class="ar-btn ar-btn-accent" :disabled="busy || !newName.trim()" @click="create">
          Завести
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ar-decks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Вводная карточка отличается подложкой: это не такой же набор, а объяснение,
   как они складываются в поток. */
.ar-decks-intro {
  background: linear-gradient(140deg, #202a2d 0%, #1e2027 70%);
  border-color: #27333a;
}

.ar-deck-list {
  gap: 0;
  padding: 6px 16px 14px;
}

.ar-deck-list > .ar-card-title,
.ar-fold {
  padding: 10px 0 8px;
}

/* Набор — строка, а не карточка в карточке: двадцать вложенных рамок
   превращают список в лестницу. */
.ar-deck {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px 0;
  border-top: 1px solid var(--ar-line);
}

.ar-deck.off {
  opacity: 0.62;
}

.ar-deck-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ar-deck-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ar-deck-progress .ar-bar {
  flex: 1;
}

.ar-deck-pct {
  flex: 0 0 auto;
  min-width: 34px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--ar-muted);
}

.ar-deck-stats {
  margin: 0;
}

.ar-deck-weight {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ar-deck-weight input {
  flex: 1;
  min-width: 0;
}

.ar-deck-weight-num {
  flex: 0 0 auto;
  min-width: 24px;
  text-align: right;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--ar-dim);
}

.ar-fold {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.ar-fold .ar-muted {
  margin-left: auto;
}

.ar-fold-chev {
  color: var(--ar-muted);
  transition: transform 0.15s;
}

.ar-fold-chev.open {
  transform: rotate(90deg);
}

/* Темы — плитками: одиннадцать строк с переключателями читаются как анкета, а
   плитка отвечает на единственный вопрос «включено или нет». */
.ar-topics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  padding-bottom: 6px;
}

.ar-topic {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px;
  border-radius: 12px;
  border: 1px solid var(--ar-line);
  background: var(--ar-card-2);
  cursor: pointer;
  font-size: 14px;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.ar-topic input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.ar-topic small {
  color: var(--ar-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ar-topic.on {
  border-color: var(--ar-accent);
  background: var(--ar-accent-soft);
}

.ar-deck-new {
  padding-top: 12px;
  border-top: 1px solid var(--ar-line);
}

.ar-deck-new .ar-input {
  flex: 1;
  min-width: 140px;
}
</style>
