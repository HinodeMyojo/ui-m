<script setup>
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";

// Нижнее меню мобильного слоя. Четыре раздела, в которые заходят каждый день,
// и «Ещё» на всё остальное. Пятая вкладка сознательно не раздел, а лист: если
// каждому модулю дать по вкладке, получится полоса иконок 6×6 пикселей.

const route = useRoute();
const router = useRouter();

const TABS = [
  { to: "/", icon: "🏠", label: "Главная" },
  { to: "/today", icon: "📅", label: "Сегодня" },
  { to: "/library", icon: "📚", label: "Книги" },
  { to: "/sport/today", icon: "💪", label: "Спорт" },
];

// Разделы «Ещё». Порядок — по тому, как часто в них заходят, а не по алфавиту.
const MORE = [
  { to: "/discipline", icon: "🎯", label: "Дисциплина" },
  { to: "/roadmap", icon: "🗺️", label: "Roadmap" },
  { to: "/roadmap/today", icon: "📖", label: "Чтение дня" },
  { to: "/resume/today", icon: "📄", label: "Резюме" },
  { to: "/learning-skills", icon: "🧠", label: "Навыки" },
  { to: "/travel", icon: "✈️", label: "Путешествия" },
  { to: "/budget", icon: "💰", label: "Бюджет" },
  { to: "/vocabulary", icon: "🔤", label: "Словарь" },
  { to: "/testing", icon: "❓", label: "Тесты" },
  { to: "/journey", icon: "🧭", label: "Карта пути" },
  { to: "/diagrams", icon: "📐", label: "Диаграммы" },
  { to: "/pdfReader", icon: "📕", label: "Читалка" },
];

const sheetOpen = ref(false);

const activeTab = computed(() => {
  const path = route.path;
  if (path === "/") return "/";
  // Точное совпадение проиграет вложенным путям, поэтому берём самый длинный
  // подходящий префикс: /sport/today не должен подсвечивать «Сегодня».
  let best = "";
  for (const t of TABS) {
    if (t.to !== "/" && path.startsWith(t.to) && t.to.length > best.length) best = t.to;
  }
  return best;
});

function go(to) {
  sheetOpen.value = false;
  if (route.path !== to) router.push(to);
}

function logout() {
  localStorage.removeItem("token");
  sheetOpen.value = false;
  router.push("/login");
}
</script>

<template>
  <nav class="mtb">
    <button
      v-for="t in TABS"
      :key="t.to"
      class="mtb-tab"
      :class="{ 'is-on': activeTab === t.to }"
      @click="go(t.to)"
    >
      <span class="mtb-icon">{{ t.icon }}</span>
      <span class="mtb-label">{{ t.label }}</span>
    </button>

    <button class="mtb-tab" :class="{ 'is-on': sheetOpen }" @click="sheetOpen = !sheetOpen">
      <span class="mtb-icon">☰</span>
      <span class="mtb-label">Ещё</span>
    </button>
  </nav>

  <transition name="mtb-fade">
    <div v-if="sheetOpen" class="mtb-overlay" @click.self="sheetOpen = false">
      <div class="mtb-sheet">
        <div class="mtb-grip" @click="sheetOpen = false"></div>
        <div class="mtb-grid">
          <button v-for="m in MORE" :key="m.to" class="mtb-cell" @click="go(m.to)">
            <span class="mtb-cell-icon">{{ m.icon }}</span>
            <span class="mtb-cell-label">{{ m.label }}</span>
          </button>
        </div>
        <button class="mtb-logout" @click="logout">Выйти</button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.mtb {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  background: rgba(20, 21, 27, 0.96);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--m-line, #262933);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.mtb-tab {
  flex: 1;
  min-width: 0;
  height: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: none;
  border: none;
  color: #7a7f8e;
  cursor: pointer;
  padding: 0;
  /* Убирает серую вспышку по тапу в Safari — она читается как «залипло». */
  -webkit-tap-highlight-color: transparent;
}

.mtb-tab.is-on {
  color: #e6e8ef;
}

.mtb-icon {
  font-size: 19px;
  line-height: 1;
}

.mtb-tab.is-on .mtb-icon {
  transform: translateY(-1px);
}

.mtb-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1px;
}

.mtb-tab.is-on .mtb-label {
  color: #a58bff;
}

/* --- Лист «Ещё» --- */

.mtb-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
}

.mtb-sheet {
  width: 100%;
  background: #1b1d25;
  border-radius: 20px 20px 0 0;
  border-top: 1px solid #2f3340;
  padding: 8px 12px calc(16px + env(safe-area-inset-bottom, 0px));
  max-height: 82vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.mtb-grip {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: #3a3d47;
  margin: 6px auto 14px;
}

.mtb-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.mtb-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 74px;
  padding: 8px 4px;
  border-radius: 14px;
  background: #22242d;
  border: 1px solid #2b2e39;
  color: #cfd3e0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mtb-cell:active {
  background: #2b2e39;
}

.mtb-cell-icon {
  font-size: 21px;
  line-height: 1;
}

.mtb-cell-label {
  font-size: 10.5px;
  font-weight: 600;
  text-align: center;
  line-height: 1.15;
}

.mtb-logout {
  width: 100%;
  min-height: 46px;
  margin-top: 12px;
  border-radius: 12px;
  background: #2a1c1f;
  border: 1px solid #4a2b30;
  color: #ff9ea0;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.mtb-fade-enter-active,
.mtb-fade-leave-active {
  transition: opacity 0.18s ease;
}

.mtb-fade-enter-active .mtb-sheet,
.mtb-fade-leave-active .mtb-sheet {
  transition: transform 0.22s ease;
}

.mtb-fade-enter-from,
.mtb-fade-leave-to {
  opacity: 0;
}

.mtb-fade-enter-from .mtb-sheet,
.mtb-fade-leave-to .mtb-sheet {
  transform: translateY(100%);
}
</style>
