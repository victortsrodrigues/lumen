import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  strategicDirectivesTable,
  strategicObjectivesTable,
  planningInitiativesTable,
  initiativeStepsTable,
  financeExpensesTable,
  membersTable,
} from "@workspace/db";
import { eq, and, isNull, count, sum, desc, lt } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeDirective(d: typeof strategicDirectivesTable.$inferSelect) {
  return {
    id: d.id, title: d.title, description: d.description,
    startYear: d.startYear, endYear: d.endYear, status: d.status,
    createdAt: d.createdAt?.toISOString(), updatedAt: d.updatedAt?.toISOString(),
  };
}

function serializeObjective(o: typeof strategicObjectivesTable.$inferSelect) {
  return {
    id: o.id, directiveId: o.directiveId, title: o.title, description: o.description,
    targetValue: o.targetValue, currentValue: o.currentValue, unit: o.unit,
    deadline: o.deadline, status: o.status,
    createdAt: o.createdAt?.toISOString(), updatedAt: o.updatedAt?.toISOString(),
  };
}

function serializeInitiative(i: typeof planningInitiativesTable.$inferSelect) {
  return {
    id: i.id, objectiveId: i.objectiveId, ministryId: i.ministryId,
    title: i.title, description: i.description, type: i.type,
    priority: i.priority, status: i.status,
    responsibleId: i.responsibleId, responsibleName: i.responsibleName,
    plannedBudget: i.plannedBudget, startDate: i.startDate, endDate: i.endDate,
    completedAt: i.completedAt?.toISOString(), notes: i.notes,
    createdAt: i.createdAt?.toISOString(), updatedAt: i.updatedAt?.toISOString(),
  };
}

function serializeStep(s: typeof initiativeStepsTable.$inferSelect) {
  return {
    id: s.id, initiativeId: s.initiativeId, title: s.title,
    completed: s.completed, completedAt: s.completedAt?.toISOString(),
    sortOrder: s.sortOrder,
    createdAt: s.createdAt?.toISOString(), updatedAt: s.updatedAt?.toISOString(),
  };
}

const VALID_TYPES = ["aquisicao", "reforma", "campanha", "evento_especial", "capacitacao", "missoes", "administrativo", "outro"];
const VALID_PRIORITIES = ["alta", "media", "baixa"];
const VALID_INITIATIVE_STATUSES = ["planejada", "aprovada", "em_andamento", "concluida", "cancelada"];

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/summary", requireAuth, requireRole("admin", "leader"), async (_req: Request, res: Response) => {
  const initiatives = await db.select().from(planningInitiativesTable)
    .where(isNull(planningInitiativesTable.deletedAt));

  const byStatus: Record<string, number> = {};
  let totalPlanned = 0;
  let overdueCount = 0;
  const now = new Date();

  for (const i of initiatives) {
    byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    totalPlanned += parseFloat(i.plannedBudget || "0");
    if (i.endDate && new Date(i.endDate) < now && i.status !== "concluida" && i.status !== "cancelada") {
      overdueCount++;
    }
  }

  // Total realized cost
  const [{ total: totalRealized }] = await db.select({ total: sum(financeExpensesTable.amount) })
    .from(financeExpensesTable)
    .where(and(
      isNull(financeExpensesTable.deletedAt),
      eq(financeExpensesTable.initiativeId, planningInitiativesTable.id),
    )).catch(() => [{ total: null }]);

  // Simpler approach: sum all expenses with non-null initiativeId
  const expensesWithInitiative = await db.select({ total: sum(financeExpensesTable.amount) })
    .from(financeExpensesTable)
    .where(and(
      isNull(financeExpensesTable.deletedAt),
      // initiativeId IS NOT NULL
    ));

  // Get actual realized from expenses linked to initiatives
  let realizedTotal = 0;
  const allExpenses = await db.select().from(financeExpensesTable)
    .where(isNull(financeExpensesTable.deletedAt));
  for (const e of allExpenses) {
    if (e.initiativeId) realizedTotal += parseFloat(e.amount || "0");
  }

  const activeCount = (byStatus.planejada || 0) + (byStatus.aprovada || 0) + (byStatus.em_andamento || 0);

  res.json({
    totalInitiatives: initiatives.length,
    activeInitiatives: activeCount,
    overdueInitiatives: overdueCount,
    byStatus,
    totalPlannedBudget: totalPlanned.toFixed(2),
    totalRealizedCost: realizedTotal.toFixed(2),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTIVES
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/directives", requireAuth, requireRole("admin", "leader"), async (_req: Request, res: Response) => {
  const directives = await db.select().from(strategicDirectivesTable)
    .where(isNull(strategicDirectivesTable.deletedAt))
    .orderBy(desc(strategicDirectivesTable.startYear));

  res.json({ directives: directives.map(serializeDirective) });
});

