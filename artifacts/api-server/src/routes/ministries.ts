import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  ministriesTable,
  ministryMembersTable,
  ministryGoalsTable,
  membersTable,
} from "@workspace/db";
import { eq, and, isNull, count, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeMinistry(m: typeof ministriesTable.$inferSelect) {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    status: m.status,
    createdAt: m.createdAt?.toISOString(),
    updatedAt: m.updatedAt?.toISOString(),
  };
}

function serializeMinistryMember(mm: typeof ministryMembersTable.$inferSelect) {
  return {
    id: mm.id,
    ministryId: mm.ministryId,
    memberId: mm.memberId,
    memberName: mm.memberName,
    role: mm.role,
    joinedAt: mm.joinedAt?.toISOString(),
    leftAt: mm.leftAt?.toISOString() || null,
    updatedAt: mm.updatedAt?.toISOString(),
  };
}

const VALID_STATUSES = ["ativo", "inativo"];
const VALID_ROLES = ["lider", "membro"];

// Helper: check if user is a leader of ministry
async function isMinistryLeader(ministryId: string, userEmail: string): Promise<boolean> {
  // Find member by user email
  const [member] = await db.select().from(membersTable)
    .where(eq(membersTable.email, userEmail)).limit(1);
  if (!member) return false;

  const [mm] = await db.select().from(ministryMembersTable)
    .where(and(
      eq(ministryMembersTable.ministryId, ministryId),
      eq(ministryMembersTable.memberId, member.id),
      eq(ministryMembersTable.role, "lider"),
      isNull(ministryMembersTable.leftAt),
    )).limit(1);

  return !!mm;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MINISTRIES CRUD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /ministries
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const status = req.query.status as string | undefined;

  const conditions = [isNull(ministriesTable.deletedAt)];
  if (status) conditions.push(eq(ministriesTable.status, status as any));

  const where = and(...conditions);

  const [ministries, [{ total }]] = await Promise.all([
    db.select().from(ministriesTable).where(where)
      .orderBy(ministriesTable.name)
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(ministriesTable).where(where),
  ]);

  // Get active member counts and leaders for each ministry
  const enriched = await Promise.all(ministries.map(async (m) => {
    const [{ memberCount }] = await db.select({ memberCount: count() })
      .from(ministryMembersTable)
      .where(and(
        eq(ministryMembersTable.ministryId, m.id),
        isNull(ministryMembersTable.leftAt),
      ));

    const leaders = await db.select().from(ministryMembersTable)
      .where(and(
        eq(ministryMembersTable.ministryId, m.id),
        eq(ministryMembersTable.role, "lider"),
        isNull(ministryMembersTable.leftAt),
      ));

    return {
      ...serializeMinistry(m),
      memberCount: Number(memberCount),
      leaders: leaders.map(l => ({ memberId: l.memberId, memberName: l.memberName })),
    };
  }));

  res.json({
    ministries: enriched,
    total: Number(total),
    page,
    limit,
  });
});

// GET /ministries/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  const [ministry] = await db.select().from(ministriesTable)
    .where(and(eq(ministriesTable.id, id), isNull(ministriesTable.deletedAt)));

  if (!ministry) {
    res.status(404).json({ error: "Ministerio nao encontrado" });
    return;
  }

  const members = await db.select().from(ministryMembersTable)
    .where(and(
      eq(ministryMembersTable.ministryId, id),
      isNull(ministryMembersTable.leftAt),
    ));

  res.json({
    ...serializeMinistry(ministry),
    members: members.map(serializeMinistryMember),
  });
});

// POST /ministries
router.post("/", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { name, description, status } = req.body;
  const user = req.user!;

  if (!name || !name.trim()) {
    res.status(400).json({ error: "Nome do ministerio e obrigatorio" });
    return;
  }

  const [ministry] = await db.insert(ministriesTable).values({
    name: name.trim(),
    description: description || null,
    status: status || "ativo",
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "MINISTRY_CREATED",
    resourceType: "ministry",
    resourceId: ministry.id,
    details: { name: ministry.name },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeMinistry(ministry));
});

// PUT /ministries/:id
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(ministriesTable)
    .where(and(eq(ministriesTable.id, id), isNull(ministriesTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Ministerio nao encontrado" });
    return;
  }

  // Access: admin or ministry leader
  if (user.role !== "admin") {
    const isLeader = await isMinistryLeader(id, user.email);
    if (!isLeader) {
      res.status(403).json({ error: "Sem permissao para editar este ministerio" });
      return;
    }
  }

  const { name, description, status } = req.body;

  const updates: Record<string, any> = {
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  };

  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description || null;
  if (status !== undefined) updates.status = status;

  const [updated] = await db.update(ministriesTable).set(updates)
    .where(eq(ministriesTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "MINISTRY_UPDATED",
    resourceType: "ministry",
    resourceId: id,
    details: { name: updated.name },
    ipAddress: getIp(req),
  });

  res.json(serializeMinistry(updated));
});

