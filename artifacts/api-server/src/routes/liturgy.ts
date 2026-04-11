import { Router, type IRouter, Request, Response } from "express";
import { db, liturgiesTable, liturgyItemsTable, membersTable, songsTable } from "@workspace/db";
import { eq, and, isNull, count, desc, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeLiturgy(l: typeof liturgiesTable.$inferSelect) {
  return {
    id: l.id,
    title: l.title,
    date: l.date,
    type: l.type,
    eventId: l.eventId,
    status: l.status,
    notes: l.notes,
    createdAt: l.createdAt?.toISOString(),
    updatedAt: l.updatedAt?.toISOString(),
    createdByUserId: l.createdByUserId,
    updatedByUserId: l.updatedByUserId,
  };
}

function serializeLiturgyItem(i: typeof liturgyItemsTable.$inferSelect) {
  return {
    id: i.id,
    liturgyId: i.liturgyId,
    order: i.order,
    type: i.type,
    title: i.title,
    description: i.description,
    responsibleMemberId: i.responsibleMemberId,
    responsibleName: i.responsibleName,
    durationMinutes: i.durationMinutes,
    songId: i.songId,
    createdAt: i.createdAt?.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LITURGIES CRUD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /liturgies
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const role = req.user!.role;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const type = req.query.type as string | undefined;
  const status = req.query.status as string | undefined;

  const conditions = [isNull(liturgiesTable.deletedAt)];

  // Members can only see approved liturgies
  if (role === "member") {
    conditions.push(eq(liturgiesTable.status, "aprovada"));
  }

  if (type) conditions.push(eq(liturgiesTable.type, type as "culto_dominical"));
  if (status && role !== "member") conditions.push(eq(liturgiesTable.status, status as "rascunho"));

  const where = and(...conditions);

  const [liturgies, [{ total }]] = await Promise.all([
    db.select().from(liturgiesTable).where(where)
      .orderBy(desc(liturgiesTable.date))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(liturgiesTable).where(where),
  ]);

  res.json({
    liturgies: liturgies.map(serializeLiturgy),
    total: Number(total),
    page,
    limit,
  });
});

// GET /liturgies/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const role = req.user!.role;

  const [liturgy] = await db.select().from(liturgiesTable)
    .where(and(eq(liturgiesTable.id, req.params.id), isNull(liturgiesTable.deletedAt)))
    .limit(1);

  if (!liturgy) {
    res.status(404).json({ error: "NOT_FOUND", message: "Liturgia não encontrada" });
    return;
  }

  // Members can only see approved liturgies
  if (role === "member" && liturgy.status !== "aprovada") {
    res.status(404).json({ error: "NOT_FOUND", message: "Liturgia não encontrada" });
    return;
  }

  const items = await db.select().from(liturgyItemsTable)
    .where(eq(liturgyItemsTable.liturgyId, liturgy.id))
    .orderBy(asc(liturgyItemsTable.order));

  res.json({
    ...serializeLiturgy(liturgy),
    items: items.map(serializeLiturgyItem),
  });
});

// POST /liturgies
router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { title, date, type, eventId, status, notes } = req.body;

  if (!title || !date || !type) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: título, data, tipo" });
    return;
  }

  // Only admin can set status to "aprovada"
  const finalStatus = (status === "aprovada" && req.user!.role !== "admin") ? "rascunho" : (status ?? "rascunho");

  const [liturgy] = await db.insert(liturgiesTable).values({
    title,
    date,
    type: type as "culto_dominical",
    eventId: eventId ?? null,
    status: finalStatus as "rascunho",
    notes: notes ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  await createAuditLog({
    userId,
    action: "LITURGY_CREATED",
    resourceType: "liturgy",
    resourceId: liturgy.id,
    details: { title, type },
    ipAddress: ip,
  });

  res.status(201).json(serializeLiturgy(liturgy));
});

