import { Router, type IRouter, Request, Response } from "express";
import {
  db, visitorsTable, visitorVisitsTable, eventsTable, membersTable, memberHistoryTable,
  COMMUNING_RECEPTION_MODES, NON_COMMUNING_RECEPTION_MODES,
  isValidReceptionMode,
} from "@workspace/db";
import { eq, and, isNull, count, desc, asc, ilike, gte, lte, inArray, min, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { notifyMember } from "../lib/notifications.js";
import { encrypt, encryptIfPresent, decryptIfPresent, hashForSearch } from "../lib/crypto.js";
import { ensureMemberAreas } from "./members.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

async function recalcFirstVisit(visitorId: string, userId: string): Promise<void> {
  const [oldest] = await db.select().from(visitorVisitsTable)
    .where(eq(visitorVisitsTable.visitorId, visitorId))
    .orderBy(asc(visitorVisitsTable.visitDate))
    .limit(1);

  await db.update(visitorsTable).set({
    firstVisitDate: oldest?.visitDate ?? null,
    firstVisitEventId: oldest?.eventId ?? null,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(visitorsTable.id, visitorId));
}

async function validateEventNotDeleted(eventId: string | null | undefined): Promise<boolean> {
  if (!eventId) return true;
  const [e] = await db.select({ deletedAt: eventsTable.deletedAt })
    .from(eventsTable).where(eq(eventsTable.id, eventId)).limit(1);
  return !!e && !e.deletedAt;
}

function serializeVisitor(v: typeof visitorsTable.$inferSelect, totalVisits = 0) {
  return {
    id: v.id,
    fullName: v.fullName,
    phone: decryptIfPresent(v.phoneEncrypted),
    email: v.email,
    dateOfBirth: v.dateOfBirth,
    addressCity: v.addressCity,
    addressState: v.addressState,
    howFoundUs: v.howFoundUs,
    firstVisitDate: v.firstVisitDate,
    firstVisitEventId: v.firstVisitEventId,
    status: v.status,
    assignedToMemberId: v.assignedToMemberId,
    assignedToMemberName: v.assignedToMemberName,
    notes: v.notes,
    totalVisits,
    createdAt: v.createdAt?.toISOString(),
    updatedAt: v.updatedAt?.toISOString(),
  };
}

function serializeVisit(v: typeof visitorVisitsTable.$inferSelect, eventTitle?: string | null) {
  return {
    id: v.id,
    visitorId: v.visitorId,
    visitDate: v.visitDate,
    eventId: v.eventId,
    eventTitle: eventTitle ?? null,
    notes: v.notes,
    createdAt: v.createdAt?.toISOString(),
  };
}

// ─── LIST + SUMMARY (estáticas antes de :id) ────────────────────────────────

router.get("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const search = (req.query.search as string | undefined)?.trim();
  const status = req.query.status as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const conditions = [isNull(visitorsTable.deletedAt)];
  if (status) conditions.push(eq(visitorsTable.status, status as "recente"));
  if (search) conditions.push(ilike(visitorsTable.fullName, `%${search}%`));
  if (dateFrom) conditions.push(gte(visitorsTable.firstVisitDate, dateFrom));
  if (dateTo) conditions.push(lte(visitorsTable.firstVisitDate, dateTo));

  const where = and(...conditions);

  const [visitors, [{ total }]] = await Promise.all([
    db.select().from(visitorsTable).where(where)
      .orderBy(desc(visitorsTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(visitorsTable).where(where),
  ]);

  // Aggregate visit counts em uma única query (sem N+1)
  let visitCountMap = new Map<string, number>();
  if (visitors.length > 0) {
    const counts = await db.select({
      visitorId: visitorVisitsTable.visitorId,
      total: count(),
    }).from(visitorVisitsTable)
      .where(inArray(visitorVisitsTable.visitorId, visitors.map(v => v.id)))
      .groupBy(visitorVisitsTable.visitorId);
    visitCountMap = new Map(counts.map(c => [c.visitorId, Number(c.total)]));
  }

  res.json({
    visitors: visitors.map(v => serializeVisitor(v, visitCountMap.get(v.id) || 0)),
    total: Number(total),
    page,
    limit,
  });
});

router.get("/summary", requireAuth, requireRole("admin", "leader"), async (_req: Request, res: Response) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    [{ total }],
    [{ total: newThisWeek }],
    [{ total: newThisMonth }],
    byStatus,
    [{ total: convertedLast30d }],
  ] = await Promise.all([
    db.select({ total: count() }).from(visitorsTable).where(isNull(visitorsTable.deletedAt)),
    db.select({ total: count() }).from(visitorsTable)
      .where(and(isNull(visitorsTable.deletedAt), gte(visitorsTable.createdAt, sevenDaysAgo))),
    db.select({ total: count() }).from(visitorsTable)
      .where(and(isNull(visitorsTable.deletedAt), gte(visitorsTable.createdAt, thirtyDaysAgo))),
    db.select({ status: visitorsTable.status, total: count() })
      .from(visitorsTable)
      .where(isNull(visitorsTable.deletedAt))
      .groupBy(visitorsTable.status),
    db.select({ total: count() }).from(memberHistoryTable)
      .where(and(
        eq(memberHistoryTable.changeType, "converted_from_visitor"),
        gte(memberHistoryTable.createdAt, thirtyDaysAgo),
      )),
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of byStatus) statusMap[s.status] = Number(s.total);

  res.json({
    total: Number(total),
    newThisWeek: Number(newThisWeek),
    newThisMonth: Number(newThisMonth),
    byStatus: {
      recente: statusMap.recente || 0,
      acompanhando: statusMap.acompanhando || 0,
      sem_retorno: statusMap.sem_retorno || 0,
      nao_interessado: statusMap.nao_interessado || 0,
    },
    convertedLast30d: Number(convertedLast30d),
  });
});

// ─── CREATE ─────────────────────────────────────────────────────────────────

router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const {
    fullName, phone, email, dateOfBirth,
    addressCity, addressState, howFoundUs,
    firstVisitDate, firstVisitEventId,
    status, assignedToMemberId, notes,
  } = req.body;

  if (!fullName?.trim()) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Nome completo é obrigatório" });
    return;
  }
  if (!firstVisitDate) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Data da primeira visita é obrigatória" });
    return;
  }
  if (firstVisitEventId && !(await validateEventNotDeleted(firstVisitEventId))) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Evento informado não existe ou foi excluído" });
    return;
  }

  // Resolve nome do responsável
  let assignedToMemberName: string | null = null;
  if (assignedToMemberId) {
    const [m] = await db.select({ fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.id, assignedToMemberId)).limit(1);
    assignedToMemberName = m?.fullName ?? null;
  }

  const [visitor] = await db.insert(visitorsTable).values({
    fullName: fullName.trim(),
    phoneEncrypted: encryptIfPresent(phone),
    email: email || null,
    dateOfBirth: dateOfBirth || null,
    addressCity: addressCity || null,
    addressState: addressState || null,
    howFoundUs: howFoundUs || null,
    firstVisitDate,
    firstVisitEventId: firstVisitEventId || null,
    status: (status || "recente") as any,
    assignedToMemberId: assignedToMemberId || null,
    assignedToMemberName,
    notes: notes || null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  // Criar primeira visita correspondente
  await db.insert(visitorVisitsTable).values({
    visitorId: visitor.id,
    visitDate: firstVisitDate,
    eventId: firstVisitEventId || null,
    notes: null,
    createdByUserId: userId,
  });

  await createAuditLog({
    userId,
    action: "VISITOR_CREATED",
    resourceType: "visitor",
    resourceId: visitor.id,
    details: { fullName },
    ipAddress: ip,
  });

  if (assignedToMemberId) {
    await notifyMember(assignedToMemberId, {
      type: "visitor.assigned",
      title: "Você está acompanhando um visitante",
      message: `Você foi designado responsável pelo visitante ${fullName}.`,
      link: `/visitors/${visitor.id}`,
      entityType: "visitor",
      entityId: visitor.id,
    });
  }

  res.status(201).json(serializeVisitor(visitor, 1));
});

