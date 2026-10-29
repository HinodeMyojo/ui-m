<script setup>
// Панель «Я» — выезжает справа поверх главной, отдельной страницы нет.
// Слева герой и его показатели, справа вкладки: ветка развития (граф по
// эскизу), выбор уровней на месяц, летопись, настройки героя.
// docs/me-module.md (back-m)
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { seedGrowth, setGrowthMonth, updateGrowthProfile } from "@/components/growthApi.js";
import {
  closeMe,
  disciplineMonth,
  growth,
  growthAct,
  growthError,
  levelColor,
  levelsById,
  meOpen,
  meTab,
  MONTH_NAMES,
  selectedLevelId,
  skillsById,
  spheresById,
  STATUS_TITLES,
  WHISTLES,
} from "@/composables/useGrowth.js";
import { disciplineLogicalToday } from "@/components/api.js";
import { heroAge, heroAura, heroFire, yearsWord } from "./heroRhythm.js";
import GrowthGraph from "./GrowthGraph.vue";
import GrowthLevelCard from "./GrowthLevelCard.vue";
import WhistleBadge from "./WhistleBadge.vue";

const HeroScene = defineAsyncComponent(() => import("@/components/hero/HeroScene.vue"));

const board = computed(() => growth.value);
const profile = computed(() => board.value?.profile || {});
const age = computed(() => heroAge(profile.value.birthDate));
const fire = computed(() => heroFire(disciplineMonth.value, disciplineLogicalToday()));
const aura = computed(() => heroAura(board.value?.aura, fire.value.streak));
const selected = computed(() => levelsById.value.get(selectedLevelId.value) || null);

// Черновик выбора месяца: правится кликами по графу и в мастере, уходит на
// сервер одной кнопкой.
const draft = ref(new Set());
function resetDraft() {
  draft.value = new Set(board.value?.month?.levelIds || []);
}
watch(() => board.value?.month?.levelIds?.join(","), resetDraft, { immediate: true });
watch(meOpen, (open) => {
  if (open) resetDraft();
});

