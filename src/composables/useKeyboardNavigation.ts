import { onBeforeUnmount, onMounted } from "vue";

interface KeyboardNavigationOptions {
  onPrev: () => void;
  onNext: () => void;
  isEnabled: () => boolean;
}

export function useKeyboardNavigation({
  onPrev,
  onNext,
  isEnabled,
}: KeyboardNavigationOptions) {
  const handleKeydown = (event: KeyboardEvent) => {
    if (!isEnabled()) {
      return;
    }

    if (event.key === "ArrowLeft") {
      onPrev();
    } else if (event.key === "ArrowRight") {
      onNext();
    }
  };

  onMounted(() => {
    window.addEventListener("keydown", handleKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeydown);
  });

  return {
    handleKeydown,
  };
}
