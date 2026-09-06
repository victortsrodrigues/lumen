import { Router, type IRouter, Request, Response } from "express";
import { db, contentsTable, mediaLinksTable } from "@workspace/db";
import { eq, and, isNull, count, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { mediaAccessCondition } from "../lib/mediaAccess.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeContent(c: typeof contentsTable.$inferSelect) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    createdAt: c.createdAt?.toISOString(),
    updatedAt: c.updatedAt?.toISOString(),
  };
}

const VALID_CATEGORIES = ["pequenos_grupos", "devocionais", "escola_biblica", "esboco_sermao", "estudo_biblico"];
const CATEGORY_LABELS: Record<string, string> = {
  pequenos_grupos: "Pequenos Grupos",
  devocionais: "Devocionais",
  escola_biblica: "Escola Bíblica",
  esboco_sermao: "Esboço de Sermão",
  estudo_biblico: "Estudo Bíblico",
};

// GET /contents
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const category = req.query.category as string | undefined;

  const conditions = [isNull(contentsTable.deletedAt)];
  if (category) conditions.push(eq(contentsTable.category, category as any));

  const where = and(...conditions);

  const [contents, [{ total }]] = await Promise.all([
    db.select().from(contentsTable).where(where)
      .orderBy(desc(contentsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(contentsTable).where(where),
  ]);

  // Get media count for each content
  const enriched = await Promise.all(contents.map(async (c) => {
    const [{ mediaCount }] = await db.select({ mediaCount: count() })
      .from(mediaLinksTable)
      .where(and(
        eq(mediaLinksTable.entityType, "content"),
        eq(mediaLinksTable.entityId, c.id),
        mediaAccessCondition(req.user!.role),
      ));
    return { ...serializeContent(c), mediaCount: Number(mediaCount) };
  }));

  res.json({ contents: enriched, total: Number(total), page, limit });
});

// GET /contents/:id
router.get("/:id", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;

  const [content] = await db.select().from(contentsTable)
    .where(and(eq(contentsTable.id, id), isNull(contentsTable.deletedAt)));

  if (!content) {
    res.status(404).json({ error: "Conteudo nao encontrado" });
    return;
  }

  res.json(serializeContent(content));
});

// POST /contents
router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { title, description, category } = req.body;
  const user = req.user!;

  if (!title?.trim()) {
    res.status(400).json({ error: "Titulo e obrigatorio" });
    return;
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: `Categoria invalida. Valores: ${VALID_CATEGORIES.join(", ")}` });
    return;
  }

  const [content] = await db.insert(contentsTable).values({
    title: title.trim(),
    description: description || null,
    category: category as any,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "CONTENT_CREATED",
    resourceType: "content",
    resourceId: content.id,
    details: { title: content.title, category },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeContent(content));
});

// PUT /contents/:id
router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(contentsTable)
    .where(and(eq(contentsTable.id, id), isNull(contentsTable.deletedAt)));
  if (!existing) {
    res.status(404).json({ error: "Conteudo nao encontrado" });
    return;
  }

  const { title, description, category } = req.body;
  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };

  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description || null;
  if (category !== undefined) updates.category = category;

  const [updated] = await db.update(contentsTable).set(updates)
    .where(eq(contentsTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "CONTENT_UPDATED",
    resourceType: "content",
    resourceId: id,
    details: { title: updated.title },
    ipAddress: getIp(req),
  });

  res.json(serializeContent(updated));
});

// DELETE /contents/:id
router.delete("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(contentsTable)
    .where(and(eq(contentsTable.id, id), isNull(contentsTable.deletedAt)));
  if (!existing) {
    res.status(404).json({ error: "Conteudo nao encontrado" });
    return;
  }

  await db.update(contentsTable).set({
    deletedAt: new Date(), updatedByUserId: user.userId, updatedAt: new Date(),
  }).where(eq(contentsTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "CONTENT_DELETED",
    resourceType: "content",
    resourceId: id,
    details: { title: existing.title },
    ipAddress: getIp(req),
  });

  res.json({ message: "Conteudo removido com sucesso" });
});

export default router;
