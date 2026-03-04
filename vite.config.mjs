import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      process: "process/browser",
      stream: "stream-browserify",
      zlib: "browserify-zlib",
      util: "util",
    },
  },
  ssr: {
    noExternal: ["vuetify"],
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
