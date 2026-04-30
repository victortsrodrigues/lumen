import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  membersTable,
  consentRecordsTable,
  lgpdRequestsTable,
  memberHistoryTable,
  financeEntriesTable,
  courseEnrollmentsTable,
  eventRegistrationsTable,
  ministryMembersTable,
  assetsTable,
  eventSchedulesTable,
  planningInitiativesTable,
  pastoralVisitsTable,
  counselingCasesTable,
  counselingSessionsTable,
  songSuggestionsTable,
  liturgyItemsTable,
  pixDonationsTable,
  memberChildrenTable,
  memberGroupMembersTable,
} from "@workspace/db";
import { eq, desc, and, count, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { decryptIfPresent, maskCpf } from "../lib/crypto.js";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// Helper: find member by user email
async function findMemberByEmail(email: string) {
  const [member] = await db.select().from(membersTable)
    .where(eq(membersTable.email, email)).limit(1);
  return member;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEMBER SELF-SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /lgpd/my-data — Ver dados pessoais
router.get("/my-data", requireAuth, async (req: Request, res: Response) => {
  const member = await findMemberByEmail(req.user!.email);
  if (!member) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado para este usuário" });
    return;
  }

  const consents = await db.select().from(consentRecordsTable)
    .where(eq(consentRecordsTable.userId, req.user!.userId))
    .orderBy(desc(consentRecordsTable.createdAt));

  const myRequests = await db.select().from(lgpdRequestsTable)
    .where(eq(lgpdRequestsTable.userId, req.user!.userId))
    .orderBy(desc(lgpdRequestsTable.createdAt));

  const cpfDecrypted = decryptIfPresent(member.cpfEncrypted);

  res.json({
    member: {
      id: member.id,
      fullName: member.fullName,
      cpfMasked: cpfDecrypted ? maskCpf(cpfDecrypted) : null,
      dateOfBirth: member.dateOfBirth,
      sex: member.sex,
      phone: decryptIfPresent(member.phoneEncrypted),
      email: member.email,
      addressZip: decryptIfPresent(member.addressZipEncrypted),
      addressStreet: decryptIfPresent(member.addressStreetEncrypted),
      addressNumber: member.addressNumber,
      addressComplement: member.addressComplement,
      addressNeighborhood: decryptIfPresent(member.addressNeighborhoodEncrypted),
      addressCity: member.addressCity,
      addressState: member.addressState,
      conversionDate: member.conversionDate,
      receptionDate: member.receptionDate,
      classification: member.classification,
      receptionMode: member.receptionMode,
      conversionYear: member.conversionYear,
      maritalStatus: member.maritalStatus,
      academicEducation: member.academicEducation,
      profession: member.profession,
      status: member.status,
      photoPath: member.photoPath,
      createdAt: member.createdAt,
    },
    consents: consents.map(c => ({
      id: c.id,
      consentType: c.consentType,
      accepted: c.accepted,
      createdAt: c.createdAt,
    })),
    requests: myRequests.map(r => ({
      id: r.id,
      requestType: r.requestType,
      status: r.status,
      description: r.description,
      adminNotes: r.adminNotes,
      createdAt: r.createdAt,
      processedAt: r.processedAt,
    })),
  });
});

// GET /lgpd/my-data/export — Exportar dados (portabilidade)
router.get("/my-data/export", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const member = await findMemberByEmail(req.user!.email);
  if (!member) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  const [consents, history, courseEnrollments, eventRegs] = await Promise.all([
    db.select().from(consentRecordsTable)
      .where(eq(consentRecordsTable.userId, userId))
      .orderBy(desc(consentRecordsTable.createdAt)),
    db.select().from(memberHistoryTable)
      .where(eq(memberHistoryTable.memberId, member.id))
      .orderBy(desc(memberHistoryTable.createdAt)),
    db.select().from(courseEnrollmentsTable)
      .where(eq(courseEnrollmentsTable.memberId, member.id)),
    db.select().from(eventRegistrationsTable)
      .where(eq(eventRegistrationsTable.memberId, member.id)),
  ]);

  const exportData = {
    exportDate: new Date().toISOString(),
    personalData: {
      fullName: member.fullName,
      cpf: decryptIfPresent(member.cpfEncrypted),
      dateOfBirth: member.dateOfBirth,
      sex: member.sex,
      phone: decryptIfPresent(member.phoneEncrypted),
      email: member.email,
      address: {
        zip: decryptIfPresent(member.addressZipEncrypted),
        street: decryptIfPresent(member.addressStreetEncrypted),
        number: member.addressNumber,
        complement: member.addressComplement,
        neighborhood: decryptIfPresent(member.addressNeighborhoodEncrypted),
        city: member.addressCity,
        state: member.addressState,
      },
      conversionDate: member.conversionDate,
      receptionDate: member.receptionDate,
      classification: member.classification,
      receptionMode: member.receptionMode,
      maritalStatus: member.maritalStatus,
      academicEducation: member.academicEducation,
      profession: member.profession,
      status: member.status,
      memberSince: member.createdAt,
    },
    consents,
    changeHistory: history,
    courseEnrollments,
    eventRegistrations: eventRegs,
  };

  await createAuditLog({
    userId,
    action: "LGPD_DATA_EXPORTED",
    resourceType: "member",
    resourceId: member.id,
    ipAddress: ip,
  });

  res.setHeader("Content-Disposition", `attachment; filename="meus-dados-${new Date().toISOString().split("T")[0]}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.json(exportData);
});

// GET /lgpd/my-consents — Ver consentimentos
router.get("/my-consents", requireAuth, async (req: Request, res: Response) => {
  const consents = await db.select().from(consentRecordsTable)
    .where(eq(consentRecordsTable.userId, req.user!.userId))
    .orderBy(desc(consentRecordsTable.createdAt));

  res.json({ consents });
});

// POST /lgpd/requests — Criar solicitação
router.post("/requests", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const member = await findMemberByEmail(req.user!.email);
  if (!member) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  const { requestType, description } = req.body;
  if (!requestType) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Tipo de solicitação é obrigatório" });
    return;
  }

  const [request] = await db.insert(lgpdRequestsTable).values({
    memberId: member.id,
    memberName: member.fullName,
    userId,
    requestType: requestType as "correcao",
    description: description ?? null,
  }).returning();

  await createAuditLog({
    userId,
    action: "LGPD_REQUEST_CREATED",
    resourceType: "lgpd_request",
    resourceId: request.id,
    details: { requestType },
    ipAddress: ip,
  });

  res.status(201).json(request);
});

// GET /lgpd/requests/mine — Minhas solicitações
router.get("/requests/mine", requireAuth, async (req: Request, res: Response) => {
  const requests = await db.select().from(lgpdRequestsTable)
    .where(eq(lgpdRequestsTable.userId, req.user!.userId))
    .orderBy(desc(lgpdRequestsTable.createdAt));

  res.json({ requests });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

// GET /lgpd/requests — Fila de solicitações (admin)
router.get("/requests", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;
  const typeFilter = req.query.type as string | undefined;

  const conditions = [];
  if (statusFilter) conditions.push(eq(lgpdRequestsTable.status, statusFilter as "pendente"));
  if (typeFilter) conditions.push(eq(lgpdRequestsTable.requestType, typeFilter as "correcao"));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [requests, [{ total }]] = await Promise.all([
    db.select().from(lgpdRequestsTable).where(where)
      .orderBy(desc(lgpdRequestsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(lgpdRequestsTable).where(where),
  ]);

  res.json({ requests, total: Number(total), page, limit });
});

// PUT /lgpd/requests/:id — Processar solicitação (admin)
router.put("/requests/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const adminUserId = req.user!.userId;
  const ip = getIp(req);

  const [request] = await db.select().from(lgpdRequestsTable)
    .where(eq(lgpdRequestsTable.id, req.params.id)).limit(1);

  if (!request) {
    res.status(404).json({ error: "NOT_FOUND", message: "Solicitação não encontrada" });
    return;
  }

  if (request.status === "concluido" || request.status === "rejeitado") {
    res.status(409).json({ error: "ALREADY_PROCESSED", message: "Solicitação já foi processada" });
    return;
  }

  const { status, adminNotes } = req.body;
  if (!status || !["concluido", "rejeitado"].includes(status)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Status deve ser 'concluido' ou 'rejeitado'" });
    return;
  }

  if (status === "rejeitado" && !adminNotes) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Justificativa obrigatória ao rejeitar" });
    return;
  }

  // Process deletion request
  if (status === "concluido" && request.requestType === "exclusao") {
    await anonymizeMember(request.memberId, adminUserId);
  }

  const [updated] = await db.update(lgpdRequestsTable).set({
    status: status as "concluido",
    adminNotes: adminNotes ?? null,
    processedByUserId: adminUserId,
    processedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(lgpdRequestsTable.id, req.params.id)).returning();

  await createAuditLog({
    userId: adminUserId,
    action: status === "concluido" ? "LGPD_REQUEST_APPROVED" : "LGPD_REQUEST_REJECTED",
    resourceType: "lgpd_request",
    resourceId: updated.id,
    details: {
      requestType: request.requestType,
      memberId: request.memberId,
      adminNotes: adminNotes ?? null,
    },
    ipAddress: ip,
  });

  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANONYMIZATION LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

async function anonymizeMember(memberId: string, adminUserId: string): Promise<void> {
  const anonEmail = `anon-${randomUUID().slice(0, 8)}@anonimizado.local`;
  const anonName = `Membro Anonimizado #${memberId.slice(0, 8)}`;

  // 0. Load existing to capture spouse + letter path
  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);

  // Clear spouse on the other side
  if (existing?.spouseMemberId) {
    await db.update(membersTable)
      .set({ spouseMemberId: null, updatedByUserId: adminUserId, updatedAt: new Date() })
      .where(eq(membersTable.id, existing.spouseMemberId));
  }

  // Delete children links (both directions)
  await db.delete(memberChildrenTable).where(or(
    eq(memberChildrenTable.parentId, memberId),
    eq(memberChildrenTable.childId, memberId),
  ));

  // Delete group memberships
  await db.delete(memberGroupMembersTable).where(eq(memberGroupMembersTable.memberId, memberId));

  // 1. Anonymize member record (status → rol_apartado per Fase 1 plan)
  await db.update(membersTable).set({
    fullName: anonName,
    cpfEncrypted: null,
    cpfHash: null,
    phoneEncrypted: null,
    email: anonEmail,
    dateOfBirth: null,
    sex: null,
    addressZipEncrypted: null,
    addressStreetEncrypted: null,
    addressNumber: null,
    addressComplement: null,
    addressNeighborhoodEncrypted: null,
    addressCity: null,
    addressState: null,
    conversionDate: null,
    receptionDate: null,
    conversionYear: null,
    religiousOrigin: null,
    infantBaptism: false,
    infantBaptismChurch: null,
    infantBaptismPastor: null,
    parentsOrGuardians: null,
    maritalStatus: null,
    spouseMemberId: null,
    academicEducation: null,
    profession: null,
    exclusionReason: null,
    exclusionDate: null,
    exclusionNotes: null,
    exclusionLetterPath: null,
    photoPath: null,
    status: "rol_apartado" as const,
    updatedByUserId: adminUserId,
    updatedAt: new Date(),
  }).where(eq(membersTable.id, memberId));

  // 2. Anonymize financial entries (preserve amounts, remove member link)
  await db.update(financeEntriesTable).set({
    memberId: null,
    memberName: "[anonimizado]",
    updatedByUserId: adminUserId,
    updatedAt: new Date(),
  }).where(eq(financeEntriesTable.memberId, memberId));

  // 3. Anonymize course enrollments
  await db.update(courseEnrollmentsTable).set({
    memberName: "[anonimizado]",
  }).where(eq(courseEnrollmentsTable.memberId, memberId));

  // 4. Anonymize event registrations
  await db.update(eventRegistrationsTable).set({
    memberName: "[anonimizado]",
  }).where(eq(eventRegistrationsTable.memberId, memberId));

  // 5. Anonymize ministry members (soft delete + anonymize name)
  await db.update(ministryMembersTable).set({
    memberName: "[anonimizado]",
    leftAt: new Date(),
  }).where(eq(ministryMembersTable.memberId, memberId));

  // 6. Unlink assets (remove responsible)
  await db.update(assetsTable).set({
    responsibleId: null,
    responsibleName: "[anonimizado]",
  }).where(eq(assetsTable.responsibleId, memberId));

  // 7. Anonymize event schedules
  await db.update(eventSchedulesTable).set({
    memberName: "[anonimizado]",
  }).where(eq(eventSchedulesTable.memberId, memberId));

  // 8. Unlink planning initiatives (remove responsible)
  await db.update(planningInitiativesTable).set({
    responsibleId: null,
    responsibleName: "[anonimizado]",
  }).where(eq(planningInitiativesTable.responsibleId, memberId));

  // 9. Anonymize pastoral visits (remove notes, keep pastor)
  await db.update(pastoralVisitsTable).set({
    notes: null,
    memberName: "[anonimizado]",
  }).where(eq(pastoralVisitsTable.memberId, memberId));

  // 10. Anonymize counseling (delete sessions, anonymize cases)
  const counselingCases = await db.select({ id: counselingCasesTable.id })
    .from(counselingCasesTable)
    .where(eq(counselingCasesTable.memberId, memberId));
  for (const c of counselingCases) {
    await db.delete(counselingSessionsTable).where(eq(counselingSessionsTable.caseId, c.id));
  }
  await db.update(counselingCasesTable).set({
    topic: "[anonimizado]",
    memberName: "[anonimizado]",
    status: "encerrado" as const,
  }).where(eq(counselingCasesTable.memberId, memberId));

  // 11. Anonymize song suggestions
  await db.update(songSuggestionsTable).set({
    suggestedByMemberId: null,
    suggestedByName: "[anonimizado]",
  }).where(eq(songSuggestionsTable.suggestedByMemberId, memberId));

  // 12. Anonymize liturgy items
  await db.update(liturgyItemsTable).set({
    responsibleMemberId: null,
    responsibleName: "[anonimizado]",
  }).where(eq(liturgyItemsTable.responsibleMemberId, memberId));

  // 13. Anonymize PIX donations
  await db.update(pixDonationsTable).set({
    memberId: null,
    donorName: "[anonimizado]",
    donorEmail: null,
  }).where(eq(pixDonationsTable.memberId, memberId));

  // 14. Record in member history
  await db.insert(memberHistoryTable).values({
    memberId,
    changedByUserId: adminUserId,
    changeType: "anonymized",
    fieldChanges: { reason: "LGPD - Solicitação de exclusão aprovada" },
  });

  await createAuditLog({
    userId: adminUserId,
    action: "LGPD_MEMBER_ANONYMIZED",
    resourceType: "member",
    resourceId: memberId,
    details: { memberId: "[OMITIDO - LGPD]" },
  });
}

export default router;
