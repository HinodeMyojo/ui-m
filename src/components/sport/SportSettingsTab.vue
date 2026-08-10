<script setup>
import { ref, watch, onMounted } from "vue";
import {
  updateSportSettings,
  setSportPin,
  removeSportPin,
  setSportPinToken,
  fetchSportMetrics,
  updateSportMetric,
  createSportMetric,
  deleteSportMetric,
  importSportEntries,
  fetchSportSlots,
  createSportSlot,
  updateSportSlot,
  deleteSportSlot,
} from "@/components/sportApi.js";

const props = defineProps({ settings: { type: Object, default: null } });
const emit = defineEmits(["saved"]);

const WIDGETS = [
  ["weight", "Вес"],
  ["goals", "Цели"],
  ["today", "Сегодня"],
  ["week", "Неделя"],
  ["streak", "Серии"],
  ["records", "Рекорды"],
];

const form = ref(null);
const metrics = ref([]);
const slots = ref([]);
const error = ref("");
const info = ref("");
const busy = ref(false);

const pinOld = ref("");
const pinNew = ref("");

const importMetricId = ref("");
const importText = ref("");
const importReplace = ref(false);

const newMetric = ref({ title: "", unit: "", precision: 1, emoji: "📊" });
const newSlot = ref("");

function syncForm() {
  if (!props.settings) return;
  form.value = { ...props.settings, widgetsOrder: [...(props.settings.widgetsOrder || [])] };
}

watch(() => props.settings, syncForm, { immediate: true });

async function loadLists() {
  metrics.value = await fetchSportMetrics(true).catch(() => []);
  slots.value = await fetchSportSlots(true).catch(() => []);
}

async function save() {
  busy.value = true;
  error.value = "";
  info.value = "";
  try {
    await updateSportSettings({
      blurPreviews: form.value.blurPreviews,
      photoQuality: Number(form.value.photoQuality),
      photoMaxSide: Number(form.value.photoMaxSide),
      keepOriginal: form.value.keepOriginal,
      thumbQuality: Number(form.value.thumbQuality),
      thumbMaxSide: Number(form.value.thumbMaxSide),
      unitWeight: form.value.unitWeight,
      unitLength: form.value.unitLength,
      smoothingDays: Number(form.value.smoothingDays),
      widgetsOrder: form.value.widgetsOrder,
    });
    info.value = "Сохранено";
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось сохранить настройки";
  } finally {
    busy.value = false;
  }
}

function moveWidget(index, delta) {
  const list = form.value.widgetsOrder;
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
}

async function savePin() {
  busy.value = true;
  error.value = "";
  info.value = "";
  try {
    await setSportPin({ oldPin: pinOld.value, pin: pinNew.value });
    pinOld.value = "";
    pinNew.value = "";
    // Старые токены на сервере сброшены — свой тоже выбрасываем,
    // иначе UI будет думать, что раздел открыт.
    setSportPinToken("");
    info.value = "PIN установлен. Фото закроются до ввода кода.";
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось задать PIN";
  } finally {
    busy.value = false;
  }
}

async function dropPin() {
  busy.value = true;
  error.value = "";
  try {
    await removeSportPin(pinOld.value);
    pinOld.value = "";
    setSportPinToken("");
    info.value = "PIN снят";
    emit("saved");
  } catch (e) {
    error.value = e.message || "не удалось снять PIN";
  } finally {
    busy.value = false;
  }
}

async function toggleMetric(metric, field) {
  try {
    await updateSportMetric(metric.id, { [field]: !metric[field] });
    await loadLists();
  } catch (e) {
    error.value = e.message || "не удалось изменить метрику";
  }
}

async function addMetric() {
  if (!newMetric.value.title.trim()) return;
  try {
    await createSportMetric({
      title: newMetric.value.title,
      unit: newMetric.value.unit,
      precision: Number(newMetric.value.precision),
      emoji: newMetric.value.emoji,
      kind: "custom",
      unitKind: "custom",
    });
    newMetric.value = { title: "", unit: "", precision: 1, emoji: "📊" };
    await loadLists();
  } catch (e) {
    error.value = e.message || "не удалось создать метрику";
  }
}

async function removeMetric(metric) {
  if (!confirm(`Удалить «${metric.title}»? Встроенные метрики уходят в архив.`)) return;
  try {
    await deleteSportMetric(metric.id);
    await loadLists();
  } catch (e) {
    error.value = e.message || "не удалось удалить метрику";
  }
}

