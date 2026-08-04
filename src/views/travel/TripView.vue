<script setup>
// Главный экран поездки: карта слева, справа колонка-«алгоритм» дня.
//
// Структура дня: варианты (План А / План Б) → цепочка шагов → точки.
// Шаг с несколькими точками — развилка «или/или»: пойти сюда ИЛИ туда.
// Между шагами — переезды. Спецификация: docs/travel-module.md, раздел 4.
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import TravelMap from "@/components/travel/TravelMap.vue";
import TripPointCard from "@/components/travel/TripPointCard.vue";
import TripPrepTab from "@/components/travel/TripPrepTab.vue";
import TripBudgetTab from "@/components/travel/TripBudgetTab.vue";
import TripShareTab from "@/components/travel/TripShareTab.vue";
import {
  fetchTrip,
  updateTrip,
  addTripDay,
  updateTripDay,
  deleteTripDay,
  moveTripDay,
  copyTripDay,
  createDayVariant,
  updateDayVariant,
  deleteDayVariant,
  createStep,
  deleteStep,
  reorderSteps,
  chooseStepPoint,
  createPoint,
  createPointInStep,
  deletePoint,
  movePoint,
  releasePointToWishlist,
  addWishToDay,
  createTransport,
  updateTransport,
  deleteTransport,
  fetchWishes,
  fetchPlaceCategories,
  fetchTrips,
  searchPlaces,
  resolveMapLink,
  reverseGeocode,
  fetchTripWeather,
  fetchTripPulse,
  tripCalendarUrl,
  syncTripToGoogle,
} from "@/components/api.js";

const route = useRoute();
const router = useRouter();
const tripId = route.params.id;

const trip = ref(null);
const categories = ref([]);
const wishes = ref([]);
const siblingTrips = ref([]);
const loading = ref(true);
const error = ref("");

// Карта с маршрутом и подготовка — два разных занятия, поэтому разные вкладки.
const view = ref("map");
const dayIndex = ref(0);
const selectedPointId = ref("");
const openPointId = ref("");
const mapRef = ref(null);
const mobilePane = ref("list");
const picking = ref(false);
const pickTarget = ref(null); // { mode: 'step'|'variant', id }
const showAllDays = ref(false);
const visibleDays = ref([]);

const wishPickerOpen = ref(false);
const searchOpen = ref(false);
const searchQuery = ref("");
const searchResults = ref([]);
const searching = ref(false);
const linkInput = ref("");
const dayMenuOpen = ref(false);
const copyTarget = ref("");
const moveTarget = ref(1);
const transportEditing = ref(null);
const transportForm = ref(emptyTransport());

// Погода по дням и пульс: кто сейчас правит и что ждёт ответа.
const weather = ref([]);
const pulse = ref(null);
let pulseTimer = null;
let typingUntil = 0;

const TRANSPORT_KINDS = [
  { key: "walk", label: "Пешком", icon: "mdi-walk" },
  { key: "metro", label: "Метро", icon: "mdi-subway-variant" },
  { key: "train", label: "Поезд", icon: "mdi-train" },
  { key: "bus", label: "Автобус", icon: "mdi-bus" },
  { key: "ferry", label: "Паром", icon: "mdi-ferry" },
  { key: "taxi", label: "Такси", icon: "mdi-taxi" },
  { key: "car", label: "Авто", icon: "mdi-car" },
  { key: "plane", label: "Самолёт", icon: "mdi-airplane" },
  { key: "bike", label: "Велосипед", icon: "mdi-bike" },
];

const STATUS_COLORS = {
  plan: "#8b93a7",
  confirmed: "#1767fd",
  visited: "#22c55e",
  skipped: "#e5484d",
};

function emptyTransport() {
  return {
    stepId: "",
    kind: "walk",
    line: "",
    carrier: "",
    number: "",
    platform: "",
    departMin: null,
    arriveMin: null,
    durationMin: null,
    costAmount: null,
    costCurrency: "",
    note: "",
    color: "",
  };
}

const days = computed(() => trip.value?.days || []);
const currentDay = computed(() => days.value[dayIndex.value] || null);

const currentVariant = computed(() => {
  const day = currentDay.value;
  if (!day || !day.variants.length) return null;
  return day.variants.find((v) => v.isPrimary) || day.variants[0];
});

function categoryOf(id) {
  return categories.value.find((c) => c.id === id) || null;
}

function transportKind(kind) {
  return TRANSPORT_KINDS.find((k) => k.key === kind) || TRANSPORT_KINDS[0];
}

// Точка шага, которая идёт «в зачёт»: отмеченная как пройденная,
// иначе первая альтернатива. Именно она рисуется сплошной линией.
function mainPointOf(step) {
  if (!step.points.length) return null;
  if (step.chosenPointId) {
    const chosen = step.points.find((p) => p.id === step.chosenPointId);
    if (chosen) return chosen;
  }
  return step.points[0];
}

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

function formatDayLabel(day) {
  if (!day.date) return `День ${day.index}`;
  const [, month, dayNum] = day.date.split("-");
  return `${dayNum}.${month}`;
}

// --- Карта ---

// Показываем либо текущий день, либо все выбранные — каждый своим цветом.
const DAY_COLORS = ["#1767fd", "#22c55e", "#f59e0b", "#a855f7", "#e11d48", "#06b6d4", "#84cc16", "#ec4899"];

const daysOnMap = computed(() => {
  if (!showAllDays.value) return currentDay.value ? [currentDay.value] : [];
  if (!visibleDays.value.length) return days.value;
  return days.value.filter((d) => visibleDays.value.includes(d.id));
});

