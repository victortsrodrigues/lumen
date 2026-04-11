import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    dir: "./tests/api",
    globals: true,
    testTimeout: 15000,
    hookTimeout: 30000,
    sequence: { sequential: true },
    fileParallelism: false,
    env: {
      DATABASE_URL: "postgresql://church_erp:church_erp@localhost:5433/church_erp",
      JWT_SECRET: "dev-jwt-secret-mude-em-producao",
    },
    globalSetup: "./tests/setup.ts",
  },
});
