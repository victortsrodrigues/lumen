import { findLinkedMember } from "../lib/memberLink.js";
import { Router, type IRouter, Request, Response } from "express";
import {
  db, membersTable, memberAreasTable, memberAreaHistoryTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, ilike, isNotNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { notifyMember } from "../lib/notifications.js";

const router: IRouter = Router();

const VALID_AREAS = ["culto", "pequeno_grupo", "ministerio", "ebd"] as const;
const VALID_HEALTH = ["verde", "amarelo", "vermelho"] as const;

type Area = typeof VALID_AREAS[number];
type Health = typeof VALID_HEALTH[number];

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

const AREA_LABELS: Record<Area, string> = {
  culto: "Culto",
  pequeno_grupo: "Pequeno Grupo",
  ministerio: "Ministério",
  ebd: "EBD",
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC ROUTES (must come before dynamic /members/:id)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /discipleship/summary — matrix 4×3 (active members only)
router.get("/summary", requireAuth, requireRole("admin", "leader"), async (_req: Request, res: Response) => {
  const rows = await db.select({
    area: memberAreasTable.area,
    healthStatus: memberAreasTable.healthStatus,
    total: count(),
  }).from(memberAreasTable)
    .innerJoin(membersTable, eq(membersTable.id, memberAreasTable.memberId))
    .where(eq(membersTable.status, "ativo"))
    .groupBy(memberAreasTable.area, memberAreasTable.healthStatus);

  const matrix: Record<Area, Record<Health, number>> = {
    culto:        { verde: 0, amarelo: 0, vermelho: 0 },
    pequeno_grupo:{ verde: 0, amarelo: 0, vermelho: 0 },
    ministerio:   { verde: 0, amarelo: 0, vermelho: 0 },
    ebd:          { verde: 0, amarelo: 0, vermelho: 0 },
  };
  for (const r of rows) {
    matrix[r.area as Area][r.healthStatus as Health] = Number(r.total);
  }

  res.json({ matrix });
});

// GET /discipleship/at-risk — members with vermelho in any area
router.get("/at-risk", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const areaFilter = req.query.area as string | undefined;

  const conditions = [eq(memberAreasTable.healthStatus, "vermelho" as const)];
  if (areaFilter && (VALID_AREAS as readonly string[]).includes(areaFilter)) {
    conditions.push(eq(memberAreasTable.area, areaFilter as Area));
  }

  const rows = await db.select({
    memberId: memberAreasTable.memberId,
    area: memberAreasTable.area,
    healthStatus: memberAreasTable.healthStatus,
    leaderMemberName: memberAreasTable.leaderMemberName,
    fullName: membersTable.fullName,
    status: membersTable.status,
  }).from(memberAreasTable)
    .innerJoin(membersTable, eq(membersTable.id, memberAreasTable.memberId))
    .where(and(eq(membersTable.status, "ativo"), ...conditions))
    .orderBy(asc(membersTable.fullName));

  res.json({
    items: rows.map(r => ({
      memberId: r.memberId,
      memberName: r.fullName,
      area: r.area,
      areaLabel: AREA_LABELS[r.area as Area],
      healthStatus: r.healthStatus,
      leaderMemberName: r.leaderMemberName,
    })),
    total: rows.length,
  });
});

// GET /discipleship/leaders — list of members who are leaders in any area
router.get("/leaders", requireAuth, requireRole("admin", "leader"), async (_req: Request, res: Response) => {
  const rows = await db.select({
    leaderMemberId: memberAreasTable.leaderMemberId,
    leaderMemberName: memberAreasTable.leaderMemberName,
    total: count(),
  }).from(memberAreasTable)
    .where(isNotNull(memberAreasTable.leaderMemberId))
    .groupBy(memberAreasTable.leaderMemberId, memberAreasTable.leaderMemberName);

  const items = rows
    .map(r => ({
      leaderMemberId: r.leaderMemberId,
      leaderMemberName: r.leaderMemberName,
      total: Number(r.total),
    }))
    .sort((a, b) => b.total - a.total);

  res.json({ items });
});

// GET /discipleship/by-leader/:leaderId — members under this leader (group by area)
router.get("/by-leader/:leaderId", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { leaderId } = req.params;

  const rows = await db.select({
    memberId: memberAreasTable.memberId,
    area: memberAreasTable.area,
    healthStatus: memberAreasTable.healthStatus,
    fullName: membersTable.fullName,
  }).from(memberAreasTable)
    .innerJoin(membersTable, eq(membersTable.id, memberAreasTable.memberId))
    .where(and(
      eq(memberAreasTable.leaderMemberId, leaderId),
      eq(membersTable.status, "ativo"),
    ))
    .orderBy(asc(membersTable.fullName));

  res.json({
    items: rows.map(r => ({
      memberId: r.memberId,
      memberName: r.fullName,
      area: r.area,
      areaLabel: AREA_LABELS[r.area as Area],
      healthStatus: r.healthStatus,
    })),
    total: rows.length,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PER-MEMBER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /discipleship/members/:id/areas — list 4 areas for a member
router.get("/members/:id/areas", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  if (user.role === "member") {
    const self = await findLinkedMember(user);
    if (!self || self.id !== id) {
      res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão para ver áreas deste membro" });
      return;
    }
  }

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  const areas = await db.select().from(memberAreasTable)
    .where(eq(memberAreasTable.memberId, id))
    .orderBy(asc(memberAreasTable.area));

  res.json({
    memberId: id,
    memberName: member.fullName,
    areas: areas.map(a => ({
      id: a.id,
      area: a.area,
      areaLabel: AREA_LABELS[a.area as Area],
      healthStatus: a.healthStatus,
      leaderMemberId: a.leaderMemberId,
      leaderMemberName: a.leaderMemberName,
      notes: a.notes,
      lastUpdatedAt: a.lastUpdatedAt?.toISOString(),
    })),
  });
});

// PUT /discipleship/members/:id/areas/:area — update one area
router.put("/members/:id/areas/:area", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { id, area } = req.params;

  if (!(VALID_AREAS as readonly string[]).includes(area)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: `Área inválida. Aceitas: ${VALID_AREAS.join(", ")}` });
    return;
  }

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id)).limit(1);
  if (!member) {
    res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado" });
    return;
  }

  const { healthStatus, leaderMemberId, notes } = req.body;

  if (healthStatus !== undefined && !(VALID_HEALTH as readonly string[]).includes(healthStatus)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: `Cor inválida. Aceitas: ${VALID_HEALTH.join(", ")}` });
    return;
  }

  if (leaderMemberId && leaderMemberId === id) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Líder não pode ser o próprio membro" });
    return;
  }

  let leaderMemberName: string | null = null;
  if (leaderMemberId) {
    const [leader] = await db.select({ fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.id, leaderMemberId)).limit(1);
    if (!leader) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Líder informado não encontrado" });
      return;
    }
    leaderMemberName = leader.fullName;
  }

  const [existing] = await db.select().from(memberAreasTable)
    .where(and(
      eq(memberAreasTable.memberId, id),
      eq(memberAreasTable.area, area as Area),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Área não encontrada para este membro" });
    return;
  }

  const updateData: Partial<typeof memberAreasTable.$inferInsert> = {
    lastUpdatedByUserId: userId,
    lastUpdatedAt: new Date(),
  };
  if (healthStatus !== undefined) updateData.healthStatus = healthStatus;
  if (leaderMemberId !== undefined) {
    updateData.leaderMemberId = leaderMemberId || null;
    updateData.leaderMemberName = leaderMemberId ? leaderMemberName : null;
  }
  if (notes !== undefined) updateData.notes = notes || null;

  const [updated] = await db.update(memberAreasTable).set(updateData)
    .where(eq(memberAreasTable.id, existing.id)).returning();

  // Log color transition if changed
  if (healthStatus !== undefined && healthStatus !== existing.healthStatus) {
    await db.insert(memberAreaHistoryTable).values({
      memberId: id,
      area: area as Area,
      fromHealth: existing.healthStatus,
      toHealth: healthStatus as Health,
      changedByUserId: userId,
      reason: typeof req.body.reason === "string" ? req.body.reason : null,
    });
  }

  // Notify leader if just assigned (different from previous)
  if (leaderMemberId && leaderMemberId !== existing.leaderMemberId) {
    await notifyMember(leaderMemberId, {
      type: "discipleship.leader_assigned",
      title: "Você é referência de discipulado",
      message: `Você foi atribuído como referência de ${member.fullName} em ${AREA_LABELS[area as Area]}.`,
      link: `/members/${id}`,
      entityType: "member",
      entityId: id,
    });
  }

  await createAuditLog({
    userId,
    action: "DISCIPLESHIP_AREA_UPDATED",
    resourceType: "member_area",
    resourceId: existing.id,
    details: {
      memberId: id,
      area,
      fromHealth: existing.healthStatus,
      toHealth: healthStatus ?? existing.healthStatus,
      leaderMemberId: leaderMemberId ?? existing.leaderMemberId,
    },
    ipAddress: ip,
  });

  res.json({
    id: updated.id,
    area: updated.area,
    areaLabel: AREA_LABELS[updated.area as Area],
    healthStatus: updated.healthStatus,
    leaderMemberId: updated.leaderMemberId,
    leaderMemberName: updated.leaderMemberName,
    notes: updated.notes,
    lastUpdatedAt: updated.lastUpdatedAt?.toISOString(),
  });
});

// GET /discipleship/members/:id/history — area transitions
router.get("/members/:id/history", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { id } = req.params;

  const rows = await db.select().from(memberAreaHistoryTable)
    .where(eq(memberAreaHistoryTable.memberId, id))
    .orderBy(desc(memberAreaHistoryTable.createdAt));

  res.json({
    items: rows.map(r => ({
      id: r.id,
      area: r.area,
      areaLabel: AREA_LABELS[r.area as Area],
      fromHealth: r.fromHealth,
      toHealth: r.toHealth,
      reason: r.reason,
      createdAt: r.createdAt?.toISOString(),
    })),
  });
});

export default router;
