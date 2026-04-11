import { describe, it, expect } from "vitest";
import { request, assertSecurityHeaders } from "./helpers";

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
});
