<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  fetchBlockers,
  updateBlockerReminder,
  resolveBlocker,
  fetchBlockerSettings,
  saveBlockerSettings,
  BLOCKER_PERIODS,
  BLOCKER_SNOOZES,
  blockerPeriodLabel,
  blockerNextLabel,
  blockerAgeLabel,
} from "@/components/blockersApi.js";

// Раздел «Блокеры»: всё, что стоит, в одном списке — и когда об этом напомнят.
//
// Блокеры ставятся не здесь: в задаче они живут записью в ленте, у карточки
// дня — своей строкой. Сюда они стекаются открытыми, и здесь у них одно общее
// свойство — периодичность напоминания. Напоминание при этом не заводят
// руками: оно есть у каждого блокера с периодом по умолчанию, потому что
// блокер, о котором не напоминают, к вечеру исчезает из головы.

const router = useRouter();

const list = ref([]);
const settings = ref(null);
const loading = ref(true);
const error = ref("");
const saving = ref("");
const openedId = ref(""); // у какого блокера раскрыты настройки
const personDraft = ref({});

const total = computed(() => list.value.length);
const silent = computed(() => list.value.filter((b) => !b.enabled).length);

function keyOf(b) {
  return `${b.source}:${b.id}`;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [items, config] = await Promise.all([fetchBlockers(), fetchBlockerSettings()]);
    list.value = items || [];
    settings.value = config;
    personDraft.value = Object.fromEntries(list.value.map((b) => [keyOf(b), b.person || ""]));
  } catch (e) {
    error.value = e.message || "не удалось загрузить блокеры";
  } finally {
    loading.value = false;
  }
}

async function patch(blocker, body) {
  saving.value = keyOf(blocker);
  try {
    const updated = await updateBlockerReminder(blocker.source, blocker.id, body);
    const at = list.value.findIndex((b) => keyOf(b) === keyOf(blocker));
    if (at >= 0 && updated) list.value[at] = updated;
  } catch (e) {
    error.value = e.message || "не сохранилось";
  } finally {
    saving.value = "";
  }
}

async function drop(blocker) {
  saving.value = keyOf(blocker);
  try {
    await resolveBlocker(blocker.source, blocker.id);
    list.value = list.value.filter((b) => keyOf(b) !== keyOf(blocker));
  } catch (e) {
    error.value = e.message || "не удалось снять блокер";
  } finally {
    saving.value = "";
  }
}

async function storeSettings() {
  try {
    await saveBlockerSettings(settings.value);
  } catch (e) {
    error.value = e.message || "настройки не сохранились";
  }
}

onMounted(load);
</script>

