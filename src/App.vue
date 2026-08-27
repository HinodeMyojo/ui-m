<script setup>
import { computed, defineAsyncComponent } from "vue";
import { RouterView, useRoute } from "vue-router";
import { isMobile } from "@/composables/useIsMobile.js";

// Нижнее меню — часть мобильного слоя, а не главной страницы: уйти в «Сегодня»
// и не иметь дороги назад, кроме системной кнопки, — это не навигация.
const MobileTabBar = defineAsyncComponent(
  () => import("@/components/mobile/MobileTabBar.vue"),
);

const route = useRoute();

// Экраны, которые занимают телефон целиком: вход, читалка (там своя панель и
// каждый пиксель под текст), печать резюме и гостевая ссылка на поездку.
const FULLSCREEN = ["/login", "/pdfReader"];

const showTabBar = computed(() => {
  if (!isMobile.value) return false;
  if (route.meta?.public) return false;
  if (FULLSCREEN.includes(route.path)) return false;
  if (route.path.endsWith("/print")) return false;
  return true;
});
</script>

<template>
  <div class="app-body" :class="{ 'with-tabbar': showTabBar }">
    <RouterView />
  </div>
  <MobileTabBar v-if="showTabBar" />
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto; /* убираем overflow: hidden */
  scrollbar-width: auto;
  scrollbar-color: #6e4aff #111;
  background-color: #18191f;
}
#app {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  z-index: 1;
  min-height: 100vh; /* добавьте это */
}

.app-body {
  width: 100%;
  display: flex;
  justify-content: center;
}

/* Запас под нижнее меню держит обёртка, а не каждый экран по отдельности:
   иначе всякий новый раздел заново выясняет, что последняя строка спряталась
   под таб-баром. 58px — высота меню, env() — «подбородок» айфона. */
.app-body.with-tabbar {
  min-height: 100dvh;
  box-sizing: border-box;
  padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px));
  background: #14151b;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.modal-card {
  background: linear-gradient(
    135deg,
    rgba(18, 19, 31, 0.98),
    rgba(23, 25, 40, 0.98)
  );
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 16px;
  padding: 32px;
  max-width: 450px;
  width: 100%;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  line-height: 1;
}

.modal-close:hover {
  opacity: 1;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 20px 0;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.label-text {
  display: block;
  font-size: 12px;
  color: #b7c9d1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}
.form-input,
.form-textarea {
  width: 100%;
  background: rgba(23, 103, 253, 0.06);
  border: 1px solid rgba(23, 103, 253, 0.2);
  border-radius: 10px;
  padding: 10px 14px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  border-color: rgba(23, 103, 253, 0.5);
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.quick-time-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.time-preset-btn {
  padding: 10px;
  background: rgba(23, 103, 253, 0.1);
  border: 1px solid rgba(23, 103, 253, 0.3);
  border-radius: 8px;
  color: #1767fd;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.time-preset-btn:hover {
  background: rgba(23, 103, 253, 0.2);
  border-color: rgba(23, 103, 253, 0.5);
}

.time-preset-btn.active {
  background: linear-gradient(135deg, #1767fd, #6e4aff);
  color: #fff;
  border-color: transparent;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 8px;
}

/* Responsive */
@media (max-width: 1024px) {
  .drawer-panel {
    width: 60%;
    min-width: 400px;
  }
}

@media (max-width: 768px) {
  .drawer-panel {
    width: 100%;
    min-width: 0;
  }

  .progress-overview {
    flex-direction: column;
    align-items: center;
  }

  .stats-grid {
    width: 100%;
  }

  /* Global modal mobile fixes */
  .modal-overlay {
    padding: 10px;
  }

  .modal-card {
    max-width: 92vw;
    padding: 24px 16px;
  }

  .modal-close {
    top: 12px;
    right: 12px;
    font-size: 24px;
  }

  .modal-title {
    font-size: 17px;
  }

  .modal-form {
    gap: 12px;
  }

  .form-input,
  .form-textarea {
    font-size: 16px; /* prevents iOS zoom */
    padding: 12px 14px;
  }

  .quick-time-buttons {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .modal-actions {
    flex-direction: column;
    gap: 8px;
  }

  #app {
    align-items: flex-start;
  }
}
</style>
