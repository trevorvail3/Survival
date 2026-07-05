import { defineConfig } from "vite";

// Minimal Vite config. Ashfall is a plain TypeScript + HTML5 canvas app with
// no framework and no external assets, so there are no plugins. `base: "./"`
// makes the built /dist run when opened from any path (static hosting).
export default defineConfig({
  base: "./",
  server: {
    host: true,
    open: false,
  },
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
