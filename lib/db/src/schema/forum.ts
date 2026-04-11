import { pgTable, text, timestamp, pgEnum, integer, boolean } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const forumCategoryEnum = pgEnum("forum_category", [
  "geral", "oracao", "estudo", "testemunho", "duvida",
]);

// ─── FORUM TOPICS ────────────────────────────────────────────────────────────

export const forumTopicsTable = pgTable("forum_topics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  body: text("body").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  category: forumCategoryEnum("category").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  isLocked: boolean("is_locked").notNull().default(false),
  replyCount: integer("reply_count").notNull().default(0),
  lastReplyAt: timestamp("last_reply_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// ─── FORUM REPLIES ───────────────────────────────────────────────────────────

export const forumRepliesTable = pgTable("forum_replies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  topicId: text("topic_id").notNull(),
  body: text("body").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});
