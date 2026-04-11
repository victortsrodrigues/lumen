import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "inst-" + crypto.randomUUID().slice(0, 6);

describe("25-institutional", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let pageId: string;
  let pageSlug: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;
  });

  it("1. Admin creates page → 201", async () => {
    const res = await request("POST", "/pages", {
      title: `Sobre ${P}`, body: "Conteúdo da página sobre.", section: "sobre", isPublished: true,
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`Sobre ${P}`);
    expect(res.body.slug).toBeTruthy();
    expect(res.body.isPublished).toBe(true);
    pageId = res.body.id;
    pageSlug = res.body.slug;
  });

  it("2. Leader cannot create → 403", async () => {
    const res = await request("POST", "/pages", {
      title: "Test", body: "Test", section: "sobre",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("3. Admin lists all pages", async () => {
    const res = await request("GET", "/pages", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.pages.length).toBeGreaterThanOrEqual(1);
  });

  it("4. Public list (no auth) → only published", async () => {
    const res = await request("GET", "/pages/public");
    expect(res.status).toBe(200);
    res.body.pages.forEach((p: any) => expect(p.isPublished).toBe(true));
  });

  it("5. Public page by slug (no auth)", async () => {
    const res = await request("GET", `/pages/public/${pageSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(`Sobre ${P}`);
  });

  it("6. Create unpublished page → not in public list", async () => {
    const res = await request("POST", "/pages", {
      title: `Draft ${P}`, body: "Rascunho", section: "valores", isPublished: false,
    }, adminCk);
    expect(res.status).toBe(201);

    const pub = await request("GET", "/pages/public");
    const titles = pub.body.pages.map((p: any) => p.title);
    expect(titles).not.toContain(`Draft ${P}`);
  });

  it("7. Update page", async () => {
    const res = await request("PUT", `/pages/${pageId}`, {
      body: "Conteúdo atualizado.",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.body).toBe("Conteúdo atualizado.");
  });

  it("8. Admin soft deletes → 200", async () => {
    const cRes = await request("POST", "/pages", {
      title: `Del ${P}`, body: "Delete me", section: "contato",
    }, adminCk);
    const res = await request("DELETE", `/pages/${cRes.body.id}`, undefined, adminCk);
    expect(res.status).toBe(200);
  });

  it("9. Member cannot create → 403", async () => {
    const res = await request("POST", "/pages", {
      title: "Test", body: "Test", section: "sobre",
    }, memberCk);
    expect(res.status).toBe(403);
  });
});
