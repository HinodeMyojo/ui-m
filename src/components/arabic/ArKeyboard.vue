<script setup>
// Своя арабская клавиатура. Системную на айфоне нужно сначала включить в
// настройках, а переключать раскладку посреди семиминутной сессии мучительно
// — ровно та же причина, по которой в японском сделана своя кана-клавиатура.
//
// Раскладка не qwerty-подобная, а алфавитная: набирающий здесь не печатает, а
// вспоминает, и искать букву он будет по алфавиту, а не по привычке пальцев.
// Огласовок на клавиатуре нет намеренно — ответ сверяется по скелету.

const props = defineProps({
  modelValue: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue", "submit"]);

const ROWS = [
  ["ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر"],
  ["ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف"],
  ["ق", "ك", "ل", "م", "ن", "ه", "و", "ي", "ة", "ى"],
];

// Хамза отдельной клавишей: она садится на алиф, вав и йа, и на скелете слова
// её всё равно прощают — но тот, кто помнит, должен иметь возможность написать.
const EXTRA = ["أ", "إ", "آ", "ء", "ئ", "ؤ"];

function tap(char) {
  emit("update:modelValue", (props.modelValue || "") + char);
}

function backspace() {
  const value = props.modelValue || "";
  emit("update:modelValue", Array.from(value).slice(0, -1).join(""));
}

function space() {
  tap(" ");
}

function clear() {
  emit("update:modelValue", "");
}
</script>

<template>
  <div class="ark">
    <div v-for="(row, i) in ROWS" :key="i" class="ark-row">
      <button v-for="char in row" :key="char" class="ark-key" @click="tap(char)">{{ char }}</button>
    </div>
    <div class="ark-row ark-row-extra">
      <button v-for="char in EXTRA" :key="char" class="ark-key ark-key-soft" @click="tap(char)">
        {{ char }}
      </button>
    </div>
    <div class="ark-row ark-row-ctl">
      <button class="ark-key ark-key-wide" @click="clear">очистить</button>
      <button class="ark-key ark-key-wide" @click="space">пробел</button>
      <button class="ark-key ark-key-wide" @click="backspace">⌫</button>
      <button class="ark-key ark-key-go" @click="emit('submit')">↵</button>
    </div>
  </div>
</template>

<style scoped>
.ark {
  display: flex;
  flex-direction: column;
  gap: 4px;
  direction: rtl;
}

.ark-row {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.ark-key {
  flex: 1 1 0;
  min-width: 0;
  /* Высота под палец. Меньше сорока — мимо попадают на ходу, больше —
     клавиатура вместе с полем ответа не помещается в нижнюю половину. */
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid #2f3340;
  background: #22242d;
  color: #e8eaf2;
  font-size: 22px;
  font-family: "Geeza Pro", "Noto Naskh Arabic", "Segoe UI", serif;
  cursor: pointer;
  padding: 0;
}

.ark-key:active {
  background: #2c2f3a;
}

.ark-key-soft {
  font-size: 19px;
  color: #b9bdc9;
}

.ark-row-extra .ark-key {
  flex: 0 1 46px;
}

.ark-row-ctl {
  direction: ltr;
}

.ark-key-wide {
  font-size: 13px;
  font-family: inherit;
  color: #b9bdc9;
}

.ark-key-go {
  flex: 0 0 56px;
  background: #18a999;
  border-color: #18a999;
  color: #06201d;
  font-size: 18px;
}

/* На низком экране (айфон с открытой панелью браузера) клавиши ужимаются
   вместо того, чтобы выталкивать «Проверить» за край. */
@media (max-height: 700px) {
  .ark-key {
    min-height: 34px;
    font-size: 19px;
  }
}
</style>
