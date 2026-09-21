<script setup>
// Редактирование поездки: название, даты, валюта и курс, заметка.
//
// До этой формы поездку можно было только создать — поменять даты после
// покупки билетов было нечем.
//
// Самое тонкое здесь — смена даты начала. У уже спланированных дней два
// честных варианта судьбы, и какой нужен, знает только человек:
//   - «оставить план на своих датах»: билеты на руках, 12 ноября в teamLab —
//     это 12 ноября. Поездка растёт или укорачивается с краёв;
//   - «сдвинуть весь план»: даты перепутали, всё едет целиком, день 1
//     остаётся днём 1.
// Под каждым вариантом написан точный результат, а если какие-то дни с
// точками пропадут — форма говорит это до сохранения, а не после.
import { computed, ref } from "vue";
import { updateTrip } from "@/components/api.js";

const props = defineProps({
  trip: { type: Object, required: true },
});
const emit = defineEmits(["close", "saved"]);

const MAX_DAYS = 120;

const STATUSES = [
  { value: "draft", label: "Черновик" },
  { value: "planned", label: "Запланирована" },
  { value: "active", label: "Идёт" },
  { value: "done", label: "Завершена" },
  { value: "cancelled", label: "Отменена" },
];

// --- Даты строками YYYY-MM-DD: без часовых поясов, как их хранит бэкенд ---

