<script setup>
import { ref, onBeforeUnmount } from "vue";

// Скан страницы или манги. Распознавание идёт прямо в браузере (tesseract.js):
// облачный OCR требует ключа и денег, а сервер у нас free-tier — держать на нём
// распознавание нечем.
//
// Честно про качество: чистый печатный текст из учебника берётся хорошо, манга
// с её шрифтами и вертикальным набором — плохо. Поэтому первым делом на экране
// стоит подсказка про Google Объектив и Live Text: у телефона своё
// распознавание, и оно заметно лучше всего, что можно уместить в браузер.

const emit = defineEmits(["analyze"]);

const file = ref(null);
const preview = ref("");
const text = ref("");
const busy = ref(false);
const progress = ref(0);
const stage = ref("");
const error = ref("");

let worker = null;

function pick(event) {
  const chosen = event.target.files?.[0];
  if (!chosen) return;
  if (preview.value) URL.revokeObjectURL(preview.value);
  file.value = chosen;
  preview.value = URL.createObjectURL(chosen);
  text.value = "";
  error.value = "";
}

async function recognise() {
  if (!file.value || busy.value) return;
  busy.value = true;
  error.value = "";
  progress.value = 0;
  stage.value = "загружаю распознаватель";
  try {
    // Библиотека и японские данные грузятся только здесь: это несколько
    // мегабайт, и первому экрану приложения они не нужны.
    const { createWorker } = await import("tesseract.js");
    if (!worker) {
      worker = await createWorker("jpn", 1, {
        logger: (m) => {
          if (typeof m.progress === "number") progress.value = Math.round(m.progress * 100);
          if (m.status === "recognizing text") stage.value = "распознаю";
          else if (m.status?.includes("loading")) stage.value = "загружаю распознаватель";
        },
      });
    }
    stage.value = "распознаю";
    const { data } = await worker.recognize(file.value);
    // Тессеракт расставляет пробелы между иероглифами — в японском их нет,
    // и разбору они мешают.
    text.value = (data.text || "").replace(/[ \t]+/g, "").trim();
    if (!text.value) error.value = "ничего не распозналось — попробуй кадр покрупнее и ровнее";
  } catch (e) {
    error.value = e.message || "распознаватель не запустился";
  } finally {
    busy.value = false;
    stage.value = "";
  }
}

onBeforeUnmount(async () => {
  if (preview.value) URL.revokeObjectURL(preview.value);
  if (worker) await worker.terminate();
});
</script>

<template>
  <div class="jsc">
    <section class="jp-card">
      <h3>Сначала — про телефон</h3>
      <p class="jp-muted">
        У твоего телефона уже есть распознавание, и оно лучше любого, что помещается в браузер:
        на Android — <b>Google Объектив</b>, на iPhone — <b>Live Text</b> (навёл камеру, выделил
        текст, «Скопировать»). Скопированное вставляй во вкладку «Разбор» — там разберётся
        каждый знак и каждое слово.
      </p>
      <button class="jp-btn" @click="emit('analyze', '')">Открыть «Разбор»</button>
    </section>

    <section class="jp-card">
      <h3>Или распознать здесь</h3>
      <p class="jp-muted">
        Распознавание идёт на твоём устройстве, ничего никуда не уходит. Печатный текст из
        учебника берётся хорошо, манга — плохо: шрифты и вертикальный набор ему не даются.
        Японские данные скачиваются один раз, дальше работает и без сети.
      </p>

      <label class="jsc-pick">
        <input type="file" accept="image/*" capture="environment" @change="pick" />
        <span>📷 Выбрать или снять</span>
      </label>

      <div v-if="preview" class="jsc-preview">
        <img :src="preview" alt="Снимок для распознавания" />
      </div>

      <div class="jp-row" style="margin-top: 10px">
        <button class="jp-btn is-primary" :disabled="!file || busy" @click="recognise">
          Распознать
        </button>
        <span v-if="busy" class="jp-muted">{{ stage }} {{ progress }}%</span>
      </div>
      <div v-if="busy" class="jp-bar" style="margin-top: 8px">
        <span :style="{ width: progress + '%' }" />
      </div>

      <div v-if="error" class="jp-error" style="margin-top: 10px">{{ error }}</div>
    </section>

    <section v-if="text" class="jp-card">
      <h3>Что распозналось</h3>
      <p class="jp-muted">Поправь, если распознаватель напутал — и разбирай.</p>
      <textarea v-model="text" class="jp-textarea" style="margin-top: 10px"></textarea>
      <div class="jp-row" style="margin-top: 8px">
        <button class="jp-btn is-primary" @click="emit('analyze', text)">Разобрать</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.jsc {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Системное поле выбора файла выглядит инородно и на телефоне мелкое —
   прячем его под свою кнопку. */
.jsc-pick input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.jsc-pick {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 16px;
  margin-top: 10px;
  border-radius: 11px;
  background: #22242d;
  border: 1px solid #2f3340;
  color: #e8eaf2;
  font-size: 14px;
  cursor: pointer;
}

.jsc-preview {
  margin-top: 10px;
}

.jsc-preview img {
  max-width: 100%;
  max-height: 320px;
  border-radius: 12px;
  border: 1px solid #2a2d38;
  display: block;
}
</style>
