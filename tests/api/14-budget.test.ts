import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "bud-" + crypto.randomUUID().slice(0, 6);
const YEAR = "2025"; // Use past year to avoid conflicts with current data

describe("14-budget", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let budgetId: string;
  let itemId: string;
  let memberId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create member + finance entry for comparison test
    const mRes = await request("POST", "/members", {
      fullName: `BudgetMember ${P}`, email: `member-${P}@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;

    // Create entry in 2025-03
    await request("POST", "/finance/entries", {
      type: "dizimo", amount: "1000.00", date: "2025-03-15", paymentMethod: "pix", memberId,
    }, adminCk);

    // Create expense in 2025-03
    await request("POST", "/finance/expenses", {
      category: "aluguel", amount: "3000.00", description: "Aluguel março", date: "2025-03-10",
    }, adminCk);
  });

  // ─── CREATE ─────────────────────────────────────────────────────────────

  it("1. Admin creates budget", async () => {
    const res = await request("POST", "/finance/budgets", {
      year: YEAR, notes: "Orçamento de teste",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.year).toBe(YEAR);
    expect(res.body.status).toBe("rascunho");
    budgetId = res.body.id;
  });

  it("2. Missing year → 400", async () => {
    const res = await request("POST", "/finance/budgets", {}, adminCk);
    expect(res.status).toBe(400);
  });

  it("3. Leader cannot create → 403", async () => {
    const res = await request("POST", "/finance/budgets", { year: "2099" }, leaderCk);
    expect(res.status).toBe(403);
  });

  // ─── LIST & DETAIL ──────────────────────────────────────────────────────

  it("4. List budgets", async () => {
    const res = await request("GET", `/finance/budgets?year=${YEAR}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.budgets.length).toBeGreaterThanOrEqual(1);
  });

  it("5. Budget detail", async () => {
    const res = await request("GET", `/finance/budgets/${budgetId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.year).toBe(YEAR);
    expect(res.body.items).toEqual([]);
  });

  // ─── UPDATE ─────────────────────────────────────────────────────────────

  it("6. Update status to aprovado", async () => {
    const res = await request("PUT", `/finance/budgets/${budgetId}`, { status: "aprovado" }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aprovado");
  });

  // ─── DELETE ─────────────────────────────────────────────────────────────

  it("7. Cannot delete approved budget → 409", async () => {
    const res = await request("DELETE", `/finance/budgets/${budgetId}`, undefined, adminCk);
    expect(res.status).toBe(409);
  });

  // Reset to rascunho for further tests
  it("8. Reset to rascunho for item tests", async () => {
    const res = await request("PUT", `/finance/budgets/${budgetId}`, { status: "rascunho" }, adminCk);
    expect(res.status).toBe(200);
  });

  // ─── ITEMS ──────────────────────────────────────────────────────────────

  it("9. Add revenue items batch", async () => {
    const res = await request("POST", `/finance/budgets/${budgetId}/items`, {
      items: [
        { type: "receita", category: "dizimo", month: "03", plannedAmount: "5000.00" },
        { type: "receita", category: "oferta", month: "03", plannedAmount: "2000.00" },
      ],
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.items.length).toBe(2);
    itemId = res.body.items[0].id;
  });

  it("10. Add expense items batch", async () => {
    const res = await request("POST", `/finance/budgets/${budgetId}/items`, {
      items: [
        { type: "despesa", category: "aluguel", month: "03", plannedAmount: "3500.00" },
        { type: "despesa", category: "luz", month: "03", plannedAmount: "800.00" },
      ],
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.items.length).toBe(2);
  });

  it("11. Invalid category for despesa → 400", async () => {
    const res = await request("POST", `/finance/budgets/${budgetId}/items`, {
      items: [{ type: "despesa", category: "dizimo", month: "04", plannedAmount: "100" }],
    }, adminCk);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalida/);
  });

  it("12. Invalid category for receita → 400", async () => {
    const res = await request("POST", `/finance/budgets/${budgetId}/items`, {
      items: [{ type: "receita", category: "aluguel", month: "04", plannedAmount: "100" }],
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("13. Duplicate item → 409", async () => {
    const res = await request("POST", `/finance/budgets/${budgetId}/items`, {
      items: [{ type: "receita", category: "dizimo", month: "03", plannedAmount: "999" }],
    }, adminCk);
    expect(res.status).toBe(409);
  });

  it("14. Edit item", async () => {
    const res = await request("PUT", `/finance/budgets/${budgetId}/items/${itemId}`, {
      plannedAmount: "6000.00",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.plannedAmount).toBe("6000.00");
  });

  it("15. Delete item", async () => {
    // Create throwaway item
    const cRes = await request("POST", `/finance/budgets/${budgetId}/items`, {
      items: [{ type: "receita", category: "doacao", month: "01", plannedAmount: "100" }],
    }, adminCk);
    const delId = cRes.body.items[0].id;
    const res = await request("DELETE", `/finance/budgets/${budgetId}/items/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  // ─── COMPARISON ─────────────────────────────────────────────────────────

  it("16. Comparison returns planned and actual", async () => {
    const res = await request("GET", `/finance/budgets/${budgetId}/comparison`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.year).toBe(YEAR);
    expect(res.body.comparison.length).toBeGreaterThan(0);

    const first = res.body.comparison[0];
    expect(first).toHaveProperty("planned");
    expect(first).toHaveProperty("actual");
    expect(first).toHaveProperty("variance");
    expect(first).toHaveProperty("variancePercent");
  });

  it("17. Comparison actual matches real data for dizimo march", async () => {
    const res = await request("GET", `/finance/budgets/${budgetId}/comparison`, undefined, adminCk);
    const dizimoMarch = res.body.comparison.find(
      (c: any) => c.type === "receita" && c.category === "dizimo" && c.month === "03"
    );
    expect(dizimoMarch).toBeDefined();
    expect(parseFloat(dizimoMarch.actual)).toBeGreaterThanOrEqual(1000); // We created 1000.00
  });

  it("18. Comparison variance = planned - actual", async () => {
    const res = await request("GET", `/finance/budgets/${budgetId}/comparison`, undefined, adminCk);
    for (const c of res.body.comparison) {
      const expected = (parseFloat(c.planned) - parseFloat(c.actual)).toFixed(2);
      expect(c.variance).toBe(expected);
    }
  });

  // ─── ACCESS CONTROL ─────────────────────────────────────────────────────

  it("19. Member cannot access budgets → 403", async () => {
    const res = await request("GET", "/finance/budgets", undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("20. Leader can list and view", async () => {
    const res = await request("GET", `/finance/budgets/${budgetId}`, undefined, leaderCk);
    expect(res.status).toBe(200);
  });

  it("21. Nonexistent budget → 404", async () => {
    const res = await request("GET", "/finance/budgets/nonexistent", undefined, adminCk);
    expect(res.status).toBe(404);
  });

  it("22. Nonexistent item → 404", async () => {
    const res = await request("PUT", `/finance/budgets/${budgetId}/items/nonexistent`, {
      plannedAmount: "100",
    }, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── DELETE DRAFT ───────────────────────────────────────────────────────

  it("23. Delete draft budget", async () => {
    const cRes = await request("POST", "/finance/budgets", { year: "2099" }, adminCk);
    const delId = cRes.body.id;
    const res = await request("DELETE", `/finance/budgets/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("24. Duplicate approved year → 409", async () => {
    // Approve the test budget
    await request("PUT", `/finance/budgets/${budgetId}`, { status: "aprovado" }, adminCk);
    // Try to create another for same year
    const res = await request("POST", "/finance/budgets", { year: YEAR }, adminCk);
    expect(res.status).toBe(409);
  });
});
