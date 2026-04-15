import bcrypt from "bcryptjs";
import { db, usersTable, membersTable, memberHistoryTable, consentRecordsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Ensures a bootstrap admin user exists on startup.
 *
 * Reads BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD from env. If both
 * are set and no user with that email exists, creates one with role=admin.
 * Idempotent — safe to run on every boot.
 *
 * Fails silently (logs only): a misconfigured bootstrap should never crash
 * the server.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrador";

  if (!email || !password) return;

  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing) {
      if (existing.role !== "admin") {
        await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, existing.id));
        logger.info({ email }, "Bootstrap: promoted existing user to admin");
      }
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(usersTable).values({
      email,
      passwordHash,
      name,
      role: "admin",
      mfaEnabled: false,
    }).returning();

    await db.insert(consentRecordsTable).values({
      userId: user.id,
      consentType: "terms_of_service",
      accepted: true,
      ipAddress: "bootstrap",
    });

    const [member] = await db.insert(membersTable).values({
      fullName: name,
      email,
      status: "ativo" as const,
      pipelineStage: "ministerio" as const,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    }).returning();

    await db.insert(memberHistoryTable).values({
      memberId: member.id,
      changedByUserId: user.id,
      changeType: "created",
      fieldChanges: { fullName: name, email, autoCreated: true, bootstrap: true },
    });

    logger.info({ email }, "Bootstrap: admin user created");
  } catch (err) {
    logger.error({ err }, "Bootstrap admin failed");
  }
}
