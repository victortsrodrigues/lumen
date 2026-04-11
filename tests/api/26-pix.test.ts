import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "pix-" + crypto.randomUUID().slice(0, 6);

describe("26-pix", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let configId: string;
  let donationId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;
  });

  // ─── CONFIG ───────────────────────────────────────────────────────────

  it("1. Admin creates PIX config → 201", async () => {
    const res = await request("POST", "/pix/config", {
      pixKey: "12345678000199", pixKeyType: "cnpj",
      recipientName: `Igreja ${P}`, city: "São Paulo",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.pixKey).toBe("12345678000199");
    expect(res.body.isActive).toBe(true);
    configId = res.body.id;
  });

  it("2. Leader cannot create config → 403", async () => {
    const res = await request("POST", "/pix/config", {
      pixKey: "test", pixKeyType: "email", recipientName: "Test", city: "Test",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("3. Get config (admin)", async () => {
    const res = await request("GET", "/pix/config", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.pixKey).toBe("12345678000199");
  });

  // ─── DONATE (public) ─────────────────────────────────────────────────

  it("4. GET /donate (no auth) → 200", async () => {
    const res = await request("GET", "/pix/donate");
    expect(res.status).toBe(200);
    expect(res.body.recipientName).toBe(`Igreja ${P}`);
  });

  it("5. POST /donate (no auth) → 201", async () => {
    const res = await request("POST", "/pix/donate", {
      amount: 50.00, donorName: "João Silva", donorEmail: "joao@test.local",
    });
    expect(res.status).toBe(201);
    expect(res.body.txId).toBeTruthy();
    expect(res.body.pixPayload).toBeTruthy();
    donationId = res.body.id;
  });

  // ─── DONATIONS ────────────────────────────────────────────────────────

  it("6. List donations (admin)", async () => {
    const res = await request("GET", "/pix/donations", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.donations.length).toBeGreaterThanOrEqual(1);
  });

  it("7. Member cannot list donations → 403", async () => {
    const res = await request("GET", "/pix/donations", undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("8. Confirm donation (admin)", async () => {
    const res = await request("PUT", `/pix/donations/confirm/${donationId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmado");
    expect(res.body.confirmedAt).toBeTruthy();
  });

  it("9. Leader cannot confirm → 403", async () => {
    // Create another donation to test
    const dRes = await request("POST", "/pix/donate", { amount: 25.00 });
    const res = await request("PUT", `/pix/donations/confirm/${dRes.body.id}`, undefined, leaderCk);
    expect(res.status).toBe(403);
  });

  it("10. Cancel donation", async () => {
    const dRes = await request("POST", "/pix/donate", { amount: 10.00 });
    const res = await request("PUT", `/pix/donations/cancel/${dRes.body.id}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelado");
  });
});
