import { Router, type IRouter, Request, Response } from "express";
import { db, forumTopicsTable, forumRepliesTable, usersTable } from "@workspace/db";
import { eq, and, isNull, count, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

const VALID_CATEGORIES = ["geral", "oracao", "estudo", "testemunho", "duvida"];

function serializeTopic(t: typeof forumTopicsTable.$inferSelect) {
  return {
    id: t.id,
    title: t.title,
    body: t.body,
    authorId: t.authorId,
    authorName: t.authorName,
    category: t.category,
    isPinned: t.isPinned,
    isLocked: t.isLocked,
    replyCount: t.replyCount,
    lastReplyAt: t.lastReplyAt?.toISOString() ?? null,
    createdAt: t.createdAt?.toISOString(),
    updatedAt: t.updatedAt?.toISOString(),
  };
}

function serializeReply(r: typeof forumRepliesTable.$inferSelect) {
  return {
    id: r.id,
    topicId: r.topicId,
    body: r.body,
    authorId: r.authorId,
    authorName: r.authorName,
    createdAt: r.createdAt?.toISOString(),
    updatedAt: r.updatedAt?.toISOString(),
  };
}

async function getUserName(userId: string): Promise<string> {
  const [user] = await db.select({ name: usersTable.name }).from(usersTable)
    .where(eq(usersTable.id, userId)).limit(1);
  return user?.name ?? "Desconhecido";
}

// =============================================================================
// SUMMARY (static route first)
// =============================================================================

router.get("/summary", requireAuth, async (req: Request, res: Response) => {
  const [totalResult] = await db.select({ c: count() }).from(forumTopicsTable)
    .where(isNull(forumTopicsTable.deletedAt));

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [activeResult] = await db.select({ c: count() }).from(forumTopicsTable)
    .where(and(
      isNull(forumTopicsTable.deletedAt),
      sql`(${forumTopicsTable.lastReplyAt} >= ${oneWeekAgo} OR ${forumTopicsTable.createdAt} >= ${oneWeekAgo})`,
    ));

  res.json({
    totalTopics: totalResult.c,
    activeThisWeek: activeResult.c,
  });
});

// =============================================================================
// LIST TOPICS
// =============================================================================

router.get("/topics", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const conditions = [isNull(forumTopicsTable.deletedAt)];

  const { category, search, pinned } = req.query;
  if (category && VALID_CATEGORIES.includes(category as string)) {
    conditions.push(eq(forumTopicsTable.category, category as any));
  }
  if (search && typeof search === "string" && search.trim()) {
    conditions.push(sql`(${forumTopicsTable.title} ILIKE ${'%' + search.trim() + '%'} OR ${forumTopicsTable.body} ILIKE ${'%' + search.trim() + '%'})`);
  }
  if (pinned === "true") {
    conditions.push(eq(forumTopicsTable.isPinned, true));
  }

  const where = and(...conditions);

  const [{ c: total }] = await db.select({ c: count() }).from(forumTopicsTable).where(where);

  const topics = await db.select().from(forumTopicsTable)
    .where(where)
    .orderBy(
      desc(forumTopicsTable.isPinned),
      desc(sql`COALESCE(${forumTopicsTable.lastReplyAt}, ${forumTopicsTable.createdAt})`),
    )
    .limit(limit).offset(offset);

  res.json({
    topics: topics.map(serializeTopic),
    total,
    page,
    limit,
  });
});

// =============================================================================
// PIN TOPIC (static before dynamic)
// =============================================================================

router.put("/topics/pin/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [topic] = await db.select().from(forumTopicsTable)
    .where(and(eq(forumTopicsTable.id, id), isNull(forumTopicsTable.deletedAt))).limit(1);
  if (!topic) return res.status(404).json({ error: "NOT_FOUND", message: "Topico nao encontrado" });

  const [updated] = await db.update(forumTopicsTable).set({
    isPinned: !topic.isPinned,
    updatedAt: new Date(),
  }).where(eq(forumTopicsTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: updated.isPinned ? "forum.topic.pin" : "forum.topic.unpin",
    resourceType: "forum_topic",
    resourceId: id,
    ipAddress: getIp(req),
  });

  res.json(serializeTopic(updated));
});