<template>
  <div class="blk">
    <div class="blk-head">
      <h1>🚧 Блокеры</h1>
      <button class="blk-btn" @click="router.push('/')">← Назад</button>
    </div>

    <div v-if="error" class="blk-error">{{ error }}</div>
    <div v-if="loading" class="blk-empty">Загружаю…</div>

    <template v-else>
      <section class="blk-card blk-sum">
        <div>
          <b>{{ total }}</b> открыто<template v-if="silent"
            >, {{ silent }} без напоминаний</template
          >
        </div>
        <div v-if="settings && !settings.botConnected" class="blk-warn">
          Бот задач не подключён: на сервере не задан TELEGRAM_TASKS_BOT_TOKEN — напоминания
          копятся, но не отправляются.
        </div>
        <div v-else-if="settings && !settings.chatId" class="blk-warn">
          Напишите боту <b>/start</b> — он сам запомнит чат и начнёт напоминать.
        </div>
      </section>

      <div v-if="!total" class="blk-empty">Открытых блокеров нет. Это хорошая новость.</div>

      <section v-for="b in list" :key="keyOf(b)" class="blk-card">
        <div class="blk-top">
          <span class="blk-kind">{{ b.source === "item" ? "Карточка" : "Задача" }}</span>
          <span class="blk-age">висит {{ blockerAgeLabel(b.ageHours) }}</span>
        </div>

        <div class="blk-text">{{ b.text }}</div>
        <div v-if="b.title" class="blk-title">{{ b.title }}</div>

        <div class="blk-line">
          <span v-if="!b.enabled" class="blk-muted">напоминания выключены</span>
          <template v-else>
            <span class="blk-muted">
              каждые {{ blockerPeriodLabel(b.everyMin) }} · {{ blockerNextLabel(b.nextAt) }}
            </span>
          </template>
          <span v-if="b.person" class="blk-person">→ {{ b.person }}</span>
        </div>

        <div class="blk-row">
          <button
            v-for="s in BLOCKER_SNOOZES"
            :key="s.min"
            class="blk-btn"
            :disabled="saving === keyOf(b)"
            @click="patch(b, { snoozeMin: s.min })"
          >
            {{ s.label }}
          </button>
          <button class="blk-btn is-primary" :disabled="saving === keyOf(b)" @click="drop(b)">
            Снят
          </button>
          <button
            class="blk-btn"
            @click="openedId = openedId === keyOf(b) ? '' : keyOf(b)"
          >
            ⚙️
          </button>
        </div>

        <div v-if="openedId === keyOf(b)" class="blk-setup">
          <div class="blk-label">Как часто напоминать</div>
          <div class="blk-row">
            <button
              v-for="p in BLOCKER_PERIODS"
              :key="p.min"
              class="blk-chip"
              :class="{ 'is-on': b.everyMin === p.min && b.enabled }"
              :disabled="saving === keyOf(b)"
              @click="patch(b, { everyMin: p.min, enabled: true })"
            >
              {{ p.label }}
            </button>
            <button
              class="blk-chip"
              :class="{ 'is-on': !b.enabled }"
              :disabled="saving === keyOf(b)"
              @click="patch(b, { enabled: !b.enabled })"
            >
              не напоминать
            </button>
          </div>

          <div class="blk-label">Кому напомнить</div>
          <div class="blk-row">
            <input
              v-model="personDraft[keyOf(b)]"
              class="blk-input"
              placeholder="Петя из инфры"
              @keyup.enter="patch(b, { person: personDraft[keyOf(b)] })"
            />
            <button
              class="blk-btn"
              :disabled="saving === keyOf(b)"
              @click="patch(b, { person: personDraft[keyOf(b)] })"
            >
              Сохранить
            </button>
          </div>
        </div>
      </section>

      <section v-if="settings" class="blk-card">
        <div class="blk-label">Бот задач</div>
        <label class="blk-check">
          <input v-model="settings.enabled" type="checkbox" @change="storeSettings" />
          Напоминать в Telegram
        </label>

        <div class="blk-label">Период по умолчанию</div>
        <div class="blk-row">
          <button
            v-for="p in BLOCKER_PERIODS"
            :key="p.min"
            class="blk-chip"
            :class="{ 'is-on': settings.defaultEveryMin === p.min }"
            @click="((settings.defaultEveryMin = p.min), storeSettings())"
          >
            {{ p.label }}
          </button>
        </div>

        <div class="blk-label">Тихие часы</div>
        <div class="blk-row">
          <input v-model="settings.quietFrom" class="blk-input is-time" @change="storeSettings" />
          <span class="blk-muted">—</span>
          <input v-model="settings.quietTo" class="blk-input is-time" @change="storeSettings" />
        </div>
        <div class="blk-muted">
          Чат: {{ settings.chatId || "не подключён" }}. В боте работают /blockers, /off и /on.
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.blk {
  max-width: 720px;
  margin: 0 auto;
  padding: 12px 12px 90px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #e6e8ef;
}

.blk-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.blk-head h1 {
  margin: 0;
  font-size: 22px;
}

.blk-card {
  border-radius: 14px;
  border: 1px solid #262933;
  background: #1b1d25;
  padding: 11px 13px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.blk-sum {
  font-size: 14px;
}

.blk-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #7a7f8e;
}

/* Текст блокера — главное на карточке: по нему вспоминают, о чём речь. */
.blk-text {
  font-size: 16px;
  line-height: 1.4;
  white-space: pre-wrap;
}

.blk-title {
  font-size: 13px;
  color: #cfd3e0;
}

.blk-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}

.blk-person {
  color: #a58bff;
}

.blk-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.blk-setup {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid #262933;
  padding-top: 8px;
}

.blk-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #7a7f8e;
}

.blk-btn {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 11px;
  border: 1px solid #262933;
  background: #22242d;
  color: #e6e8ef;
  font-size: 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.blk-btn:disabled {
  opacity: 0.5;
}

.blk-btn.is-primary {
  background: #6e4aff;
  border-color: #6e4aff;
  color: #fff;
}

.blk-chip {
  min-height: 34px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #262933;
  background: #22242d;
  color: #cfd3e0;
  font-size: 13px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.blk-chip.is-on {
  background: #6e4aff;
  border-color: #6e4aff;
  color: #fff;
}

.blk-input {
  flex: 1;
  min-width: 120px;
  min-height: 40px;
  padding: 0 10px;
  border-radius: 11px;
  border: 1px solid #262933;
  background: #16171d;
  color: #e6e8ef;
  font-size: 14px;
}

.blk-input.is-time {
  flex: 0 0 90px;
  min-width: 90px;
  text-align: center;
}

.blk-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.blk-muted {
  color: #7a7f8e;
  font-size: 13px;
}

.blk-empty {
  color: #7a7f8e;
  font-size: 14px;
  padding: 20px 4px;
  text-align: center;
}

.blk-warn {
  font-size: 13px;
  color: #ffd666;
}

.blk-error {
  font-size: 13px;
  color: #e5484d;
}
</style>
