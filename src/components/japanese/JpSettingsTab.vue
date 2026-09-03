<script setup>
import { ref, onMounted } from "vue";
import {
  fetchJpSettings,
  saveJpSettings,
  importJpTranslations,
  fetchJpPendingTranslations,
  canSpeakJapanese,
  primeJapaneseVoice,
  speakJapanese,
  japaneseVoiceName,
} from "@/components/japaneseApi.js";

// Настройки раздела. Всё, кроме темпа новых: его подбирает система, и ручку
// «столько-то в день» здесь не заводим намеренно — она мгновенно превращается
// в невыполнимый план, а долг повторений и так режет темп сам.

const SESSION_PRESETS = [
  { sec: 180, label: "3 мин" },
  { sec: 360, label: "6 мин" },
  { sec: 900, label: "15 мин" },
  { sec: 0, label: "Без потолка" },
];

const form = ref(null);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const saved = ref(false);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    form.value = await fetchJpSettings();
  } catch (e) {
    error.value = e.message || "не загрузилось";
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  error.value = "";
  saved.value = false;
  try {
    // Пустая строка в поле активности означает «не отмечать»: на сервере
    // это null, а не пустой uuid, иначе разбор тела запроса не пройдёт.
    await saveJpSettings({
      ...form.value,
      disciplineActivityId: form.value.disciplineActivityId || null,
    });
    saved.value = true;
  } catch (e) {
    error.value = e.message || "не сохранилось";
  } finally {
    saving.value = false;
  }
}

// --- Русские значения, переведённые вручную ---
//
// Свободного источника русских значений кандзи нет, а ключей к платному
// переводчику нет у нас. Поэтому перевод приходит текстом, кусками: скопировал
// кусок из файла, получил перевод в чате, вставил ответ сюда.

const translation = ref("");
const translationBusy = ref(false);
const translationResult = ref(null);

// Кусок на перевод берётся с сервера, а не из файла рядом с приложением:
// список меняется после каждой загрузки, и файл устарел бы сразу же.
const pending = ref(null);
const pendingChunk = ref(1);
const pendingBusy = ref(false);
const copied = ref(false);

const PROMPT =
  "Переведи значения кандзи на русский. Верни ровно те же строки: " +
  "знак, табуляция, русские значения через запятую. Ничего не добавляй.";

async function loadPending(chunk = pendingChunk.value) {
  pendingBusy.value = true;
  copied.value = false;
  error.value = "";
  try {
    pending.value = await fetchJpPendingTranslations(chunk);
    pendingChunk.value = pending.value.chunk;
  } catch (e) {
    error.value = e.message || "список не загрузился";
  } finally {
    pendingBusy.value = false;
  }
}

// Копируем вместе с просьбой: иначе её приходится дописывать руками каждый раз.
//
// navigator.clipboard живёт только в защищённом контексте, а сайт открывается
// по обычному http — там его просто нет. Поэтому основной путь здесь старый:
// выделить текст в поле и попросить браузер скопировать выделенное. Он же
// работает и на телефоне.
async function copyPending() {
  const body = `${PROMPT}

${pending.value?.text || ""}`;
  error.value = "";

  const area = document.querySelector(".jps-pending-text");
  if (area) {
    area.focus();
    area.select();
    // На iOS select() у readonly-поля срабатывает не всегда, а setSelectionRange
    // работает везде.
    area.setSelectionRange?.(0, body.length);
    try {
      if (document.execCommand("copy")) {
        copied.value = true;
        return;
      }
    } catch {
      // Идём дальше, к современному буферу.
    }
  }

  try {
    await navigator.clipboard.writeText(body);
    copied.value = true;
  } catch {
    error.value = "браузер не дал доступ к буферу — текст выделен, скопируй руками";
  }
}

async function loadTranslations() {
  if (!translation.value.trim()) return;
  translationBusy.value = true;
  translationResult.value = null;
  error.value = "";
  try {
    translationResult.value = await importJpTranslations(translation.value);
    translation.value = "";
  } catch (e) {
    error.value = e.message || "перевод не загрузился";
  } finally {
    translationBusy.value = false;
  }
}

