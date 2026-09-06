import { Router, type IRouter, Request, Response } from "express";
import { db, memberGroupsTable, memberGroupMembersTable, membersTable } from "@workspace/db";
import { eq, and, isNull, desc, count, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeGroup(g: typeof memberGroupsTable.$inferSelect, memberCount = 0) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    memberCount,
    createdAt: g.createdAt?.toISOString(),
    updatedAt: g.updatedAt?.toISOString(),
  };
}

// GET /member-groups
router.get("/", requireAuth, requireRole("admin", "leader"), async (_req: Request, res: Response) => {
  const groups = await db.select().from(memberGroupsTable)
    .where(isNull(memberGroupsTable.deletedAt))
    .orderBy(desc(memberGroupsTable.createdAt));

  if (groups.length === 0) {
    res.json({ groups: [] });
    return;
  }

  const counts = await db.select({
    groupId: memberGroupMembersTable.groupId,
    total: count(),
  }).from(memberGroupMembersTable)
    .where(inArray(memberGroupMembersTable.groupId, groups.map(g => g.id)))
    .groupBy(memberGroupMembersTable.groupId);

  const countMap = new Map(counts.map(c => [c.groupId, Number(c.total)]));
  res.json({ groups: groups.map(g => serializeGroup(g, countMap.get(g.id) || 0)) });
});

// GET /member-groups/:id — detail with members
router.get("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string }>, res: Response) => {
  const [group] = await db.select().from(memberGroupsTable)
    .where(and(eq(memberGroupsTable.id, req.params.id), isNull(memberGroupsTable.deletedAt))).limit(1);

  if (!group) {
    res.status(404).json({ error: "NOT_FOUND", message: "Grupo não encontrado" });
    return;
  }

  const members = await db.select({
    id: membersTable.id,
    fullName: membersTable.fullName,
    email: membersTable.email,
    photoPath: membersTable.photoPath,
  }).from(memberGroupMembersTable)
    .innerJoin(membersTable, eq(membersTable.id, memberGroupMembersTable.memberId))
    .where(eq(memberGroupMembersTable.groupId, group.id));

  res.json({ ...serializeGroup(group, members.length), members });
});

// POST /member-groups
router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { name, description } = req.body;

  if (!name?.trim()) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Nome é obrigatório" });
    return;
  }

  const [group] = await db.insert(memberGroupsTable).values({
    name: name.trim(),
    description: description || null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  await createAuditLog({
    userId,
    action: "MEMBER_GROUP_CREATED",
    resourceType: "member_group",
    resourceId: group.id,
    details: { name },
    ipAddress: ip,
  });

  res.status(201).json(serializeGroup(group, 0));
});

// PUT /member-groups/:id
router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(memberGroupsTable)
    .where(and(eq(memberGroupsTable.id, req.params.id), isNull(memberGroupsTable.deletedAt))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Grupo não encontrado" });
    return;
  }

  const { name, description } = req.body;
  const [updated] = await db.update(memberGroupsTable).set({
    name: name?.trim() ?? existing.name,
    description: description !== undefined ? description : existing.description,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(memberGroupsTable.id, req.params.id)).returning();

  await createAuditLog({
    userId,
    action: "MEMBER_GROUP_UPDATED",
    resourceType: "member_group",
    resourceId: updated.id,
    ipAddress: ip,
  });

  res.json(serializeGroup(updated));
});

// DELETE /member-groups/:id (soft delete)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(memberGroupsTable)
    .where(and(eq(memberGroupsTable.id, req.params.id), isNull(memberGroupsTable.deletedAt))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Grupo não encontrado" });
    return;
  }

  await db.update(memberGroupsTable).set({
    deletedAt: new Date(),
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(memberGroupsTable.id, req.params.id));

  // Also remove all member-group links
  await db.delete(memberGroupMembersTable).where(eq(memberGroupMembersTable.groupId, req.params.id));

  await createAuditLog({
    userId,
    action: "MEMBER_GROUP_DELETED",
    resourceType: "member_group",
    resourceId: req.params.id,
    ipAddress: ip,
  });

  res.json({ message: "Grupo excluído" });
});

export default router;
