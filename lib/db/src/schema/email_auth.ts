import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const authTokenPurposeEnum = pgEnum("auth_token_purpose", [
  "verify_email",
  "reset_password",
]);

export const authTokensTable = pgTable(
  "auth_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    purpose: authTokenPurposeEnum("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_auth_tokens_token_hash").on(table.tokenHash),
    index("idx_auth_tokens_user_purpose").on(table.userId, table.purpose),
    index("idx_auth_tokens_expires_at").on(table.expiresAt),
  ],
);

export const emailOutboxStatusEnum = pgEnum("email_outbox_status", [
  "pending",
  "processing",
  "sent",
  "failed",
  "cancelled",
]);

export const emailOutboxTable = pgTable(
  "email_outbox",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    authTokenId: text("auth_token_id")
      .notNull()
      .references(() => authTokensTable.id, { onDelete: "cascade" }),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    payloadEncrypted: text("payload_encrypted").notNull(),
    status: emailOutboxStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_email_outbox_pending").on(table.status, table.nextAttemptAt),
    index("idx_email_outbox_user").on(table.userId),
  ],
);

export type AuthToken = typeof authTokensTable.$inferSelect;
export type EmailOutboxItem = typeof emailOutboxTable.$inferSelect;