// PUT /liturgies/:id
router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  const [existing] = await db.select().from(liturgiesTable)
    .where(and(eq(liturgiesTable.id, req.params.id), isNull(liturgiesTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Liturgia não encontrada" });
    return;
  }

  const { title, date, type, eventId, status, notes } = req.body;

  // Only admin can set status to "aprovada"
  let finalStatus = status ?? existing.status;
  if (status === "aprovada" && role !== "admin") {
    res.status(403).json({ error: "FORBIDDEN", message: "Apenas administradores podem aprovar liturgias" });
    return;
  }

  const [updated] = await db.update(liturgiesTable).set({
    title: title ?? existing.title,
    date: date ?? existing.date,
    type: type ?? existing.type,
    eventId: eventId !== undefined ? eventId : existing.eventId,
    status: finalStatus as "rascunho",
    notes: notes !== undefined ? notes : existing.notes,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(liturgiesTable.id, req.params.id)).returning();

  await createAuditLog({
    userId,
    action: "LITURGY_UPDATED",
    resourceType: "liturgy",
    resourceId: updated.id,
    details: { title: updated.title, status: finalStatus },
    ipAddress: ip,
  });

  res.json(serializeLiturgy(updated));
});

// DELETE /liturgies/:id (soft delete)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(liturgiesTable)
    .where(and(eq(liturgiesTable.id, req.params.id), isNull(liturgiesTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Liturgia não encontrada" });
    return;
  }

  await db.update(liturgiesTable)
    .set({ deletedAt: new Date(), updatedAt: new Date(), updatedByUserId: userId })
    .where(eq(liturgiesTable.id, req.params.id));

  await createAuditLog({
    userId,
    action: "LITURGY_DELETED",
    resourceType: "liturgy",
    resourceId: existing.id,
    details: { title: existing.title },
    ipAddress: ip,
  });

  res.json({ message: "Liturgia excluída com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LITURGY ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

// PUT /liturgies/:id/items/reorder (STATIC — must be before /:id/items/:itemId)
router.put("/:id/items/reorder", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [liturgy] = await db.select().from(liturgiesTable)
    .where(and(eq(liturgiesTable.id, req.params.id), isNull(liturgiesTable.deletedAt)))
    .limit(1);

  if (!liturgy) {
    res.status(404).json({ error: "NOT_FOUND", message: "Liturgia não encontrada" });
    return;
  }

  const { itemIds } = req.body as { itemIds: string[] };
  if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "itemIds é obrigatório (array de IDs)" });
    return;
  }

  // Update order based on array position
  await Promise.all(
    itemIds.map((itemId, index) =>
      db.update(liturgyItemsTable)
        .set({ order: index + 1 })
        .where(and(
          eq(liturgyItemsTable.id, itemId),
          eq(liturgyItemsTable.liturgyId, liturgy.id),
        ))
    )
  );

  await createAuditLog({
    userId,
    action: "LITURGY_ITEMS_REORDERED",
    resourceType: "liturgy",
    resourceId: liturgy.id,
    details: { itemCount: itemIds.length },
    ipAddress: ip,
  });

  // Return updated items
  const items = await db.select().from(liturgyItemsTable)
    .where(eq(liturgyItemsTable.liturgyId, liturgy.id))
    .orderBy(asc(liturgyItemsTable.order));

  res.json({ items: items.map(serializeLiturgyItem) });
});

// POST /liturgies/:id/items
router.post("/:id/items", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [liturgy] = await db.select().from(liturgiesTable)
    .where(and(eq(liturgiesTable.id, req.params.id), isNull(liturgiesTable.deletedAt)))
    .limit(1);

  if (!liturgy) {
    res.status(404).json({ error: "NOT_FOUND", message: "Liturgia não encontrada" });
    return;
  }

  const { type, title, description, responsibleMemberId, durationMinutes, songId } = req.body;

  if (!type || !title) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: tipo, título" });
    return;
  }

  // Auto-set order to max+1
  const [maxOrder] = await db.select({ maxOrd: count() })
    .from(liturgyItemsTable)
    .where(eq(liturgyItemsTable.liturgyId, liturgy.id));
  const nextOrder = Number(maxOrder?.maxOrd ?? 0) + 1;

  // Lookup responsible member name
  let responsibleName: string | null = null;
  if (responsibleMemberId) {
    const [member] = await db.select({ fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.id, responsibleMemberId)).limit(1);
    responsibleName = member?.fullName ?? null;
  }

  // Lookup song title if songId provided
  let resolvedTitle = title;
  if (songId) {
    const [song] = await db.select({ title: songsTable.title })
      .from(songsTable).where(eq(songsTable.id, songId)).limit(1);
    if (song && type === "louvor") {
      // Keep the provided title, but we could enrich it
    }
  }

  const [item] = await db.insert(liturgyItemsTable).values({
    liturgyId: liturgy.id,
    order: nextOrder,
    type: type as "louvor",
    title: resolvedTitle,
    description: description ?? null,
    responsibleMemberId: responsibleMemberId ?? null,
    responsibleName,
    durationMinutes: durationMinutes ?? null,
    songId: songId ?? null,
  }).returning();

  await createAuditLog({
    userId,
    action: "LITURGY_ITEM_CREATED",
    resourceType: "liturgy_item",
    resourceId: item.id,
    details: { liturgyId: liturgy.id, type, title },
    ipAddress: ip,
  });

  res.status(201).json(serializeLiturgyItem(item));
});

