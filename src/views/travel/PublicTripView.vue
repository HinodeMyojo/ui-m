<script setup>
// Поездка глазами гостя: заходит по ссылке, называет имя и работает
// без регистрации. Что можно — определяет роль ссылки.
// Спецификация: docs/travel-module.md, раздел 2.7.
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useRoute } from "vue-router";
import TravelMap from "@/components/travel/TravelMap.vue";
import {
  joinSharedTrip,
  fetchSharedTrip,
  fetchSharedPulse,
  sharedCreatePoint,
  sharedUpdatePoint,
  sharedDeletePoint,
  sharedCreateComment,
  sharedDeleteComment,
  sharedToggleReaction,
  sharedAcquireLock,
  sharedReleaseLock,
} from "@/components/api.js";

const route = useRoute();
const token = route.params.token;

const data = ref(null);
const loading = ref(true);
const error = ref("");
const notice = ref("");

const needName = ref(false);
const nameInput = ref("");
const joining = ref(false);

const dayIndex = ref(0);
const selectedPointId = ref("");
const openPointId = ref("");
const mapRef = ref(null);
const mobilePane = ref("list");

const editing = ref(null);
const editForm = ref({});
const commentText = ref("");
const commentTarget = ref(null);

const version = ref(0);
let pulseTimer = null;
let typingUntil = 0;

const REACTIONS = ["👍", "👎", "❤️", "🤔"];

const trip = computed(() => data.value?.trip || null);
const role = computed(() => data.value?.role || "view");
const canEdit = computed(() => role.value === "suggest" || role.value === "full");

const days = computed(() => trip.value?.days || []);
const currentDay = computed(() => days.value[dayIndex.value] || null);
const currentVariant = computed(() => {
  const day = currentDay.value;
  if (!day || !day.variants.length) return null;
  return day.variants.find((v) => v.isPrimary) || day.variants[0];
});

const markers = computed(() => {
  const variant = currentVariant.value;
  if (!variant) return [];
  const result = [];
  variant.steps.forEach((step, i) => {
    step.points.forEach((point) => {
      if (point.lat == null || point.lng == null) return;
      const main = mainPointOf(step)?.id === point.id;
      result.push({
        id: point.id,
        lat: point.lat,
        lng: point.lng,
        title: point.title,
        color: point.status === "visited" ? "#22c55e" : "#1767fd",
        icon: "mdi-map-marker",
        dimmed: !main,
        badge: main ? String(i + 1) : "",
      });
    });
  });
  return result;
});

const lines = computed(() => {
  const variant = currentVariant.value;
  if (!variant) return [];
  const result = [];
  let previous = null;
  variant.steps.forEach((step) => {
    const point = mainPointOf(step);
    if (!point || point.lat == null) return;
    if (previous) {
      result.push({
        id: `${step.id}`,
        color: step.transport?.color || "#1767fd",
        points: [[previous.lat, previous.lng], [point.lat, point.lng]],
      });
    }
    previous = point;
  });
  return result;
});

const bbox = computed(() => {
  const country = trip.value?.country;
  if (!country) return null;
  return [country.bboxMinLat, country.bboxMinLng, country.bboxMaxLat, country.bboxMaxLng];
});

function mainPointOf(step) {
  if (!step.points.length) return null;
  if (step.chosenPointId) {
    const chosen = step.points.find((p) => p.id === step.chosenPointId);
    if (chosen) return chosen;
  }
  return step.points[0];
}

function commentsFor(targetId) {
  return (data.value?.comments || []).filter((c) => c.targetId === targetId);
}

function reactionsFor(targetId) {
  return (data.value?.reactions || []).filter((r) => r.targetId === targetId);
}

function lockFor(pointId) {
  return (locks.value || []).find((l) => l.targetId === pointId && !l.mine) || null;
}

const locks = ref([]);
const online = ref([]);

function formatTime(minutes) {
  if (minutes == null || minutes < 0) return "";
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    data.value = await fetchSharedTrip(token);
    version.value = data.value.trip?.version || 0;
    // Без имени сервер отдаёт только просмотр — предложим представиться.
    needName.value = !data.value.guestId;
  } catch (e) {
    error.value = e.message || "ссылка не работает";
  } finally {
    loading.value = false;
  }
}

async function join() {
  if (!nameInput.value.trim()) return;
  joining.value = true;
  try {
    await joinSharedTrip(token, nameInput.value.trim());
    needName.value = false;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось войти";
  } finally {
    joining.value = false;
  }
}

