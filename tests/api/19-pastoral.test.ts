import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "past-" + crypto.randomUUID().slice(0, 6);

describe("19-pastoral", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let memberId: string;
  let pastorId: string;
  let visitId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create member (the visited person)
    const mRes = await request("POST", "/members", {
      fullName: `Visitado ${P}`, email: `visited-${P}@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;

    // Create pastor member
    const pRes = await request("POST", "/members", {
      fullName: `Pastor ${P}`, email: `leader-${P}-l@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    pastorId = pRes.body.id;
  });

  // ─── CREATE ───────────────────────────────────────────────────────────

  it("1. Admin creates visit → 201", async () => {
    const res = await request("POST", "/pastoral", {
      memberId, pastorId, type: "visita", date: "2026-04-01", notes: "Visita de acolhimento",
      followUpDate: "2026-04-15",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.memberId).toBe(memberId);
    expect(res.body.pastorId).toBe(pastorId);
    expect(res.body.type).toBe("visita");
    expect(res.body.status).toBe("pendente");
    expect(res.body.followUpDate).toBe("2026-04-15");
    visitId = res.body.id;
  });

  it("2. Leader creates visit → 201", async () => {
    const res = await request("POST", "/pastoral", {
      memberId, pastorId, type: "ligacao", date: "2026-04-02",
    }, leaderCk);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("ligacao");
  });

  it("3. Member cannot create → 403", async () => {
    const res = await request("POST", "/pastoral", {
      memberId, pastorId, type: "visita", date: "2026-04-03",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("4. Missing required fields → 400", async () => {
    const res = await request("POST", "/pastoral", { memberId }, adminCk);
    expect(res.status).toBe(400);
  });

  it("5. Invalid type → 400", async () => {
    const res = await request("POST", "/pastoral", {
      memberId, pastorId, type: "invalido", date: "2026-04-04",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("6. Non-existent member → 404", async () => {
    const res = await request("POST", "/pastoral", {
      memberId: "non-existent-id", pastorId, type: "visita", date: "2026-04-04",
    }, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── LIST ─────────────────────────────────────────────────────────────

  it("7. List visits", async () => {
    const res = await request("GET", "/pastoral", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.visits.length).toBeGreaterThanOrEqual(2);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it("8. Filter by status", async () => {
    const res = await request("GET", "/pastoral?status=pendente", undefined, adminCk);
    expect(res.status).toBe(200);
    res.body.visits.forEach((v: any) => expect(v.status).toBe("pendente"));
  });

  it("9. Filter by memberId", async () => {
    const res = await request("GET", `/pastoral?memberId=${memberId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    res.body.visits.forEach((v: any) => expect(v.memberId).toBe(memberId));
  });

  it("10. Member cannot list → 403", async () => {
    const res = await request("GET", "/pastoral", undefined, memberCk);
    expect(res.status).toBe(403);
  });

  // ─── MEMBER HISTORY ───────────────────────────────────────────────────

  it("11. Member pastoral history", async () => {
    const res = await request("GET", `/pastoral/member/${memberId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.visits.length).toBeGreaterThanOrEqual(2);
    res.body.visits.forEach((v: any) => expect(v.memberId).toBe(memberId));
  });

  // ─── SUMMARY ──────────────────────────────────────────────────────────

  it("12. Summary KPIs", async () => {
    const res = await request("GET", "/pastoral/summary", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("pending");
    expect(res.body).toHaveProperty("doneThisMonth");
    expect(res.body).toHaveProperty("overdueFollowUps");
    expect(res.body).toHaveProperty("totalVisits");
  });

  it("13. Member cannot access summary → 403", async () => {
    const res = await request("GET", "/pastoral/summary", undefined, memberCk);
    expect(res.status).toBe(403);
  });

  // ─── UPDATE ───────────────────────────────────────────────────────────

  it("14. Admin updates visit", async () => {
    const res = await request("PUT", `/pastoral/${visitId}`, {
      status: "realizado", notes: "Visita realizada com sucesso",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("realizado");
    expect(res.body.notes).toBe("Visita realizada com sucesso");
  });

  it("15. Non-existent visit → 404", async () => {
    const res = await request("PUT", "/pastoral/non-existent-id", { status: "realizado" }, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── DELETE ───────────────────────────────────────────────────────────

  it("16. Leader cannot delete → 403", async () => {
    const res = await request("DELETE", `/pastoral/${visitId}`, undefined, leaderCk);
    expect(res.status).toBe(403);
  });

  it("17. Admin soft deletes visit → 200", async () => {
    // Create one to delete
    const cRes = await request("POST", "/pastoral", {
      memberId, pastorId, type: "oracao", date: "2026-05-01",
    }, adminCk);
    const delId = cRes.body.id;

    const res = await request("DELETE", `/pastoral/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    // Should not appear in list
    const list = await request("GET", "/pastoral", undefined, adminCk);
    const ids = list.body.visits.map((v: any) => v.id);
    expect(ids).not.toContain(delId);
  });

  it("18. Member cannot delete → 403", async () => {
    const res = await request("DELETE", `/pastoral/${visitId}`, undefined, memberCk);
    expect(res.status).toBe(403);
  });
});
