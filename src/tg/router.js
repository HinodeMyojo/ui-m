import { createRouter, createWebHistory } from "vue-router";

// Роутер мини-аппа. Свой, а не общий с приложением: в Telegram есть ровно два
// экрана — раздел и сессия, — а тянуть сюда полсотни маршрутов суперприложения
// значит тянуть и их зависимости.
//
// Режим истории только createWebHistory. Hash занят: Telegram передаёт запуск
// во фрагменте адреса (#tgWebAppData=…), а роутер в hash-режиме его
// перекодирует, и клиент перестаёт узнавать собственные параметры
// (vuejs/router#2155).

const routes = [
  {
    path: "/",
    name: "japanese",
    component: () => import("@/views/JapaneseView.vue"),
  },
  {
    // Сессия отдельным экраном — на неё ведёт кнопка из уведомления бота, и
    // открываться она должна сразу карточкой, без промежуточного раздела.
    path: "/today",
    name: "today",
    component: () => import("@/views/JapaneseTodayView.vue"),
  },
];

export const router = createRouter({
  // База — каталог, из которого отдаётся мини-апп. Он лежит рядом с обычным
  // приложением на том же домене, поэтому корень занят.
  history: createWebHistory("/tg/"),
  routes,
});

// Куда открывать по параметру из ссылки t.me/<бот>/study?startapp=…
// Разрешён только известный список: параметр приходит из внешней ссылки,
// и подставлять его в маршрут как есть нельзя.
export function routeForStartParam(param) {
  switch (param) {
    case "today":
      return { path: "/today" };
    case "ahead":
      return { path: "/today", query: { kind: "ahead" } };
    case "exam":
      return { path: "/today", query: { kind: "exam" } };
    case "review":
      return { path: "/today", query: { kind: "review" } };
    default:
      return null;
  }
}
