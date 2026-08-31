import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: "public",
  build: {
    rollupOptions: {
      input: resolve(process.cwd(), "examples/plain-html/index.html"),
    },
    emptyOutDir: true,
    sourcemap: false,
  },
});
