import { pgTable, text, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const scheduleStatusEnum = pgEnum("schedule_status", [
  "escalado",
  "confirmado",
  "ausente",
  "substituido",
]);

// ─── SERVICE ROLES ───────────────────────────────────────────────────────────

export const serviceRolesTable = pgTable("service_roles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  ministryId: text("ministry_id"),

  // Soft delete
  deletedAt: timestamp("deleted_at"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── EVENT SCHEDULES ─────────────────────────────────────────────────────────

export const eventSchedulesTable = pgTable("event_schedules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").notNull(),
  serviceRoleId: text("service_role_id").notNull(),
  memberId: text("member_id").notNull(),
  memberName: text("member_name"),
  status: scheduleStatusEnum("status").notNull().default("escalado"),
  notes: text("notes"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_event_schedules_unique")
    .on(table.eventId, table.serviceRoleId, table.memberId),
  index("idx_event_schedules_member_id").on(table.memberId),
]);

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ServiceRole = typeof serviceRolesTable.$inferSelect;
export type EventSchedule = typeof eventSchedulesTable.$inferSelect;
