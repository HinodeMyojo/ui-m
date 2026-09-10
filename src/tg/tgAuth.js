// Вход в мини-аппе.
//
// Главное отличие от веба: пароль здесь не спрашивают. Клиент Telegram кладёт
// в страницу подписанную строку initData, сервер её проверяет и выдаёт обычный
// токен приложения. Пароль спрашивается ровно один раз — при первой привязке,
// чтобы приложение узнало, чья это учётка.
//
// Вход делается при каждом открытии, а не «если токена нет». Причин две:
// initData всё равно приходит свежая, а localStorage в WebView на iOS
// вычищается сам — и «сохранённая сессия» там живёт до первого перезапуска
// Telegram.

import { API_BASE_URL } from "@/api/base";
import { saveSession } from "@/components/session";
import { initData } from "./telegram";

async function post(path, body) {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Пустое или не-JSON тело бывает у 502 от прокси. Текст ошибки соберём ниже.
  }
  return { response, data };
}

// authorize возвращает одно из трёх:
//   { state: "ok" }                       — вошли, токен сохранён
//   { state: "link", telegramName }       — этот Telegram ещё ни к кому не привязан
//   { state: "error", message }           — всё остальное
export async function authorize() {
  const raw = initData();
  if (!raw) {
    return { state: "error", message: "Приложение открыто не из Telegram" };
  }

  try {
    const { response, data } = await post("/auth/telegram", { initData: raw });

    if (response.ok && data?.accessToken) {
      saveSession(data);
      return { state: "ok" };
    }

    // 409 — не ошибка, а развилка: подпись настоящая, просто неизвестно, чья
    // это учётка.
    if (response.status === 409 && data?.needsLink) {
      return { state: "link", telegramName: data.telegramName || "" };
    }

    return { state: "error", message: data?.error || `Сервер ответил ${response.status}` };
  } catch (error) {
    // Сюда попадает и обрыв сети в метро, и mixed content, если приложение
    // однажды снова начнёт ходить на http с https-страницы.
    return { state: "error", message: error?.message || "Сервер недоступен" };
  }
}

// link — разовая привязка по логину и паролю.
export async function link(login, password) {
  const raw = initData();
  if (!raw) return { state: "error", message: "Приложение открыто не из Telegram" };

  try {
    const { response, data } = await post("/auth/telegram/link", {
      initData: raw,
      login: login.trim(),
      password,
    });

    if (response.ok && data?.accessToken) {
      saveSession(data);
      return { state: "ok" };
    }
    return { state: "error", message: data?.error || `Сервер ответил ${response.status}` };
  } catch (error) {
    return { state: "error", message: error?.message || "Сервер недоступен" };
  }
}
