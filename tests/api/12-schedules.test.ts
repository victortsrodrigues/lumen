import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "sch-" + crypto.randomUUID().slice(0, 6);

describe("12-schedules", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let memberEmail: string;
  let memberId: string;
  let memberBId: string;
  let eventId: string;
  let roleId: string;
  let roleBId: string;
  let scheduleId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;
    memberEmail = m.email;

    // Create members
    const mRes = await request("POST", "/members", {
      fullName: `SchMemberA ${P}`, email: memberEmail, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;

    const mbRes = await request("POST", "/members", {
      fullName: `SchMemberB ${P}`, email: `member-${P}-b@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberBId = mbRes.body.id;

    // Create event
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const futureEndDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString();
    const evRes = await request("POST", "/events", {
      title: `Culto ${P}`, type: "culto", startDate: futureDate, endDate: futureEndDate,
    }, adminCk);
    eventId = evRes.body.id;
  });

  // ─── SERVICE ROLES ──────────────────────────────────────────────────────

  it("1. Admin creates service role", async () => {
    const res = await request("POST", "/schedules/roles", {
      name: `Louvor ${P}`, description: "Equipe de louvor",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`Louvor ${P}`);
    roleId = res.body.id;
  });

  it("2. Create second role", async () => {
    const res = await request("POST", "/schedules/roles", {
      name: `Som ${P}`,
    }, adminCk);
    expect(res.status).toBe(201);
    roleBId = res.body.id;
  });

  it("3. Missing name → 400", async () => {
    const res = await request("POST", "/schedules/roles", {
      description: "X",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("4. Leader cannot create role → 403", async () => {
    const res = await request("POST", "/schedules/roles", {
      name: "Test",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("5. List service roles", async () => {
    const res = await request("GET", "/schedules/roles", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.roles.length).toBeGreaterThanOrEqual(2);
  });

  it("6. Member can list roles", async () => {
    const res = await request("GET", "/schedules/roles", undefined, memberCk);
    expect(res.status).toBe(200);
  });

  it("7. Update service role", async () => {
    const res = await request("PUT", `/schedules/roles/${roleId}`, {
      description: "Atualizado",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Atualizado");
  });

  it("8. Delete service role", async () => {
    // Create throwaway
    const cRes = await request("POST", "/schedules/roles", { name: `Del ${P}` }, adminCk);
    const delId = cRes.body.id;
    const res = await request("DELETE", `/schedules/roles/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  // ─── EVENT SCHEDULES ────────────────────────────────────────────────────

  it("9. Admin schedules volunteer", async () => {
    const res = await request("POST", `/events/${eventId}/schedule`, {
      serviceRoleId: roleId, memberId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.memberId).toBe(memberId);
    expect(res.body.status).toBe("escalado");
    expect(res.body.serviceRoleName).toBe(`Louvor ${P}`);
    scheduleId = res.body.id;
  });

  it("10. Leader schedules volunteer", async () => {
    const res = await request("POST", `/events/${eventId}/schedule`, {
      serviceRoleId: roleBId, memberId: memberBId,
    }, leaderCk);
    expect(res.status).toBe(201);
  });

  it("11. Duplicate schedule → 409", async () => {
    const res = await request("POST", `/events/${eventId}/schedule`, {
      serviceRoleId: roleId, memberId,
    }, adminCk);
    expect(res.status).toBe(409);
  });

  it("12. Missing fields → 400", async () => {
    const res = await request("POST", `/events/${eventId}/schedule`, {
      serviceRoleId: roleId,
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("13. Member cannot schedule → 403", async () => {
    const res = await request("POST", `/events/${eventId}/schedule`, {
      serviceRoleId: roleId, memberId: memberBId,
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("14. Get event schedule", async () => {
    const res = await request("GET", `/events/${eventId}/schedule`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.schedule.length).toBe(2);
  });

  it("15. Member can view schedule", async () => {
    const res = await request("GET", `/events/${eventId}/schedule`, undefined, memberCk);
    expect(res.status).toBe(200);
  });

  // ─── STATUS UPDATE ──────────────────────────────────────────────────────

  it("16. Admin updates status to confirmado", async () => {
    const res = await request("PUT", `/events/${eventId}/schedule/${scheduleId}`, {
      status: "confirmado",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmado");
  });

  it("17. Volunteer confirms own schedule", async () => {
    // Reset to escalado first
    await request("PUT", `/events/${eventId}/schedule/${scheduleId}`, {
      status: "escalado",
    }, adminCk);

    const res = await request("PUT", `/events/${eventId}/schedule/${scheduleId}`, {
      status: "confirmado",
    }, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmado");
  });

  it("18. Volunteer can mark as ausente", async () => {
    const res = await request("PUT", `/events/${eventId}/schedule/${scheduleId}`, {
      status: "ausente",
    }, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ausente");
  });

  it("19. Volunteer cannot set substituido → 403", async () => {
    const res = await request("PUT", `/events/${eventId}/schedule/${scheduleId}`, {
      status: "substituido",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("20. Invalid status → 400", async () => {
    const res = await request("PUT", `/events/${eventId}/schedule/${scheduleId}`, {
      status: "invalido",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("21. Update nonexistent → 404", async () => {
    const res = await request("PUT", `/events/${eventId}/schedule/nonexistent`, {
      status: "confirmado",
    }, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── DELETE SCHEDULE ────────────────────────────────────────────────────

  it("22. Member cannot remove from schedule → 403", async () => {
    const res = await request("DELETE", `/events/${eventId}/schedule/${scheduleId}`, undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("23. Admin removes from schedule", async () => {
    const res = await request("DELETE", `/events/${eventId}/schedule/${scheduleId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removido/);
  });

  it("24. Removed not in schedule", async () => {
    const res = await request("GET", `/events/${eventId}/schedule`, undefined, adminCk);
    const ids = res.body.schedule.map((s: any) => s.id);
    expect(ids).not.toContain(scheduleId);
  });

  it("25. Delete nonexistent → 404", async () => {
    const res = await request("DELETE", `/events/${eventId}/schedule/nonexistent`, undefined, adminCk);
    expect(res.status).toBe(404);
  });
});
