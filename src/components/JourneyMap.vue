<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import {
  fetchJourneyMonth,
  upsertJourneyDay,
  updateJourneySettings,
  fetchTasks,
  createJourneySticker,
  updateJourneySticker,
  deleteJourneySticker,
  createJourneyMusic,
  deleteJourneyMusic,
} from "./api.js";

const router = useRouter();

// --- State ---
const today = new Date();
const currentMonth = ref(today.getMonth() + 1);
const currentYear = ref(today.getFullYear());
const monthData = ref(null);
const loading = ref(false);
const selectedDay = ref(null);
const showDayModal = ref(false);
const showSettingsModal = ref(false);
const showStickerModal = ref(false);
const showMusicModal = ref(false);

// Day form
const dayForm = ref({
  description: "",
  hours: 0,
  tasks: [],
});

// Custom task input
const customTaskInput = ref("");

// Settings form
const settingsForm = ref({
  backgroundImage: "",
  backgroundOpacity: 0.3,
});

// Sticker form
const stickerForm = ref({ url: "" });

// Music form
const musicForm = ref({ title: "", url: "" });

// Available subtasks from main tasks
const availableTasks = ref([]);
const taskSearchQuery = ref("");

// Sticker drag state
const draggingSticker = ref(null);
const dragOffset = ref({ x: 0, y: 0 });

// Music player
const audioRef = ref(null);
const isPlaying = ref(false);
const currentTrackIndex = ref(0);
const isMuted = ref(false);
const showMusicPlayer = ref(true);

// Seeded random for consistent chaos per month
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// --- Computed ---
const daysInMonth = computed(() => monthData.value?.daysInMonth || 30);

const daysMap = computed(() => {
  const map = {};
  if (monthData.value?.days) {
    for (const d of monthData.value.days) map[d.day] = d;
  }
  return map;
});

const stickers = computed(() => monthData.value?.stickers || []);
const musicTracks = computed(() => monthData.value?.music || []);
const settings = computed(() => monthData.value?.settings || null);

