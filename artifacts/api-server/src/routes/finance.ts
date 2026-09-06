import { Router, type IRouter, Request, Response } from "express";
import { db, financeEntriesTable, financeExpensesTable, financeMonthlyClosingsTable, membersTable, budgetsTable, budgetItemsTable } from "@workspace/db";
import { eq, desc, and, isNull, gte, lte, sql, count, sum, or, ilike } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function lastDayOfMonth(year: string | number, month: string | number): string {
  const y = Number(year);
  const m = Number(month);
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of current
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function formatAmount(v: unknown): string {
  return v == null ? "0.00" : String(v);
}

// Safe serializer: never expose individual tithe member name in leader context
function serializeEntry(
  e: typeof financeEntriesTable.$inferSelect,
  role: string
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: e.id,
    type: e.type,
    date: e.date,
    amount: formatAmount(e.amount),
    paymentMethod: e.paymentMethod,
    offeringType: e.offeringType,
    donorName: e.donorName,
    donationPurpose: e.donationPurpose,
    isAnonymous: e.isAnonymous,
    notes: e.notes,
    monthClosingId: e.monthClosingId,
    createdAt: e.createdAt,
    deletedAt: e.deletedAt,
  };

  // Leaders cannot see individual tithe member linkage
  if (role === "admin") {
    base.memberId = e.memberId;
    base.memberName = e.memberName;
  } else {
    // For leaders: anonymize tithe member
    base.memberId = null;
    base.memberName = e.isAnonymous ? null : "[oculto]";
  }

  return base;
}

function serializeExpense(e: typeof financeExpensesTable.$inferSelect): Record<string, unknown> {
  return {
    id: e.id,
    date: e.date,
    amount: formatAmount(e.amount),
    category: e.category,
    description: e.description,
    supplier: e.supplier,
    receiptPath: e.receiptPath,
    notes: e.notes,
    monthClosingId: e.monthClosingId,
    initiativeId: e.initiativeId,
    createdAt: e.createdAt,
    deletedAt: e.deletedAt,
  };
}

// ─── HELPERS: Check month closing ────────────────────────────────────────────

async function isMonthClosed(year: string, month: string): Promise<boolean> {
  const [closing] = await db
    .select()
    .from(financeMonthlyClosingsTable)
    .where(and(eq(financeMonthlyClosingsTable.year, year), eq(financeMonthlyClosingsTable.month, month)))
    .limit(1);
  return !!closing;
}

function getYearMonth(dateStr: string): { year: string; month: string } {
  const d = new Date(dateStr);
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, "0"),
  };
}

// ─── ENTRIES ─────────────────────────────────────────────────────────────────

