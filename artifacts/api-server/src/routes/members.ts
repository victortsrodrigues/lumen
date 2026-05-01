import { Router, type IRouter, Request, Response } from "express";
import {
  db, membersTable, memberHistoryTable, consentRecordsTable, financeEntriesTable,
  courseEnrollmentsTable, eventRegistrationsTable, ministryMembersTable, ministriesTable,
  assetsTable, eventSchedulesTable, planningInitiativesTable, memberPipelineHistoryTable,
  usersTable, memberChildrenTable, memberGroupsTable, memberGroupMembersTable,
  COMMUNING_RECEPTION_MODES, NON_COMMUNING_RECEPTION_MODES,
  COMMUNING_EXCLUSION_REASONS, NON_COMMUNING_EXCLUSION_REASONS,
  isValidReceptionMode as sharedIsValidReceptionMode,
  isValidExclusionReason as sharedIsValidExclusionReason,
} from "@workspace/db";
import { eq, desc, ilike, and, count, isNull, inArray, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import {
  encrypt, decrypt, hashForSearch, maskCpf,
  encryptIfPresent, decryptIfPresent
} from "../lib/crypto.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── ENUMS / VALIDATIONS ────────────────────────────────────────────────────

const VALID_PIPELINE_STAGES = ["culto", "pequeno_grupo", "ministerio"] as const;

// Re-export aliased functions for local use (single source of truth in @workspace/db)
const isValidReceptionMode = sharedIsValidReceptionMode;
const isValidExclusionReason = sharedIsValidExclusionReason;
// Re-reference para uso interno (silenciar warnings de unused se houver)
void COMMUNING_RECEPTION_MODES;
void NON_COMMUNING_RECEPTION_MODES;
void COMMUNING_EXCLUSION_REASONS;
void NON_COMMUNING_EXCLUSION_REASONS;

// Allowlist for PUT /members/me — own profile updates
const SELF_PROFILE_ALLOWED_FIELDS = new Set([
  "fullName", "dateOfBirth", "sex", "phone",
  "addressZip", "addressStreet", "addressNumber", "addressComplement",
  "addressNeighborhood", "addressCity", "addressState",
  "photoPath", "maritalStatus", "academicEducation", "profession",
]);

// ─── SERIALIZATION ──────────────────────────────────────────────────────────

function serializeMemberSummary(m: typeof membersTable.$inferSelect) {
  const cpfDecrypted = decryptIfPresent(m.cpfEncrypted);
  return {
    id: m.id,
    fullName: m.fullName,
    cpfMasked: cpfDecrypted ? maskCpf(cpfDecrypted) : "***.***.***-**",
    email: m.email,
    classification: m.classification,
    status: m.status,
    pipelineStage: m.pipelineStage,
    receptionMode: m.receptionMode,
    photoPath: m.photoPath,
    createdAt: m.createdAt,
  };
}

function serializeMemberDetail(m: typeof membersTable.$inferSelect, extras?: {
  spouseName?: string | null;
  children?: Array<{ id: string; fullName: string }>;
  groups?: Array<{ id: string; name: string }>;
}) {
  const cpfDecrypted = decryptIfPresent(m.cpfEncrypted);
  return {
    id: m.id,
    fullName: m.fullName,
    cpfMasked: cpfDecrypted ? maskCpf(cpfDecrypted) : "***.***.***-**",
    dateOfBirth: m.dateOfBirth,
    sex: m.sex,
    phone: decryptIfPresent(m.phoneEncrypted),
    email: m.email,
    addressZip: decryptIfPresent(m.addressZipEncrypted),
    addressStreet: decryptIfPresent(m.addressStreetEncrypted),
    addressNumber: m.addressNumber,
    addressComplement: m.addressComplement,
    addressNeighborhood: decryptIfPresent(m.addressNeighborhoodEncrypted),
    addressCity: m.addressCity,
    addressState: m.addressState,
    // Eclesiástico
    classification: m.classification,
    receptionMode: m.receptionMode,
    receptionDate: m.receptionDate,
    conversionDate: m.conversionDate,
    conversionYear: m.conversionYear,
    religiousOrigin: m.religiousOrigin,
    infantBaptism: m.infantBaptism,
    infantBaptismChurch: m.infantBaptismChurch,
    infantBaptismPastor: m.infantBaptismPastor,
    parentsOrGuardians: m.parentsOrGuardians,
    // Pessoal
    maritalStatus: m.maritalStatus,
    spouseMemberId: m.spouseMemberId,
    spouseName: extras?.spouseName ?? null,
    academicEducation: m.academicEducation,
    profession: m.profession,
    // Status / exclusão
    status: m.status,
    pipelineStage: m.pipelineStage,
    exclusionReason: m.exclusionReason,
    exclusionDate: m.exclusionDate,
    exclusionNotes: m.exclusionNotes,
    exclusionLetterPath: m.exclusionLetterPath,
    photoPath: m.photoPath,
    children: extras?.children ?? [],
    groups: extras?.groups ?? [],
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function buildHistoryDiff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const safeFields = [
    "fullName", "dateOfBirth", "sex", "email", "addressCity", "addressState",
    "addressNumber", "addressComplement", "conversionDate", "receptionDate",
    "conversionYear", "religiousOrigin", "infantBaptism", "infantBaptismChurch",
    "infantBaptismPastor", "parentsOrGuardians", "classification", "receptionMode",
    "maritalStatus", "spouseMemberId", "academicEducation", "profession",
    "status", "pipelineStage", "photoPath",
  ];
  for (const field of safeFields) {
    if (before[field] !== after[field]) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  if (before["cpfEncrypted"] !== after["cpfEncrypted"]) {
    changes["cpf"] = { from: "[alterado]", to: "[alterado]" };
  }
  if (before["phoneEncrypted"] !== after["phoneEncrypted"]) {
    changes["phone"] = { from: "[alterado]", to: "[alterado]" };
  }
  return changes;
}

// ─── SPOUSE MIRROR ──────────────────────────────────────────────────────────

/**
 * Set spouse with bidirectional mirroring and chain-of-3 cleanup:
 * - If A had B and now sets C: clear B's spouse
 * - If C had D before being chosen by A: clear D's spouse
 * - Then set A↔C
 *
 * Pass spouseId=null to clear A's spouse (also clears the other side).
 */
async function setSpouse(
  memberId: string,
  newSpouseId: string | null,
  userId: string,
): Promise<void> {
  const [self] = await db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  if (!self) return;

  const previousSpouseId = self.spouseMemberId;

  if (previousSpouseId === newSpouseId) return; // no-op

  // Clear previous side(s)
  if (previousSpouseId) {
    await db.update(membersTable)
      .set({ spouseMemberId: null, updatedByUserId: userId, updatedAt: new Date() })
      .where(eq(membersTable.id, previousSpouseId));

    await db.insert(memberHistoryTable).values({
      memberId: previousSpouseId,
      changedByUserId: userId,
      changeType: "spouse_cleared",
      fieldChanges: { spouseMemberId: null, reason: `auto-cleared by chain on member ${memberId}` },
    });
  }

  if (newSpouseId) {
    if (newSpouseId === memberId) return; // self-spouse not allowed (validated earlier ideally)

    const [target] = await db.select().from(membersTable).where(eq(membersTable.id, newSpouseId)).limit(1);
    if (!target) return;

    // If target had a different spouse, clear that
    if (target.spouseMemberId && target.spouseMemberId !== memberId) {
      const previousOfTarget = target.spouseMemberId;
      await db.update(membersTable)
        .set({ spouseMemberId: null, updatedByUserId: userId, updatedAt: new Date() })
        .where(eq(membersTable.id, previousOfTarget));
      await db.insert(memberHistoryTable).values({
        memberId: previousOfTarget,
        changedByUserId: userId,
        changeType: "spouse_cleared",
        fieldChanges: { spouseMemberId: null, reason: `auto-cleared by chain on member ${memberId}` },
      });
    }

    // Set both sides
    await db.update(membersTable)
      .set({ spouseMemberId: newSpouseId, updatedByUserId: userId, updatedAt: new Date() })
      .where(eq(membersTable.id, memberId));
    await db.update(membersTable)
      .set({ spouseMemberId: memberId, updatedByUserId: userId, updatedAt: new Date() })
      .where(eq(membersTable.id, newSpouseId));

    await db.insert(memberHistoryTable).values([
      { memberId, changedByUserId: userId, changeType: "spouse_set", fieldChanges: { spouseMemberId: newSpouseId } },
      { memberId: newSpouseId, changedByUserId: userId, changeType: "spouse_set", fieldChanges: { spouseMemberId: memberId } },
    ]);
  } else {
    // Just clearing self
    await db.update(membersTable)
      .set({ spouseMemberId: null, updatedByUserId: userId, updatedAt: new Date() })
      .where(eq(membersTable.id, memberId));
    await db.insert(memberHistoryTable).values({
      memberId,
      changedByUserId: userId,
      changeType: "spouse_cleared",
      fieldChanges: { spouseMemberId: null },
    });
  }
}

// ─── LIST ───────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const role = req.user!.role;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const search = (req.query.search as string | undefined)?.trim();
  const statusFilter = req.query.status as string | undefined;
  const classificationFilter = req.query.classification as string | undefined;
  const receptionModeFilter = req.query.receptionMode as string | undefined;
  const includeExcluded = req.query.includeExcluded === "true";

  // Members can only see their own profile
  if (role === "member") {
    const [member] = await db.select().from(membersTable).where(
      ilike(membersTable.email, req.user!.email)
    ).limit(1);
    if (!member) {
      res.json({ members: [], total: 0, page: 1, limit });
      return;
    }
    res.json({ members: [serializeMemberSummary(member)], total: 1, page: 1, limit });
    return;
  }

  const conditions = [];
  if (statusFilter) conditions.push(eq(membersTable.status, statusFilter as "ativo"));
  if (classificationFilter) conditions.push(eq(membersTable.classification, classificationFilter as "comungante"));
  if (receptionModeFilter) conditions.push(eq(membersTable.receptionMode, receptionModeFilter as "profissao_fe"));
  if (!includeExcluded && !statusFilter) {
    // by default, hide demitido unless explicitly requested
    // (keep visible if user is filtering by status)
    // No-op: leaving demitido visible by default to match expectations.
  }

  if (search && search.length > 0) {
    const cleanedSearch = search.replace(/\D/g, "");
    if (cleanedSearch.length >= 6) {
      const cpfHash = hashForSearch(cleanedSearch);
      conditions.push(eq(membersTable.cpfHash, cpfHash));
    } else {
      conditions.push(ilike(membersTable.fullName, `%${search}%`));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [members, [{ total }]] = await Promise.all([
    db.select().from(membersTable).where(whereClause)
      .orderBy(desc(membersTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(membersTable).where(whereClause),
  ]);

  res.json({ members: members.map(serializeMemberSummary), total: Number(total), page, limit });
});

// ─── CREATE ─────────────────────────────────────────────────────────────────

router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const {
    fullName, cpf, dateOfBirth, sex, phone, email,
    addressZip, addressStreet, addressNumber, addressComplement,
    addressNeighborhood, addressCity, addressState,
    classification, receptionMode, receptionDate, conversionDate, conversionYear,
    religiousOrigin, infantBaptism, infantBaptismChurch, infantBaptismPastor, parentsOrGuardians,
    maritalStatus, spouseMemberId, academicEducation, profession,
    status, pipelineStage, photoPath, lgpdConsentAccepted,
  } = req.body;

  if (!fullName) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Nome completo é obrigatório" });
    return;
  }
  if (!lgpdConsentAccepted) {
    res.status(400).json({ error: "LGPD_CONSENT_REQUIRED", message: "Consentimento LGPD é obrigatório" });
    return;
  }

  const finalClassification = classification || "comungante";
  if (!["comungante", "nao_comungante"].includes(finalClassification)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Classificação inválida" });
    return;
  }
  if (receptionMode && !isValidReceptionMode(finalClassification, receptionMode)) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `Modo de recepção inválido para classificação "${finalClassification}".`,
    });
    return;
  }
  if (spouseMemberId === req.params.id) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Cônjuge não pode ser o próprio membro" });
    return;
  }

  const cpfEncrypted = cpf ? encrypt(cpf.replace(/\D/g, "")) : null;
  const cpfHash = cpf ? hashForSearch(cpf) : null;

  const [member] = await db.insert(membersTable).values({
    fullName,
    cpfEncrypted,
    cpfHash,
    dateOfBirth: dateOfBirth || null,
    sex: sex || null,
    phoneEncrypted: encryptIfPresent(phone),
    email: email || null,
    addressZipEncrypted: encryptIfPresent(addressZip),
    addressStreetEncrypted: encryptIfPresent(addressStreet),
    addressNumber: addressNumber || null,
    addressComplement: addressComplement || null,
    addressNeighborhoodEncrypted: encryptIfPresent(addressNeighborhood),
    addressCity: addressCity || null,
    addressState: addressState || null,
    classification: finalClassification as "comungante",
    receptionMode: receptionMode || null,
    receptionDate: receptionDate || null,
    conversionDate: conversionDate || null,
    conversionYear: conversionYear ? Number(conversionYear) : null,
    religiousOrigin: religiousOrigin || null,
    infantBaptism: !!infantBaptism,
    infantBaptismChurch: infantBaptismChurch || null,
    infantBaptismPastor: infantBaptismPastor || null,
    parentsOrGuardians: parentsOrGuardians || null,
    maritalStatus: maritalStatus || null,
    spouseMemberId: null, // set via setSpouse below to ensure mirroring
    academicEducation: academicEducation || null,
    profession: profession || null,
    status: (status || "ativo") as any,
    pipelineStage: (pipelineStage || "culto") as any,
    photoPath: photoPath || null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  if (spouseMemberId) {
    await setSpouse(member.id, spouseMemberId, userId);
  }

  await db.insert(consentRecordsTable).values({
    userId,
    consentType: "lgpd_member_registration",
    accepted: true,
    ipAddress: ip,
  });

  await db.insert(memberHistoryTable).values({
    memberId: member.id,
    changedByUserId: userId,
    changeType: "created",
    fieldChanges: { fullName, classification: finalClassification },
  });

  await createAuditLog({
    userId,
    action: "MEMBER_CREATED",
    resourceType: "member",
    resourceId: member.id,
    details: { fullName, classification: finalClassification },
    ipAddress: ip,
  });

  // Reload to include spouse mirroring effects
  const [reloaded] = await db.select().from(membersTable).where(eq(membersTable.id, member.id)).limit(1);
  res.status(201).json(serializeMemberDetail(reloaded));
});