const backgroundStyle = computed(() => {
  const s = settings.value;
  if (s?.backgroundImage) {
    return {
      backgroundImage: `url(${s.backgroundImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      opacity: s.backgroundOpacity || 0.3,
    };
  }
  return { background: "#0a0a0f", opacity: 1 };
});

const monthNames = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const currentMonthName = computed(() => monthNames[currentMonth.value - 1]);

const todayDay = computed(() => {
  const now = new Date();
  if (now.getMonth() + 1 === currentMonth.value && now.getFullYear() === currentYear.value) {
    return now.getDate();
  }
  return -1;
});

const currentTrack = computed(() => {
  const tracks = musicTracks.value;
  if (!tracks.length) return null;
  return tracks[currentTrackIndex.value % tracks.length];
});

// Snake path with ~80% width, more chaotic but seeded (stable per month)
const ITEMS_PER_ROW = 6;
const nodePositions = computed(() => {
  const positions = [];
  const total = daysInMonth.value;
  const rng = seededRandom(currentMonth.value * 1000 + currentYear.value);

  // 80% of viewport width -> use vw-like percentages mapped to SVG coords
  // SVG viewBox will be 1000 wide, representing ~80vw
  const usableWidth = 900;
  const padding = 50;
  const spacingX = usableWidth / (ITEMS_PER_ROW - 1);
  const spacingY = 120;

  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / ITEMS_PER_ROW);
    const col = i % ITEMS_PER_ROW;
    const isReversed = row % 2 === 1;
    const actualCol = isReversed ? ITEMS_PER_ROW - 1 - col : col;

    // Chaotic offsets — seeded so they stay consistent
    const chaosX = (rng() - 0.5) * 50;
    const chaosY = (rng() - 0.5) * 35;
    const waveOffset = Math.sin((i / total) * Math.PI * 3.5) * 18;

    positions.push({
      x: padding + actualCol * spacingX + chaosX,
      y: padding + row * spacingY + waveOffset + chaosY,
      day: i + 1,
    });
  }
  return positions;
});

const svgWidth = computed(() => 1000);
const svgHeight = computed(() => {
  const rows = Math.ceil(daysInMonth.value / ITEMS_PER_ROW);
  return rows * 120 + 140;
});

// SVG path between nodes
const pathD = computed(() => {
  const pts = nodePositions.value;
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    // Smooth cubic bezier
    const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
    const cpy1 = prev.y + (curr.y - prev.y) * 0.1;
    const cpx2 = prev.x + (curr.x - prev.x) * 0.6;
    const cpy2 = prev.y + (curr.y - prev.y) * 0.9;
    d += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
  }
  return d;
});

const filteredTasks = computed(() => {
  if (!taskSearchQuery.value) return availableTasks.value.slice(0, 20);
  const q = taskSearchQuery.value.toLowerCase();
  return availableTasks.value
    .filter((t) => t.title.toLowerCase().includes(q))
    .slice(0, 20);
});

// --- Methods ---
async function loadMonth() {
  loading.value = true;
  try {
    monthData.value = await fetchJourneyMonth(currentMonth.value, currentYear.value);
    if (monthData.value?.settings) {
      settingsForm.value.backgroundImage = monthData.value.settings.backgroundImage || "";
      settingsForm.value.backgroundOpacity = monthData.value.settings.backgroundOpacity || 0.3;
    }
    // Reset music player to first track of new month
    currentTrackIndex.value = 0;
    stopMusic();
  } catch (e) {
    console.error("Failed to load journey month:", e);
  } finally {
    loading.value = false;
  }
}

async function loadAvailableTasks() {
  try {
    const dateRef = ref(new Date(currentYear.value, currentMonth.value - 1, 1));
    const tasks = await fetchTasks(dateRef);
    const flat = [];
    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        if (t.subtasks?.length) {
          for (const sub of t.subtasks) {
            flat.push({ id: sub.id, title: `${t.title} → ${sub.title}` });
          }
        } else {
          flat.push({ id: t.id, title: t.title });
        }
      }
    }
    availableTasks.value = flat;
  } catch (e) {
    console.error("Failed to load tasks:", e);
  }
}

function prevMonth() {
  currentMonth.value === 1
    ? ((currentMonth.value = 12), currentYear.value--)
    : currentMonth.value--;
}

function nextMonth() {
  currentMonth.value === 12
    ? ((currentMonth.value = 1), currentYear.value++)
    : currentMonth.value++;
}

// --- Day modal ---
function openDayModal(day) {
  selectedDay.value = day;
  const existing = daysMap.value[day];
  if (existing) {
    dayForm.value = {
      description: existing.description || "",
      hours: existing.hours || 0,
      tasks: existing.tasks ? existing.tasks.map((t) => ({ ...t })) : [],
    };
  } else {
    dayForm.value = { description: "", hours: 0, tasks: [] };
  }
  customTaskInput.value = "";
  showDayModal.value = true;
}

function closeDayModal() {
  showDayModal.value = false;
  selectedDay.value = null;
}

async function saveDay() {
  const dateStr = `${currentYear.value}-${String(currentMonth.value).padStart(2, "0")}-${String(selectedDay.value).padStart(2, "0")}`;
  await upsertJourneyDay({
    date: dateStr,
    description: dayForm.value.description,
    hours: dayForm.value.hours,
    tasks: dayForm.value.tasks,
  });
  closeDayModal();
  await loadMonth();
}

function addTaskToDay(task) {
  if (!dayForm.value.tasks.find((t) => t.taskId === task.id)) {
    dayForm.value.tasks.push({ taskId: task.id, taskTitle: task.title, isCustom: false });
  }
  taskSearchQuery.value = "";
}

function addCustomTask() {
  const title = customTaskInput.value.trim();
  if (!title) return;
  dayForm.value.tasks.push({ taskId: null, taskTitle: title, isCustom: true });
  customTaskInput.value = "";
}

function removeTaskFromDay(idx) {
  dayForm.value.tasks.splice(idx, 1);
}

// --- Settings ---
async function saveSettings() {
  await updateJourneySettings({
    month: currentMonth.value,
    year: currentYear.value,
    backgroundImage: settingsForm.value.backgroundImage,
    backgroundOpacity: settingsForm.value.backgroundOpacity,
  });
  showSettingsModal.value = false;
  await loadMonth();
}

// --- Stickers ---
async function addSticker() {
  const url = stickerForm.value.url.trim();
  if (!url) return;
  await createJourneySticker({
    month: currentMonth.value,
    year: currentYear.value,
    url,
    x: 10 + Math.random() * 60,
    y: 20 + Math.random() * 40,
    width: 120,
    height: 120,
  });
  stickerForm.value.url = "";
  showStickerModal.value = false;
  await loadMonth();
}

async function removeSticker(id) {
  await deleteJourneySticker(id);
  await loadMonth();
}

function startStickerDrag(sticker, e) {
  draggingSticker.value = sticker;
  const rect = e.target.closest(".journey-sticker").getBoundingClientRect();
  dragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  e.preventDefault();
}

function onStickerDrag(e) {
  if (!draggingSticker.value) return;
  const wrapper = document.querySelector(".journey-wrapper");
  if (!wrapper) return;
  const wr = wrapper.getBoundingClientRect();
  const x = ((e.clientX - dragOffset.value.x - wr.left) / wr.width) * 100;
  const y = ((e.clientY - dragOffset.value.y - wr.top) / wr.height) * 100;
  draggingSticker.value.x = Math.max(0, Math.min(95, x));
  draggingSticker.value.y = Math.max(0, Math.min(95, y));
}

async function endStickerDrag() {
  if (!draggingSticker.value) return;
  const s = draggingSticker.value;
  await updateJourneySticker(s.id, { x: s.x, y: s.y, width: s.width, height: s.height });
  draggingSticker.value = null;
}

// --- Music ---
async function addMusic() {
  const url = musicForm.value.url.trim();
  const title = musicForm.value.title.trim() || "Без названия";
  if (!url) return;
  await createJourneyMusic({
    month: currentMonth.value,
    year: currentYear.value,
    title,
    url,
    position: musicTracks.value.length,
  });
  musicForm.value = { title: "", url: "" };
  showMusicModal.value = false;
  await loadMonth();
}

async function removeMusic(id) {
  await deleteJourneyMusic(id);
  await loadMonth();
}

function togglePlay() {
  if (!audioRef.value || !currentTrack.value) return;
  if (isPlaying.value) {
    audioRef.value.pause();
    isPlaying.value = false;
  } else {
    audioRef.value.src = currentTrack.value.url;
    audioRef.value.play().catch(() => {});
    isPlaying.value = true;
  }
}

function stopMusic() {
  if (audioRef.value) {
    audioRef.value.pause();
    audioRef.value.currentTime = 0;
  }
  isPlaying.value = false;
}

function nextTrack() {
  if (!musicTracks.value.length) return;
  currentTrackIndex.value = (currentTrackIndex.value + 1) % musicTracks.value.length;
  if (isPlaying.value) {
    nextTick(() => {
      audioRef.value.src = currentTrack.value.url;
      audioRef.value.play().catch(() => {});
    });
  }
}

function prevTrack() {
  if (!musicTracks.value.length) return;
  currentTrackIndex.value = (currentTrackIndex.value - 1 + musicTracks.value.length) % musicTracks.value.length;
  if (isPlaying.value) {
    nextTick(() => {
      audioRef.value.src = currentTrack.value.url;
      audioRef.value.play().catch(() => {});
    });
  }
}

function toggleMute() {
  if (audioRef.value) {
    isMuted.value = !isMuted.value;
    audioRef.value.muted = isMuted.value;
  }
}

function onTrackEnded() {
  nextTrack();
}

// --- Helpers ---
function getRingColors(count) {
  const colors = ["#4ade80", "#60a5fa", "#f472b6", "#facc15", "#a78bfa", "#fb923c", "#34d399", "#f87171"];
  return colors.slice(0, Math.min(count, colors.length));
}

function getDayNodeClass(day) {
  const classes = ["journey-node"];
  if (day === todayDay.value) classes.push("journey-node--today");
  if (daysMap.value[day]) classes.push("journey-node--filled");
  if (day === daysInMonth.value) classes.push("journey-node--last");
  return classes.join(" ");
}

// --- Lifecycle ---
onMounted(() => {
  loadMonth();
  loadAvailableTasks();
  window.addEventListener("mousemove", onStickerDrag);
  window.addEventListener("mouseup", endStickerDrag);
});

onBeforeUnmount(() => {
  stopMusic();
  window.removeEventListener("mousemove", onStickerDrag);
  window.removeEventListener("mouseup", endStickerDrag);
});

watch([currentMonth, currentYear], () => {
  loadMonth();
  loadAvailableTasks();
});
</script>

<template>
  <div class="journey-wrapper">
    <!-- Background layer -->
    <div class="journey-bg" :style="backgroundStyle"></div>

    <!-- Stickers layer (behind nodes, above bg) -->
    <div
      v-for="sticker in stickers"
      :key="sticker.id"
      class="journey-sticker"
      :style="{
        left: sticker.x + '%',
        top: sticker.y + '%',
        width: sticker.width + 'px',
        height: sticker.height + 'px',
      }"
      @mousedown="startStickerDrag(sticker, $event)"
    >
      <img :src="sticker.url" alt="" draggable="false" />
      <button class="sticker-delete" @click.stop="removeSticker(sticker.id)" title="Удалить">×</button>
    </div>

    <!-- Content -->
    <div class="journey-content">
      <!-- Header -->
      <div class="journey-header" :style="settings?.backgroundImage ? { background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)' } : {}">
        <button class="journey-back-btn" @click="router.push('/')" title="На главную">←</button>

        <button class="journey-nav-btn" @click="prevMonth">◀</button>
        <div class="journey-month-title">
          <span class="journey-month-name">{{ currentMonthName }}</span>
          <span class="journey-year">{{ currentYear }}</span>
        </div>
        <button class="journey-nav-btn" @click="nextMonth">▶</button>

        <div class="journey-header-actions">
          <button class="journey-icon-btn" @click="showStickerModal = true" title="Добавить гифку">🖼️</button>
          <button class="journey-icon-btn" @click="showMusicModal = true" title="Музыка">🎵</button>
          <button class="journey-icon-btn" @click="showSettingsModal = true" title="Настройки фона">⚙️</button>
        </div>
      </div>

      <!-- Map -->
      <div class="journey-map-scroll">
        <svg
          class="journey-svg"
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
          preserveAspectRatio="xMidYMin meet"
        >
          <!-- Path connecting nodes -->
          <path
            :d="pathD"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            stroke-width="2.5"
            stroke-dasharray="8 5"
            stroke-linecap="round"
          />

          <!-- Walked path (up to today) -->
          <path
            v-if="todayDay > 0"
            :d="pathD"
            fill="none"
            stroke="rgba(74, 222, 128, 0.35)"
            stroke-width="2.5"
            :stroke-dasharray="`${(todayDay / daysInMonth) * 100}% 9999`"
            stroke-linecap="round"
          />

          <!-- Day nodes -->
          <g v-for="pos in nodePositions" :key="pos.day">
            <!-- Rings (completed tasks) -->
            <circle
              v-for="(color, ri) in getRingColors(daysMap[pos.day]?.ringCount || 0)"
              :key="ri"
              :cx="pos.x"
              :cy="pos.y"
              :r="22 + (ri + 1) * 5"
              fill="none"
              :stroke="color"
              stroke-width="2.5"
              :opacity="0.7"
            />

            <!-- Main node circle -->
            <circle
              :cx="pos.x"
              :cy="pos.y"
              r="20"
              :class="getDayNodeClass(pos.day)"
              @click="openDayModal(pos.day)"
              style="cursor: pointer"
            />

            <!-- Day number -->
            <text
              :x="pos.x"
              :y="pos.y + 1"
              text-anchor="middle"
              dominant-baseline="central"
              class="journey-day-text"
              @click="openDayModal(pos.day)"
              style="cursor: pointer"
            >
              {{ pos.day }}
            </text>

            <!-- Last day dots -->
            <g v-if="pos.day === daysInMonth">
              <circle :cx="pos.x + 35" :cy="pos.y" r="3" fill="rgba(255,255,255,0.4)" />
              <circle :cx="pos.x + 47" :cy="pos.y" r="3" fill="rgba(255,255,255,0.3)" />
              <circle :cx="pos.x + 59" :cy="pos.y" r="3" fill="rgba(255,255,255,0.2)" />
            </g>
          </g>

          <!-- Character on today -->
          <g v-if="todayDay > 0 && nodePositions[todayDay - 1]">
            <text
              :x="nodePositions[todayDay - 1].x"
              :y="nodePositions[todayDay - 1].y - 34"
              text-anchor="middle"
              class="journey-character"
            >
              🧙
            </text>
          </g>
        </svg>
      </div>

      <!-- Previous month link -->
      <div class="journey-prev-link">
        ← соединено с {{ monthNames[(currentMonth - 2 + 12) % 12] }}
      </div>
    </div>

    <!-- Music player bar (bottom) -->
    <div class="journey-music-bar" v-if="musicTracks.length && showMusicPlayer">
      <audio ref="audioRef" @ended="onTrackEnded" />
      <button class="music-btn" @click="prevTrack" title="Предыдущий">⏮</button>
      <button class="music-btn music-btn--play" @click="togglePlay">
        {{ isPlaying ? '⏸' : '▶' }}
      </button>
      <button class="music-btn" @click="nextTrack" title="Следующий">⏭</button>
      <div class="music-track-name">{{ currentTrack?.title || '...' }}</div>
      <button class="music-btn" @click="toggleMute" :title="isMuted ? 'Включить звук' : 'Выключить звук'">
        {{ isMuted ? '🔇' : '🔊' }}
      </button>
      <button class="music-btn music-btn--close" @click="showMusicPlayer = false" title="Скрыть">✕</button>
    </div>
    <button
      v-if="musicTracks.length && !showMusicPlayer"
      class="music-show-btn"
      @click="showMusicPlayer = true"
    >🎵</button>

    <!-- Day Modal -->
    <transition name="modal-fade">
      <div v-if="showDayModal" class="modal-overlay" @click.self="closeDayModal">
        <div class="modal-card journey-modal">
          <button class="modal-close" @click="closeDayModal">×</button>
          <div class="modal-content">
            <h2 class="modal-title">
              {{ selectedDay }} {{ currentMonthName }} {{ currentYear }}
            </h2>

            <div class="journey-form-group">
              <label class="journey-label">Чем занимался?</label>
              <textarea
                v-model="dayForm.description"
                class="form-textarea"
                rows="3"
                placeholder="Опиши свой день..."
              ></textarea>
            </div>

            <div class="journey-form-group">
              <label class="journey-label">Часы</label>
              <input
                v-model.number="dayForm.hours"
                type="number"
                class="form-input"
                min="0"
                max="24"
                step="0.5"
              />
            </div>

            <!-- Custom task -->
            <div class="journey-form-group">
              <label class="journey-label">Свободная задача (не привязана к основным)</label>
              <div class="journey-custom-task-row">
                <input
                  v-model="customTaskInput"
                  type="text"
                  class="form-input"
                  placeholder="Что сделал..."
                  @keyup.enter="addCustomTask"
                />
                <button class="journey-add-custom-btn" @click="addCustomTask">+</button>
              </div>
            </div>

            <!-- Linked tasks -->
            <div class="journey-form-group">
              <label class="journey-label">Привязать подзадачу из основных</label>
              <input
                v-model="taskSearchQuery"
                type="text"
                class="form-input"
                placeholder="Поиск задач..."
              />
              <div class="journey-task-list" v-if="taskSearchQuery">
                <button
                  v-for="task in filteredTasks"
                  :key="task.id"
                  class="journey-task-option"
                  @click="addTaskToDay(task)"
                >
                  + {{ task.title }}
                </button>
              </div>
            </div>

            <!-- All added tasks (rings preview) -->
            <div v-if="dayForm.tasks.length" class="journey-added-tasks">
              <div class="journey-label">Кольца дня ({{ dayForm.tasks.length }}):</div>
              <div
                v-for="(t, idx) in dayForm.tasks"
                :key="idx"
                class="journey-added-task"
              >
                <span
                  class="journey-ring-dot"
                  :style="{ background: getRingColors(dayForm.tasks.length)[idx] || '#888' }"
                ></span>
                <span class="journey-task-title-text">{{ t.taskTitle }}</span>
                <span v-if="t.isCustom" class="journey-custom-badge">свободная</span>
                <button class="journey-remove-task" @click="removeTaskFromDay(idx)">×</button>
              </div>
            </div>

            <button class="journey-save-btn" @click="saveDay">Сохранить</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Settings Modal -->
    <transition name="modal-fade">
      <div v-if="showSettingsModal" class="modal-overlay" @click.self="showSettingsModal = false">
        <div class="modal-card journey-modal">
          <button class="modal-close" @click="showSettingsModal = false">×</button>
          <div class="modal-content">
            <h2 class="modal-title">Настройки фона</h2>

            <div class="journey-form-group">
              <label class="journey-label">URL фонового изображения</label>
              <input
                v-model="settingsForm.backgroundImage"
                type="text"
                class="form-input"
                placeholder="https://..."
              />
            </div>

            <div class="journey-form-group">
              <label class="journey-label">
                Прозрачность: {{ (settingsForm.backgroundOpacity * 100).toFixed(0) }}%
              </label>
              <input
                v-model.number="settingsForm.backgroundOpacity"
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                class="journey-range"
              />
            </div>

            <div
              v-if="settingsForm.backgroundImage"
              class="journey-bg-preview"
              :style="{
                backgroundImage: `url(${settingsForm.backgroundImage})`,
                opacity: settingsForm.backgroundOpacity,
              }"
            ></div>

            <button class="journey-save-btn" @click="saveSettings">Сохранить</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Add Sticker Modal -->
    <transition name="modal-fade">
      <div v-if="showStickerModal" class="modal-overlay" @click.self="showStickerModal = false">
        <div class="modal-card journey-modal">
          <button class="modal-close" @click="showStickerModal = false">×</button>
          <div class="modal-content">
            <h2 class="modal-title">Добавить гифку</h2>

            <div class="journey-form-group">
              <label class="journey-label">URL гифки</label>
              <input
                v-model="stickerForm.url"
                type="text"
                class="form-input"
                placeholder="https://...gif"
                @keyup.enter="addSticker"
              />
            </div>

            <div v-if="stickerForm.url" class="journey-sticker-preview">
              <img :src="stickerForm.url" alt="preview" />
            </div>

            <!-- List of current stickers -->
            <div v-if="stickers.length" class="journey-form-group">
              <label class="journey-label">Текущие гифки ({{ stickers.length }}):</label>
              <div v-for="s in stickers" :key="s.id" class="journey-sticker-list-item">
                <img :src="s.url" alt="" class="sticker-thumb" />
                <button class="journey-remove-task" @click="removeSticker(s.id)">×</button>
              </div>
            </div>

            <button class="journey-save-btn" @click="addSticker">Добавить</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Add Music Modal -->
    <transition name="modal-fade">
      <div v-if="showMusicModal" class="modal-overlay" @click.self="showMusicModal = false">
        <div class="modal-card journey-modal">
          <button class="modal-close" @click="showMusicModal = false">×</button>
          <div class="modal-content">
            <h2 class="modal-title">Музыка месяца</h2>

            <div class="journey-form-group">
              <label class="journey-label">Название</label>
              <input
                v-model="musicForm.title"
                type="text"
                class="form-input"
                placeholder="My track"
              />
            </div>

            <div class="journey-form-group">
              <label class="journey-label">URL mp3</label>
              <input
                v-model="musicForm.url"
                type="text"
                class="form-input"
                placeholder="https://...mp3"
                @keyup.enter="addMusic"
              />
            </div>

            <!-- Current playlist -->
            <div v-if="musicTracks.length" class="journey-form-group">
              <label class="journey-label">Плейлист ({{ musicTracks.length }}):</label>
              <div v-for="t in musicTracks" :key="t.id" class="journey-music-list-item">
                <span class="music-list-title">🎵 {{ t.title }}</span>
                <button class="journey-remove-task" @click="removeMusic(t.id)">×</button>
              </div>
            </div>

            <button class="journey-save-btn" @click="addMusic">Добавить трек</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.journey-wrapper {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #0a0a0f;
}

.journey-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  transition: opacity 0.5s;
}

.journey-content {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ===== Header ===== */
.journey-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 14px 24px;
  background: rgba(10, 10, 15, 0.7);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  z-index: 10;
}

.journey-back-btn {
  position: absolute;
  left: 20px;
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.3);
  color: #fff;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.journey-back-btn:hover {
  background: rgba(23, 103, 253, 0.25);
  border-color: rgba(23, 103, 253, 0.6);
}

.journey-nav-btn {
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.3);
  color: #fff;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.journey-nav-btn:hover {
  background: rgba(23, 103, 253, 0.25);
  border-color: rgba(23, 103, 253, 0.6);
}

.journey-month-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 140px;
}

.journey-month-name {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 2px;
}

.journey-year {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.journey-header-actions {
  position: absolute;
  right: 20px;
  display: flex;
  gap: 6px;
}

.journey-icon-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
}

.journey-icon-btn:hover {
  background: rgba(23, 103, 253, 0.15);
  border-color: rgba(23, 103, 253, 0.4);
}

/* ===== Map ===== */
.journey-map-scroll {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px 10%;
}

.journey-svg {
  width: 80%;
  max-width: 1200px;
  height: auto;
  filter: drop-shadow(0 0 20px rgba(23, 103, 253, 0.08));
}

/* Node styles */
:deep(.journey-node) {
  fill: rgba(18, 19, 31, 0.9);
  stroke: rgba(255, 255, 255, 0.2);
  stroke-width: 2;
  transition: all 0.3s;
}

:deep(.journey-node:hover) {
  stroke: rgba(23, 103, 253, 0.8);
  stroke-width: 3;
  filter: drop-shadow(0 0 8px rgba(23, 103, 253, 0.4));
}

:deep(.journey-node--today) {
  fill: rgba(23, 103, 253, 0.3);
  stroke: #4ade80;
  stroke-width: 3;
  filter: drop-shadow(0 0 12px rgba(74, 222, 128, 0.5));
}

:deep(.journey-node--filled) {
  fill: rgba(23, 103, 253, 0.15);
  stroke: rgba(23, 103, 253, 0.5);
}

:deep(.journey-node--last) {
  stroke: rgba(255, 255, 255, 0.4);
  stroke-dasharray: 4 3;
}

:deep(.journey-day-text) {
  fill: #fff;
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
  pointer-events: none;
  user-select: none;
}

:deep(.journey-character) {
  font-size: 28px;
  filter: drop-shadow(0 0 6px rgba(255, 200, 50, 0.6));
  animation: journey-bounce 1.5s ease-in-out infinite;
}

@keyframes journey-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.journey-prev-link {
  text-align: center;
  padding: 8px;
  color: rgba(255, 255, 255, 0.25);
  font-size: 11px;
  font-style: italic;
}

/* ===== Stickers ===== */
.journey-sticker {
  position: absolute;
  z-index: 1;
  cursor: grab;
  user-select: none;
  transition: box-shadow 0.2s;
}

.journey-sticker:active {
  cursor: grabbing;
  z-index: 100;
}

.journey-sticker img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  border-radius: 4px;
}

.sticker-delete {
  position: absolute;
  top: -8px;
  right: -8px;
  background: rgba(248, 113, 113, 0.9);
  border: none;
  color: #fff;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 12px;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.journey-sticker:hover .sticker-delete {
  display: flex;
}

.journey-sticker-preview {
  text-align: center;
  margin-bottom: 12px;
}

.journey-sticker-preview img {
  max-width: 150px;
  max-height: 150px;
  border-radius: 8px;
  border: 1px solid rgba(23, 103, 253, 0.2);
}

.journey-sticker-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.sticker-thumb {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.1);
}

/* ===== Music player bar ===== */
.journey-music-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 24px;
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(23, 103, 253, 0.15);
}

.music-btn {
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.2);
  color: #fff;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.music-btn:hover {
  background: rgba(23, 103, 253, 0.2);
}

.music-btn--play {
  width: 40px;
  height: 40px;
  font-size: 16px;
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border-color: transparent;
}

.music-btn--close {
  margin-left: auto;
  width: 28px;
  height: 28px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.music-track-name {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-show-btn {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 50;
  background: rgba(23, 103, 253, 0.15);
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 50%;
  width: 44px;
  height: 44px;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.music-show-btn:hover {
  background: rgba(23, 103, 253, 0.3);
}

.journey-music-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  color: #b7c9d1;
}

.music-list-title {
  flex: 1;
}

/* ===== Modal styles ===== */
.journey-modal {
  max-width: 500px;
  max-height: 85vh;
  overflow-y: auto;
}

.journey-form-group {
  margin-bottom: 16px;
}

.journey-label {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  margin-bottom: 6px;
  font-weight: 500;
}

.journey-custom-task-row {
  display: flex;
  gap: 8px;
}

.journey-add-custom-btn {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  color: #fff;
  width: 38px;
  border-radius: 10px;
  font-size: 20px;
  cursor: pointer;
  flex-shrink: 0;
}

.journey-task-list {
  max-height: 150px;
  overflow-y: auto;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.journey-task-option {
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.15);
  border-radius: 6px;
  color: #b7c9d1;
  padding: 6px 10px;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.journey-task-option:hover {
  background: rgba(23, 103, 253, 0.15);
  color: #fff;
}

.journey-added-tasks {
  margin-bottom: 16px;
}

.journey-added-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  color: #b7c9d1;
}

.journey-task-title-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journey-ring-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.journey-custom-badge {
  font-size: 10px;
  color: #facc15;
  background: rgba(250, 204, 21, 0.1);
  border: 1px solid rgba(250, 204, 21, 0.3);
  border-radius: 4px;
  padding: 1px 5px;
  flex-shrink: 0;
}

.journey-remove-task {
  background: none;
  border: none;
  color: #f87171;
  cursor: pointer;
  font-size: 16px;
  flex-shrink: 0;
}

.journey-save-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
}

.journey-save-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.journey-range {
  width: 100%;
  accent-color: #1767fd;
}

.journey-bg-preview {
  width: 100%;
  height: 100px;
  background-size: cover;
  background-position: center;
  border-radius: 10px;
  margin-bottom: 12px;
  border: 1px solid rgba(23, 103, 253, 0.2);
}
</style>
