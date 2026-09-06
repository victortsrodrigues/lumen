import { describe, it, expect } from "vitest";
import { BASE_URL, request, assertSecurityHeaders } from "./helpers";

describe("00-smoke", () => {
  it("1. Health check returns ok", async () => {
    const res = await request("GET", "/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("2. Security headers present", async () => {
    const res = await request("GET", "/healthz");
    assertSecurityHeaders(res);
  });

  it("3. CORS accepts only an explicitly allowed origin", async () => {
    const allowed = await fetch(`${BASE_URL}/healthz`, {
      headers: { Origin: "https://iplumen.com" },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://iplumen.com");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");

    const denied = await fetch(`${BASE_URL}/healthz`, {
      headers: { Origin: "https://site-malicioso.example" },
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("4. CORS preflight allows the CSRF header for iplumen.com", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://iplumen.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://iplumen.com");
    expect(res.headers.get("access-control-allow-headers")).toContain("X-CSRF-Token");
  });
});
