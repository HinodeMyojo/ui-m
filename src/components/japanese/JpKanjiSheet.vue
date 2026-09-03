<script setup>
import { ref, watch } from "vue";
import { fetchJpKanji } from "@/components/japaneseApi.js";
import JpStrokeOrder from "./JpStrokeOrder.vue";
import JpSentenceList from "./JpSentenceList.vue";

// Знак крупным планом: как он пишется, из чего состоит и как живёт во фразе.
//
// Отдельный лист поверх сессии, а не переход в раздел: карточка на экране
// осталась неотвеченной, и уходить с неё нельзя — вернувшись, пользователь
// увидел бы новую сессию.
//
// Данные тянутся по тапу, а не приезжают с карточкой: пути черт весят под
// полтора килобайта на знак, и возить их в каждой сессии ради случая, когда
// знак незнаком, — это платить всегда за то, что нужно изредка.

const props = defineProps({
  char: { type: String, required: true },
});
const emit = defineEmits(["close"]);

const data = ref(null);
const error = ref("");
const loading = ref(false);

watch(
  () => props.char,
  async (char) => {
    if (!char) return;
    loading.value = true;
    error.value = "";
    data.value = null;
    try {
      data.value = await fetchJpKanji(char);
    } catch (e) {
      error.value = e.message || "не удалось загрузить знак";
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <!-- Teleport в body: лист живёт внутри сессии, а та лежит в контейнере со
       своим контекстом наложения, и таб-бар всплывал поверх листа при любом
       z-index. -->
  <Teleport to="body">
    <div class="jks" @click.self="emit('close')">
      <div class="jks-sheet">
        <header class="jks-top">
          <span class="jks-char">{{ char }}</span>
          <button class="jks-close" aria-label="Закрыть" @click="emit('close')">✕</button>
        </header>

        <div v-if="loading" class="jks-muted">Загружаю…</div>
        <div v-else-if="error" class="jks-muted">{{ error }}</div>

        <template v-else-if="data">
          <div class="jks-meaning">{{ (data.meaningsRu || []).slice(0, 3).join(", ") }}</div>

          <div class="jks-readings">
            <span v-for="r in data.onReadings || []" :key="`on-${r}`" class="jks-reading is-on">
              {{ r }}
            </span>
            <span v-for="r in data.kunReadings || []" :key="`kun-${r}`" class="jks-reading is-kun">
              {{ r }}
            </span>
          </div>

          <!-- Как пишется и из чего состоит: цвет черт и есть ответ на второе. -->
          <JpStrokeOrder
            v-if="data.strokePaths?.length"
            :paths="data.strokePaths"
            :groups="data.strokeGroups || []"
            :size="200"
          />

          <div v-if="data.sentences?.length" class="jks-block">
            <div class="jks-label">Примеры</div>
            <JpSentenceList :sentences="data.sentences" />
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.jks {
  position: fixed;
  inset: 0;
  /* Выше таб-бара (70): лист перекрывает навигацию целиком, иначе нижние
     примеры прячутся под неё и выглядят обрезанными. */
  z-index: 80;
  background: rgba(0, 0, 0, 0.62);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

/* Лист снизу: до крестика на телефоне дотягиваться не нужно, закрывается он
   тапом по затемнению. */
.jks-sheet {
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 18px 18px 0 0;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card, #1b1d25);
  color: var(--m-text, #e6e8ef);
  padding: 12px 14px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

/* Знак по центру, крестик поверх справа: выкладывать их в ряд значит сдвинуть
   знак влево ровно на ширину кнопки. */
.jks-top {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

.jks-char {
  font-size: 56px;
  line-height: 1.1;
}

.jks-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-muted, #7a7f8e);
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jks-meaning {
  font-size: 16px;
  color: #cfd3e0;
}

.jks-readings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.jks-reading {
  font-size: 13px;
  border-radius: 8px;
  padding: 3px 8px;
  background: var(--m-card-2, #22242d);
  border: 1px solid var(--m-line, #262933);
}

/* Он и кун различаются цветом подписи, а не только записью: катакану от
   хираганы новичок на бегу не отличает. */
.jks-reading.is-on {
  color: #a58bff;
}

.jks-reading.is-kun {
  color: #63c94f;
}

.jks-block {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jks-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--m-muted, #7a7f8e);
  text-align: left;
}

.jks-muted {
  color: var(--m-muted, #7a7f8e);
  font-size: 14px;
  padding: 20px 0;
}
</style>
