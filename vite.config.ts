import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "webmcp-video.js",
    },
    emptyOutDir: true,
    sourcemap: false,
  },
});
