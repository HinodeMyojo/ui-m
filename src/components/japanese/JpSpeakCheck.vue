<script setup>
import { ref, onBeforeUnmount } from "vue";
import { jpNormalizeReading } from "@/components/japaneseApi.js";

// Произнести знак вслух — единственный режим, где проверяется речь, а не
// нажатие.
//
// Разбирает браузер: Web Speech API есть в Safari с iOS 14.5 и в Chrome, и
// этого достаточно, чтобы отличить «прочитал это чтение» от «прочитал совсем
// другое». Оценивается именно совпадение с чтением, а не произношение: ставить
// произношение по одному распознаванию нечестно, а поймать «сказал не то»
// оно позволяет.
//
// Где распознавания нет, режим вообще не показывается — решает родитель.

const props = defineProps({
  // Чего ждём: главное чтение каной.
  expect: { type: String, required: true },
  // Прочие допустимые чтения: он и кун у знака не один.
  alsoAccept: { type: Array, default: () => [] },
});
const emit = defineEmits(["done"]);

const listening = ref(false);
const heard = ref("");
const error = ref("");
let recognition = null;

function ctor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

function start() {
  const Ctor = ctor();
  if (!Ctor) {
    error.value = "Этот браузер не умеет распознавать речь";
    return;
  }
  stop();

  heard.value = "";
  error.value = "";
  recognition = new Ctor();
  recognition.lang = "ja-JP";
  recognition.interimResults = false;
  recognition.maxAlternatives = 5;

  recognition.onresult = (event) => {
    // Берём все варианты распознавания: японские чтения короткие, и верный
    // нередко оказывается вторым-третьим предположением.
    const alternatives = [];
    for (const result of event.results) {
      for (let i = 0; i < result.length; i++) alternatives.push(result[i].transcript);
    }
    heard.value = alternatives[0] || "";
    finish(alternatives);
  };
  recognition.onerror = (event) => {
    listening.value = false;
    error.value =
      event.error === "not-allowed"
        ? "Микрофон запрещён — разреши доступ или отвечай кнопкой"
        : "Не расслышал";
  };
  recognition.onend = () => {
    listening.value = false;
  };

  listening.value = true;
  try {
    recognition.start();
  } catch {
    listening.value = false;
    error.value = "Микрофон занят";
  }
}

function finish(alternatives) {
  const want = jpNormalizeReading(props.expect);
  const also = props.alsoAccept.map((r) => jpNormalizeReading(r)).filter(Boolean);

  let verdict = "wrong";
  for (const raw of alternatives) {
    const said = jpNormalizeReading(raw);
    if (!said) continue;
    // Распознавание любит дописывать частицы и склеивать слова, поэтому
    // засчитывается и вхождение: «やま» внутри «やまです» — это то же чтение.
    if (said === want || said.includes(want)) {
      verdict = "right";
      break;
    }
    if (also.some((r) => said === r || said.includes(r))) {
      verdict = "close";
    }
  }
  emit("done", { verdict, heard: heard.value });
}

function stop() {
  if (!recognition) return;
  try {
    recognition.abort();
  } catch {
    // уже остановлено
  }
  recognition = null;
}

onBeforeUnmount(stop);
</script>

<template>
  <div class="jsp">
    <button class="jsp-mic" :class="{ 'is-on': listening }" @click="start">
      {{ listening ? "🎙 Слушаю…" : "🎙 Сказать вслух" }}
    </button>
    <div v-if="heard" class="jsp-heard">услышал: {{ heard }}</div>
    <div v-if="error" class="jsp-error">{{ error }}</div>
    <button class="jsp-skip" @click="emit('done', { verdict: 'wrong', heard: '' })">
      Не получается — показать ответ
    </button>
  </div>
</template>

<style scoped>
.jsp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

/* Кнопка микрофона крупная: её жмут в движении, часто одной рукой. */
.jsp-mic {
  width: 100%;
  min-height: 60px;
  border-radius: 14px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jsp-mic.is-on {
  background: var(--m-accent, #6e4aff);
  border-color: var(--m-accent, #6e4aff);
  color: #fff;
}

.jsp-heard {
  font-size: 15px;
  color: #cfd3e0;
}

.jsp-error {
  font-size: 13px;
  color: var(--m-yellow, #ffd666);
}

.jsp-skip {
  border: none;
  background: transparent;
  color: var(--m-muted, #7a7f8e);
  font-size: 13px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
</style>
