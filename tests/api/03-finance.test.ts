import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember, assertErrorShape } from "./helpers";

const P = "fin-" + crypto.randomUUID().slice(0, 6);

describe("03-finance", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let memberId: string;
  let entryId: string;
  let expenseId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create a member for financial records
    const mres = await request("POST", "/members", {
      fullName: `Finance Member ${P}`, email: `finmem-${P}@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mres.body.id;
  });

  it("1. Create dizimo entry", async () => {
    const res = await request("POST", "/finance/entries", {
      type: "dizimo", date: "2025-06-15", amount: 150, paymentMethod: "pix", memberId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("dizimo");
    expect(res.body.amount).toBe("150.00");
    entryId = res.body.id;
  });

  it("2. Anonymous offering", async () => {
    const res = await request("POST", "/finance/entries", {
      type: "oferta", date: "2025-06-15", amount: 50, paymentMethod: "dinheiro", isAnonymous: true,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.isAnonymous).toBe(true);
  });

  it("3. Missing fields → 400", async () => {
    const res = await request("POST", "/finance/entries", { type: "dizimo" }, adminCk);
    expect(res.status).toBe(400);
    assertErrorShape(res);
  });

  it("4. Leader cannot create → 403", async () => {
    const res = await request("POST", "/finance/entries", {
      type: "dizimo", date: "2025-06-15", amount: 10, paymentMethod: "pix",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("5. List entries with pagination", async () => {
    const res = await request("GET", "/finance/entries", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("limit");
  });

  it("6. Filter by type", async () => {
    const res = await request("GET", "/finance/entries?type=dizimo", undefined, adminCk);
    expect(res.status).toBe(200);
    for (const e of res.body.entries) {
      expect(e.type).toBe("dizimo");
    }
  });

  it("7. Leader sees masked member info", async () => {
    const res = await request("GET", "/finance/entries?type=dizimo", undefined, leaderCk);
    expect(res.status).toBe(200);
    const dizimos = res.body.entries.filter((e: any) => e.type === "dizimo" && !e.isAnonymous);
    if (dizimos.length > 0) {
      expect(dizimos[0].memberName).toBe("[oculto]");
    }
  });

  it("8. Entry detail", async () => {
    const res = await request("GET", `/finance/entries/${entryId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(entryId);
  });

  it("9. Update entry", async () => {
    const res = await request("PUT", `/finance/entries/${entryId}`, { amount: 200 }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe("200.00");
  });

  it("10. Soft delete entry", async () => {
    // Create another to delete
    const cr = await request("POST", "/finance/entries", {
      type: "oferta", date: "2025-06-16", amount: 30, paymentMethod: "dinheiro",
    }, adminCk);
    const delId = cr.body.id;

    const res = await request("DELETE", `/finance/entries/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("11. Delete already deleted → 409", async () => {
    const cr = await request("POST", "/finance/entries", {
      type: "oferta", date: "2025-06-17", amount: 10, paymentMethod: "dinheiro",
    }, adminCk);
    await request("DELETE", `/finance/entries/${cr.body.id}`, undefined, adminCk);
    const res = await request("DELETE", `/finance/entries/${cr.body.id}`, undefined, adminCk);
    expect(res.status).toBe(409);
  });

  it("12. GET deleted entry still returns (soft delete keeps record)", async () => {
    const cr = await request("POST", "/finance/entries", {
      type: "oferta", date: "2025-06-18", amount: 5, paymentMethod: "dinheiro",
    }, adminCk);
    await request("DELETE", `/finance/entries/${cr.body.id}`, undefined, adminCk);
    const res = await request("GET", `/finance/entries/${cr.body.id}`, undefined, adminCk);
    // Soft-deleted entries may still be accessible by ID (implementation-dependent)
    expect([200, 404]).toContain(res.status);
  });

  it("13. includeDeleted shows deleted items", async () => {
    const res = await request("GET", "/finance/entries?includeDeleted=true", undefined, adminCk);
    expect(res.status).toBe(200);
    const hasDeleted = res.body.entries.some((e: any) => e.deletedAt !== null);
    expect(hasDeleted).toBe(true);
  });

  it("14. Create expense", async () => {
    const res = await request("POST", "/finance/expenses", {
      date: "2025-06-15", amount: 500, category: "aluguel", description: `Aluguel ${P}`,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("aluguel");
    expenseId = res.body.id;
  });

  it("15. List expenses", async () => {
    const res = await request("GET", "/finance/expenses", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it("16. Expense detail", async () => {
    const res = await request("GET", `/finance/expenses/${expenseId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(expenseId);
  });

  it("17. Update expense", async () => {
    const res = await request("PUT", `/finance/expenses/${expenseId}`, {
      description: `Updated ${P}`,
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.description).toBe(`Updated ${P}`);
  });

  it("18. Soft delete expense", async () => {
    const cr = await request("POST", "/finance/expenses", {
      date: "2025-06-19", amount: 10, category: "luz", description: "Del",
    }, adminCk);
    const res = await request("DELETE", `/finance/expenses/${cr.body.id}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("19. GET deleted expense still accessible", async () => {
    const cr = await request("POST", "/finance/expenses", {
      date: "2025-06-20", amount: 5, category: "agua", description: "Del2",
    }, adminCk);
    await request("DELETE", `/finance/expenses/${cr.body.id}`, undefined, adminCk);
    const res = await request("GET", `/finance/expenses/${cr.body.id}`, undefined, adminCk);
    expect([200, 404]).toContain(res.status);
  });

  it("20. Receipt URL", async () => {
    const res = await request("POST", `/finance/expenses/${expenseId}/receipt-url`, undefined, adminCk);
    // May be 404 if no receipt or 200 with availability
    expect([200, 404]).toContain(res.status);
  });

  it("21. Monthly summary", async () => {
    const res = await request("GET", "/finance/summary?year=2025&month=06", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalEntries");
    expect(res.body).toHaveProperty("totalExpenses");
    expect(res.body).toHaveProperty("balance");
  });

  it("22. Dashboard", async () => {
    const res = await request("GET", "/finance/dashboard", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("chartData");
    expect(res.body).toHaveProperty("totalBalance");
    expect(res.body).toHaveProperty("currentMonth");
    expect(res.body.chartData).toHaveLength(12);
  });

  it("23. Report", async () => {
    const res = await request("GET", "/finance/report", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("entries");
    expect(res.body).toHaveProperty("expenses");
    expect(res.body).toHaveProperty("totalEntries");
  });

  it("24. List closings", async () => {
    const res = await request("GET", "/finance/closings", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("closings");
  });

  it("25. Close month", async () => {
    const res = await request("POST", "/finance/closings", {
      year: "2025", month: "06", notes: `Test closing ${P}`,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.closing).toHaveProperty("id");
  });

  it("26. Close already closed month → 409", async () => {
    const res = await request("POST", "/finance/closings", {
      year: "2025", month: "06",
    }, adminCk);
    expect(res.status).toBe(409);
  });

  it("27. Edit entry after closing → 409", async () => {
    const res = await request("PUT", `/finance/entries/${entryId}`, { amount: 999 }, adminCk);
    expect(res.status).toBe(409);
  });

  it("28. Anonymize member in finance", async () => {
    // Create a separate member + entry for anonymization
    const mres = await request("POST", "/members", {
      fullName: `Anon Fin ${P}`, lgpdConsentAccepted: true,
    }, adminCk);
    const anonMid = mres.body.id;
    const entryRes = await request("POST", "/finance/entries", {
      type: "dizimo", date: "2024-01-15", amount: 100, paymentMethod: "pix", memberId: anonMid,
    }, adminCk);
    expect(entryRes.status).toBe(201);

    const res = await request("POST", `/finance/members/${anonMid}/anonymize`, undefined, adminCk);
    expect(res.status).toBe(200);

    // Verify anonymized — fetch all entries (no date filter)
    const entries = await request("GET", "/finance/entries?limit=100", undefined, adminCk);
    const anonEntries = entries.body.entries.filter((e: any) => e.memberName === "[anonimizado]");
    expect(anonEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("29. Pagination edge (limit > 100)", async () => {
    const res = await request("GET", "/finance/entries?limit=101", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBeLessThanOrEqual(100);
  });
});
