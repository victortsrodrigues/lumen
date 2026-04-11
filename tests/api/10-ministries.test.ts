import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "min-" + crypto.randomUUID().slice(0, 6);

describe("10-ministries", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let memberId: string;
  let memberBId: string;
  let ministryId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create members for testing
    const mRes = await request("POST", "/members", {
      fullName: `MinMemberA ${P}`, email: `member-${P}-m@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;

    const mbRes = await request("POST", "/members", {
      fullName: `MinMemberB ${P}`, email: `member-${P}-b@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberBId = mbRes.body.id;
  });

  // ─── MINISTRY CRUD ──────────────────────────────────────────────────────

  it("1. Admin creates ministry", async () => {
    const res = await request("POST", "/ministries", {
      name: `Louvor ${P}`,
      description: "Ministério de louvor e adoração",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`Louvor ${P}`);
    expect(res.body.status).toBe("ativo");
    ministryId = res.body.id;
  });

  it("2. Missing name → 400", async () => {
    const res = await request("POST", "/ministries", {}, adminCk);
    expect(res.status).toBe(400);
  });

  it("3. Leader cannot create ministry → 403", async () => {
    const res = await request("POST", "/ministries", {
      name: "Test",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("4. Member cannot create ministry → 403", async () => {
    const res = await request("POST", "/ministries", {
      name: "Test",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("5. List ministries", async () => {
    const res = await request("GET", "/ministries", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.ministries.length).toBeGreaterThanOrEqual(1);
    const m = res.body.ministries.find((x: any) => x.id === ministryId);
    expect(m).toBeDefined();
    expect(m.memberCount).toBe(0);
    expect(m.leaders).toEqual([]);
  });

  it("6. Get ministry detail", async () => {
    const res = await request("GET", `/ministries/${ministryId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`Louvor ${P}`);
    expect(res.body.members).toEqual([]);
  });

  it("7. Get nonexistent → 404", async () => {
    const res = await request("GET", "/ministries/nonexistent", undefined, adminCk);
    expect(res.status).toBe(404);
  });

  it("8. Admin updates ministry", async () => {
    const res = await request("PUT", `/ministries/${ministryId}`, {
      description: "Descrição atualizada",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Descrição atualizada");
  });

  it("9. Member cannot update → 403", async () => {
    const res = await request("PUT", `/ministries/${ministryId}`, {
      name: "Hacked",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  // ─── MINISTRY MEMBERS ──────────────────────────────────────────────────

  it("10. Add member to ministry", async () => {
    const res = await request("POST", `/ministries/${ministryId}/members`, {
      memberId, role: "membro",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.memberId).toBe(memberId);
    expect(res.body.role).toBe("membro");
  });

  it("11. Add same member again → 409", async () => {
    const res = await request("POST", `/ministries/${ministryId}/members`, {
      memberId, role: "membro",
    }, adminCk);
    expect(res.status).toBe(409);
  });

  it("12. Add second member as leader", async () => {
    const res = await request("POST", `/ministries/${ministryId}/members`, {
      memberId: memberBId, role: "lider",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("lider");
  });

  it("13. Missing memberId → 400", async () => {
    const res = await request("POST", `/ministries/${ministryId}/members`, {
      role: "membro",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("14. Invalid role → 400", async () => {
    const res = await request("POST", `/ministries/${ministryId}/members`, {
      memberId: "some-id", role: "presidente",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("15. Member cannot add members → 403", async () => {
    const res = await request("POST", `/ministries/${ministryId}/members`, {
      memberId: "some-id", role: "membro",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("16. Ministry detail now shows members", async () => {
    const res = await request("GET", `/ministries/${ministryId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.members.length).toBe(2);
  });

  it("17. List shows member count and leaders", async () => {
    const res = await request("GET", "/ministries", undefined, adminCk);
    const m = res.body.ministries.find((x: any) => x.id === ministryId);
    expect(m.memberCount).toBe(2);
    expect(m.leaders.length).toBe(1);
    expect(m.leaders[0].memberId).toBe(memberBId);
  });

  it("18. Update member role", async () => {
    const res = await request("PUT", `/ministries/${ministryId}/members/${memberId}`, {
      role: "lider",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("lider");
  });

  it("19. Update role of nonexistent member → 404", async () => {
    const res = await request("PUT", `/ministries/${ministryId}/members/nonexistent`, {
      role: "membro",
    }, adminCk);
    expect(res.status).toBe(404);
  });

  it("20. Remove member from ministry", async () => {
    const res = await request("DELETE", `/ministries/${ministryId}/members/${memberId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removido/);
  });

  it("21. Removed member not in detail", async () => {
    const res = await request("GET", `/ministries/${ministryId}`, undefined, adminCk);
    const memberIds = res.body.members.map((m: any) => m.memberId);
    expect(memberIds).not.toContain(memberId);
    expect(res.body.members.length).toBe(1);
  });

  it("22. Remove already removed → 404", async () => {
    const res = await request("DELETE", `/ministries/${ministryId}/members/${memberId}`, undefined, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── GET /members/:id/ministries ────────────────────────────────────────

  it("23. Get member ministries (member B is still in ministry)", async () => {
    const res = await request("GET", `/members/${memberBId}/ministries`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.ministries.length).toBe(1);
    expect(res.body.ministries[0].ministryId).toBe(ministryId);
    expect(res.body.ministries[0].role).toBe("lider");
  });

  it("24. Get member ministries for removed member (member A)", async () => {
    const res = await request("GET", `/members/${memberId}/ministries`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.ministries.length).toBe(0);
  });

  it("25. Member can see own ministries only → 403 for other", async () => {
    const res = await request("GET", `/members/${memberBId}/ministries`, undefined, memberCk);
    expect(res.status).toBe(403);
  });

  // ─── DELETE MINISTRY ────────────────────────────────────────────────────

  it("26. Member cannot delete ministry → 403", async () => {
    const res = await request("DELETE", `/ministries/${ministryId}`, undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("27. Admin deletes ministry", async () => {
    const cRes = await request("POST", "/ministries", {
      name: `Deletar ${P}`,
    }, adminCk);
    const delId = cRes.body.id;

    const res = await request("DELETE", `/ministries/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removido/);
  });

  it("28. Deleted ministry not in list", async () => {
    const res = await request("GET", "/ministries", undefined, adminCk);
    const names = res.body.ministries.map((m: any) => m.name);
    expect(names).not.toContain(`Deletar ${P}`);
  });
});
