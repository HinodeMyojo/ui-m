<script setup>
import { ref, watch, onMounted } from "vue";
import {
  fetchArSettings,
  saveArSettings,
  knowArAlphabet,
  fetchArPendingTranslations,
  importArTranslations,
  fetchArStudies,
  saveArStudy,
  canSpeakArabic,
  speakArabic,
  primeArabicSpeech,
  arAutoSpeakEnabled,
  setArAutoSpeak,
} from "@/components/arabicApi.js";
import { fetchDisciplineMonth } from "@/components/api.js";

// Настройки раздела: длина сессии, огласовки, транслитерация, автоотметка в
// трекере дисциплины и нормы учёб.

const emit = defineEmits(["changed"]);

const SESSION_PRESETS = [
  { sec: 180, label: "3 мин" },
  { sec: 420, label: "7 мин" },
  { sec: 600, label: "10 мин" },
  { sec: 900, label: "15 мин" },
];

const VOWELS = [
  { code: "always", label: "Всегда", hint: "харакяты видны на всех стадиях" },
  { code: "early", label: "Пока учу", hint: "гаснут, когда слово закрепилось" },
  { code: "never", label: "Никогда", hint: "как в живом тексте" },
];

const form = ref(null);
const studies = ref([]);
const activities = ref([]);
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref("");
const alphabetDone = ref(0);
// Перевод хвоста словаря: приложение отдаёт кусок, готовый к вставке в чат, и
// принимает ответ строками. Ключа к переводчику у нас нет — это тот же путь,
// что сработал в японском.
const pending = ref(null);
const pasted = ref("");
const pasteResult = ref(null);
const pasteBusy = ref(false);

// Звук — свойство устройства, а не человека: в метро без наушников его
// выключают, дома включают обратно. Поэтому он в localStorage, а не на сервере.
const canHear = canSpeakArabic();
const autoSpeak = ref(arAutoSpeakEnabled());
watch(autoSpeak, (on) => {
  setArAutoSpeak(on);
  if (on) {
    primeArabicSpeech();
    speakArabic("مَرْحَبًا");
  }
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [settings, list] = await Promise.all([fetchArSettings(), fetchArStudies()]);
    form.value = settings;
    studies.value = list || [];
  } catch (e) {
    error.value = e.message || "не удалось загрузить настройки";
  } finally {
    loading.value = false;
  }
  loadActivities();
}

// Активности берутся из плана текущего месяца: вводить UUID руками — это
// гарантированная опечатка, после которой отметка молча не ставится.
async function loadActivities() {
  try {
    const now = new Date();
    const month = await fetchDisciplineMonth(now.getMonth() + 1, now.getFullYear());
    const out = [];
    for (const skill of month?.skills || []) {
      for (const activity of skill.activities || []) {
        out.push({ id: activity.id, title: `${activity.emoji || ""} ${activity.title}`.trim() });
      }
    }
    activities.value = out;
  } catch {
    // Трекер может быть выключен — раздел обязан работать и без него.
    activities.value = [];
  }
}

async function save() {
  if (!form.value) return;
  saving.value = true;
  error.value = "";
  saved.value = false;
  try {
    await saveArSettings({
      ...form.value,
      disciplineActivityId: form.value.disciplineActivityId || null,
    });
    saved.value = true;
    emit("changed");
  } catch (e) {
    error.value = e.message || "не сохранилось";
  } finally {
    saving.value = false;
  }
}

async function closeAlphabet() {
  try {
    const result = await knowArAlphabet();
    alphabetDone.value = result?.letters || 0;
    emit("changed");
  } catch (e) {
    error.value = e.message || "не получилось";
  }
}

async function loadPending() {
  try {
    pending.value = await fetchArPendingTranslations();
  } catch (e) {
    error.value = e.message || "кусок не собрался";
  }
}

async function copyPending() {
  if (!pending.value?.text) return;
  try {
    await navigator.clipboard.writeText(pending.value.text);
  } catch {
    // Буфер недоступен (нет https или отказано) — текст и так на экране.
  }
}

