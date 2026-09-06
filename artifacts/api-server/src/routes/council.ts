import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  councilMeetingsTable,
  councilMeetingItemsTable,
  mediaLinksTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, gte, ilike, isNull, lt, max, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

const VALID_STATUSES = ["agendada", "realizada", "cancelada"] as const;
const VALID_ITEM_STATUSES = ["pendente", "discutida", "decidida"] as const;

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── Serializers ────────────────────────────────────────────────────────────

function serializeMeeting(
  m: typeof councilMeetingsTable.$inferSelect,
  ata?: { id: string; url: string; title: string | null } | null,
) {
  return {
    id: m.id,
    meetingDate: m.meetingDate,
    title: m.title,
    agenda: m.agenda,
    summary: m.summary,
    status: m.status,
    notes: m.notes,
    ataMediaId: ata ? ata.id : null,
    ataTitle: ata ? ata.title : null,
    ataUrl: ata ? ata.url : null,
    createdAt: m.createdAt?.toISOString(),
    updatedAt: m.updatedAt?.toISOString(),
  };
}

function serializeItem(i: typeof councilMeetingItemsTable.$inferSelect) {
  return {
    id: i.id,
    meetingId: i.meetingId,
    order: i.order,
    title: i.title,
    description: i.description,
    status: i.status,
    resolution: i.resolution,
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    createdAt: i.createdAt?.toISOString(),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadMeetingWithAta(id: string) {
  const [row] = await db
    .select()
    .from(councilMeetingsTable)
    .leftJoin(
      mediaLinksTable,
      and(
        eq(mediaLinksTable.id, councilMeetingsTable.ataMediaId),
        isNull(mediaLinksTable.deletedAt),
      ),
    )
    .where(and(
      eq(councilMeetingsTable.id, id),
      isNull(councilMeetingsTable.deletedAt),
    ))
    .limit(1);

  if (!row) return null;

  const ata = row.media_links?.id
    ? { id: row.media_links.id, url: row.media_links.url, title: row.media_links.title }
    : null;

  return { meeting: row.council_meetings, ata };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC ROUTES (must come before /:id)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /council/upcoming — próximas 5 reuniões agendadas
router.get("/upcoming", requireAuth, requireRole("admin"), async (_req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select()
    .from(councilMeetingsTable)
    .where(and(
      isNull(councilMeetingsTable.deletedAt),
      eq(councilMeetingsTable.status, "agendada"),
      gte(councilMeetingsTable.meetingDate, today),
    ))
    .orderBy(asc(councilMeetingsTable.meetingDate))
    .limit(5);

  res.json({ items: rows.map(m => serializeMeeting(m)) });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIST + CREATE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /council
router.get("/", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const year = req.query.year ? parseInt(req.query.year as string) : undefined;
  const status = req.query.status as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();

  const conditions = [isNull(councilMeetingsTable.deletedAt)];

  if (year !== undefined && !Number.isNaN(year)) {
    conditions.push(gte(councilMeetingsTable.meetingDate, `${year}-01-01`));
    conditions.push(lt(councilMeetingsTable.meetingDate, `${year + 1}-01-01`));
  }
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(councilMeetingsTable.status, status as "agendada"));
  }
  if (search) {
    conditions.push(or(
      ilike(councilMeetingsTable.title, `%${search}%`),
      ilike(councilMeetingsTable.agenda, `%${search}%`),
      ilike(councilMeetingsTable.summary, `%${search}%`),
    )!);
  }

  const where = and(...conditions);

  const [meetings, [{ total }]] = await Promise.all([
    db.select().from(councilMeetingsTable)
      .where(where)
      .orderBy(desc(councilMeetingsTable.meetingDate))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(councilMeetingsTable).where(where),
  ]);

  // Item counts per meeting
  const meetingIds = meetings.map(m => m.id);
  const itemCounts = meetingIds.length > 0
    ? await Promise.all(meetingIds.map(async (mid) => {
        const [{ total: t }] = await db.select({ total: count() })
          .from(councilMeetingItemsTable)
          .where(eq(councilMeetingItemsTable.meetingId, mid));
        return { meetingId: mid, count: Number(t) };
      }))
    : [];
  const counts = new Map(itemCounts.map(c => [c.meetingId, c.count]));

  res.json({
    meetings: meetings.map(m => ({ ...serializeMeeting(m), itemCount: counts.get(m.id) ?? 0 })),
    total: Number(total),
    page,
    limit,
  });
});

// POST /council
router.post("/", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { meetingDate, title, agenda, summary, ataMediaId, status, notes } = req.body;

  if (!meetingDate || !title) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: meetingDate, title" });
    return;
  }
  if (status && !(VALID_STATUSES as readonly string[]).includes(status)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: `Status inválido. Aceitos: ${VALID_STATUSES.join(", ")}` });
    return;
  }
  if (ataMediaId) {
    const [m] = await db.select({ id: mediaLinksTable.id })
      .from(mediaLinksTable)
      .where(and(eq(mediaLinksTable.id, ataMediaId), isNull(mediaLinksTable.deletedAt)))
      .limit(1);
    if (!m) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Mídia da ata não encontrada" });
      return;
    }
  }

  const [meeting] = await db.insert(councilMeetingsTable).values({
    meetingDate,
    title,
    agenda: agenda ?? null,
    summary: summary ?? null,
    ataMediaId: ataMediaId ?? null,
    status: (status ?? "agendada") as "agendada",
    notes: notes ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  await createAuditLog({
    userId,
    action: "COUNCIL_MEETING_CREATED",
    resourceType: "council_meeting",
    resourceId: meeting.id,
    details: { title, meetingDate },
    ipAddress: ip,
  });

  const loaded = await loadMeetingWithAta(meeting.id);
  res.status(201).json(loaded ? serializeMeeting(loaded.meeting, loaded.ata) : serializeMeeting(meeting));
});

