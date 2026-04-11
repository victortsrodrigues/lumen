import { pgTable, text, timestamp, pgEnum, date, integer } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const counselingStatusEnum = pgEnum("counseling_status", [
  "aberto", "em_andamento", "encerrado",
]);

// ─── COUNSELING CASES ────────────────────────────────────────────────────────

export const counselingCasesTable = pgTable("counseling_cases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  memberId: text("member_id").notNull(),
  memberName: text("member_name").notNull(),
  counselorId: text("counselor_id").notNull(),
  counselorName: text("counselor_name").notNull(),
  topic: text("topic").notNull(),
  status: counselingStatusEnum("status").notNull().default("aberto"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at"),
});

// ─── COUNSELING SESSIONS ─────────────────────────────────────────────────────

export const counselingSessionsTable = pgTable("counseling_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  caseId: text("case_id").notNull(),
  date: date("date").notNull(),
  notesEncrypted: text("notes_encrypted"),
  durationMinutes: integer("duration_minutes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
});
