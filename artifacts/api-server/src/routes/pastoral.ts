import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  pastoralVisitsTable,
  membersTable,
} from "@workspace/db";
import { eq, and, isNull, count, desc, gte, lte, lt, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

const VALID_TYPES = ["visita", "ligacao", "reuniao", "oracao"];
const VALID_STATUSES = ["pendente", "realizado", "cancelado"];

function serializeVisit(v: typeof pastoralVisitsTable.$inferSelect) {
  return {
    id: v.id,
    memberId: v.memberId,
    memberName: v.memberName,
    pastorId: v.pastorId,
    pastorName: v.pastorName,
    type: v.type,
    date: v.date,
    notes: v.notes,
    status: v.status,
    followUpDate: v.followUpDate,
    createdAt: v.createdAt?.toISOString(),
    updatedAt: v.updatedAt?.toISOString(),
  };
}

// Helper: find member linked to user email
async function findMemberByEmail(email: string) {
  const [member] = await db.select().from(membersTable)
    .where(eq(membersTable.email, email)).limit(1);
  return member;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/summary", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [pending] = await db.select({ c: count() }).from(pastoralVisitsTable)
    .where(and(isNull(pastoralVisitsTable.deletedAt), eq(pastoralVisitsTable.status, "pendente" as any)));

  const [doneThisMonth] = await db.select({ c: count() }).from(pastoralVisitsTable)
    .where(and(
      isNull(pastoralVisitsTable.deletedAt),
      eq(pastoralVisitsTable.status, "realizado" as any),
      gte(pastoralVisitsTable.date, startOfMonth),
    ));

  const [overdueFollowUps] = await db.select({ c: count() }).from(pastoralVisitsTable)
    .where(and(
      isNull(pastoralVisitsTable.deletedAt),
      eq(pastoralVisitsTable.status, "pendente" as any),
      lt(pastoralVisitsTable.followUpDate, today),
    ));

  const [totalVisits] = await db.select({ c: count() }).from(pastoralVisitsTable)
    .where(isNull(pastoralVisitsTable.deletedAt));

  res.json({
    pending: pending.c,
    doneThisMonth: doneThisMonth.c,
    overdueFollowUps: overdueFollowUps.c,
    totalVisits: totalVisits.c,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIST VISITS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const { memberId, pastorId, status, dateFrom, dateTo } = req.query;

  const conditions = [isNull(pastoralVisitsTable.deletedAt)];

  if (memberId) conditions.push(eq(pastoralVisitsTable.memberId, memberId as string));
  if (pastorId) conditions.push(eq(pastoralVisitsTable.pastorId, pastorId as string));
  if (status && VALID_STATUSES.includes(status as string)) {
    conditions.push(eq(pastoralVisitsTable.status, status as any));
  }
  if (dateFrom) conditions.push(gte(pastoralVisitsTable.date, dateFrom as string));
  if (dateTo) conditions.push(lte(pastoralVisitsTable.date, dateTo as string));

  // For leaders: filter to only visits where they are the pastor
  const user = req.user as any;
  if (user.role === "leader") {
    const member = await findMemberByEmail(user.email);
    if (member) {
      conditions.push(eq(pastoralVisitsTable.pastorId, member.id));
    } else {
      return res.json({ visits: [], total: 0, page, limit });
    }
  }

  const where = and(...conditions);

  const [{ c: total }] = await db.select({ c: count() }).from(pastoralVisitsTable).where(where);

  const visits = await db.select().from(pastoralVisitsTable)
    .where(where)
    .orderBy(desc(pastoralVisitsTable.date))
    .limit(limit).offset(offset);

  res.json({
    visits: visits.map(serializeVisit),
    total,
    page,
    limit,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMBER HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/member/:memberId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { memberId } = req.params;

  const visits = await db.select().from(pastoralVisitsTable)
    .where(and(
      isNull(pastoralVisitsTable.deletedAt),
      eq(pastoralVisitsTable.memberId, memberId),
    ))
    .orderBy(desc(pastoralVisitsTable.date));

  res.json({ visits: visits.map(serializeVisit) });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE VISIT
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { memberId, pastorId, type, date, notes, followUpDate } = req.body;

  if (!memberId || !pastorId || !type || !date) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: memberId, pastorId, type, date" });
  }

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: `Tipo inválido. Use: ${VALID_TYPES.join(", ")}` });
  }

  // Lookup member and pastor names
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  if (!member) return res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });

  const [pastor] = await db.select().from(membersTable).where(eq(membersTable.id, pastorId)).limit(1);
  if (!pastor) return res.status(404).json({ error: "NOT_FOUND", message: "Pastor/líder não encontrado" });

  const [visit] = await db.insert(pastoralVisitsTable).values({
    memberId,
    memberName: member.fullName,
    pastorId,
    pastorName: pastor.fullName,
    type,
    date,
    notes: notes || null,
    followUpDate: followUpDate || null,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "pastoral.visit.create",
    resourceType: "pastoral_visit",
    resourceId: visit.id,
    details: { memberId, pastorId, type },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeVisit(visit));
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE VISIT
// ═══════════════════════════════════════════════════════════════════════════════

router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [existing] = await db.select().from(pastoralVisitsTable)
    .where(and(eq(pastoralVisitsTable.id, id), isNull(pastoralVisitsTable.deletedAt))).limit(1);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND", message: "Visita não encontrada" });

  // Leader can only edit own visits (where they are the pastor)
  if (user.role === "leader") {
    const member = await findMemberByEmail(user.email);
    if (!member || existing.pastorId !== member.id) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão para editar esta visita" });
    }
  }

  const { type, date, notes, status, followUpDate } = req.body;

  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };
  if (type && VALID_TYPES.includes(type)) updates.type = type;
  if (date) updates.date = date;
  if (notes !== undefined) updates.notes = notes || null;
  if (status && VALID_STATUSES.includes(status)) updates.status = status;
  if (followUpDate !== undefined) updates.followUpDate = followUpDate || null;

  const [updated] = await db.update(pastoralVisitsTable).set(updates)
    .where(eq(pastoralVisitsTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "pastoral.visit.update",
    resourceType: "pastoral_visit",
    resourceId: id,
    details: { changes: Object.keys(updates).filter(k => k !== "updatedByUserId" && k !== "updatedAt") },
    ipAddress: getIp(req),
  });

  res.json(serializeVisit(updated));
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE VISIT (soft delete — admin only)
// ═══════════════════════════════════════════════════════════════════════════════

router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [existing] = await db.select().from(pastoralVisitsTable)
    .where(and(eq(pastoralVisitsTable.id, id), isNull(pastoralVisitsTable.deletedAt))).limit(1);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND", message: "Visita não encontrada" });

  await db.update(pastoralVisitsTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(pastoralVisitsTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "pastoral.visit.delete",
    resourceType: "pastoral_visit",
    resourceId: id,
    ipAddress: getIp(req),
  });

  res.json({ message: "Visita removida" });
});

export default router;