// GET /finance/entries
router.get("/entries", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const role = req.user!.role;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const type = req.query.type as string | undefined;
  const memberId = req.query.memberId as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const includeDeleted = req.query.includeDeleted === "true" && role === "admin";

  const conditions = [];
  if (!includeDeleted) conditions.push(isNull(financeEntriesTable.deletedAt));
  if (type) conditions.push(eq(financeEntriesTable.type, type as "dizimo" | "oferta" | "doacao"));
  if (memberId && role === "admin") conditions.push(eq(financeEntriesTable.memberId, memberId));
  if (dateFrom) conditions.push(gte(financeEntriesTable.date, dateFrom));
  if (dateTo) conditions.push(lte(financeEntriesTable.date, dateTo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [entries, [{ total }]] = await Promise.all([
    db.select().from(financeEntriesTable).where(where).orderBy(desc(financeEntriesTable.date), desc(financeEntriesTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(financeEntriesTable).where(where),
  ]);

  res.json({ entries: entries.map((e) => serializeEntry(e, role)), total: Number(total), page, limit });
});

// POST /finance/entries
router.post("/entries", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { type, date, amount, paymentMethod, memberId, isAnonymous, offeringType, donorName, donationPurpose, notes } = req.body;

  if (!type || !date || !amount || !paymentMethod) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: tipo, data, valor, forma de pagamento" });
    return;
  }

  const { year, month } = getYearMonth(date);
  if (await isMonthClosed(year, month)) {
    res.status(409).json({ error: "MONTH_CLOSED", message: `O mês ${month}/${year} já foi fechado. Lançamentos são somente leitura.` });
    return;
  }

  let memberName: string | null = null;
  if (memberId && !isAnonymous) {
    const [member] = await db.select({ fullName: membersTable.fullName }).from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
    memberName = member?.fullName ?? null;
  }

  const [entry] = await db.insert(financeEntriesTable).values({
    type: type as "dizimo" | "oferta" | "doacao",
    date,
    amount: String(amount),
    paymentMethod: paymentMethod as "dinheiro" | "pix" | "transferencia" | "cartao",
    memberId: isAnonymous ? null : (memberId ?? null),
    memberName: isAnonymous ? null : memberName,
    isAnonymous: Boolean(isAnonymous),
    offeringType: offeringType ?? null,
    donorName: donorName ?? null,
    donationPurpose: donationPurpose ?? null,
    notes: notes ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  await createAuditLog({
    userId,
    action: "FINANCE_ENTRY_CREATED",
    resourceType: "finance_entry",
    resourceId: entry.id,
    details: { type, date, amount: "[OMITIDO]", paymentMethod },
    ipAddress: ip,
  });

  res.status(201).json(serializeEntry(entry, "admin"));
});

// GET /finance/entries/:id
router.get("/entries/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const role = req.user!.role;
  const [entry] = await db.select().from(financeEntriesTable).where(eq(financeEntriesTable.id, req.params.id)).limit(1);
  if (!entry) {
    res.status(404).json({ error: "NOT_FOUND", message: "Lançamento não encontrado" });
    return;
  }
  res.json(serializeEntry(entry, role));
});

// PUT /finance/entries/:id
router.put("/entries/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(financeEntriesTable).where(eq(financeEntriesTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Lançamento não encontrado" });
    return;
  }
  if (existing.deletedAt) {
    res.status(409).json({ error: "DELETED", message: "Lançamento foi excluído" });
    return;
  }
  if (existing.monthClosingId) {
    res.status(409).json({ error: "MONTH_CLOSED", message: "Mês fechado. Lançamento é somente leitura." });
    return;
  }

  const { date, amount, paymentMethod, memberId, isAnonymous, offeringType, donorName, donationPurpose, notes } = req.body;

  // If date changed, check new month
  const checkDate = date ?? existing.date;
  const { year, month } = getYearMonth(checkDate);
  if (await isMonthClosed(year, month)) {
    res.status(409).json({ error: "MONTH_CLOSED", message: `O mês ${month}/${year} já foi fechado.` });
    return;
  }

  let memberName = existing.memberName;
  if (memberId !== undefined) {
    if (!memberId || isAnonymous) {
      memberName = null;
    } else {
      const [member] = await db.select({ fullName: membersTable.fullName }).from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
      memberName = member?.fullName ?? null;
    }
  }

  const [updated] = await db.update(financeEntriesTable).set({
    date: date ?? existing.date,
    amount: amount != null ? String(amount) : existing.amount,
    paymentMethod: paymentMethod ?? existing.paymentMethod,
    memberId: isAnonymous ? null : (memberId ?? existing.memberId),
    memberName: isAnonymous ? null : memberName,
    isAnonymous: isAnonymous !== undefined ? Boolean(isAnonymous) : existing.isAnonymous,
    offeringType: offeringType !== undefined ? offeringType : existing.offeringType,
    donorName: donorName !== undefined ? donorName : existing.donorName,
    donationPurpose: donationPurpose !== undefined ? donationPurpose : existing.donationPurpose,
    notes: notes !== undefined ? notes : existing.notes,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(financeEntriesTable.id, req.params.id)).returning();

  await createAuditLog({
    userId,
    action: "FINANCE_ENTRY_UPDATED",
    resourceType: "finance_entry",
    resourceId: updated.id,
    details: { date: updated.date, amount: "[OMITIDO]" },
    ipAddress: ip,
  });

  res.json(serializeEntry(updated, "admin"));
});

// DELETE /finance/entries/:id — SOFT DELETE (obrigação fiscal)
router.delete("/entries/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(financeEntriesTable).where(eq(financeEntriesTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Lançamento não encontrado" });
    return;
  }
  if (existing.deletedAt) {
    res.status(409).json({ error: "ALREADY_DELETED", message: "Lançamento já foi excluído" });
    return;
  }
  if (existing.monthClosingId) {
    res.status(409).json({ error: "MONTH_CLOSED", message: "Mês fechado. Lançamento é somente leitura." });
    return;
  }

  await db.update(financeEntriesTable).set({ deletedAt: new Date(), deletedByUserId: userId, updatedAt: new Date() }).where(eq(financeEntriesTable.id, req.params.id));

  await createAuditLog({
    userId,
    action: "FINANCE_ENTRY_DELETED",
    resourceType: "finance_entry",
    resourceId: existing.id,
    details: { type: existing.type, date: existing.date },
    ipAddress: ip,
  });

  res.json({ message: "Lançamento excluído (soft delete). Dado fiscal mantido por obrigação legal." });
});

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

