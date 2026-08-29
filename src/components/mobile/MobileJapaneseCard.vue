<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { fetchJpOverview } from "@/components/japaneseApi.js";

// Японский на мобильной главной. Карточка отвечает на один вопрос — «сколько
// горит и сколько это займёт», — и даёт кнопку, которая сразу начинает сессию.
// Разделов между главной и первой карточкой быть не должно: весь смысл модуля
// в том, что заниматься начинают за два тапа.

const router = useRouter();

const data = ref(null);
const loading = ref(true);
const failed = ref(false);

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    data.value = await fetchJpOverview();
  } catch {
    data.value = null;
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

const minutes = computed(() => Math.round((data.value?.sessionSec || 360) / 60));

// Что горит: просроченные повторения плюс невыданные новые.
const burning = computed(() => (data.value?.dueNow || 0) + (data.value?.newLeft || 0));

// Новых на сегодня не осталось — вести имеет смысл сразу в повторение.
const kind = computed(() => (data.value?.newLeft ? "mix" : "review"));

const tone = computed(() => {
  if (data.value?.studiedToday) return "#63c94f";
  if ((data.value?.debt || 0) > 80) return "#e5484d";
  if (burning.value > 0) return "#ffd666";
  return "#7a7f8e";
});

const statusText = computed(() => {
  const d = data.value;
  if (!d) return "";
  if (!burning.value && d.studiedToday) return "День закрыт, повторять нечего";
  if (!burning.value) return "Ничего не горит";
  if (d.studiedToday) return `Ещё ${burning.value} — если есть силы`;
  return `Горит ${burning.value} · ~${minutes.value} мин`;
});

function study() {
  router.push({ path: "/japanese/today", query: kind.value === "review" ? { kind: "review" } : {} });
}

onMounted(load);
</script>

<template>
  <section class="m-card">
    <button class="m-card-head" @click="router.push('/japanese')">
      <span class="m-card-title">語 Японский</span>
      <span v-if="data?.streak" class="m-card-note">🔥 {{ data.streak }}</span>
      <span class="m-chev">›</span>
    </button>

    <template v-if="loading">
      <div class="m-skeleton" style="width: 55%"></div>
      <div class="m-skeleton" style="height: 6px"></div>
    </template>

    <div v-else-if="failed" class="m-err">
      Не загрузился <button class="m-btn m-btn-sm" @click="load">↻</button>
    </div>

    <template v-else-if="data">
      <div class="mjp-status" :style="{ color: tone, borderColor: tone + '55' }">
        <span class="mjp-dot" :style="{ background: tone }"></span>
        {{ statusText }}
      </div>

      <div class="mjp-nums">
        <div class="mjp-num">
          <b>{{ data.dueNow }}</b><span>к повторению</span>
        </div>
        <div class="mjp-num">
          <b>{{ data.newLeft }}</b><span>новых</span>
        </div>
        <div class="mjp-num">
          <b>{{ data.kanjiLearned }}</b><span>кандзи</span>
        </div>
      </div>

      <!-- Кривая забывания в одну строку: сколько развалится, если сегодня
           не сесть. Цифра важнее графика — график на телефоне не читается. -->
      <div v-if="data.atRiskTomorrow" class="mjp-risk">
        Без занятия завтра посыплется {{ data.atRiskTomorrow }}
      </div>

      <button class="m-btn m-btn-accent mjp-go" @click="study">
        {{ minutes }} минут
        <span v-if="kind === 'review'" class="mjp-go-sub">повторение</span>
      </button>
    </template>
  </section>
</template>

<style scoped>
.mjp-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 14px;
  font-weight: 700;
}

.mjp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.mjp-nums {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.mjp-num {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border-radius: 12px;
  background: #22242d;
  border: 1px solid #262933;
}

.mjp-num b {
  font-size: 19px;
  font-weight: 700;
}

.mjp-num span {
  font-size: 10.5px;
  color: #7a7f8e;
  text-align: center;
}

.mjp-risk {
  font-size: 12px;
  color: #7a7f8e;
}

.mjp-go {
  width: 100%;
  min-height: 52px;
  font-size: 16px;
}

.mjp-go-sub {
  margin-left: 8px;
  font-size: 12px;
  opacity: 0.8;
}
</style>
