<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import {
  fetchSportPhotos,
  fetchSportTimelapse,
  fetchSportSlots,
  uploadSportPhotos,
  updateSportPhoto,
  deleteSportPhoto,
  unlockSportPin,
  fetchSportPhotoBlobUrl,
  sportToday,
} from "@/components/sportApi.js";

const props = defineProps({ settings: { type: Object, default: null } });

const MODES = [
  { code: "grid", title: "Сетка" },
  { code: "timelapse", title: "Таймлапс" },
  { code: "compare", title: "Сравнение" },
];

const mode = ref("grid");
const slots = ref([]);
const slotFilter = ref("");
const photos = ref([]);
const timelapse = ref([]);
const error = ref("");
const locked = ref(false);
const pinInput = ref("");
const uploading = ref(false);
const uploadDate = ref(sportToday());
const uploadSlot = ref("");

// Таймлапс
const frame = ref(0);
const playing = ref(false);
const speed = ref(300);
let playTimer = null;

// Сравнение
const beforeIndex = ref(0);
const afterIndex = ref(0);
const wipe = ref(50);

// Просмотр полноразмерного кадра
const viewer = ref(null);

const currentDay = computed(() => timelapse.value[frame.value] || null);

const blurred = computed(() => props.settings?.blurPreviews && locked.value);

function thumb(photo) {
  return `data:image/jpeg;base64,${photo.thumbnail}`;
}

async function load() {
  error.value = "";
  try {
    slots.value = await fetchSportSlots();
    photos.value = await fetchSportPhotos({ slotId: slotFilter.value || undefined });
    timelapse.value = await fetchSportTimelapse({ slotId: slotFilter.value || undefined });
    locked.value = false;
    frame.value = Math.max(0, timelapse.value.length - 1);
    beforeIndex.value = 0;
    afterIndex.value = Math.max(0, timelapse.value.length - 1);
  } catch (e) {
    if (e.locked) {
      locked.value = true;
      photos.value = [];
      timelapse.value = [];
    } else {
      error.value = e.message || "не удалось загрузить фото";
    }
  }
}

async function unlock() {
  error.value = "";
  try {
    await unlockSportPin(pinInput.value);
    pinInput.value = "";
    await load();
  } catch (e) {
    error.value = e.message || "неверный PIN";
  }
}

// Дни без кадров в группировку не попадают, поэтому листалка идёт
// по существующим снимкам, а не по календарю.
const dayPhotos = computed(() => currentDay.value?.photos || []);

function play() {
  playing.value = !playing.value;
  clearInterval(playTimer);
  if (!playing.value) return;
  playTimer = setInterval(() => {
    frame.value = (frame.value + 1) % Math.max(1, timelapse.value.length);
  }, speed.value);
}

async function openViewer(photo) {
  try {
    const url = await fetchSportPhotoBlobUrl(photo.id);
    viewer.value = { photo, url };
  } catch (e) {
    error.value = e.message || "не удалось открыть кадр";
  }
}

function closeViewer() {
  if (viewer.value) URL.revokeObjectURL(viewer.value.url);
  viewer.value = null;
}

async function onFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  uploading.value = true;
  error.value = "";
  try {
    await uploadSportPhotos(files, {
      // Дата пустая — бэк возьмёт её из EXIF снимка.
      date: uploadDate.value || undefined,
      slotId: uploadSlot.value || undefined,
    });
    await load();
  } catch (e) {
    if (e.locked) locked.value = true;
    else error.value = e.message || "не удалось загрузить";
  } finally {
    uploading.value = false;
    event.target.value = "";
  }
}

async function assignSlot(photo, slotId) {
  try {
    await updateSportPhoto(photo.id, slotId ? { slotId } : { clearSlot: true });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось изменить ракурс";
  }
}

async function remove(photo) {
  if (!confirm("Удалить кадр?")) return;
  try {
    await deleteSportPhoto(photo.id);
    await load();
  } catch (e) {
    error.value = e.message || "не удалось удалить";
  }
}

