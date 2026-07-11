/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Vite 8 / rolldown-vite: default plugin-react uses Oxc transform (no babel esbuild warn)
    react({
      // avoid babel pipeline on Vite 8
      babel: undefined,
    }),
  ],

  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/tests/**/*.test.ts"],
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