// GET /finance/expenses
router.get("/expenses", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const category = req.query.category as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const includeDeleted = req.query.includeDeleted === "true" && req.user!.role === "admin";

  const conditions = [];
  if (!includeDeleted) conditions.push(isNull(financeExpensesTable.deletedAt));
  if (category) conditions.push(eq(financeExpensesTable.category, category as "aluguel"));
  if (dateFrom) conditions.push(gte(financeExpensesTable.date, dateFrom));
  if (dateTo) conditions.push(lte(financeExpensesTable.date, dateTo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [expenses, [{ total }]] = await Promise.all([
    db.select().from(financeExpensesTable).where(where).orderBy(desc(financeExpensesTable.date), desc(financeExpensesTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(financeExpensesTable).where(where),
  ]);

  res.json({ expenses: expenses.map(serializeExpense), total: Number(total), page, limit });
});

// POST /finance/expenses
router.post("/expenses", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { date, amount, category, description, supplier, receiptPath, notes, initiativeId } = req.body;

  if (!date || !amount || !category || !description) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: data, valor, categoria, descrição" });
    return;
  }

  const { year, month } = getYearMonth(date);
  if (await isMonthClosed(year, month)) {
    res.status(409).json({ error: "MONTH_CLOSED", message: `O mês ${month}/${year} já foi fechado.` });
    return;
  }

  const [expense] = await db.insert(financeExpensesTable).values({
    date,
    amount: String(amount),
    category: category as "aluguel",
    description,
    supplier: supplier ?? null,
    receiptPath: receiptPath ?? null,
    notes: notes ?? null,
    initiativeId: initiativeId ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  await createAuditLog({
    userId,
    action: "FINANCE_EXPENSE_CREATED",
    resourceType: "finance_expense",
    resourceId: expense.id,
    details: { date, amount: "[OMITIDO]", category, description },
    ipAddress: ip,
  });

  res.status(201).json(serializeExpense(expense));
});

// GET /finance/expenses/:id
router.get("/expenses/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const [expense] = await db.select().from(financeExpensesTable).where(eq(financeExpensesTable.id, req.params.id)).limit(1);
  if (!expense) {
    res.status(404).json({ error: "NOT_FOUND", message: "Despesa não encontrada" });
    return;
  }
  res.json(serializeExpense(expense));
});

// PUT /finance/expenses/:id
router.put("/expenses/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(financeExpensesTable).where(eq(financeExpensesTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Despesa não encontrada" });
    return;
  }
  if (existing.deletedAt) {
    res.status(409).json({ error: "DELETED", message: "Despesa foi excluída" });
    return;
  }
  if (existing.monthClosingId) {
    res.status(409).json({ error: "MONTH_CLOSED", message: "Mês fechado. Despesa é somente leitura." });
    return;
  }

  const { date, amount, category, description, supplier, receiptPath, notes, initiativeId } = req.body;
  const checkDate = date ?? existing.date;
  const { year, month } = getYearMonth(checkDate);
  if (await isMonthClosed(year, month)) {
    res.status(409).json({ error: "MONTH_CLOSED", message: `O mês ${month}/${year} já foi fechado.` });
    return;
  }

  const [updated] = await db.update(financeExpensesTable).set({
    date: date ?? existing.date,
    amount: amount != null ? String(amount) : existing.amount,
    category: category ?? existing.category,
    description: description ?? existing.description,
    supplier: supplier !== undefined ? supplier : existing.supplier,
    receiptPath: receiptPath !== undefined ? receiptPath : existing.receiptPath,
    notes: notes !== undefined ? notes : existing.notes,
    initiativeId: initiativeId !== undefined ? (initiativeId || null) : existing.initiativeId,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(financeExpensesTable.id, req.params.id)).returning();

  await createAuditLog({
    userId,
    action: "FINANCE_EXPENSE_UPDATED",
    resourceType: "finance_expense",
    resourceId: updated.id,
    details: { date: updated.date, amount: "[OMITIDO]", category: updated.category },
    ipAddress: ip,
  });

  res.json(serializeExpense(updated));
});

// DELETE /finance/expenses/:id — SOFT DELETE
router.delete("/expenses/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(financeExpensesTable).where(eq(financeExpensesTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Despesa não encontrada" });
    return;
  }
  if (existing.deletedAt) {
    res.status(409).json({ error: "ALREADY_DELETED", message: "Despesa já foi excluída" });
    return;
  }
  if (existing.monthClosingId) {
    res.status(409).json({ error: "MONTH_CLOSED", message: "Mês fechado. Despesa é somente leitura." });
    return;
  }

  await db.update(financeExpensesTable).set({ deletedAt: new Date(), deletedByUserId: userId, updatedAt: new Date() }).where(eq(financeExpensesTable.id, req.params.id));

  await createAuditLog({
    userId,
    action: "FINANCE_EXPENSE_DELETED",
    resourceType: "finance_expense",
    resourceId: existing.id,
    details: { date: existing.date, category: existing.category },
    ipAddress: ip,
  });

  res.json({ message: "Despesa excluída (soft delete). Dado fiscal mantido por obrigação legal." });
});

