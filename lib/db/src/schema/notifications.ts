import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Generic in-app notification system.
 * Any module can insert rows here via the `createNotification()` service helper
 * to notify a user about something actionable.
 */
export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // recipient
  type: text("type").notNull(), // e.g. "article.submitted", "article.approved", "article.rejected"
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"), // optional frontend URL to navigate when clicked (e.g. "/articles/123")
  entityType: text("entity_type"), // e.g. "article", "event", "ministry" — for grouping/filtering
  entityId: text("entity_id"),
  readAt: timestamp("read_at"), // null = unread
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
