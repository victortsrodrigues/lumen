import { Router, type IRouter, Request, Response } from "express";
import { db, articlesTable, usersTable } from "@workspace/db";
import { eq, and, isNull, count, desc, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification, notifyRole } from "../lib/notifications.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeArticle(a: typeof articlesTable.$inferSelect) {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    body: a.body,
    excerpt: a.excerpt,
    authorId: a.authorId,
    authorName: a.authorName,
    category: a.category,
    status: a.status,
    reviewerId: a.reviewerId,
    reviewNote: a.reviewNote,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    coverImageUrl: a.coverImageUrl,
    createdAt: a.createdAt?.toISOString(),
    updatedAt: a.updatedAt?.toISOString(),
  };
}

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    + "-" + crypto.randomUUID().slice(0, 4);
}

const VALID_CATEGORIES = ["artigo", "devocional"];

async function getUserName(userId: string): Promise<string> {
  const [user] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user?.name ?? user?.email ?? "Desconhecido";
}

const VALID_STATUSES = ["rascunho", "em_revisao", "aprovado", "publicado", "rejeitado"];

// GET /articles
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const category = req.query.category as string | undefined;
  const status = req.query.status as string | undefined;
  const user = req.user!;

  const baseConditions = [isNull(articlesTable.deletedAt)];
  if (category && VALID_CATEGORIES.includes(category)) {
    baseConditions.push(eq(articlesTable.category, category as any));
  }
  if (status && VALID_STATUSES.includes(status)) {
    baseConditions.push(eq(articlesTable.status, status as any));
  }

  let where;
  if (user.role === "admin") {
    // Admin sees all non-deleted articles
    where = and(...baseConditions);
  } else {
    // Leader and member see own articles + published
    where = and(
      ...baseConditions,
      or(
        eq(articlesTable.authorId, user.userId),
        eq(articlesTable.status, "publicado"),
      ),
    );
  }

  const [articles, [{ total }]] = await Promise.all([
    db.select().from(articlesTable).where(where)
      .orderBy(desc(articlesTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(articlesTable).where(where),
  ]);

  res.json({ articles: articles.map(serializeArticle), total: Number(total), page, limit });
});