// POST /finance/expenses/:id/receipt-url — check receipt availability
router.post("/expenses/:id/receipt-url", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const [expense] = await db.select().from(financeExpensesTable).where(eq(financeExpensesTable.id, req.params.id)).limit(1);
  if (!expense || !expense.receiptPath) {
    res.status(404).json({ error: "NOT_FOUND", message: "Comprovante não encontrado" });
    return;
  }
  try {
    const available = await objectStorageService.fileExists(expense.receiptPath);
    res.json({ receiptPath: expense.receiptPath, available });
  } catch {
    res.status(500).json({ error: "RECEIPT_UNAVAILABLE", message: "Comprovante indisponível" });
  }
});

// ─── MONTHLY CLOSINGS ────────────────────────────────────────────────────────

// GET /finance/closings
router.get("/closings", requireAuth, requireRole("admin"), async (_req, res) => {
  const closings = await db.select().from(financeMonthlyClosingsTable).orderBy(desc(financeMonthlyClosingsTable.year), desc(financeMonthlyClosingsTable.month));
  res.json({ closings });
});

// POST /finance/closings — close a month
router.post("/closings", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { year, month, notes } = req.body;

  if (!year || !month) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Ano e mês são obrigatórios" });
    return;
  }

  if (await isMonthClosed(year, month)) {
    res.status(409).json({ error: "ALREADY_CLOSED", message: `O mês ${month}/${year} já está fechado.` });
    return;
  }

  const [closing] = await db.insert(financeMonthlyClosingsTable).values({
    year: String(year),
    month: String(month).padStart(2, "0"),
    closedByUserId: userId,
    notes: notes ?? null,
  }).returning();

  // Tag all entries and expenses of that month with closing ID
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = lastDayOfMonth(year, month);

  await Promise.all([
    db.update(financeEntriesTable)
      .set({ monthClosingId: closing.id })
      .where(and(isNull(financeEntriesTable.monthClosingId), gte(financeEntriesTable.date, startDate), lte(financeEntriesTable.date, endDate))),
    db.update(financeExpensesTable)
      .set({ monthClosingId: closing.id })
      .where(and(isNull(financeExpensesTable.monthClosingId), gte(financeExpensesTable.date, startDate), lte(financeExpensesTable.date, endDate))),
  ]);

  await createAuditLog({
    userId,
    action: "FINANCE_MONTH_CLOSED",
    resourceType: "finance_closing",
    resourceId: closing.id,
    details: { year, month },
    ipAddress: ip,
  });

  res.status(201).json({ closing });
});

// ─── SUMMARY & REPORTS ───────────────────────────────────────────────────────

// GET /finance/summary?year=2024&month=01
router.get("/summary", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const role = req.user!.role;
  const year = (req.query.year as string) || String(new Date().getFullYear());
  const month = (req.query.month as string) || String(new Date().getMonth() + 1).padStart(2, "0");

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = lastDayOfMonth(year, month);

  const [entriesByType, expensesByCategory, closing] = await Promise.all([
    db
      .select({
        type: financeEntriesTable.type,
        total: sum(financeEntriesTable.amount),
        count: count(),
      })
      .from(financeEntriesTable)
      .where(and(isNull(financeEntriesTable.deletedAt), gte(financeEntriesTable.date, startDate), lte(financeEntriesTable.date, endDate)))
      .groupBy(financeEntriesTable.type),

    db
      .select({
        category: financeExpensesTable.category,
        total: sum(financeExpensesTable.amount),
        count: count(),
      })
      .from(financeExpensesTable)
      .where(and(isNull(financeExpensesTable.deletedAt), gte(financeExpensesTable.date, startDate), lte(financeExpensesTable.date, endDate)))
      .groupBy(financeExpensesTable.category),

    db
      .select()
      .from(financeMonthlyClosingsTable)
      .where(and(eq(financeMonthlyClosingsTable.year, year), eq(financeMonthlyClosingsTable.month, String(month).padStart(2, "0"))))
      .limit(1),
  ]);

  const totalEntries = entriesByType.reduce((acc, r) => acc + parseFloat(r.total ?? "0"), 0);
  const totalExpenses = expensesByCategory.reduce((acc, r) => acc + parseFloat(r.total ?? "0"), 0);

  res.json({
    year,
    month,
    isClosed: !!closing[0],
    closedAt: closing[0]?.closedAt ?? null,
    totalEntries: totalEntries.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    balance: (totalEntries - totalExpenses).toFixed(2),
    entriesByType: entriesByType.map((r) => ({
      type: r.type,
      total: parseFloat(r.total ?? "0").toFixed(2),
      count: Number(r.count),
    })),
    expensesByCategory: expensesByCategory.map((r) => ({
      category: r.category,
      total: parseFloat(r.total ?? "0").toFixed(2),
      count: Number(r.count),
    })),
  });
});