function toUtc(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDays(iso, n) {
  const date = new Date(toUtc(iso) + n * 86400000);
  return date.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

function human(iso) {
  if (!iso) return "";
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${months[m - 1]}`;
}

function daysWord(n) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return `${n} дней`;
  if (last === 1) return `${n} день`;
  if (last >= 2 && last <= 4) return `${n} дня`;
  return `${n} дней`;
}

// «вместе с …» требует творительного падежа: с 1 точкой, с 21 точкой, но
// с 11 точками и с 6 точками.
function withPoints(n) {
  const last = n % 10;
  const tens = n % 100;
  if (last === 1 && tens !== 11) return `${n} точкой`;
  return `${n} точками`;
}

// --- Исходное состояние ---

const days = computed(() => props.trip?.days || []);
const oldStart = props.trip.startDate || "";
const oldCount = props.trip.daysCount || days.value.length || 1;
const oldEnd = props.trip.endDate || (oldStart ? addDays(oldStart, oldCount - 1) : "");

const form = ref({
  title: props.trip.title || "",
  status: props.trip.status || "draft",
  start: oldStart,
  localCurrency: props.trip.localCurrency || "",
  manualRate: props.trip.manualRate ?? "",
  rateNote: props.trip.rateNote || "",
  note: props.trip.note || "",
});

const mode = ref("keep");
const endManual = ref("");
const endEdited = ref(false);
const busy = ref(false);
const error = ref("");

// Дата начала поменялась у поездки, у которой даты уже были, — тогда и
// только тогда у дней есть выбор судьбы.
const startMoved = computed(() => Boolean(oldStart && form.value.start && form.value.start !== oldStart));
const delta = computed(() => (startMoved.value ? diffDays(oldStart, form.value.start) : 0));
const showModes = computed(() => startMoved.value && days.value.length > 0);

// Конец, который получится в каждом режиме, если человек его не трогал.
// Трогал — оба режима приходят ровно к его дате, разница лишь в том, куда
// поедет уже спланированное.
function endFor(which) {
  if (endEdited.value) return endManual.value;
  if (!form.value.start) return "";
  if (!oldStart) return addDays(form.value.start, oldCount - 1);
  if (which === "shift") return addDays(oldEnd, delta.value);
  return oldEnd;
}

// Поле «по» показывает то, что получится при выбранном режиме, пока его не
// трогали руками; тронули — держит введённое.
const end = computed({
  get: () => endFor(mode.value),
  set: (value) => {
    endManual.value = value;
    endEdited.value = true;
  },
});

function countFor(which) {
  const finish = endFor(which);
  if (!form.value.start || !finish) return oldCount;
  return diffDays(form.value.start, finish) + 1;
}

function pointsIn(day) {
  let total = 0;
  for (const variant of day.variants || []) {
    for (const step of variant.steps || []) total += (step.points || []).length;
  }
  return total;
}

// Какие дни пропадут при каждом режиме — считаем здесь, чтобы сказать об
// этом до сохранения. Сервер режет по тем же правилам.
function lostFor(which) {
  const count = countFor(which);
  if (which === "keep" && startMoved.value) {
    const finish = endFor("keep");
    return days.value.filter((d) => d.date && (d.date < form.value.start || d.date > finish));
  }
  // Сдвиг и правка одной только даты конца срезают дни с хвоста.
  return days.value.filter((d) => d.index > count);
}

function describe(which) {
  const count = countFor(which);
  const finish = endFor(which);
  const range = `${human(form.value.start)} — ${human(finish)}, ${daysWord(count)}`;
  if (which === "keep") {
    const added = Math.max(0, -delta.value);
    const tail = added ? `, добавлю ${daysWord(added)} в начало` : "";
    return `${range}${tail}. Всё запланированное остаётся на своих числах.`;
  }
  const shift = Math.abs(delta.value);
  const direction = delta.value < 0 ? "раньше" : "позже";
  return `${range}. Каждый день и города уедут на ${daysWord(shift)} ${direction}.`;
}

const lost = computed(() => lostFor(mode.value));
const lostPoints = computed(() => lost.value.reduce((sum, d) => sum + pointsIn(d), 0));
const lostText = computed(() => {
  if (!lost.value.length) return "";
  const numbers = lost.value.map((d) => d.index);
  const which = numbers.length === 1 ? `день ${numbers[0]}` : `дни ${numbers.join(", ")}`;
  const points = lostPoints.value ? ` вместе с ${withPoints(lostPoints.value)}` : "";
  return `Уберу ${which}${points}.`;
});

const resultCount = computed(() => countFor(showModes.value ? mode.value : "keep"));

async function save() {
  error.value = "";
  const title = form.value.title.trim();
  if (!title) {
    error.value = "Нужно название";
    return;
  }
  if (oldStart && !form.value.start) {
    error.value = "Укажи дату начала — убирать даты у поездки с планом нельзя";
    return;
  }
  const finish = end.value;
  if (form.value.start && finish && finish < form.value.start) {
    error.value = "Конец раньше начала";
    return;
  }
  const count = resultCount.value;
  if (count < 1 || count > MAX_DAYS) {
    error.value = `Поездка — от 1 до ${MAX_DAYS} дней`;
    return;
  }
  if (lostPoints.value && !confirm(`${lostText.value} Точно?`)) return;

  const rate = form.value.manualRate === "" || form.value.manualRate === null
    ? null
    : Number(form.value.manualRate);
  if (rate !== null && (Number.isNaN(rate) || rate <= 0)) {
    error.value = "Курс — положительное число, или оставь пустым";
    return;
  }

  busy.value = true;
  try {
    await updateTrip(props.trip.id, {
      // Ручка перезаписывает поездку целиком: всё, чего нет в форме,
      // передаём как было, иначе оно обнулится.
      countryId: props.trip.countryId,
      coverImage: props.trip.coverImage || "",
      datesConfirmed: props.trip.datesConfirmed || false,
      archived: props.trip.archived || false,

      title,
      status: form.value.status,
      note: form.value.note,
      startDate: form.value.start || null,
      daysCount: count,
      // Когда выбора не было (дата начала не менялась или двигать нечего),
      // шлём keep: число дней посчитано именно так, и сервер не станет
      // сдвигать города ради поездки без дней.
      dateMode: showModes.value ? mode.value : "keep",
      localCurrency: form.value.localCurrency.trim().toUpperCase(),
      manualRate: rate,
      rateNote: form.value.rateNote,
    });
    emit("saved");
  } catch (err) {
    error.value = err.message || "Не удалось сохранить";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="te-backdrop" @click.self="emit('close')">
    <form class="te" @submit.prevent="save">
      <h2>Поездка</h2>

      <label class="te-field">
        <span>Название</span>
        <input v-model="form.title" class="te-input" type="text" placeholder="Япония, ноябрь" />
      </label>

      <div class="te-row">
        <label class="te-field">
          <span>С</span>
          <input v-model="form.start" class="te-input" type="date" />
        </label>
        <label class="te-field">
          <span>По</span>
          <input v-model="end" class="te-input" type="date" :min="form.start" />
        </label>
      </div>

      <!-- Выбор судьбы уже спланированных дней: только когда дата начала
           действительно поехала и есть что двигать. -->
      <div v-if="showModes" class="te-modes">
        <label class="te-mode" :class="{ active: mode === 'keep' }">
          <input v-model="mode" type="radio" value="keep" />
          <div>
            <b>Оставить план на своих датах</b>
            <p>{{ describe("keep") }}</p>
          </div>
        </label>
        <label class="te-mode" :class="{ active: mode === 'shift' }">
          <input v-model="mode" type="radio" value="shift" />
          <div>
            <b>Сдвинуть весь план</b>
            <p>{{ describe("shift") }}</p>
          </div>
        </label>
      </div>
      <p v-else-if="form.start" class="te-summary">
        {{ human(form.start) }} — {{ human(end) }}, {{ daysWord(resultCount) }}
      </p>

      <p v-if="lostText" class="te-warn">
        <i class="mdi mdi-alert-circle"></i>
        <span>{{ lostText }}</span>
      </p>

      <label class="te-field">
        <span>Статус</span>
        <select v-model="form.status" class="te-input">
          <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </label>

      <div class="te-row">
        <label class="te-field te-field--narrow">
          <span>Валюта</span>
          <input v-model="form.localCurrency" class="te-input" type="text" maxlength="3" placeholder="JPY" />
        </label>
        <label class="te-field">
          <span>Курс, ₽ за единицу</span>
          <input
            v-model="form.manualRate"
            class="te-input"
            type="number"
            step="any"
            min="0"
            placeholder="пусто — курс ЦБ"
          />
        </label>
      </div>
      <label v-if="form.manualRate !== '' && form.manualRate !== null" class="te-field">
        <span>Откуда курс</span>
        <input v-model="form.rateNote" class="te-input" type="text" placeholder="курс карты +4%" />
      </label>

      <label class="te-field">
        <span>Заметка</span>
        <textarea v-model="form.note" class="te-input te-note" rows="3"></textarea>
      </label>

      <p v-if="error" class="te-error">{{ error }}</p>

      <div class="te-actions">
        <button type="button" class="te-ghost" @click="emit('close')">Отмена</button>
        <button type="submit" class="te-primary" :disabled="busy">
          {{ busy ? "Сохраняю…" : "Сохранить" }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.te-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 9, 13, 0.72);
}

.te {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 540px;
  max-height: 92vh;
  padding: 20px;
  overflow-y: auto;
  color: #eaeef7;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 16px;
}

.te h2 {
  margin: 0;
  font-size: 18px;
}

.te-row {
  display: flex;
  gap: 10px;
}

.te-field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.te-field--narrow {
  flex: 0 0 96px;
}

.te-field > span {
  font-size: 12px;
  color: #8b93a7;
}

.te-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c3243;
  border-radius: 9px;
  outline: none;
  color-scheme: dark;
}

.te-input:focus {
  border-color: #3d6fd6;
}

.te-note {
  resize: vertical;
}

.te-modes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.te-mode {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 13px;
  background: #12141a;
  border: 1px solid #2c3243;
  border-radius: 11px;
  cursor: pointer;
}

.te-mode.active {
  background: #152037;
  border-color: #1767fd;
}

.te-mode input {
  margin-top: 3px;
  accent-color: #1767fd;
}

.te-mode b {
  font-size: 14px;
}

.te-mode p {
  margin: 3px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: #9aa4b8;
}

.te-summary {
  margin: -4px 0 0;
  font-size: 13px;
  color: #8b93a7;
}

.te-warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.45;
  color: #f2c275;
  background: rgba(217, 155, 61, 0.1);
  border: 1px solid rgba(217, 155, 61, 0.35);
  border-radius: 9px;
}

.te-warn .mdi {
  margin-top: 2px;
  font-size: 15px;
}

.te-error {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  color: #ffb4b4;
  background: rgba(220, 70, 70, 0.12);
  border: 1px solid rgba(220, 70, 70, 0.3);
  border-radius: 9px;
}

.te-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.te-primary {
  padding: 10px 18px;
  font-size: 14px;
  color: #fff;
  background: #1767fd;
  border: none;
  border-radius: 9px;
  cursor: pointer;
}

.te-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.te-ghost {
  padding: 10px 16px;
  font-size: 14px;
  color: #8b93a7;
  background: transparent;
  border: 1px solid #2c3243;
  border-radius: 9px;
  cursor: pointer;
}

/* Телефон: поля дат в столбик — date-инпуты на 390px в ряд не помещаются. */
@media (max-width: 560px) {
  .te {
    padding: 16px;
  }

  .te-row {
    flex-direction: column;
  }

  .te-field--narrow {
    flex: 1;
  }

  .te-input {
    font-size: 16px; /* иначе iOS увеличивает страницу на фокусе */
  }
}
</style>
