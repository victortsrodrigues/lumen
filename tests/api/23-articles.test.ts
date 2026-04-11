import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "art-" + crypto.randomUUID().slice(0, 6);

describe("23-articles", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let articleId: string;
  let leaderArticleId: string;
  let articleSlug: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;
  });

  // ─── CREATE ───────────────────────────────────────────────────────────

  it("1. Admin creates article → 201 (auto-generates slug)", async () => {
    const res = await request("POST", "/articles", {
      title: `Devocional da Semana ${P}`,
      body: "Conteúdo do artigo devocional para edificação da igreja.",
      category: "devocional",
      excerpt: "Um breve resumo do devocional",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`Devocional da Semana ${P}`);
    expect(res.body.slug).toBeDefined();
    expect(res.body.slug.length).toBeGreaterThan(0);
    expect(res.body.status).toBe("rascunho");
    expect(res.body.authorName).toBeDefined();
    articleId = res.body.id;
    articleSlug = res.body.slug;
  });

  it("2. Leader creates → 201", async () => {
    const res = await request("POST", "/articles", {
      title: `Estudo Bíblico ${P}`,
      body: "Análise profunda do livro de Romanos.",
      category: "estudo",
    }, leaderCk);
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("estudo");
    leaderArticleId = res.body.id;
  });

  it("3. Member cannot create → 403", async () => {
    const res = await request("POST", "/articles", {
      title: `Teste ${P}`, body: "Conteúdo", category: "devocional",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("4. Missing title → 400", async () => {
    const res = await request("POST", "/articles", {
      body: "Sem título", category: "devocional",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("5. Missing body → 400", async () => {
    const res = await request("POST", "/articles", {
      title: `Sem Body ${P}`, category: "devocional",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("6. Invalid category → 400", async () => {
    const res = await request("POST", "/articles", {
      title: `Cat Inv ${P}`, body: "Conteúdo", category: "invalida",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  // ─── LIST & DETAIL ────────────────────────────────────────────────────

  it("7. List articles", async () => {
    const res = await request("GET", "/articles", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.articles.length).toBeGreaterThanOrEqual(2);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it("8. Article detail", async () => {
    const res = await request("GET", `/articles/${articleId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(articleId);
    expect(res.body.title).toBe(`Devocional da Semana ${P}`);
  });

  // ─── WORKFLOW: SUBMIT → REVIEW → PUBLISH ──────────────────────────────

  it("9. Submit for review (status → em_revisao)", async () => {
    const res = await request("PUT", `/articles/submit/${articleId}`, {}, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("em_revisao");
  });

  it("10. Leader cannot approve → 403", async () => {
    const res = await request("PUT", `/articles/review/${articleId}`, {
      action: "approve",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("11. Admin reviews (approve) → status aprovado", async () => {
    const res = await request("PUT", `/articles/review/${articleId}`, {
      action: "approve",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aprovado");
    expect(res.body.reviewerId).toBeDefined();
  });

  it("12. Admin publishes → status publicado, publishedAt set", async () => {
    const res = await request("PUT", `/articles/publish/${articleId}`, {}, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("publicado");
    expect(res.body.publishedAt).toBeDefined();
  });

  it("13. Reject with note", async () => {
    // Submit leader article first
    await request("PUT", `/articles/submit/${leaderArticleId}`, {}, leaderCk);

    const res = await request("PUT", `/articles/review/${leaderArticleId}`, {
      action: "reject", note: "Precisa de mais embasamento bíblico",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejeitado");
    expect(res.body.reviewNote).toBe("Precisa de mais embasamento bíblico");
  });

  // ─── SLUG UNIQUENESS ─────────────────────────────────────────────────

  it("14. Slug is unique (same title generates different slugs)", async () => {
    const res = await request("POST", "/articles", {
      title: `Devocional da Semana ${P}`,
      body: "Outro artigo com mesmo título.",
      category: "devocional",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.slug).toBeDefined();
    expect(res.body.slug).not.toBe(articleSlug);
  });

  // ─── UPDATE ───────────────────────────────────────────────────────────

  it("15. Update article", async () => {
    const res = await request("PUT", `/articles/${articleId}`, {
      excerpt: "Resumo atualizado do devocional",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.excerpt).toBe("Resumo atualizado do devocional");
  });

  // ─── DELETE ───────────────────────────────────────────────────────────

  it("16. Admin soft deletes", async () => {
    const cRes = await request("POST", "/articles", {
      title: `Del Art ${P}`, body: "Para deletar", category: "informativo",
    }, adminCk);
    const delId = cRes.body.id;

    const res = await request("DELETE", `/articles/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    // Should not appear in list
    const list = await request("GET", "/articles", undefined, adminCk);
    const ids = list.body.articles.map((a: any) => a.id);
    expect(ids).not.toContain(delId);
  });

  it("17. Leader cannot delete → 403", async () => {
    const res = await request("DELETE", `/articles/${articleId}`, undefined, leaderCk);
    expect(res.status).toBe(403);
  });
});