// ─── CSV IMPORT ─────────────────────────────────────────────────────────────

router.get("/import", requireAuth, requireRole("admin", "leader"), (_req, res) => {
  res.json({ message: "Use POST /members/import/csv" });
});

router.post("/import/csv", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { csvContent, lgpdConsentAccepted } = req.body;

  if (!lgpdConsentAccepted) {
    res.status(400).json({ error: "LGPD_CONSENT_REQUIRED", message: "Consentimento LGPD é obrigatório" });
    return;
  }
  if (!csvContent || typeof csvContent !== "string") {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Conteúdo CSV é obrigatório" });
    return;
  }

  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "CSV deve ter pelo menos uma linha de dados além do cabeçalho" });
    return;
  }

  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const results: { row: number; success: boolean; memberId?: string; fullName?: string; error?: string }[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = i + 1;
    const values = lines[i].split(",").map(v => v.trim());
    const record: Record<string, string> = {};
    header.forEach((h, idx) => { record[h] = values[idx] || ""; });

    const fullName = record["nome"] || record["full_name"] || record["name"];
    if (!fullName) {
      results.push({ row, success: false, error: "Nome completo é obrigatório" });
      failed++;
      continue;
    }

    try {
      const cpfRaw = record["cpf"]?.replace(/\D/g, "") || "";
      const csvClassification = record["classificacao"] || record["classification"] || "comungante";
      const [member] = await db.insert(membersTable).values({
        fullName,
        cpfEncrypted: cpfRaw ? encrypt(cpfRaw) : null,
        cpfHash: cpfRaw ? hashForSearch(cpfRaw) : null,
        dateOfBirth: record["data_nascimento"] || record["date_of_birth"] || null,
        sex: (record["sexo"] || record["sex"] || null) as "masculino" | "feminino" | null,
        phoneEncrypted: encryptIfPresent(record["telefone"] || record["phone"] || ""),
        email: record["email"] || null,
        classification: (csvClassification === "nao_comungante" ? "nao_comungante" : "comungante") as any,
        status: (record["status"] as "ativo") || "ativo",
        createdByUserId: userId,
        updatedByUserId: userId,
      }).returning();

      await db.insert(memberHistoryTable).values({
        memberId: member.id,
        changedByUserId: userId,
        changeType: "created",
        fieldChanges: { source: "csv_import", fullName },
      });

      results.push({ row, success: true, memberId: member.id, fullName });
      succeeded++;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      results.push({ row, success: false, fullName, error: errorMsg });
      failed++;
    }
  }

  await db.insert(consentRecordsTable).values({
    userId,
    consentType: "lgpd_csv_import",
    accepted: true,
    ipAddress: ip,
  });

  await createAuditLog({
    userId,
    action: "MEMBER_CSV_IMPORT",
    resourceType: "member",
    details: { total: lines.length - 1, succeeded, failed },
    ipAddress: ip,
  });

  res.json({ total: lines.length - 1, succeeded, failed, results });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE — Static routes BEFORE /:id to avoid Express collision
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/pipeline/summary", requireAuth, requireRole("admin", "leader"), async (_req: Request, res: Response) => {
  const members = await db.select({ stage: membersTable.pipelineStage, total: count() })
    .from(membersTable)
    .where(eq(membersTable.status, "ativo"))
    .groupBy(membersTable.pipelineStage);

  const summary: Record<string, number> = {};
  for (const stage of VALID_PIPELINE_STAGES) summary[stage] = 0;
  for (const m of members) summary[m.stage] = Number(m.total);

  res.json({ summary, total: Object.values(summary).reduce((a, b) => a + b, 0) });
});

