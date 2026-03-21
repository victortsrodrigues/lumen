import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memberHistoryTable = pgTable("member_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  memberId: text("member_id").notNull(),
  changedByUserId: text("changed_by_user_id").notNull(),
  changeType: text("change_type").notNull(), // 'created' | 'updated' | 'deleted'
  fieldChanges: jsonb("field_changes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMemberHistorySchema = createInsertSchema(memberHistoryTable).omit({
  id: true,
  createdAt: true,
});

export type InsertMemberHistory = z.infer<typeof insertMemberHistorySchema>;
export type MemberHistory = typeof memberHistoryTable.$inferSelect;
