import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globals: true,
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "unit-test-only",
      CSRF_SECRET: "unit-csrf-test-only",
      FIELD_ENCRYPTION_KEY: "unit-encryption-test-only",
    },
  },
});
