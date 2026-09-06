import { findLinkedMember } from "../lib/memberLink.js";
import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  counselingCasesTable,
  counselingSessionsTable,
  membersTable,
} from "@workspace/db";
import { eq, and, isNull, count, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { encrypt, decrypt } from "../lib/crypto.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

const VALID_STATUSES = ["aberto", "em_andamento", "encerrado"];

function serializeCase(c: typeof counselingCasesTable.$inferSelect) {
  return {
    id: c.id,
    memberId: c.memberId,
    memberName: c.memberName,
    counselorId: c.counselorId,
    counselorName: c.counselorName,
    topic: c.topic,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    createdAt: c.createdAt?.toISOString(),
    updatedAt: c.updatedAt?.toISOString(),
  };
}

function serializeSession(s: typeof counselingSessionsTable.$inferSelect) {
  return {
    id: s.id,
    caseId: s.caseId,
    date: s.date,
    notes: s.notesEncrypted ? decrypt(s.notesEncrypted) : null,
    durationMinutes: s.durationMinutes,
    createdAt: s.createdAt?.toISOString(),
  };
}


// Helper: check if user is the counselor of a case
async function isCounselorOfCase(caseId: string, user: NonNullable<Request["user"]>): Promise<boolean> {
  const member = await findLinkedMember(user);
  if (!member) return false;
  const [c] = await db.select().from(counselingCasesTable)
    .where(and(eq(counselingCasesTable.id, caseId), eq(counselingCasesTable.counselorId, member.id)))
    .limit(1);
  return !!c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/summary", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const [open] = await db.select({ c: count() }).from(counselingCasesTable)
    .where(and(isNull(counselingCasesTable.deletedAt), eq(counselingCasesTable.status, "aberto" as any)));

  const [inProgress] = await db.select({ c: count() }).from(counselingCasesTable)
    .where(and(isNull(counselingCasesTable.deletedAt), eq(counselingCasesTable.status, "em_andamento" as any)));

  const [closed] = await db.select({ c: count() }).from(counselingCasesTable)
    .where(and(isNull(counselingCasesTable.deletedAt), eq(counselingCasesTable.status, "encerrado" as any)));

  const [totalSessions] = await db.select({ c: count() }).from(counselingSessionsTable);

  res.json({
    openCases: open.c,
    inProgressCases: inProgress.c,
    closedCases: closed.c,
    totalSessions: totalSessions.c,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIST CASES
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/cases", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const conditions = [isNull(counselingCasesTable.deletedAt)];

  const { status } = req.query;
  if (status && VALID_STATUSES.includes(status as string)) {
    conditions.push(eq(counselingCasesTable.status, status as any));
  }

  // Leaders see only cases where they are the counselor
  if (user.role === "leader") {
    const member = await findLinkedMember(user);
    if (member) {
      conditions.push(eq(counselingCasesTable.counselorId, member.id));
    } else {
      return res.json({ cases: [], total: 0, page, limit });
    }
  }

  const where = and(...conditions);

  const [{ c: total }] = await db.select({ c: count() }).from(counselingCasesTable).where(where);

  const cases = await db.select().from(counselingCasesTable)
    .where(where)
    .orderBy(desc(counselingCasesTable.updatedAt))
    .limit(limit).offset(offset);

  res.json({
    cases: cases.map(serializeCase),
    total,
    page,
    limit,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE DETAIL
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/cases/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [caseData] = await db.select().from(counselingCasesTable)
    .where(and(eq(counselingCasesTable.id, id), isNull(counselingCasesTable.deletedAt))).limit(1);
  if (!caseData) return res.status(404).json({ error: "NOT_FOUND", message: "Caso não encontrado" });

  // Leader can only see own cases
  if (user.role === "leader") {
    const isCounselor = await isCounselorOfCase(String(id), user);
    if (!isCounselor) return res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão para ver este caso" });
  }

  const sessions = await db.select().from(counselingSessionsTable)
    .where(eq(counselingSessionsTable.caseId, id))
    .orderBy(desc(counselingSessionsTable.date));

  res.json({
    ...serializeCase(caseData),
    sessions: sessions.map(serializeSession),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE CASE (admin only)
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/cases", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { memberId, counselorId, topic, startDate } = req.body;

  if (!memberId || !counselorId || !topic || !startDate) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: memberId, counselorId, topic, startDate" });
  }

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  if (!member) return res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });

  const [counselor] = await db.select().from(membersTable).where(eq(membersTable.id, counselorId)).limit(1);
  if (!counselor) return res.status(404).json({ error: "NOT_FOUND", message: "Conselheiro não encontrado" });

  const [created] = await db.insert(counselingCasesTable).values({
    memberId,
    memberName: member.fullName,
    counselorId,
    counselorName: counselor.fullName,
    topic,
    startDate,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "counseling.case.create",
    resourceType: "counseling_case",
    resourceId: created.id,
    details: { memberId, counselorId, topic },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeCase(created));
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE CASE
// ═══════════════════════════════════════════════════════════════════════════════

router.put("/cases/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [existing] = await db.select().from(counselingCasesTable)
    .where(and(eq(counselingCasesTable.id, id), isNull(counselingCasesTable.deletedAt))).limit(1);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND", message: "Caso não encontrado" });

  // Leader can only update own cases
  if (user.role === "leader") {
    const isCounselor = await isCounselorOfCase(String(id), user);
    if (!isCounselor) return res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão para editar este caso" });
  }

  const { topic, status } = req.body;

  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };
  if (topic) updates.topic = topic;
  if (status && VALID_STATUSES.includes(status)) {
    updates.status = status;
    if (status === "encerrado") updates.endDate = new Date().toISOString().slice(0, 10);
  }

  const [updated] = await db.update(counselingCasesTable).set(updates)
    .where(eq(counselingCasesTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "counseling.case.update",
    resourceType: "counseling_case",
    resourceId: id,
    ipAddress: getIp(req),
  });

  res.json(serializeCase(updated));
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE SESSION
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/cases/:id/sessions", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [caseData] = await db.select().from(counselingCasesTable)
    .where(and(eq(counselingCasesTable.id, id), isNull(counselingCasesTable.deletedAt))).limit(1);
  if (!caseData) return res.status(404).json({ error: "NOT_FOUND", message: "Caso não encontrado" });

  // Leader can only add sessions to own cases
  if (user.role === "leader") {
    const isCounselor = await isCounselorOfCase(String(id), user);
    if (!isCounselor) return res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão para este caso" });
  }

  const { date, notes, durationMinutes } = req.body;
  if (!date) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Campo obrigatório: date" });

  const [session] = await db.insert(counselingSessionsTable).values({
    caseId: id,
    date,
    notesEncrypted: notes ? encrypt(notes) : null,
    durationMinutes: durationMinutes || null,
    createdByUserId: user.userId,
  }).returning();

  // Update case status to em_andamento if still aberto
  if (caseData.status === "aberto") {
    await db.update(counselingCasesTable).set({
      status: "em_andamento",
      updatedByUserId: user.userId,
      updatedAt: new Date(),
    }).where(eq(counselingCasesTable.id, id));
  }

  await createAuditLog({
    userId: user.userId,
    action: "counseling.session.create",
    resourceType: "counseling_session",
    resourceId: session.id,
    details: { caseId: id },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeSession(session));
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIST SESSIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/cases/:id/sessions", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  // Verify case exists and user has access
  const [caseData] = await db.select().from(counselingCasesTable)
    .where(and(eq(counselingCasesTable.id, id), isNull(counselingCasesTable.deletedAt))).limit(1);
  if (!caseData) return res.status(404).json({ error: "NOT_FOUND", message: "Caso não encontrado" });

  if (user.role === "leader") {
    const isCounselor = await isCounselorOfCase(String(id), user);
    if (!isCounselor) return res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão para este caso" });
  }

  const sessions = await db.select().from(counselingSessionsTable)
    .where(eq(counselingSessionsTable.caseId, id))
    .orderBy(desc(counselingSessionsTable.date));

  res.json({ sessions: sessions.map(serializeSession) });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE CASE (soft delete — admin only)
// ═══════════════════════════════════════════════════════════════════════════════

router.delete("/cases/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;

  const [existing] = await db.select().from(counselingCasesTable)
    .where(and(eq(counselingCasesTable.id, id), isNull(counselingCasesTable.deletedAt))).limit(1);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND", message: "Caso não encontrado" });

  await db.update(counselingCasesTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(counselingCasesTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "counseling.case.delete",
    resourceType: "counseling_case",
    resourceId: id,
    ipAddress: getIp(req),
  });

  res.json({ message: "Caso removido" });
});

export default router;
