<script setup>
// Админка вкусняшек: что включено, в каком порядке лежат плитки на главной и
// что стоит в нижнем меню телефона.
//
// Настройки личные: страница правит набор того, кто её открыл, а не всего
// приложения. Роль здесь ни при чём — «админка» тут про управление своим
// приложением, а не про чужие учётки; ими занимается /account.
//
// Сохранение — сразу по щелчку, без кнопки «Применить»: страница из десятка
// переключателей, где надо не забыть нажать «сохранить», это способ потерять
// настройки. Сервер отвечает состоянием целиком — он мог поправить присланное
// (выключенный раздел вылетает из вкладок), и мы берём его ответ, а не свою
// догадку.

import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  catalog,
  features,
  loadFeatures,
  setFeatures,
} from "@/composables/useFeatures.js";
import { resetFeatures, saveFeatures } from "@/components/featuresApi.js";

const router = useRouter();

const loading = ref(!features.value);
const saving = ref(false);
const error = ref("");

onMounted(async () => {
  // Слепок из localStorage уже нарисовал страницу — этот запрос обновляет её
  // до серверного состояния, а не показывает пустоту вместо неё.
  await loadFeatures(true);
  loading.value = false;
});

const enabledMap = computed(() => features.value?.enabled || {});
const tabLimit = computed(() => features.value?.tabLimit ?? 3);

function on(key) {
  return enabledMap.value[key] !== false;
}

const modules = computed(() => catalog.value.filter((d) => d.group === "module"));
const layers = computed(() => catalog.value.filter((d) => d.group === "layer"));
const integrations = computed(() =>
  catalog.value.filter((d) => d.group === "integration"),
);

// Порядок плиток показываем целиком, вместе с выключенными: включил обратно —
// плитка вернулась на своё место, и это видно заранее.
const orderedTiles = computed(() => {
  const order = features.value?.order || [];
  const byKey = new Map(catalog.value.map((d) => [d.key, d]));
  return order.map((key) => byKey.get(key)).filter((d) => d?.tile);
});

const tabKeys = computed(() => features.value?.tabs || []);
const tabDefs = computed(() => {
  const byKey = new Map(catalog.value.map((d) => [d.key, d]));
  return tabKeys.value.map((key) => byKey.get(key)).filter(Boolean);
});
const tabCandidates = computed(() => modules.value.filter((d) => d.tab && on(d.key)));

const enabledCount = computed(
  () => catalog.value.filter((d) => on(d.key)).length,
);

async function push(patch) {
  saving.value = true;
  error.value = "";
  try {
    setFeatures(await saveFeatures(patch));
  } catch (err) {
    error.value = String(err?.message || err);
    // Ответ сервера — единственная правда о состоянии: после неудачи
    // перечитываем, иначе на экране останется несделанное изменение.
    await loadFeatures(true);
  } finally {
    saving.value = false;
  }
}

function toggle(def) {
  push({ enabled: { [def.key]: !on(def.key) } });
}

