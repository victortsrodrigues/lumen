import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger.js";

interface AuditEntry {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function createAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      details: entry.details ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  } catch (err) {
    logger.error({ err, entry }, "Failed to write audit log");
  }
}