// DELETE /ministries/:id
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(ministriesTable)
    .where(and(eq(ministriesTable.id, id), isNull(ministriesTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Ministerio nao encontrado" });
    return;
  }

  await db.update(ministriesTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(ministriesTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "MINISTRY_DELETED",
    resourceType: "ministry",
    resourceId: id,
    details: { name: existing.name },
    ipAddress: getIp(req),
  });

  res.json({ message: "Ministerio removido com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MINISTRY MEMBERS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /ministries/:id/members
router.post("/:id/members", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  // Check ministry exists
  const [ministry] = await db.select().from(ministriesTable)
    .where(and(eq(ministriesTable.id, id), isNull(ministriesTable.deletedAt)));

  if (!ministry) {
    res.status(404).json({ error: "Ministerio nao encontrado" });
    return;
  }

  // Access: admin or ministry leader
  if (user.role !== "admin" && user.role !== "leader") {
    const isLeader = await isMinistryLeader(id, user.email);
    if (!isLeader) {
      res.status(403).json({ error: "Sem permissao para adicionar membros" });
      return;
    }
  }

  const { memberId, role } = req.body;

  if (!memberId) {
    res.status(400).json({ error: "memberId e obrigatorio" });
    return;
  }

  if (role && !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `Role invalido. Valores aceitos: ${VALID_ROLES.join(", ")}` });
    return;
  }

  // Check member exists
  const [member] = await db.select().from(membersTable)
    .where(eq(membersTable.id, memberId)).limit(1);

  if (!member) {
    res.status(404).json({ error: "Membro nao encontrado" });
    return;
  }

  // Check not already active in this ministry
  const [existingActive] = await db.select().from(ministryMembersTable)
    .where(and(
      eq(ministryMembersTable.ministryId, id),
      eq(ministryMembersTable.memberId, memberId),
      isNull(ministryMembersTable.leftAt),
    )).limit(1);

  if (existingActive) {
    res.status(409).json({ error: "Membro ja participa deste ministerio" });
    return;
  }

  const [mm] = await db.insert(ministryMembersTable).values({
    ministryId: id,
    memberId,
    memberName: member.fullName,
    role: role || "membro",
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "MINISTRY_MEMBER_ADDED",
    resourceType: "ministry_member",
    resourceId: mm.id,
    details: { ministryId: id, memberId, role: mm.role, ministryName: ministry.name },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeMinistryMember(mm));
});

// PUT /ministries/:id/members/:memberId
router.put("/:id/members/:memberId", requireAuth, async (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const user = req.user!;

  // Access: admin or ministry leader
  if (user.role !== "admin" && user.role !== "leader") {
    const isLeader = await isMinistryLeader(id, user.email);
    if (!isLeader) {
      res.status(403).json({ error: "Sem permissao para alterar roles" });
      return;
    }
  }

  const [existing] = await db.select().from(ministryMembersTable)
    .where(and(
      eq(ministryMembersTable.ministryId, id),
      eq(ministryMembersTable.memberId, memberId),
      isNull(ministryMembersTable.leftAt),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "Membro nao encontrado neste ministerio" });
    return;
  }

  const { role } = req.body;

  if (!role || !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `Role invalido. Valores aceitos: ${VALID_ROLES.join(", ")}` });
    return;
  }

  const [updated] = await db.update(ministryMembersTable).set({
    role: role as any,
    updatedAt: new Date(),
  }).where(eq(ministryMembersTable.id, existing.id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "MINISTRY_MEMBER_ROLE_CHANGED",
    resourceType: "ministry_member",
    resourceId: existing.id,
    details: { ministryId: id, memberId, oldRole: existing.role, newRole: role },
    ipAddress: getIp(req),
  });

  res.json(serializeMinistryMember(updated));
});