function move(index, step) {
  const order = orderedTiles.value.map((d) => d.key);
  const target = index + step;
  if (target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  push({ order });
}

function toggleTab(def) {
  const keys = [...tabKeys.value];
  const at = keys.indexOf(def.key);
  if (at >= 0) {
    keys.splice(at, 1);
  } else {
    if (keys.length >= tabLimit.value) return;
    keys.push(def.key);
  }
  push({ tabs: keys });
}

async function resetAll() {
  if (!window.confirm("Вернуть все вкусняшки к умолчаниям?")) return;
  saving.value = true;
  error.value = "";
  try {
    setFeatures(await resetFeatures());
  } catch (err) {
    error.value = String(err?.message || err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="adm">
    <header class="adm-head">
      <button class="adm-back" @click="router.push('/')">‹</button>
      <div class="adm-head-text">
        <h1>Вкусняхи</h1>
        <p>Включено {{ enabledCount }} из {{ catalog.length }}</p>
      </div>
      <span v-if="saving" class="adm-saving">сохраняю…</span>
      <button class="adm-reset" @click="resetAll">Сбросить</button>
    </header>

    <p v-if="error" class="adm-error">{{ error }}</p>
    <p v-if="loading" class="adm-empty">Загружаю…</p>

    <template v-else>
      <section class="adm-sec">
        <h2>Разделы</h2>
        <p class="adm-note">
          Выключенный раздел исчезает с главной и из меню, а прямой заход по
          ссылке уводит на главную. Данные остаются на месте — включишь обратно,
          и всё вернётся.
        </p>
        <div class="adm-list">
          <label
            v-for="def in modules"
            :key="def.key"
            class="adm-row"
            :class="{ 'is-off': !on(def.key) }"
          >
            <span class="adm-ic">{{ def.icon }}</span>
            <span class="adm-text">
              <span class="adm-title">{{ def.title }}</span>
              <span class="adm-hint">{{ def.hint }}</span>
            </span>
            <input
              class="adm-sw"
              type="checkbox"
              :checked="on(def.key)"
              @change="toggle(def)"
            />
          </label>
        </div>
      </section>

      <section class="adm-sec">
        <h2>Нижнее меню телефона</h2>
        <p class="adm-note">
          «Главная» и «Ещё» стоят всегда, между ними помещается
          {{ tabLimit }} раздела. Остальные включённые разделы живут в «Ещё».
        </p>

        <div class="adm-tabbar">
          <span class="adm-tabbar-cell">🏠<i>Главная</i></span>
          <span v-for="def in tabDefs" :key="def.key" class="adm-tabbar-cell">
            {{ def.icon }}<i>{{ def.title }}</i>
          </span>
          <span
            v-for="n in Math.max(0, tabLimit - tabDefs.length)"
            :key="`empty-${n}`"
            class="adm-tabbar-cell is-empty"
            >＋<i>пусто</i></span
          >
          <span class="adm-tabbar-cell">☰<i>Ещё</i></span>
        </div>

        <div class="adm-chips">
          <button
            v-for="def in tabCandidates"
            :key="def.key"
            class="adm-chip"
            :class="{ 'is-on': tabKeys.includes(def.key) }"
            :disabled="!tabKeys.includes(def.key) && tabKeys.length >= tabLimit"
            @click="toggleTab(def)"
          >
            {{ def.icon }} {{ def.title }}
          </button>
        </div>
      </section>

      <section class="adm-sec">
        <h2>Порядок плиток на главной</h2>
        <p class="adm-note">
          Порядок в модалке «вкусняхи». Выключенные показаны бледными — место
          за ними сохраняется.
        </p>
        <ol class="adm-order">
          <li
            v-for="(def, i) in orderedTiles"
            :key="def.key"
            :class="{ 'is-off': !on(def.key) }"
          >
            <span class="adm-ic">{{ def.icon }}</span>
            <span class="adm-title">{{ def.title }}</span>
            <button :disabled="i === 0" @click="move(i, -1)">↑</button>
            <button :disabled="i === orderedTiles.length - 1" @click="move(i, 1)">
              ↓
            </button>
          </li>
        </ol>
      </section>

      <section class="adm-sec">
        <h2>Слои</h2>
        <p class="adm-note">
          Оформление поверх страниц. Ни на какие данные не влияет.
        </p>
        <div class="adm-list">
          <label
            v-for="def in layers"
            :key="def.key"
            class="adm-row"
            :class="{ 'is-off': !on(def.key) }"
          >
            <span class="adm-ic">{{ def.icon }}</span>
            <span class="adm-text">
              <span class="adm-title">{{ def.title }}</span>
              <span class="adm-hint">{{ def.hint }}</span>
            </span>
            <input
              class="adm-sw"
              type="checkbox"
              :checked="on(def.key)"
              @change="toggle(def)"
            />
          </label>
        </div>
      </section>

      <section class="adm-sec">
        <h2>Внешние сервисы</h2>
        <p class="adm-note">
          Выключенный сервис перестаёт спрашиваться: бот молчит, панель
          прячется. Токены и привязки остаются — включишь, и всё заработает.
        </p>
        <div class="adm-list">
          <label
            v-for="def in integrations"
            :key="def.key"
            class="adm-row"
            :class="{ 'is-off': !on(def.key) }"
          >
            <span class="adm-ic">{{ def.icon }}</span>
            <span class="adm-text">
              <span class="adm-title">{{ def.title }}</span>
              <span class="adm-hint">{{ def.hint }}</span>
            </span>
            <input
              class="adm-sw"
              type="checkbox"
              :checked="on(def.key)"
              @change="toggle(def)"
            />
          </label>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.adm {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 16px 48px;
  box-sizing: border-box;
  color: #e6e8ef;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

.adm-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.adm-head-text {
  flex: 1;
  min-width: 0;
}

.adm-head h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
}

.adm-head p {
  margin: 2px 0 0;
  font-size: 13px;
  color: #8b90a0;
}

.adm-back {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 12px;
  background: #22242d;
  border: 1px solid #2c2f3a;
  color: #cfd3e0;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.adm-saving {
  font-size: 12px;
  color: #a58bff;
}

.adm-reset {
  height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid #3a3d4a;
  color: #9aa0b0;
  font-size: 13px;
  cursor: pointer;
}

.adm-reset:hover {
  color: #e6e8ef;
  border-color: #565b6d;
}

.adm-error {
  margin: 0 0 16px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 92, 92, 0.12);
  border: 1px solid rgba(255, 92, 92, 0.35);
  color: #ff9d9d;
  font-size: 13px;
}

.adm-empty {
  color: #8b90a0;
  font-size: 14px;
}

.adm-sec {
  margin-bottom: 28px;
}

.adm-sec h2 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  color: #a58bff;
}

.adm-note {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.45;
  color: #8b90a0;
}

.adm-list {
  display: grid;
  gap: 8px;
}

.adm-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  padding: 8px 14px;
  border-radius: 14px;
  background: #1b1d25;
  border: 1px solid #262933;
  cursor: pointer;
  transition: border-color 0.15s ease, opacity 0.15s ease;
}

.adm-row:hover {
  border-color: #3a3f52;
}

.adm-row.is-off {
  opacity: 0.5;
}

.adm-ic {
  font-size: 22px;
  line-height: 1;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}

.adm-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.adm-title {
  font-size: 14px;
  font-weight: 600;
}

.adm-hint {
  font-size: 12px;
  color: #8b90a0;
  line-height: 1.35;
}

/* Переключатель — обычный checkbox, перерисованный целиком: сторонний
   компонент ради одной галочки не нужен. */
.adm-sw {
  appearance: none;
  -webkit-appearance: none;
  width: 44px;
  height: 26px;
  flex-shrink: 0;
  margin: 0;
  border-radius: 999px;
  background: #33374a;
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease;
}

.adm-sw::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #cfd3e0;
  transition: transform 0.15s ease;
}

