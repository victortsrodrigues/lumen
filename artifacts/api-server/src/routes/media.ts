import { Router, type IRouter, Request, Response } from "express";
import { db, mediaLinksTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { mediaAccessCondition } from "../lib/mediaAccess.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeMedia(m: typeof mediaLinksTable.$inferSelect) {
  return {
    id: m.id,
    url: m.url,
    title: m.title,
    type: m.type,
    entityType: m.entityType,
    entityId: m.entityId,
    createdByUserId: m.createdByUserId,
    createdAt: m.createdAt?.toISOString(),
    updatedAt: m.updatedAt?.toISOString(),
  };
}

// ─── URL Validation ──────────────────────────────────────────────────────────

function isValidMediaUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith("javascript:")) return false;
  if (trimmed.startsWith("data:")) return false;
  if (trimmed.startsWith("file:")) return false;
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return false;
  return true;
}

function isValidHttpsUrl(url: string): boolean {
  try {
    return new URL(url.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Auto-detect media type ──────────────────────────────────────────────────

function detectMediaType(url: string): "youtube" | "vimeo" | "drive" | "link" | "outro" {
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("vimeo.com")) return "vimeo";
  if (lower.includes("drive.google.com")) return "drive";
  if (lower.endsWith(".mp4") || lower.endsWith(".webm")) return "link";
  return "outro";
}

const VALID_ENTITY_TYPES = ["course_lesson", "course", "ministry", "event", "asset", "content", "council_meeting"];

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIA CRUD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /media?entityType=xxx&entityId=xxx
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const entityType = req.query.entityType as string | undefined;
  const entityId = req.query.entityId as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  const conditions = [mediaAccessCondition(req.user!.role)];
  if (entityType) conditions.push(eq(mediaLinksTable.entityType, entityType as any));
  if (entityId) conditions.push(eq(mediaLinksTable.entityId, entityId));

  const where = and(...conditions);

  const [items, [{ total }]] = await Promise.all([
    db.select().from(mediaLinksTable).where(where)
      .orderBy(mediaLinksTable.createdAt)
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(mediaLinksTable).where(where),
  ]);

  res.json({
    media: items.map(serializeMedia),
    total: Number(total),
    page,
    limit,
  });
});

// POST /media
router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { url, title, entityType, entityId } = req.body;
  const user = req.user!;

  if (!url || !entityType || !entityId) {
    res.status(400).json({ error: "url, entityType e entityId sao obrigatorios" });
    return;
  }

  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    res.status(400).json({ error: `entityType invalido. Valores aceitos: ${VALID_ENTITY_TYPES.join(", ")}` });
    return;
  }

  if (entityType === "council_meeting" && user.role !== "admin") {
    res.status(403).json({ error: "Sem permissao para gerenciar atas do Conselho" });
    return;
  }

  if (!isValidMediaUrl(url)) {
    res.status(400).json({ error: "URL invalida. Deve comecar com http:// ou https://. URLs javascript:, data: e file: nao sao permitidas." });
    return;
  }

  if (entityType === "council_meeting" && !isValidHttpsUrl(url)) {
    res.status(400).json({ error: "A URL da ata deve comecar com https://." });
    return;
  }

  const type = detectMediaType(url);

  const [media] = await db.insert(mediaLinksTable).values({
    url: url.trim(),
    title: title || null,
    type,
    entityType: entityType as any,
    entityId,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "MEDIA_CREATED",
    resourceType: "media_link",
    resourceId: media.id,
    details: { url, entityType, entityId, detectedType: type },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeMedia(media));
});

// PUT /media/:id
router.put("/:id", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const accessibleMedia = and(eq(mediaLinksTable.id, id), mediaAccessCondition(user.role));
  const [existing] = await db.select().from(mediaLinksTable)
    .where(accessibleMedia);

  if (!existing) {
    res.status(404).json({ error: "Midia nao encontrada" });
    return;
  }

  // Council media has already been restricted to administrators above.
  // Other media: admin, leader, or creator.
  if (user.role !== "admin" && user.role !== "leader" && existing.createdByUserId !== user.userId) {
    res.status(403).json({ error: "Sem permissao para editar esta midia" });
    return;
  }

  const { url, title } = req.body;

  if (url !== undefined && !isValidMediaUrl(url)) {
    res.status(400).json({ error: "URL invalida. Deve comecar com http:// ou https://. URLs javascript:, data: e file: nao sao permitidas." });
    return;
  }

  if (url !== undefined && existing.entityType === "council_meeting" && !isValidHttpsUrl(url)) {
    res.status(400).json({ error: "A URL da ata deve comecar com https://." });
    return;
  }

  const updates: Record<string, any> = {
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  };

  if (url !== undefined) {
    updates.url = url.trim();
    updates.type = detectMediaType(url);
  }
  if (title !== undefined) updates.title = title || null;

  const [updated] = await db.update(mediaLinksTable).set(updates)
    .where(accessibleMedia).returning();

  if (!updated) {
    res.status(404).json({ error: "Midia nao encontrada" });
    return;
  }

  await createAuditLog({
    userId: user.userId,
    action: "MEDIA_UPDATED",
    resourceType: "media_link",
    resourceId: id,
    details: { url, title },
    ipAddress: getIp(req),
  });

  res.json(serializeMedia(updated));
});

// DELETE /media/:id
router.delete("/:id", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const accessibleMedia = and(eq(mediaLinksTable.id, id), mediaAccessCondition(user.role));
  const [existing] = await db.select().from(mediaLinksTable)
    .where(accessibleMedia);

  if (!existing) {
    res.status(404).json({ error: "Midia nao encontrada" });
    return;
  }

  // Council media has already been restricted to administrators above.
  // Other media: admin or creator.
  if (user.role !== "admin" && existing.createdByUserId !== user.userId) {
    res.status(403).json({ error: "Sem permissao para deletar esta midia" });
    return;
  }

  const [deleted] = await db.update(mediaLinksTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(accessibleMedia).returning({ id: mediaLinksTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Midia nao encontrada" });
    return;
  }

  await createAuditLog({
    userId: user.userId,
    action: "MEDIA_DELETED",
    resourceType: "media_link",
    resourceId: id,
    details: { url: existing.url, entityType: existing.entityType, entityId: existing.entityId },
    ipAddress: getIp(req),
  });

  res.json({ message: "Midia removida com sucesso" });
});

export default router;
