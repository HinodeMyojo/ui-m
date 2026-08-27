import "./assets/main.css";

import { createApp } from "vue";
import { createPinia } from "pinia";

import App from "./App.vue";
import router from "./router";

// Vuetify отсюда убран. Он подключался целиком — все компоненты, все стили и
// шрифт Material Design Icons — ради ровно двух <v-icon> со стрелками месяца на
// главной. Это мегабайт JS, семьсот килобайт CSS и три файла шрифта на каждое
// первое открытие; стрелки теперь обычные кнопки. Понадобится снова —
// подключать через vite-plugin-vuetify, с автоимпортом, а не пачкой.

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount("#app");

// Офлайн для модуля «Путешествия»: данные читаются из кэша, а правки,
// сделанные без сети, ждут в очереди и уходят, когда связь вернётся.
// Карту не кэшируем — тайлы мы принципиально не выкачиваем.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/travel-sw.js")
      .then(() => {
        // Связь появилась — просим воркер дослать накопленное.
        const flush = () => navigator.serviceWorker.controller?.postMessage("flush-queue");
        window.addEventListener("online", flush);
        flush();
      })
      .catch(() => {
        // Без service worker приложение работает как обычно, просто без офлайна.
      });
  });
}
