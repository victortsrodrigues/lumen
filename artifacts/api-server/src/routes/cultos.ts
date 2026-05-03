import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  cultosTable,
  cultoSongsTable,
  eventsTable,
  eventAttendanceTable,
  eventSchedulesTable,
  serviceRolesTable,
  songsTable,
  membersTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, gte, isNull, lte, max } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { notifyMember } from "../lib/notifications.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── Serializers ────────────────────────────────────────────────────────────

function serializeCulto(c: typeof cultosTable.$inferSelect, e: typeof eventsTable.$inferSelect) {
  return {
    id: c.id,
    eventId: c.eventId,
    title: e.title,
    startDate: e.startDate?.toISOString(),
    endDate: e.endDate?.toISOString(),
    location: e.location,
    responsibleId: e.responsibleId,
    responsibleName: e.responsibleName,
    status: e.status,
    openingText: c.openingText,
    sermonTitle: c.sermonTitle,
    sermonReference: c.sermonReference,
    sermonNotes: c.sermonNotes,
    hasCommunion: c.hasCommunion,
    hasBaptism: c.hasBaptism,
    hasMemberReception: c.hasMemberReception,
    notes: c.notes,
    createdAt: c.createdAt?.toISOString(),
    updatedAt: c.updatedAt?.toISOString(),
  };
}

