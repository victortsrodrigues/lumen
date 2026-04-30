import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Agrupamentos reutilizáveis ("etiquetas") para membros.
 * Ex.: "Família Silva", "Casa de oração de Belo Horizonte", "Líderes de PG".
 */
export const memberGroupsTable = pgTable("member_groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const memberGroupMembersTable = pgTable("member_group_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  memberId: text("member_id").notNull(),
  groupId: text("group_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
}, (table) => [
  uniqueIndex("uq_member_group_members").on(table.memberId, table.groupId),
]);

export type MemberGroup = typeof memberGroupsTable.$inferSelect;
export type MemberGroupMember = typeof memberGroupMembersTable.$inferSelect;
