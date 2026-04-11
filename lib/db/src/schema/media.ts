import { pgTable, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const mediaTypeEnum = pgEnum("media_type", [
  "youtube",
  "vimeo",
  "drive",
  "link",
  "outro",
]);

export const mediaEntityTypeEnum = pgEnum("media_entity_type", [
  "course_lesson",
  "course",
  "ministry",
  "event",
  "asset",
  "content",
]);

// ─── MEDIA LINKS ─────────────────────────────────────────────────────────────

export const mediaLinksTable = pgTable("media_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  url: text("url").notNull(),
  title: text("title"),
  type: mediaTypeEnum("type").notNull().default("outro"),
  entityType: mediaEntityTypeEnum("entity_type").notNull(),
  entityId: text("entity_id").notNull(),

  // Soft delete
  deletedAt: timestamp("deleted_at"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_media_links_entity").on(table.entityType, table.entityId),
]);

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type MediaLink = typeof mediaLinksTable.$inferSelect;
