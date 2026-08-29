<script setup>
import { ref, computed, onMounted } from "vue";
import { fetchJpOverview, fetchJpDecks, fetchJpAchievements } from "@/components/japaneseApi.js";
import JpGrid from "./JpGrid.vue";

// Прогресс. Цель — крепкий N3, и вся страница отвечает на один вопрос: далеко
// ли до неё. Поэтому первой строкой идёт не XP и не уровень, а пройденная доля
// N3, а наборы показаны полосами: они и есть план.

// Ориентиры из спеки: крепкий N3 — примерно столько кандзи и слов.
const N3_KANJI = 650;
const N3_WORDS = 3700;

const emit = defineEmits(["open"]);

const overview = ref(null);
const decks = ref([]);
const achievements = ref([]);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [o, d, a] = await Promise.all([
      fetchJpOverview(),
      fetchJpDecks(),
      fetchJpAchievements(),
    ]);
    overview.value = o;
    decks.value = d || [];
    achievements.value = a || [];
  } catch (e) {
    error.value = e.message || "не загрузилось";
  } finally {
    loading.value = false;
  }
}

const kanjiPct = computed(() =>
  Math.min(100, Math.round(((overview.value?.kanjiLearned || 0) / N3_KANJI) * 100)),
);
const wordsPct = computed(() =>
  Math.min(100, Math.round(((overview.value?.wordsLearned || 0) / N3_WORDS) * 100)),
);

// Долг — единственное число, по которому система сама меняет темп новых, и
// единственное, из-за которого раздел может стать неподъёмным.
const debtTone = computed(() => {
  const debt = overview.value?.debt || 0;
  if (debt > 80) return { color: "#e5484d", text: "темп снижен" };
  if (debt > 40) return { color: "#ffd666", text: "темп придержан" };
  return { color: "#63c94f", text: "темп можно поднимать" };
});

const started = computed(() => decks.value.filter((d) => d.started > 0));

// Взятые вехи впереди, к невзятым идём. Показываются и те и другие: список
// только из взятых не говорит, к чему стремиться.
const earned = computed(() => achievements.value.filter((a) => a.earned));
const pending = computed(() => achievements.value.filter((a) => !a.earned).slice(0, 6));

function pct(deck) {
  if (!deck.total) return 0;
  return Math.round((deck.learned / deck.total) * 100);
}

onMounted(load);
</script>

