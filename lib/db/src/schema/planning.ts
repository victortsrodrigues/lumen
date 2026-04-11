import { pgTable, text, timestamp, pgEnum, numeric, date, boolean, integer, index } from "drizzle-orm/pg-core";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const directiveStatusEnum = pgEnum("directive_status", [
  "ativa",
  "concluida",
  "cancelada",
]);

export const objectiveStatusEnum = pgEnum("objective_status", [
  "em_andamento",
  "concluido",
  "cancelado",
]);

export const planningInitiativeTypeEnum = pgEnum("planning_initiative_type", [
  "aquisicao",
  "reforma",
  "campanha",
  "evento_especial",
  "capacitacao",
  "missoes",
  "administrativo",
  "outro",
]);

export const planningInitiativeStatusEnum = pgEnum("planning_initiative_status", [
  "planejada",
  "aprovada",
  "em_andamento",
  "concluida",
  "cancelada",
]);

export const planningPriorityEnum = pgEnum("planning_priority", [
  "alta",
  "media",
  "baixa",
]);

// ─── STRATEGIC DIRECTIVES ────────────────────────────────────────────────────

export const strategicDirectivesTable = pgTable("strategic_directives", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  startYear: text("start_year").notNull(),
  endYear: text("end_year").notNull(),
  status: directiveStatusEnum("status").notNull().default("ativa"),
  deletedAt: timestamp("deleted_at"),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── STRATEGIC OBJECTIVES ────────────────────────────────────────────────────

export const strategicObjectivesTable = pgTable("strategic_objectives", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  directiveId: text("directive_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  targetValue: numeric("target_value"),
  currentValue: numeric("current_value").default("0"),
  unit: text("unit"),
  deadline: date("deadline"),
  status: objectiveStatusEnum("status").notNull().default("em_andamento"),
  deletedAt: timestamp("deleted_at"),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_objectives_directive_id").on(table.directiveId),
]);

// ─── PLANNING INITIATIVES ────────────────────────────────────────────────────

export const planningInitiativesTable = pgTable("planning_initiatives", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  objectiveId: text("objective_id"),
  ministryId: text("ministry_id"),
  title: text("title").notNull(),
  description: text("description"),
  type: planningInitiativeTypeEnum("type").notNull(),
  priority: planningPriorityEnum("priority").notNull().default("media"),
  status: planningInitiativeStatusEnum("status").notNull().default("planejada"),
  responsibleId: text("responsible_id"),
  responsibleName: text("responsible_name"),
  plannedBudget: numeric("planned_budget", { precision: 12, scale: 2 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at"),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_initiatives_objective_id").on(table.objectiveId),
  index("idx_initiatives_responsible_id").on(table.responsibleId),
]);

// ─── INITIATIVE STEPS ────────────────────────────────────────────────────────

export const initiativeStepsTable = pgTable("initiative_steps", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  initiativeId: text("initiative_id").notNull(),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  sortOrder: integer("sort_order").notNull(),
  deletedAt: timestamp("deleted_at"),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type StrategicDirective = typeof strategicDirectivesTable.$inferSelect;
export type StrategicObjective = typeof strategicObjectivesTable.$inferSelect;
export type PlanningInitiative = typeof planningInitiativesTable.$inferSelect;
export type InitiativeStep = typeof initiativeStepsTable.$inferSelect;