async function sendTranslations() {
  if (!pasted.value.trim()) return;
  pasteBusy.value = true;
  pasteResult.value = null;
  try {
    pasteResult.value = await importArTranslations(pasted.value);
    pasted.value = "";
    await loadPending();
  } catch (e) {
    error.value = e.message || "перевод не принялся";
  } finally {
    pasteBusy.value = false;
  }
}

async function saveStudy(study) {
  try {
    await saveArStudy({
      id: study.id,
      name: study.name,
      enabled: study.enabled,
      newPerDay: study.newPerDay,
      sessionSec: study.sessionSec,
      examEvery: study.examEvery,
    });
    emit("changed");
  } catch (e) {
    error.value = e.message || "учёба не сохранилась";
  }
}

onMounted(load);
</script>

<template>
  <div class="ar-settings">
    <p v-if="loading" class="ar-muted">Загружаем…</p>
    <p v-if="error" class="ar-err">{{ error }}</p>

    <template v-if="form">
      <section class="ar-card">
        <h3 class="ar-card-title">Сессия</h3>
        <div class="ar-row">
          <button
            v-for="p in SESSION_PRESETS"
            :key="p.sec"
            class="ar-btn ar-btn-sm"
            :class="{ 'ar-btn-accent': form.sessionSec === p.sec }"
            @click="form.sessionSec = p.sec"
          >
            {{ p.label }}
          </button>
        </div>
        <label class="ar-check">
          <input v-model="form.autoPace" type="checkbox" />
          Подбирать темп новых слов по долгу повторений
        </label>
        <p class="ar-muted">
          Сессия не обрывает карточку на середине: потолок только запрещает брать следующую.
        </p>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Огласовки</h3>
        <div class="ar-row">
          <button
            v-for="v in VOWELS"
            :key="v.code"
            class="ar-btn ar-btn-sm"
            :class="{ 'ar-btn-accent': form.vowels === v.code }"
            @click="form.vowels = v.code"
          >
            {{ v.label }}
          </button>
        </div>
        <p class="ar-muted">
          {{ VOWELS.find((v) => v.code === form.vowels)?.hint }}. В живом тексте харакятов нет, и
          привыкать читать без них всё равно придётся — но не с первого дня.
        </p>
        <label class="ar-check">
          <input v-model="form.showTranslit" type="checkbox" />
          Показывать транслитерацию латиницей
        </label>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Алфавит</h3>
        <p class="ar-muted">
          Слово не выдаётся, пока не закрепились его буквы. Если арабицу вы уже читаете, закройте
          алфавит разом — карточки останутся, но вернутся не раньше чем через месяц.
        </p>
        <div class="ar-row">
          <button class="ar-btn ar-btn-gold" @click="closeAlphabet">Буквы я знаю</button>
          <span v-if="alphabetDone" class="ar-muted">закрыто букв: {{ alphabetDone }}</span>
        </div>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Учёбы</h3>
        <div v-for="study in studies" :key="study.id" class="ar-study">
          <div class="ar-row">
            <b>{{ study.emoji }} {{ study.name }}</b>
            <label class="ar-check">
              <input v-model="study.enabled" type="checkbox" @change="saveStudy(study)" />
              включена
            </label>
          </div>
          <div class="ar-row">
            <label class="ar-field">
              новых в день
              <input
                v-model.number="study.newPerDay"
                class="ar-input ar-input-sm"
                type="number"
                min="0"
                max="20"
                @change="saveStudy(study)"
              />
            </label>
            <label class="ar-field">
              экзамен каждые
              <input
                v-model.number="study.examEvery"
                class="ar-input ar-input-sm"
                type="number"
                min="0"
                max="100"
                @change="saveStudy(study)"
              />
            </label>
          </div>
          <p class="ar-muted">
            закреплено {{ study.learned }} из {{ study.total }} ·
            {{ study.examDue ? "экзамен ждёт" : `до экзамена ${study.toExam}` }}
          </p>
        </div>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Напоминания в телеграме</h3>
        <label class="ar-check">
          <input v-model="form.notifyEnabled" type="checkbox" />
          Напоминать, если день не закрыт
        </label>
        <label class="ar-field ar-field-col">
          чат
          <input v-model="form.telegramChatId" class="ar-input" placeholder="напишите боту /start" />
        </label>
        <div class="ar-row">
          <label class="ar-field">
            тихо с
            <input v-model="form.quietFrom" class="ar-input ar-input-sm" placeholder="23:30" />
          </label>
          <label class="ar-field">
            до
            <input v-model="form.quietTo" class="ar-input ar-input-sm" placeholder="08:30" />
          </label>
        </div>
        <p class="ar-muted">
          Бот у арабского свой: два опроса на одном токене разбирают сообщения по половине
          каждый. А лимит общий с японским — между любыми двумя сообщениями четыре часа, иначе
          два модуля пишут по очереди.
        </p>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Русские значения для хвоста словаря</h3>
        <p class="ar-muted">
          Двадцать тысяч слов из Викисловаря пришли с английскими значениями — русских в
          свободных источниках нет. Их не учат, они нужны разбору текста; перевести можно
          кусками: скопировать, отправить в чат, вставить ответ обратно.
        </p>
        <div class="ar-row">
          <button class="ar-btn ar-btn-sm" @click="loadPending">Собрать кусок</button>
          <span v-if="pending" class="ar-muted">
            в куске {{ pending.count }}, всего осталось {{ pending.left }} ({{ pending.chunks }} кусков)
          </span>
        </div>
        <template v-if="pending?.text">
          <textarea class="ar-input ar-textarea" readonly :value="pending.text"></textarea>
          <button class="ar-btn ar-btn-sm" @click="copyPending">Скопировать</button>
        </template>
        <textarea
          v-model="pasted"
          class="ar-input ar-textarea"
          placeholder="вставьте ответ: строки «слово    значения через запятую»"
        ></textarea>
        <button class="ar-btn ar-btn-accent ar-btn-sm" :disabled="pasteBusy || !pasted.trim()" @click="sendTranslations">
          Принять перевод
        </button>
        <p v-if="pasteResult" class="ar-muted">
          принято {{ pasteResult.updated }}, пропущено {{ pasteResult.skipped }}, не нашлось
          {{ pasteResult.unknown?.length || 0 }} · осталось {{ pasteResult.left }}
        </p>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Трекер дисциплины</h3>
        <select v-model="form.disciplineActivityId" class="ar-input">
          <option :value="null">не отмечать</option>
          <option v-for="a in activities" :key="a.id" :value="a.id">{{ a.title }}</option>
        </select>
        <p class="ar-muted">
          Отметка ставится сама после сессии, которая закрыла день. Уровень — по нагрузке дня:
          одна сессия минимум, три или 15 минут средний, пять или полчаса максимум. Уже стоящую
          отметку не понижает.
        </p>
      </section>

      <section class="ar-card">
        <h3 class="ar-card-title">Озвучка</h3>
        <p class="ar-muted">
          Читает синтезатор системы — он уже стоит на устройстве, платить не за что и сеть не
          нужна.
          <template v-if="!canHear"> Арабского голоса в этом браузере нет, звук работать не будет. </template>
        </p>
        <label class="ar-check">
          <input v-model="autoSpeak" type="checkbox" :disabled="!canHear" />
          Произносить слово, когда оно появляется
        </label>
      </section>

      <div class="ar-row">
        <button class="ar-btn ar-btn-accent" :disabled="saving" @click="save">
          {{ saving ? "Сохраняем…" : "Сохранить" }}
        </button>
        <span v-if="saved" class="ar-muted">сохранено</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ar-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ar-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.ar-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #b9bdc9;
}

.ar-input-sm {
  width: 78px;
  padding: 6px 8px;
}

.ar-field-col {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.ar-study {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid #2a2d38;
}

.ar-study:first-of-type {
  border-top: none;
}
</style>