// =============================================================================
// LOCK TOPIC (static before dynamic)
// =============================================================================

router.put("/topics/lock/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [topic] = await db.select().from(forumTopicsTable)
    .where(and(eq(forumTopicsTable.id, id), isNull(forumTopicsTable.deletedAt))).limit(1);
  if (!topic) return res.status(404).json({ error: "NOT_FOUND", message: "Topico nao encontrado" });

  const [updated] = await db.update(forumTopicsTable).set({
    isLocked: !topic.isLocked,
    updatedAt: new Date(),
  }).where(eq(forumTopicsTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: updated.isLocked ? "forum.topic.lock" : "forum.topic.unlock",
    resourceType: "forum_topic",
    resourceId: id,
    ipAddress: getIp(req),
  });

  res.json(serializeTopic(updated));
});

// =============================================================================
// TOPIC DETAIL (with paginated replies)
// =============================================================================

router.get("/topics/:id", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  const [topic] = await db.select().from(forumTopicsTable)
    .where(and(eq(forumTopicsTable.id, id), isNull(forumTopicsTable.deletedAt))).limit(1);
  if (!topic) return res.status(404).json({ error: "NOT_FOUND", message: "Topico nao encontrado" });

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const [{ c: totalReplies }] = await db.select({ c: count() }).from(forumRepliesTable)
    .where(and(eq(forumRepliesTable.topicId, id), isNull(forumRepliesTable.deletedAt)));

  const replies = await db.select().from(forumRepliesTable)
    .where(and(eq(forumRepliesTable.topicId, id), isNull(forumRepliesTable.deletedAt)))
    .orderBy(desc(forumRepliesTable.createdAt))
    .limit(limit).offset(offset);

  res.json({
    ...serializeTopic(topic),
    replies: replies.map(serializeReply),
    totalReplies,
    repliesPage: page,
    repliesLimit: limit,
  });
});

// =============================================================================
// CREATE TOPIC
// =============================================================================

router.post("/topics", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  const { title, body, category } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatorios: title, body" });
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Categoria invalida. Valores aceitos: " + VALID_CATEGORIES.join(", ") });
  }

  const authorName = await getUserName(user.userId);

  const [created] = await db.insert(forumTopicsTable).values({
    title,
    body,
    authorId: user.userId,
    authorName,
    category: category || "geral",
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "forum.topic.create",
    resourceType: "forum_topic",
    resourceId: created.id,
    details: { title, category: category || "geral" },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeTopic(created));
});

// =============================================================================
// UPDATE TOPIC
// =============================================================================

router.put("/topics/:id", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [topic] = await db.select().from(forumTopicsTable)
    .where(and(eq(forumTopicsTable.id, id), isNull(forumTopicsTable.deletedAt))).limit(1);
  if (!topic) return res.status(404).json({ error: "NOT_FOUND", message: "Topico nao encontrado" });

  // Only author or admin can edit
  if (topic.authorId !== user.userId && user.role !== "admin") {
    return res.status(403).json({ error: "FORBIDDEN", message: "Sem permissao para editar este topico" });
  }

  const { title, body } = req.body;

  const updates: Record<string, any> = { updatedAt: new Date(), updatedByUserId: user.userId };
  if (title) updates.title = title;
  if (body) updates.body = body;

  const [updated] = await db.update(forumTopicsTable).set(updates)
    .where(eq(forumTopicsTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "forum.topic.update",
    resourceType: "forum_topic",
    resourceId: id,
    ipAddress: getIp(req),
  });

  res.json(serializeTopic(updated));
});

// =============================================================================
// DELETE TOPIC (soft delete — admin only)
// =============================================================================