function serializeCultoSong(s: typeof cultoSongsTable.$inferSelect) {
  return {
    id: s.id,
    cultoId: s.cultoId,
    songId: s.songId,
    songTitle: s.songTitle,
    order: s.order,
    notes: s.notes,
    createdAt: s.createdAt?.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC ROUTES (must come before /:id)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /cultos/reports/annual
router.get("/reports/annual", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const rows = await db
    .select({
      cultoId: cultosTable.id,
      eventId: cultosTable.eventId,
      title: eventsTable.title,
      startDate: eventsTable.startDate,
      hasCommunion: cultosTable.hasCommunion,
      hasBaptism: cultosTable.hasBaptism,
      hasMemberReception: cultosTable.hasMemberReception,
    })
    .from(cultosTable)
    .innerJoin(eventsTable, eq(eventsTable.id, cultosTable.eventId))
    .where(and(
      isNull(eventsTable.deletedAt),
      gte(eventsTable.startDate, yearStart),
      lte(eventsTable.startDate, yearEnd),
    ))
    .orderBy(asc(eventsTable.startDate));

  // For each culto, compute attendance count and schedule count
  const items = await Promise.all(rows.map(async (r) => {
    const [att] = await db.select({ total: count() })
      .from(eventAttendanceTable)
      .where(and(
        eq(eventAttendanceTable.eventId, r.eventId),
        eq(eventAttendanceTable.present, true),
      ));
    const [sch] = await db.select({ total: count() })
      .from(eventSchedulesTable)
      .where(eq(eventSchedulesTable.eventId, r.eventId));
    return {
      cultoId: r.cultoId,
      eventId: r.eventId,
      title: r.title,
      startDate: r.startDate?.toISOString(),
      hasCommunion: r.hasCommunion,
      hasBaptism: r.hasBaptism,
      hasMemberReception: r.hasMemberReception,
      attendanceCount: Number(att?.total ?? 0),
      scheduledCount: Number(sch?.total ?? 0),
    };
  }));

  const totals = {
    cultos: items.length,
    communions: items.filter(i => i.hasCommunion).length,
    baptisms: items.filter(i => i.hasBaptism).length,
    memberReceptions: items.filter(i => i.hasMemberReception).length,
  };

  res.json({ year, totals, items });
});

// GET /cultos/upcoming — próximos 5 cultos (member-friendly)
router.get("/upcoming", requireAuth, async (_req: Request, res: Response) => {
  const now = new Date();
  const rows = await db
    .select({
      cultoId: cultosTable.id,
      eventId: cultosTable.eventId,
      title: eventsTable.title,
      startDate: eventsTable.startDate,
      location: eventsTable.location,
      hasCommunion: cultosTable.hasCommunion,
    })
    .from(cultosTable)
    .innerJoin(eventsTable, eq(eventsTable.id, cultosTable.eventId))
    .where(and(
      isNull(eventsTable.deletedAt),
      gte(eventsTable.startDate, now),
    ))
    .orderBy(asc(eventsTable.startDate))
    .limit(5);

  res.json({
    items: rows.map(r => ({
      ...r,
      startDate: r.startDate?.toISOString(),
    })),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CULTOS LIST + CREATE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /cultos — listagem com filtros
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const year = req.query.year ? parseInt(req.query.year as string) : undefined;
  const month = req.query.month ? parseInt(req.query.month as string) : undefined;
  const hasCommunion = req.query.hasCommunion === "true";
  const hasBaptism = req.query.hasBaptism === "true";

  const conditions = [isNull(eventsTable.deletedAt)];
  if (year !== undefined) {
    const m = month !== undefined ? month - 1 : 0;
    const start = new Date(year, m, 1);
    const end = month !== undefined
      ? new Date(year, m + 1, 1)
      : new Date(year + 1, 0, 1);
    conditions.push(gte(eventsTable.startDate, start));
    conditions.push(lte(eventsTable.startDate, end));
  }
  if (req.query.hasCommunion !== undefined) conditions.push(eq(cultosTable.hasCommunion, hasCommunion));
  if (req.query.hasBaptism !== undefined) conditions.push(eq(cultosTable.hasBaptism, hasBaptism));

  const where = and(...conditions);

  const rows = await db
    .select()
    .from(cultosTable)
    .innerJoin(eventsTable, eq(eventsTable.id, cultosTable.eventId))
    .where(where)
    .orderBy(desc(eventsTable.startDate))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(cultosTable)
    .innerJoin(eventsTable, eq(eventsTable.id, cultosTable.eventId))
    .where(where);

  // Song counts
  const cultoIds = rows.map(r => r.cultos.id);
  const songCounts = cultoIds.length > 0
    ? await Promise.all(cultoIds.map(async (cid) => {
        const [{ total: t }] = await db.select({ total: count() })
          .from(cultoSongsTable)
          .where(eq(cultoSongsTable.cultoId, cid));
        return { cultoId: cid, count: Number(t) };
      }))
    : [];
  const sm = new Map(songCounts.map(x => [x.cultoId, x.count]));

  res.json({
    cultos: rows.map(r => ({
      ...serializeCulto(r.cultos, r.events),
      songCount: sm.get(r.cultos.id) ?? 0,
    })),
    total: Number(total),
    page,
    limit,
  });
});

// POST /cultos — cria event(type='culto') + culto
router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const {
    title, description, startDate, endDate, location,
    responsibleId, recurrence, maxSlots, status,
    openingText, sermonTitle, sermonReference, sermonNotes,
    hasCommunion, hasBaptism, hasMemberReception, notes,
  } = req.body;

  if (!title || !startDate || !endDate) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: title, startDate, endDate" });
    return;
  }

  // Resolve responsible name
  let responsibleName: string | null = null;
  if (responsibleId) {
    const [m] = await db.select({ fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.id, responsibleId)).limit(1);
    responsibleName = m?.fullName ?? null;
  }

  const result = await db.transaction(async (tx) => {
    const [event] = await tx.insert(eventsTable).values({
      title,
      description: description ?? null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      location: location ?? null,
      responsibleId: responsibleId ?? null,
      responsibleName,
      recurrence: (recurrence ?? "unico") as "unico",
      type: "culto" as const,
      maxSlots: maxSlots ?? null,
      status: (status ?? "agendado") as "agendado",
      createdByUserId: userId,
      updatedByUserId: userId,
    }).returning();

    const [culto] = await tx.insert(cultosTable).values({
      eventId: event.id,
      openingText: openingText ?? null,
      sermonTitle: sermonTitle ?? null,
      sermonReference: sermonReference ?? null,
      sermonNotes: sermonNotes ?? null,
      hasCommunion: !!hasCommunion,
      hasBaptism: !!hasBaptism,
      hasMemberReception: !!hasMemberReception,
      notes: notes ?? null,
      createdByUserId: userId,
      updatedByUserId: userId,
    }).returning();

    return { event, culto };
  });

  if (responsibleId) {
    await notifyMember(responsibleId, {
      type: "culto.assigned",
      title: "Você é responsável por um culto",
      message: `Você foi designado responsável pelo culto "${title}".`,
      link: `/cultos/${result.culto.id}`,
      entityType: "culto",
      entityId: result.culto.id,
    });
  }

  await createAuditLog({
    userId,
    action: "CULTO_CREATED",
    resourceType: "culto",
    resourceId: result.culto.id,
    details: { title, eventId: result.event.id },
    ipAddress: ip,
  });

  res.status(201).json(serializeCulto(result.culto, result.event));
});

