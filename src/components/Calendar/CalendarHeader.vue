<template>
  <header class="calendar-header">
    <div class="calendar-header__left">
      <div class="calendar-header__brand"></div>
    </div>
    <div class="calendar-header__center">
      <button
        class="calendar-header__nav"
        type="button"
        aria-label="Предыдущий месяц"
        @click="emit('prev')"
      >
        <v-icon icon="mdi-chevron-left" size="large" />
      </button>
      <div class="calendar-header__month">
        <h3>{{ monthLabel }}</h3>
        <span class="calendar-header__year">{{ year }}</span>
      </div>
      <button
        class="calendar-header__nav"
        type="button"
        aria-label="Следующий месяц"
        @click="emit('next')"
      >
        <v-icon icon="mdi-chevron-right" size="large" />
      </button>
    </div>
    <div class="calendar-header__right">
      <button class="calendar-header__add" type="button" @click="emit('add')">
        + Добавить задачу
      </button>
      <button class="calendar-header__logout" type="button" @click="emit('logout')">
        Выйти
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  monthLabel: string;
  year: number;
}>();

const emit = defineEmits<{
  (e: "prev"): void;
  (e: "next"): void;
  (e: "add"): void;
  (e: "logout"): void;
}>();
</script>

<style scoped>
.calendar-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
}

.calendar-header__left {
  flex: 1;
}

.calendar-header__brand {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(98, 0, 255, 0.35), rgba(255, 255, 255, 0.05));
}

.calendar-header__center {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 2;
  justify-content: center;
}

.calendar-header__month {
  text-align: center;
}

.calendar-header__month h3 {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: 0.1em;
  color: #fff;
  text-transform: uppercase;
}

.calendar-header__year {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
}

.calendar-header__nav {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.calendar-header__right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.calendar-header__add,
.calendar-header__logout {
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
}

.calendar-header__add {
  background: linear-gradient(120deg, #25636a 25%, #18343b 100%);
  color: #fff;
}

.calendar-header__logout {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}
</style>
