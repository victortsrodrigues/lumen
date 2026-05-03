import { pgTable, text, timestamp, pgEnum, integer, date, unique, index } from "drizzle-orm/pg-core";
import { mediaLinksTable } from "./media";

// ─── ENUMS ──────────────────────────────────────────────────────────────────

export const councilMeetingStatusEnum = pgEnum("council_meeting_status", [
  "agendada",
  "realizada",
  "cancelada",
]);

export const councilMeetingItemStatusEnum = pgEnum("council_meeting_item_status", [
  "pendente",
  "discutida",
  "decidida",
]);

// ─── COUNCIL MEETINGS ───────────────────────────────────────────────────────

export const councilMeetingsTable = pgTable("council_meetings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  meetingDate: date("meeting_date").notNull(),
  title: text("title").notNull(),
  agenda: text("agenda"),
  summary: text("summary"),

  // FK pra media_links — sem ON DELETE clause; soft-delete tratado em app layer via LEFT JOIN
  ataMediaId: text("ata_media_id").references(() => mediaLinksTable.id),

  status: councilMeetingStatusEnum("status").notNull().default("agendada"),
  notes: text("notes"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_council_meetings_date").on(table.meetingDate),
  index("idx_council_meetings_status").on(table.status),
]);

// ─── COUNCIL MEETING ITEMS ──────────────────────────────────────────────────

export const councilMeetingItemsTable = pgTable("council_meeting_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => councilMeetingsTable.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: councilMeetingItemStatusEnum("status").notNull().default("pendente"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("uq_council_meeting_items_order").on(table.meetingId, table.order),
  index("idx_council_meeting_items_meeting").on(table.meetingId),
]);

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type CouncilMeeting = typeof councilMeetingsTable.$inferSelect;
export type InsertCouncilMeeting = typeof councilMeetingsTable.$inferInsert;
export type CouncilMeetingItem = typeof councilMeetingItemsTable.$inferSelect;
export type InsertCouncilMeetingItem = typeof councilMeetingItemsTable.$inferInsert;
