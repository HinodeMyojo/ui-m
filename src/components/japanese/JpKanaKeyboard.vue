<script setup>
import { ref, computed } from "vue";

// Своя кана-клавиатура. Системная японская на айфоне для шестиминутной сессии
// не годится: её надо включать в настройках раскладок, она занимает пол-экрана
// и уводит фокус наверх — а по правилу мобильного слоя всё нажимаемое живёт в
// нижней трети.
//
// Раскладка в два шага, а не сеткой 5×10: полная годзюон на 390px даёт клавиши
// по 37px, промахиваться в них пальцем — то же самое, что не иметь клавиатуры.
// Сверху полоса рядов (あかさた…), под ней пять больших клавиш выбранного ряда.

const props = defineProps({
  modelValue: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "submit"]);

// Ряды годзюон. Пустая строка — дырка в ряду (や и わ неполные), она рисуется
// заглушкой, чтобы клавиши остальных рядов не прыгали под пальцем.
const ROWS = [
  { head: "あ", keys: ["あ", "い", "う", "え", "お"] },
  { head: "か", keys: ["か", "き", "く", "け", "こ"] },
  { head: "さ", keys: ["さ", "し", "す", "せ", "そ"] },
  { head: "た", keys: ["た", "ち", "つ", "て", "と"] },
  { head: "な", keys: ["な", "に", "ぬ", "ね", "の"] },
  { head: "は", keys: ["は", "ひ", "ふ", "へ", "ほ"] },
  { head: "ま", keys: ["ま", "み", "む", "め", "も"] },
  { head: "や", keys: ["や", "", "ゆ", "", "よ"] },
  { head: "ら", keys: ["ら", "り", "る", "れ", "ろ"] },
  { head: "わ", keys: ["わ", "", "を", "", "ん"] },
];

const DAKUTEN = {
  か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご",
  さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ",
  た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど",
  は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ",
  う: "ゔ",
};

const HANDAKUTEN = { は: "ぱ", ひ: "ぴ", ふ: "ぷ", へ: "ぺ", ほ: "ぽ" };

const SMALL = {
  あ: "ぁ", い: "ぃ", う: "ぅ", え: "ぇ", お: "ぉ",
  や: "ゃ", ゆ: "ゅ", よ: "ょ", つ: "っ", わ: "ゎ",
};

const rowIndex = ref(0);
const currentKeys = computed(() => ROWS[rowIndex.value].keys);

function put(ch) {
  if (props.disabled || !ch) return;
  emit("update:modelValue", props.modelValue + ch);
}

// Знаки озвончения применяются к последнему введённому знаку, а не вводятся
// отдельным символом: сравнение чтения идёт по готовой кане.
function modify(map) {
  if (props.disabled) return;
  const value = props.modelValue;
  if (!value) return;
  const last = value.slice(-1);
  const replaced = map[last];
  if (!replaced) return;
  emit("update:modelValue", value.slice(0, -1) + replaced);
}

function backspace() {
  if (props.disabled || !props.modelValue) return;
  emit("update:modelValue", props.modelValue.slice(0, -1));
}

function clear() {
  if (props.disabled) return;
  emit("update:modelValue", "");
}
</script>

<template>
  <div class="jkb" :class="{ 'is-off': disabled }">
    <div class="jkb-rows">
      <button
        v-for="(row, i) in ROWS"
        :key="row.head"
        type="button"
        class="jkb-row"
        :class="{ 'is-on': rowIndex === i }"
        :disabled="disabled"
        @click="rowIndex = i"
      >
        {{ row.head }}
      </button>
    </div>

    <div class="jkb-keys">
      <button
        v-for="(ch, i) in currentKeys"
        :key="`${rowIndex}-${i}`"
        type="button"
        class="jkb-key"
        :class="{ 'is-hole': !ch }"
        :disabled="disabled || !ch"
        @click="put(ch)"
      >
        {{ ch }}
      </button>
    </div>

    <div class="jkb-tools">
      <button type="button" class="jkb-tool" :disabled="disabled" @click="modify(DAKUTEN)">
        ゛
      </button>
      <button type="button" class="jkb-tool" :disabled="disabled" @click="modify(HANDAKUTEN)">
        ゜
      </button>
      <button type="button" class="jkb-tool" :disabled="disabled" @click="modify(SMALL)">
        小
      </button>
      <button type="button" class="jkb-tool" :disabled="disabled" @click="put('ー')">ー</button>
      <button type="button" class="jkb-tool" :disabled="disabled" @click="backspace">⌫</button>
      <button
        type="button"
        class="jkb-tool jkb-tool-wide"
        :disabled="disabled || !modelValue"
        @click="clear"
      >
        Стереть
      </button>
    </div>
  </div>
</template>

<style scoped>
.jkb {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jkb.is-off {
  opacity: 0.45;
}

/* Полоса рядов листается вбок: десять рядов в 390px клавишами по 44px не
   помещаются, а сжимать их нельзя. */
.jkb-rows {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}

.jkb-rows::-webkit-scrollbar {
  display: none;
}

.jkb-row {
  flex: 0 0 auto;
  width: 44px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-muted, #7a7f8e);
  font-size: 17px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jkb-row.is-on {
  background: var(--m-accent, #6e4aff);
  border-color: var(--m-accent, #6e4aff);
  color: #fff;
}

.jkb-keys {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.jkb-key {
  min-height: 56px;
  border-radius: 12px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  font-size: 24px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jkb-key:active {
  background: #2b2e39;
}

/* Дырка в неполном ряду: место занято, нажать нечего. */
.jkb-key.is-hole {
  background: transparent;
  border-color: transparent;
  cursor: default;
}

.jkb-tools {
  display: grid;
  grid-template-columns: repeat(5, 1fr) 1.6fr;
  gap: 6px;
}

.jkb-tool {
  min-height: 44px;
  border-radius: 11px;
  border: 1px solid var(--m-line, #262933);
  background: #1b1d25;
  color: var(--m-text, #e6e8ef);
  font-size: 18px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jkb-tool:disabled {
  opacity: 0.4;
}

.jkb-tool-wide {
  font-size: 13px;
  font-weight: 600;
}
</style>
