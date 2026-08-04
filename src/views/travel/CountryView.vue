<script setup>
// Страна: вишлист мест на карте, поездки, файлы, заметка.
//
// Вишлист — точка истины модуля: точки в днях поездок ссылаются сюда, поэтому
// правка места здесь видна во всех маршрутах (спецификация, раздел 1).
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import TravelMap from "@/components/travel/TravelMap.vue";
import MarkdownView from "@/components/workspace/MarkdownView.vue";
import {
  fetchCountry,
  updateCountry,
  fetchWishes,
  createWish,
  updateWish,
  deleteWish,
  fetchPlaceCategories,
  searchPlaces,
  resolveMapLink,
  reverseGeocode,
  findPlacePhoto,
  fetchCountryFiles,
  uploadCountryFile,
  deleteTravelFile,
  travelFileUrl,
  fetchTrips,
  createTrip,
} from "@/components/api.js";

const route = useRoute();
const router = useRouter();
const countryId = route.params.id;

const country = ref(null);
const wishes = ref([]);
const categories = ref([]);
const files = ref([]);
const loading = ref(true);
const error = ref("");

const tab = ref("wishlist");
const mapRef = ref(null);
const selectedId = ref("");
const picking = ref(false);
const mobilePane = ref("map"); // на телефоне карта и список переключаются

// Фильтры вишлиста
const filterStatus = ref("all");
const filterCategory = ref("");
const filterText = ref("");

// Поиск мест
const searchQuery = ref("");
const searchResults = ref([]);
const searching = ref(false);
const linkInput = ref("");
const linkBusy = ref(false);
const searchOpen = ref(false);

// Карточка места
const editing = ref(null);
const editForm = ref(emptyWish());
const savingWish = ref(false);
const photoBusy = ref(false);

const noteDraft = ref("");
const notePreview = ref(true);

// Поездки страны
const trips = ref([]);
const tripCreateOpen = ref(false);
const creatingTrip = ref(false);
const tripForm = ref({ title: "", startDate: "", daysCount: 7 });

const TRIP_STATUSES = {
  draft: "черновик",
  planned: "запланирована",
  active: "в процессе",
  done: "завершена",
  cancelled: "отменена",
  archived: "архив",
};

function openTripCreate() {
  tripForm.value = { title: "", startDate: "", daysCount: 7 };
  tripCreateOpen.value = true;
}

async function submitTrip() {
  if (!tripForm.value.title.trim()) {
    error.value = "у поездки должно быть название";
    return;
  }
  creatingTrip.value = true;
  try {
    const created = await createTrip({
      countryId,
      title: tripForm.value.title.trim(),
      startDate: tripForm.value.startDate || null,
      daysCount: Number(tripForm.value.daysCount) || 1,
      status: "planned",
      localCurrency: country.value?.currency || "",
    });
    tripCreateOpen.value = false;
    router.push(`/travel/trips/${created.id}`);
  } catch (e) {
    error.value = e.message || "не удалось создать поездку";
  } finally {
    creatingTrip.value = false;
  }
}

async function loadTrips() {
  try {
    trips.value = await fetchTrips(countryId);
  } catch (e) {
    error.value = e.message || "не удалось загрузить поездки";
  }
}

const STATUSES = [
  { key: "idea", label: "Хочу", icon: "mdi-lightbulb-outline", color: "#8b93a7" },
  { key: "planned", label: "В плане", icon: "mdi-calendar-check", color: "#1767fd" },
  { key: "visited", label: "Посещено", icon: "mdi-check-circle", color: "#22c55e" },
  { key: "skipped", label: "Пропущено", icon: "mdi-close-circle", color: "#e5484d" },
];

function emptyWish() {
  return {
    title: "",
    description: "",
    categoryId: null,
    lat: null,
    lng: null,
    address: "",
    photoUrl: "",
    photoSource: "manual",
    priceAmount: null,
    priceCurrency: "",
    links: [],
    tags: [],
    status: "idea",
    skipReason: "",
    provider: "manual",
    externalId: "",
    rating: null,
    openingHours: [],
  };
}

function categoryOf(id) {
  return categories.value.find((c) => c.id === id) || null;
}

function statusOf(key) {
  return STATUSES.find((s) => s.key === key) || STATUSES[0];
}