// GET /finance/dashboard — últimos 12 meses + saldo atual + top 5 despesas
router.get("/dashboard", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const today = new Date();
  const months: { year: string; month: string; label: string }[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      year: String(d.getFullYear()),
      month: String(d.getMonth() + 1).padStart(2, "0"),
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
    });
  }

  const startDate = `${months[0].year}-${months[0].month}-01`;
  const endDate = lastDayOfMonth(today.getFullYear(), today.getMonth() + 1);

  const [entriesByMonth, expensesByMonth, topExpenseCategories] = await Promise.all([
    db
      .select({
        year: sql<string>`to_char(${financeEntriesTable.date}::date, 'YYYY')`,
        month: sql<string>`to_char(${financeEntriesTable.date}::date, 'MM')`,
        total: sum(financeEntriesTable.amount),
      })
      .from(financeEntriesTable)
      .where(and(isNull(financeEntriesTable.deletedAt), gte(financeEntriesTable.date, startDate), lte(financeEntriesTable.date, endDate)))
      .groupBy(sql`to_char(${financeEntriesTable.date}::date, 'YYYY')`, sql`to_char(${financeEntriesTable.date}::date, 'MM')`),

    db
      .select({
        year: sql<string>`to_char(${financeExpensesTable.date}::date, 'YYYY')`,
        month: sql<string>`to_char(${financeExpensesTable.date}::date, 'MM')`,
        total: sum(financeExpensesTable.amount),
      })
      .from(financeExpensesTable)
      .where(and(isNull(financeExpensesTable.deletedAt), gte(financeExpensesTable.date, startDate), lte(financeExpensesTable.date, endDate)))
      .groupBy(sql`to_char(${financeExpensesTable.date}::date, 'YYYY')`, sql`to_char(${financeExpensesTable.date}::date, 'MM')`),

    db
      .select({
        category: financeExpensesTable.category,
        total: sum(financeExpensesTable.amount),
        count: count(),
      })
      .from(financeExpensesTable)
      .where(and(isNull(financeExpensesTable.deletedAt), gte(financeExpensesTable.date, startDate), lte(financeExpensesTable.date, endDate)))
      .groupBy(financeExpensesTable.category)
      .orderBy(desc(sum(financeExpensesTable.amount)))
      .limit(5),
  ]);

  // Build chart data aligned to months array
  const chartData = months.map(({ year, month, label }) => {
    const entry = entriesByMonth.find((e) => e.year === year && e.month === month);
    const expense = expensesByMonth.find((e) => e.year === year && e.month === month);
    return {
      label,
      year,
      month,
      totalEntries: parseFloat(entry?.total ?? "0").toFixed(2),
      totalExpenses: parseFloat(expense?.total ?? "0").toFixed(2),
    };
  });

  const totalBalance = chartData.reduce((acc, d) => acc + parseFloat(d.totalEntries) - parseFloat(d.totalExpenses), 0);
  const currentMonthEntries = parseFloat(chartData[11]?.totalEntries ?? "0");
  const currentMonthExpenses = parseFloat(chartData[11]?.totalExpenses ?? "0");

  res.json({
    chartData,
    totalBalance: totalBalance.toFixed(2),
    currentMonth: {
      totalEntries: currentMonthEntries.toFixed(2),
      totalExpenses: currentMonthExpenses.toFixed(2),
      balance: (currentMonthEntries - currentMonthExpenses).toFixed(2),
    },
    topExpenseCategories: topExpenseCategories.map((r) => ({
      category: r.category,
      total: parseFloat(r.total ?? "0").toFixed(2),
      count: Number(r.count),
    })),
  });
});

