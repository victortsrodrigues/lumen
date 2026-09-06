import { Router, type IRouter, Request, Response } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc, isNull, isNotNull, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

function serialize(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    entityType: n.entityType,
    entityId: n.entityId,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt?.toISOString(),
  };
}

// GET /notifications — list own notifications (unread first, then recent)
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));

  const rows = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

  // Unread first
  const unread = rows.filter(r => !r.readAt);
  const read = rows.filter(r => r.readAt);
  const sorted = [...unread, ...read];

  res.json({ notifications: sorted.map(serialize) });
});

// GET /notifications/unread-count — number of unread notifications (for badge)
router.get("/unread-count", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const [{ c }] = await db.select({ c: count() }).from(notificationsTable)
    .where(and(
      eq(notificationsTable.userId, userId),
      isNull(notificationsTable.readAt),
    ));
  res.json({ count: Number(c) });
});

// PUT /notifications/read-all — mark all as read (static before dynamic)
router.put("/read-all", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  await db.update(notificationsTable).set({
    readAt: new Date(),
  }).where(and(
    eq(notificationsTable.userId, userId),
    isNull(notificationsTable.readAt),
  ));
  res.json({ message: "Todas as notificações foram marcadas como lidas." });
});

// DELETE /notifications/clear-read — remove all already-read notifications (static before dynamic)
router.delete("/clear-read", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  await db.delete(notificationsTable).where(and(
    eq(notificationsTable.userId, userId),
    isNotNull(notificationsTable.readAt),
  ));
  res.json({ message: "Notificações lidas removidas." });
});

// DELETE /notifications/:id — remove a single notification
router.delete("/:id", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  await db.delete(notificationsTable).where(and(
    eq(notificationsTable.id, id),
    eq(notificationsTable.userId, userId),
  ));
  res.json({ message: "Notificação removida." });
});

// PUT /notifications/:id/read — mark one as read
router.put("/:id/read", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;

  const [existing] = await db.select().from(notificationsTable)
    .where(and(
      eq(notificationsTable.id, id),
      eq(notificationsTable.userId, userId),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Notificação não encontrada" });
    return;
  }

  const [updated] = await db.update(notificationsTable).set({
    readAt: new Date(),
  }).where(eq(notificationsTable.id, id)).returning();

  res.json(serialize(updated));
});

export default router;