// --- Проверка озвучки ---
//
// Синтезатор есть не в каждой системе, и японский голос в нём — тем более.
// Молча показывать кнопку, которая ничего не произносит, нельзя: непонятно,
// сломано приложение или нет голоса.

const speechReady = ref(canSpeakJapanese());
const voice = ref("");

function refreshVoice() {
  primeJapaneseVoice();
  speechReady.value = canSpeakJapanese();
  voice.value = japaneseVoiceName();
}

function testSpeech() {
  refreshVoice();
  speakJapanese("にほんご");
}

onMounted(() => {
  load();
  refreshVoice();
  // Голоса в системе подъезжают не сразу — перечитываем чуть позже.
  setTimeout(refreshVoice, 1200);
});
</script>

<template>
  <div class="jps-set">
    <div v-if="error" class="jp-error">{{ error }}</div>
    <div v-if="loading" class="jp-empty">Загружаю…</div>

    <template v-else-if="form">
      <section class="jp-card">
        <h3>Сессия</h3>
        <div class="jp-row">
          <button
            v-for="p in SESSION_PRESETS"
            :key="p.sec"
            class="jp-btn"
            :class="{ 'is-primary': form.sessionSec === p.sec }"
            @click="form.sessionSec = p.sec"
          >
            {{ p.label }}
          </button>
        </div>
        <p class="jp-muted" style="margin-top: 8px">
          Потолок, а не цель: карточка никогда не обрывается таймером на середине, а сессия
          заканчивается раньше, если очередь пуста.
        </p>
      </section>

      <section class="jp-card">
        <h3>Повторения</h3>
        <div class="jp-grid">
          <div class="jp-field">
            <label>Целевое удержание</label>
            <select v-model.number="form.retention" class="jp-select">
              <option :value="0.85">85% — реже повторять</option>
              <option :value="0.9">90% — по умолчанию</option>
              <option :value="0.95">95% — держать крепче</option>
            </select>
          </div>
          <div class="jp-field">
            <label>Новых в день</label>
            <input
              v-model.number="form.newPerDay"
              class="jp-input"
              type="number"
              min="1"
              max="30"
              :disabled="form.autoPace"
            />
          </div>
        </div>
        <label class="jp-check" style="margin-top: 10px">
          <input v-model="form.autoPace" type="checkbox" />
          Темп подбирает система по долгу повторений
        </label>
        <label class="jp-check" style="margin-top: 8px">
          <input v-model="form.showRomaji" type="checkbox" />
          Показывать ромадзи
        </label>
      </section>

      <section class="jp-card">
        <h3>Напоминания</h3>
        <label class="jp-check">
          <input v-model="form.notifyEnabled" type="checkbox" />
          Писать в Telegram
        </label>
        <div class="jp-grid" style="margin-top: 10px">
          <div class="jp-field">
            <label>Chat ID</label>
            <input v-model="form.telegramChatId" class="jp-input" placeholder="123456789" />
          </div>
          <div class="jp-field">
            <label>Тихо с</label>
            <input v-model="form.quietFrom" class="jp-input" placeholder="23:30" />
          </div>
          <div class="jp-field">
            <label>Тихо до</label>
            <input v-model="form.quietTo" class="jp-input" placeholder="08:30" />
          </div>
        </div>
        <p class="jp-muted" style="margin-top: 8px">
          Бот пишет не чаще раза в четыре часа. Поводов два: накопившийся долг и — после 20:00 —
          стрик под угрозой. Токен бота задаётся на сервере, здесь только адресат.
        </p>
      </section>

      <section class="jp-card">
        <h3>Трекер дисциплины</h3>
        <div class="jp-field">
          <label>ID активности для автоотметки</label>
          <input
            v-model="form.disciplineActivityId"
            class="jp-input"
            placeholder="пусто — не отмечать"
          />
        </div>
        <p class="jp-muted" style="margin-top: 8px">
          Отметка ставится сама после сессии, которая закрыла день. Уровень — по нагрузке дня:
          одна сессия минимум, три или 15 минут средний, пять или полчаса максимум. Уже стоящую
          отметку не понижает.
        </p>
      </section>

      <section class="jp-card">
        <h3>Озвучка</h3>
        <p class="jp-muted">
          Произношение читает синтезатор системы — он уже стоит на устройстве, платить не за что
          и сеть не нужна. Кнопка 🔊 есть в разборе, в карточке знака и в сессии после ответа.
        </p>
        <div class="jp-row" style="margin-top: 10px">
          <button class="jp-btn is-primary" @click="testSpeech">🔊 Проверить</button>
          <span v-if="!speechReady" class="jp-muted">синтезатора в этом браузере нет</span>
          <span v-else-if="voice" class="jp-muted">голос: {{ voice }}</span>
          <span v-else class="jp-muted">
            японского голоса в системе не нашлось — произнесёт тем, что есть
          </span>
        </div>
        <p v-if="speechReady && !voice" class="jp-muted" style="margin-top: 8px">
          На Android японский голос ставится в «Настройки → Язык и ввод → Синтез речи → Google →
          Установить голосовые данные → 日本語». На iPhone — «Настройки → Универсальный доступ →
          Устный контент → Голоса → 日本語».
        </p>
      </section>

      <section class="jp-card">
        <h3>Русские значения кандзи</h3>
        <p class="jp-muted">
          Свободного источника русских значений кандзи не существует: KANJIDIC2 даёт английские,
          и они пока подставлены как есть. Круг такой: взял кусок → скопировал в чат → ответ
          вставил обратно. Порядок кусков — по пользе: сперва N5, дальше вниз по уровням.
          Останавливаться можно на любом: что переведено, то сразу работает.
        </p>
        <div class="jp-row" style="margin-top: 10px">
          <button class="jp-btn" :disabled="pendingBusy" @click="loadPending()">
            Взять кусок на перевод
          </button>
          <span v-if="pending" class="jp-muted">
            кусок {{ pending.chunk }} из {{ pending.chunks }} · без перевода
            {{ pending.left }}
          </span>
        </div>

        <template v-if="pending?.text">
          <textarea
            class="jp-textarea jps-pending-text"
            style="margin-top: 8px; min-height: 130px"
            readonly
            :value="`${PROMPT}

