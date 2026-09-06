import { Router, type IRouter, Request, Response } from "express";
import { db, assetsTable, membersTable } from "@workspace/db";
import { eq, and, isNull, count, ilike, or, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { notifyMember } from "../lib/notifications.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeAsset(a: typeof assetsTable.$inferSelect) {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    category: a.category,
    acquisitionDate: a.acquisitionDate,
    acquisitionValue: a.acquisitionValue,
    currentValue: a.currentValue,
    serialNumber: a.serialNumber,
    location: a.location,
    responsibleId: a.responsibleId,
    responsibleName: a.responsibleName,
    status: a.status,
    notes: a.notes,
    photoPath: a.photoPath,
    createdAt: a.createdAt?.toISOString(),
    updatedAt: a.updatedAt?.toISOString(),
  };
}

const VALID_CATEGORIES = ["instrumento", "som_iluminacao", "mobiliario", "informatica", "veiculo", "imovel", "outro"];
const VALID_STATUSES = ["ativo", "manutencao", "baixa", "emprestado"];

// ═══════════════════════════════════════════════════════════════════════════════
// ASSETS CRUD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /assets/summary — must come BEFORE /:id
router.get("/summary", requireAuth, requireRole("admin"), async (_req: Request, res: Response) => {
  const conditions = [isNull(assetsTable.deletedAt)];
  const where = and(...conditions);

  const allAssets = await db.select().from(assetsTable).where(where);

  const totalAssets = allAssets.length;
  const totalValue = allAssets.reduce((sum, a) => sum + (parseFloat(a.currentValue || a.acquisitionValue || "0")), 0);

  const byCategory: Record<string, { count: number; value: number }> = {};
  for (const a of allAssets) {
    if (!byCategory[a.category]) byCategory[a.category] = { count: 0, value: 0 };
    byCategory[a.category].count++;
    byCategory[a.category].value += parseFloat(a.currentValue || a.acquisitionValue || "0");
  }

  res.json({
    totalAssets,
    totalValue: totalValue.toFixed(2),
    byCategory,
  });
});

// GET /assets
router.get("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const category = req.query.category as string | undefined;
  const status = req.query.status as string | undefined;
  const location = req.query.location as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();

  const conditions = [isNull(assetsTable.deletedAt)];
  if (category) conditions.push(eq(assetsTable.category, category as any));
  if (status) conditions.push(eq(assetsTable.status, status as any));
  if (location) conditions.push(ilike(assetsTable.location, `%${location}%`));
  if (search) {
    conditions.push(or(
      ilike(assetsTable.name, `%${search}%`),
      ilike(assetsTable.serialNumber, `%${search}%`),
    )!);
  }

  const where = and(...conditions);

  const [assets, [{ total }]] = await Promise.all([
    db.select().from(assetsTable).where(where)
      .orderBy(assetsTable.name)
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(assetsTable).where(where),
  ]);

  res.json({
    assets: assets.map(serializeAsset),
    total: Number(total),
    page,
    limit,
  });
});

// GET /assets/:id
router.get("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;

  const [asset] = await db.select().from(assetsTable)
    .where(and(eq(assetsTable.id, id), isNull(assetsTable.deletedAt)));

  if (!asset) {
    res.status(404).json({ error: "Bem nao encontrado" });
    return;
  }

  res.json(serializeAsset(asset));
});

