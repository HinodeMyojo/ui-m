<script setup>
import { reactive, ref } from "vue";
import { deleteArchProject, updateArchProject } from "@/components/archApi.js";

// Карточка проекта: название, короткое имя, описание, архив и удаление.
const props = defineProps({
  project: { type: Object, required: true },
});
const emit = defineEmits(["close", "saved", "removed"]);

const form = reactive({
  title: props.project.title,
  slug: props.project.slug,
  summary: props.project.summary,
  emoji: props.project.emoji,
  color: props.project.color || "#7c6cff",
  repoUrl: props.project.repoUrl,
  archived: props.project.archived,
});
const busy = ref(false);
const error = ref("");

async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await updateArchProject(props.project.id, { ...form });
    emit("saved", { slug: form.slug.trim().toLowerCase() });
  } catch (err) {
    error.value = err.message || String(err);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!window.confirm(`Удалить проект «${props.project.title}» со всеми файлами? История правок останется в базе.`)) return;
  busy.value = true;
  try {
    await deleteArchProject(props.project.id);
    emit("removed");
  } catch (err) {
    error.value = err.message || String(err);
    busy.value = false;
  }
}
</script>

<template>
  <div class="ar-modal-back" @click.self="emit('close')">
    <div class="ar-modal">
      <div class="ar-row">
        <h3 style="margin: 0">Проект</h3>
        <div class="ar-spacer" />
        <button class="ar-btn is-ghost" @click="emit('close')">✕</button>
      </div>
      <div v-if="error" class="ar-error">{{ error }}</div>
      <div class="ar-form-grid">
        <div class="ar-field ar-full">
          <label class="ar-label">Название</label>
          <input v-model="form.title" class="ar-input" />
        </div>
        <div class="ar-field">
          <label class="ar-label">Короткое имя</label>
          <input v-model="form.slug" class="ar-input ar-mono" />
        </div>
        <div class="ar-field">
          <label class="ar-label">Эмодзи и цвет</label>
          <div class="ar-row" style="flex-wrap: nowrap">
            <input v-model="form.emoji" class="ar-input" style="width: 70px" />
            <input v-model="form.color" type="color" class="ar-input" style="height: 36px; padding: 2px" />
          </div>
        </div>
        <div class="ar-field ar-full">
          <label class="ar-label">Что это</label>
          <textarea v-model="form.summary" class="ar-textarea" />
        </div>
        <div class="ar-field ar-full">
          <label class="ar-label">Репозиторий</label>
          <input v-model="form.repoUrl" class="ar-input" placeholder="https://…" />
        </div>
        <label class="ar-row ar-full ar-muted" style="font-size: 13px">
          <input v-model="form.archived" type="checkbox" /> в архиве — проект не показывается в списке
        </label>
      </div>
      <div class="ar-row">
        <button class="ar-btn is-danger" :disabled="busy" @click="remove">Удалить проект</button>
        <div class="ar-spacer" />
        <button class="ar-btn" @click="emit('close')">Отмена</button>
        <button class="ar-btn is-primary" :disabled="busy" @click="submit">Сохранить</button>
      </div>
    </div>
  </div>
</template>
