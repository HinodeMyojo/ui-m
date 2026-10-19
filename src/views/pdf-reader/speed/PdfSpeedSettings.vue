<template>
    <div class="rsvp-sheet-backdrop" @click.self="emit('close')">
        <div class="rsvp-sheet" role="dialog" aria-label="Настройки скорочтения">
            <div class="rsvp-sheet-head">
                <div class="rsvp-sheet-title">Настройки</div>
                <button class="rsvp-icon" aria-label="Закрыть" @click="emit('close')">✕</button>
            </div>

            <div class="rsvp-field">
                <div class="rsvp-label">Режим</div>
                <div class="rsvp-seg rsvp-seg-wrap">
                    <button v-for="m in MODES" :key="m.code" :class="{ active: (settings.mode || 'rsvp') === m.code }"
                        @click="settings.mode = m.code">{{ m.icon }} {{ m.label }}</button>
                </div>
                <div class="rsvp-note">
                    «Слово» — по слову в одной точке, на рисунках остановка. «С рисунками» — слова без
                    остановок, ближайшая схема рядом. «Текстом» — обычный текст, по нему бежит подсветка
                    на заданной скорости; можно скользнуть глазом назад. Переключение — клавиша M.
                </div>
            </div>

            <template v-if="settings.mode === 'pacer'">
                <div class="rsvp-field">
                    <div class="rsvp-label">Подсветка</div>
                    <div class="rsvp-seg">
                        <button :class="{ active: settings.pacerUnit !== 'word' }" @click="settings.pacerUnit = 'phrase'">Фразой</button>
                        <button :class="{ active: settings.pacerUnit === 'word' }" @click="settings.pacerUnit = 'word'">По слову</button>
                    </div>
                </div>
                <div class="rsvp-field">
                    <div class="rsvp-label">Размер текста <span class="rsvp-value">{{ settings.textSize }} px</span></div>
                    <input class="rsvp-range" type="range" min="14" max="32" step="1" v-model.number="settings.textSize" />
                </div>
                <label class="rsvp-toggle">
                    <input type="checkbox" v-model="settings.bionic" />
                    <span><b>Жирное начало слова</b> Глаз цепляется за первую половину и достраивает слово.
                        Прироста скорости исследования почти не находят — включайте, если так приятнее.</span>
                </label>
            </template>

            <div class="rsvp-field">
                <div class="rsvp-label">Тренировка скорости</div>
                <div class="rsvp-seg">
                    <button v-for="t in TRAINERS" :key="t.code" :class="{ active: (settings.trainer || 'off') === t.code }"
                        @click="settings.trainer = t.code">{{ t.label }}</button>
                </div>
                <div class="rsvp-note">
                    Ступеньки — каждые 2 минуты чтения +25 сл/мин. Спринты — из каждых двух минут
                    30 секунд на 40% быстрее; после спринта обычный темп кажется лёгким.
                </div>
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

            <div class="rsvp-label">Техническая книга</div>

            <label class="rsvp-toggle">
                <input type="checkbox" v-model="settings.stopAtBlocks" />
                <span><b>Вставать на рисунках и коде</b> Схема, таблица или листинг показываются куском
                    страницы; «Дальше» — читать текст после них. Выключено — рисунки пропускаются.</span>
            </label>

            <label class="rsvp-toggle">
                <input type="checkbox" v-model="settings.chapterOverview" />
                <span><b>Обзор перед главой</b> Карта главы: разделы, рисунки, термины, вопросы к ней.
                    Открывается и вручную — 🗺 или клавиша O.</span>
            </label>

            <label class="rsvp-toggle">
                <input type="checkbox" v-model="settings.chapterRecall" />
                <span><b>Пересказ после главы</b> Вспомнить по памяти и свериться; повторы через день,
                    неделю и месяц ложатся карточками в «Сегодня».</span>
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
                <div><kbd>O</kbd> обзор главы</div>
                <div><kbd>M</kbd> сменить режим</div>
                <div><kbd>Esc</kbd> выйти</div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { FONTS, THEMES, PIVOT_COLORS, MODES, TRAINERS } from './rsvpSettings.js';

defineProps({ settings: { type: Object, required: true } });
const emit = defineEmits(['close']);
</script>
