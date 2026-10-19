import { reactive, watch } from 'vue';
import { isMobile } from '@/composables/useIsMobile.js';

// Настройки скорочтения — на устройство, в localStorage. Скорость при этом
// ещё и уходит на сервер с каждым заходом: новое устройство начинает с неё,
// а не с трёхсот.

const KEY = 'rsvp-settings';

export const WPM_MIN = 100;
export const WPM_MAX = 1000;
export const WPM_STEP = 25;
export const WPM_PRESETS = [200, 300, 400, 500, 600, 750];

export const THEMES = [
    { code: 'auto', label: 'Как читалка' },
    { code: 'dark', label: 'Тёмная' },
    { code: 'black', label: 'Чёрная' },
    { code: 'light', label: 'Светлая' },
    { code: 'sepia', label: 'Сепия' },
];

export const FONTS = [
    { code: 'sans', label: 'Без засечек', css: "'Inter', 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif" },
    { code: 'serif', label: 'С засечками', css: "'PT Serif', Georgia, 'Times New Roman', serif" },
    { code: 'mono', label: 'Моноширинный', css: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace" },
];

export const PIVOT_COLORS = [
    { code: 'red', label: 'Красный', css: '#e5383b' },
    { code: 'orange', label: 'Оранжевый', css: '#f77f00' },
    { code: 'blue', label: 'Синий', css: '#3a86ff' },
    { code: 'green', label: 'Зелёный', css: '#2a9d8f' },
];

function defaults() {
    return {
        wpm: 0,            // 0 — ещё не выбирали: возьмём с сервера или 300
        chunk: 1,
        fontSize: isMobile.value ? 38 : 52,
        font: 'sans',
        theme: 'auto',
        pivotColor: 'red',
        smartPauses: true,
        ramp: true,
        rewind: true,
        hold: false,       // читать, пока палец на экране
        guides: true,      // рамка с засечками над и под точкой фокуса
    };
}

function load() {
    const base = defaults();
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
        return { ...base, ...saved };
    } catch {
        return base;
    }
}

let shared = null;

export function useRsvpSettings() {
    if (shared) return shared;
    shared = reactive(load());
    watch(shared, (value) => {
        try {
            localStorage.setItem(KEY, JSON.stringify(value));
        } catch { /* приватный режим Safari — настройки проживут до перезагрузки */ }
    }, { deep: true });
    return shared;
}

export function clampWpm(v) {
    return Math.max(WPM_MIN, Math.min(WPM_MAX, Math.round(v / WPM_STEP) * WPM_STEP));
}