// GET /finance/report?dateFrom=...&dateTo=...&type=...&category=...&memberId=...
router.get("/report", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const role = req.user!.role;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const type = req.query.type as string | undefined;
  const category = req.query.category as string | undefined;
  const memberId = req.query.memberId as string | undefined;

  const entryConditions = [isNull(financeEntriesTable.deletedAt)];
  if (dateFrom) entryConditions.push(gte(financeEntriesTable.date, dateFrom));
  if (dateTo) entryConditions.push(lte(financeEntriesTable.date, dateTo));
  if (type) entryConditions.push(eq(financeEntriesTable.type, type as "dizimo"));
  if (memberId && role === "admin") entryConditions.push(eq(financeEntriesTable.memberId, memberId));

  const expenseConditions = [isNull(financeExpensesTable.deletedAt)];
  if (dateFrom) expenseConditions.push(gte(financeExpensesTable.date, dateFrom));
  if (dateTo) expenseConditions.push(lte(financeExpensesTable.date, dateTo));
  if (category) expenseConditions.push(eq(financeExpensesTable.category, category as "aluguel"));

  const [entries, expenses] = await Promise.all([
    type === undefined || ["dizimo", "oferta", "doacao"].includes(type)
      ? db.select().from(financeEntriesTable).where(and(...entryConditions)).orderBy(desc(financeEntriesTable.date))
      : [],
    category !== undefined || !type
      ? db.select().from(financeExpensesTable).where(and(...expenseConditions)).orderBy(desc(financeExpensesTable.date))
      : [],
  ]);

  const totalEntries = (entries as typeof financeEntriesTable.$inferSelect[]).reduce((acc, e) => acc + parseFloat(String(e.amount ?? 0)), 0);
  const totalExpenses = (expenses as typeof financeExpensesTable.$inferSelect[]).reduce((acc, e) => acc + parseFloat(String(e.amount ?? 0)), 0);

  res.json({
    dateFrom,
    dateTo,
    totalEntries: totalEntries.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    balance: (totalEntries - totalExpenses).toFixed(2),
    entries: (entries as typeof financeEntriesTable.$inferSelect[]).map((e) => serializeEntry(e, role)),
    expenses: (expenses as typeof financeExpensesTable.$inferSelect[]).map(serializeExpense),
  });
});

// POST /finance/members/:memberId/anonymize — LGPD: desvincular membro sem apagar valores
router.post("/members/:memberId/anonymize", requireAuth, requireRole("admin"), async (req: Request<{ memberId: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { memberId } = req.params;

  const result = await db
    .update(financeEntriesTable)
    .set({ memberId: null, memberName: "[anonimizado]", updatedAt: new Date(), updatedByUserId: userId })
    .where(eq(financeEntriesTable.memberId, memberId));

  await createAuditLog({
    userId,
    action: "FINANCE_MEMBER_ANONYMIZED",
    resourceType: "finance_entry",
    details: { memberId: "[OMITIDO - LGPD]" },
    ipAddress: ip,
  });

  res.json({ message: "Dados do membro anonimizados nos registros financeiros. Valores mantidos por obrigação fiscal." });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGETS
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_EXPENSE_CATEGORIES = ["aluguel", "agua", "luz", "internet", "salarios", "manutencao", "eventos", "missoes", "benevolencia", "material", "outros"];
const VALID_REVENUE_CATEGORIES = ["dizimo", "oferta", "doacao"];

function validateBudgetItemCategory(type: string, category: string): boolean {
  if (type === "despesa") return VALID_EXPENSE_CATEGORIES.includes(category);
  if (type === "receita") return VALID_REVENUE_CATEGORIES.includes(category);
  return false;
}

function serializeBudget(b: typeof budgetsTable.$inferSelect) {
  return {
    id: b.id,
    year: b.year,
    status: b.status,
    notes: b.notes,
    createdAt: b.createdAt?.toISOString(),
    updatedAt: b.updatedAt?.toISOString(),
  };
}

function serializeBudgetItem(i: typeof budgetItemsTable.$inferSelect) {
  return {
    id: i.id,
    budgetId: i.budgetId,
    type: i.type,
    category: i.category,
    month: i.month,
    plannedAmount: i.plannedAmount,
    notes: i.notes,
    createdAt: i.createdAt?.toISOString(),
    updatedAt: i.updatedAt?.toISOString(),
  };
}

// GET /finance/budgets
router.get("/budgets", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const year = req.query.year as string | undefined;
  const conditions = year ? [eq(budgetsTable.year, year)] : [];

  const budgets = await db.select().from(budgetsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(budgetsTable.year));

  res.json({ budgets: budgets.map(serializeBudget) });
});

// GET /finance/budgets/:id
router.get("/budgets/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;

  const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
  if (!budget) {
    res.status(404).json({ error: "Orcamento nao encontrado" });
    return;
  }

  const items = await db.select().from(budgetItemsTable)
    .where(eq(budgetItemsTable.budgetId, id))
    .orderBy(budgetItemsTable.type, budgetItemsTable.category, budgetItemsTable.month);

  res.json({ ...serializeBudget(budget), items: items.map(serializeBudgetItem) });
});

// POST /finance/budgets
router.post("/budgets", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { year, notes } = req.body;
  const user = req.user!;
  const ip = getIp(req);

  if (!year) {
    res.status(400).json({ error: "Ano e obrigatorio" });
    return;
  }

  // Check no approved/closed budget for same year
  const [existing] = await db.select().from(budgetsTable)
    .where(and(
      eq(budgetsTable.year, year),
      or(eq(budgetsTable.status, "aprovado"), eq(budgetsTable.status, "encerrado")),
    )).limit(1);

  if (existing) {
    res.status(409).json({ error: `Ja existe um orcamento aprovado/encerrado para ${year}` });
    return;
  }

  const [budget] = await db.insert(budgetsTable).values({
    year,
    notes: notes || null,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "BUDGET_CREATED",
    resourceType: "budget",
    resourceId: budget.id,
    details: { year },
    ipAddress: ip,
  });

  res.status(201).json(serializeBudget(budget));
});