// PUT /articles/submit/:id — submit for review (any authenticated — author only; static route before /:id)
router.put("/submit/:id", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(articlesTable)
    .where(and(eq(articlesTable.id, id), isNull(articlesTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Artigo nao encontrado" });
    return;
  }

  if (user.role !== "admin" && existing.authorId !== user.userId) {
    res.status(403).json({ error: "Apenas o autor ou administrador pode submeter este artigo" });
    return;
  }

  if (existing.status !== "rascunho" && existing.status !== "rejeitado") {
    res.status(400).json({ error: "Apenas artigos em rascunho ou rejeitados podem ser submetidos para revisao" });
    return;
  }

  const [updated] = await db.update(articlesTable).set({
    status: "em_revisao",
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(articlesTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "ARTICLE_SUBMITTED",
    resourceType: "article",
    resourceId: id,
    details: { title: existing.title },
    ipAddress: getIp(req),
  });

  // Notify admins that a new article is waiting for review
  await notifyRole("admin", {
    type: "article.submitted",
    title: "Novo artigo para revisão",
    message: `${existing.authorName} enviou "${existing.title}" para revisão.`,
    link: `/articles/${id}`,
    entityType: "article",
    entityId: id,
  });

  res.json(serializeArticle(updated));
});

// PUT /articles/review/:id — approve or reject (admin only, static route before /:id)
router.put("/review/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const { action, note } = req.body;

  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "Acao invalida. Valores: approve, reject" });
    return;
  }

  const [existing] = await db.select().from(articlesTable)
    .where(and(eq(articlesTable.id, id), isNull(articlesTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Artigo nao encontrado" });
    return;
  }

  if (existing.status !== "em_revisao") {
    res.status(400).json({ error: "Apenas artigos em revisao podem ser avaliados" });
    return;
  }

  // Approve = publish immediately (single-step workflow). Reject = mark as rejeitado.
  const newStatus = action === "approve" ? "publicado" : "rejeitado";

  const [updated] = await db.update(articlesTable).set({
    status: newStatus as any,
    reviewerId: user.userId,
    reviewNote: note || null,
    publishedAt: action === "approve" ? new Date() : existing.publishedAt,
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(articlesTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: action === "approve" ? "ARTICLE_APPROVED" : "ARTICLE_REJECTED",
    resourceType: "article",
    resourceId: id,
    details: { title: existing.title, note: note || null },
    ipAddress: getIp(req),
  });

  // Notify the author of the review decision
  if (existing.authorId !== user.userId) {
    await createNotification({
      userId: existing.authorId,
      type: action === "approve" ? "article.approved" : "article.rejected",
      title: action === "approve" ? "Seu artigo foi aprovado!" : "Seu artigo precisa de revisão",
      message: action === "approve"
        ? `"${existing.title}" foi aprovado e publicado.`
        : `"${existing.title}" foi avaliado. Confira o feedback e reenvie após editar.`,
      link: `/articles/${id}`,
      entityType: "article",
      entityId: id,
    });
  }

  res.json(serializeArticle(updated));
});

// PUT /articles/publish/:id — publish (admin only, static route before /:id)
router.put("/publish/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(articlesTable)
    .where(and(eq(articlesTable.id, id), isNull(articlesTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Artigo nao encontrado" });
    return;
  }

  if (existing.status !== "aprovado") {
    res.status(400).json({ error: "Apenas artigos aprovados podem ser publicados" });
    return;
  }

  const [updated] = await db.update(articlesTable).set({
    status: "publicado",
    publishedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(articlesTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "ARTICLE_PUBLISHED",
    resourceType: "article",
    resourceId: id,
    details: { title: existing.title },
    ipAddress: getIp(req),
  });

  res.json(serializeArticle(updated));
});

// GET /articles/:id
router.get("/:id", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [article] = await db.select().from(articlesTable)
    .where(and(eq(articlesTable.id, id), isNull(articlesTable.deletedAt)));

  if (!article) {
    res.status(404).json({ error: "Artigo nao encontrado" });
    return;
  }

  // Visibility rules: admin sees all; everyone else sees own articles OR published
  if (user.role !== "admin") {
    const isOwnArticle = article.authorId === user.userId;
    const isPublished = article.status === "publicado";
    if (!isOwnArticle && !isPublished) {
      res.status(404).json({ error: "Artigo nao encontrado" });
      return;
    }
  }

  res.json(serializeArticle(article));
});

// POST /articles — any authenticated user can create
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { title, body, excerpt, category, coverImageUrl } = req.body;
  const user = req.user!;

  if (!title?.trim()) {
    res.status(400).json({ error: "Titulo e obrigatorio" });
    return;
  }
  if (!body?.trim()) {
    res.status(400).json({ error: "Conteudo do artigo e obrigatorio" });
    return;
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: `Categoria invalida. Valores: ${VALID_CATEGORIES.join(", ")}` });
    return;
  }

  const authorName = await getUserName(user.userId);

  // Member submissions go straight to review; admin can stay in rascunho and publish themselves
  const initialStatus = user.role === "member" ? "em_revisao" : "rascunho";

  const [article] = await db.insert(articlesTable).values({
    title: title.trim(),
    slug: slugify(title.trim()),
    body: body.trim(),
    excerpt: excerpt?.trim() || null,
    authorId: user.userId,
    authorName,
    category: category as any,
    status: initialStatus,
    coverImageUrl: coverImageUrl || null,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "ARTICLE_CREATED",
    resourceType: "article",
    resourceId: article.id,
    details: { title: article.title, category },
    ipAddress: getIp(req),
  });

  // If the article goes straight to review (member submissions), notify all admins
  if (initialStatus === "em_revisao") {
    await notifyRole("admin", {
      type: "article.submitted",
      title: "Novo artigo para revisão",
      message: `${authorName} enviou "${article.title}" para revisão.`,
      link: `/articles/${article.id}`,
      entityType: "article",
      entityId: article.id,
    });
  }

  res.status(201).json(serializeArticle(article));
});

// PUT /articles/:id — any authenticated (author check below)
router.put("/:id", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(articlesTable)
    .where(and(eq(articlesTable.id, id), isNull(articlesTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Artigo nao encontrado" });
    return;
  }

  // Only author or admin can edit
  if (user.role !== "admin" && existing.authorId !== user.userId) {
    res.status(403).json({ error: "Apenas o autor ou administrador pode editar este artigo" });
    return;
  }

  const { title, body, excerpt, category, coverImageUrl } = req.body;
  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };

  if (title !== undefined) updates.title = title.trim();
  if (body !== undefined) updates.body = body.trim();
  if (excerpt !== undefined) updates.excerpt = excerpt?.trim() || null;
  if (category !== undefined) {
    if (!VALID_CATEGORIES.includes(category)) {
      res.status(400).json({ error: `Categoria invalida. Valores: ${VALID_CATEGORIES.join(", ")}` });
      return;
    }
    updates.category = category;
  }
  if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl || null;

  const [updated] = await db.update(articlesTable).set(updates)
    .where(eq(articlesTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "ARTICLE_UPDATED",
    resourceType: "article",
    resourceId: id,
    details: { title: updated.title },
    ipAddress: getIp(req),
  });

  res.json(serializeArticle(updated));
});

// DELETE /articles/:id — soft delete (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(articlesTable)
    .where(and(eq(articlesTable.id, id), isNull(articlesTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Artigo nao encontrado" });
    return;
  }

  await db.update(articlesTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(articlesTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "ARTICLE_DELETED",
    resourceType: "article",
    resourceId: id,
    details: { title: existing.title },
    ipAddress: getIp(req),
  });

  res.json({ message: "Artigo removido com sucesso" });
});

export default router;
