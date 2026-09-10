import { API_BASE_URL } from "./api";

// Сессия пользователя.
//
// Токен доступа живёт полчаса и обновляется по refresh-токену. Это накладывает
// одно требование: свежий токен должен лежать в localStorage под ключом
// "token", потому что читают его оттуда полтора десятка модулей — бюджет,
// читалка, дерево навыков и остальные собирают заголовок сами. Поэтому здесь
// не обёртка над запросом, а фоновое обновление: модулям ничего не нужно
// знать, они как читали ключ, так и читают, просто он всегда действителен.

const TOKEN_KEY = "token";
const REFRESH_KEY = "refreshToken";
const EXPIRES_KEY = "tokenExpiresAt";
const USER_KEY = "authUser";

// За сколько до конца обновляем. Минута — с запасом на дорогу до сервера и на
// расхождение часов клиента и сервера.
const REFRESH_MARGIN_MS = 60 * 1000;

// Как часто проверяем срок. Токен живёт полчаса, поэтому раз в минуту хватает
// и не будит вкладку понапрасну.
const WATCH_INTERVAL_MS = 60 * 1000;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function getRole() {
  return getUser()?.role || null;
}

export function isAdmin() {
  return getRole() === "admin";
}

export function isGuest() {
  return getRole() === "guest";
}

// saveSession принимает ответ входа, регистрации или обновления токена.
export function saveSession(data) {
  if (!data?.accessToken) return;
  localStorage.setItem(TOKEN_KEY, data.accessToken);
  if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
  if (data.expiresAt) localStorage.setItem(EXPIRES_KEY, data.expiresAt);
  if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(USER_KEY);
  // Слепок вкусняшек — тоже про вошедшего: набор разделов у каждого свой,
  // и следующий не должен увидеть чужой. Ключ вписан строкой, а не импортом
  // из композабла: тот тянет за собой api.js, который тянет этот файл.
  localStorage.removeItem("features.v1");
}

// Обновление идёт в одном экземпляре: refresh-токен одноразовый, и два
// параллельных запроса погасили бы друг друга — второй пришёл бы с уже
// использованным токеном и выкинул бы человека из приложения.
let refreshing = null;

export function refreshSession() {
  if (refreshing) return refreshing;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(false);

  refreshing = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        // Отказ означает, что сессии больше нет: истекла, погашена сменой
        // пароля или отозвана админом. Чинить нечего — нужен вход заново.
        clearSession();
        return false;
      }
      saveSession(await response.json());
      return true;
    } catch {
      // Сеть отвалилась — токен ещё может быть жив, выкидывать рано.
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

// ensureFreshToken обновляет токен, если тот вот-вот истечёт.
export async function ensureFreshToken() {
  if (!getToken()) return false;

  const expiresAt = localStorage.getItem(EXPIRES_KEY);
  // Срок неизвестен — сессия от старой сборки. Обновляем, чтобы он появился.
  if (!expiresAt) return refreshSession();

  const left = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(left) || left <= REFRESH_MARGIN_MS) {
    return refreshSession();
  }
  return true;
}

// startSessionWatch держит токен свежим фоном. Кроме таймера слушает возврат
// на вкладку: за ночь со свёрнутым браузером таймер отстаёт, а человек
// ожидает, что приложение просто работает, а не просит логин.
export function startSessionWatch() {
  const tick = () => {
    if (getToken()) ensureFreshToken();
  };

  tick();
  setInterval(tick, WATCH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
}