// PUT /finance/budgets/:id
router.put("/budgets/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const ip = getIp(req);

  const [existing] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Orcamento nao encontrado" });
    return;
  }

  const { status, notes } = req.body;
  const updates: Record<string, any> = {
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  };
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes || null;

  const [updated] = await db.update(budgetsTable).set(updates)
    .where(eq(budgetsTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "BUDGET_UPDATED",
    resourceType: "budget",
    resourceId: id,
    details: { status, year: existing.year },
    ipAddress: ip,
  });

  res.json(serializeBudget(updated));
});

// DELETE /finance/budgets/:id
router.delete("/budgets/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const ip = getIp(req);

  const [existing] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Orcamento nao encontrado" });
    return;
  }

  if (existing.status !== "rascunho") {
    res.status(409).json({ error: "Apenas orcamentos em rascunho podem ser removidos" });
    return;
  }

  // Delete items first, then budget
  await db.delete(budgetItemsTable).where(eq(budgetItemsTable.budgetId, id));
  await db.delete(budgetsTable).where(eq(budgetsTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "BUDGET_DELETED",
    resourceType: "budget",
    resourceId: id,
    details: { year: existing.year },
    ipAddress: ip,
  });

  res.json({ message: "Orcamento removido com sucesso" });
});

// POST /finance/budgets/:id/items (batch)
router.post("/budgets/:id/items", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const ip = getIp(req);

  const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
  if (!budget) {
    res.status(404).json({ error: "Orcamento nao encontrado" });
    return;
  }

  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Array de items e obrigatorio" });
    return;
  }

  // Validate all items
  for (const item of items) {
    if (!item.type || !item.category || !item.month || !item.plannedAmount) {
      res.status(400).json({ error: "Cada item precisa de type, category, month e plannedAmount" });
      return;
    }
    if (!["receita", "despesa"].includes(item.type)) {
      res.status(400).json({ error: `Tipo invalido: ${item.type}. Use 'receita' ou 'despesa'` });
      return;
    }
    if (!validateBudgetItemCategory(item.type, item.category)) {
      const validList = item.type === "despesa" ? VALID_EXPENSE_CATEGORIES : VALID_REVENUE_CATEGORIES;
      res.status(400).json({ error: `Categoria '${item.category}' invalida para tipo '${item.type}'. Valores aceitos: ${validList.join(", ")}` });
      return;
    }
  }

  // Check for duplicates
  for (const item of items) {
    const [dup] = await db.select().from(budgetItemsTable)
      .where(and(
        eq(budgetItemsTable.budgetId, id),
        eq(budgetItemsTable.type, item.type as any),
        eq(budgetItemsTable.category, item.category),
        eq(budgetItemsTable.month, item.month),
      )).limit(1);
    if (dup) {
      res.status(409).json({ error: `Item duplicado: ${item.type}/${item.category}/${item.month} ja existe` });
      return;
    }
  }

  const created = [];
  for (const item of items) {
    const [row] = await db.insert(budgetItemsTable).values({
      budgetId: id,
      type: item.type as any,
      category: item.category,
      month: item.month,
      plannedAmount: String(item.plannedAmount),
      notes: item.notes || null,
      createdByUserId: user.userId,
      updatedByUserId: user.userId,
    }).returning();
    created.push(serializeBudgetItem(row));
  }

  await createAuditLog({
    userId: user.userId,
    action: "BUDGET_ITEM_ADDED",
    resourceType: "budget",
    resourceId: id,
    details: { count: created.length },
    ipAddress: ip,
  });

  res.status(201).json({ items: created });
});