// POST /assets
router.post("/", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const {
    name, description, category, acquisitionDate, acquisitionValue,
    currentValue, serialNumber, location, responsibleId, status, notes, photoPath,
  } = req.body;
  const user = req.user!;

  if (!name || !name.trim()) {
    res.status(400).json({ error: "Nome do bem e obrigatorio" });
    return;
  }

  if (!location || !location.trim()) {
    res.status(400).json({ error: "Localizacao e obrigatoria" });
    return;
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: `Categoria invalida. Valores aceitos: ${VALID_CATEGORIES.join(", ")}` });
    return;
  }

  // Resolve responsible name
  let responsibleName: string | null = null;
  if (responsibleId) {
    const [member] = await db.select().from(membersTable)
      .where(eq(membersTable.id, responsibleId)).limit(1);
    if (member) responsibleName = member.fullName;
  }

  const [asset] = await db.insert(assetsTable).values({
    name: name.trim(),
    description: description || null,
    category: category || "outro",
    acquisitionDate: acquisitionDate || null,
    acquisitionValue: acquisitionValue || null,
    currentValue: currentValue || null,
    serialNumber: serialNumber || null,
    location: location.trim(),
    responsibleId: responsibleId || null,
    responsibleName,
    status: status || "ativo",
    notes: notes || null,
    photoPath: photoPath || null,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "ASSET_CREATED",
    resourceType: "asset",
    resourceId: asset.id,
    details: { name: asset.name, category: asset.category, location: asset.location },
    ipAddress: getIp(req),
  });

  if (asset.responsibleId) {
    await notifyMember(asset.responsibleId, {
      type: "asset.assigned",
      title: "Você é responsável por um patrimônio",
      message: `Você foi designado responsável por "${asset.name}".`,
      link: `/assets`,
      entityType: "asset",
      entityId: asset.id,
    });
  }

  res.status(201).json(serializeAsset(asset));
});

// PUT /assets/:id
router.put("/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(assetsTable)
    .where(and(eq(assetsTable.id, id), isNull(assetsTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Bem nao encontrado" });
    return;
  }

  const {
    name, description, category, acquisitionDate, acquisitionValue,
    currentValue, serialNumber, location, responsibleId, status, notes, photoPath,
  } = req.body;

  if (category && !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: `Categoria invalida. Valores aceitos: ${VALID_CATEGORIES.join(", ")}` });
    return;
  }

  const updates: Record<string, any> = {
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  };

  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description || null;
  if (category !== undefined) updates.category = category;
  if (acquisitionDate !== undefined) updates.acquisitionDate = acquisitionDate || null;
  if (acquisitionValue !== undefined) updates.acquisitionValue = acquisitionValue || null;
  if (currentValue !== undefined) updates.currentValue = currentValue || null;
  if (serialNumber !== undefined) updates.serialNumber = serialNumber || null;
  if (location !== undefined) updates.location = location.trim();
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes || null;
  if (photoPath !== undefined) updates.photoPath = photoPath || null;

  // Resolve responsible name if responsibleId changed
  if (responsibleId !== undefined) {
    updates.responsibleId = responsibleId || null;
    if (responsibleId) {
      const [member] = await db.select().from(membersTable)
        .where(eq(membersTable.id, responsibleId)).limit(1);
      updates.responsibleName = member ? member.fullName : null;
    } else {
      updates.responsibleName = null;
    }
  }

  const [updated] = await db.update(assetsTable).set(updates)
    .where(eq(assetsTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "ASSET_UPDATED",
    resourceType: "asset",
    resourceId: id,
    details: { name: updated.name },
    ipAddress: getIp(req),
  });

  if (updated.responsibleId && updated.responsibleId !== existing.responsibleId) {
    await notifyMember(updated.responsibleId, {
      type: "asset.assigned",
      title: "Você é responsável por um patrimônio",
      message: `Você foi designado responsável por "${updated.name}".`,
      link: `/assets`,
      entityType: "asset",
      entityId: updated.id,
    });
  }

  res.json(serializeAsset(updated));
});

// DELETE /assets/:id
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(assetsTable)
    .where(and(eq(assetsTable.id, id), isNull(assetsTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Bem nao encontrado" });
    return;
  }

  await db.update(assetsTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(assetsTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "ASSET_DELETED",
    resourceType: "asset",
    resourceId: id,
    details: { name: existing.name },
    ipAddress: getIp(req),
  });

  res.json({ message: "Bem removido com sucesso" });
});

export default router;
