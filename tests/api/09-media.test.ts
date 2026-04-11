import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "med-" + crypto.randomUUID().slice(0, 6);

describe("09-media", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let adminUserId: string;
  let leaderUserId: string;
  let eventId: string;
  let mediaId: string;
  let leaderMediaId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    adminUserId = a.user.id;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    leaderUserId = l.user.id;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create an event to use as entity
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const futureEndDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString();
    const evRes = await request("POST", "/events", {
      title: `MediaEvent ${P}`, type: "culto", startDate: futureDate, endDate: futureEndDate,
    }, adminCk);
    eventId = evRes.body.id;
  });

  // ─── CREATE ─────────────────────────────────────────────────────────────

  it("1. Admin creates media (YouTube)", async () => {
    const res = await request("POST", "/media", {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Video de teste",
      entityType: "event",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("youtube");
    expect(res.body.title).toBe("Video de teste");
    expect(res.body.entityType).toBe("event");
    expect(res.body.entityId).toBe(eventId);
    mediaId = res.body.id;
  });

  it("2. Leader creates media (Vimeo)", async () => {
    const res = await request("POST", "/media", {
      url: "https://vimeo.com/123456789",
      title: "Vimeo test",
      entityType: "event",
      entityId: eventId,
    }, leaderCk);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("vimeo");
    leaderMediaId = res.body.id;
  });

  it("3. Member cannot create → 403", async () => {
    const res = await request("POST", "/media", {
      url: "https://example.com/video.mp4",
      entityType: "event",
      entityId: eventId,
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("4. Missing url → 400", async () => {
    const res = await request("POST", "/media", {
      entityType: "event",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("5. Missing entityType → 400", async () => {
    const res = await request("POST", "/media", {
      url: "https://example.com",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("6. Invalid entityType → 400", async () => {
    const res = await request("POST", "/media", {
      url: "https://example.com",
      entityType: "invalid_type",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("7. javascript: URL rejected → 400", async () => {
    const res = await request("POST", "/media", {
      url: "javascript:alert(1)",
      entityType: "event",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/URL invalida/);
  });

  it("8. data: URL rejected → 400", async () => {
    const res = await request("POST", "/media", {
      url: "data:text/html,<h1>XSS</h1>",
      entityType: "event",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("9. file: URL rejected → 400", async () => {
    const res = await request("POST", "/media", {
      url: "file:///etc/passwd",
      entityType: "event",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("10. Auto-detect Google Drive type", async () => {
    const res = await request("POST", "/media", {
      url: "https://drive.google.com/file/d/abc123/view",
      entityType: "event",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("drive");
  });

  it("11. Auto-detect mp4 as link type", async () => {
    const res = await request("POST", "/media", {
      url: "https://example.com/video.mp4",
      entityType: "event",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("link");
  });

  it("12. Auto-detect generic URL as outro", async () => {
    const res = await request("POST", "/media", {
      url: "https://example.com/doc.pdf",
      entityType: "event",
      entityId: eventId,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("outro");
  });

  // ─── LIST ───────────────────────────────────────────────────────────────

  it("13. List media by entity", async () => {
    const res = await request("GET", `/media?entityType=event&entityId=${eventId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.media.length).toBeGreaterThanOrEqual(5);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
  });

  it("14. Member can list media", async () => {
    const res = await request("GET", `/media?entityType=event&entityId=${eventId}`, undefined, memberCk);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.media)).toBe(true);
  });

  it("15. List without auth → 401", async () => {
    const res = await request("GET", `/media?entityType=event&entityId=${eventId}`);
    expect(res.status).toBe(401);
  });

  // ─── UPDATE ─────────────────────────────────────────────────────────────

  it("16. Admin updates media", async () => {
    const res = await request("PUT", `/media/${mediaId}`, {
      title: "Titulo atualizado",
      url: "https://youtu.be/newvideo",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Titulo atualizado");
    expect(res.body.type).toBe("youtube");
  });

  it("17. Leader updates own media", async () => {
    const res = await request("PUT", `/media/${leaderMediaId}`, {
      title: "Leader updated",
    }, leaderCk);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Leader updated");
  });

  it("18. Member cannot update → 403", async () => {
    const res = await request("PUT", `/media/${mediaId}`, {
      title: "Hacked",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("19. Update with javascript: URL → 400", async () => {
    const res = await request("PUT", `/media/${mediaId}`, {
      url: "javascript:alert(1)",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("20. Update nonexistent → 404", async () => {
    const res = await request("PUT", "/media/nonexistent-id", {
      title: "X",
    }, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── DELETE ─────────────────────────────────────────────────────────────

  it("21. Member cannot delete → 403", async () => {
    const res = await request("DELETE", `/media/${mediaId}`, undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("22. Leader can delete own media", async () => {
    const res = await request("DELETE", `/media/${leaderMediaId}`, undefined, leaderCk);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removida/);
  });

  it("23. Deleted media not in list", async () => {
    const res = await request("GET", `/media?entityType=event&entityId=${eventId}`, undefined, adminCk);
    const ids = res.body.media.map((m: any) => m.id);
    expect(ids).not.toContain(leaderMediaId);
  });

  it("24. Admin deletes media", async () => {
    const res = await request("DELETE", `/media/${mediaId}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("25. Delete already deleted → 404", async () => {
    const res = await request("DELETE", `/media/${mediaId}`, undefined, adminCk);
    expect(res.status).toBe(404);
  });

  // ─── ENTITY TYPES ──────────────────────────────────────────────────────

  it("26. Create media for course_lesson entityType", async () => {
    const res = await request("POST", "/media", {
      url: "https://youtube.com/watch?v=lesson1",
      entityType: "course_lesson",
      entityId: "fake-lesson-id",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.entityType).toBe("course_lesson");
  });

  it("27. Create media for asset entityType", async () => {
    const res = await request("POST", "/media", {
      url: "https://example.com/manual.pdf",
      entityType: "asset",
      entityId: "fake-asset-id",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.entityType).toBe("asset");
  });
});
