import { pgTable, text, timestamp, boolean, pgEnum, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const financeEntryTypeEnum = pgEnum("finance_entry_type", [
  "dizimo",
  "oferta",
  "doacao",
]);

export const financePaymentMethodEnum = pgEnum("finance_payment_method", [
  "dinheiro",
  "pix",
  "transferencia",
  "cartao",
]);

export const financeOfferingTypeEnum = pgEnum("finance_offering_type", [
  "regular",
  "missionaria",
  "especial",
  "construcao",
]);

export const financeExpenseCategoryEnum = pgEnum("finance_expense_category", [
  "aluguel",
  "agua",
  "luz",
  "internet",
  "salarios",
  "manutencao",
  "eventos",
  "missoes",
  "benevolencia",
  "material",
  "outros",
]);

// Monthly closings — after closing, entries for that month become read-only
export const financeMonthlyClosingsTable = pgTable("finance_monthly_closings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  year: text("year").notNull(),
  month: text("month").notNull(), // "01".."12"
  closedAt: timestamp("closed_at").notNull().defaultNow(),
  closedByUserId: text("closed_by_user_id").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Income entries: tithes, offerings, donations
export const financeEntriesTable = pgTable("finance_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: financeEntryTypeEnum("type").notNull(),
  date: date("date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),

  paymentMethod: financePaymentMethodEnum("payment_method").notNull(),

  // Tithe: linked member (nullable = anonymous)
  memberId: text("member_id"),
  memberName: text("member_name"), // snapshot at time of entry

  // Offering type (when type = oferta)
  offeringType: financeOfferingTypeEnum("offering_type"),

  // Donation: donor can be external (no member ID)
  donorName: text("donor_name"), // for external donors
  donationPurpose: text("donation_purpose"),

  isAnonymous: boolean("is_anonymous").notNull().default(false),

  notes: text("notes"),

  // Soft delete
  deletedAt: timestamp("deleted_at"),
  deletedByUserId: text("deleted_by_user_id"),

  // Monthly closing reference
  monthClosingId: text("month_closing_id"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Expense entries
export const financeExpensesTable = pgTable("finance_expenses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: date("date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  category: financeExpenseCategoryEnum("category").notNull(),
  description: text("description").notNull(),
  supplier: text("supplier"),

  // Receipt: object storage path (PDF or image)
  receiptPath: text("receipt_path"),

  notes: text("notes"),

  // Soft delete
  deletedAt: timestamp("deleted_at"),
  deletedByUserId: text("deleted_by_user_id"),

  // Monthly closing reference
  monthClosingId: text("month_closing_id"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type FinanceEntry = typeof financeEntriesTable.$inferSelect;
export type FinanceExpense = typeof financeExpensesTable.$inferSelect;
export type FinanceMonthlyClosing = typeof financeMonthlyClosingsTable.$inferSelect;
