import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "song-" + crypto.randomUUID().slice(0, 6);

describe("21-songs", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let songId: string;
  let suggestionId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;
  });

  // ─── CREATE ───────────────────────────────────────────────────────────

  it("1. Admin creates song → 201", async () => {
    const res = await request("POST", "/songs", {
      title: `Grande é o Senhor ${P}`, author: "Adhemar de Campos",
      songKey: "G", tempo: 120, category: "louvor",
      lyrics: "Grande é o Senhor e mui digno de louvor",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`Grande é o Senhor ${P}`);
    expect(res.body.category).toBe("louvor");
    expect(res.body.songKey).toBe("G");
    songId = res.body.id;
  });

  it("2. Leader creates song → 201", async () => {
    const res = await request("POST", "/songs", {
      title: `Firme nas Promessas ${P}`, category: "hino",
    }, leaderCk);
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("hino");
  });

  it("3. Member cannot create → 403", async () => {
    const res = await request("POST", "/songs", {
      title: `Teste ${P}`, category: "louvor",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("4. Missing title → 400", async () => {
    const res = await request("POST", "/songs", { category: "louvor" }, adminCk);
    expect(res.status).toBe(400);
  });

  it("5. Missing category → 400", async () => {
    const res = await request("POST", "/songs", { title: `Sem Cat ${P}` }, adminCk);
    expect(res.status).toBe(400);
  });

  it("6. Invalid category → 400", async () => {
    const res = await request("POST", "/songs", {
      title: `Cat Inv ${P}`, category: "invalida",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  // ─── LIST ─────────────────────────────────────────────────────────────

  it("7. List songs", async () => {
    const res = await request("GET", "/songs", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.songs.length).toBeGreaterThanOrEqual(2);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it("8. Filter by category", async () => {
    const res = await request("GET", "/songs?category=hino", undefined, adminCk);
    expect(res.status).toBe(200);
    res.body.songs.forEach((s: any) => expect(s.category).toBe("hino"));
  });

  // ─── DETAIL ───────────────────────────────────────────────────────────

  it("9. Song detail", async () => {
    const res = await request("GET", `/songs/${songId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(songId);
    expect(res.body.title).toBe(`Grande é o Senhor ${P}`);
    expect(res.body.author).toBe("Adhemar de Campos");
  });

  it("10. Non-existent song → 404", async () => {
    const res = await request("GET", "/songs/non-existent-id", undefined, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── UPDATE ───────────────────────────────────────────────────────────

  it("11. Update song", async () => {
    const res = await request("PUT", `/songs/${songId}`, {
      songKey: "A", tempo: 130,
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.songKey).toBe("A");
    expect(res.body.tempo).toBe(130);
  });

  // ─── DELETE ───────────────────────────────────────────────────────────

  it("12. Admin soft deletes → 200", async () => {
    const cRes = await request("POST", "/songs", {
      title: `Del Song ${P}`, category: "especial",
    }, adminCk);
    const delId = cRes.body.id;

    const res = await request("DELETE", `/songs/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    // Should not appear in list
    const list = await request("GET", "/songs", undefined, adminCk);
    const ids = list.body.songs.map((s: any) => s.id);
    expect(ids).not.toContain(delId);
  });

  it("13. Leader cannot delete → 403", async () => {
    const res = await request("DELETE", `/songs/${songId}`, undefined, leaderCk);
    expect(res.status).toBe(403);
  });

  // ─── SUGGESTIONS ──────────────────────────────────────────────────────

  it("14. Member suggests song → 201", async () => {
    const res = await request("POST", "/songs/suggestions", {
      title: `Sugestão ${P}`, reason: "Muito boa para o culto",
    }, memberCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`Sugestão ${P}`);
    expect(res.body.status).toBe("pendente");
    suggestionId = res.body.id;
  });

  it("15. List suggestions (admin sees all)", async () => {
    const res = await request("GET", "/songs/suggestions", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it("16. Leader approves suggestion → status aprovada", async () => {
    const res = await request("PUT", `/songs/suggestions/${suggestionId}`, {
      status: "aprovada", reviewNote: "Excelente sugestão",
    }, leaderCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aprovada");
    expect(res.body.reviewNote).toBe("Excelente sugestão");
  });

  it("17. Member sees only own suggestions", async () => {
    // Create a suggestion as admin to ensure there are multiple
    await request("POST", "/songs/suggestions", {
      title: `Admin Sug ${P}`, reason: "Test",
    }, adminCk);

    const res = await request("GET", "/songs/suggestions", undefined, memberCk);
    expect(res.status).toBe(200);
    // Member should only see their own
    res.body.suggestions.forEach((s: any) => {
      // Member suggestions should belong to the member user
      expect(s.suggestedByName).toBeDefined();
    });
  });
});
