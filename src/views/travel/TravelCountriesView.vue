<script setup>
// Список стран модуля «Путешествия».
// Страна держит вишлист, файлы и поездки — спецификация, раздел 1.
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  fetchCountries,
  createCountry,
  updateCountry,
  deleteCountry,
  suggestCountries,
} from "@/components/api.js";

const router = useRouter();

const countries = ref([]);
const loading = ref(true);
const error = ref("");
const showArchived = ref(false);

const addOpen = ref(false);
const adding = ref(false);
const addError = ref("");
const query = ref("");
const suggestions = ref([]);
const picked = ref(null);

const editing = ref(null);
const editForm = ref({ name: "", emoji: "", currency: "", coverImage: "", note: "" });

const visible = computed(() =>
  countries.value.filter((c) => showArchived.value || !c.archived),
);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    countries.value = await fetchCountries(true);
  } catch (e) {
    error.value = e.message || "не удалось загрузить страны";
  } finally {
    loading.value = false;
  }
}

async function openAdd() {
  addOpen.value = true;
  addError.value = "";
  query.value = "";
  picked.value = null;
  suggestions.value = await suggestCountries("");
}

let suggestTimer = null;
function onQueryInput() {
  picked.value = null;
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(async () => {
    try {
      suggestions.value = await suggestCountries(query.value);
    } catch {
      suggestions.value = [];
    }
  }, 200);
}

function pick(suggestion) {
  picked.value = suggestion;
  query.value = suggestion.name;
}

async function submitAdd() {
  const name = (picked.value?.name || query.value).trim();
  if (!name) {
    addError.value = "введи название страны";
    return;
  }
  adding.value = true;
  addError.value = "";
  try {
    // Границы страны подтягиваются на бэкенде — это поход в сеть, поэтому ждём.
    const created = await createCountry({
      name,
      code: picked.value?.code || "",
      emoji: picked.value?.emoji || "",
      currency: picked.value?.currency || "",
      timezone: picked.value?.timezone || "",
    });
    addOpen.value = false;
    router.push(`/travel/countries/${created.id}`);
  } catch (e) {
    addError.value = e.message || "не удалось создать страну";
  } finally {
    adding.value = false;
  }
}

function openEdit(country) {
  editing.value = country;
  editForm.value = {
    name: country.name,
    emoji: country.emoji,
    currency: country.currency,
    coverImage: country.coverImage,
    note: country.note,
  };
}

async function saveEdit() {
  if (!editing.value) return;
  try {
    await updateCountry(editing.value.id, {
      ...editing.value,
      ...editForm.value,
    });
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  }
}

async function toggleArchive(country) {
  await updateCountry(country.id, { ...country, archived: !country.archived });
  await load();
}

async function removeCountry(country) {
  const confirmed = window.confirm(
    `Удалить «${country.name}»? Вместе с ней удалятся вишлист, файлы и ${country.tripsCount} поездок.`,
  );
  if (!confirmed) return;
  await deleteCountry(country.id);
  await load();
}

onMounted(load);
</script>

