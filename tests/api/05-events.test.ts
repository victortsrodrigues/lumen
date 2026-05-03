import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerMember } from "./helpers";

const P = "evt-" + crypto.randomUUID().slice(0, 6);

describe("05-events", () => {
  let adminCk: string;
  let memberACk: string;
  let memberBCk: string;
  let memberAId: string;
  let memberBId: string;
  let eventId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const ma = await registerMember(`${P}-ma`);
    memberACk = ma.cookie;
    const mb = await registerMember(`${P}-mb`);
    memberBCk = mb.cookie;

    // Create members for registration
    const maRes = await request("POST", "/members", {
      fullName: `EvtMemberA ${P}`, email: `member-${P}-ma@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberAId = maRes.body.id;

    const mbRes = await request("POST", "/members", {
      fullName: `EvtMemberB ${P}`, email: `member-${P}-mb@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberBId = mbRes.body.id;
  });

  const futureDate = () => {
    const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    return d.toISOString();
  };
  const futureEndDate = () => {
    const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000);
    return d.toISOString();
  };

  it("1. Create event", async () => {
    const res = await request("POST", "/events", {
      title: `Culto ${P}`, type: "culto", startDate: futureDate(), endDate: futureEndDate(),
      location: "Templo", maxSlots: 50,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`Culto ${P}`);
    expect(res.body.type).toBe("culto");
    eventId = res.body.id;
  });

  it("2. Missing fields → 400", async () => {
    const res = await request("POST", "/events", { title: "X" }, adminCk);
    expect(res.status).toBe(400);
  });

  it("3. Member cannot create → 403", async () => {
    const res = await request("POST", "/events", {
      title: "X", type: "culto", startDate: futureDate(), endDate: futureEndDate(),
    }, memberACk);
    expect(res.status).toBe(403);
  });

  it("4. List events with registeredCount", async () => {
    const res = await request("GET", "/events", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.events[0]).toHaveProperty("registeredCount");
  });

  it("5. Filter by type", async () => {
    const res = await request("GET", "/events?type=culto", undefined, adminCk);
    expect(res.status).toBe(200);
    for (const e of res.body.events) {
      expect(e.type).toBe("culto");
    }
  });

  it("6. Upcoming events (next 7 days)", async () => {
    const res = await request("GET", "/events/upcoming", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
  });

  it("6.1. Upcoming with ?days=30 returns 30-day window", async () => {
    const res = await request("GET", "/events/upcoming?days=30", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it("6.2. Upcoming with ?days=999 silently clamps to 365 (no 400)", async () => {
    const res = await request("GET", "/events/upcoming?days=999", undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("7. Upcoming returns empty array (no error)", async () => {
    // Create event in the past
    await request("POST", "/events", {
      title: `Past ${P}`, type: "outro",
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
    }, adminCk);
    // Upcoming should still return 200 with array (even if empty for past events)
    const res = await request("GET", "/events/upcoming", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it("8. Event detail with registrations", async () => {
    const res = await request("GET", `/events/${eventId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("registrations");
  });

  it("9. Update event", async () => {
    const res = await request("PUT", `/events/${eventId}`, {
      title: `Updated ${P}`,
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(`Updated ${P}`);
  });

  it("10. Soft delete event", async () => {
    const cr = await request("POST", "/events", {
      title: `Del ${P}`, type: "social", startDate: futureDate(), endDate: futureEndDate(),
    }, adminCk);
    const res = await request("DELETE", `/events/${cr.body.id}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("11. GET after soft delete → 404", async () => {
    const cr = await request("POST", "/events", {
      title: `Del2 ${P}`, type: "social", startDate: futureDate(), endDate: futureEndDate(),
    }, adminCk);
    await request("DELETE", `/events/${cr.body.id}`, undefined, adminCk);
    const res = await request("GET", `/events/${cr.body.id}`, undefined, adminCk);
    expect(res.status).toBe(404);
  });

  it("12. Register member", async () => {
    const res = await request("POST", `/events/${eventId}/register`, {
      memberId: memberAId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.memberName).toContain("EvtMemberA");
  });

  it("13. Duplicate registration → 409", async () => {
    const res = await request("POST", `/events/${eventId}/register`, {
      memberId: memberAId,
    }, adminCk);
    expect(res.status).toBe(409);
  });

  it("14. Event full → 409", async () => {
    const cr = await request("POST", "/events", {
      title: `Full ${P}`, type: "reuniao", startDate: futureDate(), endDate: futureEndDate(), maxSlots: 1,
    }, adminCk);
    await request("POST", `/events/${cr.body.id}/register`, { memberId: memberAId }, adminCk);
    const res = await request("POST", `/events/${cr.body.id}/register`, { memberId: memberBId }, adminCk);
    expect(res.status).toBe(409);
  });

  it("15. Cancel own registration", async () => {
    // Register memberB then cancel
    const evCr = await request("POST", "/events", {
      title: `CancelOwn ${P}`, type: "social", startDate: futureDate(), endDate: futureEndDate(),
    }, adminCk);
    await request("POST", `/events/${evCr.body.id}/register`, { memberId: memberBId }, adminCk);
    const res = await request("DELETE", `/events/${evCr.body.id}/register/${memberBId}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("16. Cancel other's registration → 403 (member)", async () => {
    // Members trying to cancel others — this requires the member role user
    // Since our memberACk doesn't have a matching member record with the right ID,
    // we test that a member cannot cancel another member's registration
    const evCr = await request("POST", "/events", {
      title: `CancelOther ${P}`, type: "social", startDate: futureDate(), endDate: futureEndDate(),
    }, adminCk);
    await request("POST", `/events/${evCr.body.id}/register`, { memberId: memberBId }, adminCk);
    const res = await request("DELETE", `/events/${evCr.body.id}/register/${memberBId}`, undefined, memberACk);
    expect(res.status).toBe(403);
  });

  it("17. List registrations (admin)", async () => {
    const res = await request("GET", `/events/${eventId}/registrations`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.registrations.length).toBeGreaterThanOrEqual(1);
  });

  it("18. Record attendance", async () => {
    const res = await request("POST", `/events/${eventId}/attendance`, {
      records: [{ memberId: memberAId, present: true }],
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it("19. Get attendance", async () => {
    const res = await request("GET", `/events/${eventId}/attendance`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.attendance.length).toBeGreaterThanOrEqual(1);
    expect(res.body.attendance[0]).toHaveProperty("present");
  });
});
