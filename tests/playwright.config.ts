import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    viewport: { width: 1280, height: 720 },
  },
  // For CI, uncomment:
  // webServer: {
  //   command: 'pnpm dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: true,
  //   timeout: 30000,
  // },
});
