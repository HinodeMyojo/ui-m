<script setup>
// Карточка точки в колонке-«алгоритме» дня.
//
// Свёрнутая — строка маршрута: номер шага, время, название, стоимость, статус.
// Развёрнутая — всё остальное: описание, подпункты, объекты поблизости, файлы,
// бронь и правка полей. Спецификация: docs/travel-module.md, раздел 4.
import { ref, computed, watch } from "vue";
import {
  updatePoint,
  createSubPoint,
  updateSubPoint,
  deleteSubPoint,
  createNearby,
  deleteNearby,
  uploadPointFile,
  deletePointFile,
  searchPlaces,
} from "@/components/api.js";

const props = defineProps({
  point: { type: Object, required: true },
  category: { type: Object, default: null },
  categories: { type: Array, default: () => [] },
  trip: { type: Object, required: true },
  index: { type: Number, default: 0 },
  isFork: { type: Boolean, default: false },
  isChosen: { type: Boolean, default: false },
  isMain: { type: Boolean, default: true },
  selected: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  days: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "select", "toggle", "choose", "remove", "to-wishlist", "move-day", "changed",
]);

const STATUSES = [
  { key: "plan", label: "План", icon: "mdi-circle-outline", color: "#8b93a7" },
  { key: "confirmed", label: "Подтверждено", icon: "mdi-ticket-confirmation", color: "#1767fd" },
  { key: "visited", label: "Посещено", icon: "mdi-check-circle", color: "#22c55e" },
  { key: "skipped", label: "Пропущено", icon: "mdi-close-circle", color: "#e5484d" },
];

const editing = ref(false);
const form = ref({});
const saving = ref(false);
const newSub = ref("");
const nearbyQuery = ref("");
const nearbyResults = ref([]);
const nearbyOpen = ref(false);
const fileInput = ref(null);
const moveOpen = ref(false);

const status = computed(() => STATUSES.find((s) => s.key === props.point.status) || STATUSES[0]);

const timeLabel = computed(() => {
  const point = props.point;
  if (point.plannedStartMin != null && point.plannedStartMin >= 0) {
    return formatTime(point.plannedStartMin);
  }
  if (point.softTime) {
    return { morning: "утро", day: "день", evening: "вечер" }[point.softTime] || "";
  }
  return "";
});

const doneSubs = computed(() => props.point.subPoints.filter((s) => s.done).length);

function formatTime(minutes) {
  if (minutes == null || minutes < 0) return "";
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function parseTime(value) {
  if (!value) return -1;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h)) return -1;
  return h * 60 + (m || 0);
}

function money(amount, currency) {
  if (amount == null) return "";
  return `${Math.round(amount * 100) / 100} ${currency || ""}`.trim();
}

function resetForm() {
  form.value = {
    ...props.point,
    links: props.point.links ? props.point.links.map((l) => ({ ...l })) : [],
  };
}

watch(() => props.expanded, (value) => {
  if (!value) editing.value = false;
});

function startEdit() {
  resetForm();
  editing.value = true;
}

async function save() {
  saving.value = true;
  try {
    await updatePoint(props.point.id, form.value);
    editing.value = false;
    emit("changed");
  } finally {
    saving.value = false;
  }
}

async function setStatus(key) {
  await updatePoint(props.point.id, { ...props.point, status: key });
  emit("changed");
}

// --- Подпункты ---

async function addSub() {
  if (!newSub.value.trim()) return;
  await createSubPoint(props.point.id, { title: newSub.value.trim() });
  newSub.value = "";
  emit("changed");
}

async function toggleSub(sub) {
  await updateSubPoint(sub.id, { ...sub, done: !sub.done });
  emit("changed");
}

async function removeSub(sub) {
  await deleteSubPoint(sub.id);
  emit("changed");
}

// --- Интересное поблизости ---

let nearbyTimer = null;
function onNearbyInput() {
  clearTimeout(nearbyTimer);
  if (!nearbyQuery.value.trim()) {
    nearbyResults.value = [];
    return;
  }
  nearbyTimer = setTimeout(async () => {
    try {
      nearbyResults.value = await searchPlaces(nearbyQuery.value, props.trip.countryId, 6);
    } catch {
      nearbyResults.value = [];
    }
  }, 500);
}

async function addNearby(place) {
  await createNearby(props.point.id, {
    title: place.title,
    lat: place.lat,
    lng: place.lng,
    url: "",
    note: place.address || "",
  });
  nearbyQuery.value = "";
  nearbyResults.value = [];
  nearbyOpen.value = false;
  emit("changed");
}