// Опрос раз в три секунды. Пока идёт правка, экран не перерисовываем:
// иначе форма прыгала бы под руками.
function startPulse() {
  pulseTimer = setInterval(async () => {
    try {
      const pulse = await fetchSharedPulse(token, version.value);
      locks.value = pulse.locks;
      online.value = pulse.online;
      if (pulse.changed && Date.now() > typingUntil && !editing.value) {
        await load();
      }
    } catch {
      // Сеть моргнула — попробуем на следующем тике.
    }
  }, 3000);
}

function touchTyping() {
  // Пять секунд тишины после последнего действия — и можно обновляться.
  typingUntil = Date.now() + 5000;
}

// --- Правки ---

async function openEditor(point) {
  if (!canEdit.value) return;
  const lock = lockFor(point.id);
  if (lock) {
    error.value = `Сейчас редактирует ${lock.holderName}`;
    return;
  }
  try {
    await sharedAcquireLock(token, { targetType: "point", targetId: point.id });
  } catch (e) {
    error.value = e.message;
    return;
  }
  editing.value = point.id;
  editForm.value = { ...point, links: [...(point.links || [])] };
}

async function closeEditor() {
  if (editing.value) {
    await sharedReleaseLock(token, { targetType: "point", targetId: editing.value }).catch(() => {});
  }
  editing.value = null;
}

async function saveEdit() {
  try {
    const result = await sharedUpdatePoint(token, editing.value, editForm.value);
    notice.value = result.suggested
      ? "Правка ушла владельцу на согласование"
      : "Сохранено";
    await closeEditor();
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  }
}

async function removePoint(point) {
  if (!window.confirm(`Убрать «${point.title}» из маршрута?`)) return;
  try {
    await sharedDeletePoint(token, point.id);
    await load();
  } catch (e) {
    error.value = e.message || "не удалось удалить";
  }
}

async function addPoint() {
  const title = window.prompt("Что добавить?");
  if (!title) return;
  try {
    await sharedCreatePoint(token, { title, variantId: currentVariant.value.id });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось добавить";
  }
}

// --- Комментарии и реакции ---

async function sendComment(targetType, targetId) {
  if (!commentText.value.trim()) return;
  touchTyping();
  try {
    await sharedCreateComment(token, {
      targetType,
      targetId,
      text: commentText.value.trim(),
    });
    commentText.value = "";
    await load();
  } catch (e) {
    error.value = e.message || "не удалось отправить";
  }
}

async function removeComment(comment) {
  await sharedDeleteComment(token, comment.id).catch((e) => (error.value = e.message));
  await load();
}

async function react(targetType, targetId, emoji) {
  try {
    await sharedToggleReaction(token, { targetType, targetId, emoji });
    await load();
  } catch (e) {
    error.value = e.message || "не получилось";
  }
}

function selectPoint(id) {
  selectedPointId.value = id;
  mapRef.value?.focusMarker(id);
  if (window.innerWidth <= 900) mobilePane.value = "map";
}

onMounted(async () => {
  await load();
  startPulse();
  await nextTick();
  mapRef.value?.invalidate();
});

onBeforeUnmount(() => {
  clearInterval(pulseTimer);
  if (editing.value) {
    sharedReleaseLock(token, { targetType: "point", targetId: editing.value }).catch(() => {});
  }
});
</script>