// ─── DETAIL / UPDATE / DELETE ──────────────────────────────────────────────

router.get("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string }>, res: Response) => {
  const [visitor] = await db.select().from(visitorsTable)
    .where(and(eq(visitorsTable.id, req.params.id), isNull(visitorsTable.deletedAt))).limit(1);

  if (!visitor) {
    res.status(404).json({ error: "NOT_FOUND", message: "Visitante não encontrado" });
    return;
  }

  const visits = await db.select({
    id: visitorVisitsTable.id,
    visitorId: visitorVisitsTable.visitorId,
    visitDate: visitorVisitsTable.visitDate,
    eventId: visitorVisitsTable.eventId,
    notes: visitorVisitsTable.notes,
    createdAt: visitorVisitsTable.createdAt,
    eventTitle: eventsTable.title,
  })
    .from(visitorVisitsTable)
    .leftJoin(eventsTable, eq(eventsTable.id, visitorVisitsTable.eventId))
    .where(eq(visitorVisitsTable.visitorId, visitor.id))
    .orderBy(desc(visitorVisitsTable.visitDate));

  res.json({
    ...serializeVisitor(visitor, visits.length),
    visits: visits.map(v => serializeVisit(v as any, v.eventTitle)),
  });
});

router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(visitorsTable)
    .where(and(eq(visitorsTable.id, req.params.id), isNull(visitorsTable.deletedAt))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Visitante não encontrado" });
    return;
  }

  // Rejeitar campos read-only
  if ("firstVisitDate" in req.body || "firstVisitEventId" in req.body) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Campos firstVisitDate e firstVisitEventId são derivados. Edite via /visits.",
    });
    return;
  }

  const {
    fullName, phone, email, dateOfBirth,
    addressCity, addressState, howFoundUs,
    status, assignedToMemberId, notes,
  } = req.body;

  // Resolve nome do novo responsável (se mudou)
  let newAssignedName: string | null | undefined = undefined;
  const assignedChanged = assignedToMemberId !== undefined && assignedToMemberId !== existing.assignedToMemberId;
  if (assignedChanged && assignedToMemberId) {
    const [m] = await db.select({ fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.id, assignedToMemberId)).limit(1);
    newAssignedName = m?.fullName ?? null;
  } else if (assignedChanged) {
    newAssignedName = null;
  }

  const updates: Record<string, any> = { updatedByUserId: userId, updatedAt: new Date() };
  if (fullName !== undefined) updates.fullName = fullName;
  if (phone !== undefined) updates.phoneEncrypted = encryptIfPresent(phone);
  if (email !== undefined) updates.email = email || null;
  if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth || null;
  if (addressCity !== undefined) updates.addressCity = addressCity || null;
  if (addressState !== undefined) updates.addressState = addressState || null;
  if (howFoundUs !== undefined) updates.howFoundUs = howFoundUs || null;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes || null;
  if (assignedChanged) {
    updates.assignedToMemberId = assignedToMemberId || null;
    updates.assignedToMemberName = newAssignedName;
  }

  const [updated] = await db.update(visitorsTable).set(updates)
    .where(eq(visitorsTable.id, req.params.id)).returning();

  await createAuditLog({
    userId,
    action: "VISITOR_UPDATED",
    resourceType: "visitor",
    resourceId: updated.id,
    ipAddress: ip,
  });

  if (assignedChanged && assignedToMemberId) {
    await notifyMember(assignedToMemberId, {
      type: "visitor.assigned",
      title: "Você está acompanhando um visitante",
      message: `Você foi designado responsável pelo visitante ${updated.fullName}.`,
      link: `/visitors/${updated.id}`,
      entityType: "visitor",
      entityId: updated.id,
    });
  }

  res.json(serializeVisitor(updated));
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(visitorsTable)
    .where(and(eq(visitorsTable.id, req.params.id), isNull(visitorsTable.deletedAt))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Visitante não encontrado" });
    return;
  }

  await db.update(visitorsTable).set({
    deletedAt: new Date(),
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(visitorsTable.id, req.params.id));

  await createAuditLog({
    userId,
    action: "VISITOR_DELETED",
    resourceType: "visitor",
    resourceId: existing.id,
    ipAddress: ip,
  });

  res.json({ message: "Visitante excluído" });
});