const filtered = computed(() =>
  wishes.value.filter((w) => {
    if (filterStatus.value !== "all" && w.status !== filterStatus.value) return false;
    if (filterCategory.value && w.categoryId !== filterCategory.value) return false;
    if (filterText.value) {
      const needle = filterText.value.toLowerCase();
      const haystack = `${w.title} ${w.address} ${w.description}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }),
);

// Места без координат в списке есть, а на карте их быть не может.
const markers = computed(() =>
  filtered.value
    .filter((w) => w.lat != null && w.lng != null)
    .map((w) => {
      const category = categoryOf(w.categoryId);
      return {
        id: w.id,
        lat: w.lat,
        lng: w.lng,
        title: w.title,
        color: w.status === "visited" ? "#22c55e" : category?.color || "#1767fd",
        icon: category?.icon || "mdi-map-marker",
        dimmed: w.status === "skipped",
        draggable: true,
      };
    }),
);

const bbox = computed(() => {
  if (!country.value) return null;
  return [
    country.value.bboxMinLat,
    country.value.bboxMinLng,
    country.value.bboxMaxLat,
    country.value.bboxMaxLng,
  ];
});

const counts = computed(() => {
  const result = { all: wishes.value.length };
  STATUSES.forEach((s) => {
    result[s.key] = wishes.value.filter((w) => w.status === s.key).length;
  });
  return result;
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [countryData, wishData, categoryData] = await Promise.all([
      fetchCountry(countryId),
      fetchWishes(countryId),
      fetchPlaceCategories(),
    ]);
    country.value = countryData;
    wishes.value = wishData;
    categories.value = categoryData;
    noteDraft.value = countryData.note || "";
  } catch (e) {
    error.value = e.message || "не удалось загрузить страну";
  } finally {
    loading.value = false;
  }
}

async function loadFiles() {
  try {
    files.value = await fetchCountryFiles(countryId);
  } catch (e) {
    error.value = e.message || "не удалось загрузить файлы";
  }
}

// --- Поиск и добавление мест ---

let searchTimer = null;
function onSearchInput() {
  clearTimeout(searchTimer);
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }
  // Nominatim не любит частые запросы, поэтому ждём паузы в наборе.
  searchTimer = setTimeout(runSearch, 500);
}

async function runSearch() {
  if (!searchQuery.value.trim()) return;
  searching.value = true;
  try {
    searchResults.value = await searchPlaces(searchQuery.value, countryId, 10);
  } catch (e) {
    error.value = e.message || "поиск не сработал";
  } finally {
    searching.value = false;
  }
}

async function addFromSearch(place) {
  await saveNewWish({
    title: place.title,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    provider: place.provider,
    externalId: place.externalId,
    rating: place.rating ?? null,
  });
  searchResults.value = [];
  searchQuery.value = "";
  searchOpen.value = false;
}

async function addFromLink() {
  if (!linkInput.value.trim()) return;
  linkBusy.value = true;
  error.value = "";
  try {
    const place = await resolveMapLink(linkInput.value.trim());
    await saveNewWish({
      title: place.title || "Место из ссылки",
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      provider: place.provider || "google",
      externalId: place.externalId,
    });
    linkInput.value = "";
    searchOpen.value = false;
  } catch (e) {
    error.value = e.message || "не удалось разобрать ссылку";
  } finally {
    linkBusy.value = false;
  }
}

// Клик по карте в режиме постановки — определяем, что там, и заводим место.
async function onMapClick(coords) {
  if (!picking.value) return;
  picking.value = false;
  try {
    const place = await reverseGeocode(coords.lat, coords.lng);
    openEditor({
      ...emptyWish(),
      title: place?.title || "",
      address: place?.address || "",
      lat: coords.lat,
      lng: coords.lng,
      priceCurrency: country.value?.currency || "",
    });
  } catch {
    openEditor({
      ...emptyWish(),
      lat: coords.lat,
      lng: coords.lng,
      priceCurrency: country.value?.currency || "",
    });
  }
}

// Место найдено поиском прямо на карте — сразу открываем карточку,
// чтобы дописать своё: время, цену, заметку.
function onPlacePicked(place) {
  openEditor({
    ...emptyWish(),
    title: place.title,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    provider: place.provider,
    externalId: place.externalId,
    rating: place.rating ?? null,
    priceCurrency: country.value?.currency || "",
  });
}

async function saveNewWish(payload) {
  try {
    await createWish({
      ...emptyWish(),
      ...payload,
      countryId,
      priceCurrency: payload.priceCurrency || country.value?.currency || "",
    });
    wishes.value = await fetchWishes(countryId);
  } catch (e) {
    error.value = e.message || "не удалось добавить место";
  }
}

// Перетащили маркер — координаты сразу уезжают в вишлист.
async function onMarkerDrag({ id, lat, lng }) {
  const wish = wishes.value.find((w) => w.id === id);
  if (!wish) return;
  wish.lat = lat;
  wish.lng = lng;
  await updateWish(id, { ...wish, countryId });
}

// --- Карточка места ---

function openEditor(wish) {
  editing.value = wish.id || "new";
  editForm.value = {
    ...emptyWish(),
    ...wish,
    links: wish.links ? [...wish.links] : [],
    tags: wish.tags ? [...wish.tags] : [],
    openingHours: wish.openingHours ? [...wish.openingHours] : [],
  };
}

function openExisting(id) {
  const wish = wishes.value.find((w) => w.id === id);
  if (wish) openEditor(wish);
}

async function saveWish() {
  if (!editForm.value.title.trim()) {
    error.value = "у места должно быть название";
    return;
  }
  savingWish.value = true;
  error.value = "";
  try {
    const payload = { ...editForm.value, countryId };
    if (editing.value === "new") {
      await createWish(payload);
    } else {
      await updateWish(editing.value, payload);
    }
    wishes.value = await fetchWishes(countryId);
    editing.value = null;
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  } finally {
    savingWish.value = false;
  }
}

async function removeWish() {
  if (editing.value === "new") {
    editing.value = null;
    return;
  }
  if (!window.confirm("Удалить место из вишлиста?")) return;
  await deleteWish(editing.value);
  wishes.value = await fetchWishes(countryId);
  editing.value = null;
}

// Быстрая смена статуса прямо из списка.
async function cycleStatus(wish) {
  const order = ["idea", "planned", "visited", "skipped"];
  const next = order[(order.indexOf(wish.status) + 1) % order.length];
  wish.status = next;
  await updateWish(wish.id, { ...wish, countryId });
  wishes.value = await fetchWishes(countryId);
}

async function pullPhoto() {
  if (!editForm.value.title.trim()) return;
  photoBusy.value = true;
  try {
    const result = await findPlacePhoto(editForm.value.title);
    if (result.url) {
      editForm.value.photoUrl = result.url;
      editForm.value.photoSource = "wikipedia";
    } else {
      error.value = "в Википедии фото не нашлось — загрузи своё или вставь ссылку";
    }
  } catch (e) {
    error.value = e.message || "не удалось найти фото";
  } finally {
    photoBusy.value = false;
  }
}

function addLink() {
  editForm.value.links.push({ url: "", title: "" });
}

function removeLink(index) {
  editForm.value.links.splice(index, 1);
}

function selectWish(id) {
  selectedId.value = id;
  mapRef.value?.focusMarker(id);
  if (window.innerWidth <= 900) mobilePane.value = "map";
}

// --- Заметка страны ---

async function saveNote() {
  await updateCountry(countryId, { ...country.value, note: noteDraft.value });
  country.value.note = noteDraft.value;
}

// --- Файлы ---

const fileInput = ref(null);

async function onFilePicked(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await uploadCountryFile(countryId, file);
    await loadFiles();
  } catch (e) {
    error.value = e.message || "не удалось загрузить файл";
  } finally {
    event.target.value = "";
  }
}

async function removeFile(file) {
  if (!window.confirm(`Удалить «${file.title || file.filename}»?`)) return;
  await deleteTravelFile(file.id);
  await loadFiles();
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

// Карта, скрытая во вкладке, не знает своих размеров — обновляем после показа.
watch(tab, async (value) => {
  if (value === "files") await loadFiles();
  if (value === "trips") await loadTrips();
  if (value === "wishlist") {
    await nextTick();
    mapRef.value?.invalidate();
  }
});

watch(mobilePane, async () => {
  await nextTick();
  mapRef.value?.invalidate();
});

onMounted(load);
</script>

<template>
  <div class="country-view">
    <header class="cv-header">
      <button class="cv-back" @click="router.push('/travel')">
        <i class="mdi mdi-arrow-left"></i>
      </button>
      <span class="cv-flag">{{ country?.emoji || "🌍" }}</span>
      <div class="cv-title">
        <h1>{{ country?.name || "…" }}</h1>
        <span class="cv-subtitle">
          {{ country?.currency }} · мест: {{ counts.all }} · посещено: {{ counts.visited || 0 }}
        </span>
      </div>

      <nav class="cv-tabs">
        <button :class="{ active: tab === 'wishlist' }" @click="tab = 'wishlist'">
          <i class="mdi mdi-heart-outline"></i><span>Вишлист</span>
        </button>
        <button :class="{ active: tab === 'trips' }" @click="tab = 'trips'">
          <i class="mdi mdi-bag-suitcase"></i><span>Поездки</span>
        </button>
        <button :class="{ active: tab === 'files' }" @click="tab = 'files'">
          <i class="mdi mdi-paperclip"></i><span>Файлы</span>
        </button>
        <button :class="{ active: tab === 'note' }" @click="tab = 'note'">
          <i class="mdi mdi-note-text"></i><span>Заметка</span>
        </button>
      </nav>
    </header>

    <p v-if="error" class="cv-error" @click="error = ''">{{ error }}</p>
    <div v-if="loading" class="cv-empty">Загружаю…</div>

    <!-- ВИШЛИСТ -->
    <section v-else-if="tab === 'wishlist'" class="cv-wishlist" :data-pane="mobilePane">
      <div class="cv-map-pane">
        <TravelMap
          ref="mapRef"
          :markers="markers"
          :bbox="bbox"
          :center="[country?.centerLat || 0, country?.centerLng || 0]"
          :country-code="country?.code || ''"
          :selected-id="selectedId"
          :picking="picking"
          @map-click="onMapClick"
          @marker-click="selectWish"
          @marker-drag="onMarkerDrag"
          @place-picked="onPlacePicked"
        />
        <div class="cv-map-actions">
          <button class="cv-fab" :class="{ active: picking }" @click="picking = !picking">
            <i class="mdi mdi-map-marker-plus"></i>
            <span>{{ picking ? "Отменить" : "Точка на карте" }}</span>
          </button>
          <button class="cv-fab" @click="searchOpen = true">
            <i class="mdi mdi-magnify"></i>
            <span>Найти место</span>
          </button>
        </div>
      </div>

      <aside class="cv-list-pane">
        <div class="cv-filters">
          <input v-model="filterText" class="cv-input" type="text" placeholder="Поиск по вишлисту" />
          <div class="cv-chips">
            <button :class="{ active: filterStatus === 'all' }" @click="filterStatus = 'all'">
              Все <b>{{ counts.all }}</b>
            </button>
            <button
              v-for="s in STATUSES"
              :key="s.key"
              :class="{ active: filterStatus === s.key }"
              :style="filterStatus === s.key ? { background: s.color, borderColor: s.color } : {}"
              @click="filterStatus = s.key"
            >
              {{ s.label }} <b>{{ counts[s.key] || 0 }}</b>
            </button>
          </div>
          <select v-model="filterCategory" class="cv-input cv-select">
            <option value="">Все типы</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div v-if="!filtered.length" class="cv-empty cv-empty--small">
          <p>Здесь пусто.</p>
          <p class="cv-hint">
            Найди место поиском, вставь ссылку из Google Maps или ткни в карту.
          </p>
        </div>

        <ul v-else class="cv-list">
          <li
            v-for="wish in filtered"
            :key="wish.id"
            class="cv-item"
            :class="{ active: selectedId === wish.id, dimmed: wish.status === 'skipped' }"
            @click="selectWish(wish.id)"
          >
            <button
              class="cv-item__status"
              :style="{ background: statusOf(wish.status).color }"
              :title="statusOf(wish.status).label"
              @click.stop="cycleStatus(wish)"
            >
              <i class="mdi" :class="statusOf(wish.status).icon"></i>
            </button>

            <div
              v-if="wish.photoUrl"
              class="cv-item__photo"
              :style="{ backgroundImage: `url(${wish.photoUrl})` }"
            ></div>
            <div v-else class="cv-item__photo cv-item__photo--empty">
              <i class="mdi" :class="categoryOf(wish.categoryId)?.icon || 'mdi-map-marker'"></i>
            </div>

            <div class="cv-item__body">
              <div class="cv-item__title">{{ wish.title }}</div>
              <div class="cv-item__meta">
                <span v-if="categoryOf(wish.categoryId)" :style="{ color: categoryOf(wish.categoryId).color }">
                  {{ categoryOf(wish.categoryId).name }}
                </span>
                <span v-if="wish.priceAmount">
                  {{ wish.priceAmount }} {{ wish.priceCurrency }}
                  <em v-if="wish.priceCurrency !== 'RUB' && wish.priceRub">≈ {{ Math.round(wish.priceRub) }} ₽</em>
                </span>
                <span v-if="wish.rating"><i class="mdi mdi-star"></i>{{ wish.rating }}</span>
                <span v-if="wish.lat == null" class="cv-item__nomap">без координат</span>
              </div>
              <div v-if="wish.usedInTrips?.length" class="cv-item__used">
                <i class="mdi mdi-bag-suitcase-outline"></i>
                <span v-for="(use, i) in wish.usedInTrips" :key="i">
                  {{ use.tripTitle }} · день {{ use.dayIndex }}
                </span>
              </div>
            </div>

            <button class="cv-item__edit" @click.stop="openExisting(wish.id)">
              <i class="mdi mdi-pencil"></i>
            </button>
          </li>
        </ul>
      </aside>

      <div class="cv-pane-switch">
        <button :class="{ active: mobilePane === 'map' }" @click="mobilePane = 'map'">Карта</button>
        <button :class="{ active: mobilePane === 'list' }" @click="mobilePane = 'list'">
          Список ({{ filtered.length }})
        </button>
      </div>
    </section>

    <!-- ПОЕЗДКИ -->
    <section v-else-if="tab === 'trips'" class="cv-panel">
      <div class="cv-panel__head">
        <h2>Поездки в {{ country?.name }}</h2>
        <button class="cv-primary" @click="openTripCreate">
          <i class="mdi mdi-plus"></i> Поездка
        </button>
      </div>
      <p class="cv-hint">
        Разные варианты одной затеи — «14 дней» и «7 дней» — это две поездки:
        у каждой свой бюджет, а вишлист общий на страну.
      </p>

      <div v-if="!trips.length" class="cv-empty cv-empty--small">Поездок пока нет.</div>
      <div v-else class="cv-trips">
        <article
          v-for="t in trips"
          :key="t.id"
          class="cv-trip"
          @click="router.push(`/travel/trips/${t.id}`)"
        >
          <div class="cv-trip__head">
            <h3>{{ t.title }}</h3>
            <span class="cv-trip__status" :class="`cv-trip__status--${t.status}`">
              {{ TRIP_STATUSES[t.status] || t.status }}
            </span>
          </div>
          <div class="cv-trip__meta">
            <span v-if="t.startDate">{{ t.startDate }} — {{ t.endDate }}</span>
            <span v-else>даты не выбраны</span>
            <span>{{ t.daysCount }} дн.</span>
            <span>{{ t.pointsCount }} точек</span>
            <span v-if="t.plannedRub">{{ Math.round(t.plannedRub).toLocaleString("ru") }} ₽</span>
          </div>
        </article>
      </div>
    </section>

    <!-- Создание поездки -->
    <div v-if="tripCreateOpen" class="cv-modal-backdrop" @click.self="tripCreateOpen = false">
      <div class="cv-modal">
        <h2>Новая поездка</h2>
        <label class="cv-field">
          Название
          <input v-model="tripForm.title" class="cv-input" type="text" placeholder="Ноябрь, 14 дней" />
        </label>
        <div class="cv-row">
          <label class="cv-field">
            Дата начала
            <input v-model="tripForm.startDate" class="cv-input" type="date" />
          </label>
          <label class="cv-field">
            Сколько дней
            <input v-model.number="tripForm.daysCount" class="cv-input" type="number" min="1" max="120" />
          </label>
        </div>
        <p class="cv-hint">
          Дни создадутся сразу. Дату старта потом можно сдвинуть — дни поедут за ней.
        </p>
        <div class="cv-modal__actions">
          <button class="cv-ghost" @click="tripCreateOpen = false">Отмена</button>
          <button class="cv-primary" :disabled="creatingTrip" @click="submitTrip">
            {{ creatingTrip ? "Создаю…" : "Создать" }}
          </button>
        </div>
      </div>
    </div>

    <!-- ФАЙЛЫ -->
    <section v-else-if="tab === 'files'" class="cv-panel">
      <div class="cv-panel__head">
        <h2>Файлы страны</h2>
        <button class="cv-primary" @click="fileInput.click()">
          <i class="mdi mdi-upload"></i> Загрузить
        </button>
        <input ref="fileInput" type="file" hidden @change="onFilePicked" />
      </div>
      <p class="cv-hint">
        Визовые памятки, шаблоны анкет, сканы — то, что относится к стране, а не к конкретной поездке.
      </p>

      <div v-if="!files.length" class="cv-empty cv-empty--small">Файлов пока нет.</div>
      <ul v-else class="cv-files">
        <li v-for="file in files" :key="file.id">
          <i class="mdi mdi-file-document-outline"></i>
          <a :href="travelFileUrl(file.id)" target="_blank" rel="noopener">
            {{ file.title || file.filename }}
          </a>
          <span class="cv-files__size">{{ formatSize(file.size) }}</span>
          <button @click="removeFile(file)"><i class="mdi mdi-delete"></i></button>
        </li>
      </ul>
    </section>

    <!-- ЗАМЕТКА -->
    <section v-else-if="tab === 'note'" class="cv-panel">
      <div class="cv-panel__head">
        <h2>Заметка о стране</h2>
        <button class="cv-ghost" @click="notePreview = !notePreview">
          {{ notePreview ? "Редактировать" : "Просмотр" }}
        </button>
        <button class="cv-primary" @click="saveNote">Сохранить</button>
      </div>
      <MarkdownView v-if="notePreview" :text="noteDraft || '_Пусто. Нажми «Редактировать»._'" />
      <textarea
        v-else
        v-model="noteDraft"
        class="cv-input cv-note"
        rows="20"
        placeholder="Визы, транспорт, симки, что брать с собой…"
      ></textarea>
    </section>

    <!-- Поиск места -->
    <div v-if="searchOpen" class="cv-modal-backdrop" @click.self="searchOpen = false">
      <div class="cv-modal">
        <h2>Найти место</h2>

        <input
          v-model="searchQuery"
          class="cv-input"
          type="text"
          placeholder="Станция Синдзюку"
          autofocus
          @input="onSearchInput"
          @keydown.enter="runSearch"
        />
        <p class="cv-hint">Поиск ограничен страной {{ country?.name }}.</p>

        <div v-if="searching" class="cv-hint">Ищу…</div>
        <ul v-else-if="searchResults.length" class="cv-results">
          <li v-for="place in searchResults" :key="place.externalId + place.lat" @click="addFromSearch(place)">
            <div class="cv-results__title">
              {{ place.title }}
              <span v-if="place.rating" class="cv-results__rating">
                <i class="mdi mdi-star"></i>{{ place.rating }}
              </span>
            </div>
            <div class="cv-results__address">{{ place.address }}</div>
          </li>
        </ul>

        <div class="cv-divider">или вставь ссылку</div>
        <div class="cv-link-row">
          <input
            v-model="linkInput"
            class="cv-input"
            type="text"
            placeholder="https://maps.app.goo.gl/…"
            @keydown.enter="addFromLink"
          />
          <button class="cv-primary" :disabled="linkBusy" @click="addFromLink">
            {{ linkBusy ? "…" : "Добавить" }}
          </button>
        </div>

        <div class="cv-modal__actions">
          <button class="cv-ghost" @click="searchOpen = false">Закрыть</button>
        </div>
      </div>
    </div>

    <!-- Карточка места -->
    <div v-if="editing" class="cv-modal-backdrop" @click.self="editing = null">
      <div class="cv-modal cv-modal--wide">
        <h2>{{ editing === "new" ? "Новое место" : "Место" }}</h2>

        <label class="cv-field">
          Название
          <input v-model="editForm.title" class="cv-input" type="text" />
        </label>

        <div class="cv-row">
          <label class="cv-field">
            Тип
            <select v-model="editForm.categoryId" class="cv-input cv-select">
              <option :value="null">— без типа —</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <label class="cv-field">
            Статус
            <select v-model="editForm.status" class="cv-input cv-select">
              <option v-for="s in STATUSES" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
          </label>
        </div>

        <label class="cv-field">
          Адрес
          <input v-model="editForm.address" class="cv-input" type="text" />
        </label>

        <div class="cv-row">
          <label class="cv-field">
            Широта
            <input v-model.number="editForm.lat" class="cv-input" type="number" step="0.000001" />
          </label>
          <label class="cv-field">
            Долгота
            <input v-model.number="editForm.lng" class="cv-input" type="number" step="0.000001" />
          </label>
        </div>

        <!-- Два поля суммы: в рублях без пересчёта, в местной валюте — с пересчётом -->
        <div class="cv-row">
          <label class="cv-field">
            Стоимость, {{ country?.currency }}
            <input
              class="cv-input"
              type="number"
              step="0.01"
              :value="editForm.priceCurrency === country?.currency ? editForm.priceAmount : null"
              @input="
                editForm.priceAmount = $event.target.value === '' ? null : Number($event.target.value);
                editForm.priceCurrency = country?.currency;
              "
            />
          </label>
          <label class="cv-field">
            Стоимость, ₽
            <input
              class="cv-input"
              type="number"
              step="0.01"
              :value="editForm.priceCurrency === 'RUB' ? editForm.priceAmount : null"
              @input="
                editForm.priceAmount = $event.target.value === '' ? null : Number($event.target.value);
                editForm.priceCurrency = 'RUB';
              "
            />
          </label>
        </div>

        <label class="cv-field">
          Фото
          <div class="cv-link-row">
            <input v-model="editForm.photoUrl" class="cv-input" type="text" placeholder="ссылка на картинку" />
            <button class="cv-ghost" :disabled="photoBusy" @click="pullPhoto">
              {{ photoBusy ? "…" : "Из Википедии" }}
            </button>
          </div>
        </label>
        <div
          v-if="editForm.photoUrl"
          class="cv-preview"
          :style="{ backgroundImage: `url(${editForm.photoUrl})` }"
        ></div>

        <label class="cv-field">
          Описание
          <textarea
            v-model="editForm.description"
            class="cv-input cv-textarea"
            rows="5"
            placeholder="Что там интересного, как добраться, во сколько открывается…"
          ></textarea>
        </label>

        <div class="cv-field">
          Ссылки
          <div v-for="(link, i) in editForm.links" :key="i" class="cv-link-row">
            <input v-model="link.title" class="cv-input" type="text" placeholder="название" />
            <input v-model="link.url" class="cv-input" type="text" placeholder="https://" />
            <button class="cv-ghost" @click="removeLink(i)"><i class="mdi mdi-close"></i></button>
          </div>
          <button class="cv-ghost cv-ghost--small" @click="addLink">
            <i class="mdi mdi-plus"></i> ссылка
          </button>
        </div>

        <label v-if="editForm.status === 'skipped'" class="cv-field">
          Почему пропустили
          <input v-model="editForm.skipReason" class="cv-input" type="text" placeholder="было закрыто" />
        </label>

        <div class="cv-modal__actions">
          <button v-if="editing !== 'new'" class="cv-danger" @click="removeWish">Удалить</button>
          <div class="cv-modal__spacer"></div>
          <button class="cv-ghost" @click="editing = null">Отмена</button>
          <button class="cv-primary" :disabled="savingWish" @click="saveWish">
            {{ savingWish ? "Сохраняю…" : "Сохранить" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.country-view {
  /* #app центрирует детей флексом — растягиваемся явно на всю ширину. */
  width: 100%;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: #eaeef7;
  background: #12141a;
}

.cv-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 22px;
  border-bottom: 1px solid #232733;
}

.cv-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: #b9c0cf;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 10px;
  cursor: pointer;
}

.cv-flag {
  font-size: 30px;
}

.cv-title {
  flex: 1;
  min-width: 0;
}

.cv-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.cv-subtitle {
  font-size: 12px;
  color: #6e7688;
}

.cv-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 11px;
}

.cv-tabs button {
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

.cv-tabs button:hover {
  color: #eaeef7;
}

.cv-tabs button.active {
  color: #fff;
  background: #1767fd;
}

.cv-wishlist {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr 380px;
  min-height: 0;
}

.cv-map-pane {
  position: relative;
  min-height: 0;
  padding: 12px;
}

.cv-map-actions {
  position: absolute;
  bottom: 24px;
  left: 24px;
  z-index: 500;
  display: flex;
  gap: 8px;
}

.cv-fab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 16px;
  font-size: 13px;
  color: #eaeef7;
  background: rgba(24, 27, 35, 0.92);
  border: 1px solid #333846;
  border-radius: 999px;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.cv-fab:hover {
  border-color: #1767fd;
}

.cv-fab.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

.cv-list-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid #232733;
}

.cv-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #232733;
}

.cv-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.cv-chips button {
  padding: 5px 10px;
  font-size: 12px;
  color: #b9c0cf;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 999px;
  cursor: pointer;
}

.cv-chips button.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

.cv-chips b {
  opacity: 0.65;
}

.cv-list {
  flex: 1;
  padding: 8px;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.cv-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px;
  margin-bottom: 6px;
  background: #1b1e27;
  border: 1px solid transparent;
  border-radius: 11px;
  cursor: pointer;
}

.cv-item:hover {
  border-color: #333846;
}

.cv-item.active {
  border-color: #1767fd;
  background: #1d2331;
}

.cv-item.dimmed {
  opacity: 0.5;
}

.cv-item__status {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.cv-item__photo {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  background-size: cover;
  background-position: center;
  border-radius: 9px;
}

.cv-item__photo--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #4d5464;
  background: #232733;
}

.cv-item__body {
  flex: 1;
  min-width: 0;
}

.cv-item__title {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 3px;
  font-size: 11px;
  color: #6e7688;
}

.cv-item__meta em {
  font-style: normal;
  opacity: 0.7;
}

.cv-item__nomap {
  color: #a9843a;
}

.cv-item__used {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  color: #1767fd;
}

.cv-item__edit {
  flex-shrink: 0;
  padding: 6px;
  color: #6e7688;
  background: transparent;
  border: none;
  cursor: pointer;
}

.cv-item__edit:hover {
  color: #eaeef7;
}

.cv-pane-switch {
  display: none;
}

.cv-panel {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
}

.cv-panel__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.cv-panel__head h2 {
  flex: 1;
  margin: 0;
  font-size: 18px;
}

.cv-trips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.cv-trip {
  padding: 14px 16px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.cv-trip:hover {
  border-color: #1767fd;
}

.cv-trip__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cv-trip__head h3 {
  flex: 1;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.cv-trip__status {
  padding: 3px 9px;
  font-size: 11px;
  color: #b9c0cf;
  background: #232733;
  border-radius: 999px;
}

.cv-trip__status--active {
  color: #fff;
  background: #22c55e;
}

.cv-trip__status--planned {
  color: #fff;
  background: #1767fd;
}

.cv-trip__status--done {
  color: #86d68b;
}

.cv-trip__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  color: #6e7688;
}

.cv-files {
  padding: 0;
  margin: 16px 0 0;
  list-style: none;
}

.cv-files li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 6px;
  background: #1b1e27;
  border-radius: 10px;
}

.cv-files a {
  flex: 1;
  color: #eaeef7;
  text-decoration: none;
}

.cv-files a:hover {
  color: #1767fd;
}

.cv-files__size {
  font-size: 12px;
  color: #6e7688;
}

.cv-files button {
  padding: 4px;
  color: #6e7688;
  background: transparent;
  border: none;
  cursor: pointer;
}

.cv-files button:hover {
  color: #e5484d;
}

.cv-note {
  width: 100%;
  font-family: ui-monospace, monospace;
  resize: vertical;
}

.cv-input {
  width: 100%;
  padding: 9px 11px;
  font-size: 14px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 9px;
  outline: none;
}

.cv-input:focus {
  border-color: #1767fd;
}

.cv-select {
  cursor: pointer;
}

.cv-textarea {
  font-family: inherit;
  resize: vertical;
}

.cv-field {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: #8b93a7;
}

.cv-field .cv-input,
.cv-field .cv-link-row {
  margin-top: 5px;
}

.cv-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.cv-link-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.cv-preview {
  height: 140px;
  margin-top: 8px;
  background-size: cover;
  background-position: center;
  border-radius: 10px;
}

.cv-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 15px;
  font-size: 14px;
  color: #fff;
  white-space: nowrap;
  background: #1767fd;
  border: none;
  border-radius: 9px;
  cursor: pointer;
}

.cv-primary:disabled {
  background: #2f3441;
  color: #7b8296;
}

.cv-ghost {
  padding: 9px 15px;
  font-size: 14px;
  color: #b9c0cf;
  white-space: nowrap;
  background: transparent;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.cv-ghost:hover {
  color: #fff;
  border-color: #3d4353;
}

.cv-ghost--small {
  padding: 6px 12px;
  font-size: 12px;
}

.cv-danger {
  padding: 9px 15px;
  font-size: 14px;
  color: #ff9d9f;
  background: transparent;
  border: 1px solid rgba(229, 72, 77, 0.4);
  border-radius: 9px;
  cursor: pointer;
}

.cv-danger:hover {
  background: rgba(229, 72, 77, 0.15);
}

.cv-error {
  padding: 9px 16px;
  margin: 0;
  font-size: 13px;
  color: #ff9d9f;
  cursor: pointer;
  background: rgba(229, 72, 77, 0.14);
}

.cv-empty {
  padding: 40px 20px;
  color: #6e7688;
  text-align: center;
}

.cv-empty--small {
  padding: 24px 16px;
  font-size: 13px;
}

.cv-hint {
  font-size: 12px;
  color: #6e7688;
}

.cv-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 9, 13, 0.72);
}

.cv-modal {
  width: 100%;
  max-width: 480px;
  max-height: 92vh;
  padding: 22px;
  overflow-y: auto;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 16px;
}

.cv-modal--wide {
  max-width: 620px;
}

.cv-modal h2 {
  margin: 0 0 12px;
  font-size: 19px;
}

.cv-modal__actions {
  display: flex;
  gap: 9px;
  margin-top: 20px;
}

.cv-modal__spacer {
  flex: 1;
}

.cv-results {
  padding: 0;
  margin: 10px 0 0;
  max-height: 300px;
  overflow-y: auto;
  list-style: none;
}

.cv-results li {
  padding: 9px 11px;
  margin-bottom: 4px;
  background: #12141a;
  border-radius: 9px;
  cursor: pointer;
}

.cv-results li:hover {
  background: #232733;
}

.cv-results__title {
  display: flex;
  gap: 8px;
  font-size: 14px;
}

.cv-results__rating {
  color: #ffd666;
}

.cv-results__address {
  margin-top: 2px;
  font-size: 11px;
  color: #6e7688;
}

.cv-divider {
  margin: 18px 0 10px;
  font-size: 12px;
  color: #6e7688;
  text-align: center;
}

/* Телефон: карта и список не рядом, а по очереди — иначе оба нечитаемы. */
@media (max-width: 900px) {
  .country-view {
    height: 100dvh;
  }

  .cv-header {
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 12px;
  }

  .cv-title h1 {
    font-size: 17px;
  }

  .cv-tabs {
    order: 3;
    width: 100%;
    overflow-x: auto;
  }

  .cv-tabs button {
    flex: 1;
    justify-content: center;
    padding: 9px 8px;
  }

  .cv-tabs button span {
    display: none;
  }

  .cv-wishlist {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }

  .cv-wishlist[data-pane="map"] .cv-list-pane,
  .cv-wishlist[data-pane="list"] .cv-map-pane {
    display: none;
  }

  .cv-map-pane {
    padding: 8px;
  }

  .cv-list-pane {
    border-left: none;
  }

  .cv-map-actions {
    bottom: 18px;
    left: 16px;
    right: 16px;
  }

  .cv-fab {
    flex: 1;
    justify-content: center;
    padding: 12px 14px;
  }

  .cv-pane-switch {
    display: flex;
    gap: 4px;
    padding: 8px;
    background: #12141a;
    border-top: 1px solid #232733;
  }

  .cv-pane-switch button {
    flex: 1;
    padding: 11px;
    font-size: 13px;
    color: #8b93a7;
    background: #1b1e27;
    border: 1px solid #262b36;
    border-radius: 10px;
    cursor: pointer;
  }

  .cv-pane-switch button.active {
    color: #fff;
    background: #1767fd;
    border-color: #1767fd;
  }

  .cv-item {
    padding: 10px;
  }

  .cv-item__photo {
    width: 54px;
    height: 54px;
  }

  .cv-row {
    grid-template-columns: 1fr;
  }

  .cv-modal {
    max-height: 94vh;
    padding: 16px;
  }
}
</style>
