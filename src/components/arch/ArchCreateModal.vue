<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { createArchProject } from "@/components/archApi.js";

// Новый проект: название, короткое имя и шаблон, из которого он вырастет.
const props = defineProps({
  templates: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "created"]);

const form = reactive({
  title: "",
  slug: "",
  summary: "",
  emoji: "🧩",
  repoUrl: "",
  template: "microservice",
});
const busy = ref(false);
const error = ref("");
const titleInput = ref(null);

// autofocus в модалке, открытой по клику, браузер не выполняет.
onMounted(() => titleInput.value?.focus());

// Та же транслитерация, что и на сервере: человек видит адрес заранее.
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
function slugify(s) {
  return [...s.toLowerCase()]
    .map((c) => TRANSLIT[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const slugPreview = computed(() => slugify(form.slug || form.title));
const chosen = computed(() => props.templates.find((t) => t.key === form.template) || null);

async function submit() {
  if (!form.title.trim()) {
    error.value = "Нужно название";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const created = await createArchProject({ ...form, slug: slugPreview.value });
    emit("created", created);
  } catch (err) {
    error.value = err.message || String(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="ar-modal-back" @click.self="emit('close')">
    <div class="ar-modal">
      <div class="ar-row">
        <h3 style="margin: 0">Новый проект</h3>
        <div class="ar-spacer" />
        <button class="ar-btn is-ghost" @click="emit('close')">✕</button>
      </div>

      <div v-if="error" class="ar-error">{{ error }}</div>

      <div class="ar-form-grid">
        <div class="ar-field ar-full">
          <label class="ar-label">Название</label>
          <input ref="titleInput" v-model="form.title" class="ar-input" placeholder="TaxService" @keydown.enter="submit" />
        </div>
        <div class="ar-field">
          <label class="ar-label">Короткое имя — адрес и имя для Claude</label>
          <input v-model="form.slug" class="ar-input ar-mono" :placeholder="slugPreview || 'tax-service'" />
          <span class="ar-dim" style="font-size: 12px; margin-top: 3px">/arch/{{ slugPreview || "…" }}</span>
        </div>
        <div class="ar-field">
          <label class="ar-label">Эмодзи</label>
          <input v-model="form.emoji" class="ar-input" />
        </div>
        <div class="ar-field ar-full">
          <label class="ar-label">Что это, одной-двумя фразами</label>
          <textarea v-model="form.summary" class="ar-textarea" placeholder="Приём и проведение налоговых платежей через Paygrid" />
        </div>
        <div class="ar-field ar-full">
          <label class="ar-label">Репозиторий</label>
          <input v-model="form.repoUrl" class="ar-input" placeholder="https://…" />
        </div>
      </div>

      <div>
        <label class="ar-label">Шаблон</label>
        <div style="display: grid; gap: 8px">
          <div
            v-for="tpl in templates"
            :key="tpl.key"
            class="ar-tpl"
            :class="{ 'is-active': form.template === tpl.key }"
            @click="form.template = tpl.key"
          >
            <div style="font-weight: 650">{{ tpl.title }}</div>
            <div class="ar-muted" style="font-size: 13px">{{ tpl.description }}</div>
          </div>
        </div>
        <div v-if="chosen" class="ar-dim" style="font-size: 12px; margin-top: 6px">
          Файлов: {{ chosen.files.length }} — {{ chosen.files.slice(0, 6).join(", ") }}{{ chosen.files.length > 6 ? ", …" : "" }}
        </div>
      </div>

      <div class="ar-row">
        <div class="ar-spacer" />
        <button class="ar-btn" @click="emit('close')">Отмена</button>
        <button class="ar-btn is-primary" :disabled="busy" @click="submit">Создать</button>
      </div>
    </div>
  </div>
</template>
