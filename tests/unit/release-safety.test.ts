import { afterEach, describe, expect, it, vi } from "vitest";
import { isolatedDatabaseUrl } from "../isolated-database";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("release safety", () => {
  it.each(["JWT_SECRET", "CSRF_SECRET", "FIELD_ENCRYPTION_KEY"])(
    "refuses production startup without %s",
    async (missing) => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "production");
      for (const name of [
        "JWT_SECRET",
        "CSRF_SECRET",
        "FIELD_ENCRYPTION_KEY",
      ]) {
        vi.stubEnv(name, name === missing ? "" : "isolated-test-value");
      }
      await expect(
        import("../../artifacts/api-server/src/config/runtime"),
      ).rejects.toThrow(missing);
    },
  );

  it("allows only the public application origin in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    for (const name of ["JWT_SECRET", "CSRF_SECRET", "FIELD_ENCRYPTION_KEY"])
      vi.stubEnv(name, "isolated-test-value");
    const { runtimeConfig } =
      await import("../../artifacts/api-server/src/config/runtime");
    expect([...runtimeConfig.allowedCorsOrigins]).toEqual([
      "https://iplumen.com",
    ]);
  });

  it("does not let the test provisioner connect to application or remote databases", () => {
    for (const url of [
      undefined,
      "postgresql://localhost/church_erp",
      "postgresql://production.example/lumen_accounts_test",
      "postgresql://127.0.0.1/lumen_accounts_test?host=production.example",
      "https://127.0.0.1/lumen_accounts_test",
    ])
      expect(() => isolatedDatabaseUrl(url)).toThrow();
    expect(
      isolatedDatabaseUrl("postgresql://127.0.0.1:5432/lumen_accounts_test"),
    ).toBe("postgresql://127.0.0.1:5432/lumen_accounts_test");
  });
});
