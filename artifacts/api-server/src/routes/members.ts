import { Router, type IRouter, Request, Response } from "express";
import { db, membersTable, memberHistoryTable, consentRecordsTable, financeEntriesTable, courseEnrollmentsTable, eventRegistrationsTable, ministryMembersTable, ministriesTable, assetsTable, eventSchedulesTable, planningInitiativesTable, memberPipelineHistoryTable, usersTable } from "@workspace/db";
import { gte } from "drizzle-orm";
import { eq, desc, or, ilike, and, sql, count, isNull } from "drizzle-orm";
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

function serializeMemberSummary(m: typeof membersTable.$inferSelect) {
  const cpfDecrypted = decryptIfPresent(m.cpfEncrypted);
  return {
    id: m.id,
    fullName: m.fullName,
    cpfMasked: cpfDecrypted ? maskCpf(cpfDecrypted) : "***.***.***-**",
    email: m.email,
    status: m.status,
    pipelineStage: m.pipelineStage,
    photoPath: m.photoPath,
    familyId: m.familyId,
    familyName: m.familyName,
    createdAt: m.createdAt,
  };
}

function serializeMemberDetail(m: typeof membersTable.$inferSelect) {
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
    conversionDate: m.conversionDate,
    baptismDate: m.baptismDate,
    enrollmentType: m.enrollmentType,
    status: m.status,
    pipelineStage: m.pipelineStage,
    photoPath: m.photoPath,
    familyId: m.familyId,
    familyName: m.familyName,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function buildHistoryDiff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const safeFields = ["fullName", "dateOfBirth", "sex", "email", "addressCity", "addressState", "addressNumber", "addressComplement", "conversionDate", "baptismDate", "status", "familyId", "familyName", "photoPath"];
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

// GET /members - List (paginated, search)
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const search = (req.query.search as string | undefined)?.trim();
  const statusFilter = req.query.status as string | undefined;

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

  const conditions: ReturnType<typeof ilike>[] = [];

  if (statusFilter) {
    conditions.push(eq(membersTable.status, statusFilter as "visitante" | "ativo" | "inativo" | "falecido") as unknown as ReturnType<typeof ilike>);
  }

  let members: typeof membersTable.$inferSelect[];
  let total: number;

  if (search && search.length > 0) {
    // Try CPF hash search first
    const cleanedSearch = search.replace(/\D/g, "");
    if (cleanedSearch.length >= 6) {
      const cpfHash = hashForSearch(cleanedSearch);
      const byCpf = await db.select().from(membersTable).where(
        statusFilter
          ? and(eq(membersTable.cpfHash, cpfHash), eq(membersTable.status, statusFilter as "ativo"))
          : eq(membersTable.cpfHash, cpfHash)
      ).limit(limit).offset(offset);
      if (byCpf.length > 0) {
        const [{ total: t }] = await db.select({ total: count() }).from(membersTable).where(eq(membersTable.cpfHash, cpfHash));
        members = byCpf;
        total = Number(t);
      } else {
        const nameCondition = ilike(membersTable.fullName, `%${search}%`);
        const whereClause = statusFilter
          ? and(nameCondition, eq(membersTable.status, statusFilter as "ativo"))
          : nameCondition;
        [members, [{ total: total as unknown as number }]] = await Promise.all([
          db.select().from(membersTable).where(whereClause).orderBy(desc(membersTable.createdAt)).limit(limit).offset(offset),
          db.select({ total: count() }).from(membersTable).where(whereClause),
        ]);
        total = Number(total);
      }
    } else {
      const nameCondition = ilike(membersTable.fullName, `%${search}%`);
      const whereClause = statusFilter ? and(nameCondition, eq(membersTable.status, statusFilter as "ativo")) : nameCondition;
      [members, [{ total: total as unknown as number }]] = await Promise.all([
        db.select().from(membersTable).where(whereClause).orderBy(desc(membersTable.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(membersTable).where(whereClause),
      ]);
      total = Number(total);
    }
  } else {
    const whereClause = statusFilter ? eq(membersTable.status, statusFilter as "ativo") : undefined;
    [members, [{ total: total as unknown as number }]] = await Promise.all([
      db.select().from(membersTable).where(whereClause).orderBy(desc(membersTable.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(membersTable).where(whereClause),
    ]);
    total = Number(total);
  }

  res.json({ members: members.map(serializeMemberSummary), total, page, limit });
});

// POST /members - Create
router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { fullName, cpf, dateOfBirth, sex, phone, email, addressZip, addressStreet, addressNumber, addressComplement, addressNeighborhood, addressCity, addressState, conversionDate, baptismDate, enrollmentType, status, pipelineStage, photoPath, familyId, familyName, lgpdConsentAccepted } = req.body;

  if (!fullName) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Nome completo é obrigatório" });
    return;
  }
  if (!lgpdConsentAccepted) {
    res.status(400).json({ error: "LGPD_CONSENT_REQUIRED", message: "Consentimento LGPD é obrigatório" });
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
    conversionDate: conversionDate || null,
    baptismDate: baptismDate || null,
    enrollmentType: enrollmentType || null,
    status: (status || "ativo") as any,
    pipelineStage: (pipelineStage || "culto") as any,
    photoPath: photoPath || null,
    familyId: familyId || null,
    familyName: familyName || null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

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
    fieldChanges: { fullName },
  });

  await createAuditLog({
    userId,
    action: "MEMBER_CREATED",
    resourceType: "member",
    resourceId: member.id,
    details: { fullName },
    ipAddress: ip,
  });

  res.status(201).json(serializeMemberDetail(member));
});

