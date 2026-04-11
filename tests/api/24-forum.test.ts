import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "for-" + crypto.randomUUID().slice(0, 6);

describe("24-forum", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let topicId: string;
  let replyId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;
  });

  // ─── CREATE TOPIC ─────────────────────────────────────────────────────

  it("1. Member creates topic → 201", async () => {
    const res = await request("POST", "/forum/topics", {
      title: `Pedido de Oração ${P}`,
      body: "Gostaria de pedir oração pela minha família.",
      category: "oracao",
    }, memberCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`Pedido de Oração ${P}`);
    expect(res.body.category).toBe("oracao");
    expect(res.body.isPinned).toBe(false);
    expect(res.body.isLocked).toBe(false);
    expect(res.body.replyCount).toBe(0);
    expect(res.body.authorName).toBeDefined();
    topicId = res.body.id;
  });

  it("2. Missing fields → 400", async () => {
    const res = await request("POST", "/forum/topics", {
      title: `Sem body ${P}`,
    }, memberCk);
    expect(res.status).toBe(400);
  });

  // ─── LIST TOPICS ──────────────────────────────────────────────────────

  it("3. List topics", async () => {
    const res = await request("GET", "/forum/topics", undefined, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.topics.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  // ─── TOPIC DETAIL ─────────────────────────────────────────────────────

  it("4. Topic detail (empty replies)", async () => {
    const res = await request("GET", `/forum/topics/${topicId}`, undefined, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(topicId);
    expect(res.body.replies).toEqual([]);
    expect(res.body.totalReplies).toBe(0);
  });

  // ─── REPLIES ──────────────────────────────────────────────────────────

  it("5. Member replies → 201, replyCount increments", async () => {
    const res = await request("POST", `/forum/topics/${topicId}/replies`, {
      body: "Estarei orando pela sua família!",
    }, memberCk);
    expect(res.status).toBe(201);
    expect(res.body.topicId).toBe(topicId);
    expect(res.body.authorName).toBeDefined();
    replyId = res.body.id;

    // Verify replyCount incremented
    const detail = await request("GET", `/forum/topics/${topicId}`, undefined, memberCk);
    expect(detail.body.replyCount).toBe(1);
  });

  it("6. Admin replies → 201", async () => {
    const res = await request("POST", `/forum/topics/${topicId}/replies`, {
      body: "A igreja está em oração por vocês.",
    }, adminCk);
    expect(res.status).toBe(201);

    const detail = await request("GET", `/forum/topics/${topicId}`, undefined, adminCk);
    expect(detail.body.replyCount).toBe(2);
  });

  // ─── PIN & LOCK ───────────────────────────────────────────────────────

  it("7. Admin pins topic", async () => {
    const res = await request("PUT", `/forum/topics/pin/${topicId}`, {}, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.isPinned).toBe(true);
  });

  it("8. Member cannot pin → 403", async () => {
    const res = await request("PUT", `/forum/topics/pin/${topicId}`, {}, memberCk);
    expect(res.status).toBe(403);
  });

  it("9. Admin locks topic", async () => {
    const res = await request("PUT", `/forum/topics/lock/${topicId}`, {}, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.isLocked).toBe(true);
  });

  it("10. Reply to locked topic → 403", async () => {
    const res = await request("POST", `/forum/topics/${topicId}/replies`, {
      body: "Tentando responder tópico trancado",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  // Unlock for further tests
  it("11. Admin unlocks topic", async () => {
    const res = await request("PUT", `/forum/topics/lock/${topicId}`, {}, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.isLocked).toBe(false);
  });

  // ─── DELETE REPLY ─────────────────────────────────────────────────────

  it("12. Admin deletes reply → replyCount decrements", async () => {
    const detailBefore = await request("GET", `/forum/topics/${topicId}`, undefined, adminCk);
    const countBefore = detailBefore.body.replyCount;

    const res = await request("DELETE", `/forum/topics/${topicId}/replies/${replyId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    const detailAfter = await request("GET", `/forum/topics/${topicId}`, undefined, adminCk);
    expect(detailAfter.body.replyCount).toBe(countBefore - 1);
  });

  it("13. Member cannot delete reply → 403", async () => {
    // Create a reply to try to delete
    const rRes = await request("POST", `/forum/topics/${topicId}/replies`, {
      body: "Reply para testar delete",
    }, adminCk);
    const adminReplyId = rRes.body.id;

    const res = await request("DELETE", `/forum/topics/${topicId}/replies/${adminReplyId}`, undefined, memberCk);
    expect(res.status).toBe(403);
  });

  // ─── DELETE TOPIC ─────────────────────────────────────────────────────

  it("14. Member cannot delete topic → 403", async () => {
    const res = await request("DELETE", `/forum/topics/${topicId}`, undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("15. Admin soft deletes topic", async () => {
    const cRes = await request("POST", "/forum/topics", {
      title: `Del Topic ${P}`, body: "Para deletar", category: "geral",
    }, memberCk);
    const delId = cRes.body.id;

    const res = await request("DELETE", `/forum/topics/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    // Should not appear in list
    const list = await request("GET", "/forum/topics", undefined, adminCk);
    const ids = list.body.topics.map((t: any) => t.id);
    expect(ids).not.toContain(delId);
  });

  // ─── SUMMARY ──────────────────────────────────────────────────────────

  it("16. Forum summary", async () => {
    const res = await request("GET", "/forum/summary", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalTopics");
    expect(res.body).toHaveProperty("activeThisWeek");
    expect(typeof res.body.totalTopics).toBe("number");
  });
});
