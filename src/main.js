import "./assets/main.css";

import { createApp } from "vue";
import { createPinia } from "pinia";

// Vuetify
import "vuetify/styles";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import "@mdi/font/css/materialdesignicons.css";

import App from "./App.vue";
import router from "./router";

const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: "mdi",
  },
});

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(vuetify);

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
