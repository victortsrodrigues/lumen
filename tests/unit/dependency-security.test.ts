import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const apiRequire = createRequire(
  new URL("../../artifacts/api-server/package.json", import.meta.url),
);
const webRequire = createRequire(
  new URL("../../artifacts/church-erp/package.json", import.meta.url),
);
const routerRequire = createRequire(apiRequire.resolve("router"));
const { PgDialect } = apiRequire("drizzle-orm/pg-core");
const { sql } = apiRequire("drizzle-orm");
const { match, pathToRegexp } = routerRequire("path-to-regexp");
const XLSX = webRequire("xlsx");
const rechartsRequire = createRequire(webRequire.resolve("recharts"));
const template = rechartsRequire("lodash/template");

describe("patched runtime dependencies", () => {
  it("escapes SQL identifier delimiters and keeps values parameterized", () => {
    const identifier = 'name"quoted';
    const query = new PgDialect().sqlToQuery(
      sql`select ${sql.identifier(identifier)} where id = ${"untrusted-value"}`,
    );
    expect(query.sql).toBe('select "name""quoted" where id = $1');
    expect(query.params).toEqual(["untrusted-value"]);
  });

  it("rejects excessive optional-route combinations without generating a huge regex", () => {
    expect(() => pathToRegexp(`/${"{a}".repeat(20)}:z`)).toThrow(
      /Too many path combinations/,
    );
  });

  it("preserves parameter routes and the SPA fallback", () => {
    expect(match("/members/:id")("/members/member-1").params.id).toBe(
      "member-1",
    );
    expect(match("/{*path}")("/reset-password")).not.toBe(false);
    expect(match("/{*path}")("/")).not.toBe(false);
  });

  it("rejects untrusted lodash template import names", () => {
    expect(() =>
      template("plain text", { imports: { "invalid-name": 1 } }),
    ).toThrow();
    expect(template("Hello <%= name %>")({ name: "Lumen" })).toBe(
      "Hello Lumen",
    );
  });

  it("uses the patched official SheetJS distribution", () => {
    expect(XLSX.version).toBe("0.20.3");
  });
});

describe("generated client compatibility", () => {
  it("keeps login, verification and reset requests using the CSRF-aware fetcher", async () => {
    vi.resetModules();
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/auth/csrf")) {
          return Response.json({ csrfToken: "test-only-csrf" });
        }
        expect(new Headers(init?.headers).get("x-csrf-token")).toBe(
          "test-only-csrf",
        );
        expect(init?.credentials).toBe("include");
        expect(init?.method).toBe("POST");
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return Response.json({ message: "ok" });
      }),
    );
    try {
      const { login, verifyEmail, resetPassword } =
        await import("../../lib/api-client-react/src/generated/api");
      await login({
        email: "test@example.test",
        password: "test-only-password",
      });
      await verifyEmail({ token: "synthetic-verification-token" });
      await resetPassword({
        token: "synthetic-reset-token",
        password: "new-test-only-password",
      });
      expect(calls.map((c) => c.url)).toEqual([
        "/api/auth/login",
        "/api/auth/verify-email",
        "/api/auth/reset-password",
      ]);
      expect(calls[1].body).toEqual({ token: "synthetic-verification-token" });
      expect(calls[2].body).toEqual({
        token: "synthetic-reset-token",
        password: "new-test-only-password",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps external OpenAPI references disabled and Zod 3 output explicit", async () => {
    const { default: config } = await import("../../lib/api-spec/orval.config");
    for (const project of Object.values(config)) {
      expect(project.input.parserOptions.externalRefs.allow).toEqual([]);
    }
    expect(config.zod.output.override.zod.version).toBe(3);
    const spec = readFileSync(
      new URL("../../lib/api-spec/openapi.yaml", import.meta.url),
      "utf8",
    );
    const refs = [...spec.matchAll(/\$ref:\s*["']?([^\s"']+)/g)].map(
      (m) => m[1],
    );
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((ref) => ref.startsWith("#/"))).toBe(true);
  });
});
