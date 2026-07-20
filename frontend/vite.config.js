import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  build: {
    // Security: sourcemap generation is disabled in production to avoid
    // exposing source code to end users. Enable only for debugging.
    sourcemap: false,
  },
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    hmr: {
      clientPort: 443
    },
    port: 80,
    allowedHosts: [
      "localhost",
      "dev.radio.shokohsc.home",
      "preview.radio.shokohsc.home",
      "radio-ui.dev-radio"
    ]
  },
});
