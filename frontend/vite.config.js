import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  build: {
    sourcemap: true, // Source map generation must be turned on
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
