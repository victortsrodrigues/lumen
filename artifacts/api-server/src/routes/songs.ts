import { Router, type IRouter, Request, Response } from "express";
import { db, songsTable, songSuggestionsTable, membersTable } from "@workspace/db";
import { eq, and, isNull, count, desc, ilike } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification, notifyRole } from "../lib/notifications.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeSong(s: typeof songsTable.$inferSelect) {
  return {
    id: s.id,
    title: s.title,
    author: s.author,
    songKey: s.songKey,
    tempo: s.tempo,
    lyrics: s.lyrics,
    chordChart: s.chordChart,
    category: s.category,
    youtubeUrl: s.youtubeUrl,
    createdAt: s.createdAt?.toISOString(),
    updatedAt: s.updatedAt?.toISOString(),
    createdByUserId: s.createdByUserId,
    updatedByUserId: s.updatedByUserId,
  };
}

function serializeSuggestion(s: typeof songSuggestionsTable.$inferSelect) {
  return {
    id: s.id,
    songId: s.songId,
    title: s.title,
    url: s.url,
    reason: s.reason,
    status: s.status,
    reviewedByUserId: s.reviewedByUserId,
    reviewNote: s.reviewNote,
    createdAt: s.createdAt?.toISOString(),
    updatedAt: s.updatedAt?.toISOString(),
  };
}

// =============================================================================
// SONGS CRUD
// =============================================================================

// GET /songs
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;

  const conditions = [isNull(songsTable.deletedAt)];
  if (search) conditions.push(ilike(songsTable.title, `%${search}%`));
  if (category) conditions.push(eq(songsTable.category, category as "louvor"));

  const where = and(...conditions);

  const [songs, [{ total }]] = await Promise.all([
    db.select().from(songsTable).where(where)
      .orderBy(desc(songsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(songsTable).where(where),
  ]);

  res.json({
    songs: songs.map(serializeSong),
    total: Number(total),
    page,
    limit,
  });
});

// GET /songs/suggestions — static route BEFORE /:id
router.get("/suggestions", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const role = req.user!.role;
  const conditions: any[] = [];

  if (role !== "admin" && role !== "leader") {
    // Member sees only own suggestions
    const [member] = await db.select({ id: membersTable.id })
      .from(membersTable).where(eq(membersTable.email, req.user!.email)).limit(1);

    if (!member) {
      res.json({ suggestions: [], total: 0, page, limit });
      return;
    }
    conditions.push(eq(songSuggestionsTable.suggestedByMemberId, member.id));
  }

  const status = req.query.status as string | undefined;
  if (status) conditions.push(eq(songSuggestionsTable.status, status as "pendente"));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [suggestions, [{ total }]] = await Promise.all([
    db.select().from(songSuggestionsTable).where(where)
      .orderBy(desc(songSuggestionsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(songSuggestionsTable).where(where),
  ]);

  res.json({
    suggestions: suggestions.map(serializeSuggestion),
    total: Number(total),
    page,
    limit,
  });
});

// POST /songs/suggestions — static route BEFORE /:id
router.post("/suggestions", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { title, url, reason } = req.body;

  if (!title || !url || !reason) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: título, link e justificativa" });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Link inválido. Envie uma URL do YouTube ou Spotify." });
    return;
  }

  // Find member by user email
  const [member] = await db.select({ id: membersTable.id, fullName: membersTable.fullName })
    .from(membersTable).where(eq(membersTable.email, req.user!.email)).limit(1);

  const [suggestion] = await db.insert(songSuggestionsTable).values({
    title,
    url,
    suggestedByMemberId: member?.id ?? null,
    suggestedByUserId: userId,
    suggestedByName: member?.fullName ?? req.user!.email,
    reason,
  }).returning();

  await createAuditLog({
    userId,
    action: "SONG_SUGGESTION_CREATED",
    resourceType: "song_suggestion",
    resourceId: suggestion.id,
    details: { title },
    ipAddress: ip,
  });

  await notifyRole("admin", {
    type: "song.suggested",
    title: "Nova sugestão de música",
    message: `${suggestion.suggestedByName} sugeriu "${title}".`,
    link: `/songs`,
    entityType: "song_suggestion",
    entityId: suggestion.id,
  });

  res.status(201).json(serializeSuggestion(suggestion));
});

