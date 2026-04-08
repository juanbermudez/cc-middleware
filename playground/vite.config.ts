import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const middlewareTarget = process.env.PLAYGROUND_MIDDLEWARE_URL ?? "http://127.0.0.1:3000";
const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [react(), tailwindcss()],
  server: {
    port: 4173,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: middlewareTarget,
        changeOrigin: true,
        ws: true,
      },
      "/health": {
        target: middlewareTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
