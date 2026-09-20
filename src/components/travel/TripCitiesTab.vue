<script setup>
// Города поездки: с какого по какое число где находишься.
//
// Слой описательный — ничего не считает и ни на что не влияет. Нужен, чтобы,
// глядя на ленту дней, было видно, в каком городе идёт день: в двухнедельной
// поездке по трём городам это не удерживается в голове.
//
// Отрезки могут перекрываться намеренно. День переезда принадлежит обоим
// городам, и в ленте дней он подписан «Токио → Киото» — это честнее, чем
// заставлять выбирать, где ты в день, который целиком в поезде.
import { ref, computed } from "vue";
import { createTripCity, updateTripCity, deleteTripCity } from "@/components/api.js";

const props = defineProps({
  trip: { type: Object, required: true },
});
const emit = defineEmits(["changed"]);

const busy = ref(false);
const error = ref("");
const editingId = ref("");

const blank = () => ({ name: "", fromDate: "", toDate: "", emoji: "", note: "" });
const form = ref(blank());

const cities = computed(() => props.trip?.cities || []);
const days = computed(() => props.trip?.days || []);

// Границы поездки — чтобы поля дат не пускали за её пределы и подсказывали,
// с чего начать.
const tripFrom = computed(() => days.value[0]?.date || props.trip?.startDate || "");
const tripTo = computed(() => days.value[days.value.length - 1]?.date || "");

// Сколько дней поездки остались без города — единственная «аналитика» здесь,
// и та нужна только чтобы не забыть кусок поездки.
const daysWithoutCity = computed(() => days.value.filter((d) => d.date && !d.city).length);