function toggleDraft(id) {
  const next = new Set(draft.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  draft.value = next;
}

const draftCounted = computed(
  () => [...draft.value].filter((id) => !levelsById.value.get(id)?.maintenance).length,
);
const draftChanged = computed(
  () => [...draft.value].sort().join(",") !== [...(board.value?.month?.levelIds || [])].sort().join(","),
);
const draftOk = computed(() => {
  const m = board.value?.month;
  return m && draftCounted.value >= m.min && draftCounted.value <= m.max;
});

const saving = ref(false);
const saved = ref("");
async function saveMonth() {
  const m = board.value.month;
  saving.value = true;
  const ok = await growthAct(() => setGrowthMonth(m.year, m.month, [...draft.value]));
  saving.value = false;
  if (ok) {
    saved.value = "Месяц собран: дисциплина перестроена.";
    window.dispatchEvent(new Event("discipline:reload"));
  }
}

const monthTitle = computed(() => {
  const m = board.value?.month;
  return m ? `${MONTH_NAMES[m.month - 1]} ${m.year}` : "";
});

// Кандидаты на месяц: всё, что не пройдено. Сначала уже взятые и на паузе.
const wizardQuery = ref("");
const candidates = computed(() => {
  const q = wizardQuery.value.trim().toLowerCase();
  const list = (board.value?.levels || []).filter((l) => l.status !== "done");
  const groups = new Map();
  for (const l of list) {
    const skill = skillsById.value.get(l.skillId);
    if (q && !l.title.toLowerCase().includes(q) && !skill?.title.toLowerCase().includes(q)) continue;
    const key = skill?.id || "-";
    if (!groups.has(key)) groups.set(key, { skill, levels: [] });
    groups.get(key).levels.push(l);
  }
  return [...groups.values()].sort((a, b) => {
    const sa = spheresById.value.get(a.skill?.sphereId)?.position ?? 0;
    const sb = spheresById.value.get(b.skill?.sphereId)?.position ?? 0;
    return sa - sb || (a.skill?.position ?? 0) - (b.skill?.position ?? 0);
  });
});
const paused = computed(() => (board.value?.levels || []).filter((l) => l.status === "paused"));

// --- Герой ---
const heroForm = ref({});
watch(
  () => profile.value,
  (p) => {
    heroForm.value = { ...p };
  },
  { immediate: true },
);
async function saveHero() {
  const f = heroForm.value;
  await growthAct(() =>
    updateGrowthProfile({
      heroName: f.heroName, birthDate: f.birthDate, whistle: f.whistle,
      workDays: f.workDays, workFrom: f.workFrom, workTo: f.workTo,
      sleepFrom: f.sleepFrom, sleepTo: f.sleepTo, goldTarget: Number(f.goldTarget) || 0,
    }),
  );
}

const seeding = ref(false);
async function seed() {
  seeding.value = true;
  await growthAct(seedGrowth);
  seeding.value = false;
}

function onKey(e) {
  if (e.key === "Escape" && meOpen.value) closeMe();
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const money = (v) => `${Math.round(v || 0).toLocaleString("ru-RU")} ₽`;
const doneCount = computed(() => (board.value?.levels || []).filter((l) => l.status === "done").length);
</script>

<template>
  <transition name="me-fade">
    <div v-if="meOpen" class="me-backdrop" @click.self="closeMe" />
  </transition>
  <transition name="me-slide">
    <section v-if="meOpen" class="me" role="dialog" aria-label="Я">
      <aside class="me-hero">
        <div class="me-hero-scene">
          <HeroScene action="campfire" :whistle="profile.whistle || 'bell'" :age="age.years"
            :fire="fire.fire" :streak="fire.streak" :aura="aura.level" />
        </div>
        <div class="me-hero-rank">
          <WhistleBadge :whistle="profile.whistle || 'bell'" :aura="aura.level" :size="54" />
          <div>
            <b>{{ profile.heroName || "Хиноде" }}</b>
            <span>{{ (WHISTLES[profile.whistle] || WHISTLES.bell).title }}</span>
            <span>{{ age.years }} {{ yearsWord(age.years) }} · {{ age.months }} мес · {{ age.days }} дн</span>
          </div>
        </div>
        <div v-if="board" class="me-stats">
          <div><span>Пройдено уровней</span><b>{{ doneCount }}</b></div>
          <div><span>Взято в месяц</span><b>{{ board.month.levelIds.length }}</b></div>
          <div><span>Тело (30 дней)</span><b>{{ board.aura.bodyDone }}/{{ board.aura.bodyTotal }}</b></div>
          <div><span>Доход, ср. 3 мес</span><b>{{ money(board.aura.goldAmount) }}</b></div>
          <div><span>Золото к цели</span><b>{{ pct(board.aura.gold) }}</b></div>
        </div>
        <div v-if="board?.events?.length" class="me-chron-mini">
          <div class="me-label">Летопись</div>
          <div v-for="e in board.events.slice(0, 5)" :key="e.id" class="me-chron-row">
            <small>{{ e.date }}</small> {{ e.title }}
          </div>
        </div>
      </aside>

      <div class="me-main">
        <header class="me-head">
          <h2>Я</h2>
          <nav class="me-tabs">
            <button :class="{ on: meTab === 'tree' }" @click="meTab = 'tree'">Ветка</button>
            <button :class="{ on: meTab === 'month' }" @click="meTab = 'month'">
              Месяц <i v-if="board?.month?.needPick" class="me-dot" />
            </button>
            <button :class="{ on: meTab === 'chron' }" @click="meTab = 'chron'">Летопись</button>
            <button :class="{ on: meTab === 'hero' }" @click="meTab = 'hero'">Герой</button>
          </nav>
          <div v-if="draftChanged" class="me-draft">
            Выбор месяца: {{ draftCounted }} из {{ board.month.min }}–{{ board.month.max }}
            <button class="me-btn primary" :disabled="!draftOk || saving" @click="saveMonth">
              {{ saving ? "…" : "Сохранить месяц" }}
            </button>
            <button class="me-btn" @click="resetDraft">Сбросить</button>
          </div>
          <button class="me-close" title="Закрыть (Esc)" @click="closeMe">✕</button>
        </header>
        <div v-if="growthError" class="me-error">{{ growthError }}</div>

        <div v-if="board && !board.seeded" class="me-empty">
          <p>Ветка развития пуста. Каркас — 13 сфер, 60 навыков и их уровни как ориентир; дальше режем и наполняем.</p>
          <button class="me-btn primary" :disabled="seeding" @click="seed">{{ seeding ? "Заливаю…" : "Залить каркас" }}</button>
        </div>

        <div v-else-if="board && meTab === 'tree'" class="me-tree">
          <GrowthGraph :board="board" :selected-id="selectedLevelId" :draft="draft" @select="selectedLevelId = $event" />
          <transition name="me-card">
            <div v-if="selected" class="me-card">
              <GrowthLevelCard :level="selected" :in-draft="draft.has(selected.id)"
                @close="selectedLevelId = null" @toggle-draft="toggleDraft" />
            </div>
          </transition>
        </div>

        <div v-else-if="board && meTab === 'month'" class="me-month">
          <p class="me-lead">
            {{ monthTitle }}: возьми от {{ board.month.min }} до {{ board.month.max }} уровней. Из них соберётся
            дисциплина месяца — блоки навыков и строка «чтение» по уровням с книгами. Поддержка в лимит не входит.
          </p>
          <div v-if="saved" class="me-ok">{{ saved }}</div>
          <div v-if="paused.length" class="me-paused">
            <div class="me-label">Не завершены — продолжить или выбрать другие</div>
            <button v-for="l in paused" :key="l.id" class="me-pick" :class="{ on: draft.has(l.id) }"
              :style="{ '--c': levelColor(l) }" @click="toggleDraft(l.id)">
              {{ l.emoji }} {{ l.title }} <small>{{ pct(l.progress) }} · осталось {{ l.monthsLeft }} мес</small>
            </button>
          </div>
          <input v-model="wizardQuery" class="me-search" placeholder="Найти навык или уровень" />
          <div class="me-groups">
            <div v-for="g in candidates" :key="g.skill?.id" class="me-group">
              <div class="me-group-title">{{ g.skill?.emoji }} {{ g.skill?.title }}</div>
              <button v-for="l in g.levels" :key="l.id" class="me-pick" :class="{ on: draft.has(l.id), empty: l.status === 'empty' }"
                :style="{ '--c': levelColor(l) }" :title="STATUS_TITLES[l.status]" @click="toggleDraft(l.id)">
                <span class="me-pick-num">{{ l.maintenance ? "∞" : l.number }}</span>
                {{ l.emoji }} {{ l.title }}
                <small>{{ l.maintenance ? "поддержка" : `${l.months} мес` }}</small>
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="board && meTab === 'chron'" class="me-chron">
          <p v-if="!board.events.length" class="me-lead">Пока пусто. Сюда пишется каждый взятый и пройденный уровень.</p>
          <article v-for="e in board.events" :key="e.id" class="me-event" :class="e.kind">
            <time>{{ e.date }}</time>
            <h4>{{ e.title }}</h4>
            <p v-if="e.text">{{ e.text }}</p>
          </article>
        </div>

        <div v-else-if="board && meTab === 'hero'" class="me-heroform">
          <label>Имя героя <input v-model="heroForm.heroName" /></label>
          <label>Дата рождения <input v-model="heroForm.birthDate" type="date" /></label>
          <label>Свисток
            <select v-model="heroForm.whistle">
              <option v-for="(w, k) in WHISTLES" :key="k" :value="k">{{ w.title }}</option>
            </select>
          </label>
          <label>Рабочие дни (1 — пн … 7 — вс) <input v-model="heroForm.workDays" placeholder="1,2,3,4,5" /></label>
          <div class="me-row">
            <label>Работа с <input v-model="heroForm.workFrom" type="time" /></label>
            <label>до <input v-model="heroForm.workTo" type="time" /></label>
          </div>
          <div class="me-row">
            <label>Сон с <input v-model="heroForm.sleepFrom" type="time" /></label>
            <label>до <input v-model="heroForm.sleepTo" type="time" /></label>
          </div>
          <label>Цель по доходу в месяц, ₽ (золото ауры) <input v-model="heroForm.goldTarget" type="number" /></label>
          <button class="me-btn primary" @click="saveHero">Сохранить</button>
        </div>
      </div>
    </section>
  </transition>
</template>

<style scoped>
.me-backdrop {
  position: fixed;
  inset: 0;
  background: #0009;
  backdrop-filter: blur(3px);
  z-index: 1500;
}

.me {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(1560px, 97vw);
  z-index: 1501;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  background: #121318;
  border-left: 1px solid #2a2d38;
  box-shadow: -20px 0 60px #000a;
  color: #e8eaf0;
}

.me-hero {
  border-right: 1px solid #23252f;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.me-hero-scene {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #262833;
}

.me-hero-rank {
  display: flex;
  gap: 10px;
  align-items: center;
}

.me-hero-rank div {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: #9aa0b0;
}

.me-hero-rank b {
  font-size: 16px;
  color: #e8eaf0;
}

.me-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.me-stats div {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #9aa0b0;
}

.me-stats b {
  color: #e8eaf0;
  font-variant-numeric: tabular-nums;
}

.me-label {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9aa0b0;
  margin-bottom: 4px;
}

.me-chron-row {
  font-size: 12px;
  padding: 3px 0;
}

.me-chron-row small {
  color: #6b7186;
  margin-right: 4px;
}

.me-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 12px 16px;
  gap: 10px;
}

.me-head {
  display: flex;
  align-items: center;
  gap: 16px;
}

.me-head h2 {
  margin: 0;
  font-size: 22px;
}

.me-tabs {
  display: flex;
  gap: 4px;
}

.me-tabs button {
  background: none;
  border: 1px solid transparent;
  color: #9aa0b0;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  position: relative;
}

.me-tabs button.on {
  color: #fff;
  border-color: #6e4aff;
  background: #6e4aff22;
}

.me-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffd666;
}

