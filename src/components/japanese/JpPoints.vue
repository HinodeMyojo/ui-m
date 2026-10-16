<script setup>
import { computed } from "vue";
import { JP_POINTS_LEARNED, JP_POINTS_MAX, JP_LEARN_ITERATIONS } from "@/components/japaneseApi.js";

// Шкала баллов знания иероглифа: десять делений. Первые шесть — обязательные
// (первичное изучение и повторения через 1, 3, 7, 14 и 30 дней), на шести
// знак выучен; ещё четыре — закрепление раз в месяц, другим цветом.
//
// Пока баллов ноль, знак учится — вместо пустой шкалы показываем, какая идёт
// итерация изучения из трёх.
const props = defineProps({
  points: { type: Number, default: 0 },
  // Пройдено итераций изучения (0..2), имеет смысл при нуле баллов.
  learnIter: { type: Number, default: 0 },
  // Подпись справа: «4/10» или «изучение 2/3».
  label: { type: Boolean, default: true },
  size: { type: String, default: "md" }, // md | sm
});

const cells = computed(() =>
  Array.from({ length: JP_POINTS_MAX }, (_, i) => ({
    on: i < props.points,
    bonus: i >= JP_POINTS_LEARNED,
  })),
);

const text = computed(() => {
  if (props.points <= 0) return `изучение ${props.learnIter + 1}/${JP_LEARN_ITERATIONS}`;
  if (props.points >= JP_POINTS_MAX) return "закреплён";
  if (props.points >= JP_POINTS_LEARNED) return `выучен · ${props.points}/${JP_POINTS_MAX}`;
  return `${props.points}/${JP_POINTS_MAX}`;
});

const title = computed(
  () =>
    `Баллы знания: ${props.points} из ${JP_POINTS_MAX}. ` +
    `${JP_POINTS_LEARNED} — выучен, ещё ${JP_POINTS_MAX - JP_POINTS_LEARNED} — закрепление.`,
);
</script>

<template>
  <span class="jpts" :class="`is-${size}`" :title="title" role="img" :aria-label="title">
    <span class="jpts-bar">
      <span
        v-for="(c, i) in cells"
        :key="i"
        class="jpts-cell"
        :class="{ 'is-on': c.on, 'is-bonus': c.bonus, 'is-gap': i === JP_POINTS_LEARNED }"
      />
    </span>
    <span v-if="label" class="jpts-text" :class="{ 'is-learning': points <= 0 }">{{ text }}</span>
  </span>
</template>

<style scoped>
.jpts {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.jpts-bar {
  display: inline-flex;
  gap: 3px;
}

.jpts-cell {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--m-card-2);
  border: 1px solid var(--m-line);
}

.is-sm .jpts-cell {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}

/* Между обязательными и закрепляющими — зазор: видно, где «выучен». */
.jpts-cell.is-gap {
  margin-left: 4px;
}

.jpts-cell.is-on {
  background: var(--m-accent);
  border-color: var(--m-accent);
}

.jpts-cell.is-on.is-bonus {
  background: var(--m-yellow);
  border-color: var(--m-yellow);
}

.jpts-text {
  font-size: 12px;
  color: var(--m-muted);
  white-space: nowrap;
}

.jpts-text.is-learning {
  color: var(--m-accent);
}
</style>