router.get("/pipeline/stagnant", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const days = Math.max(1, parseInt(req.query.days as string) || 90);
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const allActive = await db.select().from(membersTable)
    .where(eq(membersTable.status, "ativo"));

  const stagnant = [];
  for (const m of allActive) {
    const [latest] = await db.select().from(memberPipelineHistoryTable)
      .where(eq(memberPipelineHistoryTable.memberId, m.id))
      .orderBy(desc(memberPipelineHistoryTable.createdAt))
      .limit(1);

    const lastChange = latest?.createdAt || m.createdAt;
    if (lastChange < threshold) {
      stagnant.push({
        id: m.id,
        fullName: m.fullName,
        pipelineStage: m.pipelineStage,
        daysSinceChange: Math.floor((Date.now() - lastChange.getTime()) / (24 * 60 * 60 * 1000)),
        lastChangeAt: lastChange.toISOString(),
      });
    }
  }

  res.json({ stagnant, total: stagnant.length, thresholdDays: days });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SELF PROFILE (/me) — allowlist enforcement
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const email = req.user!.email;

  let [member] = await db.select().from(membersTable)
    .where(ilike(membersTable.email, email)).limit(1);

  if (!member) {
    const [u] = await db.select().from(usersTable)
      .where(eq(usersTable.id, userId)).limit(1);
    const fullName = u?.name || email.split("@")[0];

    const [created] = await db.insert(membersTable).values({
      fullName,
      email,
      classification: "comungante",
      status: "ativo" as const,
      pipelineStage: "culto" as const,
      createdByUserId: userId,
      updatedByUserId: userId,
    }).returning();

    await db.insert(memberHistoryTable).values({
      memberId: created.id,
      changedByUserId: userId,
      changeType: "created",
      fieldChanges: { fullName, email, autoCreated: true },
    });

    await createAuditLog({
      userId,
      action: "MEMBER_AUTO_CREATED",
      resourceType: "member",
      resourceId: created.id,
      details: { reason: "first_profile_access" },
      ipAddress: getIp(req),
    });

    member = created;
  }

  const extras = await loadMemberExtras(member);
  res.json(serializeMemberDetail(member, extras));
});

