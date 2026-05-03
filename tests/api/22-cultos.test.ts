import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerMember } from "./helpers";

const P = "culto-" + crypto.randomUUID().slice(0, 6);

describe("22-cultos", () => {
  let adminCk: string;
  let memberCk: string;
  let cultoId: string;
  let eventId: string;
  let songId: string;
  let songEntryId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create a song to reference
    const songRes = await request("POST", "/songs", {
      title: `Hino ${P}`, category: "louvor",
    }, adminCk);
    expect(songRes.status).toBe(201);
    songId = songRes.body.id;
  });

  it("1. Create culto (event + culto in transaction)", async () => {
    const res = await request("POST", "/cultos", {
      title: `Culto Matutino ${P}`,
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(),
      location: "Templo",
      openingText: "Salmo 100",
      sermonTitle: "Graça que transforma",
      sermonReference: "Romanos 8:28-39",
      hasCommunion: true,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toContain("Culto Matutino");
    expect(res.body.hasCommunion).toBe(true);
    expect(res.body.eventId).toBeTruthy();
    cultoId = res.body.id;
    eventId = res.body.eventId;
  });

  it("2. Member can list cultos", async () => {
    const res = await request("GET", `/cultos?year=${new Date().getFullYear()}`, undefined, memberCk);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cultos)).toBe(true);
  });

  it("3. Member cannot create culto", async () => {
    const res = await request("POST", "/cultos", {
      title: "X", startDate: new Date().toISOString(), endDate: new Date().toISOString(),
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("4. Member can read culto detail", async () => {
    const res = await request("GET", `/cultos/${cultoId}`, undefined, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.title).toContain("Culto Matutino");
  });

  it("5. Add song to culto (auto-order)", async () => {
    const res = await request("POST", `/cultos/${cultoId}/songs`, { songId }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.order).toBe(1);
    expect(res.body.songTitle).toContain("Hino");
    songEntryId = res.body.id;
  });

  it("6. Reorder with mismatched IDs returns 400", async () => {
    const res = await request("PUT", `/cultos/${cultoId}/songs/reorder`, {
      songIds: ["nonexistent-id"],
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("7. Update culto flags", async () => {
    const res = await request("PUT", `/cultos/${cultoId}`, {
      hasBaptism: true, sermonNotes: "3 pontos",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.hasBaptism).toBe(true);
    expect(res.body.sermonNotes).toBe("3 pontos");
  });

  it("8. PUT does not allow changing event type away from culto", async () => {
    const res = await request("PUT", `/cultos/${cultoId}`, {
      type: "reuniao", // ignored — backend forces "culto"
    }, adminCk);
    expect(res.status).toBe(200);
    // Verify type still "culto" via /events
    const ev = await request("GET", `/events/${eventId}`, undefined, adminCk);
    expect(ev.body.type).toBe("culto");
  });

  it("9. Annual report returns totals", async () => {
    const year = new Date().getFullYear();
    const nextYear = year + (new Date().getMonth() === 11 ? 1 : 0); // edge: created culto might fall in next year
    const res = await request("GET", `/cultos/reports/annual?year=${year}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totals");
    expect(res.body).toHaveProperty("items");
    expect(res.body.totals.cultos).toBeGreaterThanOrEqual(0);
    // also try nextYear if year boundary
    if (nextYear !== year) {
      const r2 = await request("GET", `/cultos/reports/annual?year=${nextYear}`, undefined, adminCk);
      expect(r2.status).toBe(200);
    }
  });

  it("10. Member cannot access annual report", async () => {
    const res = await request("GET", `/cultos/reports/annual?year=2026`, undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("11. Delete song from culto", async () => {
    const res = await request("DELETE", `/cultos/${cultoId}/songs/${songEntryId}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("12. Soft-delete culto", async () => {
    const res = await request("DELETE", `/cultos/${cultoId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    // Should no longer appear in list
    const list = await request("GET", `/cultos?year=${new Date().getFullYear()}`, undefined, adminCk);
    expect((list.body.cultos as any[]).find(c => c.id === cultoId)).toBeUndefined();
  });
});
