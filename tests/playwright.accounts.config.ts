import { defineConfig } from "@playwright/test";

// UI uses mocked API responses only; no credentials or application database.
export default defineConfig({
  testDir: "./ui",
  testMatch: "accounts.spec.ts",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5187",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: {
    command:
      "pnpm --filter @workspace/church-erp exec vite --host 127.0.0.1 --port 5187 --strictPort",
    url: "http://127.0.0.1:5187",
    reuseExistingServer: false,
  },
});