router.put("/me", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const email = req.user!.email;
  const ip = getIp(req);

  const [existing] = await db.select().from(membersTable)
    .where(ilike(membersTable.email, email)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Perfil de membro não encontrado" });
    return;
  }

  // Allowlist enforcement
  const bodyKeys = Object.keys(req.body || {});
  const forbidden = bodyKeys.filter(k => !SELF_PROFILE_ALLOWED_FIELDS.has(k));
  if (forbidden.length > 0) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `Campos não permitidos para edição própria: ${forbidden.join(", ")}`,
    });
    return;
  }

  const {
    fullName, dateOfBirth, sex, phone, addressZip, addressStreet, addressNumber,
    addressComplement, addressNeighborhood, addressCity, addressState,
    photoPath, maritalStatus, academicEducation, profession,
  } = req.body;

  const updateData: Partial<typeof membersTable.$inferInsert> = {
    updatedAt: new Date(),
    updatedByUserId: userId,
  };
  if (fullName !== undefined) updateData.fullName = fullName;
  if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth || null;
  if (sex !== undefined) updateData.sex = sex || null;
  if (phone !== undefined) updateData.phoneEncrypted = encryptIfPresent(phone);
  if (addressZip !== undefined) updateData.addressZipEncrypted = encryptIfPresent(addressZip);
  if (addressStreet !== undefined) updateData.addressStreetEncrypted = encryptIfPresent(addressStreet);
  if (addressNumber !== undefined) updateData.addressNumber = addressNumber || null;
  if (addressComplement !== undefined) updateData.addressComplement = addressComplement || null;
  if (addressNeighborhood !== undefined) updateData.addressNeighborhoodEncrypted = encryptIfPresent(addressNeighborhood);
  if (addressCity !== undefined) updateData.addressCity = addressCity || null;
  if (addressState !== undefined) updateData.addressState = addressState || null;
  if (photoPath !== undefined) updateData.photoPath = photoPath || null;
  if (maritalStatus !== undefined) updateData.maritalStatus = maritalStatus || null;
  if (academicEducation !== undefined) updateData.academicEducation = academicEducation || null;
  if (profession !== undefined) updateData.profession = profession || null;

  const [updated] = await db.update(membersTable).set(updateData)
    .where(eq(membersTable.id, existing.id)).returning();

  const diff = buildHistoryDiff(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);

  await db.insert(memberHistoryTable).values({
    memberId: updated.id,
    changedByUserId: userId,
    changeType: "updated",
    fieldChanges: diff,
  });

  await createAuditLog({
    userId,
    action: "PROFILE_UPDATED",
    resourceType: "member",
    resourceId: updated.id,
    details: { changes: Object.keys(diff) },
    ipAddress: ip,
  });

  const extras = await loadMemberExtras(updated);
  res.json(serializeMemberDetail(updated, extras));
});