// ═══════════════════════════════════════════════════════════════════════════════
// CULTO DETAIL / UPDATE / DELETE
// ═══════════════════════════════════════════════════════════════════════════════

async function loadCulto(cultoId: string) {
  const [row] = await db
    .select()
    .from(cultosTable)
    .innerJoin(eventsTable, eq(eventsTable.id, cultosTable.eventId))
    .where(and(eq(cultosTable.id, cultoId), isNull(eventsTable.deletedAt)))
    .limit(1);
  return row ? { culto: row.cultos, event: row.events } : null;
}

// GET /cultos/:id — detalhe completo
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const loaded = await loadCulto(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Culto não encontrado" });
    return;
  }

  const songs = await db.select().from(cultoSongsTable)
    .where(eq(cultoSongsTable.cultoId, loaded.culto.id))
    .orderBy(asc(cultoSongsTable.order));

  res.json({
    ...serializeCulto(loaded.culto, loaded.event),
    description: loaded.event.description,
    songs: songs.map(serializeCultoSong),
  });
});

// PUT /cultos/:id — atualiza event + culto (transação)
router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const loaded = await loadCulto(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Culto não encontrado" });
    return;
  }

  const {
    title, description, startDate, endDate, location,
    responsibleId, recurrence, maxSlots, status,
    openingText, sermonTitle, sermonReference, sermonNotes,
    hasCommunion, hasBaptism, hasMemberReception, notes,
  } = req.body;

  // Resolve responsible name if changed
  let responsibleName: string | null = loaded.event.responsibleName;
  if (responsibleId !== undefined && responsibleId !== loaded.event.responsibleId) {
    if (responsibleId) {
      const [m] = await db.select({ fullName: membersTable.fullName })
        .from(membersTable).where(eq(membersTable.id, responsibleId)).limit(1);
      responsibleName = m?.fullName ?? null;
    } else {
      responsibleName = null;
    }
  }

  const result = await db.transaction(async (tx) => {
    const eventUpdate: Partial<typeof eventsTable.$inferInsert> = {
      updatedByUserId: userId,
      updatedAt: new Date(),
      type: "culto" as const, // sempre força culto
    };
    if (title !== undefined) eventUpdate.title = title;
    if (description !== undefined) eventUpdate.description = description ?? null;
    if (startDate !== undefined) eventUpdate.startDate = new Date(startDate);
    if (endDate !== undefined) eventUpdate.endDate = new Date(endDate);
    if (location !== undefined) eventUpdate.location = location ?? null;
    if (responsibleId !== undefined) {
      eventUpdate.responsibleId = responsibleId ?? null;
      eventUpdate.responsibleName = responsibleName;
    }
    if (recurrence !== undefined) eventUpdate.recurrence = recurrence;
    if (maxSlots !== undefined) eventUpdate.maxSlots = maxSlots ?? null;
    if (status !== undefined) eventUpdate.status = status;

    const [event] = await tx.update(eventsTable)
      .set(eventUpdate)
      .where(eq(eventsTable.id, loaded.event.id))
      .returning();

    const cultoUpdate: Partial<typeof cultosTable.$inferInsert> = {
      updatedByUserId: userId,
      updatedAt: new Date(),
    };
    if (openingText !== undefined) cultoUpdate.openingText = openingText ?? null;
    if (sermonTitle !== undefined) cultoUpdate.sermonTitle = sermonTitle ?? null;
    if (sermonReference !== undefined) cultoUpdate.sermonReference = sermonReference ?? null;
    if (sermonNotes !== undefined) cultoUpdate.sermonNotes = sermonNotes ?? null;
    if (hasCommunion !== undefined) cultoUpdate.hasCommunion = !!hasCommunion;
    if (hasBaptism !== undefined) cultoUpdate.hasBaptism = !!hasBaptism;
    if (hasMemberReception !== undefined) cultoUpdate.hasMemberReception = !!hasMemberReception;
    if (notes !== undefined) cultoUpdate.notes = notes ?? null;

    const [culto] = await tx.update(cultosTable)
      .set(cultoUpdate)
      .where(eq(cultosTable.id, loaded.culto.id))
      .returning();

    return { event, culto };
  });

  await createAuditLog({
    userId,
    action: "CULTO_UPDATED",
    resourceType: "culto",
    resourceId: result.culto.id,
    details: { title: result.event.title },
    ipAddress: ip,
  });

  res.json(serializeCulto(result.culto, result.event));
});

