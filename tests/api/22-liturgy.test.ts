import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "lit-" + crypto.randomUUID().slice(0, 6);

describe("22-liturgy", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let memberId: string;
  let songId: string;
  let liturgyId: string;
  let itemId1: string;
  let itemId2: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create a member (for responsible)
    const mRes = await request("POST", "/members", {
      fullName: `Liturgia Member ${P}`, email: `lit-member-${P}@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;

    // Create a song (for songId linking)
    const sRes = await request("POST", "/songs", {
      title: `Louvor Liturgia ${P}`, category: "louvor",
    }, adminCk);
    songId = sRes.body.id;
  });

  // ─── CREATE ───────────────────────────────────────────────────────────

  it("1. Admin creates liturgy → 201", async () => {
    const res = await request("POST", "/liturgy", {
      title: `Culto Dominical ${P}`, date: "2026-04-12", type: "culto_dominical",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`Culto Dominical ${P}`);
    expect(res.body.status).toBe("rascunho");
    liturgyId = res.body.id;
  });

  it("2. Leader creates → 201", async () => {
    const res = await request("POST", "/liturgy", {
      title: `Culto Noite ${P}`, date: "2026-04-12", type: "culto_dominical",
    }, leaderCk);
    expect(res.status).toBe(201);
  });

  it("3. Member cannot create → 403", async () => {
    const res = await request("POST", "/liturgy", {
      title: `Teste ${P}`, date: "2026-04-12", type: "culto_dominical",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("4. Missing required fields → 400", async () => {
    const res = await request("POST", "/liturgy", { title: `Sem data ${P}` }, adminCk);
    expect(res.status).toBe(400);
  });

  // ─── LIST ─────────────────────────────────────────────────────────────

  it("5. List liturgies", async () => {
    const res = await request("GET", "/liturgy", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.liturgies.length).toBeGreaterThanOrEqual(2);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  // ─── DETAIL ───────────────────────────────────────────────────────────

  it("6. Liturgy detail (empty items)", async () => {
    const res = await request("GET", `/liturgy/${liturgyId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(liturgyId);
    expect(res.body.items).toEqual([]);
  });

  // ─── ITEMS ────────────────────────────────────────────────────────────

  it("7. Add item → 201", async () => {
    const res = await request("POST", `/liturgy/${liturgyId}/items`, {
      type: "louvor", title: "Abertura com louvor",
      responsibleMemberId: memberId, durationMinutes: 10, songId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Abertura com louvor");
    expect(res.body.order).toBe(1);
    expect(res.body.songId).toBe(songId);
    expect(res.body.responsibleMemberId).toBe(memberId);
    itemId1 = res.body.id;
  });

  it("8. Add second item (auto order)", async () => {
    const res = await request("POST", `/liturgy/${liturgyId}/items`, {
      type: "pregacao", title: "Sermão",
      responsibleMemberId: memberId, durationMinutes: 30,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.order).toBe(2);
    itemId2 = res.body.id;
  });

  it("9. Reorder items", async () => {
    const res = await request("PUT", `/liturgy/${liturgyId}/items/reorder`, {
      itemIds: [itemId2, itemId1],
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.items[0].id).toBe(itemId2);
    expect(res.body.items[0].order).toBe(1);
    expect(res.body.items[1].id).toBe(itemId1);
    expect(res.body.items[1].order).toBe(2);
  });

  // ─── UPDATE LITURGY ───────────────────────────────────────────────────

  it("10. Update liturgy (approve)", async () => {
    const res = await request("PUT", `/liturgy/${liturgyId}`, {
      status: "aprovada",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aprovada");
  });

  it("11. Leader cannot approve → 403", async () => {
    // Create a draft liturgy first
    const cRes = await request("POST", "/liturgy", {
      title: `Draft Leader ${P}`, date: "2026-05-01", type: "culto_dominical",
    }, leaderCk);
    const draftId = cRes.body.id;

    const res = await request("PUT", `/liturgy/${draftId}`, {
      status: "aprovada",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("12. Member sees only approved", async () => {
    // Create a draft liturgy that member should NOT see
    await request("POST", "/liturgy", {
      title: `Draft Invisible ${P}`, date: "2026-05-02", type: "culto_dominical",
    }, adminCk);

    const res = await request("GET", "/liturgy", undefined, memberCk);
    expect(res.status).toBe(200);
    res.body.liturgies.forEach((l: any) => expect(l.status).toBe("aprovada"));
  });

  // ─── DELETE ITEM ──────────────────────────────────────────────────────

  it("13. Delete item", async () => {
    const res = await request("DELETE", `/liturgy/${liturgyId}/items/${itemId2}`, undefined, adminCk);
    expect(res.status).toBe(200);

    // Verify item is gone
    const detail = await request("GET", `/liturgy/${liturgyId}`, undefined, adminCk);
    const ids = detail.body.items.map((i: any) => i.id);
    expect(ids).not.toContain(itemId2);
  });

  // ─── DELETE LITURGY ───────────────────────────────────────────────────

  it("14. Admin soft deletes liturgy", async () => {
    const cRes = await request("POST", "/liturgy", {
      title: `Del Liturgy ${P}`, date: "2026-06-01", type: "culto_dominical",
    }, adminCk);
    const delId = cRes.body.id;

    const res = await request("DELETE", `/liturgy/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    // Should not appear in list
    const list = await request("GET", "/liturgy", undefined, adminCk);
    const ids = list.body.liturgies.map((l: any) => l.id);
    expect(ids).not.toContain(delId);
  });

  it("15. Leader cannot delete → 403", async () => {
    const res = await request("DELETE", `/liturgy/${liturgyId}`, undefined, leaderCk);
    expect(res.status).toBe(403);
  });
});
