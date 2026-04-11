import { pgTable, text, timestamp, pgEnum, date } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const pastoralVisitTypeEnum = pgEnum("pastoral_visit_type", [
  "visita", "ligacao", "reuniao", "oracao",
]);

export const pastoralVisitStatusEnum = pgEnum("pastoral_visit_status", [
  "pendente", "realizado", "cancelado",
]);

// ─── PASTORAL VISITS ─────────────────────────────────────────────────────────

export const pastoralVisitsTable = pgTable("pastoral_visits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  memberId: text("member_id").notNull(),
  memberName: text("member_name").notNull(),
  pastorId: text("pastor_id").notNull(),
  pastorName: text("pastor_name").notNull(),
  type: pastoralVisitTypeEnum("type").notNull(),
  date: date("date").notNull(),
  notes: text("notes"),
  status: pastoralVisitStatusEnum("status").notNull().default("pendente"),
  followUpDate: date("follow_up_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at"),
});