router.get("/directives/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { id } = req.params;

  const [directive] = await db.select().from(strategicDirectivesTable)
    .where(and(eq(strategicDirectivesTable.id, id), isNull(strategicDirectivesTable.deletedAt)));

  if (!directive) {
    res.status(404).json({ error: "Diretriz nao encontrada" });
    return;
  }

  const objectives = await db.select().from(strategicObjectivesTable)
    .where(and(eq(strategicObjectivesTable.directiveId, id), isNull(strategicObjectivesTable.deletedAt)));

  // Get initiatives for each objective
  const objectivesWithInitiatives = await Promise.all(objectives.map(async (o) => {
    const initiatives = await db.select().from(planningInitiativesTable)
      .where(and(eq(planningInitiativesTable.objectiveId, o.id), isNull(planningInitiativesTable.deletedAt)));
    return { ...serializeObjective(o), initiatives: initiatives.map(serializeInitiative) };
  }));

  res.json({ ...serializeDirective(directive), objectives: objectivesWithInitiatives });
});

router.post("/directives", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { title, description, startYear, endYear } = req.body;
  const user = req.user!;

  if (!title?.trim()) {
    res.status(400).json({ error: "Titulo e obrigatorio" });
    return;
  }
  if (!startYear || !endYear) {
    res.status(400).json({ error: "startYear e endYear sao obrigatorios" });
    return;
  }

  const [d] = await db.insert(strategicDirectivesTable).values({
    title: title.trim(), description: description || null,
    startYear, endYear,
    createdByUserId: user.userId, updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({ userId: user.userId, action: "DIRECTIVE_CREATED", resourceType: "directive", resourceId: d.id, details: { title: d.title }, ipAddress: getIp(req) });
  res.status(201).json(serializeDirective(d));
});

router.put("/directives/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(strategicDirectivesTable)
    .where(and(eq(strategicDirectivesTable.id, id), isNull(strategicDirectivesTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Diretriz nao encontrada" }); return; }

  const { title, description, startYear, endYear, status } = req.body;
  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description || null;
  if (startYear !== undefined) updates.startYear = startYear;
  if (endYear !== undefined) updates.endYear = endYear;
  if (status !== undefined) updates.status = status;

  const [updated] = await db.update(strategicDirectivesTable).set(updates).where(eq(strategicDirectivesTable.id, id)).returning();
  await createAuditLog({ userId: user.userId, action: "DIRECTIVE_UPDATED", resourceType: "directive", resourceId: id, details: { title: updated.title }, ipAddress: getIp(req) });
  res.json(serializeDirective(updated));
});

router.delete("/directives/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(strategicDirectivesTable)
    .where(and(eq(strategicDirectivesTable.id, id), isNull(strategicDirectivesTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Diretriz nao encontrada" }); return; }

  await db.update(strategicDirectivesTable).set({ deletedAt: new Date(), updatedByUserId: user.userId, updatedAt: new Date() }).where(eq(strategicDirectivesTable.id, id));
  await createAuditLog({ userId: user.userId, action: "DIRECTIVE_DELETED", resourceType: "directive", resourceId: id, details: { title: existing.title }, ipAddress: getIp(req) });
  res.json({ message: "Diretriz removida com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OBJECTIVES
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/directives/:id/objectives", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [directive] = await db.select().from(strategicDirectivesTable)
    .where(and(eq(strategicDirectivesTable.id, id), isNull(strategicDirectivesTable.deletedAt)));
  if (!directive) { res.status(404).json({ error: "Diretriz nao encontrada" }); return; }

  const { title, description, targetValue, unit, deadline } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: "Titulo e obrigatorio" }); return; }

  const [o] = await db.insert(strategicObjectivesTable).values({
    directiveId: id, title: title.trim(), description: description || null,
    targetValue: targetValue ? String(targetValue) : null,
    unit: unit || null, deadline: deadline || null,
    createdByUserId: user.userId, updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({ userId: user.userId, action: "OBJECTIVE_CREATED", resourceType: "objective", resourceId: o.id, details: { title: o.title, directiveId: id }, ipAddress: getIp(req) });
  res.status(201).json(serializeObjective(o));
});

router.put("/objectives/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(strategicObjectivesTable)
    .where(and(eq(strategicObjectivesTable.id, id), isNull(strategicObjectivesTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Objetivo nao encontrado" }); return; }

  const { title, description, targetValue, currentValue, unit, deadline, status } = req.body;
  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description || null;
  if (targetValue !== undefined) updates.targetValue = String(targetValue);
  if (currentValue !== undefined) updates.currentValue = String(currentValue);
  if (unit !== undefined) updates.unit = unit || null;
  if (deadline !== undefined) updates.deadline = deadline || null;
  if (status !== undefined) updates.status = status;

  const [updated] = await db.update(strategicObjectivesTable).set(updates).where(eq(strategicObjectivesTable.id, id)).returning();
  await createAuditLog({ userId: user.userId, action: "OBJECTIVE_UPDATED", resourceType: "objective", resourceId: id, details: { title: updated.title, currentValue }, ipAddress: getIp(req) });
  res.json(serializeObjective(updated));
});

router.delete("/objectives/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(strategicObjectivesTable)
    .where(and(eq(strategicObjectivesTable.id, id), isNull(strategicObjectivesTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Objetivo nao encontrado" }); return; }

  await db.update(strategicObjectivesTable).set({ deletedAt: new Date(), updatedByUserId: user.userId, updatedAt: new Date() }).where(eq(strategicObjectivesTable.id, id));
  await createAuditLog({ userId: user.userId, action: "OBJECTIVE_DELETED", resourceType: "objective", resourceId: id, ipAddress: getIp(req) });
  res.json({ message: "Objetivo removido com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INITIATIVES
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/initiatives", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;
  const ministryId = req.query.ministryId as string | undefined;
  const priority = req.query.priority as string | undefined;

  const conditions = [isNull(planningInitiativesTable.deletedAt)];
  if (status) conditions.push(eq(planningInitiativesTable.status, status as any));
  if (type) conditions.push(eq(planningInitiativesTable.type, type as any));
  if (ministryId) conditions.push(eq(planningInitiativesTable.ministryId, ministryId));
  if (priority) conditions.push(eq(planningInitiativesTable.priority, priority as any));

  const initiatives = await db.select().from(planningInitiativesTable)
    .where(and(...conditions))
    .orderBy(planningInitiativesTable.endDate);

  res.json({ initiatives: initiatives.map(serializeInitiative) });
});

router.get("/initiatives/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { id } = req.params;

  const [initiative] = await db.select().from(planningInitiativesTable)
    .where(and(eq(planningInitiativesTable.id, id), isNull(planningInitiativesTable.deletedAt)));
  if (!initiative) { res.status(404).json({ error: "Iniciativa nao encontrada" }); return; }

  const steps = await db.select().from(initiativeStepsTable)
    .where(and(eq(initiativeStepsTable.initiativeId, id), isNull(initiativeStepsTable.deletedAt)))
    .orderBy(initiativeStepsTable.sortOrder);

  // Calculate realized cost from linked expenses
  const expenses = await db.select().from(financeExpensesTable)
    .where(and(eq(financeExpensesTable.initiativeId, id), isNull(financeExpensesTable.deletedAt)));

  const realizedCost = expenses.reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0);
  const totalSteps = steps.length;
  const completedSteps = steps.filter(s => s.completed).length;

  res.json({
    ...serializeInitiative(initiative),
    steps: steps.map(serializeStep),
    realizedCost: realizedCost.toFixed(2),
    progress: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
  });
});

router.post("/initiatives", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { title, description, type, priority, objectiveId, ministryId, responsibleId, plannedBudget, startDate, endDate, notes } = req.body;
  const user = req.user!;

  if (!title?.trim()) { res.status(400).json({ error: "Titulo e obrigatorio" }); return; }
  if (!type || !VALID_TYPES.includes(type)) { res.status(400).json({ error: `Tipo invalido. Valores: ${VALID_TYPES.join(", ")}` }); return; }

  // Resolve responsible name
  let responsibleName: string | null = null;
  if (responsibleId) {
    const [member] = await db.select().from(membersTable).where(eq(membersTable.id, responsibleId)).limit(1);
    if (member) responsibleName = member.fullName;
  }

  const [i] = await db.insert(planningInitiativesTable).values({
    title: title.trim(), description: description || null,
    type: type as any, priority: (priority || "media") as any,
    objectiveId: objectiveId || null, ministryId: ministryId || null,
    responsibleId: responsibleId || null, responsibleName,
    plannedBudget: plannedBudget ? String(plannedBudget) : null,
    startDate: startDate || null, endDate: endDate || null, notes: notes || null,
    createdByUserId: user.userId, updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({ userId: user.userId, action: "INITIATIVE_CREATED", resourceType: "initiative", resourceId: i.id, details: { title: i.title, type, priority }, ipAddress: getIp(req) });
  res.status(201).json(serializeInitiative(i));
});

router.put("/initiatives/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(planningInitiativesTable)
    .where(and(eq(planningInitiativesTable.id, id), isNull(planningInitiativesTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Iniciativa nao encontrada" }); return; }

  const { title, description, type, priority, status, objectiveId, ministryId, responsibleId, plannedBudget, startDate, endDate, notes } = req.body;
  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };

  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description || null;
  if (type !== undefined) updates.type = type;
  if (priority !== undefined) updates.priority = priority;
  if (status !== undefined) {
    updates.status = status;
    if (status === "concluida") updates.completedAt = new Date();
  }
  if (objectiveId !== undefined) updates.objectiveId = objectiveId || null;
  if (ministryId !== undefined) updates.ministryId = ministryId || null;
  if (plannedBudget !== undefined) updates.plannedBudget = plannedBudget ? String(plannedBudget) : null;
  if (startDate !== undefined) updates.startDate = startDate || null;
  if (endDate !== undefined) updates.endDate = endDate || null;
  if (notes !== undefined) updates.notes = notes || null;
  if (responsibleId !== undefined) {
    updates.responsibleId = responsibleId || null;
    if (responsibleId) {
      const [member] = await db.select().from(membersTable).where(eq(membersTable.id, responsibleId)).limit(1);
      updates.responsibleName = member ? member.fullName : null;
    } else {
      updates.responsibleName = null;
    }
  }

  const [updated] = await db.update(planningInitiativesTable).set(updates).where(eq(planningInitiativesTable.id, id)).returning();

  const action = status && status !== existing.status ? "INITIATIVE_STATUS_CHANGED" : "INITIATIVE_UPDATED";
  await createAuditLog({ userId: user.userId, action, resourceType: "initiative", resourceId: id, details: { title: updated.title, status }, ipAddress: getIp(req) });
  res.json(serializeInitiative(updated));
});

router.delete("/initiatives/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(planningInitiativesTable)
    .where(and(eq(planningInitiativesTable.id, id), isNull(planningInitiativesTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Iniciativa nao encontrada" }); return; }

  await db.update(planningInitiativesTable).set({ deletedAt: new Date(), updatedByUserId: user.userId, updatedAt: new Date() }).where(eq(planningInitiativesTable.id, id));
  await createAuditLog({ userId: user.userId, action: "INITIATIVE_DELETED", resourceType: "initiative", resourceId: id, details: { title: existing.title }, ipAddress: getIp(req) });
  res.json({ message: "Iniciativa removida com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEPS
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/initiatives/:id/steps", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [initiative] = await db.select().from(planningInitiativesTable)
    .where(and(eq(planningInitiativesTable.id, id), isNull(planningInitiativesTable.deletedAt)));
  if (!initiative) { res.status(404).json({ error: "Iniciativa nao encontrada" }); return; }

  const { title, sortOrder } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: "Titulo e obrigatorio" }); return; }

  const [step] = await db.insert(initiativeStepsTable).values({
    initiativeId: id, title: title.trim(), sortOrder: sortOrder || 0,
    createdByUserId: user.userId, updatedByUserId: user.userId,
  }).returning();

  res.status(201).json(serializeStep(step));
});

router.put("/initiatives/:initiativeId/steps/:stepId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { initiativeId, stepId } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(initiativeStepsTable)
    .where(and(eq(initiativeStepsTable.id, stepId), eq(initiativeStepsTable.initiativeId, initiativeId), isNull(initiativeStepsTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Etapa nao encontrada" }); return; }

  const { title, completed, sortOrder } = req.body;
  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };
  if (title !== undefined) updates.title = title.trim();
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (completed !== undefined) {
    updates.completed = completed;
    updates.completedAt = completed ? new Date() : null;
    if (completed) {
      await createAuditLog({ userId: user.userId, action: "INITIATIVE_STEP_COMPLETED", resourceType: "initiative_step", resourceId: stepId, details: { initiativeId, title: existing.title }, ipAddress: getIp(req) });
    }
  }

  const [updated] = await db.update(initiativeStepsTable).set(updates).where(eq(initiativeStepsTable.id, stepId)).returning();
  res.json(serializeStep(updated));
});

router.delete("/initiatives/:initiativeId/steps/:stepId", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { initiativeId, stepId } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(initiativeStepsTable)
    .where(and(eq(initiativeStepsTable.id, stepId), eq(initiativeStepsTable.initiativeId, initiativeId), isNull(initiativeStepsTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Etapa nao encontrada" }); return; }

  await db.update(initiativeStepsTable).set({ deletedAt: new Date(), updatedByUserId: user.userId, updatedAt: new Date() }).where(eq(initiativeStepsTable.id, stepId));
  res.json({ message: "Etapa removida com sucesso" });
});

export default router;
