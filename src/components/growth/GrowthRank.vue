<script setup>
// Ранг и аура — вкладка панели «Я». docs/me-module.md (back-m)
//
// Отвечает на три вопроса: какой у меня свисток и что он значит, что нужно
// для следующего, и из чего сейчас сложилась аура — живыми числами, а не
// словами «тело» и «золото».
import { computed, ref, watch } from "vue";
import { AURA_LEVELS, currentWhistle, growth, nextWhistle, openMe, rank } from "@/composables/useGrowth.js";
import { AURA_STREAK_FULL } from "./heroRhythm.js";
import WhistleBadge from "./WhistleBadge.vue";

const props = defineProps({
  aura: { type: Object, required: true }, // heroAura(): level, mean, next, body, gold, fire, streak
  fire: { type: Object, required: true }, // heroFire(): fire 0..3, streak
});
const emit = defineEmits(["hero-tab"]);

const board = computed(() => growth.value);
const whistles = computed(() => rank.value?.whistles || []);
const selectedKey = ref("");
watch(
  () => nextWhistle.value?.key || currentWhistle.value.key,
  (k) => {
    if (!selectedKey.value) selectedKey.value = k;
  },
  { immediate: true },
);
const selected = computed(() => whistles.value.find((w) => w.key === selectedKey.value) || null);

function stateOf(w) {
  if (w.key === currentWhistle.value.key) return "сейчас";
  if (w.reached) return "получен";
  if (w.key === nextWhistle.value?.key) return `следующий · ${pct(w.progress)}`;
  return `${pct(w.progress)}`;
}

const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const money = (v) => `${Math.round(v || 0).toLocaleString("ru-RU")} ₽`;

const sources = computed(() => {
  const au = board.value?.aura || {};
  const target = board.value?.profile?.goldTarget || 0;
  const flame = ["угли", "жёлтое", "синее", "красное"][props.fire.fire] || "";
  return [
    {
      key: "body",
      icon: "🏃",
      title: "Спорт",
      value: props.aura.body,
      line: au.bodyTotal
        ? `${au.bodyDone} из ${au.bodyTotal} запланированных тренировок за 30 дней закрыты`
        : "За 30 дней в «Спорте» нет запланированных тренировок — доля пустая",
      how: "Запланируй тренировки в «Спорте» и закрывай их.",
      link: { to: "/sport", text: "Открыть «Спорт»" },
    },
    {
      key: "gold",
      icon: "💰",
      title: "Доход",
      value: props.aura.gold,
      line: au.goldAmount
        ? `В среднем ${money(au.goldAmount)} в месяц за 3 последних месяца — из цели ${money(target)}`
        : "Фактов зарплаты за последние месяцы нет — доля пустая",
      how: "Растёт вместе с фактическим доходом. Цель меняется во вкладке «Герой».",
      heroTab: true,
    },
    {
      key: "fire",
      icon: "🔥",
      title: "Стрик дисциплины",
      value: props.aura.fire,
      line: `${props.aura.streak} ${daysWord(props.aura.streak)} подряд с закрытой дисциплиной — полная доля с ${AURA_STREAK_FULL}`,
      how: `Это же число горит костром в углу панели героя. Пламя сейчас ${flame}: жёлтое — день закрыт на минимум, синее — на средний, красное — на максимум.`,
    },
  ];
});

function daysWord(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "дня";
  return "дней";
}

function openGate(g) {
  if (g.levelId) openMe(g.levelId, "tree");
}
</script>

