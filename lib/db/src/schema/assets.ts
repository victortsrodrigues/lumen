import { pgTable, text, timestamp, pgEnum, numeric, date, index } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const assetCategoryEnum = pgEnum("asset_category", [
  "instrumento",
  "som_iluminacao",
  "mobiliario",
  "informatica",
  "veiculo",
  "imovel",
  "outro",
]);

export const assetStatusEnum = pgEnum("asset_status", [
  "ativo",
  "manutencao",
  "baixa",
  "emprestado",
]);

// ─── ASSETS ──────────────────────────────────────────────────────────────────

export const assetsTable = pgTable("assets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  category: assetCategoryEnum("category").notNull().default("outro"),
  acquisitionDate: date("acquisition_date"),
  acquisitionValue: numeric("acquisition_value", { precision: 12, scale: 2 }),
  currentValue: numeric("current_value", { precision: 12, scale: 2 }),
  serialNumber: text("serial_number"),
  location: text("location").notNull(),
  responsibleId: text("responsible_id"),
  responsibleName: text("responsible_name"),
  status: assetStatusEnum("status").notNull().default("ativo"),
  notes: text("notes"),
  photoPath: text("photo_path"),

  // Soft delete
  deletedAt: timestamp("deleted_at"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_assets_responsible_id").on(table.responsibleId),
]);

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Asset = typeof assetsTable.$inferSelect;
