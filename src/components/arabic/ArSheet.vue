<script setup>
import { ref, watch, computed } from "vue";
import {
  fetchArWord,
  fetchArLetter,
  fetchArRoot,
  speakArabic,
  canSpeakArabic,
} from "@/components/arabicApi.js";

// Лист поверх экрана: всё, что известно о слове, букве или корне. Один
// компонент на три вида единиц намеренно — у них общая рамка и общий приём
// «тапнул в разборе, открылось поверх»; разводить это по трём файлам значит
// трижды чинить одну и ту же кнопку закрытия.
//
// Переходы внутри листа складываются в стопку: из слова открывается корень, из
// корня — другое слово, и «назад» возвращает туда, откуда пришли.

const props = defineProps({
  kind: { type: String, required: true }, // word | letter | root
  value: { type: String, required: true },
});
const emit = defineEmits(["close"]);

const stack = ref([]);
const data = ref(null);
const loading = ref(false);
const error = ref("");
const canHear = canSpeakArabic();

const current = computed(() => stack.value[stack.value.length - 1] || null);

async function load(entry) {
  loading.value = true;
  error.value = "";
  data.value = null;
  try {
    if (entry.kind === "letter") data.value = await fetchArLetter(entry.value);
    else if (entry.kind === "root") data.value = await fetchArRoot(entry.value);
    else data.value = await fetchArWord(entry.value);
  } catch (e) {
    error.value = e.message || "не нашлось в словаре";
  } finally {
    loading.value = false;
  }
}

function open(kind, value) {
  if (!value) return;
  stack.value.push({ kind, value });
  load(stack.value[stack.value.length - 1]);
}

function back() {
  if (stack.value.length <= 1) {
    emit("close");
    return;
  }
  stack.value.pop();
  load(current.value);
}

watch(
  () => [props.kind, props.value],
  () => {
    stack.value = [{ kind: props.kind, value: props.value }];
    load(current.value);
  },
  { immediate: true },
);

const title = computed(() => {
  if (!current.value) return "";
  if (current.value.kind === "letter") return "Буква";
  if (current.value.kind === "root") return "Корень";
  return "Слово";
});
</script>

<template>
  <div class="arsh-back" @click.self="emit('close')">
    <section class="arsh">
      <header class="arsh-top">
        <button class="arsh-btn" @click="back">{{ stack.length > 1 ? "‹ назад" : "закрыть" }}</button>
        <span class="arsh-title">{{ title }}</span>
        <button v-if="canHear && data" class="arsh-btn" @click="speakArabic(data.text || data.char || data.root)">
          🔊
        </button>
        <span v-else class="arsh-btn"></span>
      </header>

      <div v-if="loading" class="ar-muted">Загружаем…</div>
      <p v-else-if="error" class="ar-err">{{ error }}</p>

      <template v-else-if="data && current.kind === 'word'">
        <p class="ar-ar ar-word-big arsh-face">{{ data.text }}</p>
        <p v-if="data.translit" class="ar-translit">{{ data.translit }}</p>
        <p class="arsh-meaning">{{ (data.meanings || []).join(", ") }}</p>

        <div class="ar-row">
          <span v-if="data.pos" class="ar-chip">{{ data.pos }}</span>
          <span v-if="data.gender" class="ar-chip">{{ data.gender === "f" ? "жен. род" : "муж. род" }}</span>
          <span v-if="data.tier" class="ar-chip ar-chip-gold">корзина {{ data.tier }}</span>
          <span v-if="data.learned" class="ar-chip">закреплено</span>
        </div>

        <p v-if="data.plural" class="arsh-line">
          мн. ч. <span class="ar-ar arsh-alt">{{ data.plural }}</span>
        </p>
        <p v-if="data.present" class="arsh-line">
          наст. вр. <span class="ar-ar arsh-alt">{{ data.present }}</span>
        </p>

        <p v-if="data.root" class="arsh-line">
          корень
          <button class="arsh-link ar-ar" @click="open('root', data.root)">{{ data.root }}</button>
          <span v-if="data.rootMeaning" class="ar-muted">— {{ data.rootMeaning }}</span>
        </p>

        <div v-if="data.breakdown?.length" class="arsh-letters">
          <button v-for="(l, i) in data.breakdown" :key="i" class="arsh-letter" @click="open('letter', l.char)">
            <span class="ar-ar">{{ l.char }}</span>
            <small>{{ l.translit }}</small>
          </button>
        </div>

        <div v-if="data.family?.length" class="arsh-block">
          <p class="arsh-block-title">Семья корня</p>
          <button v-for="w in data.family" :key="w.bare" class="arsh-item" @click="open('word', w.bare)">
            <span class="ar-ar">{{ w.text }}</span>
            <span class="ar-muted">{{ (w.meanings || [])[0] }}</span>
          </button>
        </div>

        <div v-if="data.sentences?.length" class="arsh-block">
          <p class="arsh-block-title">Примеры</p>
          <div v-for="(s, i) in data.sentences" :key="i" class="arsh-example">
            <p class="ar-ar">{{ s.text }}</p>
            <p class="ar-muted">{{ s.translationRu }}</p>
          </div>
        </div>

        <p v-if="data.inStudy" class="ar-muted arsh-state">
          В изучении: повторов {{ data.reps }}, провалов {{ data.lapses }},
          интервал {{ data.intervalDays }} дн.
        </p>
      </template>

      <template v-else-if="data && current.kind === 'letter'">
        <p class="ar-ar ar-letter-big arsh-face">{{ data.char }}</p>
        <p class="arsh-meaning">{{ data.name }} <span v-if="data.nameAr" class="ar-ar">{{ data.nameAr }}</span></p>
        <p class="ar-translit">{{ data.translit }}</p>
        <p class="arsh-line">{{ data.sound }}</p>

        <div class="arsh-forms">
          <div v-for="(f, i) in data.forms" :key="i" class="arsh-form">
            <span class="ar-ar">{{ f }}</span>
            <small>{{ ["отдельно", "в начале", "в середине", "в конце"][i] }}</small>
          </div>
        </div>

        <div class="ar-row">
          <span class="ar-chip">{{ data.sun ? "солнечная" : "лунная" }}</span>
          <span class="ar-chip">{{ data.joins ? "соединяется" : "не соединяется влево" }}</span>
          <span class="ar-chip ar-chip-gold">№ {{ data.position }}</span>
        </div>
        <p v-if="data.note" class="ar-muted">{{ data.note }}</p>

        <div v-if="data.examples?.length" class="arsh-block">
          <p class="arsh-block-title">Слова с этой буквой</p>
          <button v-for="w in data.examples" :key="w.bare" class="arsh-item" @click="open('word', w.bare)">
            <span class="ar-ar">{{ w.text }}</span>
            <span class="ar-muted">{{ (w.meanings || [])[0] }}</span>
          </button>
        </div>
      </template>

      <template v-else-if="data && current.kind === 'root'">
        <p class="ar-ar ar-word-big arsh-face">{{ data.root }}</p>
        <p class="arsh-meaning">{{ data.meaning }}</p>
        <p v-if="data.letters" class="ar-ar ar-translit">{{ data.letters }}</p>
        <p v-if="data.note" class="ar-muted">{{ data.note }}</p>

        <div v-if="data.family?.length" class="arsh-block">
          <p class="arsh-block-title">Слова этого корня</p>
          <button v-for="w in data.family" :key="w.bare" class="arsh-item" @click="open('word', w.bare)">
            <span class="ar-ar">{{ w.text }}</span>
            <span class="ar-muted">{{ (w.meanings || [])[0] }}</span>
            <span v-if="w.learned" class="arsh-dot">●</span>
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.arsh-back {
  position: fixed;
  inset: 0;
  background: rgba(8, 9, 12, 0.72);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 60;
}

