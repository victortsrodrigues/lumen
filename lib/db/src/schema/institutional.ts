import { pgTable, text, timestamp, pgEnum, integer, boolean } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const pageSectionEnum = pgEnum("page_section", [
  "sobre", "valores", "horarios", "contato", "pastoral", "historia",
]);

// ─── INSTITUTIONAL PAGES ─────────────────────────────────────────────────────

export const institutionalPagesTable = pgTable("institutional_pages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  body: text("body").notNull(),
  section: pageSectionEnum("section").notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  coverImageUrl: text("cover_image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at"),
});
