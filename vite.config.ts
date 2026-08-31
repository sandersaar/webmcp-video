import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: "public",
  preview: {
    allowedHosts: ["preview.example.test"],
  },
  build: {
    rollupOptions: {
      input: resolve(process.cwd(), "examples/plain-html/index.html"),
    },
    emptyOutDir: true,
    sourcemap: false,
  },
});
