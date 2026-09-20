<script setup>
import { computed, watch } from "vue";
import {
  jpMainReadings,
  jpReadingParts,
  primeJapaneseSpeech,
  speakJapanese,
} from "@/components/japaneseApi.js";

// Чтения знака: он и кун.
//
// Жалоба была «у меня только онное чтение»: карточка показывала одно главное
// чтение, и у 母 им было ぼ, хотя в словах знак почти всегда はは. Теперь
// крупно стоят оба главных — те, что звучат в популярных словах, — а
// остальные мелко строкой ниже. Тап по любому произносит его.
//
// Он и кун различаются подписью и цветом, а не письмом: чтения над знаком
// пользователь просил хираганой, и катакана для онов тут не годится. Цвета те
// же, что в листе знака и в строках слов, — глаз привыкает к ним один раз.

const props = defineProps({
  // Карточка или лист знака: onReadings, kunReadings, mainOn, mainKun.
  item: { type: Object, required: true },
  // Показать все чтения, а не главные и «ещё»: для листа знака, где место есть.
  all: { type: Boolean, default: false },
});

// Сколько прочих чтений показывать строкой. У 生 куны идут полутора десятками,
// и строка во всю ширину — это уже не подсказка, а словарная статья.
const OTHERS_MAX = 6;

const mains = computed(() => jpMainReadings(props.item));

const others = computed(() => {
  const main = new Set(mains.value.map((r) => r.spoken));
  const seen = new Set();
  const out = [];
  const add = (kind, raw) => {
    const { stem, okuri } = jpReadingParts(raw);
    const spoken = stem + okuri;
    if (!spoken || main.has(spoken) || seen.has(kind + spoken)) return;
    seen.add(kind + spoken);
    out.push({ kind, stem, okuri, spoken });
  };
  for (const r of props.item?.onReadings || []) add("on", r);
  for (const r of props.item?.kunReadings || []) add("kun", r);
  return out;
});

const shownOthers = computed(() => (props.all ? others.value : others.value.slice(0, OTHERS_MAX)));
const hiddenCount = computed(() => others.value.length - shownOthers.value.length);

function kindLabel(kind) {
  return kind === "on" ? "он" : "кун";
}

// Звук заказывается заранее: на iOS проиграть можно только то, что уже лежит
// готовым к моменту тапа. Прочие чтения не заказываются — их полтора десятка,
// и тапают по ним редко; для них остаётся синтезатор браузера.
watch(
  mains,
  (list) => {
    for (const r of list) primeJapaneseSpeech(r.spoken);
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="mains.length || others.length" class="jpr">
    <div v-if="mains.length" class="jpr-mains">
      <button
        v-for="r in mains"
        :key="r.kind"
        class="jpr-main"
        :class="`is-${r.kind}`"
        :aria-label="`${kindLabel(r.kind)}: ${r.spoken}, произнести`"
        @click="speakJapanese(r.spoken)"
      >
        <span class="jpr-kind">{{ kindLabel(r.kind) }}</span>
        <span class="jpr-kana"
          >{{ r.stem }}<span v-if="r.okuri" class="jpr-okuri">{{ r.okuri }}</span></span
        >
        <span class="jpr-say" aria-hidden="true">🔊</span>
      </button>
    </div>
    <div v-if="shownOthers.length" class="jpr-rest">
      <span class="jpr-rest-label">{{ mains.length ? "ещё" : "чтения" }}</span>
      <button
        v-for="r in shownOthers"
        :key="r.kind + r.spoken"
        class="jpr-other"
        :class="`is-${r.kind}`"
        @click="speakJapanese(r.spoken)"
      >
        {{ r.stem }}<span v-if="r.okuri" class="jpr-okuri">{{ r.okuri }}</span>
      </button>
      <span v-if="hiddenCount > 0" class="jpr-rest-label">+{{ hiddenCount }}</span>
    </div>
  </div>
</template>

<style scoped>
.jpr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.jpr-mains {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

/* Главное чтение — кнопка: тапают по нему, чтобы услышать, и палец должен
   попадать с первого раза. */
.jpr-main {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  min-height: 42px;
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px solid var(--m-line, #262933);
  background: var(--m-card-2, #22242d);
  color: var(--m-text, #e6e8ef);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jpr-main:active {
  background: #2b2e39;
}

.jpr-main.is-on {
  border-color: rgba(165, 139, 255, 0.45);
}

.jpr-main.is-kun {
  border-color: rgba(99, 201, 79, 0.45);
}

.jpr-kind {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.is-on .jpr-kind,
.jpr-other.is-on {
  color: #a58bff;
}

.is-kun .jpr-kind,
.jpr-other.is-kun {
  color: #63c94f;
}

.jpr-kana {
  font-size: 20px;
  letter-spacing: 1px;
}

/* Окуригана — не чтение знака, а кана после него: она тише, чтобы было видно,
   что знак в たべる читается только た. */
.jpr-okuri {
  opacity: 0.45;
}

.jpr-say {
  font-size: 12px;
  opacity: 0.6;
}

.jpr-rest {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 4px 6px;
}

.jpr-rest-label {
  font-size: 11px;
  color: var(--m-muted, #7a7f8e);
}

.jpr-other {
  border: none;
  background: transparent;
  padding: 4px 3px;
  font-size: 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
</style>
