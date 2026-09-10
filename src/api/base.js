// Адрес API — одно правило на всё приложение.
//
// Раньше он был прошит шестью копиями строки `//82.202.136.167:5005`. Это
// пережило переезд на домен ровно один день: страница мини-аппа отдаётся по
// https, а запрос на http браузер режет как mixed content — молча, без ошибки
// в консоли запроса. Поэтому адрес считается здесь и импортируется всеми.

// Порт старого входа. По нему и только по нему приложение ходит на бэкенд
// напрямую: там раздаёт голый nginx, и увести /api на 5005 некому.
const LEGACY_UI_PORT = "5173";

function resolveApiBaseUrl() {
  // Разработка: `VITE_API_URL=http://localhost:5005 npm run dev`.
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  if (window.location.port === LEGACY_UI_PORT) {
    return `${window.location.protocol}//${window.location.hostname}:5005`;
  }

  // Пусто — значит тот же хост, что и страница. Так работает всё, что отдаётся
  // через общий прокси: и домен с https, и мини-апп Telegram внутри него.
  return "";
}

export const API_BASE_URL = resolveApiBaseUrl();
