import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "plan-" + crypto.randomUUID().slice(0, 6);

describe("15-planning", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let memberId: string;
  let directiveId: string;
  let objectiveId: string;
  let initiativeId: string;
  let stepId: string;
  let expenseId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    const mRes = await request("POST", "/members", {
      fullName: `PlanMember ${P}`, email: `member-${P}@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;
  });

  // ─── DIRECTIVES ─────────────────────────────────────────────────────────

  it("1. Admin creates directive", async () => {
    const res = await request("POST", "/planning/directives", {
      title: `Crescimento ${P}`, description: "Diretriz de crescimento",
      startYear: "2026", endYear: "2028",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`Crescimento ${P}`);
    expect(res.body.status).toBe("ativa");
    directiveId = res.body.id;
  });

  it("2. Missing title → 400", async () => {
    const res = await request("POST", "/planning/directives", { startYear: "2026", endYear: "2028" }, adminCk);
    expect(res.status).toBe(400);
  });

  it("3. Leader cannot create → 403", async () => {
    const res = await request("POST", "/planning/directives", { title: "X", startYear: "2026", endYear: "2028" }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("4. List directives", async () => {
    const res = await request("GET", "/planning/directives", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.directives.length).toBeGreaterThanOrEqual(1);
  });

  it("5. Directive detail with objectives", async () => {
    const res = await request("GET", `/planning/directives/${directiveId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(`Crescimento ${P}`);
    expect(res.body.objectives).toEqual([]);
  });

  it("6. Update directive", async () => {
    const res = await request("PUT", `/planning/directives/${directiveId}`, { description: "Atualizada" }, adminCk);
    expect(res.status).toBe(200);
  });

  it("7. Soft delete directive", async () => {
    const cRes = await request("POST", "/planning/directives", { title: `Del ${P}`, startYear: "2099", endYear: "2099" }, adminCk);
    const res = await request("DELETE", `/planning/directives/${cRes.body.id}`, undefined, adminCk);
    expect(res.status).toBe(200);
    // Not in list anymore
    const list = await request("GET", "/planning/directives", undefined, adminCk);
    const titles = list.body.directives.map((d: any) => d.title);
    expect(titles).not.toContain(`Del ${P}`);
  });

  // ─── OBJECTIVES ─────────────────────────────────────────────────────────

  it("8. Create objective", async () => {
    const res = await request("POST", `/planning/directives/${directiveId}/objectives`, {
      title: `500 membros ${P}`, targetValue: 500, unit: "membros", deadline: "2028-12-31",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`500 membros ${P}`);
    expect(res.body.targetValue).toBe("500");
    objectiveId = res.body.id;
  });

  it("9. Missing title → 400", async () => {
    const res = await request("POST", `/planning/directives/${directiveId}/objectives`, { targetValue: 10 }, adminCk);
    expect(res.status).toBe(400);
  });

  it("10. Update currentValue (progress)", async () => {
    const res = await request("PUT", `/planning/objectives/${objectiveId}`, { currentValue: 250 }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.currentValue).toBe("250");
  });

  it("11. Leader can update progress", async () => {
    const res = await request("PUT", `/planning/objectives/${objectiveId}`, { currentValue: 300 }, leaderCk);
    expect(res.status).toBe(200);
  });

  it("12. Soft delete objective", async () => {
    const cRes = await request("POST", `/planning/directives/${directiveId}/objectives`, { title: `Del Obj ${P}` }, adminCk);
    const res = await request("DELETE", `/planning/objectives/${cRes.body.id}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("13. Directive not found → 404", async () => {
    const res = await request("POST", "/planning/directives/nonexistent/objectives", { title: "X" }, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── INITIATIVES ────────────────────────────────────────────────────────

  it("14. Create initiative with all fields", async () => {
    const res = await request("POST", "/planning/initiatives", {
      title: `Comprar Van ${P}`, description: "Van para transporte",
      type: "aquisicao", priority: "alta", objectiveId,
      responsibleId: memberId, plannedBudget: "120000.00",
      startDate: "2026-06-01", endDate: "2026-12-31",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("aquisicao");
    expect(res.body.priority).toBe("alta");
    expect(res.body.responsibleName).toBeDefined();
    initiativeId = res.body.id;
  });

  it("15. Create without objectiveId (free)", async () => {
    const res = await request("POST", "/planning/initiatives", {
      title: `Reforma ${P}`, type: "reforma", priority: "media",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.objectiveId).toBeNull();
  });

  it("16. Missing title → 400", async () => {
    const res = await request("POST", "/planning/initiatives", { type: "outro" }, adminCk);
    expect(res.status).toBe(400);
  });

  it("17. List with filter by status", async () => {
    const res = await request("GET", "/planning/initiatives?status=planejada", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.initiatives.every((i: any) => i.status === "planejada")).toBe(true);
  });

  it("18. List with filter by type", async () => {
    const res = await request("GET", "/planning/initiatives?type=aquisicao", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.initiatives.every((i: any) => i.type === "aquisicao")).toBe(true);
  });

  it("19. Detail with steps and realized cost (initially 0)", async () => {
    const res = await request("GET", `/planning/initiatives/${initiativeId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.steps).toEqual([]);
    expect(res.body.realizedCost).toBe("0.00");
    expect(res.body.progress).toBe(0);
  });

  it("20. Update status", async () => {
    const res = await request("PUT", `/planning/initiatives/${initiativeId}`, { status: "em_andamento" }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("em_andamento");
  });

  it("21. Leader can update", async () => {
    const res = await request("PUT", `/planning/initiatives/${initiativeId}`, { notes: "Progresso ok" }, leaderCk);
    expect(res.status).toBe(200);
  });

  it("22. Member cannot access → 403", async () => {
    const res = await request("GET", "/planning/initiatives", undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("23. Soft delete initiative", async () => {
    const cRes = await request("POST", "/planning/initiatives", { title: `Del Init ${P}`, type: "outro" }, adminCk);
    const res = await request("DELETE", `/planning/initiatives/${cRes.body.id}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  // ─── STEPS ──────────────────────────────────────────────────────────────

  it("24. Add step", async () => {
    const res = await request("POST", `/planning/initiatives/${initiativeId}/steps`, {
      title: "Pesquisar modelos", sortOrder: 1,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Pesquisar modelos");
    expect(res.body.completed).toBe(false);
    stepId = res.body.id;
  });

  it("25. Mark step completed", async () => {
    const res = await request("PUT", `/planning/initiatives/${initiativeId}/steps/${stepId}`, {
      completed: true,
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.completedAt).toBeDefined();
  });

  it("26. Edit step title", async () => {
    const res = await request("PUT", `/planning/initiatives/${initiativeId}/steps/${stepId}`, {
      title: "Pesquisar preços",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Pesquisar preços");
  });

  it("27. Soft delete step", async () => {
    const cRes = await request("POST", `/planning/initiatives/${initiativeId}/steps`, { title: "Del step", sortOrder: 99 }, adminCk);
    const res = await request("DELETE", `/planning/initiatives/${initiativeId}/steps/${cRes.body.id}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("28. Step of nonexistent initiative → 404", async () => {
    const res = await request("POST", "/planning/initiatives/nonexistent/steps", { title: "X", sortOrder: 1 }, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── SUMMARY & INTEGRATION ─────────────────────────────────────────────

  it("29. GET /planning/summary returns counts", async () => {
    const res = await request("GET", "/planning/summary", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.totalInitiatives).toBeGreaterThanOrEqual(1);
    expect(res.body.activeInitiatives).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.overdueInitiatives).toBe("number");
    expect(res.body.totalPlannedBudget).toBeDefined();
  });

  it("30. Expense with initiativeId appears in realized cost", async () => {
    // Create expense linked to initiative
    const today = new Date().toISOString().split("T")[0];
    const eRes = await request("POST", "/finance/expenses", {
      category: "manutencao", amount: "5000.00", description: `Van dep ${P}`,
      date: today, initiativeId,
    }, adminCk);
    expect(eRes.status).toBe(201);
    expenseId = eRes.body.id;

    // Check initiative detail
    const dRes = await request("GET", `/planning/initiatives/${initiativeId}`, undefined, adminCk);
    expect(parseFloat(dRes.body.realizedCost)).toBeGreaterThanOrEqual(5000);
  });

  it("31. POST /finance/expenses accepts initiativeId", async () => {
    const today = new Date().toISOString().split("T")[0];
    const res = await request("POST", "/finance/expenses", {
      category: "material", amount: "200.00", description: `Material ${P}`,
      date: today, initiativeId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.initiativeId).toBe(initiativeId);
  });

  it("32. Detail shows progress with steps", async () => {
    // Add a second step (not completed)
    await request("POST", `/planning/initiatives/${initiativeId}/steps`, { title: "Negociar", sortOrder: 2 }, adminCk);

    const res = await request("GET", `/planning/initiatives/${initiativeId}`, undefined, adminCk);
    // 1 completed out of 2 active steps = 50%
    expect(res.body.progress).toBe(50);
  });
});
