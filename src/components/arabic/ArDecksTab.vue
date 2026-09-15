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

const emit = defineEmits(["changed"]);

const decks = ref([]);
const loading = ref(true);
const error = ref("");
const newName = ref("");
const pasteFor = ref(null);
const pasteText = ref("");
const pasteResult = ref(null);
const busy = ref(false);

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

const system = computed(() => decks.value.filter((d) => d.kind === "system"));
const mine = computed(() => decks.value.filter((d) => d.kind !== "system"));

async function toggle(deck) {
  deck.enabled = !deck.enabled;
  await push(deck, { enabled: deck.enabled });
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

    <section class="ar-card">
      <h3 class="ar-card-title">Что учим</h3>
      <p class="ar-muted">
        Новые единицы берутся из включённых наборов пропорционально весам. Алфавит идёт первым:
        слово не выдаётся, пока не закрепились его буквы.
      </p>
    </section>

    <div v-for="deck in system" :key="deck.id" class="ar-card ar-deck">
      <div class="ar-row ar-deck-head">
        <label class="ar-check">
          <input type="checkbox" :checked="deck.enabled" :disabled="busy" @change="toggle(deck)" />
          <b>{{ deck.name }}</b>
        </label>
        <span v-if="deck.enabled" class="ar-chip ar-chip-gold">{{ deck.sharePct }}% потока</span>
      </div>

      <div class="ar-bar"><span :style="{ width: pct(deck) + '%', background: deck.color }"></span></div>
      <p class="ar-muted">
        {{ deck.learned }} закреплено · {{ deck.started }} в работе · всего {{ deck.total }}
      </p>

      <label v-if="deck.enabled" class="ar-weight">
        вес {{ deck.weight }}
        <input
          type="range"
          min="0"
          max="100"
          step="10"
          :value="deck.weight"
          :disabled="busy"
          @change="setWeight(deck, $event.target.value)"
        />
      </label>
    </div>

    <section class="ar-card">
      <h3 class="ar-card-title">Свои наборы</h3>
      <div v-for="deck in mine" :key="deck.id" class="ar-deck ar-deck-user">
        <div class="ar-row ar-deck-head">
          <label class="ar-check">
            <input type="checkbox" :checked="deck.enabled" :disabled="busy" @change="toggle(deck)" />
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

      <div class="ar-row">
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

.ar-deck-head {
  justify-content: space-between;
}

.ar-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}

.ar-weight {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #7a7f8e;
}

.ar-weight input {
  flex: 1;
}

.ar-deck-user {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px solid #2a2d38;
}

.ar-deck-user:first-of-type {
  border-top: none;
}
</style>
