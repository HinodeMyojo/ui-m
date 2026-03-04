import { ref } from 'vue';

export function usePdfTheme() {
    const darkMode = ref(localStorage.getItem('pdf-dark') === '1');
    const nightMode = ref(localStorage.getItem('pdf-night') === '1');
    const nightBrightness = ref(Number(localStorage.getItem('pdf-night-brightness') ?? 100));
    const isFullscreen = ref(false);
    const showSidebar = ref(true);
    const showThumbnails = ref(false);

    function toggleDark() {
        darkMode.value = !darkMode.value;
        localStorage.setItem('pdf-dark', darkMode.value ? '1' : '0');
    }

    function toggleNight() {
        nightMode.value = !nightMode.value;
        localStorage.setItem('pdf-night', nightMode.value ? '1' : '0');
    }

    function setNightBrightness(val) {
        nightBrightness.value = Math.min(100, Math.max(30, val));
        localStorage.setItem('pdf-night-brightness', nightBrightness.value);
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    function toggleSidebar() { showSidebar.value = !showSidebar.value; }
    function toggleThumbnails() { showThumbnails.value = !showThumbnails.value; }

    document.addEventListener('fullscreenchange', () => {
        isFullscreen.value = !!document.fullscreenElement;
    });

    return { darkMode, nightMode, nightBrightness, isFullscreen, showSidebar, showThumbnails, toggleDark, toggleNight, setNightBrightness, toggleFullscreen, toggleSidebar, toggleThumbnails };
}