// PUT /finance/budgets/:budgetId/items/:itemId
router.put("/budgets/:budgetId/items/:itemId", requireAuth, requireRole("admin"), async (req: Request<{ budgetId: string; itemId: string }>, res: Response) => {
  const { budgetId, itemId } = req.params;
  const user = req.user!;
  const ip = getIp(req);

  const [existing] = await db.select().from(budgetItemsTable)
    .where(and(eq(budgetItemsTable.id, itemId), eq(budgetItemsTable.budgetId, budgetId)));
  if (!existing) {
    res.status(404).json({ error: "Item nao encontrado" });
    return;
  }

  const { plannedAmount, notes } = req.body;
  const updates: Record<string, any> = {
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  };
  if (plannedAmount !== undefined) updates.plannedAmount = String(plannedAmount);
  if (notes !== undefined) updates.notes = notes || null;

  const [updated] = await db.update(budgetItemsTable).set(updates)
    .where(eq(budgetItemsTable.id, itemId)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "BUDGET_ITEM_UPDATED",
    resourceType: "budget_item",
    resourceId: itemId,
    details: { budgetId, plannedAmount },
    ipAddress: ip,
  });

  res.json(serializeBudgetItem(updated));
});

// DELETE /finance/budgets/:budgetId/items/:itemId
router.delete("/budgets/:budgetId/items/:itemId", requireAuth, requireRole("admin"), async (req: Request<{ budgetId: string; itemId: string }>, res: Response) => {
  const { budgetId, itemId } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(budgetItemsTable)
    .where(and(eq(budgetItemsTable.id, itemId), eq(budgetItemsTable.budgetId, budgetId)));
  if (!existing) {
    res.status(404).json({ error: "Item nao encontrado" });
    return;
  }

  await db.delete(budgetItemsTable).where(eq(budgetItemsTable.id, itemId));
  res.json({ message: "Item removido" });
});

// GET /finance/budgets/:id/comparison
router.get("/budgets/:id/comparison", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;

  const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
  if (!budget) {
    res.status(404).json({ error: "Orcamento nao encontrado" });
    return;
  }

  const items = await db.select().from(budgetItemsTable)
    .where(eq(budgetItemsTable.budgetId, id));

  // Get actual data for the budget year
  const yearStart = `${budget.year}-01-01`;
  const yearEnd = `${budget.year}-12-31`;

  // Revenue actuals by type/month
  const revenueActuals = await db.select({
    type: financeEntriesTable.type,
    month: sql<string>`to_char(${financeEntriesTable.date}::date, 'MM')`,
    total: sum(financeEntriesTable.amount),
  }).from(financeEntriesTable)
    .where(and(
      isNull(financeEntriesTable.deletedAt),
      gte(financeEntriesTable.date, yearStart),
      lte(financeEntriesTable.date, yearEnd),
    ))
    .groupBy(financeEntriesTable.type, sql`to_char(${financeEntriesTable.date}::date, 'MM')`);

  // Expense actuals by category/month
  const expenseActuals = await db.select({
    category: financeExpensesTable.category,
    month: sql<string>`to_char(${financeExpensesTable.date}::date, 'MM')`,
    total: sum(financeExpensesTable.amount),
  }).from(financeExpensesTable)
    .where(and(
      isNull(financeExpensesTable.deletedAt),
      gte(financeExpensesTable.date, yearStart),
      lte(financeExpensesTable.date, yearEnd),
    ))
    .groupBy(financeExpensesTable.category, sql`to_char(${financeExpensesTable.date}::date, 'MM')`);

  // Build comparison
  const comparison = items.map(item => {
    let actual = "0";
    if (item.type === "receita") {
      const match = revenueActuals.find(r => r.type === item.category && r.month === item.month);
      actual = match?.total ?? "0";
    } else {
      const match = expenseActuals.find(e => e.category === item.category && e.month === item.month);
      actual = match?.total ?? "0";
    }
    const planned = parseFloat(item.plannedAmount ?? "0");
    const actualVal = parseFloat(actual);
    const variance = planned - actualVal;
    const variancePercent = planned > 0 ? Math.round((variance / planned) * 100) : 0;

    return {
      type: item.type,
      category: item.category,
      month: item.month,
      planned: planned.toFixed(2),
      actual: actualVal.toFixed(2),
      variance: variance.toFixed(2),
      variancePercent,
    };
  });

  res.json({
    budgetId: id,
    year: budget.year,
    status: budget.status,
    comparison,
  });
});

export default router;
