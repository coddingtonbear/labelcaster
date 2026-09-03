import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:8180",
      "/fonts": "http://localhost:8180",
    },
  },
});