// PUT /songs/suggestions/:id — static route BEFORE /:id
router.put("/suggestions/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(songSuggestionsTable)
    .where(eq(songSuggestionsTable.id, req.params.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Sugestão não encontrada" });
    return;
  }

  const { status, reviewNote } = req.body;

  if (!status || !["aprovada", "rejeitada"].includes(status)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Status deve ser 'aprovada' ou 'rejeitada'" });
    return;
  }

  const [updated] = await db.update(songSuggestionsTable).set({
    status: status as "aprovada",
    reviewedByUserId: userId,
    reviewNote: reviewNote ?? null,
    updatedAt: new Date(),
  }).where(eq(songSuggestionsTable.id, req.params.id)).returning();

  // On approval, auto-create the song record with the suggested title + url
  if (status === "aprovada") {
    await db.insert(songsTable).values({
      title: updated.title,
      youtubeUrl: updated.url || null,
      createdByUserId: userId,
      updatedByUserId: userId,
    });
  }

  await createAuditLog({
    userId,
    action: "SONG_SUGGESTION_REVIEWED",
    resourceType: "song_suggestion",
    resourceId: updated.id,
    details: { title: updated.title, status, reviewNote },
    ipAddress: ip,
  });

  // Notify the suggesting user
  if (updated.suggestedByUserId) {
    await createNotification({
      userId: updated.suggestedByUserId,
      type: status === "aprovada" ? "song.suggestion.approved" : "song.suggestion.rejected",
      title: status === "aprovada" ? "Sugestão de música aprovada" : "Sugestão de música rejeitada",
      message: status === "aprovada"
        ? `Sua sugestão "${updated.title}" foi aprovada e adicionada à biblioteca.`
        : `Sua sugestão "${updated.title}" foi rejeitada.${reviewNote ? ` Motivo: ${reviewNote}` : ""}`,
      link: `/songs`,
      entityType: "song_suggestion",
      entityId: updated.id,
    });
  }

  res.json(serializeSuggestion(updated));
});

// GET /songs/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const [song] = await db.select().from(songsTable)
    .where(and(eq(songsTable.id, req.params.id), isNull(songsTable.deletedAt)))
    .limit(1);

  if (!song) {
    res.status(404).json({ error: "NOT_FOUND", message: "Música não encontrada" });
    return;
  }

  res.json(serializeSong(song));
});

// POST /songs — admin/leader: cadastrar música (título + link)
router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { title, youtubeUrl } = req.body;

  if (!title || !youtubeUrl) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: título e link" });
    return;
  }

  try {
    new URL(youtubeUrl);
  } catch {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Link inválido." });
    return;
  }

  const [song] = await db.insert(songsTable).values({
    title,
    youtubeUrl,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  await createAuditLog({
    userId,
    action: "SONG_CREATED",
    resourceType: "song",
    resourceId: song.id,
    details: { title },
    ipAddress: ip,
  });

  res.status(201).json(serializeSong(song));
});

// PUT /songs/:id
router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(songsTable)
    .where(and(eq(songsTable.id, req.params.id), isNull(songsTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Música não encontrada" });
    return;
  }

  const { title, youtubeUrl } = req.body;

  const [updated] = await db.update(songsTable).set({
    title: title ?? existing.title,
    youtubeUrl: youtubeUrl !== undefined ? youtubeUrl : existing.youtubeUrl,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(songsTable.id, req.params.id)).returning();

  await createAuditLog({
    userId,
    action: "SONG_UPDATED",
    resourceType: "song",
    resourceId: updated.id,
    details: { title: updated.title },
    ipAddress: ip,
  });

  res.json(serializeSong(updated));
});

// DELETE /songs/:id (soft delete)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(songsTable)
    .where(and(eq(songsTable.id, req.params.id), isNull(songsTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Música não encontrada" });
    return;
  }

  await db.update(songsTable)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(songsTable.id, req.params.id));

  await createAuditLog({
    userId,
    action: "SONG_DELETED",
    resourceType: "song",
    resourceId: existing.id,
    details: { title: existing.title },
    ipAddress: ip,
  });

  res.json({ message: "Música excluída com sucesso" });
});

export default router;
