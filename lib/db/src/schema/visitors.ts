import { pgTable, text, timestamp, pgEnum, date, index } from "drizzle-orm/pg-core";

// ─── ENUMS ──────────────────────────────────────────────────────────────────

export const visitorStatusEnum = pgEnum("visitor_status", [
  "recente",
  "acompanhando",
  "sem_retorno",
  "nao_interessado",
]);

// ─── VISITORS TABLE ─────────────────────────────────────────────────────────

export const visitorsTable = pgTable("visitors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fullName: text("full_name").notNull(),

  // Encrypted fields (AES-256-GCM)
  phoneEncrypted: text("phone_encrypted"),
  email: text("email"),
  dateOfBirth: date("date_of_birth"),

  // Address — não criptografado para estatística (city/state apenas)
  addressCity: text("address_city"),
  addressState: text("address_state"),

  howFoundUs: text("how_found_us"),

  // Denormalização — recalculadas automaticamente a partir de visitor_visits
  firstVisitDate: date("first_visit_date"),
  firstVisitEventId: text("first_visit_event_id"),

  status: visitorStatusEnum("status").notNull().default("recente"),

  assignedToMemberId: text("assigned_to_member_id"),
  assignedToMemberName: text("assigned_to_member_name"),

  notes: text("notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_visitors_status").on(table.status),
  index("idx_visitors_assigned_to").on(table.assignedToMemberId),
]);

// ─── VISITOR_VISITS TABLE ───────────────────────────────────────────────────

export const visitorVisitsTable = pgTable("visitor_visits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  visitorId: text("visitor_id").notNull(),
  visitDate: date("visit_date").notNull(),
  eventId: text("event_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
}, (table) => [
  index("idx_visitor_visits_visitor_date").on(table.visitorId, table.visitDate),
]);

export type Visitor = typeof visitorsTable.$inferSelect;
export type VisitorVisit = typeof visitorVisitsTable.$inferSelect;
