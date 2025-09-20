import { ref } from "vue";

export function useErrorHandler() {
  const lastError = ref<string | null>(null);

  const showError = (message: string) => {
    lastError.value = message;
    // Здесь мог бы быть интегрирован любой UI для уведомлений
    console.error(message);
  };

  const handleAsyncOperation = async <T>(
    operation: () => Promise<T>,
    errorMessage: string
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      console.error(error);
      showError(errorMessage);
      throw error;
    }
  };

  return {
    lastError,
    showError,
    handleAsyncOperation,
  };
}
