import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/stream": "http://localhost:3000",
      "/next": "http://localhost:3000",
      "/prev": "http://localhost:3000"
    }
  }
});