.me-draft {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #ffd666;
}

.me-close {
  margin-left: auto;
  background: none;
  border: 0;
  color: #9aa0b0;
  font-size: 20px;
  cursor: pointer;
}

.me-btn {
  border: 1px solid #2f3240;
  background: #1c1e27;
  color: #e8eaf0;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
}

.me-btn.primary {
  background: #6e4aff;
  border-color: #6e4aff;
}

.me-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.me-error {
  color: #ff7a8a;
  font-size: 13px;
}

.me-ok {
  color: #8be07a;
  font-size: 13px;
}

.me-empty,
.me-lead {
  color: #b9bfd0;
  font-size: 14px;
  margin: 0;
}

.me-tree {
  flex: 1;
  min-height: 0;
  position: relative;
}

.me-card {
  position: absolute;
  top: 44px;
  right: 0;
  bottom: 0;
  width: 420px;
  overflow-y: auto;
  padding: 14px;
  border-radius: 12px;
  background: #16171e;
  border: 1px solid #2a2d38;
  box-shadow: -10px 0 40px #000a;
}

.me-month,
.me-chron,
.me-heroform {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.me-search {
  background: #1a1c24;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  color: #e8eaf0;
  padding: 6px 10px;
  max-width: 360px;
}

.me-groups {
  columns: 3 320px;
  column-gap: 16px;
}

.me-group {
  break-inside: avoid;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.me-group-title {
  font-size: 13px;
  font-weight: 600;
}

.me-pick {
  --c: #6e4aff;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  border: 1px solid #262833;
  border-left: 3px solid var(--c);
  background: #191b23;
  color: #e8eaf0;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 13px;
  cursor: pointer;
}

.me-pick small {
  margin-left: auto;
  color: #8a90a2;
  font-size: 11px;
  white-space: nowrap;
}

.me-pick.on {
  background: color-mix(in srgb, var(--c) 28%, #191b23);
  outline: 2px solid #ffd666;
}

.me-pick.empty {
  opacity: 0.6;
  border-style: dashed;
}

.me-pick-num {
  font-size: 11px;
  min-width: 16px;
  color: #9aa0b0;
}

.me-paused {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 640px;
}

.me-event {
  border-left: 3px solid #6e4aff;
  padding: 6px 12px;
  background: #16171e;
  border-radius: 0 10px 10px 0;
}

.me-event.level_done {
  border-color: #ffd666;
}

.me-event time {
  font-size: 11px;
  color: #6b7186;
}

.me-event h4 {
  margin: 2px 0;
  font-size: 15px;
}

.me-event p {
  margin: 0;
  font-size: 13px;
  color: #b9bfd0;
}

.me-heroform {
  max-width: 460px;
}

.me-heroform label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #9aa0b0;
}

.me-heroform input,
.me-heroform select {
  background: #1a1c24;
  border: 1px solid #2a2d38;
  border-radius: 8px;
  color: #e8eaf0;
  padding: 6px 10px;
}

.me-row {
  display: flex;
  gap: 10px;
}

.me-slide-enter-active,
.me-slide-leave-active {
  transition: transform 0.25s ease;
}

.me-slide-enter-from,
.me-slide-leave-to {
  transform: translateX(100%);
}

.me-fade-enter-active,
.me-fade-leave-active {
  transition: opacity 0.25s;
}

.me-fade-enter-from,
.me-fade-leave-to {
  opacity: 0;
}

.me-card-enter-active,
.me-card-leave-active {
  transition: transform 0.18s ease, opacity 0.18s;
}

.me-card-enter-from,
.me-card-leave-to {
  transform: translateX(20px);
  opacity: 0;
}
</style>