// DELETE /ministries/:id/members/:memberId
router.delete("/:id/members/:memberId", requireAuth, async (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const user = req.user!;

  // Access: admin or ministry leader
  if (user.role !== "admin" && user.role !== "leader") {
    const isLeader = await isMinistryLeader(id, user.email);
    if (!isLeader) {
      res.status(403).json({ error: "Sem permissao para remover membros" });
      return;
    }
  }

  const [existing] = await db.select().from(ministryMembersTable)
    .where(and(
      eq(ministryMembersTable.ministryId, id),
      eq(ministryMembersTable.memberId, memberId),
      isNull(ministryMembersTable.leftAt),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "Membro nao encontrado neste ministerio" });
    return;
  }

  await db.update(ministryMembersTable).set({
    leftAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(ministryMembersTable.id, existing.id));

  await createAuditLog({
    userId: user.userId,
    action: "MINISTRY_MEMBER_REMOVED",
    resourceType: "ministry_member",
    resourceId: existing.id,
    details: { ministryId: id, memberId, memberName: existing.memberName },
    ipAddress: getIp(req),
  });

  res.json({ message: "Membro removido do ministerio" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MINISTRY GOALS
// ═══════════════════════════════════════════════════════════════════════════════

function serializeGoal(g: typeof ministryGoalsTable.$inferSelect) {
  return {
    id: g.id,
    ministryId: g.ministryId,
    title: g.title,
    description: g.description,
    targetValue: g.targetValue,
    currentValue: g.currentValue,
    unit: g.unit,
    deadline: g.deadline,
    initiativeId: g.initiativeId,
    status: g.status,
    createdAt: g.createdAt?.toISOString(),
    updatedAt: g.updatedAt?.toISOString(),
  };
}

// GET /ministries/:id/goals
router.get("/:id/goals", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  const [ministry] = await db.select().from(ministriesTable)
    .where(and(eq(ministriesTable.id, id), isNull(ministriesTable.deletedAt)));
  if (!ministry) {
    res.status(404).json({ error: "Ministerio nao encontrado" });
    return;
  }

  const goals = await db.select().from(ministryGoalsTable)
    .where(and(eq(ministryGoalsTable.ministryId, id), isNull(ministryGoalsTable.deletedAt)))
    .orderBy(ministryGoalsTable.createdAt);

  res.json({ goals: goals.map(serializeGoal) });
});

// POST /ministries/:id/goals
router.post("/:id/goals", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [ministry] = await db.select().from(ministriesTable)
    .where(and(eq(ministriesTable.id, id), isNull(ministriesTable.deletedAt)));
  if (!ministry) {
    res.status(404).json({ error: "Ministerio nao encontrado" });
    return;
  }

  // Access: admin or ministry leader
  if (user.role !== "admin") {
    const isLeader = await isMinistryLeader(id, user.email);
    if (!isLeader) {
      res.status(403).json({ error: "Sem permissao para criar metas neste ministerio" });
      return;
    }
  }

  const { title, description, targetValue, unit, deadline, initiativeId } = req.body;

  if (!title?.trim()) {
    res.status(400).json({ error: "Titulo e obrigatorio" });
    return;
  }
  if (targetValue === undefined || targetValue === null) {
    res.status(400).json({ error: "targetValue e obrigatorio" });
    return;
  }

  const [goal] = await db.insert(ministryGoalsTable).values({
    ministryId: id,
    title: title.trim(),
    description: description || null,
    targetValue: String(targetValue),
    unit: unit || null,
    deadline: deadline || null,
    initiativeId: initiativeId || null,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "MINISTRY_GOAL_CREATED",
    resourceType: "ministry_goal",
    resourceId: goal.id,
    details: { ministryId: id, title: goal.title, targetValue },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeGoal(goal));
});

// PUT /ministries/:id/goals/:goalId
router.put("/:id/goals/:goalId", requireAuth, async (req: Request, res: Response) => {
  const { id, goalId } = req.params;
  const user = req.user!;

  // Access: admin or ministry leader
  if (user.role !== "admin") {
    const isLeader = await isMinistryLeader(id, user.email);
    if (!isLeader) {
      res.status(403).json({ error: "Sem permissao para editar metas" });
      return;
    }
  }

  const [existing] = await db.select().from(ministryGoalsTable)
    .where(and(
      eq(ministryGoalsTable.id, goalId),
      eq(ministryGoalsTable.ministryId, id),
      isNull(ministryGoalsTable.deletedAt),
    ));
  if (!existing) {
    res.status(404).json({ error: "Meta nao encontrada" });
    return;
  }

  const { title, description, targetValue, currentValue, unit, deadline, initiativeId, status } = req.body;
  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };

  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description || null;
  if (targetValue !== undefined) updates.targetValue = String(targetValue);
  if (currentValue !== undefined) updates.currentValue = String(currentValue);
  if (unit !== undefined) updates.unit = unit || null;
  if (deadline !== undefined) updates.deadline = deadline || null;
  if (initiativeId !== undefined) updates.initiativeId = initiativeId || null;
  if (status !== undefined) updates.status = status;

  const [updated] = await db.update(ministryGoalsTable).set(updates)
    .where(eq(ministryGoalsTable.id, goalId)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "MINISTRY_GOAL_UPDATED",
    resourceType: "ministry_goal",
    resourceId: goalId,
    details: { ministryId: id, title: updated.title, currentValue },
    ipAddress: getIp(req),
  });

  res.json(serializeGoal(updated));
});

// DELETE /ministries/:id/goals/:goalId
router.delete("/:id/goals/:goalId", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id, goalId } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(ministryGoalsTable)
    .where(and(
      eq(ministryGoalsTable.id, goalId),
      eq(ministryGoalsTable.ministryId, id),
      isNull(ministryGoalsTable.deletedAt),
    ));
  if (!existing) {
    res.status(404).json({ error: "Meta nao encontrada" });
    return;
  }

  await db.update(ministryGoalsTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(ministryGoalsTable.id, goalId));

  await createAuditLog({
    userId: user.userId,
    action: "MINISTRY_GOAL_DELETED",
    resourceType: "ministry_goal",
    resourceId: goalId,
    details: { ministryId: id, title: existing.title },
    ipAddress: getIp(req),
  });

  res.json({ message: "Meta removida com sucesso" });
});

export default router;