// PUT /liturgies/:id/items/:itemId
router.put("/:id/items/:itemId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(liturgyItemsTable)
    .where(and(
      eq(liturgyItemsTable.id, req.params.itemId),
      eq(liturgyItemsTable.liturgyId, req.params.id),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Item da liturgia não encontrado" });
    return;
  }

  const { type, title, description, responsibleMemberId, durationMinutes, songId, order } = req.body;

  // Lookup responsible member name if changed
  let responsibleName = existing.responsibleName;
  if (responsibleMemberId !== undefined && responsibleMemberId !== existing.responsibleMemberId) {
    if (responsibleMemberId) {
      const [member] = await db.select({ fullName: membersTable.fullName })
        .from(membersTable).where(eq(membersTable.id, responsibleMemberId)).limit(1);
      responsibleName = member?.fullName ?? null;
    } else {
      responsibleName = null;
    }
  }

  const updates: Record<string, any> = {};
  if (type !== undefined) updates.type = type;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description || null;
  if (responsibleMemberId !== undefined) {
    updates.responsibleMemberId = responsibleMemberId || null;
    updates.responsibleName = responsibleName;
  }
  if (durationMinutes !== undefined) updates.durationMinutes = durationMinutes;
  if (songId !== undefined) updates.songId = songId || null;
  if (order !== undefined) updates.order = order;

  const [updated] = await db.update(liturgyItemsTable).set(updates)
    .where(eq(liturgyItemsTable.id, req.params.itemId)).returning();

  await createAuditLog({
    userId,
    action: "LITURGY_ITEM_UPDATED",
    resourceType: "liturgy_item",
    resourceId: updated.id,
    details: { liturgyId: req.params.id, title: updated.title },
    ipAddress: ip,
  });

  res.json(serializeLiturgyItem(updated));
});

// DELETE /liturgies/:id/items/:itemId
router.delete("/:id/items/:itemId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(liturgyItemsTable)
    .where(and(
      eq(liturgyItemsTable.id, req.params.itemId),
      eq(liturgyItemsTable.liturgyId, req.params.id),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Item da liturgia não encontrado" });
    return;
  }

  await db.delete(liturgyItemsTable).where(eq(liturgyItemsTable.id, req.params.itemId));

  await createAuditLog({
    userId,
    action: "LITURGY_ITEM_DELETED",
    resourceType: "liturgy_item",
    resourceId: existing.id,
    details: { liturgyId: req.params.id, title: existing.title },
    ipAddress: ip,
  });

  res.json({ message: "Item da liturgia removido com sucesso" });
});

export default router;
