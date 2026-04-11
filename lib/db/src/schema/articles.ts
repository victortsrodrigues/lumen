import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const articleStatusEnum = pgEnum("article_status", [
  "rascunho", "em_revisao", "aprovado", "publicado", "rejeitado",
]);

export const articleCategoryEnum = pgEnum("article_category", [
  "artigo", "devocional",
]);

// ─── ARTICLES ────────────────────────────────────────────────────────────────

export const articlesTable = pgTable("articles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  body: text("body").notNull(),
  excerpt: text("excerpt"),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  category: articleCategoryEnum("category").notNull(),
  status: articleStatusEnum("status").notNull().default("rascunho"),
  reviewerId: text("reviewer_id"),
  reviewNote: text("review_note"),
  publishedAt: timestamp("published_at"),
  coverImageUrl: text("cover_image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at"),
});
