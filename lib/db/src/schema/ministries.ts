import { pgTable, text, timestamp, pgEnum, index, uniqueIndex, numeric, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const ministryStatusEnum = pgEnum("ministry_status", [
  "ativo",
  "inativo",
]);

export const ministryMemberRoleEnum = pgEnum("ministry_member_role", [
  "lider",
  "membro",
]);

// ─── MINISTRIES ──────────────────────────────────────────────────────────────

export const ministriesTable = pgTable("ministries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  status: ministryStatusEnum("status").notNull().default("ativo"),

  // Soft delete
  deletedAt: timestamp("deleted_at"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── MINISTRY MEMBERS ────────────────────────────────────────────────────────

export const ministryMembersTable = pgTable("ministry_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ministryId: text("ministry_id").notNull(),
  memberId: text("member_id").notNull(),
  memberName: text("member_name"),
  role: ministryMemberRoleEnum("role").notNull().default("membro"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_ministry_members_member_id").on(table.memberId),
  uniqueIndex("idx_ministry_members_active")
    .on(table.ministryId, table.memberId)
    .where(sql`${table.leftAt} IS NULL`),
]);

// ─── TYPES ───────────────────────────────────────────────────────────────────

// ─── MINISTRY GOALS ──────────────────────────────────────────────────────────

export const ministryGoalStatusEnum = pgEnum("ministry_goal_status", [
  "em_andamento",
  "concluida",
  "cancelada",
]);

export const ministryGoalsTable = pgTable("ministry_goals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ministryId: text("ministry_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  targetValue: numeric("target_value", { precision: 12, scale: 2 }).notNull(),
  currentValue: numeric("current_value", { precision: 12, scale: 2 }).notNull().default("0"),
  unit: text("unit"),
  deadline: date("deadline"),
  initiativeId: text("initiative_id"),
  status: ministryGoalStatusEnum("status").notNull().default("em_andamento"),
  deletedAt: timestamp("deleted_at"),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Ministry = typeof ministriesTable.$inferSelect;
export type MinistryMember = typeof ministryMembersTable.$inferSelect;
export type MinistryGoal = typeof ministryGoalsTable.$inferSelect;
