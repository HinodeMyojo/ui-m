<script setup>
// Панель героя — левая колонка главной. docs/me-module.md (back-m)
//
// Сверху ранг-свисток с аурой, возраст и костёр-стрик; в центре сцена с
// героем, который живёт в ритме дня; снизу уровни, взятые в этом месяце.
// Клик по уровню или по герою открывает панель «Я».
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { fetchDisciplineMonth, disciplineLogicalToday } from "@/components/api.js";
import { seedGrowth, setGrowthDayState, updateGrowthProfile } from "@/components/growthApi.js";
import {
  disciplineMonth,
  growth,
  growthAct,
  growthError,
  levelColor,
  loadGrowth,
  MONTH_NAMES_IN,
  openMe,
  pickedLevels,
  WHISTLES,
} from "@/composables/useGrowth.js";
import { useHeroWeather } from "@/components/hero/useHeroWeather.js";
import {
  HERO_ACTIONS,
  heroAction,
  heroAge,
  heroAura,
  heroFire,
  heroLocation,
  yearsWord,
} from "./heroRhythm.js";
import WhistleBadge from "./WhistleBadge.vue";

const HeroScene = defineAsyncComponent(() => import("@/components/hero/HeroScene.vue"));

const weather = useHeroWeather();
const now = ref(new Date());
const discipline = disciplineMonth;
let clock = null;

async function loadDiscipline() {
  const today = disciplineLogicalToday();
  const [y, m] = today.split("-").map(Number);
  try {
    discipline.value = await fetchDisciplineMonth(m, y);
  } catch {
    discipline.value = null;
  }
}

function onFocus() {
  loadDiscipline();
  loadGrowth();
}

onMounted(() => {
  if (!growth.value) loadGrowth();
  loadDiscipline();
  // Сцена живёт по часам: раз в минуту пересчитываем, что делает герой, и
  // раз в пять — подтягиваем дисциплину (костёр загорается после отметки).
  let tick = 0;
  clock = setInterval(() => {
    now.value = new Date();
    tick += 1;
    if (tick % 5 === 0) loadDiscipline();
  }, 60_000);
  window.addEventListener("focus", onFocus);
  window.addEventListener("discipline:reload", loadDiscipline);
});

onBeforeUnmount(() => {
  clearInterval(clock);
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("discipline:reload", loadDiscipline);
});

const board = computed(() => growth.value);
const profile = computed(() => board.value?.profile || {});
const dayState = computed(() => board.value?.dayState || "good");
const whistle = computed(() => WHISTLES[profile.value.whistle] || WHISTLES.bell);
const age = computed(() => heroAge(profile.value.birthDate, now.value));
const fire = computed(() => heroFire(discipline.value, disciplineLogicalToday()));
const aura = computed(() => heroAura(board.value?.aura, fire.value.streak));
const action = computed(() => heroAction(profile.value, now.value, dayState.value));
const location = computed(() => heroLocation(action.value, now.value));
const manual = computed(
  () => !!(profile.value.action && profile.value.actionUntil && new Date(profile.value.actionUntil) > now.value),
);
const mood = computed(() => ({ weak: "weak", strong: "strong" })[dayState.value] || "good");

const FIRE_COLORS = ["#7a5a48", "#ffd666", "#4aa8ff", "#ff4d4d"];
const FIRE_TITLES = [
  "Угли: стрик оборвался",
  "Жёлтое пламя: минимум",
  "Синее пламя: средний",
  "Красное пламя: максимум",
];

const monthIn = computed(() => {
  const m = board.value?.month?.month;
  return m ? MONTH_NAMES_IN[m - 1] : "";
});

async function setAction(key) {
  const until = key ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null;
  await growthAct(() => updateGrowthProfile({ action: key || "", actionUntil: until }));
}

async function toggleSound(value) {
  await growthAct(() => updateGrowthProfile({ sound: value }));
}

async function setDay(state) {
  await growthAct(() => setGrowthDayState(state === dayState.value ? "good" : state));
}

const seeding = ref(false);
async function seed() {
  seeding.value = true;
  await growthAct(seedGrowth);
  seeding.value = false;
}

function pct(v) {
  return `${Math.round((v || 0) * 100)}%`;
}
</script>

