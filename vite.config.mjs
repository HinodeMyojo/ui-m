import { fileURLToPath, URL } from "node:url";
import { createRequire } from "node:module";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import tailwindcss from "@tailwindcss/vite";

const require = createRequire(import.meta.url);
const { version } = require("./package.json");

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [vue(), vueDevTools(), tailwindcss()],
  build: {
    rollupOptions: {
      // Две точки входа: обычное приложение и мини-апп Telegram. Репозиторий
      // общий (компоненты японского раздела одни на двоих), а бандлы разные —
      // в мини-апп не должны приезжать задачи, бюджет и редактор диаграмм.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        tg: fileURLToPath(new URL("./tg/index.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      process: "process/browser",
      stream: "stream-browserify",
      zlib: "browserify-zlib",
      util: "util",
    },
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/deepl-free": {
        target: "https://api-free.deepl.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/deepl-free/, ""),
      },
      "/deepl-pro": {
        target: "https://api.deepl.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/deepl-pro/, ""),
      },
      "/gemini-api": {
        target: "https://generativelanguage.googleapis.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gemini-api/, ""),
      },
      "/claude-api": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/claude-api/, ""),
      },
      "/openai-api": {
        target: "https://api.openai.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai-api/, ""),
      },
      "/gigachat-auth": {
        target: "https://ngw.devices.sberbank.ru:9443",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/gigachat-auth/, ""),
      },
      "/gigachat-api": {
        target: "https://gigachat.devices.sberbank.ru",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/gigachat-api/, ""),
      },
    },
  },
});