.adm-sw:checked {
  background: #6e4aff;
}

.adm-sw:checked::after {
  transform: translateX(18px);
  background: #fff;
}

/* --- Превью нижнего меню --- */

.adm-tabbar {
  display: flex;
  margin-bottom: 12px;
  border-radius: 14px;
  background: rgba(20, 21, 27, 0.96);
  border: 1px solid #262933;
  overflow: hidden;
}

.adm-tabbar-cell {
  flex: 1;
  min-width: 0;
  padding: 10px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-size: 17px;
  color: #cfd3e0;
}

.adm-tabbar-cell i {
  font-style: normal;
  font-size: 10px;
  font-weight: 600;
  color: #7a7f8e;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adm-tabbar-cell.is-empty {
  color: #454a5c;
}

.adm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.adm-chip {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: #1b1d25;
  border: 1px solid #2c2f3a;
  color: #cfd3e0;
  font-size: 13px;
  cursor: pointer;
}

.adm-chip.is-on {
  background: rgba(110, 74, 255, 0.18);
  border-color: #6e4aff;
  color: #fff;
}

.adm-chip:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* --- Порядок плиток --- */

.adm-order {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.adm-order li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 10px 0 14px;
  border-radius: 12px;
  background: #1b1d25;
  border: 1px solid #262933;
}

.adm-order li.is-off {
  opacity: 0.45;
}

.adm-order li .adm-title {
  flex: 1;
  min-width: 0;
}

.adm-order button {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #22242d;
  border: 1px solid #2c2f3a;
  color: #cfd3e0;
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.adm-order button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .adm {
    padding: 14px 12px 32px;
  }

  .adm-head h1 {
    font-size: 20px;
  }

  /* Сброс — редкое действие, на телефоне ему хватает подписи покороче,
     чтобы заголовок не переносился на вторую строку. */
  .adm-reset {
    padding: 0 10px;
    font-size: 12px;
  }

  .adm-row {
    min-height: 62px;
  }
}
</style>
