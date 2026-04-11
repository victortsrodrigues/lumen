import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerMember } from "./helpers";

const P = "dash-" + crypto.randomUUID().slice(0, 6);

describe("13-dashboard", () => {
  let adminCk: string;
  let memberCk: string;
  let memberId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create a member
    const mRes = await request("POST", "/members", {
      fullName: `DashMember ${P}`, email: `member-${P}-m@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;

    // Create a finance entry (current month)
    const today = new Date().toISOString().split("T")[0];
    await request("POST", "/finance/entries", {
      type: "dizimo", amount: "500.00", date: today, paymentMethod: "pix", memberId,
    }, adminCk);

    // Create an event (future)
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const futureEndDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString();
    await request("POST", "/events", {
      title: `DashEvent ${P}`, type: "culto", startDate: futureDate, endDate: futureEndDate,
    }, adminCk);

    // Create a ministry
    await request("POST", "/ministries", {
      name: `DashMinistry ${P}`, category: "outro",
    }, adminCk);
  });

  it("1. GET /dashboard/stats retorna 200 com estrutura completa", async () => {
    const res = await request("GET", "/dashboard/stats", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.members).toBeDefined();
    expect(res.body.finance).toBeDefined();
    expect(res.body.events).toBeDefined();
    expect(res.body.teaching).toBeDefined();
    expect(res.body.ministries).toBeDefined();
    expect(res.body.planning).toBeDefined();
  });

  it("2. Campos numéricos são >= 0", async () => {
    const res = await request("GET", "/dashboard/stats", undefined, adminCk);
    const d = res.body;
    expect(d.members.total).toBeGreaterThanOrEqual(0);
    expect(d.members.newThisMonth).toBeGreaterThanOrEqual(0);
    expect(d.events.upcomingCount).toBeGreaterThanOrEqual(0);
    expect(d.teaching.activeCourses).toBeGreaterThanOrEqual(0);
    expect(d.teaching.totalEnrollments).toBeGreaterThanOrEqual(0);
    expect(d.ministries.total).toBeGreaterThanOrEqual(0);
    expect(d.ministries.totalMembers).toBeGreaterThanOrEqual(0);
    expect(d.planning.activeInitiatives).toBeGreaterThanOrEqual(0);
    expect(d.planning.overdueInitiatives).toBeGreaterThanOrEqual(0);
  });

  it("3. Members total > 0 (membro criado no beforeAll)", async () => {
    const res = await request("GET", "/dashboard/stats", undefined, adminCk);
    expect(res.body.members.total).toBeGreaterThan(0);
  });

  it("4. Finance currentMonth totalEntries > 0 (entrada criada no beforeAll)", async () => {
    const res = await request("GET", "/dashboard/stats", undefined, adminCk);
    expect(parseFloat(res.body.finance.currentMonth.totalEntries)).toBeGreaterThan(0);
  });

  it("5. Events upcomingCount é number", async () => {
    const res = await request("GET", "/dashboard/stats", undefined, adminCk);
    expect(typeof res.body.events.upcomingCount).toBe("number");
    expect(res.body.events.upcomingCount).toBeGreaterThanOrEqual(1);
  });

  it("6. Teaching activeCourses é number", async () => {
    const res = await request("GET", "/dashboard/stats", undefined, adminCk);
    expect(typeof res.body.teaching.activeCourses).toBe("number");
  });

  it("7. Ministries total > 0", async () => {
    const res = await request("GET", "/dashboard/stats", undefined, adminCk);
    expect(res.body.ministries.total).toBeGreaterThanOrEqual(1);
  });

  it("8. Sem auth → 401", async () => {
    const res = await request("GET", "/dashboard/stats");
    expect(res.status).toBe(401);
  });
});
