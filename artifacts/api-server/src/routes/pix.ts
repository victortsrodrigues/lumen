import { Router, type IRouter, Request, Response } from "express";
import { db, pixConfigTable, pixDonationsTable } from "@workspace/db";
import { eq, and, isNull, count, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { generatePixPayload } from "../lib/pix.js";

const router: IRouter = Router();

// ─── HELPERS ────────────────────────────────────────────────────────────────

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeConfig(c: typeof pixConfigTable.$inferSelect): Record<string, unknown> {
  return {
    id: c.id,
    pixKey: c.pixKey,
    pixKeyType: c.pixKeyType,
    recipientName: c.recipientName,
    city: c.city,
    institution: c.institution,
    qrCodeImageUrl: c.qrCodeImageUrl,
    isActive: c.isActive,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    createdByUserId: c.createdByUserId,
  };
}

function serializeDonation(d: typeof pixDonationsTable.$inferSelect): Record<string, unknown> {
  return {
    id: d.id,
    amount: d.amount == null ? "0.00" : String(d.amount),
    donorName: d.donorName,
    donorEmail: d.donorEmail,
    memberId: d.memberId,
    pixConfigId: d.pixConfigId,
    txId: d.txId,
    status: d.status,
    confirmedByUserId: d.confirmedByUserId,
    confirmedAt: d.confirmedAt,
    notes: d.notes,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// ─── PIX CONFIG ─────────────────────────────────────────────────────────────

// GET /config — admin only: get active config
router.get("/config", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const [config] = await db
      .select()
      .from(pixConfigTable)
      .where(eq(pixConfigTable.isActive, true))
      .limit(1);

    if (!config) {
      res.status(404).json({ error: "Nenhuma configuração PIX ativa encontrada." });
      return;
    }

    res.json(serializeConfig(config));
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar configuração PIX." });
  }
});

// POST /config — admin only: create config
router.post("/config", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { pixKey, pixKeyType, recipientName, city, institution, qrCodeImageUrl } = req.body;

    if (!pixKey || !pixKeyType || !recipientName || !city) {
      res.status(400).json({ error: "Campos obrigatórios: pixKey, pixKeyType, recipientName, city." });
      return;
    }

    // Deactivate any existing active config
    await db
      .update(pixConfigTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pixConfigTable.isActive, true));

    const [config] = await db
      .insert(pixConfigTable)
      .values({
        pixKey,
        pixKeyType,
        recipientName,
        city,
        institution: institution || null,
        qrCodeImageUrl: qrCodeImageUrl || null,
        isActive: true,
        createdByUserId: (req as any).user.userId,
      })
      .returning();

    await createAuditLog({
      userId: (req as any).user.userId,
      action: "pix_config.create",
      resourceType: "pix_config",
      resourceId: config.id,
      details: { pixKeyType },
      ipAddress: getIp(req),
    });

    res.status(201).json(serializeConfig(config));
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar configuração PIX." });
  }
});

// PUT /config/:id — admin only: update config
router.put("/config/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { pixKey, pixKeyType, recipientName, city, institution, qrCodeImageUrl, isActive } = req.body;

    const [existing] = await db
      .select()
      .from(pixConfigTable)
      .where(eq(pixConfigTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Configuração PIX não encontrada." });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (pixKey !== undefined) updates.pixKey = pixKey;
    if (pixKeyType !== undefined) updates.pixKeyType = pixKeyType;
    if (recipientName !== undefined) updates.recipientName = recipientName;
    if (city !== undefined) updates.city = city;
    if (institution !== undefined) updates.institution = institution || null;
    if (qrCodeImageUrl !== undefined) updates.qrCodeImageUrl = qrCodeImageUrl || null;
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db
      .update(pixConfigTable)
      .set(updates)
      .where(eq(pixConfigTable.id, id))
      .returning();

    await createAuditLog({
      userId: (req as any).user.userId,
      action: "pix_config.update",
      resourceType: "pix_config",
      resourceId: id,
      details: { fields: Object.keys(updates).filter(k => k !== "updatedAt") },
      ipAddress: getIp(req),
    });

    res.json(serializeConfig(updated));
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar configuração PIX." });
  }
});

// ─── PUBLIC / AUTHENTICATED INFO ENDPOINTS ──────────────────────────────────