// DELETE /cultos/:id — soft-delete do event (cultos persiste, filtrado por JOIN)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const loaded = await loadCulto(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Culto não encontrado" });
    return;
  }

  await db.update(eventsTable)
    .set({ deletedAt: new Date(), updatedByUserId: userId, updatedAt: new Date() })
    .where(eq(eventsTable.id, loaded.event.id));

  await createAuditLog({
    userId,
    action: "CULTO_DELETED",
    resourceType: "culto",
    resourceId: loaded.culto.id,
    details: { title: loaded.event.title },
    ipAddress: ip,
  });

  res.json({ message: "Culto excluído" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CULTO SONGS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /cultos/:id/songs — adiciona música (auto-incrementa order)
router.post("/:id/songs", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const loaded = await loadCulto(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Culto não encontrado" });
    return;
  }

  const { songId, notes } = req.body;
  if (!songId) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "songId é obrigatório" });
    return;
  }

  const [song] = await db.select().from(songsTable)
    .where(and(eq(songsTable.id, songId), isNull(songsTable.deletedAt))).limit(1);
  if (!song) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Música não encontrada" });
    return;
  }

  const [maxRow] = await db.select({ maxOrder: max(cultoSongsTable.order) })
    .from(cultoSongsTable)
    .where(eq(cultoSongsTable.cultoId, loaded.culto.id));
  const nextOrder = (maxRow?.maxOrder ?? 0) + 1;

  const [entry] = await db.insert(cultoSongsTable).values({
    cultoId: loaded.culto.id,
    songId,
    songTitle: song.title,
    order: nextOrder,
    notes: notes ?? null,
  }).returning();

  res.status(201).json(serializeCultoSong(entry));
});

// PUT /cultos/:id/songs/reorder
router.put("/:id/songs/reorder", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const loaded = await loadCulto(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Culto não encontrado" });
    return;
  }

  const { songIds } = req.body;
  if (!Array.isArray(songIds)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "songIds deve ser array" });
    return;
  }

  const existing = await db.select({ id: cultoSongsTable.id }).from(cultoSongsTable)
    .where(eq(cultoSongsTable.cultoId, loaded.culto.id));
  const existingIds = new Set(existing.map(e => e.id));
  const providedIds = new Set(songIds);

  if (existingIds.size !== providedIds.size || ![...existingIds].every(id => providedIds.has(id))) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "songIds deve conter exatamente os IDs atuais (sem duplicatas, sem missing)",
    });
    return;
  }

  // Two-phase update: first set negative offsets to avoid UNIQUE collisions
  await db.transaction(async (tx) => {
    for (let i = 0; i < songIds.length; i++) {
      await tx.update(cultoSongsTable)
        .set({ order: -(i + 1) })
        .where(eq(cultoSongsTable.id, songIds[i]));
    }
    for (let i = 0; i < songIds.length; i++) {
      await tx.update(cultoSongsTable)
        .set({ order: i + 1 })
        .where(eq(cultoSongsTable.id, songIds[i]));
    }
  });

  const songs = await db.select().from(cultoSongsTable)
    .where(eq(cultoSongsTable.cultoId, loaded.culto.id))
    .orderBy(asc(cultoSongsTable.order));

  res.json({ songs: songs.map(serializeCultoSong) });
});

// PUT /cultos/:id/songs/:songEntryId — atualiza notes
router.put("/:id/songs/:songEntryId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const loaded = await loadCulto(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Culto não encontrado" });
    return;
  }

  const { notes } = req.body;
  const [updated] = await db.update(cultoSongsTable)
    .set({ notes: notes ?? null })
    .where(and(
      eq(cultoSongsTable.id, req.params.songEntryId),
      eq(cultoSongsTable.cultoId, loaded.culto.id),
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "NOT_FOUND", message: "Entrada de música não encontrada" });
    return;
  }

  res.json(serializeCultoSong(updated));
});

// DELETE /cultos/:id/songs/:songEntryId
router.delete("/:id/songs/:songEntryId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const loaded = await loadCulto(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "NOT_FOUND", message: "Culto não encontrado" });
    return;
  }

  const result = await db.delete(cultoSongsTable)
    .where(and(
      eq(cultoSongsTable.id, req.params.songEntryId),
      eq(cultoSongsTable.cultoId, loaded.culto.id),
    ))
    .returning();

  if (result.length === 0) {
    res.status(404).json({ error: "NOT_FOUND", message: "Entrada de música não encontrada" });
    return;
  }

  res.json({ message: "Música removida" });
});

export default router;