// Helper: load spouse name + children + groups
async function loadMemberExtras(m: typeof membersTable.$inferSelect) {
  const result: { spouseName: string | null; children: Array<{ id: string; fullName: string }>; groups: Array<{ id: string; name: string }> } = {
    spouseName: null,
    children: [],
    groups: [],
  };

  if (m.spouseMemberId) {
    const [spouse] = await db.select({ fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.id, m.spouseMemberId)).limit(1);
    result.spouseName = spouse?.fullName ?? null;
  }

  const childRows = await db.select({
    childId: memberChildrenTable.childId,
    fullName: membersTable.fullName,
  }).from(memberChildrenTable)
    .innerJoin(membersTable, eq(membersTable.id, memberChildrenTable.childId))
    .where(eq(memberChildrenTable.parentId, m.id));
  result.children = childRows.map(c => ({ id: c.childId, fullName: c.fullName }));

  const groupRows = await db.select({
    groupId: memberGroupMembersTable.groupId,
    name: memberGroupsTable.name,
  }).from(memberGroupMembersTable)
    .innerJoin(memberGroupsTable, eq(memberGroupsTable.id, memberGroupMembersTable.groupId))
    .where(and(
      eq(memberGroupMembersTable.memberId, m.id),
      isNull(memberGroupsTable.deletedAt),
    ));
  result.groups = groupRows.map(g => ({ id: g.groupId, name: g.name }));

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETAIL / UPDATE / DELETE
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  if (!member) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  if (role === "member" && member.email !== req.user!.email) {
    res.status(403).json({ error: "FORBIDDEN", message: "Acesso negado" });
    return;
  }

  await createAuditLog({
    userId,
    action: "MEMBER_VIEWED",
    resourceType: "member",
    resourceId: member.id,
    ipAddress: ip,
  });

  const extras = await loadMemberExtras(member);
  res.json(serializeMemberDetail(member, extras));
});

router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  const {
    fullName, cpf, dateOfBirth, sex, phone, email,
    addressZip, addressStreet, addressNumber, addressComplement,
    addressNeighborhood, addressCity, addressState,
    classification, receptionMode, receptionDate, conversionDate, conversionYear,
    religiousOrigin, infantBaptism, infantBaptismChurch, infantBaptismPastor, parentsOrGuardians,
    maritalStatus, spouseMemberId, academicEducation, profession,
    status, photoPath,
  } = req.body;

  const finalClassification = classification ?? existing.classification;
  if (receptionMode && !isValidReceptionMode(finalClassification, receptionMode)) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `Modo de recepção inválido para classificação "${finalClassification}".`,
    });
    return;
  }
  if (spouseMemberId === existing.id) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Cônjuge não pode ser o próprio membro" });
    return;
  }

  const updateData: Partial<typeof membersTable.$inferInsert> = {
    updatedAt: new Date(),
    updatedByUserId: userId,
  };
  if (fullName !== undefined) updateData.fullName = fullName;
  if (cpf !== undefined) {
    updateData.cpfEncrypted = cpf ? encrypt(cpf.replace(/\D/g, "")) : null;
    updateData.cpfHash = cpf ? hashForSearch(cpf) : null;
  }
  if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth || null;
  if (sex !== undefined) updateData.sex = sex || null;
  if (phone !== undefined) updateData.phoneEncrypted = encryptIfPresent(phone);
  if (email !== undefined) updateData.email = email || null;
  if (addressZip !== undefined) updateData.addressZipEncrypted = encryptIfPresent(addressZip);
  if (addressStreet !== undefined) updateData.addressStreetEncrypted = encryptIfPresent(addressStreet);
  if (addressNumber !== undefined) updateData.addressNumber = addressNumber || null;
  if (addressComplement !== undefined) updateData.addressComplement = addressComplement || null;
  if (addressNeighborhood !== undefined) updateData.addressNeighborhoodEncrypted = encryptIfPresent(addressNeighborhood);
  if (addressCity !== undefined) updateData.addressCity = addressCity || null;
  if (addressState !== undefined) updateData.addressState = addressState || null;
  if (classification !== undefined) updateData.classification = classification;
  if (receptionMode !== undefined) updateData.receptionMode = receptionMode || null;
  if (receptionDate !== undefined) updateData.receptionDate = receptionDate || null;
  if (conversionDate !== undefined) updateData.conversionDate = conversionDate || null;
  if (conversionYear !== undefined) updateData.conversionYear = conversionYear ? Number(conversionYear) : null;
  if (religiousOrigin !== undefined) updateData.religiousOrigin = religiousOrigin || null;
  if (infantBaptism !== undefined) updateData.infantBaptism = !!infantBaptism;
  if (infantBaptismChurch !== undefined) updateData.infantBaptismChurch = infantBaptismChurch || null;
  if (infantBaptismPastor !== undefined) updateData.infantBaptismPastor = infantBaptismPastor || null;
  if (parentsOrGuardians !== undefined) updateData.parentsOrGuardians = parentsOrGuardians || null;
  if (maritalStatus !== undefined) updateData.maritalStatus = maritalStatus || null;
  if (academicEducation !== undefined) updateData.academicEducation = academicEducation || null;
  if (profession !== undefined) updateData.profession = profession || null;
  if (status !== undefined) updateData.status = status;
  if (photoPath !== undefined) updateData.photoPath = photoPath || null;

  await db.update(membersTable).set(updateData).where(eq(membersTable.id, req.params.id));

  // Spouse mirror is handled separately
  if (spouseMemberId !== undefined) {
    await setSpouse(req.params.id, spouseMemberId || null, userId);
  }

  const [updated] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  const diff = buildHistoryDiff(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);

  await db.insert(memberHistoryTable).values({
    memberId: updated.id,
    changedByUserId: userId,
    changeType: "updated",
    fieldChanges: diff,
  });

  await createAuditLog({
    userId,
    action: "MEMBER_UPDATED",
    resourceType: "member",
    resourceId: updated.id,
    details: { changes: Object.keys(diff) },
    ipAddress: ip,
  });

  const extras = await loadMemberExtras(updated);
  res.json(serializeMemberDetail(updated, extras));
});