router.delete("/topics/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [topic] = await db.select().from(forumTopicsTable)
    .where(and(eq(forumTopicsTable.id, id), isNull(forumTopicsTable.deletedAt))).limit(1);
  if (!topic) return res.status(404).json({ error: "NOT_FOUND", message: "Topico nao encontrado" });

  await db.update(forumTopicsTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(forumTopicsTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "forum.topic.delete",
    resourceType: "forum_topic",
    resourceId: id,
    ipAddress: getIp(req),
  });

  res.json({ message: "Topico removido" });
});

// =============================================================================
// CREATE REPLY
// =============================================================================

router.post("/topics/:id/replies", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [topic] = await db.select().from(forumTopicsTable)
    .where(and(eq(forumTopicsTable.id, id), isNull(forumTopicsTable.deletedAt))).limit(1);
  if (!topic) return res.status(404).json({ error: "NOT_FOUND", message: "Topico nao encontrado" });

  if (topic.isLocked) {
    return res.status(403).json({ error: "FORBIDDEN", message: "Este topico esta trancado e nao aceita novas respostas" });
  }

  const { body } = req.body;
  if (!body) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Campo obrigatorio: body" });
  }

  const authorName = await getUserName(user.userId);

  const [reply] = await db.insert(forumRepliesTable).values({
    topicId: id,
    body,
    authorId: user.userId,
    authorName,
    createdByUserId: user.userId,
  }).returning();

  // Increment replyCount and set lastReplyAt
  await db.update(forumTopicsTable).set({
    replyCount: sql`${forumTopicsTable.replyCount} + 1`,
    lastReplyAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(forumTopicsTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "forum.reply.create",
    resourceType: "forum_reply",
    resourceId: reply.id,
    details: { topicId: id },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeReply(reply));
});

// =============================================================================
// UPDATE REPLY
// =============================================================================

router.put("/topics/:id/replies/:replyId", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id, replyId } = req.params;

  const [reply] = await db.select().from(forumRepliesTable)
    .where(and(
      eq(forumRepliesTable.id, replyId),
      eq(forumRepliesTable.topicId, id),
      isNull(forumRepliesTable.deletedAt),
    )).limit(1);
  if (!reply) return res.status(404).json({ error: "NOT_FOUND", message: "Resposta nao encontrada" });

  // Only author or admin can edit
  if (reply.authorId !== user.userId && user.role !== "admin") {
    return res.status(403).json({ error: "FORBIDDEN", message: "Sem permissao para editar esta resposta" });
  }

  const { body } = req.body;
  if (!body) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Campo obrigatorio: body" });
  }

  const [updated] = await db.update(forumRepliesTable).set({
    body,
    updatedAt: new Date(),
    updatedByUserId: user.userId,
  }).where(eq(forumRepliesTable.id, replyId)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "forum.reply.update",
    resourceType: "forum_reply",
    resourceId: replyId,
    details: { topicId: id },
    ipAddress: getIp(req),
  });

  res.json(serializeReply(updated));
});

// =============================================================================
// DELETE REPLY (soft delete — admin only)
// =============================================================================

router.delete("/topics/:id/replies/:replyId", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id, replyId } = req.params;

  const [reply] = await db.select().from(forumRepliesTable)
    .where(and(
      eq(forumRepliesTable.id, replyId),
      eq(forumRepliesTable.topicId, id),
      isNull(forumRepliesTable.deletedAt),
    )).limit(1);
  if (!reply) return res.status(404).json({ error: "NOT_FOUND", message: "Resposta nao encontrada" });

  await db.update(forumRepliesTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(forumRepliesTable.id, replyId));

  // Decrement replyCount
  await db.update(forumTopicsTable).set({
    replyCount: sql`GREATEST(${forumTopicsTable.replyCount} - 1, 0)`,
    updatedAt: new Date(),
  }).where(eq(forumTopicsTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "forum.reply.delete",
    resourceType: "forum_reply",
    resourceId: replyId,
    details: { topicId: id },
    ipAddress: getIp(req),
  });

  res.json({ message: "Resposta removida" });
});

export default router;