// ═══════════════════════════════════════════════════════════════════════════════
// DETAIL / UPDATE / DELETE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /council/:id — detalhe completo com items + ata
router.get("/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const loaded = await loadMeetingWithAta(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Reunião não encontrada" });
    return;
  }

  const items = await db.select().from(councilMeetingItemsTable)
    .where(eq(councilMeetingItemsTable.meetingId, loaded.meeting.id))
    .orderBy(asc(councilMeetingItemsTable.order));

  res.json({
    ...serializeMeeting(loaded.meeting, loaded.ata),
    items: items.map(serializeItem),
  });
});

// PUT /council/:id
router.put("/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const loaded = await loadMeetingWithAta(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Reunião não encontrada" });
    return;
  }

  const { meetingDate, title, agenda, summary, ataMediaId, status, notes } = req.body;

  if (status !== undefined && !(VALID_STATUSES as readonly string[]).includes(status)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: `Status inválido. Aceitos: ${VALID_STATUSES.join(", ")}` });
    return;
  }
  if (ataMediaId) {
    const [m] = await db.select({ id: mediaLinksTable.id })
      .from(mediaLinksTable)
      .where(and(eq(mediaLinksTable.id, ataMediaId), isNull(mediaLinksTable.deletedAt)))
      .limit(1);
    if (!m) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Mídia da ata não encontrada" });
      return;
    }
  }

  const update: Partial<typeof councilMeetingsTable.$inferInsert> = {
    updatedByUserId: userId,
    updatedAt: new Date(),
  };
  if (meetingDate !== undefined) update.meetingDate = meetingDate;
  if (title !== undefined) update.title = title;
  if (agenda !== undefined) update.agenda = agenda ?? null;
  if (summary !== undefined) update.summary = summary ?? null;
  if (ataMediaId !== undefined) update.ataMediaId = ataMediaId ?? null;
  if (status !== undefined) update.status = status;
  if (notes !== undefined) update.notes = notes ?? null;

  await db.update(councilMeetingsTable).set(update)
    .where(eq(councilMeetingsTable.id, loaded.meeting.id));

  await createAuditLog({
    userId,
    action: "COUNCIL_MEETING_UPDATED",
    resourceType: "council_meeting",
    resourceId: loaded.meeting.id,
    ipAddress: ip,
  });

  const reloaded = await loadMeetingWithAta(loaded.meeting.id);
  res.json(reloaded ? serializeMeeting(reloaded.meeting, reloaded.ata) : null);
});

// DELETE /council/:id (soft delete)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const loaded = await loadMeetingWithAta(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Reunião não encontrada" });
    return;
  }

  await db.update(councilMeetingsTable)
    .set({ deletedAt: new Date(), updatedByUserId: userId, updatedAt: new Date() })
    .where(eq(councilMeetingsTable.id, loaded.meeting.id));

  await createAuditLog({
    userId,
    action: "COUNCIL_MEETING_DELETED",
    resourceType: "council_meeting",
    resourceId: loaded.meeting.id,
    ipAddress: ip,
  });

  res.json({ message: "Reunião excluída" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEETING ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /council/:id/items
router.post("/:id/items", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const loaded = await loadMeetingWithAta(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Reunião não encontrada" });
    return;
  }

  const { title, description, status, resolution } = req.body;
  if (!title) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "title é obrigatório" });
    return;
  }
  const finalStatus = (status ?? "pendente") as "pendente" | "discutida" | "decidida";
  if (!(VALID_ITEM_STATUSES as readonly string[]).includes(finalStatus)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: `Status inválido. Aceitos: ${VALID_ITEM_STATUSES.join(", ")}` });
    return;
  }
  if (finalStatus === "decidida" && (!resolution || !resolution.trim())) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "resolution é obrigatório quando status=decidida" });
    return;
  }

  const [maxRow] = await db.select({ maxOrder: max(councilMeetingItemsTable.order) })
    .from(councilMeetingItemsTable)
    .where(eq(councilMeetingItemsTable.meetingId, loaded.meeting.id));
  const nextOrder = (maxRow?.maxOrder ?? 0) + 1;

  const [item] = await db.insert(councilMeetingItemsTable).values({
    meetingId: loaded.meeting.id,
    order: nextOrder,
    title,
    description: description ?? null,
    status: finalStatus,
    resolution: resolution ?? null,
    resolvedAt: finalStatus === "decidida" ? new Date() : null,
  }).returning();

  res.status(201).json(serializeItem(item));
});

