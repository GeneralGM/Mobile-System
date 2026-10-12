/* eslint-disable prettier/prettier */
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    preset: "node-server",
  },

  tanstackStart: {
    server: {
      entry: "src/server",
    },
  },

  vite: {
    base: "./",
    build: {
      emptyOutDir: true,
    },
  },
});