async function runImport() {
  if (!importMetricId.value || !importText.value.trim()) return;
  busy.value = true;
  error.value = "";
  info.value = "";
  try {
    const result = await importSportEntries(importMetricId.value, {
      text: importText.value,
      replace: importReplace.value,
    });
    info.value = `Добавлено ${result.added}, обновлено ${result.updated}, пропущено ${result.skipped}`;
    if (result.errors.length) info.value += ` · ${result.errors.join("; ")}`;
    importText.value = "";
  } catch (e) {
    error.value = e.message || "не удалось импортировать";
  } finally {
    busy.value = false;
  }
}

async function addSlot() {
  if (!newSlot.value.trim()) return;
  try {
    await createSportSlot({ title: newSlot.value, position: slots.value.length });
    newSlot.value = "";
    await loadLists();
  } catch (e) {
    error.value = e.message || "не удалось создать ракурс";
  }
}

async function renameSlot(slot) {
  try {
    await updateSportSlot(slot.id, { title: slot.title, code: slot.code, position: slot.position });
    await loadLists();
  } catch (e) {
    error.value = e.message || "не удалось изменить ракурс";
  }
}

async function removeSlot(slot) {
  if (!confirm(`Удалить ракурс «${slot.title}»? Кадры останутся, но без ракурса.`)) return;
  try {
    await deleteSportSlot(slot.id);
    await loadLists();
  } catch (e) {
    error.value = e.message || "не удалось удалить ракурс";
  }
}

onMounted(loadLists);
</script>

