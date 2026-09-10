// Тонкая обёртка над window.Telegram.WebApp.
//
// SDK (@tma.js/sdk) сюда не берём намеренно: нам нужно восемь методов из ста,
// а у пакета уже была ломающая смена имени (@telegram-apps/sdk объявлен
// неподдерживаемым). Сырой объект стабильнее — его формат Telegram не ломает.
//
// Всё здесь обязано переживать отсутствие Telegram: ту же сборку открывают в
// обычном браузере, и падать в этом случае она не должна.

export const tg = globalThis.Telegram?.WebApp || null;

// Признак настоящего запуска. Скрипт telegram-web-app.js создаёт WebApp даже в
// обычном браузере, но initData там пустая — подписывать некому.
export const isMiniApp = !!tg?.initData;

// Версия Bot API у клиента. Ниже 7.7 нет disableVerticalSwipes, а без него
// обводка пальцем закрывает приложение вместо того, чтобы рисовать.
export function supports(version) {
  try {
    return !!tg?.isVersionAtLeast?.(version);
  } catch {
    return false;
  }
}

// Мягкий вызов: половины методов нет на старых клиентах и в вебе, и проверять
// каждый на месте — это шесть строк вместо одной.
function call(name, ...args) {
  try {
    return tg?.[name]?.(...args);
  } catch {
    return undefined;
  }
}

// setup вызывается один раз при старте приложения.
export function setup() {
  if (!tg) return;

  call("ready");
  call("expand");

  // Вертикальный свайп по умолчанию закрывает мини-апп. Для карточки это
  // означало бы, что обводка знака пальцем сверху вниз — это выход из
  // приложения. Свайп по шапке продолжает закрывать, и это правильно: иначе
  // выйти было бы нечем.
  if (supports("7.7")) call("disableVerticalSwipes");

  // Портрет: обводка в альбомной ориентации бессмысленна, а поворот телефона
  // посреди сессии перекраивает раскладку карточки.
  if (supports("8.0")) call("lockOrientation");

  applyTheme();
  applySafeArea();

  tg.onEvent?.("themeChanged", applyTheme);
  tg.onEvent?.("safeAreaChanged", applySafeArea);
  tg.onEvent?.("contentSafeAreaChanged", applySafeArea);
  tg.onEvent?.("viewportChanged", applyViewport);
  applyViewport();
}

// applyTheme подмешивает цвета клиента. Свою палитру не заменяем — раздел
// нарисован тёмным и таким и остаётся, — но фон обязан совпасть с фоном
// клиента, иначе на светлой теме по краям видна чужая полоса.
function applyTheme() {
  if (!tg) return;
  const root = document.documentElement;
  root.dataset.tgTheme = tg.colorScheme || "dark";
  call("setHeaderColor", "#14151b");
  call("setBackgroundColor", "#14151b");
}

// applySafeArea раскладывает отступы клиента в переменные CSS.
//
// env(safe-area-inset-*) внутри мини-аппа врёт: WebView занимает не весь
// экран, и системные отступы к нему уже не относятся. Правильные числа
// присылает сам Telegram — и их два набора: safeAreaInset — это чёлка и «дом»
// телефона, contentSafeAreaInset — шапка самого мини-аппа с кнопками.
function applySafeArea() {
  if (!tg) return;
  const root = document.documentElement;
  const device = tg.safeAreaInset || {};
  const content = tg.contentSafeAreaInset || {};

  const top = (device.top || 0) + (content.top || 0);
  const bottom = (device.bottom || 0) + (content.bottom || 0);

  root.style.setProperty("--tg-safe-top", `${top}px`);
  root.style.setProperty("--tg-safe-bottom", `${bottom}px`);
  root.style.setProperty("--tg-safe-left", `${device.left || 0}px`);
  root.style.setProperty("--tg-safe-right", `${device.right || 0}px`);
}

// applyViewport держит настоящую высоту в переменной.
//
// 100dvh внутри мини-аппа считается по окну, а не по видимой части: когда
// вылезает клавиатура (ввод чтения каной — это как раз она), низ карточки
// уезжает под неё. viewportStableHeight — то, что реально видно.
function applyViewport() {
  if (!tg) return;
  const height = tg.viewportStableHeight || tg.viewportHeight;
  if (height) document.documentElement.style.setProperty("--tg-viewport", `${height}px`);
}

// --- кнопка «назад» ---
//
// У мини-аппа своя системная стрелка в шапке. Показывать её надо ровно тогда,
// когда уходить есть куда: висящая без дела стрелка, которая ничего не делает,
// читается как поломка.

let backHandler = null;

export function setBackButton(handler) {
  if (!tg?.BackButton) return;

  if (backHandler) tg.BackButton.offClick?.(backHandler);
  backHandler = handler;

  if (handler) {
    tg.BackButton.onClick?.(handler);
    tg.BackButton.show?.();
  } else {
    tg.BackButton.hide?.();
  }
}

// --- отдача ---
//
// В WebView синтезатор речи работает через раз, а вибрация — всегда. На
// карточке это единственный отклик, который точно дойдёт.

export function haptic(kind) {
  const feedback = tg?.HapticFeedback;
  if (!feedback) return;
  try {
    if (kind === "success" || kind === "error" || kind === "warning") {
      feedback.notificationOccurred(kind);
    } else {
      feedback.impactOccurred(kind || "light");
    }
  } catch {
    // Вибрации нет — не повод ронять ответ на карточку.
  }
}

// Подтверждение выхода. Включается только на время сессии: случайный свайп
// посреди штурма теряет всю работу, а на списке терять нечего.
export function setClosingConfirmation(on) {
  call(on ? "enableClosingConfirmation" : "disableClosingConfirmation");
}

// Параметр из ссылки t.me/<бот>/study?startapp=… — им уведомление бота
// открывает сразу нужный экран.
export function startParam() {
  return tg?.initDataUnsafe?.start_param || "";
}

export function initData() {
  return tg?.initData || "";
}

// Ссылка на бота — для экрана «откройте в Telegram».
export const BOT_LINK = "https://t.me/hinodesuperapp_jp_nbot/study";