// DELETE /members/:id - Anonymize (LGPD-compliant, admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  const anonName = `Membro Anonimizado #${existing.id.slice(0, 8)}`;
  const anonEmail = `anon-${existing.id.slice(0, 8)}@anonimizado.local`;

  // Clear spouse on the other side if any
  if (existing.spouseMemberId) {
    await db.update(membersTable)
      .set({ spouseMemberId: null, updatedByUserId: userId, updatedAt: new Date() })
      .where(eq(membersTable.id, existing.spouseMemberId));
  }

  // Delete children links (both directions)
  await db.delete(memberChildrenTable).where(or(
    eq(memberChildrenTable.parentId, existing.id),
    eq(memberChildrenTable.childId, existing.id),
  ));

  // Delete group memberships
  await db.delete(memberGroupMembersTable).where(eq(memberGroupMembersTable.memberId, existing.id));

  // 1. Anonymize member PII (status → rol_apartado per Fase 1 plan)
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
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(membersTable.id, req.params.id));

  // 2. Anonymize financial records
  await db.update(financeEntriesTable).set({
    memberId: null,
    memberName: "[anonimizado]",
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(financeEntriesTable.memberId, existing.id));

  // 3-7. Other module anonymizations
  await db.update(courseEnrollmentsTable).set({ memberName: "[anonimizado]" })
    .where(eq(courseEnrollmentsTable.memberId, existing.id));
  await db.update(eventRegistrationsTable).set({ memberName: "[anonimizado]" })
    .where(eq(eventRegistrationsTable.memberId, existing.id));
  await db.update(ministryMembersTable).set({ memberName: "[anonimizado]", leftAt: new Date() })
    .where(eq(ministryMembersTable.memberId, existing.id));
  await db.update(assetsTable).set({ responsibleId: null, responsibleName: "[anonimizado]" })
    .where(eq(assetsTable.responsibleId, existing.id));
  await db.update(eventSchedulesTable).set({ memberName: "[anonimizado]" })
    .where(eq(eventSchedulesTable.memberId, existing.id));
  await db.update(planningInitiativesTable).set({ responsibleId: null, responsibleName: "[anonimizado]" })
    .where(eq(planningInitiativesTable.responsibleId, existing.id));

  await db.insert(memberHistoryTable).values({
    memberId: existing.id,
    changedByUserId: userId,
    changeType: "anonymized",
    fieldChanges: { reason: "Exclusão de membro — dados anonimizados conforme LGPD" },
  });

  await createAuditLog({
    userId,
    action: "MEMBER_ANONYMIZED",
    resourceType: "member",
    resourceId: existing.id,
    details: { memberId: "[OMITIDO - LGPD]" },
    ipAddress: ip,
  });

  res.json({ message: "Dados do membro anonimizados com sucesso. Registros fiscais mantidos por obrigação legal." });
});

// GET /members/:id/history
router.get("/:id/history", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const history = await db.select().from(memberHistoryTable)
    .where(eq(memberHistoryTable.memberId, req.params.id))
    .orderBy(desc(memberHistoryTable.createdAt));

  res.json({ history });
});

// POST /members/:id/cpf/reveal
router.post("/:id/cpf/reveal", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  if (!member) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }
  if (!member.cpfEncrypted) {
    res.status(404).json({ error: "NOT_FOUND", message: "CPF não cadastrado para este membro" });
    return;
  }

  const cpfDecrypted = decrypt(member.cpfEncrypted);
  const cpfFormatted = cpfDecrypted.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

  await createAuditLog({
    userId,
    action: "MEMBER_CPF_REVEALED",
    resourceType: "member",
    resourceId: member.id,
    details: { fullName: member.fullName },
    ipAddress: ip,
  });

  res.json({ cpf: cpfFormatted });
});

// GET /members/:id/ministries
router.get("/:id/ministries", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  if (user.role === "member") {
    const [self] = await db.select().from(membersTable).where(eq(membersTable.email, user.email)).limit(1);
    if (!self || self.id !== id) {
      res.status(403).json({ error: "Sem permissao para ver ministerios deste membro" });
      return;
    }
  }

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member) {
    res.status(404).json({ error: "Membro nao encontrado" });
    return;
  }

  const memberships = await db.select({
    id: ministryMembersTable.id,
    ministryId: ministryMembersTable.ministryId,
    role: ministryMembersTable.role,
    joinedAt: ministryMembersTable.joinedAt,
    ministryName: ministriesTable.name,
    ministryStatus: ministriesTable.status,
  }).from(ministryMembersTable)
    .innerJoin(ministriesTable, eq(ministryMembersTable.ministryId, ministriesTable.id))
    .where(and(
      eq(ministryMembersTable.memberId, id),
      isNull(ministryMembersTable.leftAt),
      isNull(ministriesTable.deletedAt),
    ));

  res.json({
    ministries: memberships.map(m => ({
      id: m.id,
      ministryId: m.ministryId,
      ministryName: m.ministryName,
      ministryStatus: m.ministryStatus,
      role: m.role,
      joinedAt: m.joinedAt?.toISOString(),
    })),
  });
});

