<script setup>
import { ref } from "vue";
import { roadmapToday } from "@/components/roadmapApi.js";

// Настройки roadmap'а: он же экран создания нового.

const props = defineProps({
  roadmap: { type: Object, default: null },
});
const emit = defineEmits(["close", "save", "delete", "seed"]);

const creating = ref(!props.roadmap);
const form = ref({
  title: props.roadmap?.title || "",
  subtitle: props.roadmap?.subtitle || "",
  description: props.roadmap?.description || "",
  emoji: props.roadmap?.emoji || "🗺️",
  color: props.roadmap?.color || "#1767fd",
  startDate: props.roadmap?.startDate || roadmapToday(),
  targetHoursPerWeek: props.roadmap?.targetHoursPerWeek || 15,
  isActive: props.roadmap?.isActive ?? true,
  archived: props.roadmap?.archived || false,
});

function submit() {
  if (!form.value.title.trim()) return;
  emit("save", {
    ...form.value,
    id: creating.value ? null : props.roadmap?.id,
    targetHoursPerWeek: Number(String(form.value.targetHoursPerWeek).replace(",", ".")) || 0,
    sortOrder: props.roadmap?.sortOrder || 0,
    learningSkillId: props.roadmap?.learningSkillId || null,
  });
}
</script>

<template>
  <div class="rm-modal-back" @click.self="emit('close')">
    <div class="rm-modal">
      <div class="rm-row">
        <h3 style="margin: 0">{{ creating ? "Новый roadmap" : "Настройки roadmap'а" }}</h3>
        <div class="rm-spacer" />
        <button v-if="roadmap && !creating" class="rm-btn is-small" @click="creating = true">
          ＋ Создать другой
        </button>
      </div>

      <div class="rm-form-grid">
        <div class="rm-full">
          <label class="rm-label">Название</label>
          <input v-model="form.title" class="rm-input" style="width: 100%" />
        </div>
        <div class="rm-full">
          <label class="rm-label">Подзаголовок</label>
          <input v-model="form.subtitle" class="rm-input" style="width: 100%" />
        </div>
        <div>
          <label class="rm-label">Эмодзи</label>
          <input v-model="form.emoji" class="rm-input" maxlength="4" />
        </div>
        <div>
          <label class="rm-label">Дата старта (от неё считаются кварталы)</label>
          <input v-model="form.startDate" class="rm-input" type="date" />
        </div>
        <div>
          <label class="rm-label">Цель, ч/неделю</label>
          <input v-model="form.targetHoursPerWeek" class="rm-input" type="number" step="0.5" />
        </div>
        <div>
          <label class="rm-label">Активный (питает виджеты)</label>
          <input v-model="form.isActive" type="checkbox" />
        </div>
        <div v-if="!creating">
          <label class="rm-label">В архиве</label>
          <input v-model="form.archived" type="checkbox" />
        </div>
        <div class="rm-full">
          <label class="rm-label">Описание (markdown)</label>
          <textarea v-model="form.description" class="rm-textarea" />
        </div>
      </div>

      <div class="rm-row">
        <button class="rm-btn is-primary" @click="submit">Сохранить</button>
        <button class="rm-btn" @click="emit('close')">Отмена</button>
        <button class="rm-btn" @click="emit('seed')">📥 Прогнать сид</button>
        <div class="rm-spacer" />
        <button v-if="roadmap && !creating" class="rm-btn is-danger" @click="emit('delete')">
          Удалить
        </button>
      </div>
      <p class="rm-sub" style="margin: 0">
        Сид идемпотентен: обновляет справочную часть пунктов, а прогресс и конспекты
        не трогает.
      </p>
    </div>
  </div>
</template>
