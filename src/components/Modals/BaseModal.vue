<template>
  <teleport to="body">
    <transition name="modal-fade">
      <div
        v-if="open"
        class="modal-overlay"
        role="presentation"
        @click.self="onOverlayClick"
      >
        <section
          class="modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          ref="dialogRef"
          @keydown.esc="emitClose"
        >
          <header v-if="$slots.header || title" class="modal__header">
            <slot name="header">
              <h2 class="modal__title" :id="titleId">{{ title }}</h2>
            </slot>
            <button class="modal__close" type="button" @click="emitClose">
              ×
            </button>
          </header>
          <div class="modal__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  title?: string;
  closeOnOverlay?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
const titleId = computed(() =>
  props.title ? `modal-title-${props.title.replace(/\s+/g, "-")}` : undefined
);

const emitClose = () => {
  emit("close");
};

const onOverlayClick = () => {
  if (props.closeOnOverlay !== false) {
    emitClose();
  }
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      requestAnimationFrame(() => {
        dialogRef.value?.focus();
      });
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal {
  background: #102128;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  outline: none;
  position: relative;
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0 24px;
}

.modal__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
}

.modal__close {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-size: 1.8rem;
  cursor: pointer;
}

.modal__body {
  padding: 20px 24px 24px 24px;
  color: rgba(255, 255, 255, 0.9);
}

.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 24px 24px 24px;
}
</style>
