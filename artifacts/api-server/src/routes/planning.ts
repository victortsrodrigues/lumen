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
import { notifyMember } from "../lib/notifications.js";

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
  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byTypeBudget: Record<string, { planned: number; realized: number; count: number }> = {};
  let totalPlanned = 0;
  let overdueCount = 0;
  let withoutResponsible = 0;
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  type InitiativeRow = typeof initiatives[number];
  const overdueList: InitiativeRow[] = [];
  const upcomingList: InitiativeRow[] = [];

  for (const i of initiatives) {
    byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    byType[i.type] = (byType[i.type] || 0) + 1;
    byPriority[i.priority] = (byPriority[i.priority] || 0) + 1;
    if (!byTypeBudget[i.type]) byTypeBudget[i.type] = { planned: 0, realized: 0, count: 0 };
    byTypeBudget[i.type].count++;
    byTypeBudget[i.type].planned += parseFloat(i.plannedBudget || "0");
    totalPlanned += parseFloat(i.plannedBudget || "0");

    if (!i.responsibleId && i.status !== "concluida" && i.status !== "cancelada") withoutResponsible++;

    if (i.endDate && i.status !== "concluida" && i.status !== "cancelada") {
      const end = new Date(i.endDate);
      if (end < now) {
        overdueCount++;
        overdueList.push(i);
      } else if (end <= in30Days) {
        upcomingList.push(i);
      }
    }
  }

  // Realized expenses linked to initiatives — single pass, by type
  let realizedTotal = 0;
  const allExpenses = await db.select().from(financeExpensesTable)
    .where(isNull(financeExpensesTable.deletedAt));
  const initiativeTypeMap = new Map(initiatives.map(i => [i.id, i.type]));
  for (const e of allExpenses) {
    if (!e.initiativeId) continue;
    const amt = parseFloat(e.amount || "0");
    realizedTotal += amt;
    const t = initiativeTypeMap.get(e.initiativeId);
    if (t && byTypeBudget[t]) byTypeBudget[t].realized += amt;
  }

  // Monthly evolution (last 6 months: created vs completed)
  const monthly: Array<{ month: string; created: number; completed: number }> = [];
  for (let m = 5; m >= 0; m--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const monthKey = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
    let created = 0, completed = 0;
    for (const i of initiatives) {
      const cAt = i.createdAt ? new Date(i.createdAt) : null;
      const compAt = i.completedAt ? new Date(i.completedAt) : null;
      if (cAt && cAt >= ref && cAt < next) created++;
      if (compAt && compAt >= ref && compAt < next) completed++;
    }
    monthly.push({ month: monthKey, created, completed });
  }

  // Directives progress
  const directives = await db.select().from(strategicDirectivesTable)
    .where(isNull(strategicDirectivesTable.deletedAt));
  const objectives = await db.select().from(strategicObjectivesTable)
    .where(isNull(strategicObjectivesTable.deletedAt));
  const objectivesByDir = new Map<string, string[]>();
  for (const o of objectives) {
    const arr = objectivesByDir.get(o.directiveId) || [];
    arr.push(o.id);
    objectivesByDir.set(o.directiveId, arr);
  }
  const directivesProgress = directives.map(d => {
    const objIds = new Set(objectivesByDir.get(d.id) || []);
    const linked = initiatives.filter(i => i.objectiveId && objIds.has(i.objectiveId));
    const total = linked.length;
    const completed = linked.filter(i => i.status === "concluida").length;
    return {
      id: d.id,
      title: d.title,
      startYear: d.startYear,
      endYear: d.endYear,
      status: d.status,
      totalInitiatives: total,
      completedInitiatives: completed,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  const activeCount = (byStatus.planejada || 0) + (byStatus.aprovada || 0) + (byStatus.em_andamento || 0);
  const completedCount = byStatus.concluida || 0;
  const completionRate = initiatives.length > 0 ? Math.round((completedCount / initiatives.length) * 100) : 0;

  // Serialize lists (top 5 each, ordered)
  const slimItem = (i: InitiativeRow) => ({
    id: i.id,
    title: i.title,
    type: i.type,
    priority: i.priority,
    status: i.status,
    endDate: i.endDate,
    responsibleName: i.responsibleName,
    plannedBudget: i.plannedBudget,
  });
  overdueList.sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime());
  upcomingList.sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime());

  res.json({
    totalInitiatives: initiatives.length,
    activeInitiatives: activeCount,
    completedInitiatives: completedCount,
    completionRate,
    overdueInitiatives: overdueCount,
    upcomingInitiatives: upcomingList.length,
    withoutResponsible,
    byStatus,
    byType,
    byPriority,
    byTypeBudget: Object.entries(byTypeBudget).map(([type, v]) => ({
      type,
      count: v.count,
      planned: v.planned.toFixed(2),
      realized: v.realized.toFixed(2),
    })),
    monthly,
    overdueTop: overdueList.slice(0, 5).map(slimItem),
    upcomingTop: upcomingList.slice(0, 5).map(slimItem),
    directivesProgress,
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

  if (i.responsibleId) {
    await notifyMember(i.responsibleId, {
      type: "initiative.assigned",
      title: "Você é responsável por uma iniciativa",
      message: `Você foi designado responsável por "${i.title}".`,
      link: `/planning/initiatives`,
      entityType: "initiative",
      entityId: i.id,
    });
  }

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

  // Notify when the responsible changes (or is set for the first time)
  if (updated.responsibleId && updated.responsibleId !== existing.responsibleId) {
    await notifyMember(updated.responsibleId, {
      type: "initiative.assigned",
      title: "Você é responsável por uma iniciativa",
      message: `Você foi designado responsável por "${updated.title}".`,
      link: `/planning/initiatives`,
      entityType: "initiative",
      entityId: updated.id,
    });
  }

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