// ─── VISITS ────────────────────────────────────────────────────────────────

router.post("/:id/visits", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const visitorId = req.params.id;

  const [visitor] = await db.select().from(visitorsTable)
    .where(and(eq(visitorsTable.id, visitorId), isNull(visitorsTable.deletedAt))).limit(1);
  if (!visitor) {
    res.status(404).json({ error: "NOT_FOUND", message: "Visitante não encontrado" });
    return;
  }

  const { visitDate, eventId, notes } = req.body;
  if (!visitDate) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Data da visita é obrigatória" });
    return;
  }
  if (eventId && !(await validateEventNotDeleted(eventId))) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Evento informado não existe ou foi excluído" });
    return;
  }

  const [visit] = await db.insert(visitorVisitsTable).values({
    visitorId,
    visitDate,
    eventId: eventId || null,
    notes: notes || null,
    createdByUserId: userId,
  }).returning();

  await recalcFirstVisit(visitorId, userId);

  res.status(201).json(serializeVisit(visit));
});

router.put("/:id/visits/:visitId", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string; visitId: string }>, res: Response) => {
  const userId = req.user!.userId;
  const { id: visitorId, visitId } = req.params;

  const [existing] = await db.select().from(visitorVisitsTable)
    .where(and(eq(visitorVisitsTable.id, visitId), eq(visitorVisitsTable.visitorId, visitorId))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Visita não encontrada" });
    return;
  }

  const { visitDate, eventId, notes } = req.body;
  if (eventId && !(await validateEventNotDeleted(eventId))) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Evento informado não existe ou foi excluído" });
    return;
  }

  const updates: Record<string, any> = {};
  if (visitDate !== undefined) updates.visitDate = visitDate;
  if (eventId !== undefined) updates.eventId = eventId || null;
  if (notes !== undefined) updates.notes = notes || null;

  const [updated] = await db.update(visitorVisitsTable).set(updates)
    .where(eq(visitorVisitsTable.id, visitId)).returning();

  await recalcFirstVisit(visitorId, userId);

  res.json(serializeVisit(updated));
});

