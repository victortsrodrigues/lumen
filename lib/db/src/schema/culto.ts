import { pgTable, text, timestamp, boolean, integer, unique, index } from "drizzle-orm/pg-core";
import { eventsTable } from "./events";
import { songsTable } from "./songs";

// ─── CULTOS ─────────────────────────────────────────────────────────────────
// 1:1 com events. Criado quando events.type = 'culto'.

export const cultosTable = pgTable("cultos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id")
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),

  // Estrutura da liturgia
  openingText: text("opening_text"),
  sermonTitle: text("sermon_title"),
  sermonReference: text("sermon_reference"),
  sermonNotes: text("sermon_notes"),

  // Elementos especiais (flags ortogonais)
  hasCommunion: boolean("has_communion").notNull().default(false),
  hasBaptism: boolean("has_baptism").notNull().default(false),
  hasMemberReception: boolean("has_member_reception").notNull().default(false),

  notes: text("notes"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("uq_cultos_event").on(table.eventId),
  index("idx_cultos_communion").on(table.hasCommunion),
  index("idx_cultos_baptism").on(table.hasBaptism),
]);

// ─── CULTO SONGS ────────────────────────────────────────────────────────────

export const cultoSongsTable = pgTable("culto_songs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  cultoId: text("culto_id")
    .notNull()
    .references(() => cultosTable.id, { onDelete: "cascade" }),
  songId: text("song_id")
    .notNull()
    .references(() => songsTable.id),
  songTitle: text("song_title").notNull(),
  order: integer("order").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("uq_culto_songs_order").on(table.cultoId, table.order),
  index("idx_culto_songs_culto").on(table.cultoId),
]);

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Culto = typeof cultosTable.$inferSelect;
export type InsertCulto = typeof cultosTable.$inferInsert;
export type CultoSong = typeof cultoSongsTable.$inferSelect;
export type InsertCultoSong = typeof cultoSongsTable.$inferInsert;
