import { pgTable, text, timestamp, boolean, pgEnum, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("user_role", ["admin", "leader", "member"]);

export const accountStatusEnum = pgEnum("account_status", [
  "pending",
  "active",
  "blocked",
  "revoked",
  "deleting",
]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("member"),
  // Keep active as the database default so existing accounts remain usable
  // when this column is introduced. Public registration always writes pending.
  status: accountStatusEnum("status").notNull().default("active"),
  memberId: text("member_id").unique(),
  statusReason: text("status_reason"),
  statusChangedAt: timestamp("status_changed_at"),
  statusChangedByUserId: text("status_changed_by_user_id"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  approvedByUserId: text("approved_by_user_id"),
  lastLoginAt: timestamp("last_login_at"),
  sessionVersion: integer("session_version").notNull().default(1),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"),
  mfaBackupCodes: text("mfa_backup_codes"),
  resetToken: text("reset_token"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_users_status").on(table.status),
  index("idx_users_role").on(table.role),
  index("idx_users_member_id").on(table.memberId),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
