<script setup>
import { ref, onMounted } from "vue";
import { fetchJpSettings, saveJpSettings } from "@/components/japaneseApi.js";

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

onMounted(load);
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