<template>
  <div class="travel-countries">
    <header class="tc-header">
      <button class="tc-back" @click="router.push('/')">
        <i class="mdi mdi-arrow-left"></i>
      </button>
      <h1>Путешествия</h1>
      <div class="tc-header__actions">
        <label class="tc-toggle">
          <input v-model="showArchived" type="checkbox" />
          <span>архив</span>
        </label>
        <button class="tc-primary" @click="openAdd">
          <i class="mdi mdi-plus"></i>
          <span>Страна</span>
        </button>
      </div>
    </header>

    <p v-if="error" class="tc-error">{{ error }}</p>

    <div v-if="loading" class="tc-empty">Загружаю…</div>

    <div v-else-if="!visible.length" class="tc-empty">
      <p>Пока ни одной страны.</p>
      <p class="tc-empty__hint">
        Заведи страну — внутри будет вишлист мест и поездки с картой по дням.
      </p>
      <button class="tc-primary" @click="openAdd">Добавить страну</button>
    </div>

    <div v-else class="tc-grid">
      <article
        v-for="country in visible"
        :key="country.id"
        class="tc-card"
        :class="{ 'tc-card--archived': country.archived }"
        @click="router.push(`/travel/countries/${country.id}`)"
      >
        <div
          class="tc-card__cover"
          :style="country.coverImage ? { backgroundImage: `url(${country.coverImage})` } : {}"
        >
          <span class="tc-card__flag">{{ country.emoji || "🌍" }}</span>
          <div class="tc-card__menu" @click.stop>
            <button title="Изменить" @click="openEdit(country)">
              <i class="mdi mdi-pencil"></i>
            </button>
            <button :title="country.archived ? 'Вернуть' : 'В архив'" @click="toggleArchive(country)">
              <i class="mdi" :class="country.archived ? 'mdi-archive-arrow-up' : 'mdi-archive'"></i>
            </button>
            <button title="Удалить" @click="removeCountry(country)">
              <i class="mdi mdi-delete"></i>
            </button>
          </div>
        </div>

        <div class="tc-card__body">
          <h2>{{ country.name }}</h2>
          <div class="tc-card__stats">
            <span :title="'Поездок: ' + country.tripsCount">
              <i class="mdi mdi-bag-suitcase"></i>{{ country.tripsCount }}
            </span>
            <span :title="'Мест в вишлисте: ' + country.wishesCount">
              <i class="mdi mdi-heart-outline"></i>{{ country.wishesCount }}
            </span>
            <span :title="'Посещено: ' + country.visitedCount">
              <i class="mdi mdi-check-circle-outline"></i>{{ country.visitedCount }}
            </span>
            <span v-if="country.filesCount" :title="'Файлов: ' + country.filesCount">
              <i class="mdi mdi-paperclip"></i>{{ country.filesCount }}
            </span>
          </div>
          <div class="tc-card__meta">{{ country.currency }} · {{ country.code }}</div>
        </div>
      </article>
    </div>

    <!-- Добавление страны -->
    <div v-if="addOpen" class="tc-modal-backdrop" @click.self="addOpen = false">
      <div class="tc-modal">
        <h2>Новая страна</h2>
        <p class="tc-modal__hint">
          Границы и центр карты подтянутся сами — карта будет открываться на страну целиком.
        </p>

        <input
          v-model="query"
          class="tc-input"
          type="text"
          placeholder="Япония"
          autofocus
          @input="onQueryInput"
          @keydown.enter="submitAdd"
        />

        <div v-if="suggestions.length" class="tc-suggestions">
          <button
            v-for="s in suggestions.slice(0, 8)"
            :key="s.code"
            class="tc-suggestion"
            :class="{ active: picked?.code === s.code }"
            @click="pick(s)"
          >
            <span class="tc-suggestion__flag">{{ s.emoji }}</span>
            <span class="tc-suggestion__name">{{ s.name }}</span>
            <span class="tc-suggestion__currency">{{ s.currency }}</span>
          </button>
        </div>

        <p v-if="addError" class="tc-error">{{ addError }}</p>

        <div class="tc-modal__actions">
          <button class="tc-ghost" @click="addOpen = false">Отмена</button>
          <button class="tc-primary" :disabled="adding" @click="submitAdd">
            {{ adding ? "Ищу границы…" : "Создать" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Редактирование страны -->
    <div v-if="editing" class="tc-modal-backdrop" @click.self="editing = null">
      <div class="tc-modal">
        <h2>{{ editing.name }}</h2>
        <label class="tc-field">
          Название
          <input v-model="editForm.name" class="tc-input" type="text" />
        </label>
        <div class="tc-row">
          <label class="tc-field">
            Флаг
            <input v-model="editForm.emoji" class="tc-input" type="text" maxlength="8" />
          </label>
          <label class="tc-field">
            Валюта
            <input v-model="editForm.currency" class="tc-input" type="text" maxlength="8" />
          </label>
        </div>
        <label class="tc-field">
          Обложка (ссылка на картинку)
          <input v-model="editForm.coverImage" class="tc-input" type="text" />
        </label>
        <label class="tc-field">
          Заметка о стране — визы, транспорт, симки
          <textarea v-model="editForm.note" class="tc-input tc-textarea" rows="5"></textarea>
        </label>
        <div class="tc-modal__actions">
          <button class="tc-ghost" @click="editing = null">Отмена</button>
          <button class="tc-primary" @click="saveEdit">Сохранить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.travel-countries {
  /* #app — флекс с центрированием, поэтому экран растягиваем явно,
     иначе он схлопывается по ширине содержимого. */
  width: 100%;
  align-self: stretch;
  min-height: 100vh;
  padding: 24px 32px 64px;
  color: #eaeef7;
  background: #12141a;
}

.tc-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 28px;
}

.tc-header h1 {
  flex: 1;
  margin: 0;
  font-size: 26px;
  font-weight: 600;
}

.tc-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tc-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  color: #b9c0cf;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 10px;
  cursor: pointer;
}