${pending.text}`"
          ></textarea>
          <div class="jp-row" style="margin-top: 8px">
            <button class="jp-btn is-primary" @click="copyPending">
              {{ copied ? "Скопировано" : "Скопировать для чата" }}
            </button>
            <button
              class="jp-btn"
              :disabled="pendingBusy || pendingChunk >= (pending?.chunks || 1)"
              @click="loadPending(pendingChunk + 1)"
            >
              Следующий
            </button>
          </div>
        </template>
        <div v-else-if="pending" class="jp-empty">Всё переведено</div>

        <p class="jp-muted" style="margin-top: 12px">Ответ из чата вставь сюда:</p>
        <textarea
          v-model="translation"
          class="jp-textarea"
          style="margin-top: 6px"
          placeholder="語&#9;язык, речь, слово"
        ></textarea>
        <div class="jp-row" style="margin-top: 8px">
          <button
            class="jp-btn is-primary"
            :disabled="translationBusy || !translation.trim()"
            @click="loadTranslations"
          >
            Загрузить
          </button>
          <span v-if="translationResult" class="jp-muted">
            обновлено {{ translationResult.updated }}<template v-if="translationResult.skipped">
              · пропущено {{ translationResult.skipped }}</template
            >
            · осталось без перевода {{ translationResult.leftUntranslated }}
          </span>
        </div>
        <div v-if="translationResult?.unknown?.length" class="jp-muted" style="margin-top: 6px">
          Не нашлись в справочнике: {{ translationResult.unknown.join(" ") }}
        </div>
      </section>

      <div class="jp-row">
        <button class="jp-btn is-primary" :disabled="saving" @click="save">Сохранить</button>
        <span v-if="saved" class="jp-muted">сохранено</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.jps-set {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
