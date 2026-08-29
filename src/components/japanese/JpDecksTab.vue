<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchJpDecks,
  createJpDeck,
  updateJpDeck,
  deleteJpDeck,
  addJpKanjiByText,
} from "@/components/japaneseApi.js";

// Наборы. Очередь — не список, а функция от включённых наборов с весами,
// поэтому эта вкладка и есть главный рычаг управления тем, что придёт учить.
//
// Вставка кандзи текстом живёт здесь же: это основной способ пополнения
// («выписал из Нечаевой страницу — вставил»), и он не должен зависеть от
// качества распознавания.

const decks = ref([]);
const loading = ref(true);
const error = ref("");
const busy = ref(false);

const newName = ref("");
const textDeckId = ref("");
const text = ref("");
const textResult = ref(null);

const systemDecks = computed(() => decks.value.filter((d) => d.kind === "system"));
const userDecks = computed(() => decks.value.filter((d) => d.kind !== "system"));

// Вес имеет смысл только относительно других включённых наборов: 50 из 50 —
// это все новые единицы, 50 из 150 — треть.
const enabledWeight = computed(() =>
  decks.value.reduce((sum, d) => sum + (d.enabled ? d.weight : 0), 0),
);

function share(deck) {
  if (!deck.enabled || !enabledWeight.value) return "—";
  return `${Math.round((deck.weight / enabledWeight.value) * 100)}% потока`;
}

function progress(deck) {
  if (!deck.total) return "0%";
  return `${Math.round((deck.learned / deck.total) * 100)}%`;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    decks.value = await fetchJpDecks();
    if (!textDeckId.value) textDeckId.value = userDecks.value[0]?.id || decks.value[0]?.id || "";
  } catch (e) {
    error.value = e.message || "не удалось загрузить наборы";
  } finally {
    loading.value = false;
  }
}

async function patch(deck, body) {
  busy.value = true;
  error.value = "";
  try {
    await updateJpDeck(deck.id, body);
    await load();
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
    await createJpDeck({ name, weight: 50 });
    newName.value = "";
    await load();
  } catch (e) {
    error.value = e.message || "набор не создался";
  } finally {
    busy.value = false;
  }
}

async function remove(deck) {
  if (!window.confirm(`Удалить набор «${deck.name}»? Карточки останутся.`)) return;
  busy.value = true;
  try {
    await deleteJpDeck(deck.id);
    await load();
  } catch (e) {
    error.value = e.message || "набор не удалился";
  } finally {
    busy.value = false;
  }
}

async function addText() {
  if (!textDeckId.value || !text.value.trim()) return;
  busy.value = true;
  textResult.value = null;
  try {
    textResult.value = await addJpKanjiByText(textDeckId.value, text.value);
    text.value = "";
    await load();
  } catch (e) {
    error.value = e.message || "не разобралось";
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="jpd">
    <div v-if="error" class="jp-error">{{ error }}</div>
    <div v-if="loading" class="jp-empty">Загружаю…</div>

    <template v-else>
      <section class="jp-card">
        <h3>Вставить кандзи текстом</h3>
        <p class="jp-muted">
          Принимается что угодно — строка иероглифов, список через запятую, кусок страницы.
          Всё, что не кандзи, отбрасывается.
        </p>
        <div class="jp-row" style="margin: 10px 0">
          <select v-model="textDeckId" class="jp-select">
            <option v-for="d in decks" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
          <button class="jp-btn is-primary" :disabled="busy || !text.trim()" @click="addText">
            Добавить
          </button>
        </div>
        <textarea
          v-model="text"
          class="jp-textarea"
          placeholder="日月火水木金土 или 人、山、川"
        ></textarea>

        <div v-if="textResult" class="jpd-result">
          <span class="jpd-tag is-ok">добавлено {{ textResult.added.length }}</span>
          <span v-if="textResult.already.length" class="jpd-tag">
            уже было {{ textResult.already.length }}
          </span>
          <span v-if="textResult.unknown.length" class="jpd-tag is-bad">
            не нашлось: {{ textResult.unknown.join(" ") }}
          </span>
        </div>
      </section>

      <section class="jp-card">
        <h3>Свои наборы</h3>
        <div class="jp-row" style="margin-bottom: 10px">
          <input
            v-model="newName"
            class="jp-input"
            placeholder="Нечаева, урок 7"
            style="flex: 1; min-width: 180px"
            @keyup.enter="create"
          />
          <button class="jp-btn" :disabled="busy || !newName.trim()" @click="create">
            Создать
          </button>
        </div>

        <div v-if="!userDecks.length" class="jp-empty">Пока ни одного</div>
        <div v-else class="jpd-list">
          <div v-for="d in userDecks" :key="d.id" class="jpd-item">
            <label class="jp-check">
              <input
                type="checkbox"
                :checked="d.enabled"
                :disabled="busy"
                @change="patch(d, { enabled: !d.enabled })"
              />
              <b>{{ d.name }}</b>
            </label>
            <span class="jp-muted">{{ d.learned }}/{{ d.total }} · {{ progress(d) }}</span>
            <input
              class="jp-input jpd-weight"
              type="number"
              min="1"
              max="100"
              :value="d.weight"
              :disabled="busy"
              @change="patch(d, { weight: Number($event.target.value) })"
            />
            <span class="jp-muted jpd-share">{{ share(d) }}</span>
            <button class="jp-btn jp-btn-sm is-danger" :disabled="busy" @click="remove(d)">
              Удалить
            </button>
          </div>
        </div>
      </section>

      <section class="jp-card">
        <h3>Системные наборы</h3>
        <p class="jp-muted">
          Приходят импортом справочников. Удалить нельзя — можно выключить или сдвинуть вес.
        </p>
        <div class="jpd-list" style="margin-top: 10px">
          <div v-for="d in systemDecks" :key="d.id" class="jpd-item">
            <label class="jp-check">
              <input
                type="checkbox"
                :checked="d.enabled"
                :disabled="busy"
                @change="patch(d, { enabled: !d.enabled })"
              />
              <b>{{ d.name }}</b>
            </label>
            <span class="jp-muted">{{ d.learned }}/{{ d.total }} · {{ progress(d) }}</span>
            <input
              class="jp-input jpd-weight"
              type="number"
              min="1"
              max="100"
              :value="d.weight"
              :disabled="busy"
              @change="patch(d, { weight: Number($event.target.value) })"
            />
            <span class="jp-muted jpd-share">{{ share(d) }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.jpd {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.jpd-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jpd-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: 9px;
  background: #22242d;
  border: 1px solid #2a2d38;
}

.jpd-item .jp-check {
  flex: 1;
  min-width: 170px;
}

/* Вес — короткое поле: значение всегда двузначное. */
.jpd-weight {
  width: 68px;
  text-align: center;
}

.jpd-share {
  width: 92px;
  text-align: right;
}

.jpd-result {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.jpd-tag {
  font-size: 12px;
  border-radius: 999px;
  padding: 3px 10px;
  background: #22242d;
  border: 1px solid #2a2d38;
  color: #cfd3e0;
}

.jpd-tag.is-ok {
  border-color: rgba(99, 201, 79, 0.5);
  color: #9ee08c;
}

.jpd-tag.is-bad {
  border-color: rgba(229, 72, 77, 0.5);
  color: #ff9ea0;
}
</style>
