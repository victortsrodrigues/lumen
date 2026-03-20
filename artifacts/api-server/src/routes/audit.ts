import { Router, type IRouter, Request, Response } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, desc, count, and, like } from "drizzle-orm";
import { requireAuth, requireRole, requireMfaVerified } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/logs", requireAuth, requireMfaVerified, requireRole("admin"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const userIdFilter = req.query.userId as string | undefined;
  const actionFilter = req.query.action as string | undefined;

  const conditions = [];
  if (userIdFilter) conditions.push(eq(auditLogsTable.userId, userIdFilter));
  if (actionFilter) conditions.push(like(auditLogsTable.action, `%${actionFilter}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, [{ total }]] = await Promise.all([
    db.select().from(auditLogsTable).where(where).orderBy(desc(auditLogsTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(auditLogsTable).where(where),
  ]);

  res.json({
    logs: logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      details: log.details,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    })),
    total: Number(total),
    page,
    limit,
  });
});

export default router;