const markers = computed(() => {
  const result = [];
  daysOnMap.value.forEach((day) => {
    const color = showAllDays.value ? DAY_COLORS[(day.index - 1) % DAY_COLORS.length] : null;
    const variant = day.variants.find((v) => v.isPrimary) || day.variants[0];
    if (!variant) return;

    variant.steps.forEach((step, stepIdx) => {
      step.points.forEach((point) => {
        if (point.lat == null || point.lng == null) return;
        const isMain = mainPointOf(step)?.id === point.id;
        const category = categoryOf(point.categoryId);
        result.push({
          id: point.id,
          lat: point.lat,
          lng: point.lng,
          title: point.title,
          color: color || STATUS_COLORS[point.status] || category?.color || "#1767fd",
          icon: category?.icon || "mdi-map-marker",
          // Невыбранная ветка развилки приглушена — она рядом, но не в маршруте.
          dimmed: !isMain || point.status === "skipped",
          badge: isMain ? String(stepIdx + 1) : "",
        });
      });

      // Объекты «поблизости» — свои маркеры рядом с точкой.
      step.points.forEach((point) => {
        point.nearby.forEach((item) => {
          if (item.lat == null || item.lng == null) return;
          result.push({
            id: `nearby-${item.id}`,
            lat: item.lat,
            lng: item.lng,
            title: item.title,
            color: "#6e7688",
            icon: categoryOf(item.categoryId)?.icon || "mdi-shopping-outline",
            dimmed: true,
          });
        });
      });
    });
  });
  return result;
});

// Линии рисуются по типу переезда: свой цвет у поезда, автобуса, парома.
const lines = computed(() => {
  const result = [];
  daysOnMap.value.forEach((day) => {
    const dayColor = showAllDays.value ? DAY_COLORS[(day.index - 1) % DAY_COLORS.length] : null;
    const variant = day.variants.find((v) => v.isPrimary) || day.variants[0];
    if (!variant) return;

    let previous = null;
    variant.steps.forEach((step) => {
      const point = mainPointOf(step);
      if (!point || point.lat == null || point.lng == null) return;
      if (previous) {
        result.push({
          id: `${day.id}-${step.id}`,
          color: dayColor || step.transport?.color || "#1767fd",
          points: [[previous.lat, previous.lng], [point.lat, point.lng]],
        });
      }
      previous = point;
    });

    // Развилки — пунктиром от предыдущей точки к каждой альтернативе.
    variant.steps.forEach((step, idx) => {
      if (step.points.length < 2) return;
      const prevStep = variant.steps[idx - 1];
      const from = prevStep ? mainPointOf(prevStep) : null;
      if (!from || from.lat == null) return;
      step.points.forEach((point) => {
        if (point.id === mainPointOf(step)?.id) return;
        if (point.lat == null || point.lng == null) return;
        result.push({
          id: `alt-${point.id}`,
          color: "#8b93a7",
          dashed: true,
          dimmed: true,
          points: [[from.lat, from.lng], [point.lat, point.lng]],
        });
      });
    });
  });
  return result;
});

const mapBbox = computed(() => {
  const country = trip.value?.country;
  if (!country) return null;
  return [country.bboxMinLat, country.bboxMinLng, country.bboxMaxLat, country.bboxMaxLng];
});

// --- Загрузка ---

