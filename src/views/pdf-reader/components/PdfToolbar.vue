<template>
    <div class="pdf-toolbar">
        <div class="pdf-toolbar-left">
            <button class="pdf-tb-btn" title="На главную" @click="emit('go-home')">🏠</button>
            <div class="pdf-tb-divider"></div>
            <button class="pdf-tb-btn" title="Открыть другой файл" @click="emit('close-doc')">✕</button>
            <span class="pdf-filename">{{ fileName }}</span>
            <span class="pdf-app-version">v{{ appVersion }}</span>
        </div>

        <div class="pdf-toolbar-center">
            <button class="pdf-tb-btn" :disabled="!canPrev" @click="emit('prev-page')" title="Предыдущая">‹</button>
            <div class="pdf-page-input-wrap">
                <input class="pdf-page-input" type="number" :value="currentPage" min="1" :max="pageCount"
                    @change="emit('jump-to-page', +$event.target.value)" @keydown.enter="emit('jump-to-page', +$event.target.value)" />
                <span class="pdf-page-sep">/</span>
                <span class="pdf-page-total">{{ pageCount }}</span>
            </div>
            <button class="pdf-tb-btn" :disabled="!canNext" @click="emit('next-page')" title="Следующая">›</button>
        </div>

        <div class="pdf-toolbar-right">
            <button class="pdf-tb-btn" @click="emit('zoom-out')" title="Уменьшить">−</button>
            <span class="pdf-zoom-label">{{ Math.round(zoomLevel * 100) }}%</span>
            <button class="pdf-tb-btn" @click="emit('zoom-in')" title="Увеличить">+</button>
            <button class="pdf-tb-btn pdf-tb-sm pdf-tb-secondary" @click="emit('fit-width')" title="По ширине">⇔</button>
            <button class="pdf-tb-btn pdf-tb-sm pdf-tb-secondary" @click="emit('fit-page')" title="По странице">⛶</button>
            <div class="pdf-tb-divider"></div>
            <button class="pdf-tb-btn" @click="emit('toggle-search')" :class="{ active: searchOpen }" title="Поиск (Ctrl+F)">🔍</button>
            <button class="pdf-tb-btn pdf-tb-secondary" @click="emit('toggle-sidebar')" :class="{ active: showSidebar }" title="Панель">☰</button>
            <button class="pdf-tb-btn pdf-tb-secondary" @click="emit('toggle-thumbnails')" :class="{ active: showThumbnails }" title="Миниатюры">⊞</button>
            <div class="pdf-tb-divider pdf-tb-secondary"></div>
            <button class="pdf-tb-btn pdf-tb-secondary" @click="emit('toggle-bookmark')"
                :class="{ bookmarked: isCurrentPageBookmarked }"
                :title="isCurrentPageBookmarked ? 'Удалить закладку (B)' : 'Добавить закладку (B)'">🔖</button>
            <div class="pdf-tb-divider pdf-tb-secondary"></div>
            <button class="pdf-tb-btn pdf-tb-secondary" @click="emit('toggle-fullscreen')" :title="isFullscreen ? 'Выйти из полного экрана' : 'Полный экран'">
                <span v-if="isFullscreen">✕fs</span><span v-else>⛶</span>
            </button>
            <template v-if="nightMode">
                <button class="pdf-tb-btn pdf-tb-sm pdf-tb-secondary" @click="emit('night-brightness-down')" :disabled="nightBrightness <= 30" title="Темнее">☾−</button>
                <span class="pdf-zoom-label pdf-tb-secondary">{{ nightBrightness }}%</span>
                <button class="pdf-tb-btn pdf-tb-sm pdf-tb-secondary" @click="emit('night-brightness-up')" :disabled="nightBrightness >= 100" title="Ярче">☾+</button>
            </template>
            <button class="pdf-tb-btn" @click="emit('toggle-night')"
                :class="{ active: nightMode }" :title="nightMode ? 'Выключить ночной режим' : 'Ночной режим страниц'">
                🌙
            </button>
            <button class="pdf-tb-btn" @click="emit('toggle-dark')" :title="darkMode ? 'Светлая тема' : 'Тёмная тема'">
                {{ darkMode ? '☀️' : '💡' }}
            </button>
            <div class="pdf-tb-divider pdf-tb-secondary"></div>
            <button class="pdf-tb-btn pdf-tb-secondary" @click="emit('toggle-hover-translate')"
                :class="{ active: hoverTranslate }" title="Перевод при наведении">🌐</button>
            <button class="pdf-tb-btn pdf-tb-sm pdf-tb-secondary" @click="emit('open-translate-settings')" title="Настройки перевода">⚙️</button>
        </div>

        <div class="pdf-progress-bar-line" :style="{ width: (readProgress * 100) + '%' }"></div>
    </div>
</template>

<script setup>
/* global __APP_VERSION__ */
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?';

defineProps({
    fileName: String, currentPage: Number, pageCount: Number,
    zoomLevel: Number, darkMode: Boolean, nightMode: Boolean, nightBrightness: Number, isFullscreen: Boolean,
    showSidebar: Boolean, showThumbnails: Boolean, searchOpen: Boolean,
    readProgress: Number, estimatedReadingTime: String,
    canPrev: Boolean, canNext: Boolean,
    isCurrentPageBookmarked: Boolean,
    hoverTranslate: Boolean,
});
const emit = defineEmits([
    'prev-page', 'next-page', 'jump-to-page',
    'zoom-in', 'zoom-out', 'fit-width', 'fit-page',
    'toggle-dark', 'toggle-night', 'night-brightness-down', 'night-brightness-up',
    'toggle-fullscreen', 'toggle-sidebar', 'toggle-thumbnails',
    'toggle-search', 'close-doc', 'toggle-bookmark',
    'toggle-hover-translate', 'open-translate-settings', 'go-home',
]);
</script>