<template>
  <div class="pub">
    <!-- Представиться -->
    <div v-if="needName" class="pub-gate">
      <div class="pub-gate__card">
        <h1>{{ trip?.title || "Поездка" }}</h1>
        <p>Как тебя зовут? Имя будет видно рядом с твоими правками.</p>
        <input
          v-model="nameInput"
          class="pub-input"
          type="text"
          placeholder="Аня"
          autofocus
          @keydown.enter="join"
        />
        <button class="pub-primary" :disabled="joining" @click="join">
          {{ joining ? "Захожу…" : "Продолжить" }}
        </button>
        <button class="pub-ghost" @click="needName = false">Просто посмотреть</button>
        <p v-if="error" class="pub-error">{{ error }}</p>
      </div>
    </div>

    <template v-else>
      <header class="pub-header">
        <div class="pub-title">
          <h1>{{ trip?.title || "…" }}</h1>
          <span>
            {{ trip?.country?.emoji }} {{ trip?.country?.name }}
            <template v-if="trip?.startDate">· {{ trip.startDate }} — {{ trip.endDate }}</template>
          </span>
        </div>

        <div class="pub-who">
          <span v-if="data?.guestName" class="pub-me">{{ data.guestName }}</span>
          <span class="pub-role">
            {{ { view: "просмотр", suggest: "могу предлагать", full: "полный доступ" }[role] }}
          </span>
          <span v-for="g in online" :key="g.id" class="pub-online" :style="{ background: g.color }">
            {{ g.name.slice(0, 1) }}
          </span>
        </div>
      </header>

      <p v-if="error" class="pub-error" @click="error = ''">{{ error }}</p>
      <p v-if="notice" class="pub-notice" @click="notice = ''">{{ notice }}</p>
      <div v-if="loading" class="pub-empty">Загружаю…</div>

      <template v-else-if="trip">
        <nav class="pub-days">
          <button
            v-for="(day, i) in days"
            :key="day.id"
            :class="{ active: i === dayIndex }"
            @click="dayIndex = i"
          >
            {{ day.index }}
            <em v-if="day.date">{{ day.date.slice(8) }}.{{ day.date.slice(5, 7) }}</em>
          </button>
        </nav>

        <section class="pub-body" :data-pane="mobilePane">
          <div class="pub-map">
            <TravelMap
              ref="mapRef"
              :markers="markers"
              :lines="lines"
              :bbox="bbox"
              :selected-id="selectedPointId"
            />
          </div>

          <aside class="pub-list">
            <div
              v-for="(step, i) in currentVariant?.steps || []"
              :key="step.id"
              class="pub-step"
            >
              <div v-if="step.transport" class="pub-transport">
                <i class="mdi mdi-arrow-down"></i>
                {{ step.transport.line || step.transport.kind }}
                <em v-if="step.transport.durationMin">{{ step.transport.durationMin }} мин</em>
              </div>

              <div
                v-for="point in step.points"
                :key="point.id"
                class="pub-point"
                :class="{ active: selectedPointId === point.id, alt: step.points.length > 1 }"
                @click="selectPoint(point.id)"
              >
                <div class="pub-point__row">
                  <span class="pub-point__num">{{ i + 1 }}</span>
                  <div class="pub-point__body">
                    <div class="pub-point__title">
                      <b v-if="point.plannedStartMin >= 0">{{ formatTime(point.plannedStartMin) }}</b>
                      {{ point.title }}
                    </div>
                    <div v-if="point.address" class="pub-point__addr">{{ point.address }}</div>
                    <div v-if="lockFor(point.id)" class="pub-point__lock">
                      <i class="mdi mdi-lock"></i> редактирует {{ lockFor(point.id).holderName }}
                    </div>
                  </div>
                  <button class="pub-icon" @click.stop="openPointId = openPointId === point.id ? '' : point.id">
                    <i class="mdi" :class="openPointId === point.id ? 'mdi-chevron-up' : 'mdi-chevron-down'"></i>
                  </button>
                </div>

                <div v-if="openPointId === point.id" class="pub-point__details" @click.stop>
                  <p v-if="point.description" class="pub-point__descr">{{ point.description }}</p>

                  <div class="pub-reactions">
                    <button
                      v-for="emoji in REACTIONS"
                      :key="emoji"
                      class="pub-reaction"
                      :class="{ mine: reactionsFor(point.id).find((r) => r.emoji === emoji)?.mine }"
                      @click="react('point', point.id, emoji)"
                    >
                      {{ emoji }}
                      <em v-if="reactionsFor(point.id).find((r) => r.emoji === emoji)?.count">
                        {{ reactionsFor(point.id).find((r) => r.emoji === emoji).count }}
                      </em>
                    </button>
                  </div>

                  <div class="pub-comments">
                    <div v-for="c in commentsFor(point.id)" :key="c.id" class="pub-comment">
                      <b>{{ c.authorName }}</b> {{ c.text }}
                      <button v-if="c.canEdit" @click="removeComment(c)">
                        <i class="mdi mdi-close"></i>
                      </button>
                    </div>
                    <div class="pub-comment-form">
                      <input
                        v-model="commentText"
                        class="pub-input"
                        type="text"
                        placeholder="Написать…"
                        @input="touchTyping"
                        @keydown.enter="sendComment('point', point.id)"
                      />
                      <button class="pub-primary" @click="sendComment('point', point.id)">
                        <i class="mdi mdi-send"></i>
                      </button>
                    </div>
                  </div>

                  <div v-if="canEdit" class="pub-point__actions">
                    <button @click="openEditor(point)"><i class="mdi mdi-pencil"></i> Изменить</button>
                    <button @click="removePoint(point)"><i class="mdi mdi-delete"></i> Убрать</button>
                  </div>
                </div>
              </div>
            </div>

            <button v-if="canEdit" class="pub-add" @click="addPoint">
              <i class="mdi mdi-plus"></i> Добавить точку
            </button>

            <p v-if="role === 'suggest'" class="pub-hint">
              Свои точки правишь сразу, а изменения чужих уйдут владельцу на согласование.
            </p>
          </aside>

          <div class="pub-switch">
            <button :class="{ active: mobilePane === 'map' }" @click="mobilePane = 'map'">Карта</button>
            <button :class="{ active: mobilePane === 'list' }" @click="mobilePane = 'list'">Маршрут</button>
          </div>
        </section>
      </template>
    </template>

    <!-- Правка точки -->
    <div v-if="editing" class="pub-modal-backdrop" @click.self="closeEditor">
      <div class="pub-modal">
        <h2>Изменить точку</h2>
        <p v-if="role === 'suggest'" class="pub-hint">
          Если точка не твоя, правка уйдёт владельцу на согласование.
        </p>

        <label class="pub-field">
          Название
          <input v-model="editForm.title" class="pub-input" type="text" @input="touchTyping" />
        </label>
        <label class="pub-field">
          Описание
          <textarea
            v-model="editForm.description"
            class="pub-input pub-textarea"
            rows="4"
            @input="touchTyping"
          ></textarea>
        </label>
        <label class="pub-field">
          Адрес
          <input v-model="editForm.address" class="pub-input" type="text" @input="touchTyping" />
        </label>

        <div class="pub-modal__actions">
          <button class="pub-ghost" @click="closeEditor">Отмена</button>
          <button class="pub-primary" @click="saveEdit">Сохранить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pub {
  display: flex;
  flex-direction: column;
  width: 100%;
  align-self: stretch;
  height: 100vh;
  color: #eaeef7;
  background: #12141a;
}