.tc-back:hover {
  color: #fff;
  background: #232733;
}

.tc-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #8b93a7;
  cursor: pointer;
}

.tc-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  font-size: 14px;
  color: #fff;
  background: #1767fd;
  border: none;
  border-radius: 10px;
  cursor: pointer;
}

.tc-primary:hover {
  background: #2b78ff;
}

.tc-primary:disabled {
  background: #2f3441;
  color: #7b8296;
  cursor: default;
}

.tc-ghost {
  padding: 9px 16px;
  font-size: 14px;
  color: #b9c0cf;
  background: transparent;
  border: 1px solid #2c313d;
  border-radius: 10px;
  cursor: pointer;
}

.tc-ghost:hover {
  color: #fff;
  border-color: #3d4353;
}

.tc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 18px;
}

.tc-card {
  overflow: hidden;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 14px;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.tc-card:hover {
  transform: translateY(-2px);
  border-color: #1767fd;
}

.tc-card--archived {
  opacity: 0.5;
}

.tc-card__cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  background: linear-gradient(135deg, #232733, #1a1d26);
  background-size: cover;
  background-position: center;
}

.tc-card__flag {
  font-size: 46px;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.5));
}

.tc-card__menu {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tc-card:hover .tc-card__menu {
  opacity: 1;
}

.tc-card__menu button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: #cdd3e0;
  background: rgba(18, 20, 26, 0.85);
  border: none;
  border-radius: 7px;
  cursor: pointer;
}

.tc-card__menu button:hover {
  color: #fff;
  background: #1767fd;
}

.tc-card__body {
  padding: 14px 16px 16px;
}

.tc-card__body h2 {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;
}

.tc-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: #8b93a7;
}

.tc-card__stats span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tc-card__meta {
  margin-top: 10px;
  font-size: 12px;
  color: #5c6478;
}

.tc-empty {
  padding: 60px 20px;
  color: #8b93a7;
  text-align: center;
}

.tc-empty__hint {
  margin: 8px 0 20px;
  font-size: 14px;
}

.tc-error {
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #ff9d9f;
  background: rgba(229, 72, 77, 0.12);
  border-radius: 10px;
}

.tc-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(8, 9, 13, 0.72);
}

.tc-modal {
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  padding: 24px;
  overflow-y: auto;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 16px;
}

.tc-modal h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.tc-modal__hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: #8b93a7;
}

.tc-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.tc-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 10px;
  outline: none;
}

.tc-input:focus {
  border-color: #1767fd;
}

.tc-textarea {
  resize: vertical;
  font-family: inherit;
}

.tc-field {
  display: block;
  margin-top: 14px;
  font-size: 13px;
  color: #8b93a7;
}

.tc-field .tc-input {
  margin-top: 6px;
}

.tc-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.tc-suggestions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 10px;
  max-height: 260px;
  overflow-y: auto;
}

.tc-suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  font-size: 14px;
  color: #cdd3e0;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 9px;
  cursor: pointer;
}

.tc-suggestion:hover {
  background: #232733;
}

.tc-suggestion.active {
  background: #1767fd;
  color: #fff;
}

.tc-suggestion__flag {
  font-size: 20px;
}

.tc-suggestion__name {
  flex: 1;
}

.tc-suggestion__currency {
  font-size: 12px;
  opacity: 0.6;
}

@media (max-width: 720px) {
  .travel-countries {
    padding: 16px 14px 48px;
  }

  .tc-header {
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 20px;
  }

  .tc-header h1 {
    font-size: 21px;
  }

  .tc-header__actions {
    width: 100%;
    justify-content: space-between;
  }

  .tc-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }

  .tc-card__cover {
    height: 90px;
  }

  .tc-card__flag {
    font-size: 36px;
  }

  /* На телефоне ховера нет — кнопки карточки показываем всегда. */
  .tc-card__menu {
    opacity: 1;
  }

  .tc-row {
    grid-template-columns: 1fr;
  }
}
</style>