function formatDate(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

function rangeLabel(city) {
  if (!city.fromDate) return "даты не выбраны";
  if (!city.toDate || city.toDate === city.fromDate) return formatDate(city.fromDate);
  return `${formatDate(city.fromDate)} — ${formatDate(city.toDate)}`;
}

function nightsLabel(count) {
  if (!count) return "";
  const last = count % 10;
  const tens = count % 100;
  if (tens >= 11 && tens <= 14) return `${count} ночей`;
  if (last === 1) return `${count} ночь`;
  if (last >= 2 && last <= 4) return `${count} ночи`;
  return `${count} ночей`;
}

// Какие дни поездки попадают в этот город — показываем номерами, так проще
// сверить с лентой дней, чем по датам.
function daysOf(city) {
  if (!city.fromDate) return [];
  const to = city.toDate || city.fromDate;
  return days.value
    .filter((d) => d.date && d.date >= city.fromDate && d.date <= to)
    .map((d) => d.index);
}

function daysLabel(city) {
  const list = daysOf(city);
  if (!list.length) return "";
  if (list.length === 1) return `день ${list[0]}`;
  return `дни ${list[0]}–${list[list.length - 1]}`;
}

function startAdd() {
  editingId.value = "new";
  // Новый город начинается там, где кончился предыдущий: в поездке города
  // идут встык, и переписывать дату каждый раз руками незачем.
  const last = cities.value[cities.value.length - 1];
  form.value = {
    ...blank(),
    fromDate: last?.toDate || tripFrom.value || "",
    toDate: "",
  };
}

function startEdit(city) {
  editingId.value = city.id;
  form.value = {
    name: city.name,
    fromDate: city.fromDate || "",
    toDate: city.toDate || "",
    emoji: city.emoji || "",
    note: city.note || "",
  };
}

function cancel() {
  editingId.value = "";
  form.value = blank();
  error.value = "";
}

async function save() {
  const name = form.value.name.trim();
  if (!name) {
    error.value = "Не указан город";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const payload = {
      name,
      fromDate: form.value.fromDate || null,
      toDate: form.value.toDate || null,
      emoji: form.value.emoji.trim(),
      note: form.value.note,
    };
    if (editingId.value === "new") {
      await createTripCity(props.trip.id, payload);
    } else {
      await updateTripCity(editingId.value, payload);
    }
    cancel();
    emit("changed");
  } catch (err) {
    error.value = err.message || "Не удалось сохранить";
  } finally {
    busy.value = false;
  }
}

async function remove(city) {
  if (!confirm(`Убрать ${city.name} из поездки?`)) return;
  busy.value = true;
  try {
    await deleteTripCity(city.id);
    emit("changed");
  } catch (err) {
    error.value = err.message || "Не удалось убрать город";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="tc">
    <p class="tc-hint">
      Где ты в какие дни. Ни на что не влияет — просто в ленте дней будет видно,
      что день третий это Токио, а день девятый уже Киото.
    </p>

    <p v-if="error" class="tc-error" @click="error = ''">{{ error }}</p>

    <div v-if="!cities.length && editingId !== 'new'" class="tc-empty">
      <p>Города ещё не заведены.</p>
      <button class="tc-primary" @click="startAdd">
        <i class="mdi mdi-plus"></i><span>Добавить город</span>
      </button>
    </div>

    <ul v-else class="tc-list">
      <li v-for="city in cities" :key="city.id" class="tc-city">
        <template v-if="editingId === city.id">
          <form class="tc-form" @submit.prevent="save">
            <div class="tc-form__row">
              <input v-model="form.emoji" class="tc-emoji" placeholder="🗼" maxlength="4" />
              <input v-model="form.name" class="tc-input" placeholder="Город" autofocus />
            </div>
            <div class="tc-form__row">
              <label class="tc-field">
                <span>с</span>
                <input v-model="form.fromDate" type="date" :min="tripFrom" :max="tripTo" />
              </label>
              <label class="tc-field">
                <span>по</span>
                <input v-model="form.toDate" type="date" :min="form.fromDate || tripFrom" :max="tripTo" />
              </label>
            </div>
            <textarea v-model="form.note" class="tc-input tc-note" rows="2" placeholder="Заметка"></textarea>
            <div class="tc-form__actions">
              <button type="button" class="tc-ghost" @click="cancel">Отмена</button>
              <button type="submit" class="tc-primary" :disabled="busy">Сохранить</button>
            </div>
          </form>
        </template>

        <template v-else>
          <span class="tc-city__flag">{{ city.emoji || "📍" }}</span>
          <div class="tc-city__body">
            <div class="tc-city__title">
              <b>{{ city.name }}</b>
              <span class="tc-city__range">{{ rangeLabel(city) }}</span>
            </div>
            <div class="tc-city__meta">
              <span v-if="daysLabel(city)">{{ daysLabel(city) }}</span>
              <span v-if="city.nights">{{ nightsLabel(city.nights) }}</span>
              <span v-if="!city.fromDate" class="tc-city__warn">не поставлен в расписание</span>
            </div>
            <p v-if="city.note" class="tc-city__note">{{ city.note }}</p>
          </div>
          <div class="tc-city__actions">
            <button title="Изменить" @click="startEdit(city)">
              <i class="mdi mdi-pencil"></i>
            </button>
            <button title="Убрать" @click="remove(city)">
              <i class="mdi mdi-delete"></i>
            </button>
          </div>
        </template>
      </li>

      <li v-if="editingId === 'new'" class="tc-city">
        <form class="tc-form" @submit.prevent="save">
          <div class="tc-form__row">
            <input v-model="form.emoji" class="tc-emoji" placeholder="🗼" maxlength="4" />
            <input v-model="form.name" class="tc-input" placeholder="Город" autofocus />
          </div>
          <div class="tc-form__row">
            <label class="tc-field">
              <span>с</span>
              <input v-model="form.fromDate" type="date" :min="tripFrom" :max="tripTo" />
            </label>
            <label class="tc-field">
              <span>по</span>
              <input v-model="form.toDate" type="date" :min="form.fromDate || tripFrom" :max="tripTo" />
            </label>
          </div>
          <textarea v-model="form.note" class="tc-input tc-note" rows="2" placeholder="Заметка"></textarea>
          <div class="tc-form__actions">
            <button type="button" class="tc-ghost" @click="cancel">Отмена</button>
            <button type="submit" class="tc-primary" :disabled="busy">Добавить</button>
          </div>
        </form>
      </li>
    </ul>

    <div v-if="cities.length && editingId !== 'new'" class="tc-footer">
      <button class="tc-primary" @click="startAdd">
        <i class="mdi mdi-plus"></i><span>Ещё город</span>
      </button>
      <span v-if="daysWithoutCity" class="tc-footer__note">
        дней без города: {{ daysWithoutCity }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.tc {
  flex: 1;
  padding: 16px 20px 60px;
  overflow-y: auto;
  color: #eaeef7;
}

.tc-hint {
  max-width: 560px;
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: #6e7688;
}

.tc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 640px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tc-city {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: #171a22;
  border: 1px solid #232733;
  border-radius: 12px;
}

.tc-city__flag {
  font-size: 22px;
  line-height: 1.2;
}

.tc-city__body {
  flex: 1;
  min-width: 0;
}

.tc-city__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
}

.tc-city__title b {
  font-size: 15px;
}

.tc-city__range {
  font-size: 13px;
  color: #8b93a7;
}

.tc-city__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 3px;
  font-size: 12px;
  color: #6e7688;
}

.tc-city__warn {
  color: #d99b3d;
}

.tc-city__note {
  margin: 6px 0 0;
  font-size: 13px;
  color: #9aa4b8;
  white-space: pre-wrap;
}

.tc-city__actions {
  display: flex;
  gap: 4px;
}

.tc-city__actions button {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #8b93a7;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}

.tc-city__actions button:hover {
  color: #eaeef7;
  background: #1f2430;
  border-color: #2c3243;
}

/* Форма */

.tc-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.tc-form__row {
  display: flex;
  gap: 8px;
}

.tc-input,
.tc-emoji {
  padding: 9px 12px;
  font-size: 14px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c3243;
  border-radius: 9px;
  outline: none;
}

.tc-input {
  flex: 1;
  min-width: 0;
}

.tc-emoji {
  width: 56px;
  text-align: center;
}

.tc-note {
  resize: vertical;
  font-family: inherit;
}

.tc-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #12141a;
  border: 1px solid #2c3243;
  border-radius: 9px;
}

.tc-field span {
  font-size: 12px;
  color: #6e7688;
}

.tc-field input {
  flex: 1;
  min-width: 0;
  padding: 9px 0;
  font-size: 14px;
  color: #eaeef7;
  background: transparent;
  border: none;
  outline: none;
  color-scheme: dark;
}

.tc-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Кнопки и состояния */

.tc-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  font-size: 13px;
  color: #fff;
  background: #1767fd;
  border: none;
  border-radius: 9px;
  cursor: pointer;
}

.tc-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.tc-ghost {
  padding: 9px 14px;
  font-size: 13px;
  color: #8b93a7;
  background: transparent;
  border: 1px solid #2c3243;
  border-radius: 9px;
  cursor: pointer;
}

.tc-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 640px;
  margin-top: 12px;
}

.tc-footer__note {
  font-size: 12px;
  color: #6e7688;
}

.tc-empty {
  max-width: 560px;
  padding: 28px 20px;
  text-align: center;
  color: #6e7688;
  background: #171a22;
  border: 1px dashed #2c3243;
  border-radius: 12px;
}

.tc-empty p {
  margin: 0 0 14px;
}

.tc-error {
  max-width: 640px;
  margin: 0 0 12px;
  padding: 10px 14px;
  font-size: 13px;
  color: #ffb4b4;
  background: rgba(220, 70, 70, 0.12);
  border: 1px solid rgba(220, 70, 70, 0.3);
  border-radius: 9px;
  cursor: pointer;
}

@media (max-width: 900px) {
  .tc {
    padding: 14px 12px 40px;
  }

  .tc-form__row {
    flex-wrap: wrap;
  }
}
</style>