// PUT /members/:id/pipeline
router.put("/:id/pipeline", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const ip = getIp(req);

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member) {
    res.status(404).json({ error: "Membro nao encontrado" });
    return;
  }

  const { stage, reason } = req.body;
  if (!stage || !VALID_PIPELINE_STAGES.includes(stage)) {
    res.status(400).json({ error: `Etapa invalida. Valores aceitos: ${VALID_PIPELINE_STAGES.join(", ")}` });
    return;
  }

  const fromStage = member.pipelineStage;

  await db.update(membersTable).set({
    pipelineStage: stage as any,
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(membersTable.id, id));

  await db.insert(memberPipelineHistoryTable).values({
    memberId: id,
    fromStage,
    toStage: stage,
    changedByUserId: user.userId,
    reason: reason || null,
  });

  await createAuditLog({
    userId: user.userId,
    action: "MEMBER_PIPELINE_CHANGED",
    resourceType: "member",
    resourceId: id,
    details: { fromStage, toStage: stage, reason },
    ipAddress: ip,
  });

  res.json({ message: "Etapa atualizada", fromStage, toStage: stage });
});

// GET /members/:id/pipeline
router.get("/:id/pipeline", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  if (user.role === "member") {
    const [self] = await db.select().from(membersTable).where(eq(membersTable.email, user.email)).limit(1);
    if (!self || self.id !== id) {
      res.status(403).json({ error: "Sem permissao para ver historico deste membro" });
      return;
    }
  }

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member) {
    res.status(404).json({ error: "Membro nao encontrado" });
    return;
  }

  const history = await db.select().from(memberPipelineHistoryTable)
    .where(eq(memberPipelineHistoryTable.memberId, id))
    .orderBy(desc(memberPipelineHistoryTable.createdAt));

  res.json({
    currentStage: member.pipelineStage,
    history: history.map(h => ({
      id: h.id,
      fromStage: h.fromStage,
      toStage: h.toStage,
      reason: h.reason,
      createdAt: h.createdAt?.toISOString(),
    })),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXCLUSION
// ═══════════════════════════════════════════════════════════════════════════════

// POST /members/:id/exclusion — register exclusion (admin only)
router.post("/:id/exclusion", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  const { reason, date, notes } = req.body;
  if (!reason) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Motivo é obrigatório" });
    return;
  }
  if (!isValidExclusionReason(existing.classification, reason)) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `Motivo "${reason}" inválido para classificação "${existing.classification}".`,
    });
    return;
  }

  const exclusionDate = date || new Date().toISOString().slice(0, 10);

  // Special case: profissao_fe_migracao — non-communing migrating to communing.
  // Don't set status=demitido. Update classification + receptionMode instead.
  if (reason === "profissao_fe_migracao") {
    await db.update(membersTable).set({
      classification: "comungante" as const,
      receptionMode: "profissao_fe" as const,
      receptionDate: exclusionDate,
      parentsOrGuardians: null, // not relevant for communing
      updatedByUserId: userId,
      updatedAt: new Date(),
    }).where(eq(membersTable.id, existing.id));

    await db.insert(memberHistoryTable).values({
      memberId: existing.id,
      changedByUserId: userId,
      changeType: "migrated_to_communing",
      fieldChanges: {
        fromClassification: "nao_comungante",
        receptionMode: "profissao_fe",
        receptionDate: exclusionDate,
        notes: notes || null,
      },
    });

    await createAuditLog({
      userId,
      action: "MEMBER_MIGRATED_TO_COMMUNING",
      resourceType: "member",
      resourceId: existing.id,
      details: { receptionDate: exclusionDate },
      ipAddress: ip,
    });

    const [reloaded] = await db.select().from(membersTable).where(eq(membersTable.id, existing.id)).limit(1);
    const extras = await loadMemberExtras(reloaded);
    res.json(serializeMemberDetail(reloaded, extras));
    return;
  }

  // Standard exclusion
  await db.update(membersTable).set({
    status: "demitido" as const,
    exclusionReason: reason,
    exclusionDate,
    exclusionNotes: notes || null,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(membersTable.id, existing.id));

  await db.insert(memberHistoryTable).values({
    memberId: existing.id,
    changedByUserId: userId,
    changeType: "excluded",
    fieldChanges: { reason, date: exclusionDate, notes: notes || null },
  });

  await createAuditLog({
    userId,
    action: "MEMBER_EXCLUDED",
    resourceType: "member",
    resourceId: existing.id,
    details: { reason, date: exclusionDate },
    ipAddress: ip,
  });

  const [reloaded] = await db.select().from(membersTable).where(eq(membersTable.id, existing.id)).limit(1);
  const extras = await loadMemberExtras(reloaded);
  res.json(serializeMemberDetail(reloaded, extras));
});

// POST /members/:id/exclusion/revert — revert exclusion
router.post("/:id/exclusion/revert", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }
  if (existing.status !== "demitido") {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Membro não está excluído" });
    return;
  }

  const previousReason = existing.exclusionReason;
  const previousDate = existing.exclusionDate;
  const previousLetterPath = existing.exclusionLetterPath;

  await db.update(membersTable).set({
    status: "ativo" as const,
    exclusionReason: null,
    exclusionDate: null,
    exclusionNotes: null,
    exclusionLetterPath: null,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(membersTable.id, existing.id));

  // Note: storage cleanup of letter file is best-effort; not blocking
  // (TODO: implement storage.deleteFile() when storage provider supports it)

  await db.insert(memberHistoryTable).values({
    memberId: existing.id,
    changedByUserId: userId,
    changeType: "exclusion_reverted",
    fieldChanges: { previousReason, previousDate, previousLetterPath },
  });

  await createAuditLog({
    userId,
    action: "MEMBER_EXCLUSION_REVERTED",
    resourceType: "member",
    resourceId: existing.id,
    details: { previousReason },
    ipAddress: ip,
  });

  const [reloaded] = await db.select().from(membersTable).where(eq(membersTable.id, existing.id)).limit(1);
  const extras = await loadMemberExtras(reloaded);
  res.json(serializeMemberDetail(reloaded, extras));
});

