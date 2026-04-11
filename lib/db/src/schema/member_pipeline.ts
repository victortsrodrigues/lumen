import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

// ─── MEMBER PIPELINE HISTORY ─────────────────────────────────────────────────

export const memberPipelineHistoryTable = pgTable("member_pipeline_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  memberId: text("member_id").notNull(),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  changedByUserId: text("changed_by_user_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_pipeline_history_member_id").on(table.memberId),
]);

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type MemberPipelineHistory = typeof memberPipelineHistoryTable.$inferSelect;