<template>
  <div class="jpp">
    <div v-if="error" class="jp-error">{{ error }}</div>
    <div v-if="loading" class="jp-empty">Загружаю…</div>

    <template v-else-if="overview">
      <section class="jp-card">
        <h3>До крепкого N3</h3>
        <div class="jpp-goal">
          <div class="jpp-goal-row">
            <span>Кандзи</span>
            <b>{{ overview.kanjiLearned }} / {{ N3_KANJI }}</b>
            <span class="jp-muted">{{ kanjiPct }}%</span>
          </div>
          <div class="jp-bar"><span :style="{ width: kanjiPct + '%' }" /></div>

          <div class="jpp-goal-row">
            <span>Слова</span>
            <b>{{ overview.wordsLearned }} / {{ N3_WORDS }}</b>
            <span class="jp-muted">{{ wordsPct }}%</span>
          </div>
          <div class="jp-bar"><span :style="{ width: wordsPct + '%' }" /></div>
        </div>
      </section>

      <section class="jp-card">
        <h3>Сейчас</h3>
        <div class="jp-stats">
          <div class="jp-stat">
            <div class="jp-stat-label">Стрик</div>
            <div class="jp-stat-value">🔥 {{ overview.streak }}</div>
          </div>
          <div class="jp-stat">
            <div class="jp-stat-label">Рекорд</div>
            <div class="jp-stat-value">{{ overview.bestStreak }}</div>
          </div>
          <div class="jp-stat">
            <div class="jp-stat-label">Заморозки</div>
            <div class="jp-stat-value">{{ overview.freezes }}</div>
          </div>
          <div class="jp-stat">
            <div class="jp-stat-label">Уровень за XP</div>
            <div class="jp-stat-value">{{ overview.level }}</div>
          </div>
          <div class="jp-stat">
            <div class="jp-stat-label">XP</div>
            <div class="jp-stat-value">{{ overview.xp }}</div>
          </div>
          <div class="jp-stat">
            <div class="jp-stat-label">Всего карточек</div>
            <div class="jp-stat-value">{{ overview.cardsTotal }}</div>
          </div>
        </div>
      </section>

      <section class="jp-card">
        <h3>Долг повторений</h3>
        <p class="jp-muted" style="margin-top: 0">
          Уровень и XP — это только счёт за усердие, к JLPT они отношения не имеют: честная
          шкала — две полосы выше.
        </p>
        <div class="jpp-debt" :style="{ color: debtTone.color }">
          {{ overview.debt }}
          <span class="jp-muted" style="font-size: 13px">— {{ debtTone.text }}</span>
        </div>
        <p class="jp-muted">
          Темп новых единиц подбирает система: чем длиннее хвост просроченных, тем меньше новых
          она даёт. Жёсткой нормы нет.
        </p>
        <div class="jp-stats" style="margin-top: 10px">
          <div class="jp-stat">
            <div class="jp-stat-label">К повторению сейчас</div>
            <div class="jp-stat-value">{{ overview.dueNow }}</div>
          </div>
          <div class="jp-stat">
            <div class="jp-stat-label">Всего за сегодня</div>
            <div class="jp-stat-value">{{ overview.dueToday }}</div>
          </div>
          <div class="jp-stat">
            <div class="jp-stat-label">Новых сегодня</div>
            <div class="jp-stat-value">{{ overview.newToday }}</div>
          </div>
          <div class="jp-stat">
            <div class="jp-stat-label">Посыплется завтра</div>
            <div class="jp-stat-value">{{ overview.atRiskTomorrow }}</div>
          </div>
        </div>
      </section>

      <JpGrid @open="emit('open', $event)" />

      <section class="jp-card">
        <h3>Вехи — {{ earned.length }} из {{ achievements.length }}</h3>
        <div v-if="!achievements.length" class="jp-empty">Список не загрузился</div>
        <template v-else>
          <div class="jpp-badges">
            <span v-for="a in earned" :key="a.code" class="jpp-badge is-on">{{ a.title }}</span>
            <span v-if="!earned.length" class="jp-muted">Пока ни одной — всё впереди</span>
          </div>
          <div v-if="pending.length" class="jp-muted" style="margin-top: 10px">
            Ближайшие:
            <span v-for="a in pending" :key="a.code" class="jpp-badge">{{ a.title }}</span>
          </div>
        </template>
      </section>

      <section class="jp-card">
        <h3>Наборы в работе</h3>
        <div v-if="!started.length" class="jp-empty">Ни одного ещё не начат</div>
        <div v-else class="jpp-decks">
          <div v-for="d in started" :key="d.id" class="jpp-deck">
            <div class="jpp-deck-head">
              <b>{{ d.name }}</b>
              <span class="jp-muted">
                {{ d.learned }} закреплено · {{ d.started }} начато · {{ d.total }} всего
              </span>
            </div>
            <div class="jp-bar">
              <span :style="{ width: pct(d) + '%', background: d.color || '#6e4aff' }" />
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.jpp {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.jpp-goal {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jpp-goal-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
  margin-top: 6px;
}

.jpp-goal-row b {
  margin-left: auto;
}

.jpp-debt {
  font-size: 34px;
  font-weight: 700;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.jpp-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.jpp-badge {
  display: inline-block;
  font-size: 12px;
  border-radius: 999px;
  padding: 4px 10px;
  background: #22242d;
  border: 1px solid #2f3340;
  color: #7a7f8e;
  margin: 2px 3px 0 0;
}

.jpp-badge.is-on {
  border-color: rgba(99, 201, 79, 0.55);
  color: #9ee08c;
}

.jpp-decks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jpp-deck-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 5px;
  font-size: 13px;
}

.jpp-deck-head .jp-muted {
  margin-left: auto;
}
</style>
