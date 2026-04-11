import { pgTable, text, timestamp, pgEnum, numeric, boolean } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const pixDonationStatusEnum = pgEnum("pix_donation_status", [
  "pendente", "confirmado", "expirado", "cancelado",
]);

// ─── PIX CONFIG ──────────────────────────────────────────────────────────────

export const pixConfigTable = pgTable("pix_config", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pixKey: text("pix_key").notNull(),
  pixKeyType: text("pix_key_type").notNull(),
  recipientName: text("recipient_name").notNull(),
  city: text("city").notNull(),
  institution: text("institution"),
  qrCodeImageUrl: text("qr_code_image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
});

// ─── PIX DONATIONS ───────────────────────────────────────────────────────────

export const pixDonationsTable = pgTable("pix_donations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  donorName: text("donor_name"),
  donorEmail: text("donor_email"),
  memberId: text("member_id"),
  pixConfigId: text("pix_config_id").notNull(),
  txId: text("tx_id").notNull().unique(),
  status: pixDonationStatusEnum("status").notNull().default("pendente"),
  confirmedByUserId: text("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
