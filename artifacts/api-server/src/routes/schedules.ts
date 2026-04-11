import { Router, type IRouter, Request, Response } from "express";
import { db, serviceRolesTable, ministriesTable } from "@workspace/db";
import { eq, and, isNull, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeRole(r: typeof serviceRolesTable.$inferSelect, ministryName?: string | null) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    ministryId: r.ministryId,
    ministryName: ministryName || null,
    createdAt: r.createdAt?.toISOString(),
    updatedAt: r.updatedAt?.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE ROLES CRUD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /schedules/roles
router.get("/roles", requireAuth, async (req: Request, res: Response) => {
  const roles = await db.select().from(serviceRolesTable)
    .where(isNull(serviceRolesTable.deletedAt))
    .orderBy(serviceRolesTable.name);

  // Enrich with ministry names
  const enriched = await Promise.all(roles.map(async (r) => {
    let ministryName: string | null = null;
    if (r.ministryId) {
      const [m] = await db.select({ name: ministriesTable.name })
        .from(ministriesTable)
        .where(eq(ministriesTable.id, r.ministryId)).limit(1);
      ministryName = m?.name || null;
    }
    return serializeRole(r, ministryName);
  }));

  res.json({ roles: enriched });
});

// POST /schedules/roles
router.post("/roles", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { name, description, ministryId } = req.body;
  const user = req.user!;

  if (!name || !name.trim()) {
    res.status(400).json({ error: "Nome da funcao e obrigatorio" });
    return;
  }

  const [role] = await db.insert(serviceRolesTable).values({
    name: name.trim(),
    description: description || null,
    ministryId: ministryId || null,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "SERVICE_ROLE_CREATED",
    resourceType: "service_role",
    resourceId: role.id,
    details: { name: role.name },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeRole(role));
});

// PUT /schedules/roles/:id
router.put("/roles/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(serviceRolesTable)
    .where(and(eq(serviceRolesTable.id, id), isNull(serviceRolesTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Funcao nao encontrada" });
    return;
  }

  const { name, description, ministryId } = req.body;

  const updates: Record<string, any> = {
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  };

  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description || null;
  if (ministryId !== undefined) updates.ministryId = ministryId || null;

  const [updated] = await db.update(serviceRolesTable).set(updates)
    .where(eq(serviceRolesTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "SERVICE_ROLE_UPDATED",
    resourceType: "service_role",
    resourceId: id,
    details: { name: updated.name },
    ipAddress: getIp(req),
  });

  res.json(serializeRole(updated));
});

// DELETE /schedules/roles/:id
router.delete("/roles/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(serviceRolesTable)
    .where(and(eq(serviceRolesTable.id, id), isNull(serviceRolesTable.deletedAt)));

  if (!existing) {
    res.status(404).json({ error: "Funcao nao encontrada" });
    return;
  }

  await db.update(serviceRolesTable).set({
    deletedAt: new Date(),
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  }).where(eq(serviceRolesTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "SERVICE_ROLE_DELETED",
    resourceType: "service_role",
    resourceId: id,
    details: { name: existing.name },
    ipAddress: getIp(req),
  });

  res.json({ message: "Funcao removida com sucesso" });
});

export default router;