.pub-gate {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.pub-gate__card {
  width: 100%;
  max-width: 380px;
  padding: 28px;
  text-align: center;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 16px;
}

.pub-gate__card h1 {
  margin: 0 0 8px;
  font-size: 22px;
}

.pub-gate__card p {
  margin: 0 0 16px;
  font-size: 13px;
  color: #8b93a7;
}

.pub-gate__card .pub-input {
  margin-bottom: 12px;
}

.pub-gate__card button {
  width: 100%;
  justify-content: center;
  margin-bottom: 8px;
}

.pub-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #232733;
}

.pub-title {
  flex: 1;
  min-width: 0;
}

.pub-title h1 {
  margin: 0;
  font-size: 19px;
}

.pub-title span {
  font-size: 12px;
  color: #6e7688;
}

.pub-who {
  display: flex;
  gap: 6px;
  align-items: center;
}

.pub-me {
  font-size: 13px;
}

.pub-role {
  padding: 3px 10px;
  font-size: 11px;
  color: #b9c0cf;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 999px;
}

.pub-online {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 11px;
  color: #12141a;
  border-radius: 50%;
}

.pub-days {
  display: flex;
  gap: 5px;
  padding: 10px 20px;
  overflow-x: auto;
  border-bottom: 1px solid #232733;
}

.pub-days button {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-width: 48px;
  padding: 6px 11px;
  font-size: 14px;
  color: #8b93a7;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 9px;
  cursor: pointer;
}

.pub-days button em {
  font-size: 10px;
  font-style: normal;
  opacity: 0.7;
}

.pub-days button.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

.pub-body {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr 400px;
  min-height: 0;
}

.pub-map {
  padding: 10px;
  min-height: 0;
}

.pub-list {
  padding: 10px;
  overflow-y: auto;
  border-left: 1px solid #232733;
}

.pub-transport {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 3px 0 3px 14px;
  font-size: 11px;
  color: #8b93a7;
}

.pub-transport em {
  font-style: normal;
  opacity: 0.7;
}

.pub-point {
  margin-bottom: 5px;
  background: #1b1e27;
  border: 1px solid transparent;
  border-radius: 11px;
  cursor: pointer;
}

.pub-point.active {
  border-color: #1767fd;
}

.pub-point.alt {
  border-style: dashed;
  border-color: #3d4353;
}

.pub-point__row {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 9px 11px;
}

.pub-point__num {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  font-size: 12px;
  color: #fff;
  background: #2c313d;
  border-radius: 7px;
}

.pub-point__body {
  flex: 1;
  min-width: 0;
}