// POST /members/:id/exclusion/letter — save letter PDF path after frontend upload
router.post("/:id/exclusion/letter", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  const { letterPath, destinationChurch, responsiblePastor, secretary, notes } = req.body;
  if (!letterPath) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "letterPath é obrigatório" });
    return;
  }

  await db.update(membersTable).set({
    exclusionLetterPath: letterPath,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(membersTable.id, existing.id));

  await db.insert(memberHistoryTable).values({
    memberId: existing.id,
    changedByUserId: userId,
    changeType: "transfer_letter_generated",
    fieldChanges: { destinationChurch, letterPath, responsiblePastor, secretary, notes },
  });

  await createAuditLog({
    userId,
    action: "MEMBER_TRANSFER_LETTER_GENERATED",
    resourceType: "member",
    resourceId: existing.id,
    details: { destinationChurch },
    ipAddress: ip,
  });

  res.json({ letterPath });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHILDREN
// ═══════════════════════════════════════════════════════════════════════════════

// POST /members/:id/children — add child link
router.post("/:id/children", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const parentId = req.params.id;
  const { childMemberId } = req.body;

  if (!childMemberId) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "childMemberId é obrigatório" });
    return;
  }
  if (parentId === childMemberId) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Membro não pode ser pai/mãe de si mesmo" });
    return;
  }

  const [parent, child] = await Promise.all([
    db.select().from(membersTable).where(eq(membersTable.id, parentId)).limit(1),
    db.select().from(membersTable).where(eq(membersTable.id, childMemberId)).limit(1),
  ]);
  if (!parent[0] || !child[0]) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  // Cycle prevention: child cannot already be a parent of parent
  const [reverse] = await db.select().from(memberChildrenTable)
    .where(and(
      eq(memberChildrenTable.parentId, childMemberId),
      eq(memberChildrenTable.childId, parentId),
    )).limit(1);
  if (reverse) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Vínculo cíclico detectado: o filho já é pai/mãe deste membro.",
    });
    return;
  }

  // Duplicate prevention
  const [duplicate] = await db.select().from(memberChildrenTable)
    .where(and(
      eq(memberChildrenTable.parentId, parentId),
      eq(memberChildrenTable.childId, childMemberId),
    )).limit(1);
  if (duplicate) {
    res.status(409).json({ error: "ALREADY_EXISTS", message: "Vínculo já existe" });
    return;
  }

  await db.insert(memberChildrenTable).values({
    parentId,
    childId: childMemberId,
    createdByUserId: userId,
  });

  await db.insert(memberHistoryTable).values({
    memberId: parentId,
    changedByUserId: userId,
    changeType: "child_added",
    fieldChanges: { childMemberId },
  });

  res.status(201).json({ parentId, childId: childMemberId });
});

// DELETE /members/:id/children/:childId — remove child link
router.delete("/:id/children/:childId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { id: parentId, childId } = req.params;

  const result = await db.delete(memberChildrenTable).where(and(
    eq(memberChildrenTable.parentId, parentId),
    eq(memberChildrenTable.childId, childId),
  )).returning();

  if (result.length === 0) {
    res.status(404).json({ error: "NOT_FOUND", message: "Vínculo não encontrado" });
    return;
  }

  await db.insert(memberHistoryTable).values({
    memberId: parentId,
    changedByUserId: userId,
    changeType: "child_removed",
    fieldChanges: { childMemberId: childId },
  });

  res.json({ message: "Vínculo removido" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUPS — member-group join/leave (CRUD do group em routes/member-groups.ts)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /members/:memberId/groups/:groupId — link member to group
router.post("/:memberId/groups/:groupId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { memberId, groupId } = req.params;

  const [member, group] = await Promise.all([
    db.select().from(membersTable).where(eq(membersTable.id, memberId)).limit(1),
    db.select().from(memberGroupsTable).where(and(eq(memberGroupsTable.id, groupId), isNull(memberGroupsTable.deletedAt))).limit(1),
  ]);
  if (!member[0] || !group[0]) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro ou grupo não encontrado" });
    return;
  }

  const [existing] = await db.select().from(memberGroupMembersTable)
    .where(and(
      eq(memberGroupMembersTable.memberId, memberId),
      eq(memberGroupMembersTable.groupId, groupId),
    )).limit(1);
  if (existing) {
    res.status(409).json({ error: "ALREADY_EXISTS", message: "Membro já está no grupo" });
    return;
  }

  await db.insert(memberGroupMembersTable).values({ memberId, groupId, createdByUserId: userId });

  await db.insert(memberHistoryTable).values({
    memberId,
    changedByUserId: userId,
    changeType: "group_joined",
    fieldChanges: { groupId },
  });

  res.status(201).json({ memberId, groupId });
});

// DELETE /members/:memberId/groups/:groupId — unlink
router.delete("/:memberId/groups/:groupId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { memberId, groupId } = req.params;

  const result = await db.delete(memberGroupMembersTable).where(and(
    eq(memberGroupMembersTable.memberId, memberId),
    eq(memberGroupMembersTable.groupId, groupId),
  )).returning();

  if (result.length === 0) {
    res.status(404).json({ error: "NOT_FOUND", message: "Vínculo não encontrado" });
    return;
  }

  await db.insert(memberHistoryTable).values({
    memberId,
    changedByUserId: userId,
    changeType: "group_left",
    fieldChanges: { groupId },
  });

  res.json({ message: "Membro removido do grupo" });
});

export default router;