.arsh {
  width: min(560px, 100%);
  max-height: 88vh;
  overflow-y: auto;
  background: #1e2027;
  border: 1px solid #2a2d38;
  border-radius: 18px 18px 0 0;
  padding: 12px 14px 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #e8eaf2;
  text-align: center;
}

.arsh-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: -12px;
  background: #1e2027;
  padding: 4px 0 6px;
  margin: -4px 0 0;
}

.arsh-title {
  color: #7a7f8e;
  font-size: 13px;
}

.arsh-btn {
  border: none;
  background: transparent;
  color: #7a7f8e;
  font-size: 14px;
  cursor: pointer;
  min-width: 64px;
}

.arsh-face {
  margin: 4px 0 0;
}

.arsh-meaning {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.arsh-line {
  margin: 0;
  font-size: 14px;
  color: #b9bdc9;
}

.arsh-alt {
  font-size: 20px;
}

.arsh-link {
  border: none;
  background: transparent;
  color: #d9a441;
  font-size: 19px;
  cursor: pointer;
}

.arsh-letters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  direction: rtl;
}

.arsh-letter {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 40px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid #2a2d38;
  background: #22242d;
  color: inherit;
  cursor: pointer;
}

.arsh-letter .ar-ar {
  font-size: 22px;
}

.arsh-letter small {
  font-size: 10px;
  color: #7a7f8e;
  direction: ltr;
}

.arsh-forms {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.arsh-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 62px;
  padding: 6px;
  border-radius: 12px;
  background: #22242d;
}

.arsh-form .ar-ar {
  font-size: 28px;
}

.arsh-form small {
  font-size: 10px;
  color: #7a7f8e;
}

.arsh-block {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}

.arsh-block-title {
  margin: 0;
  font-size: 12px;
  color: #7a7f8e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.arsh-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid #2a2d38;
  background: #22242d;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.arsh-item .ar-ar {
  font-size: 21px;
}

.arsh-dot {
  color: #18a999;
  font-size: 10px;
}

.arsh-example {
  background: #22242d;
  border-radius: 12px;
  padding: 8px 10px;
  text-align: center;
}

.arsh-example p {
  margin: 0;
}

.arsh-example .ar-ar {
  font-size: 20px;
}

.arsh-state {
  margin-top: 6px;
}
</style>