// GET /members/import - Must come before /:id
router.get("/import", requireAuth, requireRole("admin", "leader"), (_req, res) => {
  res.json({ message: "Use POST /members/import/csv" });
});

// POST /members/import/csv - Bulk import
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
      const [member] = await db.insert(membersTable).values({
        fullName,
        cpfEncrypted: cpfRaw ? encrypt(cpfRaw) : null,
        cpfHash: cpfRaw ? hashForSearch(cpfRaw) : null,
        dateOfBirth: record["data_nascimento"] || record["date_of_birth"] || null,
        sex: (record["sexo"] || record["sex"] || null) as "masculino" | "feminino" | "outro" | null,
        phoneEncrypted: encryptIfPresent(record["telefone"] || record["phone"] || ""),
        email: record["email"] || null,
        status: (record["status"] as "visitante" | "ativo" | "inativo" | "falecido") || "ativo",
        familyName: record["familia"] || record["family"] || null,
        familyId: null,
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

const VALID_PIPELINE_STAGES = ["culto", "pequeno_grupo", "ministerio"];

// GET /members/pipeline/summary
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

// GET /members/pipeline/stagnant?days=90
router.get("/pipeline/stagnant", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const days = Math.max(1, parseInt(req.query.days as string) || 90);
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Members who haven't changed pipeline stage in N days
  // Use the latest pipeline_history entry per member; if none, use member createdAt
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

// GET /members/me - Own member profile (any authenticated, auto-creates if missing)
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const email = req.user!.email;

  let [member] = await db.select().from(membersTable)
    .where(ilike(membersTable.email, email)).limit(1);

  // Auto-create member record linked to user on first access
  if (!member) {
    const [u] = await db.select().from(usersTable)
      .where(eq(usersTable.id, userId)).limit(1);
    const fullName = u?.name || email.split("@")[0];

    const [created] = await db.insert(membersTable).values({
      fullName,
      email,
      status: "visitante" as const,
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

  res.json(serializeMemberDetail(member));
});

// PUT /members/me - Update own profile (cannot change email)
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

  const {
    fullName, cpf, dateOfBirth, sex, phone, addressZip, addressStreet, addressNumber,
    addressComplement, addressNeighborhood, addressCity, addressState,
    conversionDate, baptismDate, photoPath,
  } = req.body;

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
  if (addressZip !== undefined) updateData.addressZipEncrypted = encryptIfPresent(addressZip);
  if (addressStreet !== undefined) updateData.addressStreetEncrypted = encryptIfPresent(addressStreet);
  if (addressNumber !== undefined) updateData.addressNumber = addressNumber || null;
  if (addressComplement !== undefined) updateData.addressComplement = addressComplement || null;
  if (addressNeighborhood !== undefined) updateData.addressNeighborhoodEncrypted = encryptIfPresent(addressNeighborhood);
  if (addressCity !== undefined) updateData.addressCity = addressCity || null;
  if (addressState !== undefined) updateData.addressState = addressState || null;
  if (conversionDate !== undefined) updateData.conversionDate = conversionDate || null;
  if (baptismDate !== undefined) updateData.baptismDate = baptismDate || null;
  if (photoPath !== undefined) updateData.photoPath = photoPath || null;

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

  res.json(serializeMemberDetail(updated));
});

// GET /members/:id - Single member
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

  res.json(serializeMemberDetail(member));
});