<template>
  <div class="sp-grid">
    <div v-if="error" class="sp-error" style="grid-column: 1 / -1">{{ error }}</div>
    <div v-if="info" class="sp-card" style="grid-column: 1 / -1; border-color: #63c94f">{{ info }}</div>

    <div v-if="form" class="sp-card">
      <h3>Фото</h3>
      <div class="sp-row">
        <div class="sp-field" style="width: 120px">
          <label>Качество JPEG</label>
          <input v-model="form.photoQuality" class="sp-input" type="number" min="10" max="100" />
        </div>
        <div class="sp-field" style="width: 140px">
          <label>Макс. сторона, px</label>
          <input v-model="form.photoMaxSide" class="sp-input" type="number" min="0" />
        </div>
      </div>
      <div class="sp-muted" style="margin-top: 6px">
        0 в «макс. стороне» — не уменьшать. Апскейла нет: маленькие кадры остаются как есть.
      </div>
      <div class="sp-row" style="margin-top: 8px">
        <div class="sp-field" style="width: 120px">
          <label>Качество превью</label>
          <input v-model="form.thumbQuality" class="sp-input" type="number" min="5" max="100" />
        </div>
        <div class="sp-field" style="width: 140px">
          <label>Превью, px</label>
          <input v-model="form.thumbMaxSide" class="sp-input" type="number" min="50" />
        </div>
      </div>
      <div class="sp-row" style="margin-top: 8px">
        <label class="sp-check">
          <input v-model="form.keepOriginal" type="checkbox" /> хранить оригиналы
        </label>
        <label class="sp-check">
          <input v-model="form.blurPreviews" type="checkbox" /> размывать превью до разблокировки
        </label>
      </div>
    </div>

    <div v-if="form" class="sp-card">
      <h3>Единицы и график</h3>
      <div class="sp-row">
        <div class="sp-field" style="width: 110px">
          <label>Вес</label>
          <select v-model="form.unitWeight" class="sp-select">
            <option value="kg">килограммы</option>
            <option value="lb">фунты</option>
          </select>
        </div>
        <div class="sp-field" style="width: 110px">
          <label>Длина</label>
          <select v-model="form.unitLength" class="sp-select">
            <option value="cm">сантиметры</option>
            <option value="in">дюймы</option>
          </select>
        </div>
        <div class="sp-field" style="width: 150px">
          <label>Скользящее среднее, дней</label>
          <input v-model="form.smoothingDays" class="sp-input" type="number" min="1" max="60" />
        </div>
      </div>

      <h3 style="margin-top: 14px">Виджеты обзора</h3>
      <div v-for="(code, i) in form.widgetsOrder" :key="code" class="sp-row" style="margin-top: 4px">
        <span>{{ WIDGETS.find((w) => w[0] === code)?.[1] || code }}</span>
        <div class="sp-spacer"></div>
        <button class="sp-btn sp-btn-sm" @click="moveWidget(i, -1)">↑</button>
        <button class="sp-btn sp-btn-sm" @click="moveWidget(i, 1)">↓</button>
        <button class="sp-btn sp-btn-sm is-danger" @click="form.widgetsOrder.splice(i, 1)">✕</button>
      </div>
      <div class="sp-row" style="margin-top: 6px">
        <button
          v-for="[code, title] in WIDGETS.filter((w) => !form.widgetsOrder.includes(w[0]))"
          :key="code"
          class="sp-chip"
          @click="form.widgetsOrder.push(code)"
        >
          + {{ title }}
        </button>
      </div>

      <div class="sp-row" style="margin-top: 12px">
        <div class="sp-spacer"></div>
        <button class="sp-btn is-primary" :disabled="busy" @click="save">Сохранить настройки</button>
      </div>
    </div>

    <div v-if="form" class="sp-card">
      <h3>PIN на фото</h3>
      <div class="sp-muted">
        Закрывает только раздел фото: график веса и тренировки остаются доступны.
        Сейчас PIN {{ form.pinEnabled ? "включён" : "не задан" }}.
      </div>
      <div class="sp-row" style="margin-top: 8px">
        <div v-if="form.pinEnabled" class="sp-field" style="width: 130px">
          <label>Текущий PIN</label>
          <input v-model="pinOld" class="sp-input" type="password" />
        </div>
        <div class="sp-field" style="width: 130px">
          <label>Новый PIN</label>
          <input v-model="pinNew" class="sp-input" type="password" />
        </div>
        <button class="sp-btn is-primary" style="align-self: flex-end" :disabled="busy || pinNew.length < 4" @click="savePin">
          {{ form.pinEnabled ? "Сменить" : "Установить" }}
        </button>
        <button
          v-if="form.pinEnabled"
          class="sp-btn is-danger"
          style="align-self: flex-end"
          :disabled="busy"
          @click="dropPin"
        >
          Снять
        </button>
      </div>
    </div>

    <div class="sp-card">
      <h3>Метрики</h3>
      <div v-for="m in metrics" :key="m.id" class="sp-row" style="margin-top: 4px">
        <span>{{ m.emoji }} {{ m.title }}</span>
        <span class="sp-muted">{{ m.unit }}</span>
        <div class="sp-spacer"></div>
        <button class="sp-btn sp-btn-sm" :class="{ 'is-primary': m.isPinned }" @click="toggleMetric(m, 'isPinned')">
          на «Сегодня»
        </button>
        <button class="sp-btn sp-btn-sm" @click="toggleMetric(m, 'archived')">
          {{ m.archived ? "вернуть" : "в архив" }}
        </button>
        <button v-if="!m.isBuiltin" class="sp-btn sp-btn-sm is-danger" @click="removeMetric(m)">✕</button>
      </div>

      <div class="sp-row" style="margin-top: 10px">
        <input v-model="newMetric.emoji" class="sp-input" style="width: 60px" maxlength="4" />
        <input v-model="newMetric.title" class="sp-input" style="flex: 1" placeholder="Своя метрика" />
        <input v-model="newMetric.unit" class="sp-input" style="width: 80px" placeholder="ед." />
        <input v-model="newMetric.precision" class="sp-input" style="width: 70px" type="number" min="0" max="4" />
        <button class="sp-btn" @click="addMetric">Добавить</button>
      </div>
    </div>

    <div class="sp-card">
      <h3>Ракурсы съёмки</h3>
      <div v-for="s in slots" :key="s.id" class="sp-row" style="margin-top: 4px">
        <input v-model="s.title" class="sp-input" style="flex: 1" @change="renameSlot(s)" />
        <button class="sp-btn sp-btn-sm is-danger" @click="removeSlot(s)">✕</button>
      </div>
      <div class="sp-row" style="margin-top: 8px">
        <input v-model="newSlot" class="sp-input" style="flex: 1" placeholder="Новый ракурс" />
        <button class="sp-btn" @click="addSlot">Добавить</button>
      </div>
    </div>

    <div class="sp-card">
      <h3>Импорт замеров</h3>
      <div class="sp-muted">Построчно «дата;значение». Разделитель угадывается сам.</div>
      <div class="sp-row" style="margin-top: 8px">
        <select v-model="importMetricId" class="sp-select" style="max-width: 200px">
          <option value="">— метрика —</option>
          <option v-for="m in metrics" :key="m.id" :value="m.id">{{ m.title }}</option>
        </select>
        <label class="sp-check">
          <input v-model="importReplace" type="checkbox" /> перезаписывать существующие
        </label>
      </div>
      <textarea
        v-model="importText"
        class="sp-textarea"
        style="margin-top: 8px"
        placeholder="2026-08-01;82.4&#10;2026-08-02;82.1"
      />
      <div class="sp-row" style="margin-top: 8px">
        <div class="sp-spacer"></div>
        <button class="sp-btn is-primary" :disabled="busy" @click="runImport">Импортировать</button>
      </div>
    </div>
  </div>
</template>
