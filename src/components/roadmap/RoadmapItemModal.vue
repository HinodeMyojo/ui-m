<script setup>
import { ref } from "vue";
import { ITEM_TYPES, STATUSES, FEED_KINDS, CERT_VERDICTS } from "@/components/roadmapApi.js";

// Форма пункта: создание и правка. Полный CRUD — решение из спеки, план будет меняться.

const props = defineProps({
  item: { type: Object, required: true },
  mode: { type: String, default: "create" },
  quarters: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "save", "delete"]);

const form = ref({
  quarterId: props.item.quarterId || null,
  type: props.item.type || "book",
  tier: props.item.tier || 2,
  groupLabel: props.item.groupLabel || "",
  title: props.item.title || "",
  author: props.item.author || "",
  edition: props.item.edition || "",
  identifier: props.item.identifier || "",
  url: props.item.url || "",
  emoji: props.item.emoji || "",
  description: props.item.description || "",
  note: props.item.note || "",
  status: props.item.status || "planned",
  skipReason: props.item.skipReason || "",
  progressCurrent: props.item.progressCurrent || 0,
  progressTotal: props.item.progressTotal || 0,
  progressUnit: props.item.progressUnit || "",
  estimateHours: props.item.estimateHours || 0,
  pdfFileId: props.item.pdfFileId || null,
  certCost: props.item.certCost || "",
  certEffort: props.item.certEffort || "",
  certValue: props.item.certValue || "",
  certVerdict: props.item.certVerdict || "",
  feedKind: props.item.feedKind || "blog",
  subscribed: props.item.subscribed || false,
  feedLang: props.item.feedLang || "ru",
  tagsText: (props.item.tags || []).join(", "),
  sortOrder: props.item.sortOrder || 0,
});

function submit() {
  if (!form.value.title.trim()) return;
  const payload = {
    ...form.value,
    tier: Number(form.value.tier),
    progressCurrent: Number(form.value.progressCurrent) || 0,
    progressTotal: Number(form.value.progressTotal) || 0,
    estimateHours: Number(String(form.value.estimateHours).replace(",", ".")) || 0,
    tags: form.value.tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
  delete payload.tagsText;
  emit("save", payload);
}
</script>

<template>
  <div class="rm-modal-back" @click.self="emit('close')">
    <div class="rm-modal">
      <h3 style="margin: 0">{{ mode === "create" ? "Новый пункт" : "Правка пункта" }}</h3>

      <div class="rm-form-grid">
        <div class="rm-full">
          <label class="rm-label">Название</label>
          <input v-model="form.title" class="rm-input rm-full" style="width: 100%" />
        </div>

        <div>
          <label class="rm-label">Тип</label>
          <select v-model="form.type" class="rm-select">
            <option v-for="t in ITEM_TYPES" :key="t.code" :value="t.code">
              {{ t.emoji }} {{ t.label }}
            </option>
          </select>
        </div>

        <div>
          <label class="rm-label">Эшелон (в % идёт только Э1)</label>
          <select v-model="form.tier" class="rm-select">
            <option :value="1">Э1 — обязательное ядро</option>
            <option :value="2">Э2 — важное</option>
            <option :value="3">Э3 — по мере необходимости</option>
          </select>
        </div>

        <div>
          <label class="rm-label">Квартал</label>
          <select v-model="form.quarterId" class="rm-select">
            <option :value="null">Бэклог</option>
            <option v-for="q in quarters" :key="q.id" :value="q.id">
              Q{{ q.number }} — {{ q.title }}
            </option>
          </select>
        </div>

        <div>
          <label class="rm-label">Группа</label>
          <input v-model="form.groupLabel" class="rm-input" placeholder="Э1 — ядро" />
        </div>

        <div>
          <label class="rm-label">Автор</label>
          <input v-model="form.author" class="rm-input" />
        </div>

        <div>
          <label class="rm-label">Издание</label>
          <input v-model="form.edition" class="rm-input" />
        </div>

        <div>
          <label class="rm-label">ISBN / номер документа</label>
          <input v-model="form.identifier" class="rm-input" />
        </div>

        <div>
          <label class="rm-label">Эмодзи</label>
          <input v-model="form.emoji" class="rm-input" maxlength="4" />
        </div>

        <div class="rm-full">
          <label class="rm-label">Ссылка</label>
          <input v-model="form.url" class="rm-input" style="width: 100%" />
        </div>

        <div>
          <label class="rm-label">Прогресс</label>
          <input v-model="form.progressCurrent" class="rm-input" type="number" />
        </div>

        <div>
          <label class="rm-label">Всего (0 — безразмерный)</label>
          <input v-model="form.progressTotal" class="rm-input" type="number" />
        </div>

        <div>
          <label class="rm-label">Единица</label>
          <input v-model="form.progressUnit" class="rm-input" placeholder="страниц" />
        </div>

        <div>
          <label class="rm-label">Оценка часов</label>
          <input v-model="form.estimateHours" class="rm-input" type="number" step="0.5" />
        </div>

        <div>
          <label class="rm-label">Статус</label>
          <select v-model="form.status" class="rm-select">
            <option v-for="s in STATUSES" :key="s.code" :value="s.code">{{ s.label }}</option>
          </select>
        </div>

        <div>
          <label class="rm-label">Теги через запятую</label>
          <input v-model="form.tagsText" class="rm-input" />
        </div>

        <div v-if="form.status === 'skipped'" class="rm-full">
          <label class="rm-label">Причина пропуска</label>
          <input v-model="form.skipReason" class="rm-input" style="width: 100%" />
        </div>

        <template v-if="form.type === 'cert'">
          <div>
            <label class="rm-label">Стоимость</label>
            <input v-model="form.certCost" class="rm-input" />
          </div>
          <div>
            <label class="rm-label">Трудозатраты</label>
            <input v-model="form.certEffort" class="rm-input" />
          </div>
          <div>
            <label class="rm-label">Вердикт</label>
            <select v-model="form.certVerdict" class="rm-select">
              <option value="">—</option>
              <option v-for="v in CERT_VERDICTS" :key="v.code" :value="v.code">{{ v.label }}</option>
            </select>
          </div>
          <div class="rm-full">
            <label class="rm-label">Ценность</label>
            <input v-model="form.certValue" class="rm-input" style="width: 100%" />
          </div>
        </template>

        <template v-if="form.type === 'feed'">
          <div>
            <label class="rm-label">Вид источника</label>
            <select v-model="form.feedKind" class="rm-select">
              <option v-for="k in FEED_KINDS" :key="k.code" :value="k.code">
                {{ k.emoji }} {{ k.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="rm-label">Язык</label>
            <select v-model="form.feedLang" class="rm-select">
              <option value="ru">ru</option>
              <option value="en">en</option>
            </select>
          </div>
          <div>
            <label class="rm-label">Подписан</label>
            <input v-model="form.subscribed" type="checkbox" />
          </div>
        </template>

        <div class="rm-full">
          <label class="rm-label">Зачем это вам</label>
          <textarea v-model="form.description" class="rm-textarea" style="min-height: 80px" />
        </div>
      </div>

      <div class="rm-row">
        <button class="rm-btn is-primary" @click="submit">Сохранить</button>
        <button class="rm-btn" @click="emit('close')">Отмена</button>
        <div class="rm-spacer" />
        <button v-if="mode === 'edit'" class="rm-btn is-danger" @click="emit('delete')">
          Удалить
        </button>
      </div>
    </div>
  </div>
</template>
