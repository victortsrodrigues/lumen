import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const contentCategoryEnum = pgEnum("content_category", [
  "pequenos_grupos",
  "devocionais",
  "escola_biblica",
  "esboco_sermao",
  "estudo_biblico",
]);

export const contentsTable = pgTable("contents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  category: contentCategoryEnum("category").notNull(),
  authorName: text("author_name"),

  deletedAt: timestamp("deleted_at"),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Content = typeof contentsTable.$inferSelect;
