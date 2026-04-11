import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "ast-" + crypto.randomUUID().slice(0, 6);

describe("11-assets", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let memberId: string;
  let assetId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create member for responsible
    const mRes = await request("POST", "/members", {
      fullName: `AssetResp ${P}`, email: `member-${P}-m@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;
  });

  // ─── CREATE ─────────────────────────────────────────────────────────────

  it("1. Admin creates asset", async () => {
    const res = await request("POST", "/assets", {
      name: `Teclado ${P}`,
      description: "Teclado Yamaha",
      category: "instrumento",
      location: "Sala de Ensaio",
      acquisitionDate: "2024-01-15",
      acquisitionValue: "3500.00",
      currentValue: "3000.00",
      serialNumber: `SN-${P}`,
      responsibleId: memberId,
      status: "ativo",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`Teclado ${P}`);
    expect(res.body.category).toBe("instrumento");
    expect(res.body.location).toBe("Sala de Ensaio");
    expect(res.body.responsibleName).toBeDefined();
    expect(res.body.serialNumber).toBe(`SN-${P}`);
    assetId = res.body.id;
  });

  it("2. Missing name → 400", async () => {
    const res = await request("POST", "/assets", {
      location: "Sala",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("3. Missing location → 400", async () => {
    const res = await request("POST", "/assets", {
      name: "Test",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("4. Invalid category → 400", async () => {
    const res = await request("POST", "/assets", {
      name: "Test", location: "X", category: "invalido",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("5. Leader cannot create → 403", async () => {
    const res = await request("POST", "/assets", {
      name: "Test", location: "X",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("6. Member cannot create → 403", async () => {
    const res = await request("POST", "/assets", {
      name: "Test", location: "X",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  // ─── LIST ───────────────────────────────────────────────────────────────

  it("7. Admin lists assets", async () => {
    const res = await request("GET", "/assets", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.assets.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it("8. Leader lists assets", async () => {
    const res = await request("GET", "/assets", undefined, leaderCk);
    expect(res.status).toBe(200);
  });

  it("9. Member cannot list → 403", async () => {
    const res = await request("GET", "/assets", undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("10. Filter by category", async () => {
    const res = await request("GET", "/assets?category=instrumento", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.assets.every((a: any) => a.category === "instrumento")).toBe(true);
  });

  it("11. Search by serial number", async () => {
    const res = await request("GET", `/assets?search=SN-${P}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.assets.length).toBe(1);
    expect(res.body.assets[0].serialNumber).toBe(`SN-${P}`);
  });

  it("12. Search by name", async () => {
    const res = await request("GET", `/assets?search=Teclado+${P}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.assets.length).toBeGreaterThanOrEqual(1);
  });

  // ─── DETAIL ─────────────────────────────────────────────────────────────

  it("13. Get asset detail", async () => {
    const res = await request("GET", `/assets/${assetId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`Teclado ${P}`);
    expect(res.body.acquisitionValue).toBe("3500.00");
  });

  it("14. Leader can get detail", async () => {
    const res = await request("GET", `/assets/${assetId}`, undefined, leaderCk);
    expect(res.status).toBe(200);
  });

  it("15. Member cannot get detail → 403", async () => {
    const res = await request("GET", `/assets/${assetId}`, undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("16. Nonexistent → 404", async () => {
    const res = await request("GET", "/assets/nonexistent", undefined, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── UPDATE ─────────────────────────────────────────────────────────────

  it("17. Admin updates asset", async () => {
    const res = await request("PUT", `/assets/${assetId}`, {
      currentValue: "2800.00",
      status: "manutencao",
      notes: "Em conserto",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.currentValue).toBe("2800.00");
    expect(res.body.status).toBe("manutencao");
  });

  it("18. Leader cannot update → 403", async () => {
    const res = await request("PUT", `/assets/${assetId}`, {
      notes: "Hacked",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("19. Update nonexistent → 404", async () => {
    const res = await request("PUT", "/assets/nonexistent", {
      name: "X",
    }, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── SUMMARY ────────────────────────────────────────────────────────────

  it("20. Admin gets summary", async () => {
    const res = await request("GET", "/assets/summary", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.totalAssets).toBeGreaterThanOrEqual(1);
    expect(parseFloat(res.body.totalValue)).toBeGreaterThan(0);
    expect(res.body.byCategory).toBeDefined();
    expect(res.body.byCategory.instrumento).toBeDefined();
  });

  it("21. Leader cannot get summary → 403", async () => {
    const res = await request("GET", "/assets/summary", undefined, leaderCk);
    expect(res.status).toBe(403);
  });

  // ─── DELETE ─────────────────────────────────────────────────────────────

  it("22. Leader cannot delete → 403", async () => {
    const res = await request("DELETE", `/assets/${assetId}`, undefined, leaderCk);
    expect(res.status).toBe(403);
  });

  it("23. Admin deletes asset", async () => {
    // Create throwaway
    const cRes = await request("POST", "/assets", {
      name: `Deletar ${P}`, location: "Temp",
    }, adminCk);
    const delId = cRes.body.id;

    const res = await request("DELETE", `/assets/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removido/);
  });

  it("24. Delete nonexistent → 404", async () => {
    const res = await request("DELETE", "/assets/nonexistent", undefined, adminCk);
    expect(res.status).toBe(404);
  });

  it("25. Deleted asset not in list", async () => {
    const res = await request("GET", "/assets", undefined, adminCk);
    const names = res.body.assets.map((a: any) => a.name);
    expect(names).not.toContain(`Deletar ${P}`);
  });
});
