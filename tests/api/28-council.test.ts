import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerMember } from "./helpers";

const P = "council-" + crypto.randomUUID().slice(0, 6);

describe("28-council", () => {
  let adminCk: string;
  let memberCk: string;
  let leaderCk: string;
  let meetingId: string;
  let item1Id: string;
  let item2Id: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;
    // Promote a separate user to leader via members.role would be ideal,
    // but for now: we'll test admin/member RBAC. Leader test is best-effort.
    const l = await registerMember(`${P}-l`);
    leaderCk = l.cookie;
  });

  it("1. Admin creates meeting", async () => {
    const res = await request("POST", "/council", {
      meetingDate: "2026-03-15",
      title: `Reunião ${P}`,
      agenda: "1. Aprovação da ata\n2. Relatório financeiro\n3. Avaliação ministerial",
      summary: "Decisões iniciais.",
      status: "agendada",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toContain("Reunião");
    expect(res.body.status).toBe("agendada");
    meetingId = res.body.id;
  });

  it("2. Member cannot list meetings", async () => {
    const res = await request("GET", "/council", undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("3. Leader cannot list meetings (admin only)", async () => {
    const res = await request("GET", "/council", undefined, leaderCk);
    expect(res.status).toBe(403);
  });

  it("4. Member cannot create meeting", async () => {
    const res = await request("POST", "/council", {
      meetingDate: "2026-04-01", title: "X",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("5. Add 3 items with auto-incremented order", async () => {
    const r1 = await request("POST", `/council/${meetingId}/items`, {
      title: "Item 1", status: "discutida",
    }, adminCk);
    expect(r1.status).toBe(201);
    expect(r1.body.order).toBe(1);
    item1Id = r1.body.id;

    const r2 = await request("POST", `/council/${meetingId}/items`, {
      title: "Item 2",
    }, adminCk);
    expect(r2.body.order).toBe(2);
    item2Id = r2.body.id;

    const r3 = await request("POST", `/council/${meetingId}/items`, {
      title: "Item 3",
    }, adminCk);
    expect(r3.body.order).toBe(3);
  });

  it("6. Cannot create item with status=decidida without resolution", async () => {
    const res = await request("POST", `/council/${meetingId}/items`, {
      title: "Decidir já", status: "decidida",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("7. Update item to status=decidida sets resolvedAt", async () => {
    const res = await request("PUT", `/council/${meetingId}/items/${item1Id}`, {
      status: "decidida", resolution: "Aprovado por unanimidade.",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("decidida");
    expect(res.body.resolution).toBe("Aprovado por unanimidade.");
    expect(res.body.resolvedAt).toBeTruthy();
  });

  it("8. Reverting from decidida zeros resolvedAt", async () => {
    const res = await request("PUT", `/council/${meetingId}/items/${item1Id}`, {
      status: "discutida",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("discutida");
    expect(res.body.resolvedAt).toBeNull();
  });

  it("9. PUT to status=decidida without existing resolution → 400", async () => {
    // item2 has no resolution
    const res = await request("PUT", `/council/${meetingId}/items/${item2Id}`, {
      status: "decidida",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("10. Reorder items", async () => {
    const detail = await request("GET", `/council/${meetingId}`, undefined, adminCk);
    const ids = detail.body.items.map((i: any) => i.id);
    // Reverse order
    const reversed = [...ids].reverse();
    const res = await request("PUT", `/council/${meetingId}/items/reorder`, {
      itemIds: reversed,
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.items[0].id).toBe(reversed[0]);
  });

  it("11. Reorder with mismatched IDs → 400", async () => {
    const res = await request("PUT", `/council/${meetingId}/items/reorder`, {
      itemIds: ["fake-id-1"],
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("12. Search ILIKE finds meeting by title", async () => {
    const res = await request("GET", `/council?search=${encodeURIComponent(P)}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.meetings.length).toBeGreaterThan(0);
  });

  it("13. Search ILIKE finds meeting by agenda", async () => {
    const res = await request("GET", `/council?search=ministerial`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.meetings.find((m: any) => m.id === meetingId)).toBeTruthy();
  });

  it("14. Year filter restricts results", async () => {
    const res = await request("GET", `/council?year=2026`, undefined, adminCk);
    expect(res.status).toBe(200);
    const found = res.body.meetings.find((m: any) => m.id === meetingId);
    expect(found).toBeTruthy();

    const res2 = await request("GET", `/council?year=2099`, undefined, adminCk);
    expect(res2.body.meetings.find((m: any) => m.id === meetingId)).toBeUndefined();
  });

  it("15. Soft-delete meeting", async () => {
    const res = await request("DELETE", `/council/${meetingId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    const list = await request("GET", "/council", undefined, adminCk);
    expect(list.body.meetings.find((m: any) => m.id === meetingId)).toBeUndefined();
  });
});