<template>
  <div class="gr">
    <section class="gr-hero">
      <WhistleBadge :whistle="currentWhistle.key" :aura="aura.level" :size="150" />
      <div class="gr-hero-text">
        <div class="gr-label">Ранг</div>
        <h3 :style="{ color: currentWhistle.color }">{{ currentWhistle.title }}</h3>
        <p>{{ currentWhistle.meaning }}</p>
        <p class="gr-muted">
          Свисток растёт от знаний — пройденных уровней — и никогда не падает. Аура вокруг него колеблется:
          это форма прямо сейчас.
        </p>
        <div class="gr-facts">
          <span><b>{{ rank?.doneTotal ?? 0 }}</b> уровней пройдено</span>
          <span v-if="nextWhistle">до «{{ nextWhistle.title }}» — <b>{{ pct(nextWhistle.progress) }}</b></span>
          <span>аура «{{ AURA_LEVELS[aura.level].title }}» · {{ pct(aura.mean) }}</span>
        </div>
      </div>
    </section>

    <section class="gr-sec">
      <div class="gr-sec-head">
        <h4>Свистки</h4>
        <span class="gr-muted">от Колокольчика до Белого; между соседними — годы</span>
      </div>
      <div class="gr-ladder">
        <button v-for="(w, i) in whistles" :key="w.key" class="gr-step"
          :class="{ on: selectedKey === w.key, now: w.key === currentWhistle.key, reached: w.reached }"
          :style="{ '--c': w.color }" @click="selectedKey = w.key">
          <span class="gr-step-num">{{ i + 1 }}</span>
          <WhistleBadge :whistle="w.key" bare :dim="!w.reached" :size="64" />
          <b>{{ w.title }}</b>
          <small>{{ stateOf(w) }}</small>
          <span v-if="!w.reached" class="gr-bar"><em :style="{ width: pct(w.progress) }" /></span>
        </button>
      </div>

      <div v-if="selected" class="gr-gate" :style="{ '--c': selected.color }">
        <div class="gr-gate-head">
          <b>{{ selected.title }}</b> — {{ selected.meaning }}
        </div>
        <p v-if="!selected.needLevels && !selected.gates.length" class="gr-muted">Выдаётся на старте.</p>
        <template v-else>
          <div class="gr-gate-title">{{ selected.reached ? "Ворота пройдены" : "Ворота: всё из списка" }}</div>
          <div class="gr-gate-row">
            <span>{{ (rank?.doneTotal ?? 0) >= selected.needLevels ? "☑" : "☐" }}</span>
            <span class="gr-gate-text">Пройти {{ selected.needLevels }} уровней в любых навыках</span>
            <span class="gr-num">{{ Math.min(rank?.doneTotal ?? 0, selected.needLevels) }}/{{ selected.needLevels }}</span>
          </div>
          <button v-for="g in selected.gates" :key="g.title" class="gr-gate-row link" :disabled="!g.levelId"
            :title="g.levelId ? 'Открыть уровень' : 'Такого уровня в ветке нет'" @click="openGate(g)">
            <span>{{ g.done ? "☑" : "☐" }}</span>
            <span class="gr-gate-text" :class="{ done: g.done }">{{ g.title }}</span>
            <span class="gr-num">{{ g.levelId ? "→" : "нет в ветке" }}</span>
          </button>
          <p class="gr-muted small">
            Ворота — первый набросок: столпы, без которых ранг был бы нечестным. Когда ворота закрыты, свисток
            выдаётся сам при зачёте уровня и пишется в летопись.
          </p>
        </template>
      </div>
    </section>

    <section class="gr-sec">
      <div class="gr-sec-head">
        <h4>Аура</h4>
        <span class="gr-muted">среднее трёх долей ниже; меняется каждый день</span>
      </div>
      <div class="gr-auras">
        <div v-for="(l, i) in AURA_LEVELS" :key="l.title" class="gr-aura" :class="{ now: aura.level === i }">
          <WhistleBadge :whistle="currentWhistle.key" :aura="i" :size="64" />
          <b>{{ l.title }}</b>
          <small>{{ i === 0 ? "до 12%" : i === 4 ? "от 88%" : `от ${Math.round(l.from * 100)}%` }}</small>
        </div>
      </div>
      <div class="gr-sources">
        <div v-for="s in sources" :key="s.key" class="gr-source">
          <span class="gr-source-icon">{{ s.icon }}</span>
          <div class="gr-source-body">
            <div class="gr-source-head"><b>{{ s.title }}</b><span class="gr-num">{{ pct(s.value) }}</span></div>
            <span class="gr-bar wide"><em :class="s.key" :style="{ width: pct(s.value) }" /></span>
            <span>{{ s.line }}</span>
            <span class="gr-muted small">
              {{ s.how }}
              <router-link v-if="s.link" :to="s.link.to">{{ s.link.text }}</router-link>
              <button v-if="s.heroTab" class="gr-inline" @click="emit('hero-tab')">Поменять цель</button>
            </span>
          </div>
        </div>
      </div>
      <p class="gr-total">
        ({{ pct(aura.body) }} + {{ pct(aura.gold) }} + {{ pct(aura.fire) }}) / 3 = <b>{{ pct(aura.mean) }}</b> →
        «{{ AURA_LEVELS[aura.level].title }}».
        <template v-if="aura.next !== null">
          До «{{ AURA_LEVELS[aura.level + 1].title }}» не хватает {{ Math.max(1, Math.ceil(aura.next * 100)) }} п.п. среднего.
        </template>
      </p>
    </section>
  </div>
