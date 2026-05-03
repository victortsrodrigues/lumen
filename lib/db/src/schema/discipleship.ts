import { pgTable, text, timestamp, pgEnum, index, unique } from "drizzle-orm/pg-core";

// ─── ENUMS ──────────────────────────────────────────────────────────────────

export const memberAreaEnum = pgEnum("member_area", [
  "culto",
  "pequeno_grupo",
  "ministerio",
  "ebd",
]);

export const memberAreaHealthEnum = pgEnum("member_area_health", [
  "verde",
  "amarelo",
  "vermelho",
]);

// ─── MEMBER AREAS ───────────────────────────────────────────────────────────

export const memberAreasTable = pgTable("member_areas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  memberId: text("member_id").notNull(),
  area: memberAreaEnum("area").notNull(),
  healthStatus: memberAreaHealthEnum("health_status").notNull().default("verde"),
  leaderMemberId: text("leader_member_id"),
  leaderMemberName: text("leader_member_name"),
  notes: text("notes"),
  lastUpdatedByUserId: text("last_updated_by_user_id").notNull(),
  lastUpdatedAt: timestamp("last_updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("uq_member_areas_member_area").on(table.memberId, table.area),
  index("idx_member_areas_member").on(table.memberId),
  index("idx_member_areas_area_health").on(table.area, table.healthStatus),
  index("idx_member_areas_leader").on(table.leaderMemberId),
]);

// ─── MEMBER AREA HISTORY ────────────────────────────────────────────────────

export const memberAreaHistoryTable = pgTable("member_area_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  memberId: text("member_id").notNull(),
  area: memberAreaEnum("area").notNull(),
  fromHealth: memberAreaHealthEnum("from_health"),
  toHealth: memberAreaHealthEnum("to_health").notNull(),
  changedByUserId: text("changed_by_user_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_member_area_history_member_created").on(table.memberId, table.createdAt),
]);

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type MemberArea = typeof memberAreasTable.$inferSelect;
export type InsertMemberArea = typeof memberAreasTable.$inferInsert;
export type MemberAreaHistory = typeof memberAreaHistoryTable.$inferSelect;
