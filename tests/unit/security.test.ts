import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  csrfTokensMatch,
  generateCsrfToken,
  validateCsrfToken,
} from "../../artifacts/api-server/src/lib/csrf";
import {
  CSRF_COOKIE_NAME,
  csrfProtection,
  issueCsrfToken,
} from "../../artifacts/api-server/src/middlewares/csrf";
import {
  enforceAllowedOrigin,
  isAllowedOrigin,
} from "../../artifacts/api-server/src/middlewares/cors";

function responseMock() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    cookies: new Map<string, string>(),
    headers: new Map<string, string>(),
    cookie(name: string, value: string) {
      this.cookies.set(name, value);
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value);
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
  };
}

describe("CSRF", () => {
  it("generates a signed, expiring token", () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token)).toBe(true);
    expect(validateCsrfToken(`${token}x`)).toBe(false);
  });

  it("issues a cookie and requires the matching header", () => {
    const issued = responseMock();
    issueCsrfToken({ cookies: {} } as any, issued as any);
    const token = issued.cookies.get(CSRF_COOKIE_NAME)!;
    expect(csrfTokensMatch(token, (issued.body as any).csrfToken)).toBe(true);

    const next = vi.fn();
    csrfProtection({
      method: "POST",
      cookies: { [CSRF_COOKIE_NAME]: token },
      get: (name: string) => name.toLowerCase() === "x-csrf-token" ? token : undefined,
    } as any, responseMock() as any, next);
    expect(next).toHaveBeenCalledOnce();

    const rejected = responseMock();
    csrfProtection({
      method: "POST",
      cookies: { [CSRF_COOKIE_NAME]: token },
      get: () => "different",
    } as any, rejected as any, vi.fn());
    expect(rejected.statusCode).toBe(403);
    expect((rejected.body as any).error).toBe("CSRF_ERROR");
  });

  it("does not require a token for safe methods", () => {
    const next = vi.fn();
    csrfProtection({ method: "GET" } as any, responseMock() as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
describe("CORS", () => {
  it("allows iplumen.com and requests without Origin", () => {
    expect(isAllowedOrigin("https://iplumen.com")).toBe(true);
    expect(isAllowedOrigin(undefined)).toBe(true);
  });

  it("rejects an arbitrary Origin", () => {
    expect(isAllowedOrigin("https://site-malicioso.example")).toBe(false);
    const res = responseMock();
    enforceAllowedOrigin({ get: () => "https://site-malicioso.example" } as any, res as any, vi.fn());
    expect(res.statusCode).toBe(403);
    expect((res.body as any).error).toBe("ORIGIN_NOT_ALLOWED");
  });
});

describe("API client CSRF integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("adds the CSRF header to mutating requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/auth/csrf")) {
        return new Response(JSON.stringify({ csrfToken: "token-one" }), {
          headers: { "content-type": "application/json" },
        });
      }
      expect(new Headers(init?.headers).get("x-csrf-token")).toBe("token-one");
      expect(init?.credentials).toBe("include");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { customFetch } = await import("../../lib/api-client-react/src/custom-fetch");

    await expect(customFetch("/api/example", { method: "POST", body: "{}" }))
      .resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes the token and retries once after CSRF_ERROR", async () => {
    let tokenRequests = 0;
    let mutationRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/auth/csrf")) {
        tokenRequests += 1;
        return new Response(JSON.stringify({ csrfToken: `token-${tokenRequests}` }), {
          headers: { "content-type": "application/json" },
        });
      }
      mutationRequests += 1;
      if (mutationRequests === 1) {
        return new Response(JSON.stringify({ error: "CSRF_ERROR", message: "expired" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { customFetch } = await import("../../lib/api-client-react/src/custom-fetch");

    await expect(customFetch("/api/example", { method: "PATCH", body: "{}" }))
      .resolves.toEqual({ ok: true });
    expect(tokenRequests).toBe(2);
    expect(mutationRequests).toBe(2);
  });
});
