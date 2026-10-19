<template>
    <div class="rsvp-sheet-backdrop" @click.self="emit('close')">
        <div class="rsvp-sheet" role="dialog" aria-label="Настройки скорочтения">
            <div class="rsvp-sheet-head">
                <div class="rsvp-sheet-title">Настройки</div>
                <button class="rsvp-icon" aria-label="Закрыть" @click="emit('close')">✕</button>
            </div>

            <div class="rsvp-field">
                <div class="rsvp-label">Слов в кадре</div>
                <div class="rsvp-seg">
                    <button v-for="n in [1, 2, 3]" :key="n" :class="{ active: settings.chunk === n }"
                        @click="settings.chunk = n">{{ n }}</button>
                </div>
                <div class="rsvp-note">
                    По одному — классика с красной буквой. По два-три — глаз учится брать
                    фразу целиком; полезно после 450 сл/мин.
                </div>
            </div>

            <div class="rsvp-field">
                <div class="rsvp-label">Размер слова <span class="rsvp-value">{{ settings.fontSize }} px</span></div>
                <input class="rsvp-range" type="range" min="22" max="96" step="2" v-model.number="settings.fontSize" />
            </div>

            <div class="rsvp-field">
                <div class="rsvp-label">Шрифт</div>
                <div class="rsvp-seg">
                    <button v-for="f in FONTS" :key="f.code" :class="{ active: settings.font === f.code }"
                        :style="{ fontFamily: f.css }" @click="settings.font = f.code">{{ f.label }}</button>
                </div>
            </div>

            <div class="rsvp-field">
                <div class="rsvp-label">Тема</div>
                <div class="rsvp-seg rsvp-seg-wrap">
                    <button v-for="t in THEMES" :key="t.code" :class="{ active: settings.theme === t.code }"
                        @click="settings.theme = t.code">{{ t.label }}</button>
                </div>
            </div>

            <div class="rsvp-field">
                <div class="rsvp-label">Цвет буквы фокуса</div>
                <div class="rsvp-swatches">
                    <button v-for="c in PIVOT_COLORS" :key="c.code" class="rsvp-swatch"
                        :class="{ active: settings.pivotColor === c.code }" :style="{ background: c.css }"
                        :title="c.label" :aria-label="c.label" @click="settings.pivotColor = c.code"></button>
                </div>
            </div>

            <label class="rsvp-toggle">
                <input type="checkbox" v-model="settings.smartPauses" />
                <span>
                    <b>Умные паузы</b>
                    Дольше на точке, запятой, длинном слове и в конце абзаца. Скорость при этом
                    честная: 400 сл/мин — это 400 слов за минуту вместе с паузами.
                </span>
            </label>

            <label class="rsvp-toggle">
                <input type="checkbox" v-model="settings.ramp" />
                <span><b>Плавный разгон</b> Первые слова после старта идут медленнее.</span>
            </label>

            <label class="rsvp-toggle">
                <input type="checkbox" v-model="settings.rewind" />
                <span><b>Отмотка после паузы</b> Пара слов назад, чтобы вернуть нить.</span>
            </label>

            <label class="rsvp-toggle">
                <input type="checkbox" v-model="settings.hold" />
                <span><b>Чтение удержанием</b> Читаем, пока палец или кнопка мыши на экране; отпустили — пауза.</span>
            </label>

            <label class="rsvp-toggle">
                <input type="checkbox" v-model="settings.guides" />
                <span><b>Рамка фокуса</b> Линии с засечками над и под красной буквой.</span>
            </label>

            <div class="rsvp-keys">
                <div><kbd>Пробел</kbd> старт / пауза</div>
                <div><kbd>←</kbd> <kbd>→</kbd> предложение назад / вперёд</div>
                <div><kbd>Shift</kbd>+<kbd>←</kbd> <kbd>→</kbd> по слову</div>
                <div><kbd>↑</kbd> <kbd>↓</kbd> скорость ±25</div>
                <div><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> слов в кадре</div>
                <div><kbd>Esc</kbd> выйти</div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { FONTS, THEMES, PIVOT_COLORS } from './rsvpSettings.js';

defineProps({ settings: { type: Object, required: true } });
const emit = defineEmits(['close']);
</script>