<template>
  <aside class="hero-panel">
    <header class="hp-top">
      <button class="hp-rank" :title="`${whistle.title} · аура ${aura.level}/4`" @click="openMe(null, 'tree')">
        <WhistleBadge :whistle="profile.whistle || 'bell'" :aura="aura.level" :size="46" />
        <div class="hp-rank-text">
          <b>{{ whistle.title }}</b>
          <span>{{ age.years }} {{ yearsWord(age.years) }} · {{ age.months }} мес · {{ age.days }} дн</span>
        </div>
      </button>
      <div class="hp-fire" :style="{ '--fire': FIRE_COLORS[fire.fire] }" :title="FIRE_TITLES[fire.fire]">
        <span class="hp-fire-icon">{{ fire.fire ? "🔥" : "♨" }}</span>
        <b>{{ fire.streak }}</b>
      </div>
    </header>

    <div class="hp-scene" @click="openMe(null, 'tree')">
      <HeroScene
        :action="action"
        :location="location"
        :fire="fire.fire"
        :streak="fire.streak"
        :aura="aura.level"
        :whistle="profile.whistle || 'bell'"
        :age="age.years"
        :mood="mood"
        :weather="weather"
        :now="now"
        :sound="!!profile.sound"
        @update:sound="toggleSound"
      />
      <div class="hp-name">{{ profile.heroName || "Хиноде" }}</div>
    </div>

    <div class="hp-actions">
      <button
        v-for="a in HERO_ACTIONS"
        :key="a.key"
        class="hp-act"
        :class="{ on: action === a.key, manual: manual && action === a.key }"
        :title="a.title"
        @click="setAction(a.key)"
      >{{ a.icon }}</button>
      <button class="hp-act" :class="{ on: !manual }" title="Сам по ритму дня" @click="setAction('')">↺</button>
    </div>

    <div class="hp-day">
      <span class="hp-day-label">День</span>
      <button :class="{ on: dayState === 'strong' }" title="Сильный день" @click="setDay('strong')">💪</button>
      <button :class="{ on: dayState === 'good' }" title="Обычный день" @click="setDay('good')">🙂</button>
      <button :class="{ on: dayState === 'weak' }" title="Слабый день" @click="setDay('weak')">🪫</button>
    </div>

    <div class="hp-aura" title="Аура: тело, золото и костёр">
      <div class="hp-aura-row"><span>Тело</span><i><em :style="{ width: pct(aura.body) }" /></i></div>
      <div class="hp-aura-row"><span>Золото</span><i><em class="gold" :style="{ width: pct(aura.gold) }" /></i></div>
      <div class="hp-aura-row"><span>Костёр</span><i><em class="fire" :style="{ width: pct(aura.fire) }" /></i></div>
    </div>

    <div v-if="growthError" class="hp-error">{{ growthError }}</div>

    <section class="hp-month">
      <template v-if="board && !board.seeded">
        <p class="hp-hint">Ветка развития пуста. Каркас — 60 навыков и их уровни как ориентир.</p>
        <button class="hp-cta" :disabled="seeding" @click="seed">
          {{ seeding ? "Заливаю…" : "Залить каркас навыков" }}
        </button>
      </template>
      <template v-else-if="board">
        <div class="hp-month-head">
          <span>Учу в {{ monthIn }}</span>
          <button class="hp-link" @click="openMe(null, 'month')">выбор</button>
        </div>
        <button v-if="board.month.needPick" class="hp-cta pulse" @click="openMe(null, 'month')">
          Выбери {{ board.month.min }}–{{ board.month.max }} уровня на месяц
        </button>
        <button
          v-for="l in pickedLevels"
          :key="l.id"
          class="hp-level"
          :style="{ '--c': levelColor(l) }"
          @click="openMe(l.id, 'tree')"
        >
          <span class="hp-level-emoji">{{ l.emoji || "◆" }}</span>
          <span class="hp-level-body">
            <span class="hp-level-title">{{ l.title }}</span>
            <span class="hp-level-bar"><em :style="{ width: pct(l.progress) }" /></span>
          </span>
          <span class="hp-level-meta">
            {{ pct(l.progress) }}
            <small v-if="!l.maintenance">{{ l.monthsLeft > 0 ? `${l.monthsLeft} мес` : "срок" }}</small>
          </span>
        </button>
        <button class="hp-open" @click="openMe(null, 'tree')">Открыть «Я» →</button>
      </template>
    </section>
  </aside>
