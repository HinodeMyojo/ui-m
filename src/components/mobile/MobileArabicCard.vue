<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { fetchArOverview } from "@/components/arabicApi.js";

// Арабский на мобильной главной. Карточка отвечает на один вопрос — «сколько
// горит и сколько это займёт», — и даёт кнопку, которая сразу начинает сессию.
// Между главной и первой карточкой не должно быть разделов: весь смысл модуля
// в том, что заниматься начинают за два тапа.

const router = useRouter();

const data = ref(null);
const loading = ref(true);
const failed = ref(false);

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    data.value = await fetchArOverview();
  } catch {
    data.value = null;
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

const minutes = computed(() => Math.round((data.value?.sessionSec || 420) / 60));
const burning = computed(() => (data.value?.dueNow || 0) + (data.value?.newLeft || 0));
// Новых на сегодня не осталось — вести имеет смысл сразу в повторение.
const kind = computed(() => (data.value?.newLeft ? "mix" : "review"));

const tone = computed(() => {
  if (data.value?.studiedToday) return "#63c94f";
  if ((data.value?.debt || 0) > 60) return "#e5484d";
  if (burning.value > 0) return "#d9a441";
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
  router.push({ path: "/arabic/today", query: kind.value === "review" ? { kind: "review" } : {} });
}

onMounted(load);
</script>

<template>
  <section class="m-card">
    <button class="m-card-head" @click="router.push('/arabic')">
      <span class="m-card-title">ع Арабский</span>
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
      <div class="mar-status" :style="{ color: tone, borderColor: tone + '55' }">
        <span class="mar-dot" :style="{ background: tone }"></span>
        {{ statusText }}
      </div>

      <div class="mar-nums">
        <div class="mar-num">
          <b>{{ data.dueNow }}</b><span>к повторению</span>
        </div>
        <div class="mar-num">
          <b>{{ data.newLeft }}</b><span>новых</span>
        </div>
        <div class="mar-num">
          <b>{{ data.lettersLearned }}/{{ data.lettersTotal }}</b><span>букв</span>
        </div>
      </div>

      <!-- Кривая забывания в одну строку: сколько развалится, если сегодня не
           сесть. Цифра важнее графика — график на телефоне не читается. -->
      <div v-if="data.atRiskTomorrow" class="mar-risk">
        Без занятия завтра посыплется {{ data.atRiskTomorrow }}
      </div>

      <button class="m-btn m-btn-accent mar-go" @click="study">
        {{ minutes }} минут
        <span v-if="kind === 'review'" class="mar-go-sub">повторение</span>
      </button>
    </template>
  </section>
</template>

<style scoped>
.mar-status {
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

.mar-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.mar-nums {
  display: flex;
  gap: 16px;
}

.mar-num {
  display: flex;
  flex-direction: column;
}

.mar-num b {
  font-size: 19px;
}

.mar-num span {
  font-size: 11px;
  color: #7a7f8e;
}

.mar-risk {
  font-size: 13px;
  color: #d9a441;
}

.mar-go {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: #18a999;
  border-color: #18a999;
  color: #06201d;
}

.mar-go-sub {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.8;
}
</style>
