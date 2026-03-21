import { Router, type IRouter, Request, Response } from "express";
import { db, membersTable, memberHistoryTable, consentRecordsTable } from "@workspace/db";
import { eq, desc, or, ilike, and, sql, count } from "drizzle-orm";
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
    status: m.status,
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
    conditions.push(eq(membersTable.status, statusFilter as "ativo" | "inativo" | "transferido" | "falecido") as unknown as ReturnType<typeof ilike>);
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
  const { fullName, cpf, dateOfBirth, sex, phone, email, addressZip, addressStreet, addressNumber, addressComplement, addressNeighborhood, addressCity, addressState, conversionDate, baptismDate, status, photoPath, familyId, familyName, lgpdConsentAccepted } = req.body;

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
    status: (status || "ativo") as "ativo" | "inativo" | "transferido" | "falecido",
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
        status: (record["status"] as "ativo" | "inativo" | "transferido" | "falecido") || "ativo",
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

  const { fullName, cpf, dateOfBirth, sex, phone, email, addressZip, addressStreet, addressNumber, addressComplement, addressNeighborhood, addressCity, addressState, conversionDate, baptismDate, status, photoPath, familyId, familyName } = req.body;

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

// DELETE /members/:id - Delete (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  await db.insert(memberHistoryTable).values({
    memberId: existing.id,
    changedByUserId: userId,
    changeType: "deleted",
    fieldChanges: { fullName: existing.fullName },
  });

  await db.delete(membersTable).where(eq(membersTable.id, req.params.id));

  await createAuditLog({
    userId,
    action: "MEMBER_DELETED",
    resourceType: "member",
    resourceId: existing.id,
    details: { fullName: existing.fullName },
    ipAddress: ip,
  });

  res.json({ message: "Membro excluído com sucesso" });
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

export default router;