async function load(keepDay = true) {
  const previousIndex = dayIndex.value;
  loading.value = true;
  error.value = "";
  try {
    trip.value = await fetchTrip(tripId);
    if (!categories.value.length) categories.value = await fetchPlaceCategories();
    if (trip.value?.countryId) {
      wishes.value = await fetchWishes(trip.value.countryId);
      siblingTrips.value = (await fetchTrips(trip.value.countryId)).filter((t) => t.id !== tripId);
    }
    if (keepDay && previousIndex < days.value.length) {
      dayIndex.value = previousIndex;
    } else if (dayIndex.value >= days.value.length) {
      dayIndex.value = Math.max(0, days.value.length - 1);
    }
  } catch (e) {
    error.value = e.message || "не удалось загрузить поездку";
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await load(true);
}

const weatherOfDay = computed(() => {
  const day = currentDay.value;
  if (!day) return null;
  return weather.value.find((w) => w.dayId === day.id) || null;
});

async function loadWeather(refresh = false) {
  if (!trip.value?.startDate) return;
  try {
    weather.value = await fetchTripWeather(tripId, refresh);
  } catch {
    // Погода — приятное дополнение: молчим, если сеть не дала.
  }
}

// Опрос раз в три секунды. Пока идёт правка, экран не дёргаем: договорились,
// что обновление приходит после нескольких секунд тишины.
function startPulse() {
  pulseTimer = setInterval(async () => {
    try {
      const result = await fetchTripPulse(tripId, trip.value?.version || 0);
      pulse.value = result;
      const busy = editingSomething();
      if (result.changed && !busy && Date.now() > typingUntil) {
        await reload();
      }
    } catch {
      // Сеть моргнула — попробуем на следующем тике.
    }
  }, 3000);
}

// Пока открыта любая форма, перерисовывать экран нельзя.
function editingSomething() {
  return Boolean(
    transportEditing.value || searchOpen.value || wishPickerOpen.value || dayMenuOpen.value,
  );
}

function touchTyping() {
  typingUntil = Date.now() + 5000;
}

async function syncCalendar() {
  try {
    const result = await syncTripToGoogle(tripId);
    error.value = `В календарь ушло событий: ${result.synced}`;
  } catch (e) {
    error.value = e.message || "не удалось синхронизировать";
  }
}

function downloadIcs() {
  window.open(tripCalendarUrl(tripId), "_blank", "noopener");
}

// --- Дни ---

async function addDay() {
  await addTripDay(tripId);
  await reload();
  dayIndex.value = days.value.length - 1;
}

async function saveDayTitle(value) {
  if (!currentDay.value) return;
  await updateTripDay(currentDay.value.id, { ...currentDay.value, title: value });
  currentDay.value.title = value;
}

async function removeDay() {
  if (!currentDay.value) return;
  const shift = window.confirm(
    "Подтянуть следующие дни на освободившееся место?\n\nОК — подтянуть, Отмена — оставить пустой день.",
  );
  await deleteTripDay(currentDay.value.id, shift);
  dayMenuOpen.value = false;
  await reload();
}

async function doMoveDay() {
  if (!currentDay.value) return;
  await moveTripDay(currentDay.value.id, Number(moveTarget.value));
  dayMenuOpen.value = false;
  await reload();
}

async function doCopyDay() {
  if (!currentDay.value) return;
  try {
    await copyTripDay(currentDay.value.id, copyTarget.value || null, null);
    dayMenuOpen.value = false;
    if (!copyTarget.value) await reload();
    else error.value = "День скопирован в другую поездку";
  } catch (e) {
    error.value = e.message || "не удалось скопировать день";
  }
}

// --- Варианты ---

async function addVariant() {
  if (!currentDay.value) return;
  const title = window.prompt("Название варианта", `План ${String.fromCharCode(65 + currentDay.value.variants.length)}`);
  if (!title) return;
  await createDayVariant(currentDay.value.id, { title });
  await reload();
}

async function makePrimary(variant) {
  await updateDayVariant(variant.id, { ...variant, isPrimary: true });
  await reload();
}

async function removeVariant(variant) {
  if (!window.confirm(`Удалить вариант «${variant.title}» со всеми точками?`)) return;
  try {
    await deleteDayVariant(variant.id);
    await reload();
  } catch (e) {
    error.value = e.message || "не удалось удалить вариант";
  }
}

// --- Точки ---

function startPicking(target) {
  pickTarget.value = target;
  picking.value = true;
  mobilePane.value = "map";
}

async function onMapClick(coords) {
  if (!picking.value || !pickTarget.value) return;
  picking.value = false;
  const target = pickTarget.value;
  pickTarget.value = null;

  let title = "Новая точка";
  let address = "";
  try {
    const place = await reverseGeocode(coords.lat, coords.lng);
    if (place?.title) title = place.title;
    address = place?.address || "";
  } catch {
    // Обратный геокодинг не сработал — точку всё равно ставим, название поправишь.
  }

  await addPoint(target, { title, address, lat: coords.lat, lng: coords.lng });
}

// Место найдено поиском на карте — кладём его в маршрут туда, куда
// пользователь целился: отдельным шагом или альтернативой в развилку.
async function onPlacePicked(place) {
  const target = pickTarget.value || { mode: "variant" };
  pickTarget.value = null;
  picking.value = false;
  await addPoint(target, {
    title: place.title,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
  });
}

// target: { mode: 'variant' } — новый шаг в конец; { mode: 'step', id } — альтернатива
async function addPoint(target, payload) {
  try {
    if (target.mode === "step") {
      await createPointInStep(target.id, payload);
    } else {
      await createPoint({ ...payload, variantId: currentVariant.value.id });
    }
    await reload();
  } catch (e) {
    error.value = e.message || "не удалось добавить точку";
  }
}

async function addFromWish(wish) {
  const target = pickTarget.value || { mode: "variant" };
  try {
    await addWishToDay({
      wishId: wish.id,
      variantId: target.mode === "step" ? null : currentVariant.value.id,
      stepId: target.mode === "step" ? target.id : null,
    });
    wishPickerOpen.value = false;
    pickTarget.value = null;
    await reload();
  } catch (e) {
    error.value = e.message || "не удалось добавить место";
  }
}

let searchTimer = null;
function onSearchInput() {
  clearTimeout(searchTimer);
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }
  searchTimer = setTimeout(runSearch, 500);
}

async function runSearch() {
  searching.value = true;
  try {
    searchResults.value = await searchPlaces(searchQuery.value, trip.value.countryId, 10);
  } catch (e) {
    error.value = e.message || "поиск не сработал";
  } finally {
    searching.value = false;
  }
}

async function addFromSearch(place) {
  const target = pickTarget.value || { mode: "variant" };
  await addPoint(target, {
    title: place.title,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
  });
  searchOpen.value = false;
  searchQuery.value = "";
  searchResults.value = [];
  pickTarget.value = null;
}

async function addFromLink() {
  if (!linkInput.value.trim()) return;
  try {
    const place = await resolveMapLink(linkInput.value.trim());
    const target = pickTarget.value || { mode: "variant" };
    await addPoint(target, {
      title: place.title || "Место из ссылки",
      address: place.address,
      lat: place.lat,
      lng: place.lng,
    });
    linkInput.value = "";
    searchOpen.value = false;
    pickTarget.value = null;
  } catch (e) {
    error.value = e.message || "не удалось разобрать ссылку";
  }
}

async function removePoint(point) {
  if (!window.confirm(`Убрать «${point.title}» из маршрута?`)) return;
  await deletePoint(point.id);
  await reload();
}

// Невыбранная ветка не пропадает: уходит в вишлист, откуда её можно взять
// в другой день или другую поездку.
async function toWishlist(point) {
  await releasePointToWishlist(point.id);
  await reload();
}

// «Этот путь я прошёл» — отмечаем ветку развилки.
async function choose(step, point) {
  const next = step.chosenPointId === point.id ? null : point.id;
  await chooseStepPoint(step.id, next);
  await reload();
}

async function moveToDay(point, targetDay) {
  const variant = targetDay.variants.find((v) => v.isPrimary) || targetDay.variants[0];
  if (!variant) return;
  await movePoint(point.id, { variantId: variant.id });
  await reload();
}

function selectPoint(id) {
  selectedPointId.value = id;
  if (!String(id).startsWith("nearby-")) {
    mapRef.value?.focusMarker(id);
  }
}

// --- Шаги ---

async function addStep() {
  if (!currentVariant.value) return;
  await createStep(currentVariant.value.id, {});
  await reload();
}

