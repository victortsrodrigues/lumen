import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Vínculo pai/mãe ↔ filho/filha entre membros (N:N).
 *
 * Regras (validadas no backend):
 * - parentId !== childId
 * - sem ciclo direto (se childId já é pai de parentId, rejeitar)
 */
export const memberChildrenTable = pgTable("member_children", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text("parent_id").notNull(),
  childId: text("child_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
}, (table) => [
  uniqueIndex("uq_member_children_parent_child").on(table.parentId, table.childId),
  index("idx_member_children_child").on(table.childId),
]);

export type MemberChild = typeof memberChildrenTable.$inferSelect;