// PUT /members/:id - Update
router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  const { fullName, cpf, dateOfBirth, sex, phone, email, addressZip, addressStreet, addressNumber, addressComplement, addressNeighborhood, addressCity, addressState, conversionDate, baptismDate, enrollmentType, status, photoPath, familyId, familyName } = req.body;

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
  if (conversionDate !== undefined) updateData.conversionDate = conversionDate || null;
  if (baptismDate !== undefined) updateData.baptismDate = baptismDate || null;
  if (enrollmentType !== undefined) updateData.enrollmentType = enrollmentType || null;
  if (status !== undefined) updateData.status = status;
  if (photoPath !== undefined) updateData.photoPath = photoPath || null;
  if (familyId !== undefined) updateData.familyId = familyId || null;
  if (familyName !== undefined) updateData.familyName = familyName || null;

  const [updated] = await db.update(membersTable).set(updateData).where(eq(membersTable.id, req.params.id)).returning();

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

  res.json(serializeMemberDetail(updated));
});

// DELETE /members/:id - Anonymize (LGPD-compliant, admin only)
// Instead of hard delete, anonymizes PII while preserving fiscal records
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

  // 1. Anonymize member PII
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
    baptismDate: null,
    photoPath: null,
    familyId: null,
    familyName: null,
    status: "inativo" as const,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(membersTable.id, req.params.id));

  // 2. Anonymize financial records (preserve amounts)
  await db.update(financeEntriesTable).set({
    memberId: null,
    memberName: "[anonimizado]",
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(financeEntriesTable.memberId, existing.id));

  // 3. Anonymize course enrollments
  await db.update(courseEnrollmentsTable).set({
    memberName: "[anonimizado]",
  }).where(eq(courseEnrollmentsTable.memberId, existing.id));

  // 4. Anonymize event registrations
  await db.update(eventRegistrationsTable).set({
    memberName: "[anonimizado]",
  }).where(eq(eventRegistrationsTable.memberId, existing.id));

  // 5. Anonymize ministry members (soft delete + anonymize name)
  await db.update(ministryMembersTable).set({
    memberName: "[anonimizado]",
    leftAt: new Date(),
  }).where(eq(ministryMembersTable.memberId, existing.id));

  // 6. Unlink assets (remove responsible)
  await db.update(assetsTable).set({
    responsibleId: null,
    responsibleName: "[anonimizado]",
  }).where(eq(assetsTable.responsibleId, existing.id));

  // 7. Anonymize event schedules
  await db.update(eventSchedulesTable).set({
    memberName: "[anonimizado]",
  }).where(eq(eventSchedulesTable.memberId, existing.id));

  // 8. Unlink planning initiatives (remove responsible)
  await db.update(planningInitiativesTable).set({
    responsibleId: null,
    responsibleName: "[anonimizado]",
  }).where(eq(planningInitiativesTable.responsibleId, existing.id));

  // 9. Record in history
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

// POST /members/:id/cpf/reveal (Admin only)
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

// GET /members/:id/ministries — list ministries for a member
router.get("/:id/ministries", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  // Member can only see their own ministries
  if (user.role === "member") {
    const [self] = await db.select().from(membersTable)
      .where(eq(membersTable.email, user.email)).limit(1);
    if (!self || self.id !== id) {
      res.status(403).json({ error: "Sem permissao para ver ministerios deste membro" });
      return;
    }
  }

  // Check member exists
  const [member] = await db.select().from(membersTable)
    .where(eq(membersTable.id, id)).limit(1);
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

// PUT /members/:id/pipeline — move member to new stage
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

// GET /members/:id/pipeline — pipeline history
router.get("/:id/pipeline", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  // Member can see own pipeline, admin/leader can see any
  if (user.role === "member") {
    const [self] = await db.select().from(membersTable)
      .where(eq(membersTable.email, user.email)).limit(1);
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

export default router;
