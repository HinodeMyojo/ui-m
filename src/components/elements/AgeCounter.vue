<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

// 02.05.2002
const BIRTH_DATE = new Date(2002, 4, 2, 0, 0, 0, 0);

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const TICK_MS = 50;

const now = ref(new Date());
let timerId = null;

onMounted(() => {
  timerId = setInterval(() => {
    now.value = new Date();
  }, TICK_MS);
});

onBeforeUnmount(() => {
  if (timerId) clearInterval(timerId);
});

// Полные годы / месяцы / дни
const parts = computed(() => {
  const n = now.value;
  let years = n.getFullYear() - BIRTH_DATE.getFullYear();
  let months = n.getMonth() - BIRTH_DATE.getMonth();
  let days = n.getDate() - BIRTH_DATE.getDate();

  if (days < 0) {
    months -= 1;
    // количество дней в предыдущем относительно текущей даты месяце
    days += new Date(n.getFullYear(), n.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
});

// Дата последнего и следующего дня рождения
function birthdayInYear(year) {
  return new Date(year, BIRTH_DATE.getMonth(), BIRTH_DATE.getDate(), 0, 0, 0, 0);
}

const lastBirthday = computed(() => {
  const n = now.value;
  const thisYear = birthdayInYear(n.getFullYear());
  return thisYear <= n ? thisYear : birthdayInYear(n.getFullYear() - 1);
});

const nextBirthday = computed(() => {
  const n = now.value;
  const thisYear = birthdayInYear(n.getFullYear());
  return thisYear > n ? thisYear : birthdayInYear(n.getFullYear() + 1);
});

// Дробный возраст: целые годы + доля текущего года жизни
const fractionalAge = computed(() => {
  const n = now.value.getTime();
  const from = lastBirthday.value.getTime();
  const to = nextBirthday.value.getTime();
  return parts.value.years + (n - from) / (to - from);
});

const ageWhole = computed(() => Math.floor(fractionalAge.value));
const ageDecimals = computed(() =>
  fractionalAge.value.toFixed(9).split(".")[1] ?? "000000000",
);

const daysLived = computed(() =>
  Math.floor((now.value.getTime() - BIRTH_DATE.getTime()) / MS_IN_DAY),
);

const daysToBirthday = computed(() =>
  Math.ceil((nextBirthday.value.getTime() - now.value.getTime()) / MS_IN_DAY),
);

const isBirthday = computed(() => {
  const n = now.value;
  return (
    n.getMonth() === BIRTH_DATE.getMonth() && n.getDate() === BIRTH_DATE.getDate()
  );
});

// Прогресс до следующего дня рождения, %
const yearProgress = computed(() => {
  const n = now.value.getTime();
  const from = lastBirthday.value.getTime();
  const to = nextBirthday.value.getTime();
  return ((n - from) / (to - from)) * 100;
});

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const yearsLabel = computed(() =>
  plural(parts.value.years, "год", "года", "лет"),
);
const monthsLabel = computed(() =>
  plural(parts.value.months, "месяц", "месяца", "месяцев"),
);
const daysLabel = computed(() => plural(parts.value.days, "день", "дня", "дней"));
const birthdayDaysLabel = computed(() =>
  plural(daysToBirthday.value, "день", "дня", "дней"),
);

const formattedDaysLived = computed(() =>
  daysLived.value.toLocaleString("ru-RU"),
);
</script>

<template>
  <div class="age-counter" :class="{ 'age-birthday': isBirthday }">
    <div class="age-label">
      <span class="age-label-text">Возраст</span>
      <span v-if="isBirthday" class="age-hb">🎂 С днём рождения!</span>
    </div>

    <div class="age-value">
      <span class="age-whole">{{ ageWhole }}</span>
      <span class="age-decimals">.{{ ageDecimals }}</span>
    </div>

    <div class="age-breakdown">
      {{ parts.years }} {{ yearsLabel }} · {{ parts.months }} {{ monthsLabel }} ·
      {{ parts.days }} {{ daysLabel }}
    </div>

    <div class="age-progress" :title="`До следующего дня рождения: ${daysToBirthday} ${birthdayDaysLabel}`">
      <div class="age-progress-fill" :style="{ width: yearProgress + '%' }"></div>
    </div>

    <div class="age-footer">
      <span>{{ formattedDaysLived }} дн. прожито</span>
      <span class="age-dot">·</span>
      <span>🎂 через {{ daysToBirthday }} {{ birthdayDaysLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.age-counter {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-width: 200px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #fff3;
  background-color: #111;
  user-select: none;
}

.age-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
}

.age-hb {
  color: #ffd666;
  letter-spacing: 0.02em;
  text-transform: none;
}

.age-value {
  display: flex;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  line-height: 1;
}

.age-whole {
  font-size: 30px;
  font-weight: 600;
  color: #fff;
}

.age-decimals {
  font-size: 14px;
  font-weight: 500;
  color: #1767fd;
  margin-left: 1px;
}

.age-breakdown {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
}

.age-progress {
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.age-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #1767fd, #ff66cc);
}

.age-footer {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
}

.age-dot {
  opacity: 0.5;
}

.age-birthday {
  border-color: rgba(255, 214, 102, 0.5);
  box-shadow: 0 0 18px rgba(255, 214, 102, 0.15);
}

@media (max-width: 768px) {
  .age-counter {
    width: 100%;
    min-width: 0;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    padding: 8px 12px;
  }

  .age-label {
    display: none;
  }

  .age-value {
    flex: 0 0 auto;
  }

  .age-whole {
    font-size: 24px;
  }

  .age-decimals {
    font-size: 12px;
  }

  .age-breakdown {
    flex: 1 1 auto;
    font-size: 11px;
    text-align: right;
  }

  .age-progress {
    flex: 1 0 100%;
  }

  .age-footer {
    flex: 1 0 100%;
    justify-content: space-between;
    font-size: 9px;
  }
}
</style>