watch(slotFilter, load);
watch(speed, () => {
  if (playing.value) {
    playing.value = false;
    play();
  }
});

onMounted(load);
onBeforeUnmount(() => {
  clearInterval(playTimer);
  closeViewer();
});
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px">
    <div v-if="error" class="sp-error">{{ error }}</div>

    <div v-if="locked" class="sp-card sp-lock">
      <div style="font-size: 34px">🔒</div>
      <div>Раздел фото закрыт PIN-кодом</div>
      <div class="sp-row" style="justify-content: center">
        <input
          v-model="pinInput"
          class="sp-input"
          type="password"
          style="max-width: 160px"
          placeholder="PIN"
          @keyup.enter="unlock"
        />
        <button class="sp-btn is-primary" @click="unlock">Открыть</button>
      </div>
      <div class="sp-muted">Разблокировка действует 12 часов и до закрытия браузера.</div>
    </div>

    <template v-else>
      <div class="sp-card">
        <div class="sp-row">
          <div class="sp-tabs">
            <button
              v-for="m in MODES"
              :key="m.code"
              class="sp-tab"
              :class="{ 'is-active': mode === m.code }"
              @click="mode = m.code"
            >
              {{ m.title }}
            </button>
          </div>
          <div class="sp-spacer"></div>
          <select v-model="slotFilter" class="sp-select" style="max-width: 160px">
            <option value="">все ракурсы</option>
            <option v-for="s in slots" :key="s.id" :value="s.id">{{ s.title }}</option>
          </select>
        </div>

        <div class="sp-row" style="margin-top: 10px">
          <div class="sp-field" style="width: 150px">
            <label>Дата (пусто — из EXIF)</label>
            <input v-model="uploadDate" class="sp-input" type="date" />
          </div>
          <div class="sp-field" style="width: 160px">
            <label>Ракурс</label>
            <select v-model="uploadSlot" class="sp-select">
              <option value="">без ракурса</option>
              <option v-for="s in slots" :key="s.id" :value="s.id">{{ s.title }}</option>
            </select>
          </div>
          <label class="sp-btn is-primary" style="align-self: flex-end">
            {{ uploading ? "Загрузка…" : "📷 Загрузить кадры" }}
            <input type="file" accept="image/*" multiple hidden @change="onFiles" />
          </label>
          <button class="sp-btn" style="align-self: flex-end" @click="uploadDate = ''">
            Брать дату из EXIF
          </button>
        </div>
      </div>

      <!-- Сетка -->
      <div v-if="mode === 'grid'" class="sp-card">
        <div v-if="!photos.length" class="sp-empty">Кадров пока нет</div>
        <div class="sp-grid-photos" :class="{ 'is-blur': blurred }">
          <div v-for="p in photos" :key="p.id" class="sp-tile">
            <img :src="thumb(p)" @click="openViewer(p)" />
            <div class="sp-tile-bar">
              <span class="sp-muted">{{ p.date.slice(5) }}</span>
              <select
                class="sp-select sp-tile-slot"
                :value="p.slotId || ''"
                @change="assignSlot(p, $event.target.value)"
              >
                <option value="">—</option>
                <option v-for="s in slots" :key="s.id" :value="s.id">{{ s.title }}</option>
              </select>
              <button class="sp-btn sp-btn-sm is-danger" @click="remove(p)">✕</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Таймлапс -->
      <div v-else-if="mode === 'timelapse'" class="sp-card">
        <div v-if="!timelapse.length" class="sp-empty">Кадров пока нет</div>
        <template v-else>
          <div class="sp-row">
            <button class="sp-btn" @click="frame = Math.max(0, frame - 1)">←</button>
            <button class="sp-btn is-primary" @click="play">{{ playing ? "❚❚" : "▶" }}</button>
            <button class="sp-btn" @click="frame = Math.min(timelapse.length - 1, frame + 1)">→</button>
            <input
              v-model.number="frame"
              type="range"
              min="0"
              :max="timelapse.length - 1"
              style="flex: 1"
            />
            <strong>{{ currentDay?.date }}</strong>
            <select v-model.number="speed" class="sp-select" style="max-width: 120px">
              <option :value="120">быстро</option>
              <option :value="300">обычно</option>
              <option :value="700">медленно</option>
            </select>
          </div>
          <div class="sp-frames">
            <div v-for="p in dayPhotos" :key="p.id" class="sp-frame">
              <img :src="thumb(p)" @click="openViewer(p)" />
              <div class="sp-muted">{{ p.slotTitle || "без ракурса" }}</div>
            </div>
          </div>
          <div class="sp-muted">
            Кадр {{ frame + 1 }} из {{ timelapse.length }} · дни без съёмки пропускаются
          </div>
        </template>
      </div>

      <!-- Сравнение -->
      <div v-else class="sp-card">
        <div v-if="timelapse.length < 2" class="sp-empty">Нужно минимум два дня со съёмкой</div>
        <template v-else>
          <div class="sp-row">
            <div class="sp-field" style="flex: 1">
              <label>До: {{ timelapse[beforeIndex]?.date }}</label>
              <input v-model.number="beforeIndex" type="range" min="0" :max="timelapse.length - 1" />
            </div>
            <div class="sp-field" style="flex: 1">
              <label>После: {{ timelapse[afterIndex]?.date }}</label>
              <input v-model.number="afterIndex" type="range" min="0" :max="timelapse.length - 1" />
            </div>
          </div>
          <div class="sp-wipe">
            <img
              v-if="timelapse[beforeIndex]?.photos?.[0]"
              :src="thumb(timelapse[beforeIndex].photos[0])"
              class="sp-wipe-img"
            />
            <div class="sp-wipe-top" :style="{ width: wipe + '%' }">
              <img
                v-if="timelapse[afterIndex]?.photos?.[0]"
                :src="thumb(timelapse[afterIndex].photos[0])"
                class="sp-wipe-img"
              />
            </div>
          </div>
          <input v-model.number="wipe" type="range" min="0" max="100" style="width: 100%" />
          <div class="sp-muted">
            Слева — кадр «после», справа — «до». Ползунок двигает шторку.
          </div>
        </template>
      </div>
    </template>

    <div v-if="viewer" class="sp-modal-backdrop" @click.self="closeViewer">
      <div class="sp-viewer">
        <img :src="viewer.url" />
        <div class="sp-row" style="justify-content: center; padding: 8px">
          <span class="sp-muted">
            {{ viewer.photo.date }} · {{ viewer.photo.width }}×{{ viewer.photo.height }} ·
            {{ Math.round(viewer.photo.size / 1024) }} КБ
            <template v-if="viewer.photo.originalSize">
              (было {{ Math.round(viewer.photo.originalSize / 1024) }} КБ)
            </template>
          </span>
          <button class="sp-btn sp-btn-sm" @click="closeViewer">Закрыть</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp-lock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px;
  text-align: center;
}

.sp-grid-photos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.sp-grid-photos.is-blur img {
  filter: blur(14px);
}

.sp-tile img {
  width: 100%;
  border-radius: 8px;
  cursor: pointer;
  display: block;
}

.sp-tile-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.sp-tile-slot {
  min-height: 24px;
  padding: 2px 4px;
  font-size: 11px;
  flex: 1;
}

.sp-frames {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.sp-frame img {
  max-height: 420px;
  border-radius: 10px;
  cursor: pointer;
  display: block;
}

.sp-wipe {
  position: relative;
  display: inline-block;
  margin: 12px 0;
  max-width: 100%;
}

.sp-wipe-img {
  max-height: 460px;
  display: block;
  border-radius: 10px;
}

.sp-wipe-top {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-right: 2px solid #6e4aff;
}

.sp-viewer {
  background: #1e2027;
  border: 1px solid #2a2d38;
  border-radius: 12px;
  max-width: 94vw;
  max-height: 94vh;
  overflow: auto;
}

.sp-viewer img {
  max-width: 100%;
  max-height: 82vh;
  display: block;
}
</style>
