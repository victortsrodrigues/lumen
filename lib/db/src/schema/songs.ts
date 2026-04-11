import { pgTable, text, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const songCategoryEnum = pgEnum("song_category", [
  "louvor", "adoracao", "hino", "especial",
]);

export const songSuggestionStatusEnum = pgEnum("song_suggestion_status", [
  "pendente", "aprovada", "rejeitada",
]);

// ─── SONGS ───────────────────────────────────────────────────────────────────

export const songsTable = pgTable("songs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  author: text("author"),
  songKey: text("song_key"),
  tempo: integer("tempo"),
  lyrics: text("lyrics"),
  chordChart: text("chord_chart"),
  category: songCategoryEnum("category"),
  youtubeUrl: text("youtube_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at"),
});

// ─── SONG SUGGESTIONS ────────────────────────────────────────────────────────

export const songSuggestionsTable = pgTable("song_suggestions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  songId: text("song_id"),
  title: text("title").notNull(),
  url: text("url").notNull().default(""),
  suggestedByMemberId: text("suggested_by_member_id"),
  suggestedByUserId: text("suggested_by_user_id"),
  suggestedByName: text("suggested_by_name").notNull(),
  reason: text("reason"),
  status: songSuggestionStatusEnum("status").notNull().default("pendente"),
  reviewedByUserId: text("reviewed_by_user_id"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