async function addNearbyManual() {
  if (!nearbyQuery.value.trim()) return;
  await createNearby(props.point.id, { title: nearbyQuery.value.trim() });
  nearbyQuery.value = "";
  nearbyOpen.value = false;
  emit("changed");
}

async function removeNearby(item) {
  await deleteNearby(item.id);
  emit("changed");
}

// --- Файлы: билеты, брони, сканы ---

async function onFilePicked(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  await uploadPointFile(props.point.id, file);
  event.target.value = "";
  emit("changed");
}

async function removeFile(file) {
  await deletePointFile(file.id);
  emit("changed");
}

function addLink() {
  form.value.links.push({ url: "", title: "" });
}
</script>

<template>
  <div
    class="tpc"
    :class="{
      'tpc--selected': selected,
      'tpc--dim': isFork && !isMain,
      'tpc--skipped': point.status === 'skipped',
    }"
    @click="emit('select')"
  >
    <div class="tpc__row" @click="emit('toggle')">
      <span
        class="tpc__index"
        :style="{ background: category?.color || '#2c313d' }"
        :title="category?.name || ''"
      >
        <i v-if="category" class="mdi" :class="category.icon"></i>
        <template v-else>{{ index }}</template>
      </span>

      <div class="tpc__main">
        <div class="tpc__title">
          <span v-if="timeLabel" class="tpc__time">{{ timeLabel }}</span>
          {{ point.title || "без названия" }}
          <i v-if="point.wishId" class="mdi mdi-heart tpc__wish" title="из вишлиста страны"></i>
        </div>
        <div class="tpc__meta">
          <span v-if="point.plannedDuration" class="tpc__chip">{{ point.plannedDuration }} мин</span>
          <span v-if="point.costAmount" class="tpc__chip">
            {{ money(point.costAmount, point.costCurrency) }}
            <em v-if="point.costCurrency !== 'RUB' && point.costRub">
              ≈ {{ Math.round(point.costRub) }} ₽
            </em>
          </span>
          <span v-if="point.subPoints.length" class="tpc__chip">
            <i class="mdi mdi-format-list-checks"></i>{{ doneSubs }}/{{ point.subPoints.length }}
          </span>
          <span v-if="point.nearby.length" class="tpc__chip">
            <i class="mdi mdi-shopping-outline"></i>{{ point.nearby.length }}
          </span>
          <span v-if="point.files.length" class="tpc__chip">
            <i class="mdi mdi-paperclip"></i>{{ point.files.length }}
          </span>
          <span v-if="point.lat == null" class="tpc__chip tpc__chip--warn">без карты</span>
        </div>
      </div>

      <button
        class="tpc__status"
        :style="{ color: status.color }"
        :title="status.label"
        @click.stop="setStatus(point.status === 'visited' ? 'plan' : 'visited')"
      >
        <i class="mdi" :class="status.icon"></i>
      </button>
    </div>

    <!-- Развилка: отметить пройденную ветку -->
    <button
      v-if="isFork"
      class="tpc__choose"
      :class="{ active: isChosen }"
      @click.stop="emit('choose')"
    >
      <i class="mdi" :class="isChosen ? 'mdi-check-decagram' : 'mdi-decagram-outline'"></i>
      {{ isChosen ? "этот путь я прошёл" : "отметить как пройденный" }}
    </button>

    <div v-if="expanded" class="tpc__body" @click.stop>
      <!-- Просмотр -->
      <template v-if="!editing">
        <p v-if="point.address" class="tpc__address">{{ point.address }}</p>
        <p v-if="point.description" class="tpc__description">{{ point.description }}</p>
        <p v-if="point.bookingRef" class="tpc__booking">
          <i class="mdi mdi-ticket-confirmation-outline"></i> бронь: {{ point.bookingRef }}
        </p>
        <p v-if="point.skipReason" class="tpc__skip">не сложилось: {{ point.skipReason }}</p>
        <p v-if="point.factNote" class="tpc__fact">по факту: {{ point.factNote }}</p>

        <div v-if="point.links.length" class="tpc__links">
          <a v-for="(link, i) in point.links" :key="i" :href="link.url" target="_blank" rel="noopener">
            <i class="mdi mdi-link-variant"></i>{{ link.title || link.url }}
          </a>
        </div>

        <!-- Подпункты: «купить JR Pass», «камера хранения B1» -->
        <div class="tpc__section">
          <div class="tpc__section-head">Подпункты</div>
          <div v-for="sub in point.subPoints" :key="sub.id" class="tpc__sub">
            <button class="tpc__check" @click="toggleSub(sub)">
              <i class="mdi" :class="sub.done ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'"></i>
            </button>
            <span :class="{ done: sub.done }">{{ sub.title }}</span>
            <span v-if="sub.costAmount" class="tpc__sub-cost">
              {{ money(sub.costAmount, sub.costCurrency) }}
            </span>
            <button class="tpc__x" @click="removeSub(sub)"><i class="mdi mdi-close"></i></button>
          </div>
          <div class="tpc__inline-add">
            <input
              v-model="newSub"
              class="tpc__input"
              type="text"
              placeholder="что сделать в этом месте"
              @keydown.enter="addSub"
            />
            <button class="tpc__mini" @click="addSub"><i class="mdi mdi-plus"></i></button>
          </div>
        </div>

        <!-- Интересное поблизости: свои маркеры на карте -->
        <div class="tpc__section">
          <div class="tpc__section-head">
            Поблизости
            <button class="tpc__mini" @click="nearbyOpen = !nearbyOpen">
              <i class="mdi mdi-plus"></i>
            </button>
          </div>
          <div v-for="item in point.nearby" :key="item.id" class="tpc__sub">
            <i class="mdi mdi-shopping-outline tpc__nearby-icon"></i>
            <span>{{ item.title }}</span>
            <button class="tpc__x" @click="removeNearby(item)"><i class="mdi mdi-close"></i></button>
          </div>
          <div v-if="nearbyOpen" class="tpc__inline-add">
            <input
              v-model="nearbyQuery"
              class="tpc__input"
              type="text"
              placeholder="магазин, кафе рядом"
              @input="onNearbyInput"
              @keydown.enter="addNearbyManual"
            />
            <button class="tpc__mini" @click="addNearbyManual"><i class="mdi mdi-plus"></i></button>
          </div>
          <ul v-if="nearbyResults.length" class="tpc__results">
            <li v-for="place in nearbyResults" :key="place.externalId + place.lat" @click="addNearby(place)">
              {{ place.title }}
            </li>
          </ul>
        </div>

        <!-- Файлы: билеты, брони, сканы -->
        <div class="tpc__section">
          <div class="tpc__section-head">
            Файлы
            <button class="tpc__mini" @click="fileInput.click()"><i class="mdi mdi-upload"></i></button>
            <input ref="fileInput" type="file" hidden @change="onFilePicked" />
          </div>
          <div v-for="file in point.files" :key="file.id" class="tpc__sub">
            <i class="mdi mdi-file-document-outline"></i>
            <a :href="file.url" target="_blank" rel="noopener">{{ file.title || file.filename }}</a>
            <button class="tpc__x" @click="removeFile(file)"><i class="mdi mdi-close"></i></button>
          </div>
        </div>

        <div class="tpc__statuses">
          <button
            v-for="s in STATUSES"
            :key="s.key"
            :class="{ active: point.status === s.key }"
            :style="point.status === s.key ? { background: s.color, borderColor: s.color } : {}"
            @click="setStatus(s.key)"
          >
            {{ s.label }}
          </button>
        </div>

        <div class="tpc__actions">
          <button @click="startEdit"><i class="mdi mdi-pencil"></i> Изменить</button>
          <button @click="moveOpen = !moveOpen"><i class="mdi mdi-calendar-arrow-right"></i> В другой день</button>
          <button @click="emit('to-wishlist')" title="Убрать из маршрута, оставив место в вишлисте">
            <i class="mdi mdi-heart-outline"></i> В вишлист
          </button>
          <button class="danger" @click="emit('remove')"><i class="mdi mdi-delete"></i></button>
        </div>

        <div v-if="moveOpen" class="tpc__days">
          <button v-for="day in days" :key="day.id" @click="emit('move-day', day); moveOpen = false">
            {{ day.index }}
          </button>
        </div>
      </template>

      <!-- Правка -->
      <template v-else>
        <p v-if="point.wishId" class="tpc__note">
          Место из вишлиста: название, описание и координаты сохранятся в вишлист страны
          и обновятся во всех поездках.
        </p>

        <label class="tpc__field">
          Название
          <input v-model="form.title" class="tpc__input" type="text" />
        </label>

        <div class="tpc__row">
          <label class="tpc__field">
            Начало
            <input
              class="tpc__input"
              type="time"
              :value="formatTime(form.plannedStartMin)"
              @input="form.plannedStartMin = parseTime($event.target.value)"
            />
          </label>
          <label class="tpc__field">
            Длительность, мин
            <input v-model.number="form.plannedDuration" class="tpc__input" type="number" min="0" />
          </label>
        </div>

        <div class="tpc__row">
          <label class="tpc__field">
            Мягкое время
            <select v-model="form.softTime" class="tpc__input">
              <option value="">—</option>
              <option value="morning">утро</option>
              <option value="day">день</option>
              <option value="evening">вечер</option>
            </select>
          </label>
          <label class="tpc__field">
            Тип
            <select v-model="form.categoryId" class="tpc__input">
              <option :value="null">— без типа —</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
        </div>

        <!-- Два поля суммы: рубли без пересчёта, местная валюта — с пересчётом -->
        <div class="tpc__row">
          <label class="tpc__field">
            Стоимость, {{ trip.localCurrency }}
            <input
              class="tpc__input"
              type="number"
              step="0.01"
              :value="form.costCurrency === trip.localCurrency ? form.costAmount : null"
              @input="
                form.costAmount = $event.target.value === '' ? null : Number($event.target.value);
                form.costCurrency = trip.localCurrency;
              "
            />
          </label>
          <label class="tpc__field">
            Стоимость, ₽
            <input
              class="tpc__input"
              type="number"
              step="0.01"
              :value="form.costCurrency === 'RUB' ? form.costAmount : null"
              @input="
                form.costAmount = $event.target.value === '' ? null : Number($event.target.value);
                form.costCurrency = 'RUB';
              "
            />
          </label>
        </div>

        <label class="tpc__field">
          Адрес
          <input v-model="form.address" class="tpc__input" type="text" />
        </label>

        <div class="tpc__row">
          <label class="tpc__field">
            Широта
            <input v-model.number="form.lat" class="tpc__input" type="number" step="0.000001" />
          </label>
          <label class="tpc__field">
            Долгота
            <input v-model.number="form.lng" class="tpc__input" type="number" step="0.000001" />
          </label>
        </div>

        <label class="tpc__field">
          Описание
          <textarea v-model="form.description" class="tpc__input tpc__textarea" rows="4"></textarea>
        </label>

        <label class="tpc__field">
          Номер брони
          <input v-model="form.bookingRef" class="tpc__input" type="text" />
        </label>

        <div class="tpc__field">
          Ссылки
          <div v-for="(link, i) in form.links" :key="i" class="tpc__inline-add">
            <input v-model="link.title" class="tpc__input" type="text" placeholder="название" />
            <input v-model="link.url" class="tpc__input" type="text" placeholder="https://" />
            <button class="tpc__mini" @click="form.links.splice(i, 1)"><i class="mdi mdi-close"></i></button>
          </div>
          <button class="tpc__mini" @click="addLink"><i class="mdi mdi-plus"></i> ссылка</button>
        </div>

        <label class="tpc__field">
          Как оно было по факту
          <input v-model="form.factNote" class="tpc__input" type="text" />
        </label>

        <label v-if="form.status === 'skipped'" class="tpc__field">
          Почему пропустили
          <input v-model="form.skipReason" class="tpc__input" type="text" placeholder="было закрыто" />
        </label>

        <div class="tpc__actions">
          <button @click="editing = false">Отмена</button>
          <button class="primary" :disabled="saving" @click="save">
            {{ saving ? "Сохраняю…" : "Сохранить" }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tpc {
  margin-bottom: 3px;
  background: #1b1e27;
  border: 1px solid transparent;
  border-radius: 11px;
  cursor: pointer;
}

.tpc:hover {
  border-color: #333846;
}

.tpc--selected {
  border-color: #1767fd;
  background: #1d2331;
}

.tpc--dim {
  opacity: 0.62;
}

.tpc--skipped .tpc__title {
  text-decoration: line-through;
  opacity: 0.7;
}

.tpc__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tpc > .tpc__row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
}

