import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    launchOptions: {
      args: ["--host-resolver-rules=MAP preview.example.test 127.0.0.1"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/examples/plain-html/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
