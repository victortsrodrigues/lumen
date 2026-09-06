import { defineConfig } from "vitest/config";

// Never run this suite against an application or production database.
const connection = process.env.ACCOUNTS_TEST_DATABASE_URL;
const target = connection ? new URL(connection) : null;
if (
  !target ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.pathname !== "/lumen_accounts_test"
) {
  throw new Error(
    "Set ACCOUNTS_TEST_DATABASE_URL to the isolated local lumen_accounts_test database.",
  );
}

export default defineConfig({
  test: {
    include: ["tests/integration/accounts.test.ts"],
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: connection!,
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      JWT_SECRET: "accounts-integration-test-only",
      CSRF_SECRET: "accounts-csrf-integration-test-only",
      FIELD_ENCRYPTION_KEY: "accounts-encryption-integration-test-only",
      EMAIL_VERIFICATION_REQUIRED: "true",
      EMAIL_PROVIDER: "",
      RESEND_API_KEY: "",
    },
  },
});