// GET /info — authenticated: full info for members' Contribuições page
router.get("/info", requireAuth, async (_req: Request, res: Response) => {
  try {
    const [config] = await db
      .select()
      .from(pixConfigTable)
      .where(eq(pixConfigTable.isActive, true))
      .limit(1);

    if (!config) {
      res.status(404).json({ error: "PIX não configurado para esta igreja." });
      return;
    }

    res.json({
      pixKey: config.pixKey,
      pixKeyType: config.pixKeyType,
      recipientName: config.recipientName,
      city: config.city,
      institution: config.institution,
      qrCodeImageUrl: config.qrCodeImageUrl,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar informações PIX." });
  }
});

// GET /donate — NO AUTH: returns public PIX info for QR code generation
router.get("/donate", async (_req: Request, res: Response) => {
  try {
    const [config] = await db
      .select()
      .from(pixConfigTable)
      .where(eq(pixConfigTable.isActive, true))
      .limit(1);

    if (!config) {
      res.status(404).json({ error: "PIX não configurado para esta igreja." });
      return;
    }

    res.json({
      pixKey: config.pixKey,
      recipientName: config.recipientName,
      city: config.city,
      institution: config.institution,
      qrCodeImageUrl: config.qrCodeImageUrl,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar informações de doação." });
  }
});

// POST /donate — NO AUTH: register donation intent
router.post("/donate", async (req: Request, res: Response) => {
  try {
    const { amount, donorName, donorEmail } = req.body;

    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ error: "Valor da doação deve ser maior que zero." });
      return;
    }

    const [config] = await db
      .select()
      .from(pixConfigTable)
      .where(eq(pixConfigTable.isActive, true))
      .limit(1);

    if (!config) {
      res.status(404).json({ error: "PIX não configurado para esta igreja." });
      return;
    }

    const txId = "PIX" + crypto.randomUUID().slice(0, 8);

    const pixPayload = generatePixPayload({
      pixKey: config.pixKey,
      recipientName: config.recipientName,
      city: config.city,
      amount: Number(amount),
      txId,
    });

    const [donation] = await db
      .insert(pixDonationsTable)
      .values({
        amount: String(amount),
        donorName: donorName || null,
        donorEmail: donorEmail || null,
        pixConfigId: config.id,
        txId,
        status: "pendente",
      })
      .returning();

    res.status(201).json({
      id: donation.id,
      txId: donation.txId,
      amount: String(donation.amount),
      pixPayload,
      status: donation.status,
      createdAt: donation.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao registrar intenção de doação." });
  }
});

// ─── DONATIONS MANAGEMENT ───────────────────────────────────────────────────

// GET /donations — admin, leader: list donations
router.get("/donations", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    const conditions = [];
    if (status && typeof status === "string") {
      conditions.push(eq(pixDonationsTable.status, status as any));
    }

    const donations = await db
      .select()
      .from(pixDonationsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(pixDonationsTable.createdAt));

    const [{ c: total }] = await db.select({ c: count() }).from(pixDonationsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      donations: donations.map(serializeDonation),
      total,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar doações PIX." });
  }
});

// PUT /donations/confirm/:id — admin only: confirm donation (static before dynamic)
router.put("/donations/confirm/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const [donation] = await db
      .select()
      .from(pixDonationsTable)
      .where(eq(pixDonationsTable.id, id))
      .limit(1);

    if (!donation) {
      res.status(404).json({ error: "Doação não encontrada." });
      return;
    }

    if (donation.status !== "pendente") {
      res.status(400).json({ error: `Doação não pode ser confirmada. Status atual: ${donation.status}.` });
      return;
    }

    const [updated] = await db
      .update(pixDonationsTable)
      .set({
        status: "confirmado",
        confirmedByUserId: (req as any).user.userId,
        confirmedAt: new Date(),
        notes: notes || donation.notes,
        updatedAt: new Date(),
      })
      .where(eq(pixDonationsTable.id, id))
      .returning();

    await createAuditLog({
      userId: (req as any).user.userId,
      action: "pix_donation.confirm",
      resourceType: "pix_donation",
      resourceId: id,
      details: { txId: donation.txId, amount: String(donation.amount) },
      ipAddress: getIp(req),
    });

    res.json(serializeDonation(updated));
  } catch (err) {
    res.status(500).json({ error: "Erro ao confirmar doação PIX." });
  }
});

// PUT /donations/cancel/:id — admin only: cancel donation (static before dynamic)
router.put("/donations/cancel/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const [donation] = await db
      .select()
      .from(pixDonationsTable)
      .where(eq(pixDonationsTable.id, id))
      .limit(1);

    if (!donation) {
      res.status(404).json({ error: "Doação não encontrada." });
      return;
    }

    if (donation.status === "confirmado") {
      res.status(400).json({ error: "Doação já confirmada não pode ser cancelada." });
      return;
    }

    if (donation.status === "cancelado") {
      res.status(400).json({ error: "Doação já está cancelada." });
      return;
    }

    const [updated] = await db
      .update(pixDonationsTable)
      .set({
        status: "cancelado",
        notes: notes || donation.notes,
        updatedAt: new Date(),
      })
      .where(eq(pixDonationsTable.id, id))
      .returning();

    await createAuditLog({
      userId: (req as any).user.userId,
      action: "pix_donation.cancel",
      resourceType: "pix_donation",
      resourceId: id,
      details: { txId: donation.txId, amount: String(donation.amount) },
      ipAddress: getIp(req),
    });

    res.json(serializeDonation(updated));
  } catch (err) {
    res.status(500).json({ error: "Erro ao cancelar doação PIX." });
  }
});

export default router;