async function removeStep(step) {
  if (!window.confirm("Удалить шаг вместе с точками?")) return;
  await deleteStep(step.id);
  await reload();
}

// Перетаскивание шагов внутри дня.
const dragIndex = ref(-1);

function onDragStart(index) {
  dragIndex.value = index;
}

async function onDrop(index) {
  if (dragIndex.value < 0 || dragIndex.value === index || !currentVariant.value) return;
  const ids = currentVariant.value.steps.map((s) => s.id);
  const [moved] = ids.splice(dragIndex.value, 1);
  ids.splice(index, 0, moved);
  dragIndex.value = -1;
  await reorderSteps(ids);
  await reload();
}

// --- Переезды ---

function openTransport(step) {
  transportEditing.value = step;
  transportForm.value = step.transport
    ? {
        ...step.transport,
        stepId: step.id,
        departMin: step.transport.departMin,
        arriveMin: step.transport.arriveMin,
      }
    : { ...emptyTransport(), stepId: step.id, costCurrency: trip.value.localCurrency };
}

async function saveTransport() {
  const payload = { ...transportForm.value };
  try {
    if (transportEditing.value.transport) {
      await updateTransport(transportEditing.value.transport.id, payload);
    } else {
      await createTransport(payload);
    }
    transportEditing.value = null;
    await reload();
  } catch (e) {
    error.value = e.message || "не удалось сохранить переезд";
  }
}

async function removeTransport() {
  if (!transportEditing.value?.transport) {
    transportEditing.value = null;
    return;
  }
  await deleteTransport(transportEditing.value.transport.id);
  transportEditing.value = null;
  await reload();
}

// --- Прочее ---

