import { pgTable, text, timestamp, boolean, pgEnum, integer, index } from "drizzle-orm/pg-core";

export const eventRecurrenceEnum = pgEnum("event_recurrence", [
  "unico",
  "semanal",
  "quinzenal",
  "mensal",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "culto",
  "reuniao",
  "conferencia",
  "social",
  "outro",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "agendado",
  "em_andamento",
  "encerrado",
  "cancelado",
]);

// ─── EVENTS ──────────────────────────────────────────────────────────────────

export const eventsTable = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),

  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  location: text("location"),

  responsibleId: text("responsible_id"),
  responsibleName: text("responsible_name"),

  recurrence: eventRecurrenceEnum("recurrence").notNull().default("unico"),
  type: eventTypeEnum("type").notNull(),
  maxSlots: integer("max_slots"),
  status: eventStatusEnum("status").notNull().default("agendado"),

  // Soft delete
  deletedAt: timestamp("deleted_at"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_events_start_date").on(table.startDate),
  index("idx_events_type").on(table.type),
]);

// ─── EVENT REGISTRATIONS ─────────────────────────────────────────────────────

export const eventRegistrationsTable = pgTable("event_registrations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").notNull(),
  memberId: text("member_id").notNull(),
  memberName: text("member_name"),
  registeredAt: timestamp("registered_at").notNull().defaultNow(),
});

// ─── EVENT ATTENDANCE ────────────────────────────────────────────────────────

export const eventAttendanceTable = pgTable("event_attendance", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").notNull(),
  memberId: text("member_id").notNull(),
  present: boolean("present").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Event = typeof eventsTable.$inferSelect;
export type EventRegistration = typeof eventRegistrationsTable.$inferSelect;
export type EventAttendance = typeof eventAttendanceTable.$inferSelect;