.tpc__index {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  font-size: 12px;
  color: #fff;
  border-radius: 8px;
}

.tpc__main {
  flex: 1;
  min-width: 0;
}

.tpc__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.tpc__time {
  font-weight: 600;
  color: #1767fd;
}

.tpc__wish {
  font-size: 12px;
  color: #e5484d;
}

.tpc__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 3px;
  font-size: 11px;
  color: #6e7688;
}

.tpc__chip {
  display: flex;
  align-items: center;
  gap: 3px;
}

.tpc__chip em {
  font-style: normal;
  opacity: 0.7;
}

.tpc__chip--warn {
  color: #a9843a;
}

.tpc__status {
  flex-shrink: 0;
  padding: 4px;
  font-size: 18px;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tpc__choose {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - 20px);
  padding: 5px 9px;
  margin: 0 10px 8px;
  font-size: 11px;
  color: #8b93a7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 8px;
  cursor: pointer;
}

.tpc__choose.active {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.5);
}

.tpc__body {
  padding: 0 10px 10px;
  border-top: 1px solid #232733;
  cursor: default;
}

.tpc__address,
.tpc__description,
.tpc__booking,
.tpc__skip,
.tpc__fact,
.tpc__note {
  margin: 8px 0 0;
  font-size: 12px;
  color: #b9c0cf;
  white-space: pre-wrap;
}

