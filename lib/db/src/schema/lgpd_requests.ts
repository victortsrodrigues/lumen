import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const lgpdRequestTypeEnum = pgEnum("lgpd_request_type", [
  "correcao",
  "exclusao",
  "exportacao",
  "revogacao_consentimento",
]);

export const lgpdRequestStatusEnum = pgEnum("lgpd_request_status", [
  "pendente",
  "em_analise",
  "concluido",
  "rejeitado",
]);

export const lgpdRequestsTable = pgTable("lgpd_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  memberId: text("member_id").notNull(),
  memberName: text("member_name"),
  userId: text("user_id").notNull(),
  requestType: lgpdRequestTypeEnum("request_type").notNull(),
  status: lgpdRequestStatusEnum("status").notNull().default("pendente"),
  description: text("description"),
  adminNotes: text("admin_notes"),
  processedByUserId: text("processed_by_user_id"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type LgpdRequest = typeof lgpdRequestsTable.$inferSelect;