</template>

<style scoped>
.gr {
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
}

.gr-hero {
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 16px 20px;
  border-radius: 14px;
  border: 1px solid #262833;
  background: radial-gradient(600px 200px at 10% 50%, #1e2030, #14151b);
}

.gr-hero-text h3 {
  margin: 2px 0 6px;
  font-size: 26px;
}

.gr-hero-text p {
  margin: 0 0 6px;
  max-width: 720px;
  line-height: 1.45;
}

.gr-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9aa0b0;
}

.gr-muted {
  color: #9aa0b0;
  font-size: 13px;
}

.small {
  font-size: 12px;
}

.gr-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.gr-facts span {
  padding: 4px 10px;
  border-radius: 999px;
  background: #1d1f29;
  border: 1px solid #2a2d38;
  font-size: 13px;
}

.gr-sec {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gr-sec-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.gr-sec-head h4 {
  margin: 0;
  font-size: 16px;
}

.gr-ladder {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.gr-step {
  --c: #9aa0b0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: 12px;
  border: 1px solid #2a2d38;
  background: #171820;
  color: #e8eaf0;
  cursor: pointer;
}

.gr-step b {
  font-size: 13px;
  text-align: center;
}

.gr-step small {
  color: #9aa0b0;
  font-size: 11px;
}

.gr-step.reached {
  border-color: color-mix(in srgb, var(--c) 50%, #2a2d38);
}

.gr-step.now {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 60%, transparent), 0 0 24px color-mix(in srgb, var(--c) 30%, transparent);
}

.gr-step.on {
  background: #1f2130;
  outline: 1px solid #fff6;
}

.gr-step-num {
  position: absolute;
  left: 8px;
  top: 6px;
  font-size: 11px;
  color: #6b7186;
}

.gr-bar {
  width: 80%;
  height: 4px;
  border-radius: 2px;
  background: #2a2d38;
  overflow: hidden;
}

.gr-bar.wide {
  width: 100%;
}

.gr-bar em {
  display: block;
  height: 100%;
  background: var(--c, #6e4aff);
}

.gr-bar em.body {
  background: #63c94f;
}

.gr-bar em.gold {
  background: #e3b341;
}

.gr-bar em.fire {
  background: #ff7a45;
}

.gr-gate {
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--c) 40%, #2a2d38);
  background: #15161d;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gr-gate-head {
  font-size: 14px;
}

.gr-gate-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #9aa0b0;
  margin-top: 4px;
}

.gr-gate-row {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 8px;
  background: #1a1c24;
  border: 0;
  color: inherit;
  text-align: left;
  font-size: 14px;
}

.gr-gate-row.link {
  cursor: pointer;
}

.gr-gate-row.link:hover:not(:disabled) {
  background: #22253a;
}

.gr-gate-row:disabled {
  opacity: 0.6;
  cursor: default;
}

.gr-gate-text.done {
  color: #9aa0b0;
  text-decoration: line-through;
}

.gr-num {
  font-variant-numeric: tabular-nums;
  color: #b9bfd0;
  font-size: 13px;
}

.gr-auras {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.gr-aura {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 6px;
  border-radius: 12px;
  border: 1px solid #2a2d38;
  background: #171820;
}

.gr-aura small {
  color: #9aa0b0;
  font-size: 11px;
}

.gr-aura.now {
  border-color: #ffd98a;
  box-shadow: 0 0 0 1px #ffd98a66 inset, 0 0 18px #ffd98a22;
}

.gr-sources {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gr-source {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #171820;
  border: 1px solid #2a2d38;
}

.gr-source-icon {
  font-size: 22px;
  text-align: center;
}

.gr-source-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.gr-source-head {
  display: flex;
  justify-content: space-between;
}

.gr-source a,
.gr-inline {
  color: #8fa8ff;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font-size: 12px;
  margin-left: 6px;
}

.gr-total {
  margin: 0;
  font-size: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #1a1c24;
}

@media (max-width: 1200px) {
  .gr-ladder {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