router.delete("/:id/visits/:visitId", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string; visitId: string }>, res: Response) => {
  const userId = req.user!.userId;
  const { id: visitorId, visitId } = req.params;

  // Bloqueia se for a única visita
  const [{ total }] = await db.select({ total: count() }).from(visitorVisitsTable)
    .where(eq(visitorVisitsTable.visitorId, visitorId));
  if (Number(total) <= 1) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Visitante deve ter pelo menos 1 visita registrada",
    });
    return;
  }

  const result = await db.delete(visitorVisitsTable)
    .where(and(eq(visitorVisitsTable.id, visitId), eq(visitorVisitsTable.visitorId, visitorId)))
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "NOT_FOUND", message: "Visita não encontrada" });
    return;
  }

  await recalcFirstVisit(visitorId, userId);

  res.json({ message: "Visita removida" });
});

// ─── CONVERT ────────────────────────────────────────────────────────────────

router.post("/:id/convert", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const visitorId = req.params.id;

  const [visitor] = await db.select().from(visitorsTable)
    .where(and(eq(visitorsTable.id, visitorId), isNull(visitorsTable.deletedAt))).limit(1);
  if (!visitor) {
    res.status(404).json({ error: "NOT_FOUND", message: "Visitante não encontrado" });
    return;
  }

  const {
    cpf, dateOfBirth, sex, phone, email,
    addressZip, addressStreet, addressNumber, addressComplement, addressNeighborhood, addressCity, addressState,
    classification, receptionMode, receptionDate, conversionYear,
    religiousOrigin, infantBaptism, infantBaptismChurch, infantBaptismPastor, parentsOrGuardians,
    maritalStatus, spouseMemberId, academicEducation, profession,
  } = req.body;

  // Validação classification × receptionMode
  if (!classification || !["comungante", "nao_comungante"].includes(classification)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Classificação obrigatória" });
    return;
  }
  if (receptionMode && !isValidReceptionMode(classification, receptionMode)) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `Modo de recepção inválido para ${classification}.`,
    });
    return;
  }

  // Verificar conflito de CPF
  if (cpf) {
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length > 0) {
      const cpfHash = hashForSearch(cpfDigits);
      const [existing] = await db.select({ id: membersTable.id, fullName: membersTable.fullName })
        .from(membersTable).where(eq(membersTable.cpfHash, cpfHash)).limit(1);
      if (existing) {
        res.status(409).json({
          error: "CPF_ALREADY_REGISTERED",
          message: `CPF já cadastrado em outro membro (${existing.fullName}). Verifique se é caso de restauração ou recadastro.`,
        });
        return;
      }
    }
  }

  // Calcular total de visitas pra o audit
  const [{ total: totalVisits }] = await db.select({ total: count() }).from(visitorVisitsTable)
    .where(eq(visitorVisitsTable.visitorId, visitorId));

  // Resolve spouseMemberId name (se houver)
  // Note: bidirectional spouse mirror não é tratado aqui — admin pode fazer depois via PUT /members/:id

  const cpfEncrypted = cpf ? encrypt(cpf.replace(/\D/g, "")) : null;
  const cpfHash = cpf ? hashForSearch(cpf) : null;

  const [member] = await db.insert(membersTable).values({
    fullName: visitor.fullName,
    cpfEncrypted,
    cpfHash,
    dateOfBirth: dateOfBirth || visitor.dateOfBirth || null,
    sex: sex || null,
    phoneEncrypted: phone ? encryptIfPresent(phone) : visitor.phoneEncrypted,
    email: email || visitor.email || null,
    addressZipEncrypted: encryptIfPresent(addressZip),
    addressStreetEncrypted: encryptIfPresent(addressStreet),
    addressNumber: addressNumber || null,
    addressComplement: addressComplement || null,
    addressNeighborhoodEncrypted: encryptIfPresent(addressNeighborhood),
    addressCity: addressCity || visitor.addressCity || null,
    addressState: addressState || visitor.addressState || null,
    classification: classification as "comungante",
    receptionMode: receptionMode || null,
    receptionDate: receptionDate || null,
    conversionYear: conversionYear ? Number(conversionYear) : null,
    religiousOrigin: religiousOrigin || null,
    infantBaptism: !!infantBaptism,
    infantBaptismChurch: infantBaptismChurch || null,
    infantBaptismPastor: infantBaptismPastor || null,
    parentsOrGuardians: parentsOrGuardians || null,
    maritalStatus: maritalStatus || null,
    spouseMemberId: spouseMemberId || null, // sem espelhamento aqui — admin ajusta depois
    academicEducation: academicEducation || null,
    profession: profession || null,
    status: "ativo" as const,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  await ensureMemberAreas(member.id, userId);

  // 2 entradas em member_history
  await db.insert(memberHistoryTable).values([
    {
      memberId: member.id,
      changedByUserId: userId,
      changeType: "created",
      fieldChanges: { fullName: member.fullName, classification },
    },
    {
      memberId: member.id,
      changedByUserId: userId,
      changeType: "converted_from_visitor",
      fieldChanges: {
        visitorId,
        firstVisitDate: visitor.firstVisitDate,
        totalVisits: Number(totalVisits),
      },
    },
  ]);

  // Hard delete do visitor (e visitas)
  await db.delete(visitorVisitsTable).where(eq(visitorVisitsTable.visitorId, visitorId));
  await db.delete(visitorsTable).where(eq(visitorsTable.id, visitorId));

  await createAuditLog({
    userId,
    action: "MEMBER_CREATED",
    resourceType: "member",
    resourceId: member.id,
    details: { source: "visitor_conversion", visitorId, fullName: member.fullName },
    ipAddress: ip,
  });

  res.json(member);
});

export default router;