// PUT /council/:id/items/reorder
router.put("/:id/items/reorder", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const loaded = await loadMeetingWithAta(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Reunião não encontrada" });
    return;
  }

  const { itemIds } = req.body;
  if (!Array.isArray(itemIds)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "itemIds deve ser array" });
    return;
  }

  const existing = await db.select({ id: councilMeetingItemsTable.id })
    .from(councilMeetingItemsTable)
    .where(eq(councilMeetingItemsTable.meetingId, loaded.meeting.id));
  const existingIds = new Set(existing.map(e => e.id));
  const providedIds = new Set(itemIds);

  if (existingIds.size !== providedIds.size || ![...existingIds].every(id => providedIds.has(id))) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "itemIds deve conter exatamente os IDs atuais (sem duplicatas, sem missing)",
    });
    return;
  }

  // Two-phase update: negative offsets evita colisão com UNIQUE(meetingId, order)
  await db.transaction(async (tx) => {
    for (let i = 0; i < itemIds.length; i++) {
      await tx.update(councilMeetingItemsTable)
        .set({ order: -(i + 1) })
        .where(eq(councilMeetingItemsTable.id, itemIds[i]));
    }
    for (let i = 0; i < itemIds.length; i++) {
      await tx.update(councilMeetingItemsTable)
        .set({ order: i + 1 })
        .where(eq(councilMeetingItemsTable.id, itemIds[i]));
    }
  });

  const items = await db.select().from(councilMeetingItemsTable)
    .where(eq(councilMeetingItemsTable.meetingId, loaded.meeting.id))
    .orderBy(asc(councilMeetingItemsTable.order));
  res.json({ items: items.map(serializeItem) });
});

// PUT /council/:id/items/:itemId
router.put("/:id/items/:itemId", requireAuth, requireRole("admin"), async (req: Request<{ id: string; itemId: string }>, res: Response) => {
  const loaded = await loadMeetingWithAta(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Reunião não encontrada" });
    return;
  }

  const [existing] = await db.select().from(councilMeetingItemsTable)
    .where(and(
      eq(councilMeetingItemsTable.id, req.params.itemId),
      eq(councilMeetingItemsTable.meetingId, loaded.meeting.id),
    )).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Item não encontrado" });
    return;
  }

  const { title, description, status, resolution } = req.body;

  if (status !== undefined && !(VALID_ITEM_STATUSES as readonly string[]).includes(status)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: `Status inválido. Aceitos: ${VALID_ITEM_STATUSES.join(", ")}` });
    return;
  }

  // Determinar novo status efetivo
  const newStatus = (status ?? existing.status) as "pendente" | "discutida" | "decidida";
  const newResolution = resolution !== undefined ? resolution : existing.resolution;

  if (newStatus === "decidida" && (!newResolution || !String(newResolution).trim())) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "resolution é obrigatório quando status=decidida" });
    return;
  }

  const update: Partial<typeof councilMeetingItemsTable.$inferInsert> = {};
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description ?? null;
  if (status !== undefined) {
    update.status = status;
    // Transição lifecycle: para decidida → seta resolvedAt; voltando → zera
    if (status === "decidida" && existing.status !== "decidida") {
      update.resolvedAt = new Date();
    } else if (status !== "decidida" && existing.status === "decidida") {
      update.resolvedAt = null;
    }
  }
  if (resolution !== undefined) update.resolution = resolution ?? null;

  const [updated] = await db.update(councilMeetingItemsTable)
    .set(update)
    .where(eq(councilMeetingItemsTable.id, existing.id))
    .returning();

  res.json(serializeItem(updated));
});

// DELETE /council/:id/items/:itemId
router.delete("/:id/items/:itemId", requireAuth, requireRole("admin"), async (req: Request<{ id: string; itemId: string }>, res: Response) => {
  const loaded = await loadMeetingWithAta(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Reunião não encontrada" });
    return;
  }

  const result = await db.delete(councilMeetingItemsTable)
    .where(and(
      eq(councilMeetingItemsTable.id, req.params.itemId),
      eq(councilMeetingItemsTable.meetingId, loaded.meeting.id),
    ))
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "NOT_FOUND", message: "Item não encontrado" });
    return;
  }
  res.json({ message: "Item removido" });
});

export default router;
