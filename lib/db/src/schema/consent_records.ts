import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const consentRecordsTable = pgTable("consent_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  consentType: text("consent_type").notNull(),
  accepted: boolean("accepted").notNull(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertConsentRecordSchema = createInsertSchema(consentRecordsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertConsentRecord = z.infer<typeof insertConsentRecordSchema>;
export type ConsentRecord = typeof consentRecordsTable.$inferSelect;
