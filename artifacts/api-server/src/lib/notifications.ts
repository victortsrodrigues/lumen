import { db, notificationsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger.js";

interface CreateNotificationArgs {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Create a single in-app notification for a user.
 * Any module (articles, events, ministries, etc.) can call this to notify
 * a user about something actionable.
 *
 * Fails silently (logs only) — notifications should never break the main flow.
 */
export async function createNotification(args: CreateNotificationArgs): Promise<void> {
  try {
    await db.insert(notificationsTable).values({
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      link: args.link ?? null,
      entityType: args.entityType ?? null,
      entityId: args.entityId ?? null,
    });
  } catch (err) {
    logger.error({ err, args }, "Failed to create notification");
  }
}

/**
 * Notify only the account explicitly linked to this member.
 * Returns true if the user was found and notified, false otherwise.
 *
 * Use whenever someone is "assigned" to something (responsable, counselor,
 * pastor, scheduled volunteer, course teacher, etc).
 */
export async function notifyMember(
  memberId: string,
  args: Omit<CreateNotificationArgs, "userId">,
): Promise<boolean> {
  try {
    const [user] = await db.select({ id: usersTable.id })
      .from(usersTable).where(and(
        eq(usersTable.memberId, memberId),
        eq(usersTable.status, "active"),
      )).limit(1);
    if (!user) return false;

    await createNotification({ ...args, userId: user.id });
    return true;
  } catch (err) {
    logger.error({ err, memberId, args }, "Failed to notify member");
    return false;
  }
}

/**
 * Broadcast a notification to every user in the system.
 * Useful for system-wide events (new event created, etc).
 */
export async function notifyAllUsers(
  args: Omit<CreateNotificationArgs, "userId">,
): Promise<void> {
  try {
    const users = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.status, "active"));
    await Promise.all(
      users.map(u => createNotification({ ...args, userId: u.id })),
    );
  } catch (err) {
    logger.error({ err, args }, "Failed to broadcast notification to all users");
  }
}

/**
 * Broadcast a notification to all users with a given role.
 * Useful for notifying all admins about a new submission.
 */
export async function notifyRole(
  role: "admin" | "leader" | "member",
  args: Omit<CreateNotificationArgs, "userId">,
): Promise<void> {
  try {
    const users = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.role, role), eq(usersTable.status, "active")));

    await Promise.all(
      users.map(u => createNotification({ ...args, userId: u.id })),
    );
  } catch (err) {
    logger.error({ err, role, args }, "Failed to broadcast notification");
  }
}