</template>

<style scoped>
.hero-panel {
  width: 340px;
  flex: 0 0 340px;
  box-sizing: border-box;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-right: 2px solid #1e2025;
  background: linear-gradient(180deg, #15161c, #121318);
  color: #e8eaf0;
  position: sticky;
  top: 0;
  align-self: flex-start;
  max-height: 100vh;
  overflow-y: auto;
  scrollbar-width: thin;
}

.hp-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hp-rank {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
  min-width: 0;
}

.hp-rank-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.hp-rank-text b {
  font-size: 14px;
}

.hp-rank-text span {
  font-size: 12px;
  color: #9aa0b0;
  font-variant-numeric: tabular-nums;
}

.hp-fire {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--fire) 60%, transparent);
  background: color-mix(in srgb, var(--fire) 14%, transparent);
  color: var(--fire);
  font-variant-numeric: tabular-nums;
}

.hp-fire-icon {
  filter: drop-shadow(0 0 6px var(--fire));
}

.hp-scene {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #262833;
  cursor: pointer;
  background: #0b0c10;
  min-height: 180px;
}

.hp-name {
  position: absolute;
  left: 8px;
  bottom: 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #ffffffb0;
  text-shadow: 0 1px 3px #000;
  pointer-events: none;
}

.hp-actions,
.hp-day {
  display: flex;
  gap: 4px;
  align-items: center;
}

.hp-act,
.hp-day button {
  flex: 1;
  height: 30px;
  border-radius: 8px;
  border: 1px solid #262833;
  background: #1a1c24;
  cursor: pointer;
  font-size: 15px;
  color: #e8eaf0;
}

.hp-act.on,
.hp-day button.on {
  border-color: #6e4aff;
  background: #6e4aff26;
}

.hp-act.manual {
  box-shadow: 0 0 0 1px #ffd666 inset;
}

.hp-day-label {
  font-size: 12px;
  color: #9aa0b0;
  width: 40px;
}

.hp-aura {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hp-aura-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  font-size: 11px;
  color: #9aa0b0;
}

.hp-aura-row i {
  height: 4px;
  border-radius: 2px;
  background: #23252f;
  overflow: hidden;
}

.hp-aura-row em {
  display: block;
  height: 100%;
  background: #63c94f;
  border-radius: 2px;
}

.hp-aura-row em.gold {
  background: #e3b341;
}

.hp-aura-row em.fire {
  background: #ff7a45;
}

.hp-error {
  font-size: 12px;
  color: #ff7a8a;
}

.hp-month {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hp-month-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #9aa0b0;
}

.hp-link {
  background: none;
  border: 0;
  color: #8fa8ff;
  cursor: pointer;
  font-size: 12px;
  text-transform: none;
  letter-spacing: 0;
}

.hp-hint {
  margin: 0;
  font-size: 13px;
  color: #9aa0b0;
}

.hp-cta {
  border: 0;
  border-radius: 10px;
  padding: 10px;
  background: #6e4aff;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.hp-cta.pulse {
  animation: hp-pulse 1.6s ease-in-out infinite;
}

@keyframes hp-pulse {
  50% {
    box-shadow: 0 0 0 6px #6e4aff33;
  }
}

.hp-level {
  display: grid;
  grid-template-columns: 26px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid #262833;
  border-left: 3px solid var(--c);
  background: #1a1c24;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.hp-level:hover {
  background: #20222c;
}

.hp-level-emoji {
  font-size: 18px;
  text-align: center;
}

.hp-level-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.hp-level-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hp-level-bar {
  height: 4px;
  border-radius: 2px;
  background: #23252f;
  overflow: hidden;
}

.hp-level-bar em {
  display: block;
  height: 100%;
  background: var(--c);
}

.hp-level-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.hp-level-meta small {
  color: #9aa0b0;
  font-size: 10px;
}

.hp-open {
  background: none;
  border: 1px dashed #343746;
  border-radius: 10px;
  color: #b9bfd0;
  padding: 8px;
  cursor: pointer;
}

@media (max-width: 1500px) {
  .hero-panel {
    width: 300px;
    flex-basis: 300px;
  }
}
</style>
