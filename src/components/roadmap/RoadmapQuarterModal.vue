<script setup>
import { ref } from "vue";

// Форма квартала. Даты по умолчанию считаются от старта roadmap'а; здесь их можно
// перебить вручную — так квартал растягивается при отставании.

const props = defineProps({
  quarter: { type: Object, required: true },
  mode: { type: String, default: "create" },
});
const emit = defineEmits(["close", "save", "delete"]);

const manualDates = ref(false);
const form = ref({
  number: props.quarter.number || 1,
  title: props.quarter.title || "",
  description: props.quarter.description || "",
  monthsSpan: props.quarter.monthsSpan || 3,
  startDate: props.quarter.startDate || "",
  endDate: props.quarter.endDate || "",
  sortOrder: props.quarter.sortOrder || props.quarter.number || 0,
});

function submit() {
  if (!form.value.title.trim()) return;
  emit("save", {
    number: Number(form.value.number),
    title: form.value.title,
    description: form.value.description,
    monthsSpan: Number(form.value.monthsSpan) || 3,
    startDate: manualDates.value && form.value.startDate ? form.value.startDate : null,
    endDate: manualDates.value && form.value.endDate ? form.value.endDate : null,
    sortOrder: Number(form.value.sortOrder) || 0,
  });
}
</script>

<template>
  <div class="rm-modal-back" @click.self="emit('close')">
    <div class="rm-modal">
      <h3 style="margin: 0">{{ mode === "create" ? "Новый квартал" : "Правка квартала" }}</h3>

      <div class="rm-form-grid">
        <div>
          <label class="rm-label">Номер</label>
          <input v-model="form.number" class="rm-input" type="number" />
        </div>
        <div>
          <label class="rm-label">Длина, месяцев</label>
          <input v-model="form.monthsSpan" class="rm-input" type="number" />
        </div>
        <div>
          <label class="rm-label">Порядок</label>
          <input v-model="form.sortOrder" class="rm-input" type="number" />
        </div>
        <div class="rm-full">
          <label class="rm-label">Название</label>
          <input v-model="form.title" class="rm-input" style="width: 100%" />
        </div>
        <div class="rm-full">
          <label class="rm-label">Описание</label>
          <textarea v-model="form.description" class="rm-textarea" style="min-height: 70px" />
        </div>

        <div class="rm-full">
          <label class="rm-label" style="display: flex; align-items: center; gap: 6px">
            <input v-model="manualDates" type="checkbox" />
            задать даты вручную (иначе считаются от старта roadmap'а)
          </label>
        </div>
        <template v-if="manualDates">
          <div>
            <label class="rm-label">Начало</label>
            <input v-model="form.startDate" class="rm-input" type="date" />
          </div>
          <div>
            <label class="rm-label">Конец</label>
            <input v-model="form.endDate" class="rm-input" type="date" />
          </div>
        </template>
      </div>

      <div class="rm-row">
        <button class="rm-btn is-primary" @click="submit">Сохранить</button>
        <button class="rm-btn" @click="emit('close')">Отмена</button>
        <div class="rm-spacer" />
        <button v-if="mode === 'edit'" class="rm-btn is-danger" @click="emit('delete')">
          Удалить
        </button>
      </div>
      <p v-if="mode === 'edit'" class="rm-sub" style="margin: 0">
        При удалении пункты уходят в бэклог — прочитанное не теряется.
      </p>
    </div>
  </div>
</template>