.pub-point__title {
  font-size: 13px;
}

.pub-point__title b {
  color: #1767fd;
}

.pub-point__addr {
  margin-top: 2px;
  font-size: 11px;
  color: #6e7688;
}

.pub-point__lock {
  margin-top: 3px;
  font-size: 11px;
  color: #ffd666;
}

.pub-point__details {
  padding: 0 11px 11px;
  cursor: default;
  border-top: 1px solid #232733;
}

.pub-point__descr {
  margin: 8px 0;
  font-size: 12px;
  color: #b9c0cf;
  white-space: pre-wrap;
}

.pub-reactions {
  display: flex;
  gap: 5px;
  margin: 8px 0;
}

.pub-reaction {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 4px 10px;
  font-size: 13px;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 999px;
  cursor: pointer;
}

.pub-reaction.mine {
  border-color: #1767fd;
  background: rgba(23, 103, 253, 0.15);
}

.pub-reaction em {
  font-size: 11px;
  font-style: normal;
  color: #8b93a7;
}

.pub-comments {
  margin-top: 8px;
}

.pub-comment {
  display: flex;
  gap: 5px;
  align-items: baseline;
  padding: 4px 0;
  font-size: 12px;
  color: #cdd3e0;
}

.pub-comment b {
  color: #1767fd;
}

.pub-comment button {
  margin-left: auto;
  padding: 0 4px;
  color: #6e7688;
  background: transparent;
  border: none;
  cursor: pointer;
}

.pub-comment-form {
  display: flex;
  gap: 5px;
  margin-top: 6px;
}

.pub-point__actions {
  display: flex;
  gap: 5px;
  margin-top: 10px;
}

.pub-point__actions button {
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

.pub-add {
  width: 100%;
  padding: 10px;
  margin-top: 8px;
  font-size: 12px;
  color: #6e7688;
  background: transparent;
  border: 1px dashed #2c313d;
  border-radius: 10px;
  cursor: pointer;
}

.pub-switch {
  display: none;
}

.pub-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 9px;
  outline: none;
}

.pub-textarea {
  font-family: inherit;
  resize: vertical;
}

.pub-field {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: #8b93a7;
}

.pub-field .pub-input {
  margin-top: 4px;
}

.pub-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 15px;
  font-size: 13px;
  color: #fff;
  background: #1767fd;
  border: none;
  border-radius: 9px;
  cursor: pointer;
}

.pub-ghost {
  padding: 9px 15px;
  font-size: 13px;
  color: #b9c0cf;
  background: transparent;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.pub-icon {
  padding: 4px;
  color: #6e7688;
  background: transparent;
  border: none;
  cursor: pointer;
}

.pub-error,
.pub-notice {
  padding: 9px 16px;
  margin: 0;
  font-size: 13px;
  cursor: pointer;
}

.pub-error {
  color: #ff9d9f;
  background: rgba(229, 72, 77, 0.14);
}

.pub-notice {
  color: #86d68b;
  background: rgba(34, 197, 94, 0.13);
}

.pub-empty {
  padding: 40px;
  color: #6e7688;
  text-align: center;
}

.pub-hint {
  padding: 10px 4px;
  font-size: 11px;
  color: #6e7688;
}

.pub-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 9, 13, 0.72);
}

.pub-modal {
  width: 100%;
  max-width: 460px;
  padding: 20px;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 16px;
}

.pub-modal h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.pub-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

@media (max-width: 900px) {
  .pub {
    height: 100dvh;
  }

  .pub-header {
    padding: 10px 12px;
  }

  .pub-title h1 {
    font-size: 16px;
  }

  .pub-days {
    padding: 8px 12px;
  }

  .pub-body {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }

  .pub-body[data-pane="map"] .pub-list,
  .pub-body[data-pane="list"] .pub-map {
    display: none;
  }

  .pub-list {
    border-left: none;
  }

  .pub-switch {
    display: flex;
    gap: 4px;
    padding: 8px;
    border-top: 1px solid #232733;
  }

  .pub-switch button {
    flex: 1;
    padding: 11px;
    font-size: 13px;
    color: #8b93a7;
    background: #1b1e27;
    border: 1px solid #262b36;
    border-radius: 10px;
    cursor: pointer;
  }

  .pub-switch button.active {
    color: #fff;
    background: #1767fd;
    border-color: #1767fd;
  }

  .pub-point__row {
    padding: 12px 11px;
  }

  .pub-point__actions button {
    padding: 10px 12px;
    font-size: 13px;
  }
}
</style>
