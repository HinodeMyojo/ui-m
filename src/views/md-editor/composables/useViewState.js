import { ref } from 'vue';

export function useViewState() {
    const fileContent = ref('');
    const darkMode = ref(false);
    const isFullscreen = ref(false);
    const isDragging = ref(false);

    return { fileContent, darkMode, isFullscreen, isDragging };
}
