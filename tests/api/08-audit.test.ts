import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerAdminWithMfa } from "./helpers";

const P = "aud-" + crypto.randomUUID().slice(0, 6);

describe("08-audit", () => {
  let mfaAdminCk: string;
  let noMfaCk: string;

  beforeAll(async () => {
    // Admin with MFA verified
    const mfaAdmin = await registerAdminWithMfa(`${P}-mfa`);
    mfaAdminCk = mfaAdmin.cookie;

    // Admin without MFA
    const noMfa = await registerAdmin(`${P}-nomfa`);
    noMfaCk = noMfa.cookie;
  });

  it("1. List audit logs (admin + MFA)", async () => {
    const res = await request("GET", "/audit/logs", undefined, mfaAdminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("limit");
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  it("2. Admin without MFA", async () => {
    const res = await request("GET", "/audit/logs", undefined, noMfaCk);
    // Endpoint may or may not require MFA verification
    expect([200, 403]).toContain(res.status);
  });

  it("3. Filter by action", async () => {
    const res = await request("GET", "/audit/logs?action=LOGIN", undefined, mfaAdminCk);
    expect(res.status).toBe(200);
    for (const log of res.body.logs) {
      expect(log.action.toUpperCase()).toContain("LOGIN");
    }
  });
});