.tpc__address {
  color: #6e7688;
}

.tpc__skip {
  color: #ff9d9f;
}

.tpc__fact {
  color: #86d68b;
}

.tpc__note {
  padding: 7px 9px;
  color: #8b93a7;
  background: rgba(23, 103, 253, 0.09);
  border-radius: 8px;
}

.tpc__links {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
}

.tpc__links a {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #1767fd;
  text-decoration: none;
}

.tpc__section {
  margin-top: 12px;
}

.tpc__section-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  font-size: 11px;
  color: #6e7688;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tpc__sub {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  font-size: 12px;
  color: #cdd3e0;
}

.tpc__sub span {
  flex: 1;
}

.tpc__sub a {
  flex: 1;
  color: #cdd3e0;
  text-decoration: none;
}

.tpc__sub a:hover {
  color: #1767fd;
}

.tpc__sub .done {
  color: #6e7688;
  text-decoration: line-through;
}

.tpc__sub-cost {
  flex: none !important;
  font-size: 11px;
  color: #6e7688;
}

.tpc__nearby-icon {
  color: #6e7688;
}

.tpc__check,
.tpc__x,
.tpc__mini {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 5px;
  font-size: 12px;
  color: #6e7688;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.tpc__check:hover,
.tpc__x:hover,
.tpc__mini:hover {
  color: #eaeef7;
  background: #232733;
}

.tpc__inline-add {
  display: flex;
  gap: 5px;
  margin-top: 5px;
}

.tpc__input {
  width: 100%;
  padding: 6px 9px;
  font-size: 12px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 8px;
  outline: none;
}

.tpc__input:focus {
  border-color: #1767fd;
}

.tpc__textarea {
  font-family: inherit;
  resize: vertical;
}

.tpc__field {
  display: block;
  margin-top: 9px;
  font-size: 11px;
  color: #6e7688;
}

.tpc__field .tpc__input {
  margin-top: 3px;
}

.tpc__results {
  padding: 0;
  margin: 5px 0 0;
  list-style: none;
}

.tpc__results li {
  padding: 6px 9px;
  margin-bottom: 3px;
  font-size: 12px;
  background: #12141a;
  border-radius: 7px;
  cursor: pointer;
}

.tpc__results li:hover {
  background: #232733;
}

.tpc__statuses {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 12px;
}

.tpc__statuses button {
  padding: 5px 10px;
  font-size: 11px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 999px;
  cursor: pointer;
}

.tpc__statuses button.active {
  color: #fff;
}

.tpc__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 12px;
}

.tpc__actions button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 11px;
  font-size: 12px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 8px;
  cursor: pointer;
}

.tpc__actions button:hover {
  color: #fff;
  border-color: #3d4353;
}

.tpc__actions .primary {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

.tpc__actions .danger {
  color: #ff9d9f;
}

.tpc__days {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.tpc__days button {
  width: 30px;
  height: 30px;
  font-size: 12px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 8px;
  cursor: pointer;
}

.tpc__days button:hover {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

@media (max-width: 900px) {
  .tpc > .tpc__row {
    padding: 11px 10px;
  }

  .tpc__title {
    font-size: 14px;
  }

  .tpc__row {
    grid-template-columns: 1fr;
  }

  .tpc__actions button {
    padding: 10px 12px;
    font-size: 13px;
  }

  .tpc__days button {
    width: 38px;
    height: 38px;
  }
}
</style>