function money(amount, currency) {
  if (amount == null) return "";
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded} ${currency || ""}`.trim();
}

watch(mobilePane, async () => {
  await nextTick();
  mapRef.value?.invalidate();
});

watch(dayIndex, () => {
  selectedPointId.value = "";
  openPointId.value = "";
});

onMounted(async () => {
  await load();
  await loadWeather();
  startPulse();
});

onBeforeUnmount(() => clearInterval(pulseTimer));
</script>

<template>
  <div class="trip-view">
    <header class="tv-header">
      <button class="tv-icon-btn" @click="router.push(`/travel/countries/${trip?.countryId || ''}`)">
        <i class="mdi mdi-arrow-left"></i>
      </button>

      <div class="tv-title">
        <h1>{{ trip?.title || "…" }}</h1>
        <span class="tv-subtitle">
          <template v-if="trip?.startDate">{{ trip.startDate }} — {{ trip.endDate }}</template>
          <template v-else>даты не выбраны</template>
          · {{ trip?.daysCount || 0 }} дн.
          · план {{ Math.round(trip?.plannedRub || 0).toLocaleString("ru") }} ₽
        </span>
      </div>

      <nav class="tv-view-tabs">
        <button :class="{ active: view === 'map' }" @click="view = 'map'">
          <i class="mdi mdi-map"></i><span>Маршрут</span>
        </button>
        <button :class="{ active: view === 'prep' }" @click="view = 'prep'">
          <i class="mdi mdi-clipboard-list"></i><span>Подготовка</span>
        </button>
        <button :class="{ active: view === 'budget' }" @click="view = 'budget'">
          <i class="mdi mdi-wallet"></i><span>Бюджет</span>
        </button>
        <button :class="{ active: view === 'share' }" @click="view = 'share'">
          <i class="mdi mdi-account-multiple"></i><span>Доступ</span>
          <em v-if="pulse?.pendingSuggestions" class="tv-tab-badge">{{ pulse.pendingSuggestions }}</em>
        </button>
      </nav>

      <div class="tv-header__actions">
        <!-- Кто сейчас в поездке кроме меня -->
        <span v-for="g in pulse?.online || []" :key="g.id" class="tv-online" :title="g.name">
          {{ g.name.slice(0, 1) }}
        </span>
        <button class="tv-ghost" title="В поездке — режим для телефона" @click="router.push(`/travel/today/${tripId}`)">
          <i class="mdi mdi-cellphone"></i>
        </button>
        <button class="tv-ghost" title="Скачать календарь" @click="downloadIcs">
          <i class="mdi mdi-calendar-export"></i>
        </button>
        <button class="tv-ghost" title="В Google Calendar" @click="syncCalendar">
          <i class="mdi mdi-google"></i>
        </button>
        <button
          v-if="view === 'map'"
          class="tv-ghost"
          :class="{ active: showAllDays }"
          @click="showAllDays = !showAllDays"
        >
          <i class="mdi mdi-layers"></i>
          <span>Вся поездка</span>
        </button>
      </div>
    </header>

    <p v-if="error" class="tv-error" @click="error = ''">{{ error }}</p>
    <div v-if="loading" class="tv-empty">Загружаю…</div>

    <TripPrepTab v-else-if="trip && view === 'prep'" :trip="trip" @changed="reload" />
    <TripBudgetTab v-else-if="trip && view === 'budget'" :trip="trip" @changed="reload" />
    <TripShareTab v-else-if="trip && view === 'share'" :trip="trip" @changed="reload" />

    <template v-else-if="trip">
      <!-- Лента дней -->
      <nav class="tv-days">
        <button
          v-for="(day, i) in days"
          :key="day.id"
          class="tv-day"
          :class="{ active: i === dayIndex }"
          @click="dayIndex = i"
        >
          <span class="tv-day__num">{{ day.emoji || day.index }}</span>
          <span class="tv-day__date">{{ formatDayLabel(day) }}</span>
          <span v-if="day.title" class="tv-day__title">{{ day.title }}</span>
        </button>
        <button class="tv-day tv-day--add" @click="addDay"><i class="mdi mdi-plus"></i></button>
      </nav>

      <section class="tv-body" :data-pane="mobilePane">
        <div class="tv-map-pane">
          <TravelMap
            ref="mapRef"
            :markers="markers"
            :lines="lines"
            :bbox="mapBbox"
            :center="[trip.country?.centerLat || 0, trip.country?.centerLng || 0]"
            :country-code="trip.country?.code || ''"
            :selected-id="selectedPointId"
            :picking="picking"
            @map-click="onMapClick"
            @marker-click="selectPoint"
            @place-picked="onPlacePicked"
          />

          <div v-if="showAllDays" class="tv-day-filter">
            <label v-for="day in days" :key="day.id">
              <input
                type="checkbox"
                :value="day.id"
                :checked="!visibleDays.length || visibleDays.includes(day.id)"
                @change="
                  visibleDays.includes(day.id)
                    ? visibleDays.splice(visibleDays.indexOf(day.id), 1)
                    : visibleDays.push(day.id)
                "
              />
              <span
                class="tv-day-filter__dot"
                :style="{ background: DAY_COLORS[(day.index - 1) % DAY_COLORS.length] }"
              ></span>
              {{ day.index }}
            </label>
          </div>
        </div>

        <!-- Правая колонка: алгоритм дня -->
        <aside class="tv-column">
          <div class="tv-column__head">
            <div class="tv-variants">
              <button
                v-for="variant in currentDay?.variants || []"
                :key="variant.id"
                class="tv-variant"
                :class="{ active: variant.isPrimary }"
                @click="makePrimary(variant)"
              >
                {{ variant.title }}
                <em v-if="variant.costRub">{{ Math.round(variant.costRub).toLocaleString("ru") }} ₽</em>
              </button>
              <button class="tv-variant tv-variant--add" title="Добавить вариант" @click="addVariant">
                <i class="mdi mdi-plus"></i>
              </button>
            </div>

            <button class="tv-icon-btn" title="Действия с днём" @click="dayMenuOpen = !dayMenuOpen">
              <i class="mdi mdi-dots-vertical"></i>
            </button>
          </div>

          <!-- Погода дня: прогноз вблизи дат, климатическая норма — вдали -->
          <div v-if="weatherOfDay?.label" class="tv-weather" :class="`tv-weather--${weatherOfDay.kind}`">
            <i
              class="mdi"
              :class="weatherOfDay.kind === 'forecast' ? 'mdi-weather-partly-cloudy' : 'mdi-chart-bell-curve'"
            ></i>
            {{ weatherOfDay.label }}
            <button title="Обновить" @click="loadWeather(true)"><i class="mdi mdi-refresh"></i></button>
          </div>

          <div v-if="dayMenuOpen" class="tv-day-menu">
            <input
              class="tv-input"
              type="text"
              placeholder="Заголовок дня"
              :value="currentDay?.title"
              @change="saveDayTitle($event.target.value)"
            />
            <div class="tv-row">
              <input v-model.number="moveTarget" class="tv-input" type="number" min="1" :max="days.length" />
              <button class="tv-ghost" @click="doMoveDay">Сделать днём №</button>
            </div>
            <div class="tv-row">
              <select v-model="copyTarget" class="tv-input">
                <option value="">эта же поездка</option>
                <option v-for="t in siblingTrips" :key="t.id" :value="t.id">{{ t.title }}</option>
              </select>
              <button class="tv-ghost" @click="doCopyDay">Копировать день</button>
            </div>
            <button
              v-if="currentDay && currentDay.variants.length > 1"
              class="tv-danger tv-danger--small"
              @click="removeVariant(currentVariant)"
            >
              Удалить вариант «{{ currentVariant?.title }}»
            </button>
            <button class="tv-danger tv-danger--small" @click="removeDay">Удалить день</button>
          </div>

          <div class="tv-steps">
            <p v-if="!currentVariant?.steps.length" class="tv-hint tv-hint--center">
              День пустой. Возьми место из вишлиста, найди поиском или ткни в карту.
            </p>

            <div
              v-for="(step, stepIdx) in currentVariant?.steps || []"
              :key="step.id"
              class="tv-step"
              draggable="true"
              @dragstart="onDragStart(stepIdx)"
              @dragover.prevent
              @drop="onDrop(stepIdx)"
            >
              <!-- Переезд, ведущий к этому шагу -->
              <button
                v-if="stepIdx > 0 || step.transport"
                class="tv-transport"
                :style="step.transport ? { borderColor: step.transport.color } : {}"
                @click="openTransport(step)"
              >
                <i class="mdi" :class="transportKind(step.transport?.kind).icon"></i>
                <template v-if="step.transport">
                  <span>{{ step.transport.line || transportKind(step.transport.kind).label }}</span>
                  <em v-if="step.transport.durationMin">{{ step.transport.durationMin }} мин</em>
                  <em v-if="step.transport.costAmount">
                    {{ money(step.transport.costAmount, step.transport.costCurrency) }}
                  </em>
                </template>
                <span v-else class="tv-transport__empty">как добираемся?</span>
              </button>

              <div class="tv-step__body" :class="{ 'tv-step__body--fork': step.points.length > 1 }">
                <div v-if="step.points.length > 1" class="tv-fork-label">
                  <i class="mdi mdi-source-branch"></i> развилка — или/или
                </div>

                <TripPointCard
                  v-for="point in step.points"
                  :key="point.id"
                  :point="point"
                  :category="categoryOf(point.categoryId)"
                  :trip="trip"
                  :categories="categories"
                  :index="stepIdx + 1"
                  :is-fork="step.points.length > 1"
                  :is-chosen="step.chosenPointId === point.id"
                  :is-main="mainPointOf(step)?.id === point.id"
                  :selected="selectedPointId === point.id"
                  :expanded="openPointId === point.id"
                  :days="days"
                  @select="selectPoint(point.id)"
                  @toggle="openPointId = openPointId === point.id ? '' : point.id"
                  @choose="choose(step, point)"
                  @remove="removePoint(point)"
                  @to-wishlist="toWishlist(point)"
                  @move-day="moveToDay(point, $event)"
                  @changed="reload"
                />

                <div class="tv-step__actions">
                  <button title="Добавить альтернативу" @click="startPicking({ mode: 'step', id: step.id })">
                    <i class="mdi mdi-source-branch-plus"></i> альтернатива
                  </button>
                  <button
                    title="Взять из вишлиста как альтернативу"
                    @click="pickTarget = { mode: 'step', id: step.id }; wishPickerOpen = true"
                  >
                    <i class="mdi mdi-heart-outline"></i>
                  </button>
                  <button title="Удалить шаг" @click="removeStep(step)">
                    <i class="mdi mdi-delete-outline"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="tv-column__foot">
            <button class="tv-primary" @click="pickTarget = { mode: 'variant' }; wishPickerOpen = true">
              <i class="mdi mdi-heart-outline"></i> Из вишлиста
            </button>
            <button class="tv-ghost" @click="pickTarget = { mode: 'variant' }; searchOpen = true">
              <i class="mdi mdi-magnify"></i>
            </button>
            <button class="tv-ghost" :class="{ active: picking }" @click="startPicking({ mode: 'variant' })">
              <i class="mdi mdi-map-marker-plus"></i>
            </button>
            <button class="tv-ghost" title="Пустой шаг" @click="addStep">
              <i class="mdi mdi-plus"></i>
            </button>
          </div>
        </aside>

        <div class="tv-pane-switch">
          <button :class="{ active: mobilePane === 'map' }" @click="mobilePane = 'map'">Карта</button>
          <button :class="{ active: mobilePane === 'list' }" @click="mobilePane = 'list'">Маршрут</button>
        </div>
      </section>
    </template>

    <!-- Вишлист -->
    <div v-if="wishPickerOpen" class="tv-modal-backdrop" @click.self="wishPickerOpen = false">
      <div class="tv-modal">
        <h2>Из вишлиста {{ trip?.country?.name }}</h2>
        <p class="tv-hint">
          Точка станет ссылкой на вишлист: правки видны в обе стороны, «посещено» поднимется наверх.
        </p>
        <ul class="tv-wishes">
          <li v-for="wish in wishes" :key="wish.id" @click="addFromWish(wish)">
            <div
              v-if="wish.photoUrl"
              class="tv-wishes__photo"
              :style="{ backgroundImage: `url(${wish.photoUrl})` }"
            ></div>
            <div v-else class="tv-wishes__photo tv-wishes__photo--empty">
              <i class="mdi" :class="categoryOf(wish.categoryId)?.icon || 'mdi-map-marker'"></i>
            </div>
            <div class="tv-wishes__body">
              <div>{{ wish.title }}</div>
              <div class="tv-wishes__meta">
                <span v-if="wish.status === 'visited'" style="color: #22c55e">посещено</span>
                <span v-if="wish.usedInTrips?.length">уже в плане ({{ wish.usedInTrips.length }})</span>
                <span v-if="wish.priceAmount">{{ money(wish.priceAmount, wish.priceCurrency) }}</span>
              </div>
            </div>
          </li>
        </ul>
        <div class="tv-modal__actions">
          <button class="tv-ghost" @click="wishPickerOpen = false">Закрыть</button>
        </div>
      </div>
    </div>

    <!-- Поиск -->
    <div v-if="searchOpen" class="tv-modal-backdrop" @click.self="searchOpen = false">
      <div class="tv-modal">
        <h2>Найти место</h2>
        <input
          v-model="searchQuery"
          class="tv-input"
          type="text"
          placeholder="Станция Синдзюку"
          autofocus
          @input="onSearchInput"
        />
        <div v-if="searching" class="tv-hint">Ищу…</div>
        <ul v-else-if="searchResults.length" class="tv-results">
          <li v-for="place in searchResults" :key="place.externalId + place.lat" @click="addFromSearch(place)">
            <div>{{ place.title }}</div>
            <div class="tv-results__address">{{ place.address }}</div>
          </li>
        </ul>
        <div class="tv-divider">или ссылка из Google Maps</div>
        <div class="tv-row">
          <input v-model="linkInput" class="tv-input" type="text" placeholder="https://maps.app.goo.gl/…" />
          <button class="tv-primary" @click="addFromLink">Добавить</button>
        </div>
        <div class="tv-modal__actions">
          <button class="tv-ghost" @click="searchOpen = false">Закрыть</button>
        </div>
      </div>
    </div>

    <!-- Переезд -->
    <div v-if="transportEditing" class="tv-modal-backdrop" @click.self="transportEditing = null">
      <div class="tv-modal">
        <h2>Как добираемся</h2>

        <div class="tv-kinds">
          <button
            v-for="kind in TRANSPORT_KINDS"
            :key="kind.key"
            :class="{ active: transportForm.kind === kind.key }"
            @click="transportForm.kind = kind.key"
          >
            <i class="mdi" :class="kind.icon"></i>
            <span>{{ kind.label }}</span>
          </button>
        </div>

        <label class="tv-field">
          Маршрут / линия
          <input v-model="transportForm.line" class="tv-input" type="text" placeholder="Yamanote Line, автобус 47" />
        </label>

        <div class="tv-row">
          <label class="tv-field">
            Перевозчик
            <input v-model="transportForm.carrier" class="tv-input" type="text" />
          </label>
          <label class="tv-field">
            Номер
            <input v-model="transportForm.number" class="tv-input" type="text" />
          </label>
        </div>

        <div class="tv-row">
          <label class="tv-field">
            Отправление
            <input
              class="tv-input"
              type="time"
              :value="formatTime(transportForm.departMin)"
              @input="transportForm.departMin = parseTime($event.target.value)"
            />
          </label>
          <label class="tv-field">
            Прибытие
            <input
              class="tv-input"
              type="time"
              :value="formatTime(transportForm.arriveMin)"
              @input="transportForm.arriveMin = parseTime($event.target.value)"
            />
          </label>
        </div>

        <div class="tv-row">
          <label class="tv-field">
            В пути, мин
            <input v-model.number="transportForm.durationMin" class="tv-input" type="number" min="0" />
          </label>
          <label class="tv-field">
            Платформа / выход
            <input v-model="transportForm.platform" class="tv-input" type="text" />
          </label>
        </div>

        <!-- Два поля суммы: рубли без пересчёта, местная валюта — с пересчётом -->
        <div class="tv-row">
          <label class="tv-field">
            Стоимость, {{ trip?.localCurrency }}
            <input
              class="tv-input"
              type="number"
              step="0.01"
              :value="transportForm.costCurrency === trip?.localCurrency ? transportForm.costAmount : null"
              @input="
                transportForm.costAmount = $event.target.value === '' ? null : Number($event.target.value);
                transportForm.costCurrency = trip.localCurrency;
              "
            />
          </label>
          <label class="tv-field">
            Стоимость, ₽
            <input
              class="tv-input"
              type="number"
              step="0.01"
              :value="transportForm.costCurrency === 'RUB' ? transportForm.costAmount : null"
              @input="
                transportForm.costAmount = $event.target.value === '' ? null : Number($event.target.value);
                transportForm.costCurrency = 'RUB';
              "
            />
          </label>
        </div>

        <label class="tv-field">
          Заметка
          <textarea
            v-model="transportForm.note"
            class="tv-input tv-textarea"
            rows="3"
            placeholder="садиться в первый вагон, выход B3"
          ></textarea>
        </label>

        <div class="tv-modal__actions">
          <button v-if="transportEditing.transport" class="tv-danger" @click="removeTransport">Удалить</button>
          <div class="tv-spacer"></div>
          <button class="tv-ghost" @click="transportEditing = null">Отмена</button>
          <button class="tv-primary" @click="saveTransport">Сохранить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trip-view {
  /* #app центрирует детей флексом — растягиваемся явно на всю ширину. */
  width: 100%;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: #eaeef7;
  background: #12141a;
}

.tv-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid #232733;
}

.tv-title {
  flex: 1;
  min-width: 0;
}

.tv-title h1 {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
}

.tv-subtitle {
  font-size: 12px;
  color: #6e7688;
}

.tv-header__actions {
  display: flex;
  gap: 8px;
}

.tv-view-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 11px;
}

.tv-view-tabs button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  color: #8b93a7;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.tv-view-tabs button:hover {
  color: #eaeef7;
}

.tv-view-tabs button.active {
  color: #fff;
  background: #1767fd;
}

.tv-tab-badge {
  min-width: 17px;
  padding: 1px 5px;
  font-size: 10px;
  font-style: normal;
  color: #12141a;
  text-align: center;
  background: #ffd666;
  border-radius: 9px;
}

.tv-online {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  font-size: 12px;
  color: #12141a;
  background: #86d68b;
  border-radius: 50%;
}

.tv-weather {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 7px 12px;
  font-size: 12px;
  color: #8b93a7;
  border-bottom: 1px solid #232733;
}

.tv-weather--climate {
  color: #a9843a;
}

.tv-weather button {
  margin-left: auto;
  padding: 2px 5px;
  color: #6e7688;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tv-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: #b9c0cf;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.tv-icon-btn:hover {
  color: #fff;
  background: #232733;
}

.tv-days {
  display: flex;
  gap: 6px;
  padding: 10px 20px;
  overflow-x: auto;
  border-bottom: 1px solid #232733;
}

.tv-day {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex-shrink: 0;
  min-width: 64px;
  padding: 7px 12px;
  color: #8b93a7;
  text-align: left;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 10px;
  cursor: pointer;
}

.tv-day:hover {
  border-color: #3d4353;
}

.tv-day.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

.tv-day__num {
  font-size: 15px;
  font-weight: 600;
}

.tv-day__date {
  font-size: 11px;
  opacity: 0.75;
}

.tv-day__title {
  max-width: 120px;
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

.tv-day--add {
  align-items: center;
  justify-content: center;
  min-width: 44px;
  font-size: 18px;
}

.tv-body {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr 400px;
  min-height: 0;
}

.tv-map-pane {
  position: relative;
  min-height: 0;
  padding: 10px;
}

.tv-day-filter {
  position: absolute;
  bottom: 22px;
  left: 22px;
  z-index: 500;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 60%;
  padding: 8px 12px;
  background: rgba(24, 27, 35, 0.92);
  border: 1px solid #333846;
  border-radius: 10px;
  backdrop-filter: blur(6px);
}

.tv-day-filter label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #b9c0cf;
  cursor: pointer;
}

.tv-day-filter__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.tv-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid #232733;
}

.tv-column__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #232733;
}

.tv-variants {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 5px;
}

.tv-variant {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  font-size: 12px;
  color: #b9c0cf;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 999px;
  cursor: pointer;
}

.tv-variant em {
  font-size: 11px;
  font-style: normal;
  opacity: 0.65;
}

.tv-variant.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

.tv-variant--add {
  padding: 6px 9px;
}

.tv-day-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #171a22;
  border-bottom: 1px solid #232733;
}

.tv-steps {
  flex: 1;
  padding: 10px;
  overflow-y: auto;
}

.tv-step {
  margin-bottom: 4px;
}

.tv-transport {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 5px 12px;
  margin: 2px 0 2px 16px;
  font-size: 11px;
  color: #8b93a7;
  text-align: left;
  background: transparent;
  border: none;
  border-left: 2px dashed #333846;
  cursor: pointer;
}

.tv-transport:hover {
  color: #eaeef7;
}

.tv-transport em {
  font-style: normal;
  opacity: 0.7;
}

.tv-transport__empty {
  opacity: 0.5;
}

.tv-step__body--fork {
  padding: 8px;
  background: rgba(139, 147, 167, 0.07);
  border: 1px dashed #3d4353;
  border-radius: 12px;
}

.tv-fork-label {
  margin-bottom: 6px;
  font-size: 11px;
  color: #8b93a7;
}

.tv-step__actions {
  display: flex;
  gap: 4px;
  padding: 2px 0 0 34px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tv-step:hover .tv-step__actions {
  opacity: 1;
}

.tv-step__actions button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 11px;
  color: #6e7688;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.tv-step__actions button:hover {
  color: #eaeef7;
  background: #232733;
}

.tv-column__foot {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-top: 1px solid #232733;
}

.tv-column__foot .tv-primary {
  flex: 1;
}

.tv-pane-switch {
  display: none;
}

.tv-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 9px;
  outline: none;
}

.tv-input:focus {
  border-color: #1767fd;
}

.tv-textarea {
  font-family: inherit;
  resize: vertical;
}

.tv-field {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: #8b93a7;
}

.tv-field .tv-input {
  margin-top: 4px;
}

.tv-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  align-items: end;
}

.tv-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 14px;
  font-size: 13px;
  color: #fff;
  white-space: nowrap;
  background: #1767fd;
  border: none;
  border-radius: 9px;
  cursor: pointer;
}

.tv-ghost {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 13px;
  font-size: 13px;
  color: #b9c0cf;
  white-space: nowrap;
  background: transparent;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.tv-ghost:hover {
  color: #fff;
  border-color: #3d4353;
}

.tv-ghost.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

.tv-danger {
  padding: 9px 14px;
  font-size: 13px;
  color: #ff9d9f;
  background: transparent;
  border: 1px solid rgba(229, 72, 77, 0.4);
  border-radius: 9px;
  cursor: pointer;
}

.tv-danger--small {
  padding: 7px 12px;
  font-size: 12px;
}

.tv-spacer {
  flex: 1;
}

.tv-error {
  padding: 9px 16px;
  margin: 0;
  font-size: 13px;
  color: #ff9d9f;
  cursor: pointer;
  background: rgba(229, 72, 77, 0.14);
}

.tv-empty {
  padding: 40px;
  color: #6e7688;
  text-align: center;
}

.tv-hint {
  font-size: 12px;
  color: #6e7688;
}

.tv-hint--center {
  padding: 30px 16px;
  text-align: center;
}

.tv-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 9, 13, 0.72);
}

.tv-modal {
  width: 100%;
  max-width: 520px;
  max-height: 92vh;
  padding: 20px;
  overflow-y: auto;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 16px;
}

.tv-modal h2 {
  margin: 0 0 10px;
  font-size: 18px;
}

.tv-modal__actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}

.tv-wishes,
.tv-results {
  padding: 0;
  margin: 10px 0 0;
  max-height: 45vh;
  overflow-y: auto;
  list-style: none;
}

.tv-wishes li {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 7px 9px;
  margin-bottom: 4px;
  background: #12141a;
  border-radius: 10px;
  cursor: pointer;
}

.tv-wishes li:hover {
  background: #232733;
}

.tv-wishes__photo {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
}

.tv-wishes__photo--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4d5464;
  background: #232733;
}

.tv-wishes__body {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}

.tv-wishes__meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 11px;
  color: #6e7688;
}

.tv-results li {
  padding: 8px 10px;
  margin-bottom: 4px;
  font-size: 13px;
  background: #12141a;
  border-radius: 9px;
  cursor: pointer;
}

.tv-results li:hover {
  background: #232733;
}

.tv-results__address {
  margin-top: 2px;
  font-size: 11px;
  color: #6e7688;
}

.tv-divider {
  margin: 16px 0 8px;
  font-size: 12px;
  color: #6e7688;
  text-align: center;
}

.tv-kinds {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 5px;
  margin-bottom: 6px;
}

.tv-kinds button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 4px;
  font-size: 11px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.tv-kinds button.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

/* Телефон: карта и маршрут по очереди, кнопки крупнее пальца. */
@media (max-width: 900px) {
  .trip-view {
    height: 100dvh;
  }

  .tv-header {
    padding: 10px 12px;
  }

  .tv-title h1 {
    font-size: 16px;
  }

  .tv-view-tabs button span,
  .tv-header__actions .tv-ghost span {
    display: none;
  }

  .tv-days {
    padding: 8px 12px;
  }

  .tv-day__title {
    display: none;
  }

  .tv-body {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }

  .tv-body[data-pane="map"] .tv-column,
  .tv-body[data-pane="list"] .tv-map-pane {
    display: none;
  }

  .tv-column {
    border-left: none;
  }

  /* Ховера нет — действия шага показываем всегда. */
  .tv-step__actions {
    opacity: 1;
    padding-left: 12px;
  }

  .tv-step__actions button {
    padding: 7px 10px;
    font-size: 12px;
  }

  .tv-column__foot {
    padding: 8px;
  }

  .tv-column__foot button {
    padding: 12px 14px;
  }

  .tv-pane-switch {
    display: flex;
    gap: 4px;
    padding: 8px;
    border-top: 1px solid #232733;
  }

  .tv-pane-switch button {
    flex: 1;
    padding: 11px;
    font-size: 13px;
    color: #8b93a7;
    background: #1b1e27;
    border: 1px solid #262b36;
    border-radius: 10px;
    cursor: pointer;
  }

  .tv-pane-switch button.active {
    color: #fff;
    background: #1767fd;
    border-color: #1767fd;
  }

  .tv-row {
    grid-template-columns: 1fr;
  }

  .tv-modal {
    padding: 14px;
  }
}
</style>
