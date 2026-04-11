import { pgTable, text, timestamp, pgEnum, integer, date } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const liturgyTypeEnum = pgEnum("liturgy_type", [
  "culto_dominical", "culto_especial", "santa_ceia", "culto_oracao",
]);

export const liturgyStatusEnum = pgEnum("liturgy_status", [
  "rascunho", "aprovada",
]);

export const liturgyItemTypeEnum = pgEnum("liturgy_item_type", [
  "louvor", "oracao", "leitura", "pregacao", "ofertorio", "avisos", "santa_ceia", "outro",
]);

// ─── LITURGIES ───────────────────────────────────────────────────────────────

export const liturgiesTable = pgTable("liturgies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  date: date("date").notNull(),
  type: liturgyTypeEnum("type").notNull(),
  eventId: text("event_id"),
  status: liturgyStatusEnum("status").notNull().default("rascunho"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at"),
});

// ─── LITURGY ITEMS ───────────────────────────────────────────────────────────

export const liturgyItemsTable = pgTable("liturgy_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  liturgyId: text("liturgy_id").notNull(),
  order: integer("order").notNull(),
  type: liturgyItemTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  responsibleMemberId: text("responsible_member_id"),
  responsibleName: text("responsible_name"),
  durationMinutes: integer("duration_minutes"),
  songId: text("song_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
