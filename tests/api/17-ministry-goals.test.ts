import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "goal-" + crypto.randomUUID().slice(0, 6);

describe("17-ministry-goals", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let memberId: string;
  let ministryId: string;
  let goalId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create member + ministry + add member as leader
    const mRes = await request("POST", "/members", {
      fullName: `GoalMember ${P}`, email: `leader-${P}-l@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;

    const minRes = await request("POST", "/ministries", {
      name: `GoalMinistry ${P}`, category: "louvor",
    }, adminCk);
    ministryId = minRes.body.id;

    // Make member a leader of this ministry
    await request("POST", `/ministries/${ministryId}/members`, {
      memberId, role: "lider",
    }, adminCk);
  });

  it("1. Admin creates goal", async () => {
    const res = await request("POST", `/ministries/${ministryId}/goals`, {
      title: `5 músicos ${P}`, targetValue: 5, unit: "músicos", deadline: "2026-12-31",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`5 músicos ${P}`);
    expect(res.body.targetValue).toBe("5.00");
    expect(res.body.currentValue).toBe("0.00");
    expect(res.body.status).toBe("em_andamento");
    goalId = res.body.id;
  });

  it("2. Missing title → 400", async () => {
    const res = await request("POST", `/ministries/${ministryId}/goals`, {
      targetValue: 10,
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("3. Missing targetValue → 400", async () => {
    const res = await request("POST", `/ministries/${ministryId}/goals`, {
      title: "Test",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("4. Leader of ministry can create", async () => {
    // Login as the leader user (not the member who is leader in the ministry)
    // The leader user role should be able to create
    const res = await request("POST", `/ministries/${ministryId}/goals`, {
      title: `Leader goal ${P}`, targetValue: 3, unit: "eventos",
    }, leaderCk);
    // Leader role = admin/leader can create for any ministry
    // But leaderCk is a "leader" role user, should check if ministry leader
    // Actually requireRole is not used - it checks isMinistryLeader
    // leaderCk user is not a member of this ministry as leader
    // So this should fail with 403 unless the user has leader role
    // Looking at the code: if (user.role !== "admin") { isMinistryLeader... }
    // leaderCk has role "leader" which is NOT "admin", so it checks isMinistryLeader
    // The leader user email is leader-${P}-l@test.local but the member in ministry
    // has email leader-${P}-l@test.local (same!) - so isMinistryLeader should return true
    expect(res.status).toBe(201);
  });

  it("5. Member cannot create → 403", async () => {
    const res = await request("POST", `/ministries/${ministryId}/goals`, {
      title: "Hacked", targetValue: 1,
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("6. List goals (filters deletedAt)", async () => {
    const res = await request("GET", `/ministries/${ministryId}/goals`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.goals.length).toBeGreaterThanOrEqual(2);
  });

  it("7. Update currentValue (progress)", async () => {
    const res = await request("PUT", `/ministries/${ministryId}/goals/${goalId}`, {
      currentValue: 3,
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.currentValue).toBe("3.00");
  });

  it("8. Update status to concluida", async () => {
    const res = await request("PUT", `/ministries/${ministryId}/goals/${goalId}`, {
      currentValue: 5, status: "concluida",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("concluida");
    expect(res.body.currentValue).toBe("5.00");
  });

  it("9. Soft delete goal", async () => {
    // Create throwaway
    const cRes = await request("POST", `/ministries/${ministryId}/goals`, {
      title: `Del ${P}`, targetValue: 1,
    }, adminCk);
    const delId = cRes.body.id;

    const res = await request("DELETE", `/ministries/${ministryId}/goals/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    // Not in list
    const list = await request("GET", `/ministries/${ministryId}/goals`, undefined, adminCk);
    const ids = list.body.goals.map((g: any) => g.id);
    expect(ids).not.toContain(delId);
  });

  it("10. Ministry not found → 404", async () => {
    const res = await request("POST", "/ministries/nonexistent/goals", {
      title: "X", targetValue: 1,
    }, adminCk);
    expect(res.status).toBe(404);
  });

  it("11. Goal with initiativeId", async () => {
    // Create an initiative first
    const iRes = await request("POST", "/planning/initiatives", {
      title: `GoalInitiative ${P}`, type: "capacitacao",
    }, adminCk);
    const initiativeId = iRes.body.id;

    const res = await request("POST", `/ministries/${ministryId}/goals`, {
      title: `Linked goal ${P}`, targetValue: 10, initiativeId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.initiativeId).toBe(initiativeId);
  });

  it("12. Member can view goals (read only)", async () => {
    const res = await request("GET", `/ministries/${ministryId}/goals`, undefined, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.goals.length).toBeGreaterThan(0);
  });
});
